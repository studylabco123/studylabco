# Study Lab Co

Tuition website: Next.js 15 (App Router) + Supabase.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` (and `.env.test` for tests).
3. Start Docker, then `npm run db:start` (API `127.0.0.1:54321`, DB `54322`). `npx supabase status -o env` prints the local keys.
4. `npm run dev`

## Scripts

- `npm run check` - lint, typecheck, unit tests
- `npm run test:db` - database tests (needs local Supabase)
- `npm run test:e2e` - Playwright (iphone and windows projects)
- `npm run db:reset` - reapply migrations
