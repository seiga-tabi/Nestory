const crypto = require('crypto');
const { env } = require('../config/env');

function key() {
  return crypto.createHash('sha256').update(env.TOKEN_ENCRYPTION_SECRET).digest();
}

function encrypt(value) {
  if (!value) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decrypt(value) {
  if (!value) return null;
  const [ivRaw, tagRaw, encryptedRaw] = String(value).split(':');
  if (!ivRaw || !tagRaw || !encryptedRaw) return null;
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivRaw, 'base64'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, 'base64')),
    decipher.final()
  ]).toString('utf8');
}

function hashToken(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function hashVisitor(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

module.exports = { encrypt, decrypt, hashToken, randomToken, hashVisitor };
