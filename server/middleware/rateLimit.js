const rateLimit = require('express-rate-limit');
const { sendError } = require('../utils/httpError');

function rateLimitHandler(_req, res) {
  return sendError(res, 429, '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.', 'RATE_LIMITED');
}

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 500,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler
});

const fanCardLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler
});

module.exports = { apiLimiter, authLimiter, fanCardLimiter };
