const express = require('express');
const {
  SUPPORTED_LOCALES,
  normalizeLocale,
  resolveLocale,
  setLocaleCookie
} = require('../middleware/locale');
const { sendError } = require('../utils/httpError');

const router = express.Router();

router.get('/locale', (req, res) => {
  const resolved = resolveLocale(req);
  res.json({
    locale: resolved.locale,
    source: resolved.source,
    supportedLocales: SUPPORTED_LOCALES
  });
});

router.post('/locale', (req, res) => {
  const locale = normalizeLocale(req.body?.locale);
  if (!SUPPORTED_LOCALES.includes(locale)) {
    return sendError(res, 400, '지원하지 않는 언어입니다.', 'UNSUPPORTED_LOCALE', {
      supportedLocales: SUPPORTED_LOCALES
    });
  }

  req.session.locale = locale;
  setLocaleCookie(res, locale);
  res.json({
    locale,
    source: 'user',
    supportedLocales: SUPPORTED_LOCALES
  });
});

module.exports = { i18nRoutes: router };
