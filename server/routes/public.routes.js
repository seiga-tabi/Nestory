const express = require('express');
const { z } = require('zod');
const { prisma } = require('../db/prisma');
const { validate } = require('../middleware/validate');
const { fanCardLimiter } = require('../middleware/rateLimit');
const { asyncHandler } = require('../utils/asyncHandler');
const { sendError } = require('../utils/httpError');
const { hashVisitor } = require('../utils/crypto');
const { sanitizeText } = require('../utils/sanitize');
const { listPublicStreamers, getPublicStreamer } = require('../services/streamer.service');
const { streamStatusForProfile } = require('../services/twitch.service');
const { createFanCard } = require('../services/fanCard.service');
const { rankings } = require('../services/ranking.service');
const { createAccessRequest } = require('../services/accessRequest.service');

const router = express.Router();

const categoryMap = {
  minecraft: '마인크래프트',
  lol: 'League of Legends',
  chat: '잡담',
  music: '음악'
};

const languageMap = {
  kr: 'KR',
  ja: 'JA',
  bilingual: 'KR/JA'
};

router.get('/streamers', asyncHandler(async (req, res) => {
  const items = await listPublicStreamers({
    ...req.query,
    category: categoryMap[req.query.category] || req.query.category,
    language: languageMap[req.query.language] || req.query.language
  });
  res.json({ items });
}));

router.get('/rankings', asyncHandler(async (_req, res) => {
  res.json({ items: await rankings() });
}));

const accessRequestSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(80),
    email: z.string().email(),
    twitchUrl: z.string().max(300).optional().nullable(),
    message: z.string().max(1000).optional().nullable()
  }),
  query: z.object({}).passthrough(),
  params: z.object({})
});

const createAccessRequestHandler = asyncHandler(async (req, res) => {
  const item = await createAccessRequest(req.validated.body);
  res.status(201).json({ item });
});

router.post('/access-requests', validate(accessRequestSchema), createAccessRequestHandler);
router.post('/streamer-requests', validate(accessRequestSchema), createAccessRequestHandler);

router.get('/streamers/:slug/stream-status', asyncHandler(async (req, res) => {
  const profile = await prisma.streamerProfile.findFirst({
    where: { slug: req.params.slug, isPublic: true, user: { status: 'ACTIVE' } },
    include: { user: true }
  });
  if (!profile) return sendError(res, 404, '스트리머를 찾을 수 없습니다.', 'STREAMER_NOT_FOUND');
  res.json(await streamStatusForProfile(profile));
}));

const fanCardSchema = z.object({
  body: z.object({
    senderName: z.string().max(40).optional().nullable(),
    message: z.string().min(1).max(1500),
    emoji: z.string().max(8).optional().nullable(),
    isPublic: z.boolean().optional()
  }),
  query: z.object({}).passthrough(),
  params: z.object({ slug: z.string().min(1) })
});

router.post('/streamers/:slug/fan-cards', fanCardLimiter, validate(fanCardSchema), asyncHandler(async (req, res) => {
  const profile = await prisma.streamerProfile.findFirst({
    where: { slug: req.params.slug, isPublic: true, user: { status: 'ACTIVE' } }
  });
  if (!profile) return sendError(res, 404, '스트리머를 찾을 수 없습니다.', 'STREAMER_NOT_FOUND');
  const item = await createFanCard(profile, req.validated.body, req);
  res.status(201).json({ item });
}));

router.get('/streamers/:slug', asyncHandler(async (req, res) => {
  const profile = await getPublicStreamer(req.params.slug);
  if (!profile) return sendError(res, 404, '스트리머를 찾을 수 없습니다.', 'STREAMER_NOT_FOUND');

  await prisma.pageView.create({
    data: {
      profileId: profile.id,
      path: `/streamer-detail.html?slug=${profile.slug}`,
      visitorHash: hashVisitor(`${req.ip || ''}:${req.headers['user-agent'] || ''}`),
      referrer: sanitizeText(req.get('referer'), 500) || null,
      userAgent: sanitizeText(req.get('user-agent'), 500) || null
    }
  }).catch(() => {});

  res.json(profile);
}));

module.exports = { publicRoutes: router };
