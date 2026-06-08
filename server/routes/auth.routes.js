const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { authLimiter } = require('../middleware/rateLimit');
const { asyncHandler } = require('../utils/asyncHandler');
const { sendError } = require('../utils/httpError');
const { setSessionPersistence, saveSession } = require('../config/session');
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

const loginHandler = asyncHandler(async (req, res) => {
  const result = await authService.login(req.validated.body);
  if (!result) {
    return sendError(res, 401, '이메일 또는 비밀번호를 확인해주세요.', 'INVALID_CREDENTIALS');
  }

  req.session.userId = result.user.id;
  req.session.role = result.user.role;
  setSessionPersistence(req, Boolean(req.validated.body.rememberMe));
  await saveSession(req);
  res.json(result.response);
});

router.post('/login', authLimiter, validate(loginSchema), loginHandler);
router.post('/', authLimiter, validate(loginSchema), loginHandler);

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('seiga.sid');
    res.json({ ok: true });
  });
});

router.get('/me', (req, res) => {
  res.json({
    authenticated: Boolean(req.user),
    user: authService.publicUser(req.user),
    role: req.user?.role || null,
    streamerProfile: authService.publicProfile(req.user?.streamerProfile)
  });
});

router.post('/forgot-password', authLimiter, validate(forgotSchema), asyncHandler(async (req, res) => {
  await authService.forgotPassword(req.validated.body.email);
  res.json({ message: '계정이 존재하면 비밀번호 재설정 안내를 발송했습니다.' });
}));

router.post('/reset-password', authLimiter, validate(resetSchema), asyncHandler(async (req, res) => {
  const ok = await authService.resetPassword(req.validated.body);
  if (!ok) return sendError(res, 400, '재설정 링크가 유효하지 않거나 만료되었습니다.', 'INVALID_RESET_TOKEN');
  res.json({ message: '비밀번호가 변경되었습니다.' });
}));

module.exports = { authRoutes: router };
