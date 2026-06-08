const express = require('express');
const { prisma } = require('../db/prisma');
const { requireStreamer } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const { ensureRawProfileForUser } = require('../services/streamer.service');
const { streamStatusForProfile } = require('../services/twitch.service');

const router = express.Router();

router.use(requireStreamer);

router.get('/summary', asyncHandler(async (req, res) => {
  const profile = await ensureRawProfileForUser(req.user);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [todayViews, fanCardCount, recentFanCards, streamStatus] = await Promise.all([
    prisma.pageView.count({ where: { profileId: profile.id, createdAt: { gte: today } } }),
    prisma.fanCard.count({ where: { profileId: profile.id } }),
    prisma.fanCard.findMany({
      where: { profileId: profile.id, status: { not: 'DELETED' } },
      orderBy: { createdAt: 'desc' },
      take: 5
    }),
    streamStatusForProfile(profile)
  ]);

  const linkScore = Math.min(profile.socialLinks.length * 12, 36);
  const scheduleScore = Math.min(profile.schedule.filter((item) => item.isActive).length * 7, 28);
  const cardCompletion = Math.min(100, 28 + linkScore + scheduleScore + (profile.avatarUrl ? 18 : 0));

  res.json({
    profile: {
      slug: profile.slug,
      name: profile.name,
      handle: profile.handle,
      avatarUrl: profile.avatarUrl,
      mainColor: profile.mainColor,
      subColor: profile.subColor
    },
    todayViews,
    fanCardCount,
    publicProfileStatus: profile.isPublic ? 'PUBLIC' : 'PRIVATE',
    cardCompletion,
    streamStatus,
    recentFanCards,
    recentActivity: [
      { label: '프로필 상태', value: profile.isPublic ? '공개 중' : '비공개' },
      { label: '방송 상태', value: streamStatus.isLive ? 'LIVE' : 'OFFLINE' },
      { label: '최근 팬 카드', value: `${recentFanCards.length}개` }
    ]
  });
}));

module.exports = { streamerRoutes: router };
