# Seiga Studio Streamer Profile Platform

Seiga Studio is now an Express + PostgreSQL + Prisma app that serves the existing liquid-glass static UI from `public/` and backs it with real APIs for streamer profiles, fan cards, schedules, analytics, authentication, Twitch OAuth hooks, uploads, and admin approval.

## Stack

- Node.js / Express
- PostgreSQL
- Prisma ORM
- express-session + bcrypt
- multer uploads under `uploads/`
- helmet + express-rate-limit
- Twitch OAuth/API service stubs with encrypted token storage
- Docker Compose for app + Postgres

## Local Setup

```bash
npm install
cp .env.example .env
npx prisma generate
npx prisma migrate deploy
npm run seed
npm run check
npm start
```

Open `http://localhost:25570`.

Seeded accounts:

- Admin: `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`
- Streamer demo data is created only outside production, or when `SEED_SAMPLE_DATA=true` is set explicitly.

If you already have a local PostgreSQL on port `5432`, either point `DATABASE_URL` at that database or use Docker.

## Docker

```bash
cp .env.example .env
docker compose up -d --build app
```

The app is exposed at `http://localhost:25570`; Postgres is exposed at `localhost:5432`; uploads are stored in the `uploads` Docker volume.

## Environment

Required values are documented in `.env.example`.

For Twitch Developer Console, set the redirect URI to:

```txt
http://localhost:25570/auth/twitch/callback
```

`TWITCH_CLIENT_SECRET` and OAuth tokens never go to the frontend. Twitch access/refresh tokens are encrypted before storage with `TOKEN_ENCRYPTION_SECRET`.

## Key API Routes

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `GET /auth/twitch`
- `GET /auth/twitch/callback`
- `GET /api/twitch/status`
- `GET /api/twitch/user`
- `GET /api/twitch/stream-status`
- `GET /api/twitch/schedule`
- `POST /api/twitch/disconnect`
- `GET /api/public/streamers`
- `GET /api/public/rankings`
- `GET /api/public/streamers/:slug`
- `GET /api/public/streamers/:slug/stream-status`
- `POST /api/public/streamers/:slug/fan-cards`
- `GET /api/i18n/locale`
- `POST /api/i18n/locale`
- `POST /api/access-requests`
- `GET /api/dashboard/summary`
- `GET /api/profile-card`
- `PUT /api/profile-card`
- `POST /api/profile-card/avatar`
- `GET /api/fan-cards`
- `PATCH /api/fan-cards/:id`
- `DELETE /api/fan-cards/:id`
- `GET /api/schedule`
- `PUT /api/schedule`
- `GET /api/analytics/summary`
- `GET /api/settings`
- `PUT /api/settings/profile`
- `PUT /api/settings/password`
- `PUT /api/settings/privacy`
- `GET /api/admin/access-requests`
- `POST /api/admin/access-requests/:id/approve`
- `POST /api/admin/access-requests/:id/reject`

## Notes

- Existing HTML/CSS design is preserved under `public/`.
- Public cards intentionally omit intro, follower count, fan-card count in the profile-card preview, and manual broadcast status input.
- Broadcast status is read from Twitch when configured, otherwise the latest `StreamSnapshot` is used as a fallback.
- Actual `.env` files and uploaded assets are ignored by Git.
- API errors keep the legacy `message` field and also include `ok: false` plus a stable `code`.
- Avatar uploads are limited by `MAX_AVATAR_UPLOAD_MB` and validated by extension, MIME type, and image signature.
- Express sessions use the Prisma-backed `Session` table when `SESSION_STORE=database`; if the database is unavailable, the server falls back to in-memory sessions and returns clear JSON errors for DB-backed API requests.

## Real Data Rendering

- `public/index.html` renders the public streamer list from `GET /api/public/streamers`.
- `public/rankings.html` renders rankings from `GET /api/public/rankings`.
- Static streamer/ranking cards are not used as fallback UI; loading, empty, and error states are shown instead.
- Development sample streamer data belongs in `prisma/seed.js` only.
- In production, sample streamer seed data is skipped unless `SEED_SAMPLE_DATA=true`; the admin account seed remains available.

## Internationalization

- Supported locales: Korean (`ko`) and Japanese (`ja`).
- Locale resolution priority:
  1. URL query, such as `?lang=ko` or `?lang=ja`
  2. User-selected cookie/localStorage value (`seiga_locale`)
  3. Logged-in user/session locale when available
  4. IP country headers
  5. `Accept-Language`
  6. fallback `ko`
- Public pages load `public/js/i18n.js` and locale files from `public/locales/{locale}.json`.
- Users can switch language with the KR/JA header selector; the choice is saved to localStorage and cookie.

## Cloudflare Locale Detection

- When Cloudflare is used, `CF-IPCountry` is checked for initial locale recommendation.
- `JP` resolves to `ja`; `KR` resolves to `ko`.
- `X-Vercel-IP-Country`, `X-Country-Code`, and `X-IP-Country` are also checked as fallback country headers.
