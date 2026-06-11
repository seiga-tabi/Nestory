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
  MAX_OVERLAY_ASSET_UPLOAD_MB: z.coerce.number().positive().max(50).default(10),
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

const weakProductionSecretPattern = /change-me|dev-|example|password|secret/i;
const productionSecretRequirements = {
  SESSION_SECRET: { minLength: 32, categories: 2 },
  TOKEN_ENCRYPTION_SECRET: { minLength: 32, categories: 2 },
  ADMIN_PASSWORD: { minLength: 12, categories: 4 }
};

function characterCategories(value) {
  return [
    /[a-z]/.test(value),
    /[A-Z]/.test(value),
    /[0-9]/.test(value),
    /[^A-Za-z0-9]/.test(value)
  ].filter(Boolean).length;
}

function isInvalidProductionSecret(key, value) {
  const requirement = productionSecretRequirements[key];
  if (!requirement || !value) return true;
  if (String(value).length < requirement.minLength) return true;
  if (weakProductionSecretPattern.test(value)) return true;
  return characterCategories(value) < requirement.categories;
}

const productionWarnings = [];
if (parsed.data.NODE_ENV === 'production') {
  Object.keys(productionSecretRequirements).forEach((key) => {
    if (isInvalidProductionSecret(key, parsed.data[key])) productionWarnings.push(key);
  });
}

if (productionWarnings.length) {
  console.error({
    invalidProductionEnv: productionWarnings,
    message: 'Set strong production secrets before starting the server. Values are not logged.'
  });
  throw new Error('Invalid production environment configuration');
}

const env = {
  ...parsed.data,
  isProduction: parsed.data.NODE_ENV === 'production',
  uploadDirAbs: path.resolve(process.cwd(), parsed.data.UPLOAD_DIR)
};

module.exports = { env };
