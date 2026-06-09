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
- Streamer demo data: created in development by default, disabled when `SEED_SAMPLE_DATA=false`, and skipped in production unless `SEED_SAMPLE_DATA=true` is set explicitly.
- 시드 계정: 관리자 계정은 `SEED_BOOTSTRAP_ADMIN=true`일 때 없으면 생성됩니다. 기존 관리자 비밀번호는 기본적으로 보존되며, `ADMIN_RESET_PASSWORD_ON_SEED=true`를 명시한 경우에만 `ADMIN_PASSWORD` 값으로 갱신됩니다. 샘플 스트리머는 개발 데모용이며 Docker 기본 실행과 운영 환경에서는 `SEED_SAMPLE_DATA=true`를 명시하지 않으면 생성되지 않습니다.

If you already have a local PostgreSQL on port `5432`, either point `DATABASE_URL` at that database or use Docker.

## 로컬 실행 안내

권장 실행 방법은 Docker Compose입니다. Mac과 Windows 모두 Docker Desktop을 켠 뒤 아래 명령을 실행합니다.

```bash
cp .env.example .env
npm install
docker compose up -d --build app
docker compose logs -f app
```

브라우저 접속 URL은 `http://localhost:25570`입니다. 주요 확인 화면은 `index.html`, `rankings.html`, `streamer-detail.html?slug=seiga`, `login.html`, `dashboard.html`, `profile-card.html`입니다.

Docker를 쓰지 않고 로컬 PostgreSQL을 직접 사용할 경우 `.env`의 `DATABASE_URL`이 실제 DB, 사용자, 비밀번호와 일치해야 합니다.

```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run seed
npm run check
npm start
```

`npx prisma migrate deploy`에서 `User was denied access` 또는 `Schema engine error`가 보이면 `DATABASE_URL`이 다른 PostgreSQL을 가리키는지 확인하세요. 특히 Mac에서 기존 PostgreSQL이 `localhost:5432`를 사용 중이면 Docker의 Postgres가 아니라 기존 로컬 DB에 연결될 수 있습니다. 이 경우 기존 PostgreSQL을 중지하거나, `.env`의 `DATABASE_URL`을 사용하려는 DB에 맞게 바꾸거나, Docker Compose만으로 앱과 DB를 함께 실행하세요.

## Docker

```bash
cp .env.example .env
docker compose up -d --build app
```

The app is exposed at `http://localhost:25570`; Postgres is exposed at `localhost:5432`; uploads are stored in the `uploads` Docker volume.
Docker Compose는 컨테이너 시작 시 `npx prisma migrate deploy`와 `npm run seed`를 실행하지만, `SEED_SAMPLE_DATA` 기본값은 `false`입니다. 로컬 데모 샘플 스트리머가 필요할 때만 `.env` 또는 실행 환경에 `SEED_SAMPLE_DATA=true`를 설정하세요.
Docker에서 seed가 반복 실행되어도 기존 관리자 비밀번호는 `ADMIN_RESET_PASSWORD_ON_SEED=true`가 아니면 바뀌지 않습니다. `SEED_SAMPLE_DATA=true`로 샘플을 켜도 seed snapshot/pageView는 seed marker 기준으로 갱신되어 같은 데이터가 계속 누적되지 않습니다.

## Environment

Required values are documented in `.env.example`.

For Twitch Developer Console, set the redirect URI to:

```txt
http://localhost:25570/auth/twitch/callback
```

배포 환경에서는 Twitch Developer Console에 아래 형식의 Redirect URL도 함께 등록해야 합니다.

```txt
https://your-domain.example/auth/twitch/callback
```

`TWITCH_REDIRECT_URI`는 현재 실행 환경의 실제 콜백 URL과 정확히 일치해야 합니다. 로컬 기본값은 `http://localhost:25570/auth/twitch/callback`이고, 배포 기본 형태는 `${PUBLIC_BASE_URL}/auth/twitch/callback`입니다.

`TWITCH_CLIENT_SECRET` and OAuth tokens never go to the frontend. Twitch access/refresh tokens are encrypted before storage with `TOKEN_ENCRYPTION_SECRET`.
`TWITCH_CLIENT_SECRET`과 OAuth 토큰은 프론트엔드로 전달하지 않습니다. `/api/twitch/status`는 누락된 환경변수의 키 이름과 Redirect URI만 반환하며 secret 값은 반환하지 않습니다.
`/api/twitch/status`는 `configured`, `missingConfig`, `missingEnv`, `redirectUri`, `callbackPath`, `requiredScopes`, `expectedLocalRedirectUri`, `publicBaseRedirectUri`를 반환해 OAuth 설정 불일치를 확인할 수 있게 합니다.

Twitch OAuth 시작 URL은 세션 state에 intent를 저장해 로그인/재연동 흐름을 분리합니다.

- 비로그인 사용자의 `/auth/twitch`: `login` intent로 처리하며 신규 사용자를 관리자 승인 없이 일반 사용자로 생성하고 로그인합니다.
- 로그인된 사용자의 `/auth/twitch`: 기본적으로 `reconnect` intent로 처리하며 현재 계정의 Twitch 연결 정보만 갱신합니다.
- 설정 화면에서는 명시적으로 `/auth/twitch?intent=reconnect&returnTo=/settings.html`를 사용할 수 있습니다.
- 로그인된 일반 사용자가 `/auth/twitch?intent=streamer&returnTo=/dashboard.html`로 시작하면 Twitch 연결 정보를 갱신한 뒤 별도 스트리머 등록 신청을 `pending` 상태로 생성합니다.
- `returnTo`는 `/settings.html`처럼 내부 경로만 허용하고 외부 URL 또는 `//host` 형식은 차단합니다.
- 다른 사용자에게 이미 연결된 Twitch 계정은 현재 사용자에게 연결하지 않고 `settings.html?error=twitch_already_linked`로 돌려보냅니다.

주요 `.env` 값:

- `DATABASE_URL`: PostgreSQL 연결 문자열
- `SESSION_SECRET`: 세션 쿠키 서명 비밀값
- `TOKEN_ENCRYPTION_SECRET`: Twitch OAuth 토큰 암호화 비밀값
- `SESSION_STORE`: `database` 또는 `memory`
- `SEED_SAMPLE_DATA`: 샘플 스트리머 seed 허용 여부
- `SEED_BOOTSTRAP_ADMIN`: 관리자 계정 bootstrap 허용 여부
- `ADMIN_RESET_PASSWORD_ON_SEED`: 기존 관리자 비밀번호 seed 갱신 허용 여부
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`: 관리자 seed 계정
- `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_REDIRECT_URI`: Twitch OAuth/API 설정
- `PUBLIC_BASE_URL`: 메일 링크와 배포 Redirect URI 기준 URL
- `MAX_AVATAR_UPLOAD_MB`: 이미지 업로드 최대 크기

## Key API Routes

- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/forgot-password`
- `GET /api/auth/password-setup/:token`
- `POST /api/auth/password-setup`
- `POST /api/auth/reset-password`
- `GET /auth/twitch`
- `GET /auth/twitch/callback`
- `GET /api/twitch/status`
- `GET /api/twitch/user`
- `GET /api/twitch/followed-channels`
- `GET /api/twitch/follows`
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
- `POST /api/streamer-requests`
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
- `GET /api/admin/access-requests/:id`
- `POST /api/admin/access-requests/:id/approve`
- `POST /api/admin/access-requests/:id/reject`
- `GET /api/admin/streamer-requests`
- `GET /api/admin/streamer-requests/:id`
- `POST /api/admin/streamer-requests/:id/approve`
- `POST /api/admin/streamer-requests/:id/reject`

`GET /api/auth/me`는 프론트엔드 라우팅에 필요한 안전한 권한 힌트로 `role`과 `isAdmin`을 포함합니다. 비밀번호 해시, OAuth 토큰, 세션 ID, Twitch Client Secret은 포함하지 않습니다.
`/api/admin/*` 라우트는 서버 세션 사용자 로딩과 `requireAdmin`으로 보호됩니다. 비로그인 요청은 `401 AUTH_REQUIRED`, 로그인했지만 관리자가 아닌 요청은 `403 ADMIN_REQUIRED`를 반환합니다.

## Notes

- Existing HTML/CSS design is preserved under `public/`.
- Public cards intentionally omit intro, follower count, fan-card count in the profile-card preview, and manual broadcast status input.
- Broadcast status is read from Twitch when configured, otherwise the latest `StreamSnapshot` is used as a fallback.
- Actual `.env` files and uploaded assets are ignored by Git.
- API errors keep the legacy `message` field and also include `ok: false` plus a stable `code`.
- Avatar uploads are limited by `MAX_AVATAR_UPLOAD_MB` and validated by extension, MIME type, and image signature.
- Express sessions use the Prisma-backed `Session` table when `SESSION_STORE=database`; if the database is unavailable, the server falls back to in-memory sessions and returns clear JSON errors for DB-backed API requests.
- 일반 회원가입은 관리자 승인 없이 `VIEWER` DB role로 즉시 `ACTIVE` 계정을 생성합니다. API 응답에서는 이 일반 사용자 역할을 `USER`로 노출합니다.
- Twitch OAuth 신규 로그인은 일반 사용자 계정 생성/로그인만 처리하며 스트리머 등록 요청을 자동 생성하지 않습니다. 로그인된 사용자의 Twitch 재연동도 현재 계정의 Twitch 연결 정보만 갱신합니다.
- Twitch OAuth scope는 `user:read:email user:read:follows`입니다. `GET /api/twitch/followed-channels`는 로그인 사용자의 Twitch User Access Token으로 팔로우 목록을 조회하고, 승인된 Nestory 스트리머와 매칭된 항목에만 `isRegistered=true`와 `registeredProfile`을 포함합니다. scope가 부족하면 `403 TWITCH_SCOPE_REQUIRED`와 `needsReconnect=true`를 반환합니다.
- Streamer account requests use the existing `AccessRequest` table. Status values are stored as `PENDING`, `APPROVED`, or `REJECTED`; admin APIs expose lower-case status strings for clients.
- Access request approval records `approvedAt` and `approvedById`, activates or creates the streamer user/profile, and prevents re-approving non-pending requests. Rejection records `rejectedAt`, `rejectedById`, and optional `rejectionReason` without deleting the user account.
- 스트리머 등록 요청 승인 시 임시 비밀번호를 생성하지 않습니다. 신규 또는 비밀번호 설정이 필요한 사용자는 `passwordSetupRequired=true`가 되고, 해시 저장된 1회용 `PASSWORD_SETUP` 토큰으로 직접 비밀번호를 설정합니다.
- 기존 Twitch OAuth 승인 대기 계정처럼 `status=PENDING`인 과거 데이터는 승인 시 `passwordHash` 유무와 관계없이 `passwordSetupRequired=true` 대상이 되며, 이메일/비밀번호 로그인을 위한 setup token을 받습니다.
- 비밀번호 설정 링크는 `PUBLIC_BASE_URL` 기준 `/password-setup.html?token=...` 형식으로 생성됩니다. SMTP가 설정된 운영 환경에서는 이메일 전달을 우선하고, SMTP가 없거나 개발 환경이면 관리자 API 응답의 `passwordSetup.setupUrl`로 전달할 수 있습니다.

## Real Data Rendering

- `public/index.html` renders the public streamer list from `GET /api/public/streamers`.
- `public/rankings.html` renders rankings from `GET /api/public/rankings`.
- Public streamer APIs include only profiles with `isPublic=true`, `user.status=ACTIVE`, and `user.role` in `STREAMER` or `ADMIN`.
- Static streamer/ranking cards are not used as fallback UI; loading, empty, and error states are shown instead.
- Development sample streamer data belongs in `prisma/seed.js` only.
- `SEED_SAMPLE_DATA=false` disables sample streamer seed data even in development. In production, sample streamer seed data is skipped unless `SEED_SAMPLE_DATA=true`; the admin account seed remains available.

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
