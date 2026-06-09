const express = require('express');
const crypto = require('crypto');
const { prisma } = require('../db/prisma');
const { saveSession } = require('../config/session');
const { asyncHandler } = require('../utils/asyncHandler');
const { requireAuth, requireStreamer } = require('../middleware/auth');
const { encrypt } = require('../utils/crypto');
const { sendError } = require('../utils/httpError');
const { uniqueProfileSlug } = require('../services/streamer.service');
const { createAccessRequest } = require('../services/accessRequest.service');
const twitch = require('../services/twitch.service');

const router = express.Router();

function normalizeIntent(value, hasUser) {
  const intent = String(value || '').trim().toLowerCase();
  if (hasUser) {
    if (['link', 'streamer'].includes(intent)) return intent;
    return 'reconnect';
  }
  return 'login';
}

function safeReturnTo(value, fallback) {
  const raw = String(value || '').trim();
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return fallback;

  try {
    const url = new URL(raw, 'http://seiga.local');
    if (url.origin !== 'http://seiga.local') return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

function redirectWithError(returnTo, errorCode) {
  const url = new URL(returnTo || '/settings.html', 'http://seiga.local');
  url.searchParams.set('error', errorCode);
  return `${url.pathname}${url.search}${url.hash}`;
}

function redirectWithParams(returnTo, params = {}) {
  const url = new URL(returnTo || '/dashboard.html', 'http://seiga.local');
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  });
  return `${url.pathname}${url.search}${url.hash}`;
}

function twitchTokenData(twitchUser, token, expiresAt) {
  return {
    twitchUserId: twitchUser.id,
    twitchLogin: twitchUser.login,
    twitchAccessTokenEnc: encrypt(token.access_token),
    twitchRefreshTokenEnc: encrypt(token.refresh_token),
    twitchTokenExpiresAt: expiresAt
  };
}

function publicRegisteredProfile(profile) {
  if (!profile) return null;
  return {
    id: profile.id,
    slug: profile.slug,
    name: profile.name,
    handle: profile.handle,
    avatarUrl: profile.avatarUrl,
    mainContent: profile.mainContent,
    profileUrl: `/streamer-detail.html?slug=${encodeURIComponent(profile.slug)}`
  };
}

async function registeredProfilesForFollowedChannels(channels = []) {
  if (!channels.length) return new Map();

  const profiles = await prisma.streamerProfile.findMany({
    where: {
      isPublic: true,
      user: {
        status: 'ACTIVE',
        role: { in: ['STREAMER', 'ADMIN'] }
      }
    },
    include: {
      user: {
        select: {
          twitchUserId: true,
          twitchLogin: true
        }
      }
    },
    take: 500
  });

  const byId = new Map();
  const byLogin = new Map();
  profiles.forEach((profile) => {
    if (profile.user?.twitchUserId) byId.set(String(profile.user.twitchUserId), profile);
    if (profile.user?.twitchLogin) byLogin.set(String(profile.user.twitchLogin).toLowerCase(), profile);
    if (profile.handle) byLogin.set(String(profile.handle).replace(/^@/, '').toLowerCase(), profile);
  });

  const matches = new Map();
  channels.forEach((channel) => {
    const id = String(channel.broadcaster_id || channel.broadcasterId || '');
    const login = String(channel.broadcaster_login || channel.broadcasterLogin || '').toLowerCase();
    const profile = byId.get(id) || byLogin.get(login);
    if (profile) matches.set(id || login, profile);
  });
  return matches;
}

async function followedChannelsPayload(req, res) {
  const accessToken = await requireConnectedTwitch(req, res);
  if (!accessToken) return null;

  const payload = await twitch.getFollowedChannels(req.user.twitchUserId, accessToken);
  const channels = Array.isArray(payload.data) ? payload.data : [];
  const matches = await registeredProfilesForFollowedChannels(channels);
  const data = channels.map((channel) => {
    const id = String(channel.broadcaster_id || '');
    const login = String(channel.broadcaster_login || '').toLowerCase();
    const registeredProfile = publicRegisteredProfile(matches.get(id) || matches.get(login));

    return {
      ...channel,
      broadcasterId: channel.broadcaster_id,
      broadcasterLogin: channel.broadcaster_login,
      broadcasterName: channel.broadcaster_name,
      followedAt: channel.followed_at,
      isRegistered: Boolean(registeredProfile),
      registeredProfile,
      profile: registeredProfile
    };
  });

  return {
    data,
    items: data,
    total: data.length,
    pagination: payload.pagination || {}
  };
}

router.get('/auth/twitch', asyncHandler(async (req, res) => {
  if (!twitch.isConfigured()) {
    const config = twitch.configurationStatus();
    console.warn(`[twitch] OAuth 설정이 완료되지 않았습니다. 누락: ${config.missingConfig.join(', ') || '없음'}`);
    return res.redirect('/login.html?error=twitch_not_configured');
  }

  const state = crypto.randomBytes(24).toString('base64url');
  const hasUser = Boolean(req.user);
  const intent = normalizeIntent(req.query.intent, hasUser);
  const returnTo = safeReturnTo(
    req.query.returnTo,
    hasUser && intent !== 'streamer' ? '/settings.html' : '/dashboard.html'
  );

  req.session.twitchOAuth = {
    state,
    intent,
    returnTo,
    userId: req.user?.id || null,
    startedAt: Date.now()
  };
  req.session.twitchState = state;
  await saveSession(req);
  res.redirect(twitch.authorizationUrl(state));
}));

router.get('/auth/twitch/callback', asyncHandler(async (req, res) => {
  if (!twitch.isConfigured()) return res.redirect('/login.html?error=twitch_not_configured');
  const oauthState = req.session.twitchOAuth;
  if (!req.query.state || !oauthState?.state || req.query.state !== oauthState.state) {
    return sendError(res, 400, 'Twitch OAuth 상태값이 올바르지 않습니다.', 'TWITCH_INVALID_STATE');
  }
  delete req.session.twitchOAuth;
  delete req.session.twitchState;

  const token = await twitch.exchangeCode(req.query.code);
  const twitchUser = await twitch.getTwitchUser('', token.access_token);
  if (!twitchUser) return res.redirect('/login.html?error=twitch_user');

  const email = twitchUser.email?.toLowerCase();
  const loginEmail = email || `${twitchUser.login}@twitch.local`;
  const expiresAt = new Date(Date.now() + token.expires_in * 1000);

  if (['reconnect', 'link', 'streamer'].includes(oauthState.intent)) {
    const returnTo = safeReturnTo(
      oauthState.returnTo,
      oauthState.intent === 'streamer' ? '/dashboard.html' : '/settings.html'
    );
    if (!req.user || req.user.id !== oauthState.userId) {
      await saveSession(req);
      return res.redirect(redirectWithError(returnTo, 'twitch_session_required'));
    }

    if (req.user.status !== 'ACTIVE') {
      await saveSession(req);
      return res.redirect(redirectWithError(returnTo, 'approval_required'));
    }

    if (oauthState.intent === 'streamer' && ['STREAMER', 'ADMIN'].includes(req.user.role)) {
      await saveSession(req);
      return res.redirect(redirectWithParams(returnTo, { streamerRequest: 'approved' }));
    }

    const conflict = await prisma.user.findFirst({
      where: {
        id: { not: req.user.id },
        OR: [
          { twitchUserId: twitchUser.id },
          { email: loginEmail }
        ]
      },
      select: { id: true }
    });
    if (conflict) {
      await saveSession(req);
      return res.redirect(redirectWithError(returnTo, 'twitch_already_linked'));
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: twitchTokenData(twitchUser, token, expiresAt),
      include: { streamerProfile: true }
    });

    req.session.userId = user.id;
    req.session.role = user.role;
    await saveSession(req);

    if (oauthState.intent === 'streamer') {
      try {
        const request = await createAccessRequest({
          twitchUrl: `https://twitch.tv/${twitchUser.login}`,
          message: 'Twitch OAuth 스트리머 등록 신청입니다.'
        }, user);
        return res.redirect(redirectWithParams(returnTo, {
          streamerRequest: request.status,
          streamerRequestId: request.id
        }));
      } catch (error) {
        if (error.apiCode === 'ACCESS_REQUEST_ALREADY_PENDING') {
          return res.redirect(redirectWithParams(returnTo, { streamerRequest: 'pending' }));
        }
        if (error.apiCode === 'ACCESS_REQUEST_ALREADY_APPROVED') {
          return res.redirect(redirectWithParams(returnTo, { streamerRequest: 'approved' }));
        }
        throw error;
      }
    }

    return res.redirect(returnTo);
  }

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
    const data = twitchTokenData(twitchUser, token, expiresAt);
    if (user.status === 'PENDING') {
      data.status = 'ACTIVE';
      if (user.role !== 'ADMIN') data.role = 'VIEWER';
    }

    user = await prisma.user.update({
      where: { id: user.id },
      data,
      include: { streamerProfile: true }
    });
  } else {
    user = await prisma.user.create({
      data: {
        email: loginEmail,
        passwordHash: null,
        passwordSetupRequired: true,
        displayName: twitchUser.display_name || twitchUser.login,
        role: 'VIEWER',
        status: 'ACTIVE',
        ...twitchTokenData(twitchUser, token, expiresAt)
      },
      include: { streamerProfile: true }
    });
  }

  if (user.status !== 'ACTIVE') {
    await saveSession(req);
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

router.post('/api/twitch/disconnect', requireAuth, asyncHandler(async (req, res) => {
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

router.get('/api/twitch/status', requireAuth, (req, res) => {
  const config = twitch.configurationStatus();
  res.json({
    ...config,
    connected: Boolean(req.user.twitchUserId && req.user.twitchLogin),
    twitchLogin: req.user.twitchLogin || null,
    role: req.user.role === 'VIEWER' ? 'USER' : req.user.role,
    canUseStreamerApis: ['STREAMER', 'ADMIN'].includes(req.user.role),
    tokenExpiresAt: req.user.twitchTokenExpiresAt || null
  });
});

router.get('/api/twitch/user', requireAuth, asyncHandler(async (req, res) => {
  const accessToken = await requireConnectedTwitch(req, res);
  if (!accessToken) return;

  const user = await twitch.getTwitchUser(req.user.twitchUserId, accessToken);
  res.json({ user: publicTwitchUser(user) });
}));

const followedChannelsHandler = asyncHandler(async (req, res) => {
  const payload = await followedChannelsPayload(req, res);
  if (!payload) return;
  res.json(payload);
});

router.get('/api/twitch/followed-channels', requireAuth, followedChannelsHandler);
router.get('/api/twitch/follows', requireAuth, followedChannelsHandler);

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
