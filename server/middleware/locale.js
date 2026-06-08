const SUPPORTED_LOCALES = ['ko', 'ja'];
const LOCALE_COOKIE = 'seiga_locale';
const LOCALE_COOKIE_MAX_AGE = 1000 * 60 * 60 * 24 * 365;

function normalizeLocale(value) {
  const text = String(value || '').trim().toLowerCase();
  if (text === 'ko' || text.startsWith('ko-')) return 'ko';
  if (text === 'ja' || text.startsWith('ja-') || text.startsWith('jp')) return 'ja';
  return null;
}

function parseCookies(header = '') {
  return String(header)
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce((cookies, item) => {
      const index = item.indexOf('=');
      if (index === -1) return cookies;
      const key = decodeURIComponent(item.slice(0, index).trim());
      const value = decodeURIComponent(item.slice(index + 1).trim());
      cookies[key] = value;
      return cookies;
    }, {});
}

function localeFromCountry(value) {
  const country = String(value || '').trim().toUpperCase();
  if (country === 'JP') return 'ja';
  if (country === 'KR') return 'ko';
  return null;
}

function localeFromCountryHeaders(req) {
  const headers = [
    ['cf-ip-country', req.get('cf-ipcountry')],
    ['x-vercel-ip-country', req.get('x-vercel-ip-country')],
    ['x-country-code', req.get('x-country-code')],
    ['x-ip-country', req.get('x-ip-country')]
  ];
  const match = headers
    .map(([source, value]) => ({ source, locale: localeFromCountry(value) }))
    .find((item) => item.locale);
  return match || null;
}

function localeFromAcceptLanguage(value = '') {
  const entries = String(value)
    .split(',')
    .map((item) => {
      const [localePart, qPart] = item.trim().split(';');
      const q = qPart?.startsWith('q=') ? Number(qPart.slice(2)) : 1;
      return { locale: normalizeLocale(localePart), q: Number.isFinite(q) ? q : 1 };
    })
    .filter((item) => item.locale)
    .sort((a, b) => b.q - a.q);
  return entries[0]?.locale || null;
}

function localeFromUser(user) {
  return normalizeLocale(user?.locale || user?.preferredLocale || user?.settings?.locale);
}

function resolveLocale(req) {
  const cookies = parseCookies(req.headers.cookie);
  const country = localeFromCountryHeaders(req);
  const candidates = [
    ['query', normalizeLocale(req.query?.lang)],
    ['cookie', normalizeLocale(cookies[LOCALE_COOKIE])],
    ['session', normalizeLocale(req.session?.locale)],
    ['user', localeFromUser(req.user)],
    [country?.source || 'country-header', country?.locale],
    ['accept-language', localeFromAcceptLanguage(req.get('accept-language'))],
    ['fallback', 'ko']
  ];

  const match = candidates.find(([, locale]) => SUPPORTED_LOCALES.includes(locale));
  return { locale: match[1], source: match[0] };
}

function setLocaleCookie(res, locale) {
  res.cookie(LOCALE_COOKIE, locale, {
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: 'lax',
    httpOnly: false
  });
}

function localeMiddleware(req, res, next) {
  const resolved = resolveLocale(req);
  req.locale = resolved.locale;
  req.localeSource = resolved.source;
  res.locals.locale = resolved.locale;
  res.locals.localeSource = resolved.source;

  if (req.query?.lang && SUPPORTED_LOCALES.includes(resolved.locale)) {
    req.session.locale = resolved.locale;
    setLocaleCookie(res, resolved.locale);
  }

  next();
}

module.exports = {
  SUPPORTED_LOCALES,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  normalizeLocale,
  resolveLocale,
  setLocaleCookie,
  localeMiddleware
};
