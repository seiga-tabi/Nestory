const bcrypt = require('bcrypt');
const { prisma } = require('../db/prisma');
const { hashToken, randomToken } = require('../utils/crypto');
const { createHttpError } = require('../utils/httpError');
const { sanitizeText } = require('../utils/sanitize');
const { sendMail } = require('./mail.service');
const { env } = require('../config/env');

const PASSWORD_SETUP_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 3;

function publicRole(role) {
  return role === 'VIEWER' ? 'USER' : role;
}

function defaultPageForRole(role) {
  return ['STREAMER', 'ADMIN'].includes(role) ? 'dashboard.html' : 'viewer-stats.html';
}

function publicUser(user) {
  if (!user) return null;
  const defaultPage = defaultPageForRole(user.role);
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: publicRole(user.role),
    dbRole: user.role,
    isAdmin: user.role === 'ADMIN',
    isStreamer: ['STREAMER', 'ADMIN'].includes(user.role),
    defaultPage,
    homePage: defaultPage,
    status: user.status,
    passwordSetupRequired: Boolean(user.passwordSetupRequired),
    twitchLogin: user.twitchLogin || null
  };
}

function publicProfile(profile) {
  if (!profile) return null;
  return {
    id: profile.id,
    slug: profile.slug,
    name: profile.name,
    handle: profile.handle,
    subtitle: profile.subtitle,
    avatarUrl: profile.avatarUrl,
    isPublic: profile.isPublic
  };
}

async function login({ email, password }) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { streamerProfile: true }
  });

  if (!user || user.status !== 'ACTIVE') {
    return null;
  }

  if (user.passwordSetupRequired || !user.passwordHash) {
    return {
      requiresPasswordSetup: true,
      user,
      response: {
        passwordSetupRequired: true,
        user: publicUser(user),
        role: publicRole(user.role),
        isAdmin: user.role === 'ADMIN'
      }
    };
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;

  return {
    user,
    response: {
      user: publicUser(user),
      role: publicRole(user.role),
      isAdmin: user.role === 'ADMIN',
      streamerProfile: publicProfile(user.streamerProfile)
    }
  };
}

async function register({ email, password, confirmPassword, displayName }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (password !== confirmPassword) {
    throw createHttpError(400, '비밀번호 확인이 일치하지 않습니다.', 'PASSWORD_CONFIRM_MISMATCH');
  }
  assertPasswordStrength(password);

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true }
  });
  if (existing) {
    throw createHttpError(409, '이미 가입된 이메일입니다.', 'EMAIL_ALREADY_REGISTERED');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const safeDisplayName = sanitizeText(displayName, 80) || normalizedEmail.split('@')[0] || '사용자';
  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      passwordHash,
      passwordSetupRequired: false,
      displayName: safeDisplayName,
      role: 'VIEWER',
      status: 'ACTIVE'
    },
    include: { streamerProfile: true }
  });

  return {
    user,
    response: {
      user: publicUser(user),
      role: publicRole(user.role),
      isAdmin: false,
      streamerProfile: null
    }
  };
}

async function forgotPassword(email) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || user.status !== 'ACTIVE' || user.passwordSetupRequired || !user.passwordHash) return;

  const token = randomToken(32);
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60);

  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, purpose: 'RESET', expiresAt }
  });

  const resetUrl = `${env.PUBLIC_BASE_URL}/forgot-password.html?token=${encodeURIComponent(token)}`;
  await sendMail({
    to: user.email,
    subject: '[Seiga Studio] 비밀번호 재설정',
    text: `비밀번호 재설정 링크입니다. 1시간 안에 사용해주세요.\n${resetUrl}`
  });
}

async function resetPassword({ token, password }) {
  const tokenHash = hashToken(token);
  const reset = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true }
  });
  if (
    !reset
    || reset.purpose !== 'RESET'
    || reset.usedAt
    || reset.expiresAt < new Date()
    || reset.user.status !== 'ACTIVE'
  ) return false;

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: reset.userId },
      data: { passwordHash, passwordSetupRequired: false }
    }),
    prisma.passwordResetToken.update({ where: { id: reset.id }, data: { usedAt: new Date() } })
  ]);

  return true;
}

function assertPasswordStrength(password) {
  if (String(password || '').length < 8) {
    throw createHttpError(400, '비밀번호는 8자 이상이어야 합니다.', 'WEAK_PASSWORD');
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw createHttpError(400, '비밀번호에는 영문자와 숫자가 모두 포함되어야 합니다.', 'WEAK_PASSWORD');
  }
}

function passwordSetupUrl(token) {
  return `${env.PUBLIC_BASE_URL}/password-setup.html?token=${encodeURIComponent(token)}`;
}

async function issuePasswordSetupToken(userId, client = prisma) {
  const token = randomToken(32);
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + PASSWORD_SETUP_TOKEN_TTL_MS);
  const now = new Date();

  await client.passwordResetToken.updateMany({
    where: {
      userId,
      purpose: 'PASSWORD_SETUP',
      usedAt: null
    },
    data: { usedAt: now }
  });

  await client.passwordResetToken.create({
    data: {
      userId,
      tokenHash,
      purpose: 'PASSWORD_SETUP',
      expiresAt
    }
  });

  return {
    token,
    expiresAt,
    setupUrl: passwordSetupUrl(token)
  };
}

async function getValidPasswordSetupToken(token) {
  const tokenHash = hashToken(token);
  const setup = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true }
  });

  if (
    !setup
    || setup.purpose !== 'PASSWORD_SETUP'
    || setup.usedAt
    || setup.expiresAt < new Date()
    || setup.user.status !== 'ACTIVE'
    || !setup.user.passwordSetupRequired
  ) {
    return null;
  }

  return setup;
}

async function getPasswordSetupStatus(token) {
  const setup = await getValidPasswordSetupToken(token);
  if (!setup) return null;
  return {
    ok: true,
    email: setup.user.email,
    displayName: setup.user.displayName,
    expiresAt: setup.expiresAt
  };
}

async function completePasswordSetup({ token, password, confirmPassword }) {
  if (password !== confirmPassword) {
    throw createHttpError(400, '비밀번호 확인이 일치하지 않습니다.', 'PASSWORD_CONFIRM_MISMATCH');
  }
  assertPasswordStrength(password);

  const setup = await getValidPasswordSetupToken(token);
  if (!setup) {
    throw createHttpError(400, '비밀번호 설정 링크가 유효하지 않거나 만료되었습니다.', 'INVALID_PASSWORD_SETUP_TOKEN');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: setup.userId },
      data: {
        passwordHash,
        passwordSetupRequired: false,
        status: 'ACTIVE'
      }
    });

    await tx.passwordResetToken.updateMany({
      where: {
        userId: setup.userId,
        purpose: 'PASSWORD_SETUP',
        usedAt: null
      },
      data: { usedAt: now }
    });
  });

  return { ok: true };
}

module.exports = {
  register,
  login,
  forgotPassword,
  resetPassword,
  issuePasswordSetupToken,
  getPasswordSetupStatus,
  completePasswordSetup,
  publicRole,
  defaultPageForRole,
  publicUser,
  publicProfile
};
