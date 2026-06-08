const session = require('express-session');
const { env } = require('./env');
const { createSessionStore } = require('../db/sessionStore');

function daysToMs(days) {
  return Math.round(days * 24 * 60 * 60 * 1000);
}

function sessionMiddleware() {
  return session({
    name: 'seiga.sid',
    secret: env.SESSION_SECRET,
    store: createSessionStore(),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: env.isProduction,
      sameSite: 'lax',
      maxAge: daysToMs(env.SESSION_COOKIE_DAYS)
    }
  });
}

function setSessionPersistence(req, rememberMe = false) {
  if (!req.session?.cookie) return;
  req.session.cookie.maxAge = daysToMs(rememberMe ? env.REMEMBER_ME_DAYS : env.SESSION_COOKIE_DAYS);
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => {
      if (error) return reject(error);
      return resolve();
    });
  });
}

module.exports = { sessionMiddleware, setSessionPersistence, saveSession };
