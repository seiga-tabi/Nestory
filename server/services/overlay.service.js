const { prisma } = require('../db/prisma');
const { env } = require('../config/env');
const { hashToken, randomToken } = require('../utils/crypto');
const { createHttpError } = require('../utils/httpError');
const { sanitizeText, normalizeUrl } = require('../utils/sanitize');
const { slugify } = require('../utils/slug');
const { removeUpload } = require('./upload.service');

const WIDGET_TYPES = new Set(['text', 'image', 'alert', 'chat', 'goal', 'latestFollower', 'nowPlaying']);
const ANIMATION_PRESETS = new Set(['none', 'fade', 'slide', 'pop', 'pulse']);
const OVERLAY_MODES = new Set(['BUILDER', 'CUSTOM_HTML_CSS', 'CUSTOM_ADVANCED']);
const OVERLAY_STATUSES = new Set(['DRAFT', 'ACTIVE', 'DISABLED']);
const OVERLAY_TYPES = new Set(['CHAT', 'DONATION', 'FOLLOW', 'FAN_CARD', 'CUSTOM']);
const TYPE_CONFIG_KEYS = {
  CHAT: 'chat',
  DONATION: 'donation',
  FOLLOW: 'follow',
  FAN_CARD: 'fanCard',
  CUSTOM: 'custom'
};
const FORBIDDEN_KEY_PATTERN = /^(script|iframe|srcdoc|innerHTML|outerHTML)$/i;
const INLINE_EVENT_PATTERN = /^on[a-z]+/i;
const MAX_WIDGETS = 30;

const overlayInclude = {
  streamerProfile: {
    select: {
      id: true,
      slug: true,
      name: true,
      handle: true,
      userId: true,
      isPublic: true,
      user: {
        select: {
          id: true,
          displayName: true,
          role: true,
          status: true
        }
      }
    }
  }
};

function assertOverlayUser(user) {
  if (!user || !['STREAMER', 'ADMIN'].includes(user.role)) {
    throw createHttpError(403, '승인된 스트리머 권한이 필요합니다.', 'OVERLAY_STREAMER_REQUIRED');
  }
}

function numberInRange(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function enumValue(value, allowed, fallback) {
  const normalized = String(value || '').trim().toUpperCase();
  return allowed.has(normalized) ? normalized : fallback;
}

function requiredEnumValue(value, allowed, code, message) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!allowed.has(normalized)) {
    throw createHttpError(400, message, code);
  }
  return normalized;
}

function safeCssValue(value, maxLength = 120) {
  const text = sanitizeText(value, maxLength);
  if (!text) return '';
  if (/javascript:|expression\s*\(|url\s*\(\s*javascript:/i.test(text)) {
    throw createHttpError(400, '오버레이 설정에 허용되지 않는 값이 포함되어 있습니다.', 'INVALID_OVERLAY_CONFIG');
  }
  return text;
}

function safeImageUrl(value) {
  const raw = sanitizeText(value, 500);
  if (!raw) return '';
  if (/^javascript:/i.test(raw)) {
    throw createHttpError(400, '오버레이 이미지 URL을 확인해주세요.', 'INVALID_OVERLAY_CONFIG');
  }
  if (raw.startsWith('/uploads/')) return raw;
  return normalizeUrl(raw) || '';
}

function assertNoForbiddenValue(value) {
  if (typeof value === 'string' && /<\s*script|<\s*iframe|javascript:/i.test(value)) {
    throw createHttpError(400, '오버레이 설정에 허용되지 않는 값이 포함되어 있습니다.', 'INVALID_OVERLAY_CONFIG');
  }
}

function assertNoForbiddenConfig(value) {
  if (!value || typeof value !== 'object') {
    assertNoForbiddenValue(value);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach(assertNoForbiddenConfig);
    return;
  }

  Object.entries(value).forEach(([key, child]) => {
    if (FORBIDDEN_KEY_PATTERN.test(key) || INLINE_EVENT_PATTERN.test(key)) {
      throw createHttpError(400, '오버레이 설정에 허용되지 않는 필드가 포함되어 있습니다.', 'INVALID_OVERLAY_CONFIG');
    }
    assertNoForbiddenValue(child);
    assertNoForbiddenConfig(child);
  });
}

function assertSafeMarkup(value) {
  const raw = String(value || '');
  if (/<\s*(script|iframe|style|link|object|embed|meta)|javascript:|\son[a-z]+\s*=/i.test(raw)) {
    throw createHttpError(400, '오버레이 커스텀 코드에 허용되지 않는 내용이 포함되어 있습니다.', 'INVALID_OVERLAY_CODE');
  }
}

function codeText(value, maxLength = 20000) {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function decimalInRange(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function booleanValue(value, fallback = true) {
  return typeof value === 'boolean' ? value : fallback;
}

function sanitizeHtmlCode(value) {
  assertSafeMarkup(value);
  return codeText(value);
}

function sanitizeCssCode(value) {
  const raw = String(value || '');
  if (/javascript:|expression\s*\(|@import|url\s*\(\s*javascript:/i.test(raw)) {
    throw createHttpError(400, '오버레이 CSS에 허용되지 않는 내용이 포함되어 있습니다.', 'INVALID_OVERLAY_CODE');
  }
  return codeText(value);
}

function sanitizeJsCode(value) {
  const raw = String(value || '');
  if (/<\s*script|<\/\s*script|javascript:|document\.write|eval\s*\(|new\s+Function\s*\(|import\s*\(|createElement\s*\(\s*['"]script/i.test(raw)) {
    throw createHttpError(400, '오버레이 JavaScript 코드를 확인해주세요.', 'INVALID_OVERLAY_CODE');
  }
  return codeText(raw);
}

function normalizeWidget(input = {}, index = 0) {
  const type = WIDGET_TYPES.has(input.type) ? input.type : 'text';
  const animation = ANIMATION_PRESETS.has(input.animation) ? input.animation : 'none';
  const widget = {
    id: sanitizeText(input.id, 80) || `widget-${index + 1}`,
    type,
    x: numberInRange(input.x, 0, 0, 10000),
    y: numberInRange(input.y, 0, 0, 10000),
    width: numberInRange(input.width, 320, 1, 10000),
    height: numberInRange(input.height, 120, 1, 10000),
    color: safeCssValue(input.color || '#ffffff', 80),
    background: safeCssValue(input.background || 'transparent', 120),
    borderRadius: numberInRange(input.borderRadius, 0, 0, 200),
    fontSize: numberInRange(input.fontSize, 24, 8, 240),
    animation,
    text: sanitizeText(input.text, 500)
  };

  const imageUrl = safeImageUrl(input.imageUrl || input.image || input.src);
  if (imageUrl) widget.imageUrl = imageUrl;
  return widget;
}

function normalizeOverlayType(input = {}) {
  const raw = input.overlayType ?? input.type ?? 'CUSTOM';
  return requiredEnumValue(
    raw,
    OVERLAY_TYPES,
    'INVALID_OVERLAY_TYPE',
    '지원하지 않는 오버레이 타입입니다.'
  );
}

function safeAnimation(value, fallback = 'none') {
  const animation = sanitizeText(value, 40);
  return ANIMATION_PRESETS.has(animation) ? animation : fallback;
}

function sanitizeAssetSettings(input = {}) {
  const assetUrl = safeImageUrl(input.assetUrl || input.alertImageUrl || input.imageUrl);
  const alertImageName = sanitizeText(input.alertImageName || input.assetName || input.imageName, 160);
  const result = {};
  if (assetUrl) {
    result.assetUrl = assetUrl;
    result.alertImageUrl = assetUrl;
  }
  if (alertImageName) {
    result.assetName = alertImageName;
    result.alertImageName = alertImageName;
  }
  return result;
}

function sanitizeChatSettings(input = {}) {
  return {
    width: numberInRange(input.width, 560, 260, 1200),
    height: numberInRange(input.height, 640, 180, 1000),
    maxMessages: numberInRange(input.maxMessages, 8, 1, 100),
    nameColor: safeCssValue(input.nameColor || '#f9a8d4', 80),
    messageColor: safeCssValue(input.messageColor || '#ffffff', 80),
    backgroundOpacity: decimalInRange(input.backgroundOpacity, 0.46, 0, 1),
    fontSize: numberInRange(input.fontSize, 28, 8, 240),
    sampleMessage: sanitizeText(input.sampleMessage, 500)
  };
}

function sanitizeDonationSettings(input = {}) {
  const duration = numberInRange(input.duration ?? input.durationSeconds, 6, 1, 120);
  return {
    title: sanitizeText(input.title, 160),
    messageTemplate: sanitizeText(input.messageTemplate, 500),
    duration,
    durationSeconds: duration,
    animation: safeAnimation(input.animation, 'pop'),
    showName: booleanValue(input.showName, true),
    showAmount: booleanValue(input.showAmount, true),
    showMessage: booleanValue(input.showMessage, true),
    ...sanitizeAssetSettings(input)
  };
}

function sanitizeFollowSettings(input = {}) {
  const duration = numberInRange(input.duration ?? input.durationSeconds, 5, 1, 120);
  return {
    title: sanitizeText(input.title, 160),
    text: sanitizeText(input.text, 300),
    messageTemplate: sanitizeText(input.messageTemplate, 500),
    duration,
    durationSeconds: duration,
    animation: safeAnimation(input.animation, 'slide'),
    showName: booleanValue(input.showName, true),
    ...sanitizeAssetSettings(input)
  };
}

function sanitizeFanCardSettings(input = {}) {
  const duration = numberInRange(input.duration ?? input.durationSeconds, 7, 1, 120);
  return {
    title: sanitizeText(input.title, 160),
    author: sanitizeText(input.author, 120),
    message: sanitizeText(input.message, 500),
    messageTemplate: sanitizeText(input.messageTemplate, 500),
    duration,
    durationSeconds: duration,
    animation: safeAnimation(input.animation, 'fade'),
    ...sanitizeAssetSettings(input)
  };
}

function sanitizeCustomSettings(input = {}) {
  return {
    codeFirst: booleanValue(input.codeFirst, true)
  };
}

function sanitizeTypeSettings(overlayType, input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  if (overlayType === 'CHAT') return sanitizeChatSettings(source);
  if (overlayType === 'DONATION') return sanitizeDonationSettings(source);
  if (overlayType === 'FOLLOW') return sanitizeFollowSettings(source);
  if (overlayType === 'FAN_CARD') return sanitizeFanCardSettings(source);
  return sanitizeCustomSettings(source);
}

function sanitizeConfigAssets(source = {}, typeSettings = {}) {
  const assetUrl = safeImageUrl(
    source.assets?.alertImageUrl
    || source.assets?.assetUrl
    || source.alertAssetUrl
    || typeSettings.alertImageUrl
    || typeSettings.assetUrl
  );
  const alertImageName = sanitizeText(
    source.assets?.alertImageName
    || source.assets?.assetName
    || source.alertAssetName
    || typeSettings.alertImageName
    || typeSettings.assetName,
    160
  );

  if (!assetUrl && !alertImageName) return null;

  return {
    ...(assetUrl ? { assetUrl, alertImageUrl: assetUrl } : {}),
    ...(alertImageName ? { assetName: alertImageName, alertImageName } : {})
  };
}

function sanitizeOverlayConfig(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  assertNoForbiddenConfig(source);
  const overlayType = normalizeOverlayType(source);
  const typeKey = TYPE_CONFIG_KEYS[overlayType];
  const typeSettings = sanitizeTypeSettings(overlayType, source[typeKey] || {});
  const assets = sanitizeConfigAssets(source, typeSettings);
  const editorMode = sanitizeText(source.editorMode, 40);
  if (editorMode && !['builder', 'code'].includes(editorMode)) {
    throw createHttpError(400, '오버레이 편집 모드를 확인해주세요.', 'INVALID_OVERLAY_CONFIG');
  }

  return {
    version: 1,
    overlayType,
    ...(editorMode ? { editorMode } : {}),
    background: safeCssValue(source.background || 'transparent', 120),
    widgets: Array.isArray(source.widgets)
      ? source.widgets.slice(0, MAX_WIDGETS).map(normalizeWidget)
      : [],
    [typeKey]: typeSettings,
    ...(assets ? {
      assets,
      alertAssetUrl: assets.alertImageUrl || assets.assetUrl,
      alertAssetName: assets.alertImageName || assets.assetName
    } : {})
  };
}

function obsUrlForToken(token) {
  return new URL(`/overlay.html?token=${encodeURIComponent(token)}`, env.PUBLIC_BASE_URL).toString();
}

function publicApiUrlForToken(token) {
  return new URL(`/api/overlay-public/${encodeURIComponent(token)}`, env.PUBLIC_BASE_URL).toString();
}

function ownerResponse(profile) {
  if (!profile) return null;
  return {
    id: profile.id,
    displayName: profile.user?.displayName || profile.name,
    slug: profile.slug,
    handle: profile.handle
  };
}

function overlayResponse(overlay, token = null) {
  const overlayType = overlay.configJson?.overlayType || 'CUSTOM';
  const response = {
    id: overlay.id,
    streamerId: overlay.streamerProfileId,
    streamerProfileId: overlay.streamerProfileId,
    overlayType,
    type: overlayType,
    title: overlay.title || overlay.name,
    name: overlay.name,
    description: overlay.description || '',
    slug: overlay.slug,
    mode: overlay.mode,
    status: overlay.status,
    width: overlay.width,
    height: overlay.height,
    thumbnailUrl: overlay.thumbnailUrl || null,
    obsUrl: token ? obsUrlForToken(token) : null,
    isEnabled: overlay.isEnabled,
    allowCustomJs: Boolean(overlay.allowCustomJs),
    configJson: overlay.configJson,
    htmlCode: overlay.htmlCode || '',
    cssCode: overlay.cssCode || '',
    jsCode: overlay.jsCode || '',
    createdAt: overlay.createdAt,
    updatedAt: overlay.updatedAt,
    owner: ownerResponse(overlay.streamerProfile)
  };

  if (token) {
    response.token = token;
    response.publicUrl = response.obsUrl;
    response.publicApiUrl = publicApiUrlForToken(token);
  }

  return response;
}

function overlayListItem(overlay) {
  const item = overlayResponse(overlay);
  delete item.htmlCode;
  delete item.cssCode;
  delete item.jsCode;
  delete item.configJson;
  return item;
}

function overlayAssetResponse(asset) {
  return {
    id: asset.id,
    overlayId: asset.overlayId,
    url: asset.url,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    size: asset.size,
    createdAt: asset.createdAt
  };
}

function publicOverlayResponse(overlay) {
  const overlayType = overlay.configJson?.overlayType || 'CUSTOM';
  return {
    ok: true,
    overlay: {
      overlayType,
      type: overlayType,
      title: overlay.title || overlay.name,
      width: overlay.width,
      height: overlay.height,
      mode: overlay.mode,
      htmlCode: overlay.htmlCode || '',
      cssCode: overlay.cssCode || '',
      jsCode: overlay.allowCustomJs ? overlay.jsCode || '' : '',
      allowCustomJs: Boolean(overlay.allowCustomJs),
      configJson: overlay.configJson,
      streamer: {
        slug: overlay.streamerProfile.slug,
        name: overlay.streamerProfile.name,
        handle: overlay.streamerProfile.handle
      }
    }
  };
}

async function uniqueOverlaySlug(streamerProfileId, value, excludeId = null) {
  const base = slugify(value || 'overlay');
  let candidate = base;
  let index = 2;

  while (await prisma.overlay.findFirst({
    where: {
      streamerProfileId,
      slug: candidate,
      ...(excludeId ? { NOT: { id: excludeId } } : {})
    },
    select: { id: true }
  })) {
    candidate = `${base}-${index}`;
    index += 1;
  }

  return candidate;
}

async function resolveStreamerProfileForCreate(user, body = {}) {
  assertOverlayUser(user);
  const isAdmin = user.role === 'ADMIN';
  const targetId = body.streamerProfileId || body.streamerId;
  const targetSlug = body.streamerSlug;

  const where = isAdmin && (targetId || targetSlug)
    ? {
        ...(targetId ? { id: targetId } : { slug: targetSlug }),
        user: { status: 'ACTIVE', role: { in: ['STREAMER', 'ADMIN'] } }
      }
    : {
        userId: user.id,
        user: { status: 'ACTIVE', role: { in: ['STREAMER', 'ADMIN'] } }
      };

  const profile = await prisma.streamerProfile.findFirst({
    where,
    select: { id: true, slug: true, name: true, handle: true, userId: true }
  });

  if (!profile) {
    throw createHttpError(403, '오버레이를 생성할 승인된 스트리머 프로필이 없습니다.', 'OVERLAY_STREAMER_REQUIRED');
  }

  if (!isAdmin && profile.userId !== user.id) {
    throw createHttpError(403, '다른 스트리머의 오버레이를 관리할 수 없습니다.', 'OVERLAY_FORBIDDEN');
  }

  return profile;
}

async function getOverlayForUser(user, id) {
  assertOverlayUser(user);
  const overlay = await prisma.overlay.findUnique({ where: { id }, include: overlayInclude });

  if (!overlay) {
    throw createHttpError(404, '오버레이를 찾을 수 없습니다.', 'OVERLAY_NOT_FOUND');
  }

  if (user.role !== 'ADMIN' && overlay.streamerProfile.userId !== user.id) {
    throw createHttpError(403, '다른 스트리머의 오버레이를 관리할 수 없습니다.', 'OVERLAY_FORBIDDEN');
  }

  return overlay;
}

async function assertOverlayAccess(user, id) {
  await getOverlayForUser(user, id);
  return true;
}

function normalizeOverlayData(user, body = {}, existing = null) {
  const title = sanitizeText(body.title ?? body.name, 80) || existing?.title || existing?.name || '새 오버레이';
  const status = body.status !== undefined
    ? enumValue(body.status, OVERLAY_STATUSES, existing?.status || 'DRAFT')
    : existing?.status || 'DRAFT';
  const allowCustomJs = user.role === 'ADMIN' && body.allowCustomJs !== undefined
    ? body.allowCustomJs === true
    : Boolean(existing?.allowCustomJs);

  return {
    title,
    name: title,
    description: sanitizeText(body.description, 500) || existing?.description || null,
    mode: enumValue(body.mode, OVERLAY_MODES, existing?.mode || 'BUILDER'),
    status,
    width: numberInRange(body.width, existing?.width || 1920, 320, 7680),
    height: numberInRange(body.height, existing?.height || 1080, 180, 4320),
    isEnabled: status !== 'DISABLED' && body.isEnabled !== false,
    thumbnailUrl: safeImageUrl(body.thumbnailUrl) || existing?.thumbnailUrl || null,
    allowCustomJs,
    htmlCode: sanitizeHtmlCode(body.htmlCode ?? existing?.htmlCode ?? ''),
    cssCode: sanitizeCssCode(body.cssCode ?? existing?.cssCode ?? ''),
    jsCode: sanitizeJsCode(body.jsCode ?? existing?.jsCode ?? ''),
    configJson: sanitizeOverlayConfig(body.configJson || body.config || existing?.configJson || {})
  };
}

async function listOverlays(user, query = {}) {
  assertOverlayUser(user);
  const where = {
    status: { not: 'DISABLED' },
    isEnabled: true
  };
  if (user.role !== 'ADMIN') {
    where.streamerProfile = { userId: user.id };
  } else if (query.streamerProfileId || query.streamerId || query.streamerSlug) {
    where.streamerProfile = query.streamerSlug
      ? { slug: query.streamerSlug }
      : { id: query.streamerProfileId || query.streamerId };
  }

  const items = await prisma.overlay.findMany({
    where,
    include: overlayInclude,
    orderBy: { updatedAt: 'desc' },
    take: 200
  });

  return items.map(overlayListItem);
}

async function createOverlay(user, body = {}) {
  const profile = await resolveStreamerProfileForCreate(user, body);
  const token = randomToken(32);
  const data = normalizeOverlayData(user, body);
  const slug = await uniqueOverlaySlug(profile.id, body.slug || data.title);

  const overlay = await prisma.overlay.create({
    data: {
      streamerProfileId: profile.id,
      ...data,
      slug,
      tokenHash: hashToken(token)
    },
    include: overlayInclude
  });

  return overlayResponse(overlay, token);
}

async function getOverlay(user, id) {
  return overlayResponse(await getOverlayForUser(user, id));
}

async function updateOverlay(user, id, body = {}) {
  const existing = await getOverlayForUser(user, id);
  const data = normalizeOverlayData(user, body, existing);
  if (body.slug !== undefined) {
    data.slug = await uniqueOverlaySlug(existing.streamerProfileId, body.slug || data.title, existing.id);
  }

  const overlay = await prisma.overlay.update({ where: { id }, data, include: overlayInclude });
  return overlayResponse(overlay);
}

async function disableOverlay(user, id) {
  await getOverlayForUser(user, id);
  const overlay = await prisma.overlay.update({
    where: { id },
    data: { status: 'DISABLED', isEnabled: false },
    include: overlayInclude
  });
  return {
    ...overlayResponse(overlay),
    deleted: true,
    softDeleted: true
  };
}

async function duplicateOverlay(user, id) {
  const existing = await getOverlayForUser(user, id);
  const token = randomToken(32);
  const slug = await uniqueOverlaySlug(existing.streamerProfileId, `${existing.slug}-copy`);
  const title = `${existing.title || existing.name} 복사본`;

  const overlay = await prisma.overlay.create({
    data: {
      streamerProfileId: existing.streamerProfileId,
      title,
      name: title,
      description: existing.description,
      slug,
      tokenHash: hashToken(token),
      mode: existing.mode,
      status: 'DRAFT',
      width: existing.width,
      height: existing.height,
      isEnabled: true,
      thumbnailUrl: existing.thumbnailUrl,
      htmlCode: existing.htmlCode,
      cssCode: existing.cssCode,
      jsCode: existing.jsCode,
      allowCustomJs: Boolean(existing.allowCustomJs && user.role === 'ADMIN'),
      configJson: existing.configJson
    },
    include: overlayInclude
  });

  return overlayResponse(overlay, token);
}

async function regenerateOverlayToken(user, id) {
  await getOverlayForUser(user, id);
  const token = randomToken(32);
  const overlay = await prisma.overlay.update({
    where: { id },
    data: { tokenHash: hashToken(token) },
    include: overlayInclude
  });
  return overlayResponse(overlay, token);
}

async function listOverlayAssets(user, id) {
  const overlay = await getOverlayForUser(user, id);
  const assets = await prisma.overlayAsset.findMany({
    where: { overlayId: overlay.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      overlayId: true,
      url: true,
      fileName: true,
      mimeType: true,
      size: true,
      createdAt: true
    }
  });

  return assets.map(overlayAssetResponse);
}

async function createOverlayAsset(user, id, file, url) {
  const overlay = await getOverlayForUser(user, id);
  const asset = await prisma.overlayAsset.create({
    data: {
      overlayId: overlay.id,
      uploaderId: user.id,
      url,
      fileName: file.filename,
      mimeType: file.mimetype,
      size: file.size
    },
    select: {
      id: true,
      overlayId: true,
      url: true,
      fileName: true,
      mimeType: true,
      size: true,
      createdAt: true
    }
  });

  return overlayAssetResponse(asset);
}

async function deleteOverlayAsset(user, id, assetId) {
  const overlay = await getOverlayForUser(user, id);
  const asset = await prisma.overlayAsset.findFirst({
    where: {
      id: assetId,
      overlayId: overlay.id
    },
    select: {
      id: true,
      overlayId: true,
      url: true,
      fileName: true,
      mimeType: true,
      size: true,
      createdAt: true
    }
  });

  if (!asset) {
    throw createHttpError(404, '오버레이 asset을 찾을 수 없습니다.', 'OVERLAY_ASSET_NOT_FOUND');
  }

  await prisma.overlayAsset.delete({ where: { id: asset.id } });
  await removeUpload(asset.url);

  return {
    ...overlayAssetResponse(asset),
    deleted: true
  };
}

async function getPublicOverlayByToken(token) {
  const tokenHash = hashToken(token || '');
  const overlay = await prisma.overlay.findFirst({
    where: {
      tokenHash,
      status: 'ACTIVE',
      isEnabled: true,
      streamerProfile: {
        isPublic: true,
        user: {
          status: 'ACTIVE',
          role: { in: ['STREAMER', 'ADMIN'] }
        }
      }
    },
    include: overlayInclude
  });

  if (!overlay) {
    throw createHttpError(404, '오버레이를 찾을 수 없습니다.', 'OVERLAY_NOT_FOUND');
  }

  return publicOverlayResponse(overlay);
}

module.exports = {
  sanitizeOverlayConfig,
  assertOverlayAccess,
  listOverlays,
  createOverlay,
  getOverlay,
  updateOverlay,
  disableOverlay,
  duplicateOverlay,
  regenerateOverlayToken,
  listOverlayAssets,
  createOverlayAsset,
  deleteOverlayAsset,
  getPublicOverlayByToken
};
