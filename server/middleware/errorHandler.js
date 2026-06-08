const multer = require('multer');
const { Prisma } = require('@prisma/client');
const { env } = require('../config/env');
const {
  normalizeStatus,
  codeForStatus,
  errorPayload,
  sendError
} = require('../utils/httpError');

function notFound(_req, res) {
  return sendError(res, 404, '요청한 리소스를 찾을 수 없습니다.', 'NOT_FOUND');
}

function prismaError(error) {
  if (error instanceof Prisma.PrismaClientInitializationError || ['P1000', 'P1001', 'P1002'].includes(error.code)) {
    return {
      status: 503,
      code: 'DATABASE_UNAVAILABLE',
      message: '데이터베이스에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.'
    };
  }

  if (['P2021', 'P2022'].includes(error.code)) {
    return {
      status: 503,
      code: 'DATABASE_SCHEMA_UNAVAILABLE',
      message: '데이터베이스 스키마가 준비되지 않았습니다. 마이그레이션 상태를 확인해주세요.'
    };
  }

  if (error.code === 'P2002') {
    return {
      status: 409,
      code: 'RESOURCE_CONFLICT',
      message: '이미 사용 중인 값입니다.',
      details: { fields: error.meta?.target || [] }
    };
  }

  if (error.code === 'P2025') {
    return {
      status: 404,
      code: 'NOT_FOUND',
      message: '요청한 리소스를 찾을 수 없습니다.'
    };
  }

  return null;
}

function multerError(error) {
  if (!(error instanceof multer.MulterError)) return null;

  if (error.code === 'LIMIT_FILE_SIZE') {
    return {
      status: 413,
      code: 'UPLOAD_TOO_LARGE',
      message: '업로드 이미지 크기가 너무 큽니다.'
    };
  }

  return {
    status: 400,
    code: 'UPLOAD_ERROR',
    message: '파일 업로드 요청을 확인해주세요.'
  };
}

function normalizeError(error) {
  const mapped = multerError(error) || prismaError(error);
  if (mapped) return mapped;

  const status = normalizeStatus(error.status || error.statusCode);
  return {
    status,
    code: error.apiCode || codeForStatus(status),
    message: error.message,
    details: error.details
  };
}

function errorHandler(error, _req, res, next) {
  if (res.headersSent) return next(error);

  const normalized = normalizeError(error);
  const status = normalizeStatus(normalized.status);
  const hasExplicitCode = Boolean(normalized.code && normalized.code !== 'INTERNAL_SERVER_ERROR');
  const safeMessage = status >= 500 && !hasExplicitCode ? '서버 오류가 발생했습니다.' : normalized.message;
  const payload = errorPayload(
    status,
    safeMessage,
    normalized.code,
    normalized.details,
    !env.isProduction && status >= 500 ? error.message : undefined
  );

  if (!env.isProduction && status >= 500 && normalized.message !== safeMessage) {
    payload.details = {
      ...(payload.details || {}),
      reason: normalized.message
    };
  }

  res.status(status).json(payload);
}

module.exports = { notFound, errorHandler };
