const path = require('path');
const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config();

const blankToUndefined = (value) => (value === '' ? undefined : value);
const booleanFlag = (defaultValue) => z.preprocess((value) => {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return value;
}, z.boolean());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(25570),
  DATABASE_URL: z.preprocess(blankToUndefined, z.string().url().optional()).default('postgresql://seiga:seiga_password@localhost:5432/seiga_db'),
  SESSION_SECRET: z.preprocess(blankToUndefined, z.string().min(12).optional()).default('dev-session-secret-change-me'),
  TOKEN_ENCRYPTION_SECRET: z.preprocess(blankToUndefined, z.string().min(12).optional()).default('dev-token-encryption-secret-change-me'),
  SESSION_STORE: z.enum(['database', 'memory']).default('database'),
  SESSION_COOKIE_DAYS: z.coerce.number().positive().default(7),
  REMEMBER_ME_DAYS: z.coerce.number().positive().default(30),
  SEED_SAMPLE_DATA: booleanFlag(false),
  SEED_BOOTSTRAP_ADMIN: booleanFlag(true),
  ADMIN_RESET_PASSWORD_ON_SEED: booleanFlag(false),
  ADMIN_EMAIL: z.string().email().default('admin@example.com'),
  ADMIN_PASSWORD: z.string().min(8).default('change-me-admin-password'),
  TWITCH_CLIENT_ID: z.preprocess(blankToUndefined, z.string().optional()).default(''),
  TWITCH_CLIENT_SECRET: z.preprocess(blankToUndefined, z.string().optional()).default(''),
  TWITCH_REDIRECT_URI: z.preprocess(blankToUndefined, z.string().url().optional()).default('http://localhost:25570/auth/twitch/callback'),
  UPLOAD_DIR: z.string().default('uploads'),
  MAX_AVATAR_UPLOAD_MB: z.coerce.number().positive().max(20).default(3),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:25570'),
  SMTP_HOST: z.preprocess(blankToUndefined, z.string().optional()).default(''),
  SMTP_PORT: z.preprocess(blankToUndefined, z.coerce.number().int().positive().optional()),
  SMTP_USER: z.preprocess(blankToUndefined, z.string().optional()).default(''),
  SMTP_PASS: z.preprocess(blankToUndefined, z.string().optional()).default(''),
  SMTP_FROM: z.preprocess(blankToUndefined, z.string().optional()).default('')
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error(parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration');
}

const productionWarnings = [];
if (parsed.data.NODE_ENV === 'production') {
  [
    ['DATABASE_URL', parsed.data.DATABASE_URL],
    ['SESSION_SECRET', parsed.data.SESSION_SECRET],
    ['TOKEN_ENCRYPTION_SECRET', parsed.data.TOKEN_ENCRYPTION_SECRET],
    ['ADMIN_PASSWORD', parsed.data.ADMIN_PASSWORD]
  ].forEach(([key, value]) => {
    if (!value || /change-me|dev-|example/i.test(value)) productionWarnings.push(key);
  });
}

if (productionWarnings.length) {
  console.error({
    invalidProductionEnv: productionWarnings,
    message: 'Set production secrets in .env before starting the server.'
  });
  throw new Error('Invalid production environment configuration');
}

const env = {
  ...parsed.data,
  isProduction: parsed.data.NODE_ENV === 'production',
  uploadDirAbs: path.resolve(process.cwd(), parsed.data.UPLOAD_DIR)
};

module.exports = { env };
