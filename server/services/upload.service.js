const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { env } = require('../config/env');
const { createHttpError } = require('../utils/httpError');

const avatarDir = path.join(env.uploadDirAbs, 'avatars');
fs.mkdirSync(avatarDir, { recursive: true });

const MAX_AVATAR_BYTES = Math.round(env.MAX_AVATAR_UPLOAD_MB * 1024 * 1024);
const allowedImages = {
  jpeg: { mime: 'image/jpeg', extensions: new Set(['.jpg', '.jpeg']) },
  png: { mime: 'image/png', extensions: new Set(['.png']) },
  webp: { mime: 'image/webp', extensions: new Set(['.webp']) }
};
const allowedExt = new Set(Object.values(allowedImages).flatMap((item) => Array.from(item.extensions)));
const allowedMime = new Set(Object.values(allowedImages).map((item) => item.mime));

const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, avatarDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  }
});

function imageFilter(_req, file, cb) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!allowedExt.has(ext) || !allowedMime.has(file.mimetype)) {
    return cb(createHttpError(415, 'jpg, jpeg, png, webp 이미지만 업로드할 수 있습니다.', 'UNSUPPORTED_IMAGE_TYPE'));
  }
  return cb(null, true);
}

const avatarUpload = multer({
  storage: avatarStorage,
  fileFilter: imageFilter,
  limits: { fileSize: MAX_AVATAR_BYTES, files: 1 }
});

function detectImageType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }

  if (
    buffer.length >= 8
    && buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4e
    && buffer[3] === 0x47
    && buffer[4] === 0x0d
    && buffer[5] === 0x0a
    && buffer[6] === 0x1a
    && buffer[7] === 0x0a
  ) {
    return 'png';
  }

  if (
    buffer.length >= 12
    && buffer.toString('ascii', 0, 4) === 'RIFF'
    && buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }

  return null;
}

async function validateUploadedAvatar(file) {
  if (!file) {
    throw createHttpError(400, '업로드할 이미지를 선택해주세요.', 'UPLOAD_FILE_REQUIRED');
  }

  const ext = path.extname(file.originalname || '').toLowerCase();
  const buffer = Buffer.alloc(16);
  const handle = await fs.promises.open(file.path, 'r');
  try {
    await handle.read(buffer, 0, buffer.length, 0);
  } finally {
    await handle.close();
  }

  const type = detectImageType(buffer);
  const expected = type ? allowedImages[type] : null;
  const isValid = expected
    && expected.mime === file.mimetype
    && expected.extensions.has(ext)
    && file.size <= MAX_AVATAR_BYTES;

  if (!isValid) {
    await fs.promises.unlink(file.path).catch(() => {});
    throw createHttpError(415, '유효한 jpg, jpeg, png, webp 이미지만 업로드할 수 있습니다.', 'INVALID_IMAGE_CONTENT');
  }
}

function removeUpload(publicPath) {
  if (!publicPath || !publicPath.startsWith('/uploads/avatars/')) return;
  const fullPath = path.join(env.uploadDirAbs, publicPath.replace('/uploads/', ''));
  fs.promises.unlink(fullPath).catch(() => {});
}

module.exports = { avatarUpload, validateUploadedAvatar, removeUpload, MAX_AVATAR_BYTES };
