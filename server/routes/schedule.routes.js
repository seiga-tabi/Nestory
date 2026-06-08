const express = require('express');
const { z } = require('zod');
const { prisma } = require('../db/prisma');
const { requireStreamer } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { asyncHandler } = require('../utils/asyncHandler');
const { ensureRawProfileForUser } = require('../services/streamer.service');
const { normalizeSchedule } = require('../services/profileCard.service');

const router = express.Router();

const schema = z.object({
  body: z.object({
    items: z.array(z.object({
      dayOfWeek: z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']),
      startTime: z.string().max(12).optional().nullable(),
      title: z.string().max(120).optional().nullable(),
      isActive: z.boolean().optional()
    }))
  }),
  query: z.object({}).passthrough(),
  params: z.object({})
});

router.use(requireStreamer);

router.get('/', asyncHandler(async (req, res) => {
  const profile = await ensureRawProfileForUser(req.user);
  res.json({ items: profile.schedule });
}));

router.put('/', validate(schema), asyncHandler(async (req, res) => {
  const profile = await ensureRawProfileForUser(req.user);

  const items = normalizeSchedule(req.validated.body.items);
  await prisma.$transaction(items.map((item) => prisma.streamSchedule.upsert({
    where: { profileId_dayOfWeek: { profileId: profile.id, dayOfWeek: item.dayOfWeek } },
    create: { ...item, profileId: profile.id },
    update: item
  })));

  const next = await ensureRawProfileForUser(req.user);
  res.json({ items: next.schedule });
}));

module.exports = { scheduleRoutes: router };
