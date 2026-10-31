# Study Lab Co Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and launch studylabco.co.uk: a public site, a parent booking system and a tutor admin dashboard for a GCSE science tuition business, as defined in the spec.

**Architecture:** A Next.js App Router app (TypeScript) on Vercel, with Supabase for Postgres/Auth/Storage. All business rules (slots, pricing, eligibility, cancellation, tax) live as pure functions in `src/lib/**`, unit-tested with Vitest. Server actions call them, then write with the Supabase service-role client. The database enforces what must hold under concurrency (no double booking, group seat limits) and Row Level Security guarantees parents see only their own data. Emails go through Resend. One daily Vercel cron sends reminders and housekeeping.

**Tech Stack:** Next.js 15, React 19, TypeScript (strict), Tailwind CSS 4, `@supabase/supabase-js` + `@supabase/ssr`, Supabase CLI (local stack in Docker for tests), `date-fns` + `@date-fns/tz`, `zod`, `resend` + `@react-email/components`, `exceljs`, `pdf-lib`, `ics`, Vitest, `pg` (DB tests), Playwright + `@axe-core/playwright`.

**Spec:** `docs/superpowers/specs/2026-10-31-studylabco-website-design.md`

## Global Constraints

- Time zone: store `timestamptz` (UTC); every calendar decision is made in `Europe/London`.
- Money: integer **pence** everywhere (`*_pence`). Display as `£25` (no `.00` when whole).
- Launch prices (pence): assessment 1000, travel fee 500, 1-to-1 2500, group 1800, Sunday bundle 3000; blocks: Saturday 6 wk 10200 / 10 wk 16200, Sunday bundle 6 wk 17100 / 10 wk 27000.
- All lessons are 60 minutes. Home visits add a 30-minute buffer after.
- Online lessons are **off by default** (`settings.online_enabled = false`). While off, no online option or online wording appears in any parent-facing UI or public page.
- Home visits: Sunday 1-to-1 window only, postcode districts `BB1` and `BB2` only, status `pending` until the tutor approves.
- Assessment Lessons are in person only (tutor's place or home visit) for parents.
- Cancellation: at least 48 h before start = free; less = late cancellation (fee owed). Copy says "late cancellation fee", never "fine" or "penalty".
- The tutor's home address, bank details and meeting link are never rendered on public pages; they are released only to a parent with a confirmed relevant booking, or in that booking's emails.
- Parents (18+) hold accounts; children never do.
- Consent checkboxes are never pre-ticked; each consent is stored with timestamp and policy version (`POLICY_VERSION = '2026-11-01'`).
- No third-party scripts except Supabase, Resend (server-side) and Cloudflare Turnstile. No analytics/ads. Fonts via `next/font` (self-hosted).
- Brand: navy (text, buttons) and sky blue (backgrounds/decoration only, never text). WCAG 2.2 AA.
- Badges copy: "Qualified Teacher (QTS) · Enhanced DBS Checked · All Exam Boards".
- Must work in current Safari (iOS), Edge/Chrome (Windows) and Chrome (Android); installable via web manifest.

## Review Focus

1. **Clock changes.** Slots on Sunday 28 Mar 2027 (BST starts) must still start at 10:30 London time (09:30 UTC); slots on Sunday 25 Oct 2026 at 10:30 GMT. → Task 5 test `handles BST start` / `handles GMT return`.
2. **Two parents racing for the same slot or the last group seat.** Exactly one succeeds; the other gets a friendly "just taken" message, not a 500. → Task 4 test `last seat race`; Task 9 test `createBooking returns slot_taken on exclusion violation`.
3. **Cancelling at exactly 48 h.** 48 h 00 m before = free; 47 h 59 m = late. → Task 6 tests.
4. **Tutor changes prices after bookings exist.** Existing bookings keep their stored price; owed totals use the stored price. → Task 6 test `amountOwed uses stored booking price`.
5. **Block booking over a cancelled or full week.** Cancelled weeks are skipped (the block extends to the next scheduled week). A full week rejects the whole block, naming the date. → Task 9 tests `planBlock skips cancelled week` / `planBlock rejects full week`.

---

## File Structure

```
src/
  app/
    (public)/page.tsx, about/, lessons/, groups/, faq/, contact/, terms/, refunds/,
             privacy/, cookies/, safeguarding/, accessibility/        # public pages
    (auth)/signup/, login/, verify/, reset/                            # auth pages
    account/page.tsx, children/, children/[id]/agreement/, book/, bookings/, settings/
    admin/layout.tsx (guard), page.tsx (Today), calendar/, groups/, bookings/,
          families/, families/[id]/, money/, money/tax/, settings/, mfa/
    api/cron/daily/route.ts, api/calendar/[token]/route.ts,
        api/admin/tax-pack/route.ts, api/admin/backup/route.ts
    manifest.ts, icon.svg, apple-icon.png
  components/ui/*          # Button, Field, Checkbox, Card, Badge, Dialog, Table, Toast
  components/site/*        # Header, Footer, Logo, Hero, PriceTable, GroupList
  lib/
    types.ts               # shared domain types (Task 3)
    time.ts                # London time helpers (Task 5)
    calendar/periods.ts, calendar/slots.ts                  (Task 5)
    booking/pricing.ts, postcode.ts, cancellation.ts,
            eligibility.ts, owed.ts, block.ts               (Tasks 6, 9)
    money/tax-year.ts, tax-pack.ts, xlsx.ts, pdf.ts         (Task 15)
    email/send.ts, email/templates/*.tsx, email/reminders.ts (Task 11)
    supabase/server.ts, client.ts, service.ts               (Task 7)
    settings.ts            # load/save typed settings (Task 7)
    format.ts              # formatPence, formatLondon (Task 5)
supabase/
  config.toml
  migrations/0001_schema.sql, 0002_rls.sql, 0003_functions.sql, 0004_seed.sql
tests/
  unit/*.test.ts   db/*.test.ts   e2e/*.spec.ts   e2e/helpers.ts
DESIGN.md
```

---

### Task 1: Project scaffold and test harness

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `eslint.config.mjs`, `.env.example`, `.gitignore`, `src/app/layout.tsx`, `src/app/(public)/page.tsx` (placeholder), `supabase/config.toml`, `README.md`, `tests/unit/smoke.test.ts`, `tests/e2e/smoke.spec.ts`

**Interfaces:**
- Produces: npm scripts `dev`, `build`, `lint`, `typecheck`, `test:unit` (`vitest run tests/unit`), `test:db` (`vitest run tests/db`), `test:e2e` (`playwright test`), `check` (lint + typecheck + test:unit), `db:start` (`supabase start -x studio,edge-runtime,logflare,vector,realtime,imgproxy,supavisor`), `db:reset` (`supabase db reset`).
- Produces: env vars in `.env.example`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `RESEND_API_KEY`, `EMAIL_TRANSPORT` (`resend`|`log`), `EMAIL_FROM` (`Study Lab Co <bookings@studylabco.co.uk>`), `BUSINESS_INBOX` (`studylabco123@gmail.com`), `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL`.
- Playwright projects: `iphone` (viewport 393×852, `isMobile`, `hasTouch`, chromium) and `windows` (1366×768, chromium). `webServer`: `npm run dev` with `.env.test`.

- [ ] **Step 1:** Scaffold Next.js 15 (App Router, TS strict, Tailwind 4, `src/` dir, ESLint) into the repo root without overwriting `docs/`.
- [ ] **Step 2:** Add Vitest and Playwright configs and the two smoke tests: unit `expect(1 + 1).toBe(2)`; e2e `GET /` returns 200 with `<html lang="en-GB">`.
- [ ] **Step 3:** `npx supabase init`, then `npm run db:start` (start `dockerd` first if not running). Expected: API on `127.0.0.1:54321`, DB on `54322`. Write the local keys into `.env.test` (gitignored).
- [ ] **Step 4:** Run `npm run check && npm run test:e2e`. Expected: all pass.
- [ ] **Step 5:** Commit `chore: scaffold Next.js app, test harness and local Supabase`.

---

### Task 2: Design system, logo and site shell

Use the `frontend-design:frontend-design` and `website-design:web-design-system` skills. Use `audit-suite:web-animation-design` for motion.

**Files:**
- Create: `DESIGN.md`, `src/app/globals.css` (Tailwind theme tokens), `src/components/site/Logo.tsx`, `public/logo.svg`, `src/app/icon.svg`, `src/app/apple-icon.png`, `src/app/manifest.ts`, `src/components/site/Header.tsx`, `src/components/site/Footer.tsx`, `src/components/ui/{Button,Field,Checkbox,Card,Badge,Dialog,Table,Toast}.tsx`, `src/app/(public)/layout.tsx`
- Test: `tests/e2e/shell.spec.ts`

**Interfaces:**
- Produces: tokens `--color-navy-900` (logo navy, text/buttons), `--color-sky-100`/`--color-sky-200` (backgrounds), `--color-sky-500` (decoration only); `<Logo variant="full"|"mark" />`; UI primitives used by every later page; `Footer` shows trading name "Study Lab Co", email, phone placeholder from settings, and links to all legal pages.
- Logo: redrawn SVG matching the owner's logo (navy circle outline, arched "STUDYLABCO." top text, lightbulb with rays over an open book, "TUTORING" beneath).
- Motion: fade/slide-in on scroll and button press feedback, all disabled under `prefers-reduced-motion: reduce`.

- [ ] **Step 1: Write failing test** `shell.spec.ts`: on `/`, for both projects: header has `img[alt="Study Lab Co Tutoring logo"]`; footer links `Terms`, `Refund Policy`, `Privacy`, `Cookies`, `Safeguarding`, `Accessibility` exist; mobile nav opens with the keyboard (Tab to menu button, Enter, focus moves into the menu); `AxeBuilder` reports 0 violations; `/manifest.webmanifest` has `name: "Study Lab Co"`.
- [ ] **Step 2:** Run `npx playwright test tests/e2e/shell.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Write `DESIGN.md` (colours with roles, type scale, spacing, radius, shadows, motion rules), then implement the tokens, logo, manifest/icons, primitives, header and footer.
- [ ] **Step 4:** Run the test again. Expected: PASS on `iphone` and `windows`.
- [ ] **Step 5:** Commit `feat: design system, logo and site shell`.

---

### Task 3: Database schema and seed data

**Files:**
- Create: `supabase/migrations/0001_schema.sql`, `supabase/migrations/0004_seed.sql`, `src/lib/types.ts`, `tests/db/setup.ts` (pg pool on `SUPABASE_DB_URL`, helpers `asUser(id, aal)`, `asAnon()`, `resetData()`), `tests/db/schema.test.ts`

**Interfaces:**
- Enums: `user_role ('parent','admin')`, `location_kind ('tutor_place','home_visit','online','group_venue')`, `booking_kind ('assessment','one_to_one','group')`, `booking_status ('pending','confirmed','declined','cancelled','late_cancelled','no_show','attended')`, `payment_status ('unpaid','paid','waived','credited','refunded')`, `period_kind ('term','holiday')`, `payment_method ('bank_transfer','cash')`, `ledger_kind ('payment','refund','credit','waiver')`.
- Tables (columns beyond `id uuid pk default gen_random_uuid()`, `created_at timestamptz default now()`):
  - `profiles(id uuid pk → auth.users on delete cascade, full_name, email, phone, role user_role default 'parent', is_blocked bool default false, blocked_reason text, marketing_opt_in bool default false)`
  - `children(parent_id → profiles, first_name, last_name, school_year int check in (10,11), exam_board text check in ('AQA','Edexcel','OCR','WJEC/Eduqas'), tier text check in ('Foundation','Higher'), subjects text[] (subset of Biology, Chemistry, Physics, Combined Science), target_grade text null)`
  - `agreements(child_id → children on delete cascade, policy_version, emergency_contact_name, emergency_contact_phone, medical_info text null, sen_info text null, consent_contact bool, signed_name, signed_at timestamptz)` with a unique index on `child_id`
  - `consents(profile_id → profiles on delete cascade, kind text check in ('age_guardian','terms','marketing','cooling_off'), policy_version, granted bool, booking_id uuid null)`
  - `student_status(child_id pk → children on delete cascade, assessment_completed_at, approved_at)`
  - `tutor_notes(child_id → children on delete cascade, body text)`
  - `settings(id int pk check id = 1, price_assessment_pence, price_one_to_one_pence, price_group_pence, price_sunday_bundle_pence, travel_fee_pence, block_prices jsonb, online_enabled bool, home_visits_enabled bool, tutor_place_enabled bool, cancellation_notice_hours int, booking_window_days int, min_notice_hours int, default_group_capacity int, home_visit_buffer_minutes int, allowed_postcode_districts text[], flag_threshold int, group_venue text null, business_phone text null, business_address text null)`
  - `settings_private(id int pk check id = 1, bank_account_name, bank_sort_code, bank_account_number, teaching_address, meeting_link, calendar_feed_token text)`
  - `availability_rules(period period_kind, weekday int 0–6 (0 = Sunday), start_time time, end_time time, kinds booking_kind[], locations location_kind[])`. Slots start hourly from `start_time`; the last start is `end_time − 60 min`.
  - `term_periods(label, starts_on date, ends_on date)`: term-time segments, inclusive; any date not covered is holiday.
  - `blocked_times(starts_at, ends_at, reason, is_default bool)` and `blocked_rules(weekday, start_time, end_time, valid_from date, valid_to date null, reason)`
  - `group_series(title, weekday, start_time, capacity, price_pence, venue text null, is_online bool, year_group text, product text check in ('saturday','sunday_bundle') null, active bool, starts_on date)`
  - `group_sessions(series_id null → group_series, title, starts_at, ends_at, capacity, price_pence, venue, is_online, status text check in ('scheduled','cancelled'))`, unique `(series_id, starts_at)`
  - `block_bookings(parent_id, child_id, product text, weeks int check in (6,10), price_pence, payment_reference, hold_expires_at, status text check in ('held','paid','released'))`
  - `bookings(parent_id null → profiles on delete set null, child_id null → children on delete set null, kind, location, starts_at, ends_at, busy_until timestamptz, group_session_id null, block_booking_id null, bundle_id uuid null, status, price_pence, travel_fee_pence, payment_reference, payment_status default 'unpaid', home_address null, home_postcode null, cancelled_at null, cancelled_by text null, decided_at null)`
  - `ledger(booking_id null, block_booking_id null, parent_id null, kind ledger_kind, method payment_method null, amount_pence, occurred_on date, note)`
  - `expenses(spent_on date, category text, description, amount_pence, receipt_path text null)`; `mileage(booking_id null, trip_on date, miles numeric(6,1) null, note)`
  - `email_log(booking_id null, block_booking_id null, template text, to_email, sent_at)`, unique `(booking_id, template)`
- Constraints:
  - Extension `btree_gist`. `bookings_no_overlap EXCLUDE USING gist (tstzrange(starts_at, busy_until) WITH &&) WHERE (kind <> 'group' AND status IN ('pending','confirmed','attended'))`.
  - Unique `(child_id, group_session_id)` where status in `('pending','confirmed','attended')`.
  - Sequence `payment_ref_seq START 1001`; default `payment_reference = 'SLC-' || nextval('payment_ref_seq')` on both `bookings` and `block_bookings`.
- `src/lib/types.ts` exports TS mirrors: `LocationKind`, `BookingKind`, `BookingStatus`, `PaymentStatus`, `PeriodKind`, `Settings`, `PrivateSettings`, `AvailabilityRule`, `TermPeriod`, `BlockedTime`, `BlockedRule`, `GroupSession`, `Booking`, `LedgerEntry`, `Expense`, `MileageEntry`. Field names are camelCase, mapped from the snake_case columns.
- Seed (`0004_seed.sql`):
  - `settings` with the launch prices and values from Global Constraints (`cancellation_notice_hours 48`, `booking_window_days 28`, `min_notice_hours 24`, `default_group_capacity 15`, `home_visit_buffer_minutes 30`, `allowed_postcode_districts {BB1,BB2}`, `flag_threshold 2`, `online_enabled false`, `home_visits_enabled true`, `tutor_place_enabled true`), and `settings_private` with a random `calendar_feed_token`.
  - Availability rules: term Mon–Fri 17:00–20:00; holiday Mon–Fri 07:00–22:00 (both `[assessment, one_to_one]`, `[tutor_place, online]`); term and holiday Sunday 10:30–17:30 `[assessment, one_to_one]`, `[tutor_place, home_visit, online]`.
  - Term periods: 2026-09-01..2026-10-23, 2026-11-02..2026-12-18, 2027-01-04..2027-02-12, 2027-02-22..2027-03-08, 2027-03-11..2027-03-25, 2027-04-12..2027-05-02, 2027-05-04..2027-05-16, 2027-05-19..2027-05-28, 2027-06-07..2027-07-22.
  - Default whole-day blocks (London midnight to midnight, `is_default`): 2026-12-25, 2026-12-26, 2027-01-01, 2027-03-09, 2027-03-10, 2027-05-17, 2027-05-18.
  - Group series: "Saturday GCSE Science Group" Sat 08:15 (`product 'saturday'`); "Sunday Group — Session 1" Sun 08:15 and "Sunday Group — Session 2" Sun 09:15 (`product 'sunday_bundle'`). All capacity 15, 1800 pence, year_group "Years 10 & 11", `starts_on 2026-11-01`.

- [ ] **Step 1: Write failing tests** in `tests/db/schema.test.ts`:
  - `rejects overlapping 1-to-1 bookings`: insert confirmed 17:00–18:00, then 17:30–18:30 → error code `23P01`.
  - `home visit buffer blocks next slot`: home visit 10:30–11:30 with `busy_until` 12:00, then 11:30 booking → `23P01`.
  - `cancelled booking frees the slot`: cancel the first, insert the overlapping one → ok.
  - `child cannot hold two seats in one group session` → `23505`.
  - `payment reference format`: the first booking's reference matches `/^SLC-\d{4,}$/`.
  - `seed: holiday Monday rule is 07:00–22:00`; `seed: 9 term periods`; `seed: online disabled`.
- [ ] **Step 2:** Run `npm run db:reset && npm run test:db -- schema`. Expected: FAIL (no tables).
- [ ] **Step 3:** Write `0001_schema.sql`, `0004_seed.sql` and `types.ts`.
- [ ] **Step 4:** Run `npm run db:reset && npm run test:db -- schema`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(db): schema, constraints and 2026-27 seed data`.

---

### Task 4: Row Level Security and database functions

**Files:**
- Create: `supabase/migrations/0002_rls.sql`, `supabase/migrations/0003_functions.sql`, `tests/db/rls.test.ts`, `tests/db/functions.test.ts`

**Interfaces:**
- `is_admin() returns bool`: SECURITY DEFINER; true only if `profiles.role = 'admin'` for `auth.uid()` **and** `auth.jwt()->>'aal' = 'aal2'`.
- Trigger `on_auth_user_created`: inserts a `profiles` row from `raw_user_meta_data` (`full_name`, `phone`) plus the email.
- Policies:
  - Parents: select/update own `profiles` row (not `role`/`is_blocked`); full CRUD on own `children`; insert/select own `agreements` and `consents`; select own `bookings`, `block_bookings`, `ledger`, `student_status`.
  - Everyone, including anon: select `settings`, `group_sessions` (scheduled, future), `group_series`, `term_periods`, `availability_rules`.
  - Admin only: `settings_private`, `tutor_notes`, `expenses`, `mileage`, `email_log`, `blocked_*` writes.
  - Admin (`is_admin()`): all on everything.
  - Parents never insert/update `bookings` directly (server actions use the service role).
- `reserve_group_seat(p_session uuid, p_parent uuid, p_child uuid, p_price int, p_bundle uuid default null, p_block uuid default null) returns uuid`: locks the session row `FOR UPDATE`; raises `'session_full'` if confirmed + pending seats ≥ capacity, and `'session_cancelled'` if cancelled; inserts a confirmed group booking and returns its id.
- `ensure_group_sessions(p_until date) returns int`: creates missing occurrences of active series up to `p_until` (London local time → UTC), skipping dates covered by a whole-day `blocked_times`. Returns the number created.
- `seats_left(p_session uuid) returns int` (anon-callable).

- [ ] **Step 1: Write failing tests:**
  - `rls.test.ts`:
    - `parent A cannot read parent B children` (0 rows)
    - `parent cannot read settings_private` (0 rows)
    - `parent cannot read tutor_notes`
    - `parent cannot insert bookings` (error `42501`)
    - `admin without aal2 cannot read settings_private`
    - `admin with aal2 reads everything`
    - `anon can read settings and future scheduled group sessions`
  - `functions.test.ts`:
    - `15 seats then session_full`
    - `last seat race`: two concurrent `reserve_group_seat` calls on a session with 1 seat left → exactly one fulfilled, one rejected with `session_full`
    - `ensure_group_sessions creates Sat and Sun occurrences through 2026-11-29` (expected count 14: 4 Saturdays and 10 Sunday sessions, 2026-11-01..2026-11-29)
    - `ensure_group_sessions is idempotent` (second call returns 0)
    - `Sunday 2026-11-01 08:15 London is stored as 08:15Z`
    - `Saturday 2027-04-03 08:15 London is stored as 07:15Z`
- [ ] **Step 2:** Run `npm run db:reset && npm run test:db`. Expected: FAIL.
- [ ] **Step 3:** Write `0002_rls.sql` and `0003_functions.sql`.
- [ ] **Step 4:** Run `npm run db:reset && npm run test:db`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(db): RLS policies, admin check and group seat functions`.

---

### Task 5: London time, calendar periods and slot generation

**Files:**
- Create: `src/lib/time.ts`, `src/lib/format.ts`, `src/lib/calendar/periods.ts`, `src/lib/calendar/slots.ts`, `tests/unit/periods.test.ts`, `tests/unit/slots.test.ts`, `tests/unit/format.test.ts`

**Interfaces:**
- `londonDateTime(date: string /* YYYY-MM-DD */, time: string /* HH:mm */): Date`, `londonDateOf(instant: Date): string`, `londonWeekday(date: string): number` (0 = Sunday)
- `formatPence(p: number): string` (`2500 → "£25"`, `1250 → "£12.50"`); `formatLondon(instant: Date, pattern: string): string`
- `periodFor(date: string, terms: TermPeriod[]): PeriodKind`
- `generateSlots(input: SlotInput): Slot[]`, where:
  - `SlotInput = { now: Date; fromDate: string; toDate: string; kind: 'assessment'|'one_to_one'; location: LocationKind; settings: Settings; rules: AvailabilityRule[]; terms: TermPeriod[]; blocks: BlockedTime[]; blockRules: BlockedRule[]; busy: { start: Date; end: Date }[] }`
  - `Slot = { startsAt: Date; endsAt: Date }`
- Behaviour:
  - Drops slots before `now + min_notice_hours` and after `now + booking_window_days`.
  - Drops slots whose `[start, end + buffer)` overlaps `busy`, a block or a block rule. The buffer is `home_visit_buffer_minutes` for `home_visit`, else 0.
  - Drops a location that is disabled in settings (`online_enabled` etc.) or not in the rule's `locations`.
  - Callers pass existing bookings' `[starts_at, busy_until)` and scheduled group sessions as `busy`.

- [ ] **Step 1: Write failing tests** (all with seed-equivalent fixtures; `now = 2026-10-31T12:00Z` unless stated; `booking_window_days` raised in fixtures where dates are further out):
  - `periodFor('2026-11-03') = 'term'`; `periodFor('2026-12-21') = 'holiday'`; `periodFor('2027-03-09') = 'holiday'`; `periodFor('2026-09-01') = 'term'` (inset day)
  - `term Tuesday 2026-11-03 tutor_place → 17:00, 18:00, 19:00` (UTC 17:00Z, 18:00Z, 19:00Z)
  - `holiday Monday 2026-12-21 → 15 slots 07:00..21:00`
  - `Sunday 2026-11-08 → 7 slots 10:30..16:30`
  - `Saturday → no 1-to-1 slots`
  - `Christmas Day 2026-12-25 blocked → none`
  - `handles BST start: Sunday 2027-03-28 first slot = 09:30Z`
  - `handles GMT return: Sunday 2026-10-25 first slot = 10:30Z` (with `now` 2026-10-20)
  - `online excluded while online_enabled false`
  - `home_visit only on Sunday`
  - `home visit needs 30 min after: existing booking at 11:30 removes the 10:30 home-visit slot but not the 10:30 tutor_place slot`
  - `respects 24h minimum notice` (now = Mon 2026-11-02T18:30Z: Tue 17:00 at 22.5 h excluded, 18:00 at 23.5 h excluded, 19:00 at 24.5 h included)
  - `respects 28-day window`
  - `blocked rule every Wednesday 17:00–18:00 removes Wednesday 17:00 only`
  - `formatPence(2500) = "£25"`; `formatPence(1250) = "£12.50"`
- [ ] **Step 2:** Run `npx vitest run tests/unit/periods.test.ts tests/unit/slots.test.ts tests/unit/format.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement with `@date-fns/tz` (`TZDate` in `Europe/London`); never do arithmetic on local wall-clock strings.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat: London-time slot generation for term and holiday hours`.

---

### Task 6: Pricing, postcode, cancellation, eligibility and owed money (pure rules)

**Files:**
- Create: `src/lib/booking/{pricing,postcode,cancellation,eligibility,owed}.ts`, `tests/unit/{pricing,postcode,cancellation,eligibility,owed}.test.ts`

**Interfaces:**
- `quote(item: QuoteItem, s: Settings): { basePence: number; travelPence: number; totalPence: number; perBookingPence: number[] }`, where:
  - `QuoteItem = { type: 'assessment'|'one_to_one'; location: LocationKind } | { type: 'group' } | { type: 'sunday_bundle' } | { type: 'block'; product: 'saturday'|'sunday_bundle'; weeks: 6|10 }`
  - `perBookingPence` splits the total across the bookings created. A bundle gives `[1500, 1500]`. A block gives an even split, with the remainder on the first booking.
- `normalisePostcode(pc: string): string`; `isAllowedPostcode(pc: string, districts: string[]): boolean`. The district is the outward code (before the space, or the input minus its last 3 characters).
- `cancellationOutcome(startsAt: Date, now: Date, noticeHours: number, by: 'parent'|'tutor'): 'free'|'late'`. A tutor cancellation is always `'free'`.
- `checkEligibility(ctx: EligibilityCtx): { ok: true } | { ok: false; reason: IneligibleReason }`, where:
  - `IneligibleReason = 'account_blocked'|'money_owed'|'agreement_missing'|'assessment_required'|'not_approved'|'assessment_in_person_only'|'online_disabled'|'location_disabled'|'home_visit_sunday_only'|'postcode_not_allowed'`
  - `EligibilityCtx = { profile: { isBlocked: boolean }; owedPence: number; hasAgreement: boolean; assessmentBooked: boolean; approved: boolean; request: { type: 'assessment'|'one_to_one'|'group'|'sunday_bundle'|'block'; location?: LocationKind; londonWeekday?: number; postcode?: string }; settings: Settings }`
- `IneligibleMessage: Record<IneligibleReason, string>`: parent-facing copy, e.g. `money_owed: "You have an unpaid balance. Please pay it before booking again."`, `assessment_required: "Each child starts with a £10 Assessment Lesson."`
- `amountOwedPence(bookings: Booking[], ledger: LedgerEntry[], now: Date): number`. Counts bookings with `payment_status = 'unpaid'` that are `late_cancelled`, or `no_show`/`attended`/`confirmed` with `startsAt <= now`, using each booking's stored `pricePence + travelFeePence`.
- `isFlagged(bookings: Booking[], now: Date, threshold: number): boolean`. Counts `late_cancelled` + `no_show` within the last 365 days.

- [ ] **Step 1: Write failing tests:**
  - Pricing:
    - `assessment tutor_place = 1000`
    - `assessment home_visit = 1500 (base 1000, travel 500)`
    - `1-to-1 home_visit = 3000`
    - `group = 1800`
    - `sunday_bundle = 3000 split [1500,1500]`
    - `block saturday 6 = 10200 split six ways [1700 x6]`
    - `block sunday_bundle 10 = 27000 across 20 bookings [1350 x20]`
    - `block saturday 10 = 16200`
  - Postcode:
    - true: `'bb1 1qr'`, `'BB2 4HP'`, `'BB11QR'`
    - false: `'BB10 1AA'`, `'BB11 2AB'`, `'BB12 7XY'`, `'BB3 1AA'`, `'M1 1AA'`, `''`
  - Cancellation:
    - `exactly 48h before → free`
    - `47h59m before → late`
    - `tutor cancels 1h before → free`
  - Eligibility:
    - `blocked account → account_blocked` (checked first)
    - `owed > 0 → money_owed`
    - `no agreement → agreement_missing`
    - `one_to_one before approval → not_approved`
    - `group before approval → not_approved`
    - `assessment online → assessment_in_person_only`
    - `home_visit on Tuesday → home_visit_sunday_only`
    - `home_visit postcode BB3 → postcode_not_allowed`
    - `online one_to_one while disabled → online_disabled`
    - `approved child, group → ok`
  - Owed:
    - `late cancellation unpaid counts`
    - `future confirmed unpaid does not count`
    - `waived does not count`
    - `amountOwed uses stored booking price` (booking stored at 2500 while settings now 3000 → 2500)
  - Flags:
    - `isFlagged true at 2 within a year`
    - `isFlagged false when one is older than 365 days`
- [ ] **Step 2:** Run `npx vitest run tests/unit/pricing.test.ts tests/unit/postcode.test.ts tests/unit/cancellation.test.ts tests/unit/eligibility.test.ts tests/unit/owed.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the five modules.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat: pricing, postcode, cancellation and eligibility rules`.

---

### Task 7: Supabase clients, settings loader and parent authentication

**Files:**
- Create: `src/lib/supabase/{server,client,service}.ts`, `src/lib/settings.ts`, `src/lib/turnstile.ts`, `src/middleware.ts`, `src/app/(auth)/signup/{page.tsx,actions.ts}`, `src/app/(auth)/login/page.tsx`, `src/app/(auth)/verify/page.tsx`, `src/app/(auth)/reset/page.tsx`, `src/app/auth/callback/route.ts`, `tests/e2e/helpers.ts`, `tests/e2e/auth.spec.ts`

**Interfaces:**
- `createServerClient()` (cookie session), `createBrowserClient()`, `createServiceClient()` (server-only; throws if imported client-side)
- `getSettings(): Promise<Settings>`, `getPrivateSettings(): Promise<PrivateSettings>` (service client, server-only), `updateSettings(patch: Partial<Settings>)`, `updatePrivateSettings(patch)`
- `verifyTurnstile(token: string | null): Promise<boolean>`: returns true when `TURNSTILE_SECRET_KEY` is unset (local/test)
- `<Turnstile />` widget renders only when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set; its token is passed as `options.captchaToken` to `auth.signUp`, `signInWithPassword` and `resetPasswordForEmail` (Supabase CAPTCHA is enabled in production, Task 18)
- `signUp(formData)`: validates with zod (name, email, UK phone `^(\+44|0)7\d{9}$` after stripping spaces, password ≥ 10 chars). Requires the `age_guardian` and `terms` checkboxes; `marketing` is optional. Calls `auth.signUp` with metadata, then inserts the three `consents` rows with `POLICY_VERSION`.
- Middleware refreshes the session; `/account/**` requires login, otherwise redirect to `/login?next=…`.
- E2E helpers: `createParent(page, overrides?)` (signs up, confirms via the local Mailpit API on `:54324`, logs in), `createAdmin()` (service client creates a user with role admin plus a TOTP factor; returns the TOTP secret), `seedApprovedChild(parentId)`.

- [ ] **Step 1: Write failing tests** `auth.spec.ts`:
  - `signup requires both mandatory consents` (submit with them unticked shows two errors and creates no account)
  - `checkboxes start unticked`
  - `signup → verify email → login → lands on /account`
  - `consents stored with policy version 2026-11-01`
  - `/account redirects to /login when signed out`
  - `rejects phone 12345`
- [ ] **Step 2:** Run `npx playwright test tests/e2e/auth.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat: parent sign-up with recorded consents, login and reset`.

---

### Task 8: Children and the Parent/Guardian Agreement form

**Files:**
- Create: `src/app/account/children/{page.tsx,new/page.tsx,actions.ts}`, `src/app/account/children/[id]/agreement/{page.tsx,actions.ts}`, `src/lib/agreement.ts` (form text and version), `tests/e2e/children.spec.ts`

**Interfaces:**
- `addChild(formData)`: zod-validated per Task 3 checks; inserts with the user's client (RLS).
- `signAgreement(childId, formData)`: requires emergency contact name and phone, `consent_contact`, an agreement tick, and `signed_name` equal (case-insensitive, trimmed) to the profile's `full_name`. Stores `policy_version` and `signed_at`.
- `AGREEMENT_TEXT`: headings cover terms and cancellation agreement, online lesson rules (rendered only when `online_enabled`), contact consent, and emergency/medical info. The title is "Parent/Guardian Agreement & Consent Form"; the word "waiver" is never used.

- [ ] **Step 1: Write failing tests** `children.spec.ts`:
  - `add child Year 11 AQA Higher Chemistry`
  - `cannot choose Year 9`
  - `agreement rejects mismatched signature name`
  - `agreement saved shows "Signed on <date>"`
  - `medical notes shown back to the parent but not on any public page`
- [ ] **Step 2:** Run `npx playwright test tests/e2e/children.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat: children profiles and signed agreement form`.

---

### Task 9: Booking flow (assessment, 1-to-1, group, Sunday bundle, group blocks)

**Files:**
- Create: `src/lib/booking/block.ts`, `src/lib/booking/service.ts` (server-only orchestration), `src/app/account/book/{page.tsx,actions.ts}`, `src/app/account/book/steps/*.tsx`, `src/app/account/bookings/[id]/page.tsx` (confirmation with payment details), `tests/unit/block.test.ts`, `tests/unit/booking-service.test.ts`, `tests/e2e/booking.spec.ts`

**Interfaces:**
- `planBlock(sessions: GroupSession[], seatsLeft: Record<string, number>, product, weeks, firstDate: string): { ok: true; sessionIds: string[] } | { ok: false; fullDate: string }`. For `sunday_bundle`, one "week" means both Sunday sessions on that date. Cancelled sessions are skipped.
- `getAvailableSlots(childId, kind, location, fromDate, toDate): Promise<Slot[]>`: loads data, then calls `generateSlots`.
- `createBooking(input): Promise<{ ok: true; bookingId: string } | { ok: false; reason: IneligibleReason | 'slot_taken' | 'session_full' | 'cooling_off_required' }>`:
  - Re-runs `checkEligibility` and verifies the slot is still in `generateSlots`.
  - Prices with `quote`.
  - Sets `busy_until` (end + 30 min for home visits), and `status = 'pending'` for home visits, otherwise `'confirmed'`.
  - Maps Postgres `23P01` to `slot_taken`.
  - Requires the `cooling_off` consent and records it with `booking_id`.
- `createGroupBooking(childId, sessionId)`, `createSundayBundle(childId, date)` (two seats via `reserve_group_seat` with a shared `bundle_id`, all-or-nothing), and `createBlockBooking(childId, product, weeks, firstDate)` (one `block_bookings` row with `hold_expires_at = now + 72h`, then seats). These return the same result shape.
- Parent-visible payment details on the confirmation page come from `getPrivateSettings()`, shown only when the booking belongs to the user and is not `declined`/`cancelled`:
  - bank account name, sort code, account number, and the booking's reference
  - the teaching address for `tutor_place`
  - the meeting link for `online`
  - the venue for groups

- [ ] **Step 1: Write failing tests:**
  - `block.test.ts`:
    - `planBlock 6 weeks Saturday returns 6 ids`
    - `planBlock skips cancelled week` (week 2 cancelled → ids are weeks 1, 3–7)
    - `planBlock rejects full week` (firstDate 2026-11-07; week 3 has 0 seats → `{ ok: false, fullDate: '2026-11-21' }`)
    - `sunday_bundle 6 weeks returns 12 ids`
  - `booking-service.test.ts` (Supabase local, real DB):
    - `createBooking returns slot_taken on exclusion violation` (simulate a race by inserting the conflicting row after the slot check)
    - `home visit stored pending with busy_until +30m and travel 500`
    - `assessment for unapproved child ok; one_to_one returns not_approved`
    - `price snapshot stored on booking`
  - `booking.spec.ts` (e2e, both viewports):
    - `new parent books £10 assessment at tutor's place and sees reference SLC-#### and bank details`
    - `group options hidden until approved`
    - `home visit with BB3 postcode shows "We only visit BB1 and BB2 postcodes"`
    - `no "online" text anywhere in the wizard while disabled`
    - `price summary shows £15 for home-visit assessment before confirming`
    - `late-cancellation and 48-hour policy shown before confirm`
    - `cannot confirm without cooling-off tick`
- [ ] **Step 2:** Run `npm run test:unit -- block && npx vitest run tests/unit/booking-service.test.ts && npx playwright test tests/e2e/booking.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `block.ts`, `service.ts`, then the wizard (child → type → location → slot/session → review → confirm).
- [ ] **Step 4:** Run the same commands. Expected: PASS.
- [ ] **Step 5:** Commit `feat: booking flow with eligibility, pricing and race-safe confirmation`.

---

### Task 10: Parent dashboard (bookings, cancellations, balance, account)

**Files:**
- Create: `src/app/account/page.tsx`, `src/app/account/bookings/{page.tsx,actions.ts}`, `src/app/account/settings/{page.tsx,actions.ts}`, `src/lib/account-deletion.ts`, `tests/e2e/dashboard.spec.ts`, `tests/unit/account-deletion.test.ts`

**Interfaces:**
- `cancelBooking(bookingId)`:
  - Uses `cancellationOutcome`. `free` → status `cancelled`, and a prepaid booking gets payment_status `credited` (the tutor later records a refund if wanted). `late` → status `late_cancelled`, fee owed.
  - A late cancellation needs a second confirmation showing "A late cancellation fee of £X will be due".
- `setMarketingOptIn(on: boolean)`: also stores a `consents` row.
- `deleteAccount()` (in `account-deletion.ts`):
  - Refuses while `amountOwedPence > 0` (message explains why).
  - Otherwise, using the service client: deletes children (cascade agreements/notes/status) and consents; sets `bookings.parent_id/child_id`, `home_address` and `home_postcode` to null; keeps price, ledger and dates; deletes the auth user (cascade profile).
- The dashboard shows upcoming/past bookings, `amountOwedPence` with references, each child's agreement and approval status, and a "Book" call to action.

- [ ] **Step 1: Write failing tests:**
  - `dashboard.spec.ts`:
    - `free cancellation 3 days ahead`
    - `late cancellation shows fee dialog and records late_cancelled`
    - `owed balance blocks new booking with money_owed message`
    - `marketing opt-in toggles`
  - `account-deletion.test.ts`:
    - `delete anonymises bookings but keeps ledger amounts`
    - `refuses while money owed`
- [ ] **Step 2:** Run both. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run both. Expected: PASS.
- [ ] **Step 5:** Commit `feat: parent dashboard, cancellations and account deletion`.

---

### Task 11: Emails and the daily cron

**Files:**
- Create: `src/lib/email/send.ts`, `src/lib/email/templates/{BookingConfirmed,HomeVisitDecision,FreeCancelReminder,LessonReminder,CancellationReceipt,GroupCancelled,BlockPaymentReminder,AdminNotice,ContactMessage}.tsx`, `src/lib/email/reminders.ts`, `src/app/api/cron/daily/route.ts`, `vercel.json` (cron `0 7 * * *` → `/api/cron/daily`), `tests/unit/reminders.test.ts`, `tests/unit/email-content.test.ts`
- Modify: `src/lib/booking/service.ts`, `src/app/account/bookings/actions.ts` (send on events)

**Interfaces:**
- `sendEmail({ to, template, props, bookingId?, blockBookingId? }): Promise<'sent'|'skipped'>`. Inserts `email_log` first; a unique conflict means `'skipped'` (idempotent). Transport is `resend` or `log` (writes the JSON to stdout) via `EMAIL_TRANSPORT`. Every email footer has the business name, email and contact link. Only marketing emails carry an unsubscribe link.
- `dueReminders(bookings: Booking[], now: Date): { bookingId: string; template: 'free_cancel_reminder'|'lesson_reminder' }[]`:
  - `free_cancel_reminder` for confirmed bookings starting in (48 h, 96 h]. It says "Free cancellation ends <start − 48 h>".
  - `lesson_reminder` for confirmed bookings starting in (0, 36 h].
- `expiredBlockHolds(blocks, now)`: `held` blocks whose `hold_expires_at < now` and aren't paid → admin notice. A 48-hour-old unpaid block → `BlockPaymentReminder` to the parent.
- Cron route:
  - Checks `Authorization: Bearer ${CRON_SECRET}`, otherwise 401.
  - Runs reminders, block checks and `ensure_group_sessions(today + 84 days)`.
  - Returns JSON counts. Running it also keeps the Supabase project awake.
- Admin notices go to `BUSINESS_INBOX` on: new booking, home-visit request, new sign-up, late cancellation, contact form.

- [ ] **Step 1: Write failing tests:**
  - `reminders.test.ts`:
    - `lesson 30h away → lesson_reminder`
    - `lesson 72h away → free_cancel_reminder with deadline 24h from now`
    - `cancelled booking → none`
    - `lesson 40h away → none`
  - `email-content.test.ts` (render to HTML):
    - `BookingConfirmed includes SLC reference, £ total, bank details and teaching address for tutor_place`
    - `BookingConfirmed never includes teaching address for group bookings`
    - `no template contains "fine" or "penalty"`
    - `transactional templates have no unsubscribe link`
  - `cron returns 401 without secret`
- [ ] **Step 2:** Run `npx vitest run tests/unit/reminders.test.ts tests/unit/email-content.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat: transactional emails and daily reminder cron`.

---

### Task 12: Admin access with 2-step verification

**Files:**
- Create: `src/app/admin/layout.tsx`, `src/app/admin/mfa/{page.tsx,actions.ts}`, `src/lib/admin-guard.ts`, `tests/e2e/admin-auth.spec.ts`

**Interfaces:**
- `requireAdmin(): Promise<{ userId: string }>`: redirects to `/login` if not logged in, to `/account` if not admin, and to `/admin/mfa` if the session is not `aal2`.
- MFA page: enrol (QR + secret) if no verified TOTP factor, otherwise challenge/verify a 6-digit code.

- [ ] **Step 1: Write failing tests** `admin-auth.spec.ts`:
  - `parent visiting /admin is sent to /account`
  - `admin without code is sent to /admin/mfa`
  - `admin with valid TOTP reaches Today` (generate the code in the test from the helper's secret with `otplib`)
  - `wrong code shows error`
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it. Expected: PASS.
- [ ] **Step 5:** Commit `feat: admin area protected by TOTP 2-step verification`.

---

### Task 13: Admin Today, Bookings and Families

**Files:**
- Create: `src/app/admin/page.tsx` (Today), `src/app/admin/bookings/{page.tsx,actions.ts}`, `src/app/admin/families/{page.tsx,[id]/page.tsx,actions.ts}`, `src/lib/admin/queries.ts`, `tests/e2e/admin-ops.spec.ts`

**Interfaces:**
- Actions (each starts with `requireAdmin()` and uses the service client):
  - `markPaid(bookingId, method)` and `markBlockPaid(blockId, method)`: set `paid` and write a `ledger` payment (amount = stored price + travel, `occurred_on` = today, London)
  - `markAttended`, `markNoShow`, `waiveFee(bookingId)` (payment_status `waived`, ledger `waiver`)
  - `tutorCancel(bookingId, refund: boolean)`: status `cancelled`, `cancelled_by 'tutor'`; credit or refund ledger if paid; sends the email
  - `decideHomeVisit(bookingId, approve)`: confirmed/declined plus email. On approve, also inserts a `mileage` row for that date with `miles` null.
  - `approveStudent(childId)`: allowed only once an assessment booking is `attended`; sets `approved_at`
  - `setBlocked(parentId, blocked, reason)`
  - `addNote(childId, body)`
  - `addManualBooking(input)`: skips eligibility and slot rules but not DB constraints; can use `online` regardless of the toggle
  - `releaseBlock(blockId)`: block status `released` and its bookings `cancelled`
- Today shows:
  - today's bookings (London date): time, child, kind, location, paid badge
  - alerts: pending home visits, unpaid past lessons, block holds expired, children with an agreement but no assessment, children with an attended assessment awaiting approval, and parents where `isFlagged` (threshold from settings)
- Family page:
  - `tel:`, `https://wa.me/44…` and `mailto:` links built from the stored phone/email
  - children with agreement details (including medical/SEN), status, notes, history, owed, flag count, and a block toggle

- [ ] **Step 1: Write failing tests** `admin-ops.spec.ts`:
  - `mark paid writes ledger and shows Paid`
  - `cannot approve before attended assessment; can after`
  - `approving home visit emails parent and creates mileage row`
  - `blocked parent sees "Please contact Study Lab Co" when booking`
  - `flagged parent appears in alerts after 2 late cancellations`
  - `tap-to-call link is tel:+447…`
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it. Expected: PASS.
- [ ] **Step 5:** Commit `feat: admin Today, bookings and family management`.

---

### Task 14: Admin calendar, group manager, settings, calendar feed and backup

**Files:**
- Create: `src/app/admin/calendar/{page.tsx,actions.ts}`, `src/app/admin/groups/{page.tsx,actions.ts}`, `src/app/admin/settings/{page.tsx,actions.ts}`, `src/app/api/calendar/[token]/route.ts`, `src/app/api/admin/backup/route.ts`, `tests/e2e/admin-config.spec.ts`, `tests/unit/ics.test.ts`

**Interfaces:**
- Calendar actions:
  - `blockRange(startsAt, endsAt, reason)` and `blockRepeating(weekday, start, end, validFrom, validTo?, reason)`
  - `closeDay(date)`: whole London day. `reopenDay(date)`: deletes whole-day blocks for that date.
  - `unblock(id)`
  - The week/month view colour-codes assessment, 1-to-1, group and blocked. Inset days (2026-09-01, 2027-01-04) are tagged "Inset day".
- Group actions:
  - `createSeries(input)` (then `ensure_group_sessions`), `createOneOff(input)`, `updateSeries`, `updateSession`
  - `cancelSession(sessionId, refund: boolean)`: cancels its bookings, writes credit/refund ledger for paid ones, emails each family `GroupCancelled`
  - `endSeries(seriesId)` (`active = false`, future sessions without bookings deleted, sessions with bookings left for manual cancel)
  - `emailGroup(sessionId, subject, message)`
- Settings form edits every field of `settings` and `settings_private`, including the three location toggles and the block price table. Bank details and the address are validated (sort code `^\d{2}-?\d{2}-?\d{2}$`, account number `^\d{8}$`).
- `GET /api/calendar/[token]`: if the token matches `calendar_feed_token`, returns `text/calendar` with all non-cancelled bookings and group sessions for −30..+120 days. Titles look like "Assessment — Aisha (Y11, AQA Chem) — Tutor's place". Otherwise 404.
- `GET /api/admin/backup` (`requireAdmin`): a JSON file of all tables, named `studylabco-backup-YYYY-MM-DD.json`.

- [ ] **Step 1: Write failing tests:**
  - `admin-config.spec.ts`:
    - `close day removes all parent slots that day; reopen restores`
    - `new weekly group appears on /groups with 15 seats left`
    - `cancel group session emails booked families and frees seats`
    - `turning online on makes online appear in booking wizard; off hides it`
    - `price change applies to new bookings only`
  - `ics.test.ts`:
    - `feed contains booking with London-correct DTSTART`
    - `wrong token → 404`
- [ ] **Step 2:** Run both. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run both. Expected: PASS.
- [ ] **Step 5:** Commit `feat: admin calendar, group manager, settings, ICS feed and backup`.

---

### Task 15: Money: expenses, mileage and the HMRC Tax Year Pack

**Files:**
- Create: `src/lib/money/{tax-year,tax-pack,xlsx,pdf}.ts`, `src/app/admin/money/{page.tsx,actions.ts}`, `src/app/admin/money/tax/page.tsx`, `src/app/api/admin/tax-pack/route.ts`, `supabase/migrations/0005_storage.sql` (private bucket `receipts`, admin-only policies), `tests/unit/tax-year.test.ts`, `tests/unit/tax-pack.test.ts`

**Interfaces:**
- `taxYearFor(date: string): { label: string; start: string; end: string }` (`'2026-11-01' → { label: '2026-27', start: '2026-04-06', end: '2027-04-05' }`; `'2027-04-05' → '2026-27'`; `'2027-04-06' → '2027-28'`)
- `quarterRanges(label): { q: 1|2|3|4; start: string; end: string }[]` (06 Apr–05 Jul, 06 Jul–05 Oct, 06 Oct–05 Jan, 06 Jan–05 Apr)
- `mileageAllowancePence(totalMiles: number): number`: 45p for the first 10,000 miles, 25p after
- `buildTaxPack(range, ledger, bookings, expenses, mileage): TaxPack`, where:
  - `TaxPack = { summary: { turnoverPence; expensesPence; mileagePence; allowableTotalPence; profitPence; tradingAllowanceBetter: boolean }; income: IncomeRow[]; monthly: MonthlyRow[]; expenses: ExpenseRow[]; mileage: MileageRow[]; refundsAndWaivers: Row[]; unpaidAtEnd: Row[] }`
  - turnover = payments − refunds within the range (cash basis, by `occurred_on`)
  - `tradingAllowanceBetter` = allowableTotal < 100000 pence
- `toXlsx(pack): Promise<Buffer>`: seven sheets named exactly "1. Summary" … "7. Unpaid at year end", with the summary labelled for the Self Assessment self-employment pages ("Turnover", "Allowable expenses", "Net profit"). `toPdf(pack): Promise<Uint8Array>`: a one-page summary.
- Actions: `addExpense(formData)` (receipt image ≤ 10 MB to bucket `receipts/YYYY/uuid.ext`), `setMiles(mileageId, miles)`, `recordRefund(bookingId, amount)`.
- Categories: room/venue hire, insurance, DBS, website & domain, books & resources, ICO fee, stationery, phone/internet, virtual office, other.

- [ ] **Step 1: Write failing tests:**
  - `tax-year.test.ts`: the boundary cases above, plus `quarterRanges('2026-27')[2] = { start: '2026-10-06', end: '2027-01-05' }`
  - `tax-pack.test.ts` (fixture: payments 2500 + 1800 + 1000, refund 1800, expense 2150 dated 2026-11-03, mileage 12.0 miles):
    - `turnover 3500`
    - `mileage 540` (12 × 45)
    - `allowable 2690`
    - `profit 810`
    - `tradingAllowanceBetter true`
    - `income rows sorted by date`
    - `payment dated 2027-04-06 excluded from 2026-27`
    - `xlsx has 7 sheets in order`
    - `mileageAllowancePence(10010) = 450250`
- [ ] **Step 2:** Run `npx vitest run tests/unit/tax-year.test.ts tests/unit/tax-pack.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the libraries, then the Money page (outstanding list, income this week/month/year, expense form with camera capture `accept="image/*" capture="environment"`, mileage list) and the Tax page (pick year or quarter; download `.xlsx` and `.pdf`).
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat: expenses, mileage and HMRC Tax Year Pack export`.

---

### Task 16: Public pages, legal pages and contact form

Use the `frontend-design:frontend-design` skill for the Home page.

**Files:**
- Create: `src/app/(public)/{page.tsx,about/page.tsx,lessons/page.tsx,groups/page.tsx,faq/page.tsx,contact/{page.tsx,actions.ts},terms/page.tsx,refunds/page.tsx,privacy/page.tsx,cookies/page.tsx,safeguarding/page.tsx,accessibility/page.tsx}`, `src/components/site/{Hero,PriceTable,GroupList,HowItWorks,Steps}.tsx`, `src/content/legal/*.mdx` (or TSX), `tests/e2e/public.spec.ts`

**Interfaces:**
- Prices on Home and Lessons are read from `getSettings()`, never hard-coded. Location wording depends on the toggles.
- About page: the exact qualification list from spec §3.1. No photo.
- `/groups`: future scheduled sessions with title, date, time, year group, `seats_left`, and venue or "Location confirmed on booking".
- Testimonials section renders only if a `testimonials` array in content is non-empty (empty at launch).
- `sendContact(formData)`: name, email, phone optional, message ≤ 2000 chars, Turnstile → `AdminNotice` email to `BUSINESS_INBOX`. Nothing is stored.
- Legal pages:
  - Terms: bookings, payment by bank transfer or cash before the lesson, 48-hour rule and late cancellation fee, conduct, 14-day cooling-off wording.
  - Refund Policy: spec §2.9.
  - Privacy: data list from spec §4, lawful bases, retention (financial 6 years), processors (Supabase EU, Vercel, Resend EU, Cloudflare Turnstile), rights, deletion, ICO complaint.
  - Cookies: essential auth cookies only.
  - Safeguarding: enhanced DBS, parent present at the assessment.
  - Accessibility statement.
  - Each shows "Last updated 1 November 2026".
- `generateMetadata` per page with a title and description. `robots.ts` and `sitemap.ts` exclude `/account` and `/admin`.

- [ ] **Step 1: Write failing tests** `public.spec.ts` (both viewports):
  - `every public page returns 200 and passes axe`
  - `home shows "Qualified Teacher (QTS)", "Enhanced DBS Checked", "All Exam Boards" and "Book your £10 Assessment Lesson"`
  - `no public page contains "BB1 1QR", the sort code, or "online" while online is disabled`
  - `about lists Jamiatul Ilm Wal Huda, Clitheroe Royal Grammar School Sixth Form, University of Salford, Edge Hill University`
  - `changing group price in settings changes /lessons`
  - `contact form sends and shows thanks`
  - `no page loads a script from a host other than self and challenges.cloudflare.com` (inspect requests)
  - `keyboard-only user can reach and submit the contact form`
  - `no testimonials section at launch`
- [ ] **Step 2:** Run `npx playwright test tests/e2e/public.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat: public site, legal pages and contact form`.

---

### Task 17: Full journey test, design review and polish

**Files:**
- Create: `tests/e2e/journey.spec.ts`
- Modify: any files the review findings require

- [ ] **Step 1: Write the journey test** (both viewports), spec §8.4: parent signs up → adds child → signs agreement → books an assessment at the tutor's place → admin (TOTP) marks it attended and approves → parent books a Saturday 6-week block (£102) → the parent's dashboard shows 6 sessions and reference → parent late-cancels week 1 (fee dialog) → admin marks the block paid → admin downloads the Tax Year Pack, whose Income sheet contains 10200.
- [ ] **Step 2:** Run `npx playwright test tests/e2e/journey.spec.ts`. Expected: PASS. If it fails, fix the owning task's code and add a regression test there.
- [ ] **Step 3:** Run the `website-design:web-review` skill against `npm run dev` on Home, Lessons, Booking and Admin Today at 393 px and 1366 px. Apply the high- and medium-priority fixes. Run `audit-suite:make-interfaces-feel-better` on the booking wizard.
- [ ] **Step 4:** Run `npm run check && npm run test:db && npm run test:e2e`. Expected: all pass.
- [ ] **Step 5:** Commit `test: full parent/admin journey; polish from design review`.

---

### Task 18: Production deployment and launch checklist

Steps marked **(owner)** are done by the owner, guided in chat. Secrets are never pasted into chat.

**Files:**
- Create: `docs/launch-checklist.md`

- [ ] **Step 1:** Apply migrations `0001`–`0005` to the Supabase project `baqcorhqgahvpshnvcjg` (eu-west-1) with the Supabase MCP `apply_migration`. Run `get_advisors` (security + performance). Expected: no security warnings.
- [ ] **Step 2:** Create the Vercel project from GitHub `studylabco123/studylabco` (framework Next.js) and set the env vars from Task 1. Non-secret values are set by the agent. **(owner)** pastes `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TURNSTILE_SECRET_KEY` and `CRON_SECRET` in Vercel → Project → Settings → Environment Variables.
- [ ] **Step 3:** **(owner)** In Supabase → Authentication:
  - Site URL `https://studylabco.co.uk`, redirect `https://studylabco.co.uk/auth/callback`
  - Custom SMTP: host `smtp.resend.com`, port 465, user `resend`, password = Resend API key, sender `bookings@studylabco.co.uk`
  - Enable CAPTCHA (Turnstile) and MFA (TOTP)
- [ ] **Step 4:** Add the domain `studylabco.co.uk` and `www` in Vercel. **(owner)** adds the A/CNAME records Vercel shows into Namecheap Advanced DNS and removes the Namecheap parking records. Verify with Vercel `verify_project_domain`. Expected: valid, with HTTPS active.
- [ ] **Step 5:** Confirm the Resend domain status is `verified` (`get-domain`).
- [ ] **Step 6:** **(owner)** Signs up on the live site with `studylabco123@gmail.com`. The agent sets `role = 'admin'` via `execute_sql`. **(owner)** enrols TOTP at `/admin/mfa`, then fills Settings (bank details, teaching address, phone, group venue if known).
- [ ] **Step 7:** Smoke-test production: home 200, sign-up email arrives from `bookings@studylabco.co.uk`, cron `GET /api/cron/daily` with the secret returns counts, and the calendar feed subscribes in iPhone Calendar.
- [ ] **Step 8:** **(owner)** Acceptance test on their own iPhone (Safari) and Windows PC (Edge) using a second email as a pretend parent, following `docs/launch-checklist.md`. Delete the test account afterwards.
- [ ] **Step 9:** Commit `docs: launch checklist`, then push to `main`.
