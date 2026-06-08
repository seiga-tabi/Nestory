const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { prisma } = require('../db/prisma');
const { env } = require('../config/env');
const { saveSession } = require('../config/session');
const { asyncHandler } = require('../utils/asyncHandler');
const { requireStreamer } = require('../middleware/auth');
const { encrypt } = require('../utils/crypto');
const { sendError } = require('../utils/httpError');
const { uniqueProfileSlug } = require('../services/streamer.service');
const twitch = require('../services/twitch.service');

const router = express.Router();

router.get('/auth/twitch', (req, res) => {
  if (!twitch.isConfigured()) {
    return res.redirect('/login.html?error=twitch_not_configured');
  }

  const state = crypto.randomBytes(24).toString('base64url');
  req.session.twitchState = state;
  res.redirect(twitch.authorizationUrl(state));
});

router.get('/auth/twitch/callback', asyncHandler(async (req, res) => {
  if (!twitch.isConfigured()) return res.redirect('/login.html?error=twitch_not_configured');
  if (!req.query.state || req.query.state !== req.session.twitchState) {
    return sendError(res, 400, 'Twitch OAuth 상태값이 올바르지 않습니다.', 'TWITCH_INVALID_STATE');
  }
  delete req.session.twitchState;

  const token = await twitch.exchangeCode(req.query.code);
  const twitchUser = await twitch.getTwitchUser('', token.access_token);
  if (!twitchUser) return res.redirect('/login.html?error=twitch_user');

  const email = twitchUser.email?.toLowerCase();
  const loginEmail = email || `${twitchUser.login}@twitch.local`;
  const expiresAt = new Date(Date.now() + token.expires_in * 1000);

  let user = await prisma.user.findFirst({
    where: {
      OR: [
        { twitchUserId: twitchUser.id },
        { email: loginEmail }
      ]
    },
    include: { streamerProfile: true }
  });

  if (user) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        twitchUserId: twitchUser.id,
        twitchLogin: twitchUser.login,
        twitchAccessTokenEnc: encrypt(token.access_token),
        twitchRefreshTokenEnc: encrypt(token.refresh_token),
        twitchTokenExpiresAt: expiresAt
      },
      include: { streamerProfile: true }
    });
  } else {
    const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('base64url'), 12);
    user = await prisma.user.create({
      data: {
        email: loginEmail,
        passwordHash,
        displayName: twitchUser.display_name || twitchUser.login,
        role: 'STREAMER',
        status: 'PENDING',
        twitchUserId: twitchUser.id,
        twitchLogin: twitchUser.login,
        twitchAccessTokenEnc: encrypt(token.access_token),
        twitchRefreshTokenEnc: encrypt(token.refresh_token),
        twitchTokenExpiresAt: expiresAt
      },
      include: { streamerProfile: true }
    });

    await prisma.accessRequest.create({
      data: {
        name: user.displayName,
        email: user.email,
        twitchUrl: `https://twitch.tv/${twitchUser.login}`,
        message: 'Twitch OAuth로 생성된 승인 대기 요청입니다.'
      }
    });
  }

  if (user.status !== 'ACTIVE') {
    return res.redirect('/access-request.html?status=pending');
  }

  if (!user.streamerProfile && user.role === 'STREAMER') {
    const slug = await uniqueProfileSlug(user.twitchLogin || user.displayName);
    await prisma.streamerProfile.create({
      data: {
        userId: user.id,
        slug,
        name: user.displayName,
        handle: `@${user.twitchLogin || user.displayName}`,
        subtitle: 'Seiga Studio 스트리머',
        mainContent: '잡담',
        language: 'KR/JA',
        isPublic: false
      }
    });
  }

  req.session.userId = user.id;
  req.session.role = user.role;
  await saveSession(req);
  res.redirect('/dashboard.html');
}));

function publicTwitchUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    login: user.login,
    displayName: user.display_name,
    broadcasterType: user.broadcaster_type,
    description: user.description,
    profileImageUrl: user.profile_image_url,
    offlineImageUrl: user.offline_image_url,
    viewCount: user.view_count,
    createdAt: user.created_at
  };
}

async function requireConnectedTwitch(req, res) {
  if (!twitch.isConfigured()) {
    sendError(res, 501, 'Twitch 연동이 설정되지 않았습니다.', 'TWITCH_NOT_CONFIGURED');
    return null;
  }

  if (!req.user.twitchUserId || !req.user.twitchAccessTokenEnc) {
    sendError(res, 400, 'Twitch 계정을 먼저 연결해주세요.', 'TWITCH_NOT_CONNECTED');
    return null;
  }

  const accessToken = await twitch.ensureValidTwitchToken(req.user);
  if (!accessToken) {
    sendError(res, 400, 'Twitch 액세스 토큰이 없습니다.', 'TWITCH_TOKEN_REQUIRED');
    return null;
  }

  return accessToken;
}

router.post('/api/twitch/disconnect', requireStreamer, asyncHandler(async (req, res) => {
  await prisma.user.update({
    where: { id: req.user.id },
    data: {
      twitchUserId: null,
      twitchLogin: null,
      twitchAccessTokenEnc: null,
      twitchRefreshTokenEnc: null,
      twitchTokenExpiresAt: null
    }
  });
  res.json({ ok: true });
}));

router.get('/api/twitch/status', requireStreamer, (req, res) => {
  res.json({
    configured: twitch.isConfigured(),
    connected: Boolean(req.user.twitchUserId && req.user.twitchLogin),
    twitchLogin: req.user.twitchLogin || null,
    tokenExpiresAt: req.user.twitchTokenExpiresAt || null,
    redirectUri: env.TWITCH_REDIRECT_URI || null
  });
});

router.get('/api/twitch/user', requireStreamer, asyncHandler(async (req, res) => {
  const accessToken = await requireConnectedTwitch(req, res);
  if (!accessToken) return;

  const user = await twitch.getTwitchUser(req.user.twitchUserId, accessToken);
  res.json({ user: publicTwitchUser(user) });
}));

router.get('/api/twitch/stream-status', requireStreamer, asyncHandler(async (req, res) => {
  const accessToken = await requireConnectedTwitch(req, res);
  if (!accessToken) return;

  res.json(await twitch.getStreamStatus(req.user.twitchUserId, accessToken));
}));

router.get('/api/twitch/schedule', requireStreamer, asyncHandler(async (req, res) => {
  const accessToken = await requireConnectedTwitch(req, res);
  if (!accessToken) return;

  res.json(await twitch.getChannelSchedule(req.user.twitchUserId, accessToken));
}));

module.exports = { twitchRoutes: router };
