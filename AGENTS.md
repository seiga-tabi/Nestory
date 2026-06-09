# AGENTS.md

## Project
This is a Twitch streamer profile card platform.

## Tech Stack
- Backend: Node.js + Express
- Frontend: Vanilla HTML/CSS/JS
- Database: PostgreSQL
- Auth: JWT/session-based auth
- Main pages: index, profile, dashboard/editor, login, register
- Main features: Twitch API, profile editor, live preview, i18n, PNG export, QR code

## Rules
- Do not rewrite the whole project unless explicitly requested.
- Do not remove existing features.
- Do not expose Twitch Client Secret to frontend.
- Keep API secrets in .env only.
- Preserve login/session behavior.
- Avoid inline scripts because CSP may block them.
- Keep profile card PNG export working at 900x1350 portrait.
- All UI must support Korean and Japanese.
- Japanese text must not overflow or break layout.
- Mobile width 375px must not have horizontal scroll.

## Before changing code
1. Analyze the relevant files.
2. Explain the change plan.
3. Modify only necessary files.
4. Run syntax/build checks.
5. Report changed files and test results.

## Required checks
- npm install
- npm run check
- npm run build if available
- npm start if possible
- Test main pages manually when browser access is available

## Design Rules
- The profile card must feel like a streamer/game self-introduction card.
- Use portrait layout: 900x1350 export target and 280-340px responsive page cards.
- Treat 16:9 / 1200x675 profile-card layouts as legacy only unless explicitly requested.
- No text overlap.
- No cropped important image content.
- Mobile must render one-column portrait cards without horizontal scroll.

## Output Format
Always report:
- changed files
- summary
- tests run
- remaining risks
