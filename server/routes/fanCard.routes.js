const express = require('express');
const { z } = require('zod');
const { prisma } = require('../db/prisma');
const { requireStreamer } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { asyncHandler } = require('../utils/asyncHandler');
const { sendError } = require('../utils/httpError');
const { ensureRawProfileForUser } = require('../services/streamer.service');
const { listFanCards } = require('../services/fanCard.service');

const router = express.Router();

const statusSchema = z.object({
  body: z.object({ status: z.enum(['PENDING', 'APPROVED', 'HIDDEN', 'DELETED']) }),
  query: z.object({}).passthrough(),
  params: z.object({ id: z.string().min(1) })
});

router.use(requireStreamer);

router.get('/', asyncHandler(async (req, res) => {
  const profile = await ensureRawProfileForUser(req.user);
  res.json(await listFanCards(profile.id, req.query));
}));

router.patch('/:id', validate(statusSchema), asyncHandler(async (req, res) => {
  const profile = await ensureRawProfileForUser(req.user);

  const item = await prisma.fanCard.updateMany({
    where: { id: req.params.id, profileId: profile.id },
    data: { status: req.validated.body.status }
  });
  if (!item.count) return sendError(res, 404, '팬 카드를 찾을 수 없습니다.', 'FAN_CARD_NOT_FOUND');
  res.json({ ok: true });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const profile = await ensureRawProfileForUser(req.user);

  const item = await prisma.fanCard.updateMany({
    where: { id: req.params.id, profileId: profile.id },
    data: { status: 'DELETED' }
  });
  if (!item.count) return sendError(res, 404, '팬 카드를 찾을 수 없습니다.', 'FAN_CARD_NOT_FOUND');
  res.json({ ok: true });
}));

module.exports = { fanCardRoutes: router };
