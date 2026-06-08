const path = require('path');
const express = require('express');
const helmet = require('helmet');
const { env } = require('./config/env');
const { checkDatabaseConnection } = require('./db/prisma');
const { sessionMiddleware } = require('./config/session');
const { loadSessionUser } = require('./middleware/auth');
const { localeMiddleware } = require('./middleware/locale');
const { apiLimiter } = require('./middleware/rateLimit');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { asyncHandler } = require('./utils/asyncHandler');
const { errorPayload, sendError } = require('./utils/httpError');
const { authRoutes } = require('./routes/auth.routes');
const { twitchRoutes } = require('./routes/twitch.routes');
const { publicRoutes } = require('./routes/public.routes');
const { streamerRoutes } = require('./routes/streamer.routes');
const { profileCardRoutes } = require('./routes/profileCard.routes');
const { fanCardRoutes } = require('./routes/fanCard.routes');
const { scheduleRoutes } = require('./routes/schedule.routes');
const { analyticsRoutes } = require('./routes/analytics.routes');
const { settingsRoutes } = require('./routes/settings.routes');
const { adminRoutes } = require('./routes/admin.routes');
const { i18nRoutes } = require('./routes/i18n.routes');

const app = express();
const publicDir = path.resolve(process.cwd(), 'public');

app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware());
app.use(loadSessionUser);
app.use(localeMiddleware);
app.use('/api', apiLimiter);

app.use('/uploads', express.static(env.uploadDirAbs, {
  fallthrough: false,
  immutable: true,
  maxAge: '1d'
}));
app.use(express.static(publicDir, { extensions: ['html'] }));

app.use('/api/auth', authRoutes);
app.use('/api/i18n', i18nRoutes);
app.use('/api/login', authRoutes);
app.use('/api/public', publicRoutes);
app.use('/api', publicRoutes);
app.use('/api/dashboard', streamerRoutes);
app.use('/api/profile-card', profileCardRoutes);
app.use('/api/fan-cards', fanCardRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/admin', adminRoutes);
app.use(twitchRoutes);

app.get('/health', asyncHandler(async (_req, res) => {
  let database = { ok: true };
  try {
    await checkDatabaseConnection();
  } catch (error) {
    database = {
      ok: false,
      message: '데이터베이스에 연결할 수 없습니다.'
    };
  }

  if (!database.ok) {
    return res.status(503).json({
      ...errorPayload(503, database.message, 'DATABASE_UNAVAILABLE'),
      database
    });
  }

  return res.json({
    ok: true,
    database
  });
}));

app.use('/api', notFound);
app.use((req, res) => {
  if (req.method !== 'GET') return sendError(res, 404, '페이지를 찾을 수 없습니다.', 'NOT_FOUND');
  res.status(404).sendFile(path.join(publicDir, '404.html'));
});
app.use(errorHandler);

module.exports = { app };
