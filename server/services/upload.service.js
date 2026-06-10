const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { env } = require('../config/env');
const { createHttpError } = require('../utils/httpError');

const avatarDir = path.join(env.uploadDirAbs, 'avatars');
const coverDir = path.join(env.uploadDirAbs, 'covers');
const overlayDir = path.join(env.uploadDirAbs, 'overlays');
fs.mkdirSync(avatarDir, { recursive: true });
fs.mkdirSync(coverDir, { recursive: true });
fs.mkdirSync(overlayDir, { recursive: true });

const MAX_AVATAR_BYTES = Math.round(env.MAX_AVATAR_UPLOAD_MB * 1024 * 1024);
const MAX_OVERLAY_ASSET_BYTES = Math.round(env.MAX_OVERLAY_ASSET_UPLOAD_MB * 1024 * 1024);
const allowedImages = {
  jpeg: { mime: 'image/jpeg', extensions: new Set(['.jpg', '.jpeg']) },
  png: { mime: 'image/png', extensions: new Set(['.png']) },
  webp: { mime: 'image/webp', extensions: new Set(['.webp']) }
};
const allowedOverlayAssets = {
  ...allowedImages,
  gif: { mime: 'image/gif', extensions: new Set(['.gif']) }
};
const allowedExt = new Set(Object.values(allowedImages).flatMap((item) => Array.from(item.extensions)));
const allowedMime = new Set(Object.values(allowedImages).map((item) => item.mime));
const allowedOverlayExt = new Set(Object.values(allowedOverlayAssets).flatMap((item) => Array.from(item.extensions)));
const allowedOverlayMime = new Set(Object.values(allowedOverlayAssets).map((item) => item.mime));

function uploadStorage(uploadDir) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      cb(null, `${crypto.randomUUID()}${ext}`);
    }
  });
}

function imageFilter(_req, file, cb) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!allowedExt.has(ext) || !allowedMime.has(file.mimetype)) {
    return cb(createHttpError(415, 'jpg, jpeg, png, webp 이미지만 업로드할 수 있습니다.', 'UNSUPPORTED_IMAGE_TYPE'));
  }
  return cb(null, true);
}

function overlayAssetFilter(_req, file, cb) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!allowedOverlayExt.has(ext) || !allowedOverlayMime.has(file.mimetype)) {
    return cb(createHttpError(415, 'jpg, jpeg, png, webp, gif 이미지만 업로드할 수 있습니다.', 'UNSUPPORTED_IMAGE_TYPE'));
  }
  return cb(null, true);
}

const avatarUpload = multer({
  storage: uploadStorage(avatarDir),
  fileFilter: imageFilter,
  limits: { fileSize: MAX_AVATAR_BYTES, files: 1 }
});

const coverUpload = multer({
  storage: uploadStorage(coverDir),
  fileFilter: imageFilter,
  limits: { fileSize: MAX_AVATAR_BYTES, files: 1 }
});

const overlayAssetUpload = multer({
  storage: uploadStorage(overlayDir),
  fileFilter: overlayAssetFilter,
  limits: { fileSize: MAX_OVERLAY_ASSET_BYTES, files: 1 }
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

  if (
    buffer.length >= 6
    && ['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6))
  ) {
    return 'gif';
  }

  return null;
}

async function validateUploadedImageFile(file, allowedTypes, maxBytes, message) {
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
  const expected = type ? allowedTypes[type] : null;
  const isValid = expected
    && expected.mime === file.mimetype
    && expected.extensions.has(ext)
    && file.size <= maxBytes;

  if (!isValid) {
    await fs.promises.unlink(file.path).catch(() => {});
    throw createHttpError(415, message, 'INVALID_IMAGE_CONTENT');
  }
}

async function validateUploadedImage(file) {
  return validateUploadedImageFile(
    file,
    allowedImages,
    MAX_AVATAR_BYTES,
    '유효한 jpg, jpeg, png, webp 이미지만 업로드할 수 있습니다.'
  );
}

async function validateUploadedAvatar(file) {
  return validateUploadedImage(file);
}

async function validateUploadedOverlayAsset(file) {
  return validateUploadedImageFile(
    file,
    allowedOverlayAssets,
    MAX_OVERLAY_ASSET_BYTES,
    '유효한 jpg, jpeg, png, webp, gif 이미지만 업로드할 수 있습니다.'
  );
}

function removeUpload(publicPath) {
  if (
    !publicPath
    || (
      !publicPath.startsWith('/uploads/avatars/')
      && !publicPath.startsWith('/uploads/covers/')
      && !publicPath.startsWith('/uploads/overlays/')
    )
  ) return Promise.resolve();
  const relativePath = publicPath.replace('/uploads/', '');
  const fullPath = path.resolve(env.uploadDirAbs, relativePath);
  const uploadRoot = path.resolve(env.uploadDirAbs);
  if (!fullPath.startsWith(`${uploadRoot}${path.sep}`)) return Promise.resolve();
  return fs.promises.unlink(fullPath).catch(() => {});
}

module.exports = {
  avatarUpload,
  coverUpload,
  overlayAssetUpload,
  validateUploadedAvatar,
  validateUploadedImage,
  validateUploadedOverlayAsset,
  removeUpload,
  MAX_AVATAR_BYTES,
  MAX_OVERLAY_ASSET_BYTES
};
