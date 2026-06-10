const { prisma } = require('../db/prisma');
const { createHttpError } = require('../utils/httpError');

const publicFavoriteProfileWhere = (slug) => ({
  slug,
  isPublic: true,
  user: {
    status: 'ACTIVE',
    role: { in: ['STREAMER', 'ADMIN'] }
  }
});

const publicFavoriteProfileByIdWhere = (id) => ({
  id,
  isPublic: true,
  user: {
    status: 'ACTIVE',
    role: { in: ['STREAMER', 'ADMIN'] }
  }
});

async function getFavoriteTargetBySlug(slug) {
  const profile = await prisma.streamerProfile.findFirst({
    where: publicFavoriteProfileWhere(slug),
    select: {
      id: true,
      slug: true,
      name: true,
      handle: true
    }
  });

  if (!profile) {
    throw createHttpError(404, '스트리머를 찾을 수 없습니다.', 'STREAMER_NOT_FOUND');
  }

  return profile;
}

async function getFavoriteTargetById(id) {
  const profile = await prisma.streamerProfile.findFirst({
    where: publicFavoriteProfileByIdWhere(id),
    select: {
      id: true,
      slug: true,
      name: true,
      handle: true
    }
  });

  if (!profile) {
    throw createHttpError(404, '스트리머를 찾을 수 없습니다.', 'STREAMER_NOT_FOUND');
  }

  return profile;
}

function publicFavoriteResponse(profile, favorited, favoriteCount) {
  return {
    ok: true,
    favorited,
    isFavorite: favorited,
    favoriteCount,
    streamer: {
      id: profile.id,
      slug: profile.slug,
      name: profile.name,
      handle: profile.handle
    }
  };
}

async function favoriteCount(streamerProfileId) {
  return prisma.favorite.count({ where: { streamerProfileId } });
}

async function favoriteStatus(userId, slug) {
  const profile = await getFavoriteTargetBySlug(slug);
  return favoriteStatusForProfile(userId, profile);
}

async function favoriteStatusById(userId, streamerProfileId) {
  const profile = await getFavoriteTargetById(streamerProfileId);
  return favoriteStatusForProfile(userId, profile);
}

async function favoriteStatusForProfile(userId, profile) {
  const favorite = await prisma.favorite.findUnique({
    where: {
      userId_streamerProfileId: {
        userId,
        streamerProfileId: profile.id
      }
    },
    select: { id: true }
  });

  return publicFavoriteResponse(profile, Boolean(favorite), await favoriteCount(profile.id));
}

async function addFavorite(userId, slug) {
  const profile = await getFavoriteTargetBySlug(slug);
  return addFavoriteForProfile(userId, profile);
}

async function addFavoriteById(userId, streamerProfileId) {
  const profile = await getFavoriteTargetById(streamerProfileId);
  return addFavoriteForProfile(userId, profile);
}

async function addFavoriteForProfile(userId, profile) {
  await prisma.favorite.upsert({
    where: {
      userId_streamerProfileId: {
        userId,
        streamerProfileId: profile.id
      }
    },
    create: {
      userId,
      streamerProfileId: profile.id
    },
    update: {}
  });

  return publicFavoriteResponse(profile, true, await favoriteCount(profile.id));
}

async function removeFavorite(userId, slug) {
  const profile = await getFavoriteTargetBySlug(slug);
  return removeFavoriteForProfile(userId, profile);
}

async function removeFavoriteById(userId, streamerProfileId) {
  const profile = await getFavoriteTargetById(streamerProfileId);
  return removeFavoriteForProfile(userId, profile);
}

async function removeFavoriteForProfile(userId, profile) {
  await prisma.favorite.deleteMany({
    where: {
      userId,
      streamerProfileId: profile.id
    }
  });

  return publicFavoriteResponse(profile, false, await favoriteCount(profile.id));
}

async function listFavorites(userId) {
  const items = await prisma.favorite.findMany({
    where: {
      userId,
      streamerProfile: {
        isPublic: true,
        user: {
          status: 'ACTIVE',
          role: { in: ['STREAMER', 'ADMIN'] }
        }
      }
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      createdAt: true,
      streamerProfile: {
        select: {
          id: true,
          slug: true,
          name: true,
          handle: true,
          avatarUrl: true,
          coverImageUrl: true,
          mainContent: true,
          language: true
        }
      }
    }
  });

  return items.map((item) => ({
    id: item.id,
    createdAt: item.createdAt,
    streamer: item.streamerProfile
  }));
}

async function isFavoritedByProfileId(userId, streamerProfileId) {
  if (!userId || !streamerProfileId) return false;
  const favorite = await prisma.favorite.findUnique({
    where: {
      userId_streamerProfileId: {
        userId,
        streamerProfileId
      }
    },
    select: { id: true }
  });
  return Boolean(favorite);
}

module.exports = {
  favoriteStatus,
  favoriteStatusById,
  addFavorite,
  addFavoriteById,
  removeFavorite,
  removeFavoriteById,
  listFavorites,
  favoriteCount,
  isFavoritedByProfileId
};
