const session = require('express-session');
const { prisma } = require('./prisma');
const { env } = require('../config/env');

const fallbackSessions = new Map();
let warnedStoreError = false;

function warnStoreError(error) {
  if (warnedStoreError) return;
  warnedStoreError = true;
  console.warn(`[session] Falling back to in-memory sessions: ${error.message}`);
}

function sessionExpiry(sess) {
  const cookieExpiry = sess?.cookie?.expires ? new Date(sess.cookie.expires) : null;
  if (cookieExpiry && !Number.isNaN(cookieExpiry.getTime())) return cookieExpiry;

  const maxAge = Number(sess?.cookie?.originalMaxAge || sess?.cookie?.maxAge);
  if (Number.isFinite(maxAge) && maxAge > 0) return new Date(Date.now() + maxAge);

  return new Date(Date.now() + env.SESSION_COOKIE_DAYS * 24 * 60 * 60 * 1000);
}

function serializeSession(sess) {
  return JSON.parse(JSON.stringify(sess || {}));
}

function fallbackGet(sid) {
  const record = fallbackSessions.get(sid);
  if (!record) return null;
  if (record.expiresAt.getTime() <= Date.now()) {
    fallbackSessions.delete(sid);
    return null;
  }
  return record.data;
}

function fallbackSet(sid, sess) {
  fallbackSessions.set(sid, {
    data: serializeSession(sess),
    expiresAt: sessionExpiry(sess)
  });
}

function fallbackDestroy(sid) {
  fallbackSessions.delete(sid);
}

function pruneFallbackSessions() {
  const now = Date.now();
  fallbackSessions.forEach((record, sid) => {
    if (record.expiresAt.getTime() <= now) fallbackSessions.delete(sid);
  });
}

class PrismaSessionStore extends session.Store {
  constructor() {
    super();
    const interval = setInterval(() => {
      this.pruneExpiredSessions();
    }, 60 * 60 * 1000);
    interval.unref?.();
  }

  async get(sid, callback) {
    try {
      const record = await prisma.session.findUnique({ where: { sid } });
      if (!record) return callback(null, null);

      if (record.expiresAt.getTime() <= Date.now()) {
        await prisma.session.delete({ where: { sid } }).catch(() => {});
        return callback(null, null);
      }

      return callback(null, record.data);
    } catch (error) {
      warnStoreError(error);
      return callback(null, fallbackGet(sid));
    }
  }

  async set(sid, sess, callback) {
    try {
      await prisma.session.upsert({
        where: { sid },
        create: {
          sid,
          data: serializeSession(sess),
          expiresAt: sessionExpiry(sess)
        },
        update: {
          data: serializeSession(sess),
          expiresAt: sessionExpiry(sess)
        }
      });
      return callback(null);
    } catch (error) {
      warnStoreError(error);
      fallbackSet(sid, sess);
      return callback(null);
    }
  }

  async destroy(sid, callback) {
    try {
      await prisma.session.delete({ where: { sid } }).catch(() => {});
      fallbackDestroy(sid);
      return callback(null);
    } catch (error) {
      warnStoreError(error);
      fallbackDestroy(sid);
      return callback(null);
    }
  }

  async touch(sid, sess, callback) {
    try {
      await prisma.session.upsert({
        where: { sid },
        create: {
          sid,
          data: serializeSession(sess),
          expiresAt: sessionExpiry(sess)
        },
        update: {
          data: serializeSession(sess),
          expiresAt: sessionExpiry(sess)
        }
      });
      return callback(null);
    } catch (error) {
      warnStoreError(error);
      fallbackSet(sid, sess);
      return callback(null);
    }
  }

  async pruneExpiredSessions() {
    pruneFallbackSessions();
    try {
      await prisma.session.deleteMany({
        where: { expiresAt: { lt: new Date() } }
      });
    } catch (error) {
      warnStoreError(error);
    }
  }
}

function createSessionStore() {
  if (env.SESSION_STORE === 'memory') return undefined;
  return new PrismaSessionStore();
}

module.exports = { createSessionStore };
