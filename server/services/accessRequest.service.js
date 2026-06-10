const { prisma } = require('../db/prisma');
const { env } = require('../config/env');
const { createHttpError } = require('../utils/httpError');
const { sanitizeText, normalizeUrl } = require('../utils/sanitize');
const { slugify } = require('../utils/slug');
const { sendMail } = require('./mail.service');
const { issuePasswordSetupToken } = require('./auth.service');
const { uniqueProfileSlug } = require('./streamer.service');

const VALID_STATUSES = new Set(['PENDING', 'APPROVED', 'REJECTED']);

function normalizeStatus(value) {
  const status = String(value || '').trim().toUpperCase();
  return VALID_STATUSES.has(status) ? status : undefined;
}

function publicAccessRequest(item) {
  if (!item) return null;
  return {
    id: item.id,
    status: item.status.toLowerCase(),
    createdAt: item.createdAt,
    reviewedAt: item.reviewedAt,
    approvedAt: item.approvedAt,
    rejectedAt: item.rejectedAt
  };
}

function adminAccessRequestListItem(item) {
  return {
    id: item.id,
    name: item.name,
    email: item.email,
    twitchUrl: item.twitchUrl,
    status: item.status.toLowerCase(),
    createdAt: item.createdAt,
    reviewedAt: item.reviewedAt,
    approvedAt: item.approvedAt,
    approvedById: item.approvedById,
    rejectedAt: item.rejectedAt,
    rejectedById: item.rejectedById
  };
}

function adminAccessRequestDetail(item) {
  return {
    ...adminAccessRequestListItem(item),
    message: item.message,
    rejectionReason: item.rejectionReason
  };
}

async function createAccessRequest(body, user = null) {
  const name = sanitizeText(body.name || user?.displayName, 80);
  const email = String(user?.email || body.email || '').trim().toLowerCase();
  const twitchLogin = user?.twitchLogin ? `https://twitch.tv/${user.twitchLogin}` : null;
  const twitchUrl = normalizeUrl(body.twitchUrl || twitchLogin) || null;
  const message = sanitizeText(body.message, 1000) || null;

  if (!name || !/^\S+@\S+\.\S+$/.test(email)) {
    throw createHttpError(400, '이름과 이메일을 확인해주세요.', 'INVALID_ACCESS_REQUEST');
  }

  if (user && ['STREAMER', 'ADMIN'].includes(user.role)) {
    throw createHttpError(409, '이미 스트리머 권한이 있습니다.', 'ACCESS_REQUEST_ALREADY_APPROVED');
  }

  const existing = await prisma.accessRequest.findFirst({
    where: {
      email,
      status: { in: ['PENDING', 'APPROVED'] }
    },
    select: { id: true, status: true }
  });
  if (existing?.status === 'PENDING') {
    throw createHttpError(409, '이미 검토 대기 중인 신청이 있습니다.', 'ACCESS_REQUEST_ALREADY_PENDING');
  }
  if (existing?.status === 'APPROVED') {
    throw createHttpError(409, '이미 승인된 신청이 있습니다.', 'ACCESS_REQUEST_ALREADY_APPROVED');
  }

  const item = await prisma.accessRequest.create({
    data: { name, email, twitchUrl, message }
  });

  return publicAccessRequest(item);
}

async function getMyAccessRequestStatus(user) {
  if (!user) return null;

  if (['STREAMER', 'ADMIN'].includes(user.role)) {
    return {
      status: 'approved',
      item: null,
      canApply: false,
      role: user.role === 'ADMIN' ? 'ADMIN' : 'STREAMER'
    };
  }

  const item = await prisma.accessRequest.findFirst({
    where: { email: String(user.email || '').trim().toLowerCase() },
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
  const status = item?.status?.toLowerCase() || 'not_requested';

  return {
    status,
    item: publicAccessRequest(item),
    canApply: !item || item.status === 'REJECTED',
    role: 'USER'
  };
}

async function listAccessRequests(query = {}) {
  const status = normalizeStatus(query.status);
  const items = await prisma.accessRequest.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      email: true,
      twitchUrl: true,
      message: true,
      status: true,
      createdAt: true,
      reviewedAt: true,
      approvedAt: true,
      approvedById: true,
      rejectedAt: true,
      rejectedById: true,
      rejectionReason: true
    },
    take: 200
  });

  return items.map(adminAccessRequestDetail);
}

async function getAccessRequest(id) {
  const item = await prisma.accessRequest.findUnique({ where: { id } });
  if (!item) throw createHttpError(404, '승인 요청을 찾을 수 없습니다.', 'ACCESS_REQUEST_NOT_FOUND');
  return adminAccessRequestDetail(item);
}

function assertPending(request) {
  if (request.status === 'APPROVED') {
    throw createHttpError(409, '이미 승인된 요청입니다.', 'ACCESS_REQUEST_ALREADY_APPROVED');
  }
  if (request.status === 'REJECTED') {
    throw createHttpError(409, '이미 거절된 요청입니다.', 'ACCESS_REQUEST_ALREADY_REJECTED');
  }
}

async function approveAccessRequest(id, adminUser) {
  const request = await prisma.accessRequest.findUnique({ where: { id } });
  if (!request) throw createHttpError(404, '승인 요청을 찾을 수 없습니다.', 'ACCESS_REQUEST_NOT_FOUND');
  assertPending(request);

  const safeName = sanitizeText(request.name, 80);
  const baseSlug = slugify(safeName || request.email);
  const profileSlug = await uniqueProfileSlug(baseSlug);
  const now = new Date();
  const existingUser = await prisma.user.findUnique({
    where: { email: request.email.toLowerCase() },
    select: {
      id: true,
      passwordHash: true,
      passwordSetupRequired: true,
      status: true
    }
  });
  const requiresPasswordSetup = !existingUser
    || existingUser.passwordSetupRequired
    || existingUser.status !== 'ACTIVE'
    || !existingUser.passwordHash;

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { email: request.email.toLowerCase() },
      update: {
        role: 'STREAMER',
        status: 'ACTIVE',
        displayName: safeName,
        ...(requiresPasswordSetup ? { passwordSetupRequired: true } : {})
      },
      create: {
        email: request.email.toLowerCase(),
        passwordHash: null,
        passwordSetupRequired: true,
        displayName: safeName,
        role: 'STREAMER',
        status: 'ACTIVE'
      }
    });

    const existing = await tx.streamerProfile.findUnique({ where: { userId: user.id } });
    if (existing) {
      await tx.streamerProfile.update({
        where: { id: existing.id },
        data: {
          name: existing.name || safeName,
          handle: existing.handle || `@${baseSlug.replace(/-/g, '_')}`,
          isPublic: true
        }
      });
    } else {
      await tx.streamerProfile.create({
        data: {
          userId: user.id,
          slug: profileSlug,
          name: safeName,
          handle: `@${baseSlug.replace(/-/g, '_')}`,
          subtitle: 'Seiga Studio 승인 스트리머',
          mainContent: '잡담',
          language: 'KR/JA',
          isPublic: true,
          socialLinks: request.twitchUrl ? {
            create: {
              type: 'TWITCH',
              label: 'Twitch',
              url: request.twitchUrl,
              sortOrder: 0
            }
          } : undefined
        }
      });
    }

    const passwordSetup = requiresPasswordSetup
      ? await issuePasswordSetupToken(user.id, tx)
      : null;

    const accessRequest = await tx.accessRequest.update({
      where: { id: request.id },
      data: {
        status: 'APPROVED',
        reviewedAt: now,
        approvedAt: now,
        approvedById: adminUser.id,
        rejectedAt: null,
        rejectedById: null,
        rejectionReason: null
      }
    });

    return { user, accessRequest, passwordSetup };
  });

  await sendMail({
    to: result.user.email,
    subject: '[Seiga Studio] 스트리머 계정 승인',
    text: result.passwordSetup
      ? `계정이 승인되었습니다.\n로그인 이메일: ${result.user.email}\n비밀번호 설정 링크: ${result.passwordSetup.setupUrl}\n이 링크는 ${result.passwordSetup.expiresAt.toISOString()}까지 사용할 수 있습니다.`
      : `스트리머 권한이 승인되었습니다.\n로그인 이메일: ${result.user.email}\n기존 로그인 방식으로 다시 접속해주세요.`
  });

  const shouldExposeSetupUrl = Boolean(result.passwordSetup)
    && (!env.isProduction || !env.SMTP_HOST || !env.SMTP_PORT);

  return {
    item: adminAccessRequestDetail(result.accessRequest),
    user: {
      id: result.user.id,
      email: result.user.email,
      displayName: result.user.displayName,
      role: result.user.role,
      status: result.user.status,
      passwordSetupRequired: Boolean(result.user.passwordSetupRequired)
    },
    passwordSetup: result.passwordSetup ? {
      required: true,
      expiresAt: result.passwordSetup.expiresAt,
      delivery: shouldExposeSetupUrl ? 'admin_copy' : 'email',
      setupUrl: shouldExposeSetupUrl ? result.passwordSetup.setupUrl : undefined
    } : { required: false }
  };
}

async function rejectAccessRequest(id, adminUser, body = {}) {
  const request = await prisma.accessRequest.findUnique({ where: { id } });
  if (!request) throw createHttpError(404, '승인 요청을 찾을 수 없습니다.', 'ACCESS_REQUEST_NOT_FOUND');
  assertPending(request);

  const now = new Date();
  const item = await prisma.accessRequest.update({
    where: { id: request.id },
    data: {
      status: 'REJECTED',
      reviewedAt: now,
      rejectedAt: now,
      rejectedById: adminUser.id,
      rejectionReason: sanitizeText(body.reason, 500) || null
    }
  });

  return adminAccessRequestDetail(item);
}

module.exports = {
  createAccessRequest,
  getMyAccessRequestStatus,
  listAccessRequests,
  getAccessRequest,
  approveAccessRequest,
  rejectAccessRequest
};
