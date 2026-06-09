const session = require('express-session');
const { env } = require('./env');
const { createSessionStore } = require('../db/sessionStore');

const SESSION_COOKIE_NAME = 'seiga.sid';

function daysToMs(days) {
  return Math.round(days * 24 * 60 * 60 * 1000);
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax',
    path: '/'
  };
}

function sessionMiddleware() {
  return session({
    name: SESSION_COOKIE_NAME,
    secret: env.SESSION_SECRET,
    store: createSessionStore(),
    resave: false,
    saveUninitialized: false,
    cookie: {
      ...sessionCookieOptions(),
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

function destroySession(req) {
  return new Promise((resolve, reject) => {
    if (!req.session) return resolve();
    req.session.destroy((error) => {
      if (error) return reject(error);
      return resolve();
    });
  });
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions());
}

module.exports = {
  SESSION_COOKIE_NAME,
  sessionMiddleware,
  setSessionPersistence,
  saveSession,
  destroySession,
  clearSessionCookie
};
