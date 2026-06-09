const { sendError } = require('../utils/httpError');

function requireAdmin(req, res, next) {
  if (!req.user) {
    return sendError(res, 401, '로그인이 필요합니다.', 'AUTH_REQUIRED');
  }

  if (req.user.role !== 'ADMIN') {
    return sendError(res, 403, '관리자 권한이 필요합니다.', 'ADMIN_REQUIRED');
  }
  return next();
}

module.exports = { requireAdmin };
