const { STATUS_CODES } = require('http');

function normalizeStatus(status) {
  const value = Number(status);
  if (!Number.isInteger(value) || value < 400 || value > 599) return 500;
  return value;
}

function codeForStatus(status) {
  if (status === 400) return 'BAD_REQUEST';
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 413) return 'PAYLOAD_TOO_LARGE';
  if (status === 415) return 'UNSUPPORTED_MEDIA_TYPE';
  if (status === 422) return 'VALIDATION_ERROR';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 503) return 'SERVICE_UNAVAILABLE';
  return status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR';
}

function errorPayload(status, message, code, details, debug) {
  const payload = {
    ok: false,
    code: code || codeForStatus(status),
    message: message || STATUS_CODES[status] || 'Request failed'
  };

  if (details !== undefined) payload.details = details;
  if (debug !== undefined) payload.debug = debug;
  return payload;
}

function createHttpError(status, message, code, details) {
  const error = new Error(message || STATUS_CODES[normalizeStatus(status)] || 'Request failed');
  error.status = normalizeStatus(status);
  error.apiCode = code || codeForStatus(error.status);
  if (details !== undefined) error.details = details;
  return error;
}

function sendError(res, status, message, code, details) {
  const normalizedStatus = normalizeStatus(status);
  return res
    .status(normalizedStatus)
    .json(errorPayload(normalizedStatus, message, code, details));
}

module.exports = {
  normalizeStatus,
  codeForStatus,
  errorPayload,
  createHttpError,
  sendError
};
