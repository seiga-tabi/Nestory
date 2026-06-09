const express = require('express');
const bcrypt = require('bcrypt');
const { z } = require('zod');
const { prisma } = require('../db/prisma');
const { requireStreamer } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { asyncHandler } = require('../utils/asyncHandler');
const { sendError } = require('../utils/httpError');
const { sanitizeText } = require('../utils/sanitize');
const { ensureRawProfileForUser, privateProfile } = require('../services/streamer.service');

const router = express.Router();

router.use(requireStreamer);

router.get('/', asyncHandler(async (req, res) => {
  const profile = await ensureRawProfileForUser(req.user);
  res.json({
    user: {
      displayName: req.user.displayName,
      email: req.user.email,
      role: req.user.role,
      twitchLogin: req.user.twitchLogin
    },
    profile: privateProfile(profile)
  });
}));

const profileSchema = z.object({
  body: z.object({
    displayName: z.string().max(80).optional(),
    email: z.string().email().optional(),
    language: z.string().max(40).optional(),
    notificationOpt: z.boolean().optional()
  }),
  query: z.object({}).passthrough(),
  params: z.object({})
});

router.put('/profile', validate(profileSchema), asyncHandler(async (req, res) => {
  const profile = await ensureRawProfileForUser(req.user);
  const data = {};
  if (req.validated.body.displayName) data.displayName = sanitizeText(req.validated.body.displayName, 80);
  if (req.validated.body.email) data.email = req.validated.body.email.toLowerCase();

  if (Object.keys(data).length) {
    await prisma.user.update({ where: { id: req.user.id }, data });
  }

  if (profile && (req.validated.body.language || req.validated.body.notificationOpt !== undefined)) {
    await prisma.streamerProfile.update({
      where: { id: profile.id },
      data: {
        language: req.validated.body.language ? sanitizeText(req.validated.body.language, 40) : profile.language,
        notificationOpt: req.validated.body.notificationOpt ?? profile.notificationOpt
      }
    });
  }

  res.json({ ok: true });
}));

const passwordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8)
  }),
  query: z.object({}).passthrough(),
  params: z.object({})
});

router.put('/password', validate(passwordSchema), asyncHandler(async (req, res) => {
  if (req.user.passwordSetupRequired || !req.user.passwordHash) {
    return sendError(res, 403, '비밀번호 설정이 필요합니다.', 'PASSWORD_SETUP_REQUIRED');
  }

  const ok = await bcrypt.compare(req.validated.body.currentPassword, req.user.passwordHash);
  if (!ok) return sendError(res, 400, '현재 비밀번호를 확인해주세요.', 'INVALID_CURRENT_PASSWORD');
  await prisma.user.update({
    where: { id: req.user.id },
    data: { passwordHash: await bcrypt.hash(req.validated.body.newPassword, 12) }
  });
  res.json({ ok: true });
}));

const privacySchema = z.object({
  body: z.object({ isPublic: z.boolean() }),
  query: z.object({}).passthrough(),
  params: z.object({})
});

router.put('/privacy', validate(privacySchema), asyncHandler(async (req, res) => {
  const profile = await ensureRawProfileForUser(req.user);
  await prisma.streamerProfile.update({
    where: { id: profile.id },
    data: { isPublic: req.validated.body.isPublic }
  });
  res.json({ ok: true });
}));

module.exports = { settingsRoutes: router };
