const { prisma } = require('../db/prisma');
const { sanitizeText } = require('../utils/sanitize');
const { hashVisitor } = require('../utils/crypto');
const { createHttpError } = require('../utils/httpError');

async function createFanCard(profile, body, req) {
  const message = sanitizeText(body.message, 1500);
  if (!message) {
    throw createHttpError(400, '메시지를 입력해주세요.', 'FAN_CARD_MESSAGE_REQUIRED');
  }

  const senderName = sanitizeText(body.senderName, 40) || null;
  const emoji = sanitizeText(body.emoji, 8) || null;
  const ipHash = hashVisitor(`${req.ip || ''}:${req.headers['user-agent'] || ''}`);

  return prisma.fanCard.create({
    data: {
      profileId: profile.id,
      senderName,
      message,
      emoji,
      isPublic: body.isPublic !== false,
      status: 'PENDING',
      ipHash
    }
  });
}

async function listFanCards(profileId, query = {}) {
  const status = query.status && query.status !== 'all' ? query.status : undefined;
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);

  const where = { profileId, status: { not: 'DELETED' } };
  if (status) where.status = status;

  const baseWhere = { profileId, status: { not: 'DELETED' } };
  const [items, total, pending, approved, hidden] = await Promise.all([
    prisma.fanCard.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit
    }),
    prisma.fanCard.count({ where: baseWhere }),
    prisma.fanCard.count({ where: { ...baseWhere, status: 'PENDING' } }),
    prisma.fanCard.count({ where: { ...baseWhere, status: 'APPROVED' } }),
    prisma.fanCard.count({ where: { ...baseWhere, status: 'HIDDEN' } })
  ]);

  return {
    items,
    total,
    counts: {
      all: total,
      pending,
      approved,
      hidden
    },
    page,
    limit
  };
}

module.exports = { createFanCard, listFanCards };
