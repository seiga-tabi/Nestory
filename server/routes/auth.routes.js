const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { authLimiter } = require('../middleware/rateLimit');
const { asyncHandler } = require('../utils/asyncHandler');
const { createHttpError, sendError } = require('../utils/httpError');
const {
  setSessionPersistence,
  saveSession,
  destroySession,
  clearSessionCookie
} = require('../config/session');
const authService = require('../services/auth.service');

const router = express.Router();

const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1),
    rememberMe: z.boolean().optional()
  }),
  query: z.object({}).passthrough(),
  params: z.object({})
});

const registerSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8),
    confirmPassword: z.string().min(8),
    displayName: z.string().max(80).optional()
  }),
  query: z.object({}).passthrough(),
  params: z.object({})
});

const forgotSchema = z.object({
  body: z.object({ email: z.string().email() }),
  query: z.object({}).passthrough(),
  params: z.object({})
});

const resetSchema = z.object({
  body: z.object({
    token: z.string().min(20),
    password: z.string().min(8)
  }),
  query: z.object({}).passthrough(),
  params: z.object({})
});

const passwordSetupTokenSchema = z.object({
  body: z.object({}).passthrough().optional().default({}),
  query: z.object({}).passthrough(),
  params: z.object({
    token: z.string().min(20)
  })
});

const passwordSetupSchema = z.object({
  body: z.object({
    token: z.string().min(20),
    password: z.string().min(8),
    confirmPassword: z.string().min(8)
  }),
  query: z.object({}).passthrough(),
  params: z.object({})
});

const loginHandler = asyncHandler(async (req, res) => {
  const result = await authService.login(req.validated.body);
  if (!result) {
    return sendError(res, 401, '이메일 또는 비밀번호를 확인해주세요.', 'INVALID_CREDENTIALS');
  }

  if (result.requiresPasswordSetup) {
    return sendError(res, 403, '비밀번호 설정이 필요합니다.', 'PASSWORD_SETUP_REQUIRED', {
      passwordSetupRequired: true,
      email: result.user.email
    });
  }

  req.session.userId = result.user.id;
  req.session.role = result.user.role;
  setSessionPersistence(req, Boolean(req.validated.body.rememberMe));
  await saveSession(req);
  res.json(result.response);
});

router.post('/login', authLimiter, validate(loginSchema), loginHandler);
router.post('/', authLimiter, validate(loginSchema), loginHandler);

router.post('/register', authLimiter, validate(registerSchema), asyncHandler(async (req, res) => {
  const result = await authService.register(req.validated.body);
  req.session.userId = result.user.id;
  req.session.role = result.user.role;
  setSessionPersistence(req, false);
  await saveSession(req);
  res.status(201).json(result.response);
}));

router.post('/logout', asyncHandler(async (req, res) => {
  try {
    await destroySession(req);
  } catch (error) {
    throw createHttpError(
      500,
      '로그아웃 처리 중 오류가 발생했습니다.',
      'LOGOUT_FAILED'
    );
  }

  req.user = null;
  clearSessionCookie(res);
  res.json({ ok: true, message: 'Logged out' });
}));

router.get('/me', (req, res) => {
  const homePage = authService.defaultPageForRole(req.user?.role);
  res.json({
    authenticated: Boolean(req.user),
    user: authService.publicUser(req.user),
    role: authService.publicRole(req.user?.role) || null,
    isAdmin: req.user?.role === 'ADMIN',
    defaultPage: req.user ? homePage : null,
    homePage: req.user ? homePage : null,
    streamerProfile: authService.publicProfile(req.user?.streamerProfile)
  });
});

router.post('/forgot-password', authLimiter, validate(forgotSchema), asyncHandler(async (req, res) => {
  await authService.forgotPassword(req.validated.body.email);
  res.json({ message: '계정이 존재하면 비밀번호 재설정 안내를 발송했습니다.' });
}));

router.get('/password-setup/:token', authLimiter, validate(passwordSetupTokenSchema), asyncHandler(async (req, res) => {
  const setup = await authService.getPasswordSetupStatus(req.validated.params.token);
  if (!setup) {
    return sendError(res, 400, '비밀번호 설정 링크가 유효하지 않거나 만료되었습니다.', 'INVALID_PASSWORD_SETUP_TOKEN');
  }
  res.json(setup);
}));

router.post('/password-setup', authLimiter, validate(passwordSetupSchema), asyncHandler(async (req, res) => {
  await authService.completePasswordSetup(req.validated.body);
  res.json({ ok: true, message: '비밀번호가 설정되었습니다.' });
}));

router.post('/reset-password', authLimiter, validate(resetSchema), asyncHandler(async (req, res) => {
  const ok = await authService.resetPassword(req.validated.body);
  if (!ok) return sendError(res, 400, '재설정 링크가 유효하지 않거나 만료되었습니다.', 'INVALID_RESET_TOKEN');
  res.json({ message: '비밀번호가 변경되었습니다.' });
}));

module.exports = { authRoutes: router };
