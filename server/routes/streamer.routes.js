const express = require('express');
const { prisma } = require('../db/prisma');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const { ensureRawProfileForUser } = require('../services/streamer.service');
const { streamStatusForProfile } = require('../services/twitch.service');

const router = express.Router();

router.use(requireAuth);

router.get('/summary', asyncHandler(async (req, res) => {
  if (!['STREAMER', 'ADMIN'].includes(req.user.role)) {
    const latestRequest = await prisma.accessRequest.findFirst({
      where: { email: req.user.email },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        createdAt: true,
        reviewedAt: true,
        approvedAt: true,
        rejectedAt: true
      }
    });
    const requestStatus = latestRequest?.status?.toLowerCase() || 'not_requested';

    return res.json({
      account: {
        role: 'USER',
        status: req.user.status,
        twitchConnected: Boolean(req.user.twitchUserId && req.user.twitchLogin),
        streamerApprovalStatus: requestStatus
      },
      profile: {
        name: req.user.displayName,
        displayName: req.user.displayName,
        handle: req.user.twitchLogin ? `@${req.user.twitchLogin}` : '',
        subtitle: '스트리머 등록 승인 후 공개 프로필을 만들 수 있습니다.',
        mainContent: '',
        language: '',
        isPublic: false
      },
      todayViews: 0,
      fanCardCount: 0,
      publicProfileStatus: 'NOT_APPROVED',
      streamerRequest: latestRequest ? {
        id: latestRequest.id,
        status: requestStatus,
        createdAt: latestRequest.createdAt,
        reviewedAt: latestRequest.reviewedAt,
        approvedAt: latestRequest.approvedAt,
        rejectedAt: latestRequest.rejectedAt
      } : null,
      cardCompletion: 0,
      streamStatus: {
        isLive: false,
        title: '스트리머 등록 승인 대기 전입니다.',
        gameName: null,
        viewerCount: 0,
        startedAt: null,
        source: 'account'
      },
      recentFanCards: [],
      recentActivity: [
        { label: '계정 상태', value: '일반 사용자' },
        { label: 'Twitch 연동', value: req.user.twitchLogin ? `@${req.user.twitchLogin}` : '미연결' },
        { label: '스트리머 등록', value: requestStatus === 'not_requested' ? '신청 가능' : requestStatus }
      ]
    });
  }

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
