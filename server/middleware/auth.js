const { prisma } = require('../db/prisma');
const { sendError } = require('../utils/httpError');

async function loadSessionUser(req, _res, next) {
  try {
    if (!req.session?.userId) return next();

    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
      include: { streamerProfile: true }
    });

    if (!user || user.status !== 'ACTIVE') {
      req.session.destroy(() => next());
      return;
    }

    req.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return sendError(res, 401, '로그인이 필요합니다.', 'AUTH_REQUIRED');
  }
  return next();
}

function requireStreamer(req, res, next) {
  if (!req.user) {
    return sendError(res, 401, '로그인이 필요합니다.', 'AUTH_REQUIRED');
  }

  if (!['STREAMER', 'ADMIN'].includes(req.user.role)) {
    return sendError(res, 403, '스트리머 권한이 필요합니다.', 'STREAMER_REQUIRED');
  }
  return next();
}

module.exports = { loadSessionUser, requireAuth, requireStreamer };
