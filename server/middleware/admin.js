const { sendError } = require('../utils/httpError');

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'ADMIN') {
    return sendError(res, 403, '관리자 권한이 필요합니다.', 'ADMIN_REQUIRED');
  }
  return next();
}

module.exports = { requireAdmin };
