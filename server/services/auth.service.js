const bcrypt = require('bcrypt');
const { prisma } = require('../db/prisma');
const { hashToken, randomToken } = require('../utils/crypto');
const { sendMail } = require('./mail.service');
const { env } = require('../config/env');

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
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

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;

  return {
    user,
    response: {
      user: publicUser(user),
      role: user.role,
      streamerProfile: publicProfile(user.streamerProfile)
    }
  };
}

async function forgotPassword(email) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || user.status !== 'ACTIVE') return;

  const token = randomToken(32);
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60);

  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt }
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
  const reset = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!reset || reset.usedAt || reset.expiresAt < new Date()) return false;

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.$transaction([
    prisma.user.update({ where: { id: reset.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: reset.id }, data: { usedAt: new Date() } })
  ]);

  return true;
}

module.exports = { login, forgotPassword, resetPassword, publicUser, publicProfile };
