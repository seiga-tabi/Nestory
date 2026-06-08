const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { prisma } = require('../db/prisma');
const { requireAdmin } = require('../middleware/admin');
const { asyncHandler } = require('../utils/asyncHandler');
const { sendError } = require('../utils/httpError');
const { slugify } = require('../utils/slug');
const { sanitizeText } = require('../utils/sanitize');
const { sendMail } = require('../services/mail.service');
const { env } = require('../config/env');
const { uniqueProfileSlug } = require('../services/streamer.service');

const router = express.Router();

router.use(requireAdmin);

router.get('/access-requests', asyncHandler(async (_req, res) => {
  const items = await prisma.accessRequest.findMany({ orderBy: { createdAt: 'desc' } });
  res.json({ items });
}));

router.post('/access-requests/:id/approve', asyncHandler(async (req, res) => {
  const request = await prisma.accessRequest.findUnique({ where: { id: req.params.id } });
  if (!request) return sendError(res, 404, '승인 요청을 찾을 수 없습니다.', 'ACCESS_REQUEST_NOT_FOUND');

  const tempPassword = crypto.randomBytes(9).toString('base64url');
  const passwordHash = await bcrypt.hash(tempPassword, 12);
  const baseSlug = slugify(request.name);
  const profileSlug = await uniqueProfileSlug(baseSlug);

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { email: request.email.toLowerCase() },
      update: { role: 'STREAMER', status: 'ACTIVE', displayName: sanitizeText(request.name, 80) },
      create: {
        email: request.email.toLowerCase(),
        passwordHash,
        displayName: sanitizeText(request.name, 80),
        role: 'STREAMER',
        status: 'ACTIVE'
      }
    });

    const existing = await tx.streamerProfile.findUnique({ where: { userId: user.id } });
    if (!existing) {
      await tx.streamerProfile.create({
        data: {
          userId: user.id,
          slug: profileSlug,
          name: sanitizeText(request.name, 80),
          handle: `@${baseSlug.replace(/-/g, '_')}`,
          subtitle: 'Seiga Studio 승인 스트리머',
          mainContent: '잡담',
          language: 'KR/JA',
          isPublic: true,
          socialLinks: request.twitchUrl ? {
            create: {
              type: 'TWITCH',
              label: 'Twitch',
              url: request.twitchUrl,
              sortOrder: 0
            }
          } : undefined
        }
      });
    }

    const accessRequest = await tx.accessRequest.update({
      where: { id: request.id },
      data: { status: 'APPROVED', reviewedAt: new Date() }
    });

    return { user, accessRequest };
  });

  await sendMail({
    to: result.user.email,
    subject: '[Seiga Studio] 스트리머 계정 승인',
    text: `계정이 승인되었습니다.\n로그인 이메일: ${result.user.email}\n임시 비밀번호: ${tempPassword}\n로그인 후 비밀번호를 변경해주세요.`
  });

  res.json({
    item: result.accessRequest,
    temporaryPasswordShownInDev: env.isProduction ? undefined : tempPassword
  });
}));

router.post('/access-requests/:id/reject', asyncHandler(async (req, res) => {
  const item = await prisma.accessRequest.update({
    where: { id: req.params.id },
    data: { status: 'REJECTED', reviewedAt: new Date() }
  });
  res.json({ item });
}));

router.get('/users', asyncHandler(async (_req, res) => {
  const items = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      status: true,
      twitchLogin: true,
      createdAt: true
    }
  });
  res.json({ items });
}));

router.patch('/users/:id/status', asyncHandler(async (req, res) => {
  const status = req.body.status;
  if (!['ACTIVE', 'PENDING', 'SUSPENDED'].includes(status)) {
    return sendError(res, 400, '상태값을 확인해주세요.', 'INVALID_USER_STATUS');
  }
  const item = await prisma.user.update({ where: { id: req.params.id }, data: { status } });
  res.json({ item });
}));

router.get('/profiles', asyncHandler(async (_req, res) => {
  const items = await prisma.streamerProfile.findMany({
    include: { user: { select: { email: true, displayName: true, status: true } } },
    orderBy: { updatedAt: 'desc' }
  });
  res.json({ items });
}));

router.patch('/profiles/:id', asyncHandler(async (req, res) => {
  const data = {};
  if (req.body.isPublic !== undefined) data.isPublic = Boolean(req.body.isPublic);
  if (req.body.subtitle !== undefined) data.subtitle = sanitizeText(req.body.subtitle, 180);
  if (req.body.mainContent !== undefined) data.mainContent = sanitizeText(req.body.mainContent, 80);
  const item = await prisma.streamerProfile.update({ where: { id: req.params.id }, data });
  res.json({ item });
}));

module.exports = { adminRoutes: router };
