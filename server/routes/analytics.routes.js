const express = require('express');
const { prisma } = require('../db/prisma');
const { requireStreamer } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const { ensureRawProfileForUser } = require('../services/streamer.service');

const router = express.Router();

function sinceForRange(range) {
  const days = range === '90d' ? 90 : range === '30d' ? 30 : 7;
  const since = new Date();
  since.setDate(since.getDate() - days + 1);
  since.setHours(0, 0, 0, 0);
  return { days, since };
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function dailyBuckets(items, days, since, valueFn = () => 1) {
  const buckets = new Map();
  for (let i = 0; i < days; i += 1) {
    const date = new Date(since);
    date.setDate(since.getDate() + i);
    buckets.set(dateKey(date), 0);
  }
  items.forEach((item) => {
    const key = dateKey(item.createdAt || item.fetchedAt);
    if (buckets.has(key)) buckets.set(key, buckets.get(key) + valueFn(item));
  });
  return Array.from(buckets.entries()).map(([date, value]) => ({ date, value }));
}

router.use(requireStreamer);

router.get('/summary', asyncHandler(async (req, res) => {
  const profile = await ensureRawProfileForUser(req.user);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const week = new Date();
  week.setDate(week.getDate() - 6);
  week.setHours(0, 0, 0, 0);

  const [
    totalViews,
    todayViews,
    weeklyViews,
    fanCardCount,
    publicFanCardCount,
    streamCount,
    snapshots
  ] = await Promise.all([
    prisma.pageView.count({ where: { profileId: profile.id } }),
    prisma.pageView.count({ where: { profileId: profile.id, createdAt: { gte: today } } }),
    prisma.pageView.count({ where: { profileId: profile.id, createdAt: { gte: week } } }),
    prisma.fanCard.count({ where: { profileId: profile.id, status: { not: 'DELETED' } } }),
    prisma.fanCard.count({ where: { profileId: profile.id, status: 'APPROVED', isPublic: true } }),
    prisma.streamSnapshot.count({ where: { profileId: profile.id, isLive: true } }),
    prisma.streamSnapshot.findMany({ where: { profileId: profile.id, isLive: true }, take: 100 })
  ]);

  const averageViewers = snapshots.length
    ? Math.round(snapshots.reduce((sum, item) => sum + item.viewerCount, 0) / snapshots.length)
    : 0;

  res.json({
    totalViews,
    todayViews,
    weeklyViews,
    fanCardCount,
    publicFanCardCount,
    streamCount,
    averageViewers
  });
}));

router.get('/views', asyncHandler(async (req, res) => {
  const profile = await ensureRawProfileForUser(req.user);

  const { days, since } = sinceForRange(req.query.range);
  const items = await prisma.pageView.findMany({
    where: { profileId: profile.id, createdAt: { gte: since } },
    select: { createdAt: true }
  });
  res.json({ items: dailyBuckets(items, days, since) });
}));

router.get('/fan-cards', asyncHandler(async (req, res) => {
  const profile = await ensureRawProfileForUser(req.user);

  const counts = await prisma.fanCard.groupBy({
    by: ['status'],
    where: { profileId: profile.id },
    _count: { status: true }
  });
  res.json({ items: counts.map((item) => ({ status: item.status, count: item._count.status })) });
}));

router.get('/streams', asyncHandler(async (req, res) => {
  const profile = await ensureRawProfileForUser(req.user);

  const { days, since } = sinceForRange(req.query.range);
  const items = await prisma.streamSnapshot.findMany({
    where: { profileId: profile.id, fetchedAt: { gte: since } },
    select: { fetchedAt: true, viewerCount: true, isLive: true, title: true, gameName: true }
  });
  res.json({
    items: dailyBuckets(items, days, since, (item) => item.viewerCount),
    snapshots: items
  });
}));

module.exports = { analyticsRoutes: router };
