const { prisma } = require('../db/prisma');
const { env } = require('../config/env');
const { decrypt, encrypt } = require('../utils/crypto');
const { createHttpError } = require('../utils/httpError');

const streamCache = new Map();
const TTL_MS = 60 * 1000;
const REQUIRED_SCOPES = ['user:read:email', 'user:read:follows'];

function isConfigured() {
  return Boolean(env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET && env.TWITCH_REDIRECT_URI);
}

function configurationStatus() {
  const missingConfig = [];
  if (!env.TWITCH_CLIENT_ID) missingConfig.push('TWITCH_CLIENT_ID');
  if (!env.TWITCH_CLIENT_SECRET) missingConfig.push('TWITCH_CLIENT_SECRET');
  if (!env.TWITCH_REDIRECT_URI) missingConfig.push('TWITCH_REDIRECT_URI');

  const callbackPath = '/auth/twitch/callback';
  const publicBaseRedirectUri = new URL(callbackPath, env.PUBLIC_BASE_URL).toString();
  const expectedLocalRedirectUri = `http://localhost:${env.PORT}${callbackPath}`;

  return {
    configured: missingConfig.length === 0,
    missingConfig,
    missingEnv: missingConfig,
    redirectUri: env.TWITCH_REDIRECT_URI || null,
    callbackPath,
    requiredScopes: REQUIRED_SCOPES,
    expectedLocalRedirectUri,
    publicBaseRedirectUri,
    redirectUriMatchesPublicBaseUrl: env.TWITCH_REDIRECT_URI === publicBaseRedirectUri
  };
}

function assertConfigured() {
  if (!isConfigured()) {
    throw createHttpError(
      501,
      'Twitch 연동이 설정되지 않았습니다.',
      'TWITCH_NOT_CONFIGURED'
    );
  }
}

function authorizationUrl(state) {
  assertConfigured();
  const url = new URL('https://id.twitch.tv/oauth2/authorize');
  url.searchParams.set('client_id', env.TWITCH_CLIENT_ID);
  url.searchParams.set('redirect_uri', env.TWITCH_REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', REQUIRED_SCOPES.join(' '));
  url.searchParams.set('state', state);
  return url.toString();
}

async function readTwitchError(response) {
  const text = await response.text().catch(() => '');
  if (!text) return null;

  try {
    const payload = JSON.parse(text);
    return payload.message || payload.error || text.slice(0, 300);
  } catch {
    return text.slice(0, 300);
  }
}

async function twitchFetch(url, accessToken) {
  assertConfigured();
  if (!accessToken) throw createHttpError(400, 'Twitch 액세스 토큰이 없습니다.', 'TWITCH_TOKEN_REQUIRED');

  let response;
  try {
    response = await fetch(url, {
      headers: {
        'Client-Id': env.TWITCH_CLIENT_ID,
        Authorization: `Bearer ${accessToken}`
      }
    });
  } catch (error) {
    throw createHttpError(502, 'Twitch API에 연결할 수 없습니다.', 'TWITCH_NETWORK_ERROR', {
      reason: error.message
    });
  }

  if (!response.ok) {
    const twitchMessage = await readTwitchError(response);
    const isScopeError = [401, 403].includes(response.status)
      && /scope|authorization|permission|권한/i.test(String(twitchMessage || ''));

    if (isScopeError) {
      throw createHttpError(403, 'Twitch 팔로우 목록 권한이 필요합니다. Twitch 계정을 다시 연결해주세요.', 'TWITCH_SCOPE_REQUIRED', {
        needsReconnect: true,
        requiredScope: 'user:read:follows',
        reconnectUrl: '/auth/twitch?intent=reconnect&returnTo=/dashboard.html'
      });
    }

    throw createHttpError(502, 'Twitch API 요청에 실패했습니다.', 'TWITCH_API_ERROR', {
      twitchStatus: response.status,
      twitchMessage
    });
  }

  return response.json();
}

async function exchangeCode(code) {
  assertConfigured();
  if (!code) throw createHttpError(400, 'Twitch 인증 코드가 없습니다.', 'TWITCH_CODE_REQUIRED');

  const params = new URLSearchParams({
    client_id: env.TWITCH_CLIENT_ID,
    client_secret: env.TWITCH_CLIENT_SECRET,
    code,
    grant_type: 'authorization_code',
    redirect_uri: env.TWITCH_REDIRECT_URI
  });

  let response;
  try {
    response = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });
  } catch (error) {
    throw createHttpError(502, 'Twitch 토큰 교환 서버에 연결할 수 없습니다.', 'TWITCH_NETWORK_ERROR', {
      reason: error.message
    });
  }

  if (!response.ok) {
    throw createHttpError(502, 'Twitch 토큰 교환에 실패했습니다.', 'TWITCH_TOKEN_EXCHANGE_FAILED', {
      twitchStatus: response.status,
      twitchMessage: await readTwitchError(response)
    });
  }
  return response.json();
}

async function refreshAccessToken(user) {
  assertConfigured();
  const refreshToken = decrypt(user.twitchRefreshTokenEnc);
  if (!refreshToken) throw createHttpError(400, 'Twitch refresh token이 없습니다.', 'TWITCH_REFRESH_TOKEN_REQUIRED');

  const params = new URLSearchParams({
    client_id: env.TWITCH_CLIENT_ID,
    client_secret: env.TWITCH_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  });

  let response;
  try {
    response = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });
  } catch (error) {
    throw createHttpError(502, 'Twitch 토큰 갱신 서버에 연결할 수 없습니다.', 'TWITCH_NETWORK_ERROR', {
      reason: error.message
    });
  }

  if (!response.ok) {
    throw createHttpError(502, 'Twitch 토큰 갱신에 실패했습니다.', 'TWITCH_TOKEN_REFRESH_FAILED', {
      twitchStatus: response.status,
      twitchMessage: await readTwitchError(response)
    });
  }
  const payload = await response.json();

  return prisma.user.update({
    where: { id: user.id },
    data: {
      twitchAccessTokenEnc: encrypt(payload.access_token),
      twitchRefreshTokenEnc: encrypt(payload.refresh_token || refreshToken),
      twitchTokenExpiresAt: new Date(Date.now() + payload.expires_in * 1000)
    }
  });
}

async function ensureValidTwitchToken(user) {
  assertConfigured();
  if (!user.twitchAccessTokenEnc) return null;
  const refreshAt = user.twitchTokenExpiresAt ? user.twitchTokenExpiresAt.getTime() - 60 * 1000 : 0;
  const freshUser = refreshAt <= Date.now() ? await refreshAccessToken(user) : user;
  return decrypt(freshUser.twitchAccessTokenEnc);
}

async function getTwitchUser(loginOrId, accessToken) {
  const search = String(loginOrId || '');
  const url = new URL('https://api.twitch.tv/helix/users');
  if (/^\d+$/.test(search)) url.searchParams.set('id', search);
  else if (search) url.searchParams.set('login', search.replace(/^@/, ''));
  const data = await twitchFetch(url, accessToken);
  return data.data?.[0] || null;
}

async function getStreamStatus(twitchUserId, accessToken) {
  const url = new URL('https://api.twitch.tv/helix/streams');
  url.searchParams.set('user_id', twitchUserId);
  const data = await twitchFetch(url, accessToken);
  const stream = data.data?.[0];
  if (!stream) {
    return {
      isLive: false,
      title: null,
      gameName: null,
      viewerCount: 0,
      startedAt: null,
      source: 'twitch'
    };
  }

  return {
    twitchStreamId: stream.id,
    isLive: true,
    title: stream.title,
    gameName: stream.game_name,
    viewerCount: stream.viewer_count || 0,
    startedAt: stream.started_at,
    source: 'twitch'
  };
}

async function getChannelSchedule(twitchUserId, accessToken) {
  const url = new URL('https://api.twitch.tv/helix/schedule');
  url.searchParams.set('broadcaster_id', twitchUserId);
  return twitchFetch(url, accessToken);
}

async function getFollowedChannels(twitchUserId, accessToken) {
  const url = new URL('https://api.twitch.tv/helix/channels/followed');
  url.searchParams.set('user_id', twitchUserId);
  url.searchParams.set('first', '100');
  return twitchFetch(url, accessToken);
}

async function streamStatusForProfile(profile) {
  const cached = streamCache.get(profile.id);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const user = profile.user;
  let value = null;

  if (isConfigured() && user?.twitchUserId && user?.twitchAccessTokenEnc) {
    try {
      const token = await ensureValidTwitchToken(user);
      if (token) {
        value = await getStreamStatus(user.twitchUserId, token);
        await prisma.streamSnapshot.create({
          data: {
            profileId: profile.id,
            twitchStreamId: value.twitchStreamId || null,
            isLive: value.isLive,
            title: value.title,
            gameName: value.gameName,
            viewerCount: value.viewerCount,
            startedAt: value.startedAt ? new Date(value.startedAt) : null
          }
        });
      }
    } catch (error) {
      console.warn(`[twitch] ${profile.slug}: ${error.message}`);
    }
  }

  if (!value) {
    const last = await prisma.streamSnapshot.findFirst({
      where: { profileId: profile.id },
      orderBy: { fetchedAt: 'desc' }
    });
    value = last
      ? {
          isLive: last.isLive,
          title: last.title,
          gameName: last.gameName,
          viewerCount: last.viewerCount,
          startedAt: last.startedAt,
          source: 'snapshot'
        }
      : {
          isLive: false,
          title: null,
          gameName: null,
          viewerCount: 0,
          startedAt: null,
          source: 'none'
        };
  }

  streamCache.set(profile.id, { value, expiresAt: Date.now() + TTL_MS });
  return value;
}

module.exports = {
  isConfigured,
  configurationStatus,
  authorizationUrl,
  exchangeCode,
  getTwitchUser,
  getStreamStatus,
  getChannelSchedule,
  getFollowedChannels,
  refreshAccessToken,
  ensureValidTwitchToken,
  streamStatusForProfile
};
