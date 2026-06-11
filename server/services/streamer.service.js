const { prisma } = require('../db/prisma');
const { normalizeUrl } = require('../utils/sanitize');
const { slugify } = require('../utils/slug');

const includePublicProfile = {
  user: {
    select: {
      id: true,
      displayName: true,
      role: true,
      status: true,
      twitchUserId: true,
      twitchLogin: true
    }
  },
  socialLinks: { where: { isVisible: true }, orderBy: { sortOrder: 'asc' } },
  schedule: { orderBy: { dayOfWeek: 'asc' } },
  fanCards: {
    where: { isPublic: true, status: 'APPROVED' },
    orderBy: { createdAt: 'desc' },
    take: 6
  },
  snapshots: { orderBy: { fetchedAt: 'desc' }, take: 1 }
};

function mapLinks(links = []) {
  return links.map((link) => ({
    id: link.id,
    type: link.type,
    label: link.label,
    url: link.url,
    isVisible: link.isVisible,
    sortOrder: link.sortOrder
  }));
}

function mapSchedule(schedule = []) {
  return schedule.map((item) => ({
    id: item.id,
    dayOfWeek: item.dayOfWeek,
    startTime: item.startTime,
    title: item.title,
    isActive: item.isActive
  }));
}

function mapFanCards(cards = []) {
  return cards.map((card) => ({
    id: card.id,
    senderName: card.senderName || '익명 팬',
    message: card.message,
    emoji: card.emoji || '💜',
    isPublic: card.isPublic,
    status: card.status,
    createdAt: card.createdAt
  }));
}

function normalizeLimit(value, fallback = 24, max = 100) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(1, Math.min(max, Math.round(number)));
}

function streamStatusFromSnapshot(profile) {
  const last = profile.snapshots?.[0];
  if (!last) {
    return {
      isLive: false,
      title: null,
      gameName: null,
      viewerCount: 0,
      startedAt: null,
      source: 'none'
    };
  }

  return {
    isLive: last.isLive,
    title: last.title,
    gameName: last.gameName,
    viewerCount: last.viewerCount,
    startedAt: last.startedAt,
    source: 'snapshot'
  };
}

function countMap(rows, key = 'profileId') {
  const map = new Map();
  rows.forEach((row) => {
    map.set(row[key], row._count?._all || 0);
  });
  return map;
}

async function publicProfileMetrics(profileIds = []) {
  if (!profileIds.length) {
    return {
      fanCardCounts: new Map(),
      viewCounts: new Map(),
      favoriteCounts: new Map()
    };
  }

  const [fanCardRows, pageViewRows, favoriteRows] = await Promise.all([
    prisma.fanCard.groupBy({
      by: ['profileId'],
      where: {
        profileId: { in: profileIds },
        status: 'APPROVED',
        isPublic: true
      },
      _count: { _all: true }
    }),
    prisma.pageView.groupBy({
      by: ['profileId'],
      where: { profileId: { in: profileIds } },
      _count: { _all: true }
    }),
    prisma.favorite.groupBy({
      by: ['streamerProfileId'],
      where: { streamerProfileId: { in: profileIds } },
      _count: { _all: true }
    })
  ]);

  return {
    fanCardCounts: countMap(fanCardRows),
    viewCounts: countMap(pageViewRows),
    favoriteCounts: countMap(favoriteRows, 'streamerProfileId')
  };
}

function mapPublicProfile(profile, options = {}) {
  const streamStatus = options.streamStatus || streamStatusFromSnapshot(profile);
  const approvedFanCount = options.fanCardCount ?? 0;
  const viewCount = options.viewCount ?? 0;
  const favoriteCount = options.favoriteCount ?? 0;

  return {
    id: profile.id,
    slug: profile.slug,
    name: profile.name,
    handle: profile.handle,
    subtitle: profile.subtitle,
    mainContent: profile.mainContent,
    language: profile.language,
    avatarUrl: profile.avatarUrl,
    coverImageUrl: profile.coverImageUrl,
    coverImage: profile.coverImageUrl,
    backgroundImageUrl: profile.coverImageUrl,
    backgroundImage: profile.coverImageUrl,
    cardDesign: profile.cardDesign,
    mainColor: profile.mainColor,
    subColor: profile.subColor,
    updatedAt: profile.updatedAt,
    isPublic: profile.isPublic,
    isLive: streamStatus.isLive,
    viewerCount: streamStatus.viewerCount || 0,
    streamStatus,
    fanCardCount: approvedFanCount,
    favoriteCount,
    viewCount,
    links: mapLinks(profile.socialLinks),
    schedule: mapSchedule(profile.schedule),
    fanCards: mapFanCards(profile.fanCards)
  };
}

async function listPublicStreamers(query = {}) {
  const q = String(query.q || '').trim();
  const status = query.status || 'all';
  const category = query.category;
  const language = query.language;
  const sort = query.sort || 'popular';
  const limit = normalizeLimit(query.limit);

  const where = {
    isPublic: true,
    user: {
      status: 'ACTIVE',
      role: { in: ['STREAMER', 'ADMIN'] }
    }
  };

  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { handle: { contains: q, mode: 'insensitive' } },
      { subtitle: { contains: q, mode: 'insensitive' } },
      { mainContent: { contains: q, mode: 'insensitive' } },
      { language: { contains: q, mode: 'insensitive' } }
    ];
  }

  if (category) where.mainContent = { contains: category, mode: 'insensitive' };
  if (language) where.language = { contains: language, mode: 'insensitive' };

  const profiles = await prisma.streamerProfile.findMany({
    where,
    include: includePublicProfile,
    orderBy: sort === 'name' ? { name: 'asc' } : { updatedAt: 'desc' },
    take: Math.min(100, Math.max(limit, status === 'all' ? limit : 100))
  });

  const metrics = await publicProfileMetrics(profiles.map((profile) => profile.id));
  const mapped = profiles.map((profile) => mapPublicProfile(profile, {
    streamStatus: streamStatusFromSnapshot(profile),
    fanCardCount: metrics.fanCardCounts.get(profile.id) || 0,
    viewCount: metrics.viewCounts.get(profile.id) || 0,
    favoriteCount: metrics.favoriteCounts.get(profile.id) || 0
  }));
  const filtered = mapped.filter((profile) => {
    if (status === 'live') return profile.isLive;
    if (status === 'offline') return !profile.isLive;
    return true;
  });

  if (sort === 'popular') {
    filtered.sort((a, b) => Number(b.isLive) - Number(a.isLive)
      || b.viewerCount - a.viewerCount
      || b.viewCount - a.viewCount
      || b.fanCardCount - a.fanCardCount
      || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      || a.name.localeCompare(b.name));
  }

  return filtered.slice(0, limit);
}

async function getPublicStreamer(slug) {
  const profile = await prisma.streamerProfile.findFirst({
    where: {
      slug,
      isPublic: true,
      user: {
        status: 'ACTIVE',
        role: { in: ['STREAMER', 'ADMIN'] }
      }
    },
    include: includePublicProfile
  });
  if (!profile) return null;
  const metrics = await publicProfileMetrics([profile.id]);
  return mapPublicProfile(profile, {
    streamStatus: streamStatusFromSnapshot(profile),
    fanCardCount: metrics.fanCardCounts.get(profile.id) || 0,
    viewCount: metrics.viewCounts.get(profile.id) || 0,
    favoriteCount: metrics.favoriteCounts.get(profile.id) || 0
  });
}

async function getRawProfileByUser(userId) {
  return prisma.streamerProfile.findUnique({
    where: { userId },
    include: {
      socialLinks: { orderBy: { sortOrder: 'asc' } },
      schedule: { orderBy: { dayOfWeek: 'asc' } },
      user: {
        select: {
          id: true,
          role: true,
          status: true,
          twitchUserId: true,
          twitchLogin: true,
          twitchAccessTokenEnc: true,
          twitchRefreshTokenEnc: true,
          twitchTokenExpiresAt: true
        }
      }
    }
  });
}

async function uniqueProfileSlug(baseValue, excludeProfileId = null) {
  const base = slugify(baseValue);
  let candidate = base;
  let index = 2;

  while (await prisma.streamerProfile.findFirst({
    where: {
      slug: candidate,
      ...(excludeProfileId ? { NOT: { id: excludeProfileId } } : {})
    },
    select: { id: true }
  })) {
    candidate = `${base}-${index}`;
    index += 1;
  }

  return candidate;
}

async function ensureRawProfileForUser(user) {
  const existing = await getRawProfileByUser(user.id);
  if (existing) return existing;

  const emailName = String(user.email || '').split('@')[0];
  const displayName = user.displayName || user.twitchLogin || emailName || '새 스트리머';
  const slug = await uniqueProfileSlug(user.twitchLogin || displayName || user.id);

  await prisma.streamerProfile.create({
    data: {
      userId: user.id,
      slug,
      name: displayName,
      handle: user.twitchLogin ? `@${user.twitchLogin}` : `@${slug.replace(/-/g, '_')}`,
      subtitle: '',
      mainContent: '',
      language: '',
      isPublic: false
    }
  });

  return getRawProfileByUser(user.id);
}

function privateProfile(profile) {
  if (!profile) return null;
  const { user: _user, ...safeProfile } = profile;
  return safeProfile;
}

function normalizeSocialLinks(input = []) {
  return input
    .filter((item) => item?.type && item?.url)
    .slice(0, 12)
    .map((item, index) => ({
      type: item.type,
      label: item.label || item.type,
      url: normalizeUrl(item.url),
      isVisible: item.isVisible !== false,
      sortOrder: Number.isInteger(item.sortOrder) ? item.sortOrder : index
    }))
    .filter((item) => item.url);
}

module.exports = {
  includePublicProfile,
  mapPublicProfile,
  listPublicStreamers,
  getPublicStreamer,
  getRawProfileByUser,
  uniqueProfileSlug,
  ensureRawProfileForUser,
  privateProfile,
  normalizeSocialLinks,
  mapSchedule,
  mapLinks,
  mapFanCards
};
