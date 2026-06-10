const express = require('express');
const { z } = require('zod');
const { prisma } = require('../db/prisma');
const { requireStreamer } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { asyncHandler } = require('../utils/asyncHandler');
const { sendError } = require('../utils/httpError');
const { ensureRawProfileForUser, privateProfile } = require('../services/streamer.service');
const { updateProfileCard } = require('../services/profileCard.service');
const {
  avatarUpload,
  coverUpload,
  validateUploadedAvatar,
  validateUploadedImage,
  removeUpload
} = require('../services/upload.service');

const router = express.Router();

const profileSchema = z.object({
  body: z.object({
    name: z.string().max(80),
    handle: z.string().max(80),
    subtitle: z.string().max(180),
    mainContent: z.string().max(80),
    language: z.string().max(40).optional().default('KR/JA'),
    avatarUrl: z.string().optional().nullable(),
    coverImageUrl: z.string().max(500).optional().nullable(),
    cardDesign: z.string().optional().default('CLEAN_WHITE'),
    mainColor: z.string().max(20).optional().default('#7c3aed'),
    subColor: z.string().max(20).optional().default('#f9a8d4'),
    isPublic: z.boolean().optional(),
    socialLinks: z.array(z.object({
      type: z.enum(['TWITCH', 'YOUTUBE', 'X', 'DISCORD', 'WEBSITE']),
      label: z.string().max(60).optional(),
      url: z.string().max(500),
      isVisible: z.boolean().optional(),
      sortOrder: z.number().int().optional()
    })).optional().default([]),
    schedule: z.array(z.object({
      dayOfWeek: z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']),
      startTime: z.string().max(12).optional().nullable(),
      title: z.string().max(120).optional().nullable(),
      isActive: z.boolean().optional()
    })).optional().default([])
  }),
  query: z.object({}).passthrough(),
  params: z.object({})
});

router.use(requireStreamer);

router.get('/', asyncHandler(async (req, res) => {
  const profile = await ensureRawProfileForUser(req.user);
  res.json(privateProfile(profile));
}));

router.put('/', validate(profileSchema), asyncHandler(async (req, res) => {
  const profile = await updateProfileCard(req.user, req.validated.body);
  res.json(privateProfile(profile));
}));

router.post('/avatar', avatarUpload.single('avatar'), asyncHandler(async (req, res) => {
  if (!req.file) return sendError(res, 400, '업로드할 이미지를 선택해주세요.', 'UPLOAD_FILE_REQUIRED');
  await validateUploadedAvatar(req.file);

  const avatarUrl = `/uploads/avatars/${req.file.filename}`;
  try {
    const profile = await ensureRawProfileForUser(req.user);
    await prisma.streamerProfile.update({
      where: { id: profile.id },
      data: { avatarUrl }
    });
    removeUpload(profile.avatarUrl);
    res.json({ avatarUrl });
  } catch (error) {
    removeUpload(avatarUrl);
    throw error;
  }
}));

router.post('/cover', coverUpload.single('coverImage'), asyncHandler(async (req, res) => {
  if (!req.file) return sendError(res, 400, '업로드할 배경 이미지를 선택해주세요.', 'UPLOAD_FILE_REQUIRED');
  await validateUploadedImage(req.file);

  const coverImageUrl = `/uploads/covers/${req.file.filename}`;
  try {
    const profile = await ensureRawProfileForUser(req.user);
    await prisma.streamerProfile.update({
      where: { id: profile.id },
      data: { coverImageUrl }
    });
    removeUpload(profile.coverImageUrl);
    res.json({
      coverImageUrl,
      coverImage: coverImageUrl,
      backgroundImageUrl: coverImageUrl,
      backgroundImage: coverImageUrl
    });
  } catch (error) {
    removeUpload(coverImageUrl);
    throw error;
  }
}));

module.exports = { profileCardRoutes: router };
