# Study Lab Co v2 Changes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the owner-approved v2 changes: the 50% late fee with phone/email-only late cancellation, group passes, KS3 (Years 7–9), test results for parents, credit administration, info icons, and the Q&A page.

**Architecture:** This extends the existing Next.js 15 + Supabase app on branch `build/website`. Business rules stay in pure functions in `src/lib/**`, tested with Vitest. DB changes go in new migrations from `0011`. Server actions authorise first (`requireAdmin()` for admin, session parent for parents) and write with the service client. Emails go through `sendEmail` and the templates registry.

**Tech Stack:** Same as before: Next.js 15, TypeScript, Tailwind 4, Supabase (local stack in Docker for tests), Resend, Vitest, Playwright (production build, workers 2; serial `config`/`config-hours` projects for tests that change shared state).

**Spec:** `docs/superpowers/specs/2026-11-01-studylabco-v2-changes-design.md`. This overrides the base spec `docs/superpowers/specs/2026-10-31-studylabco-website-design.md` where they differ.

## Global Constraints

- Money is integer pence. Late fee = `Math.round(pricePence * lateFeePercent / 100)`, excluding travel. Default `lateFeePercent` is 50.
- New price defaults (pence): KS3 assessment 750, KS3 1-to-1 2000, KS3 group 1400. Passes: KS3 6 = 7900, KS3 10 = 12600, GCSE 6 = 10200, GCSE 10 = 16200. Home-visit travel fee stays 500. All are editable settings, and existing bookings keep their stored price.
- Pass rules: valid `passValidityMonths` (6) from the date marked paid; pass sessions must be booked at least `passMinNoticeDays` (7) before the session; a pass can only be used once marked paid; a Sunday bundle uses 2 sessions of a GCSE pass.
- Levels: Years 7–8 are KS3, Years 10–11 are GCSE, and Year 9 is chosen by the parent. Year 9 always books the GCSE assessment (£10). KS3 children can book the assessment, 1-to-1 and KS3 groups. GCSE children can book the assessment, 1-to-1 and GCSE groups.
- Saturday group: "KS3 only (Years 7–9)", £14.
- Parent website cancellation only when the lesson is ≥ `cancellationNoticeHours` (48) away. Otherwise show "Less than 48 hours to go — please call or email Study Lab Co to cancel. A 50% late cancellation fee applies."
- Cooling-off (`COOLING_OFF_DAYS` = 14 from booking, or from pass purchase) always makes cancellation free. Unused pass value within cooling-off becomes account credit.
- Credit never counts as income. A parent can email to have any credit refunded to their card.
- Copy never uses "fine", "penalty" or "waiver". Online wording stays hidden while `onlineEnabled` is false.
- Every admin page and action calls `requireAdmin()` first (extend `tests/unit/admin-actions-guard.test.ts`). Parent identity always comes from the session. Children's results are visible only to their own parent and only once published (RLS).
- Owner name: "Abdullah Chopdat".
- Commit identity: `git -c user.name="Study Lab Co" -c user.email="studylabco123@gmail.com"`, with the session attribution lines.

## Review Focus

1. **Year 9 switching level after bookings exist:** existing bookings and passes stay valid. New bookings follow the new level, and a KS3 pass can't book GCSE groups. Test in Task V5 `level change keeps existing pass but restricts new bookings`.
2. **Late cancel of a paid pass seat:** the session returns to the pass and a 50% fee of one session's value is owed. It must not also create credit. Test in Task V5 `late cancel of pass seat returns credit and owes half session value, no ledger credit`.
3. **Pass expiry with a booked future session:** sessions already booked before expiry still happen. No new bookings after `expiresAt`. Test in Task V5 `expired pass refuses new bookings but keeps booked seats`.
4. **Removing more credit than the balance:** refused with a message, and the balance never goes negative. Test in Task V6 `remove credit above balance refused`.
5. **Draft results:** a parent can never see an unpublished result or its attachment, including by URL. Test in Task V7 `parent cannot read draft result or its attachment`.

---

### Task V1: Data model for v2

**Files:**
- Create: `supabase/migrations/0011_v2_levels_passes_fees.sql`
- Modify: `src/lib/types.ts`, `src/lib/supabase/mappers.ts`, `src/lib/admin/settings-validation.ts`, the admin Settings form (`src/app/admin/(secure)/settings/**`)
- Test: `tests/db/v2-schema.test.ts`, `tests/unit/mappers.test.ts`

**Interfaces:**
- **Settings** gains `priceKs3AssessmentPence`, `priceKs3OneToOnePence`, `priceKs3GroupPence`, `lateFeePercent`, `passPrices: Record<Level, Record<'6'|'10', number>>`, `passValidityMonths`, `passMinNoticeDays`. `type Level = 'KS3'|'GCSE'`.
- **children:** `school_year` checks 7–11. New `level` column (not null, check KS3/GCSE; backfill GCSE). `exam_board` and `tier` become nullable, with a check that requires them when level = GCSE. Add a check: `level='KS3'` only when year ≤ 9, and `level='GCSE'` only when year ≥ 9. `Child` type adds `level`.
- **group_series / group_sessions:** add `level` (default 'GCSE'). Seed update: the Saturday series and its future sessions become `level 'KS3'`, `year_group 'Years 7–9'`, `price_pence 1400`, title "Saturday KS3 Science Group".
- **New table `passes`:** `id`, `parent_id → profiles on delete set null`, `child_id → children on delete set null`, `level`, `sessions_total` int check in (6,10), `price_pence`, `payment_reference` (default `'SLC-'||nextval(payment_ref_seq)`), `status` text check in ('awaiting_payment','active','expired','cancelled'), `paid_at` timestamptz null, `expires_at` timestamptz null, `created_at`. RLS: parent select own; admin all. Type `Pass`.
- **bookings:** add `pass_id uuid null → passes` and `fee_pence int null` (the late fee owed for late_cancelled/no_show; null = use legacy rule).
- **ledger:** add `pass_id uuid null → passes`.
- **Seed:** `owner_name = 'Abdullah Chopdat'`.
- **Settings form:** all new fields, with pence-safe parsing (reuse `poundsToPence`) and validation (lateFeePercent 0–100; validity 1–24; min notice 0–30).

- [ ] **Step 1:** Write failing tests in `tests/db/v2-schema.test.ts`:
  - `seed has KS3 prices 750/2000/1400 and pass prices 7900/12600/10200/16200`
  - `lateFeePercent 50, passValidityMonths 6, passMinNoticeDays 7`
  - `Saturday series is KS3 Years 7–9 at 1400`
  - `Year 7 GCSE child rejected; Year 11 KS3 rejected; Year 9 either accepted`
  - `GCSE child requires exam board and tier; KS3 child may omit them`
  - `parent reads own passes only; anon none`
  - `owner_name is Abdullah Chopdat`
  - Add a mapper unit test for the new Settings fields.
- [ ] **Step 2:** Run `npm run db:reset && npm run test:db -- v2-schema` → FAIL.
- [ ] **Step 3:** Implement the migration, types, mappers and the Settings form fields. Keep the existing `children` form working for GCSE: Task V3 adds the level UI.
- [ ] **Step 4:** Run `npm run check && npm run db:reset && npm run test:db && npx playwright test` → all PASS. Fix any existing test that assumed the Saturday group was GCSE or £18.
- [ ] **Step 5:** Commit `feat(db): v2 levels, passes, late-fee and KS3 price settings`.

---

### Task V2: Pure rules for levels, prices, fees and cancellation

**Files:**
- Create: `src/lib/booking/level.ts`, `src/lib/booking/fees.ts`
- Modify: `src/lib/booking/pricing.ts`, `src/lib/booking/eligibility.ts`, `src/lib/booking/owed.ts`, `src/lib/booking/cancellation.ts`, `src/lib/booking/payment-view.ts`, `src/lib/admin/payments.ts` (`dueFor`)
- Test: `tests/unit/level.test.ts`, `tests/unit/fees.test.ts`, and updates to `pricing`/`eligibility`/`owed`/`cancellation` tests

**Interfaces:**
- `levelFor(schoolYear: number, chosen?: Level|null): Level` (Year 9 uses `chosen`, defaulting to GCSE)
- `assessmentLevel(schoolYear: number, level: Level): Level` (Year 9 → 'GCSE')
- `quote(item, s)`: assessment and one_to_one items gain `level: Level`, and group items gain `level` (single-seat group price still comes from the session, per R17). New item `{ type: 'pass'; level: Level; sessions: 6|10 }` with `perBookingPence` = `split(price, sessions)`. Remove the old `block` item.
- `lateFeePence(pricePence: number, percent: number): number`
- `bookingFeePence(b: Pick<Booking,'status'|'location'|'pricePence'|'travelFeePence'|'feePence'>, percent: number): number`:
  - late_cancelled → `feePence ?? lateFeePence(price)`
  - no_show → `(feePence ?? lateFeePence(price))` + travel when home_visit
  - attended/confirmed → price + travel
- `amountOwedPence` and `dueFor`/`seatDuePence` use `bookingFeePence` (this replaces R11's full-price rule).
- `parentCanCancelOnline(startsAt: Date, now: Date, noticeHours: number): boolean` (true when ≥ notice hours)
- `cancellationDecision(...)` keeps the cooling-off logic for the admin late path.
- Eligibility:
  - new reason `level_mismatch` ("That session is for a different key stage.") for a group whose level ≠ the child's level
  - KS3 may book one_to_one
  - Year 9 assessments are priced GCSE

- [ ] **Step 1:** Write failing tests:
  - `levelFor(7)=KS3`, `levelFor(9,'KS3')=KS3`, `levelFor(9)=GCSE`, `levelFor(11)=GCSE`
  - `assessment Y8 KS3 = 750`, `assessment Y9 KS3-level = 1000`, `assessment Y8 home visit = 1250`
  - `KS3 one_to_one = 2000`, `KS3 one_to_one home visit = 2500`, `GCSE one_to_one = 2500`
  - `pass KS3 6 = 7900 split [1317,1317,1317,1317,1316,1316]` (assert the sum and the remainder-first rule as implemented by `split`)
  - `lateFeePence(2500,50)=1250`, `(750,50)=375`, `(1400,50)=700`, `(1317,50)=659`
  - `late_cancelled home visit owes 1250 not 1500`
  - `no_show home visit owes 1250+500`
  - `feePence overrides the computed fee` (e.g. 0 after waive)
  - `parentCanCancelOnline exactly 48h = true, 47h59m = false`
  - `eligibility: KS3 child booking a GCSE group → level_mismatch`
  - `KS3 child one_to_one ok`
- [ ] **Step 2:** Run `npx vitest run tests/unit` → FAIL.
- [ ] **Step 3:** Implement. Update every caller of the removed `block` quote item as part of Task V5 (mark them `// V5` if this task can't compile them yet). Keep the build green by doing the minimal caller updates here.
- [ ] **Step 4:** Run `npm run check && npm run db:reset && npm run test:db` → PASS. Update existing tests whose expected fee was 100% to 50%.
- [ ] **Step 5:** Commit `feat: KS3 pricing, 50% late fee and level rules`.

---

### Task V3: Level on children, wizard by level, info icons

**Files:**
- Create: `src/components/ui/InfoTip.tsx`
- Modify: children form, validation and pages (`src/app/account/children/**`, `src/lib/children/validation.ts`); booking wizard steps (`src/app/account/book/**`); booking services (`src/lib/booking/{service,group-service,data}.ts`) to apply level and prices; admin family page (show level)
- Test: `tests/unit/children-validation.test.ts`, `tests/e2e/children.spec.ts`, `tests/e2e/booking.spec.ts`, `tests/unit/infotip.test.ts` (if logic exists), `tests/db/booking-service.test.ts`

**Interfaces:**
- **Children form:** year 7–11. For Year 9, a required radio "Studying for: KS3 (Years 7–9 level) / GCSE". Exam board and tier are shown and required only for GCSE. Editing the level is allowed (child page "Change level"); existing bookings are unaffected.
- **Wizard:**
  - Types offered by level: KS3 gets Assessment / 1-to-1 / KS3 group / Group pass (V5); GCSE gets as before.
  - Group session lists are filtered to the child's level.
  - Prices come from `quote` with the level.
- **`<InfoTip label text />`:** a button with the visible "i" icon, an accessible name "More about <label>", and a disclosure popover (`aria-expanded`, Escape closes, focus stays). Place it next to each wizard type and location option, the Sunday bundle, cooling-off, the late-fee line and the credit line.
- **Server:** `createBooking`/`createGroupBooking`/`createSundayBundle` enforce level via eligibility (`level_mismatch`), use the KS3 prices, and use GCSE pricing for Year 9 assessments.

- [ ] **Step 1:** Write failing tests:
  - e2e:
    - `add Year 8 child shows no exam board and saves KS3`
    - `Year 9 requires choosing KS3 or GCSE`
    - `KS3 child wizard offers 1-to-1 at £20 and only KS3 groups`
    - `Year 9 KS3 child's assessment costs £10`
    - `info icon opens and closes with keyboard`
  - db: `KS3 child cannot book a GCSE group session (level_mismatch)`, `KS3 one_to_one stored price 2000`
- [ ] **Step 2:** Run them → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm run check && npm run db:reset && npm run test:db && npx playwright test` → PASS.
- [ ] **Step 5:** Commit `feat: KS3/GCSE levels for children and bookings; info icons`.

---

### Task V4: Cancellation rework (online only ≥ 48 h; admin late/no-show at 50%)

**Files:**
- Modify:
  - `src/lib/booking/cancel.ts`, `src/lib/booking/account-data.ts`
  - `src/app/account/bookings/**` (`CancelBooking.tsx`, `BookingList.tsx`, `actions.ts`)
  - `src/lib/admin/lifecycle.ts` and `payments.ts` (`markNoShow`, `waiveFee`)
  - a new admin action `recordLateCancellation(bookingId)` in `src/lib/admin/lifecycle.ts`, with its button on the admin bookings and family pages
  - emails `CancellationReceipt` / `BookingConfirmed` / `FreeCancelReminder` (fee wording)
- Test: `tests/db/cancel.test.ts`, `tests/db/admin-ops.test.ts`, `tests/e2e/dashboard.spec.ts`, `tests/unit/email-content.test.ts`

**Interfaces:**
- **`cancelBookingForParent`:** refuses with `call_required` when `!parentCanCancelOnline`. It no longer has a late path. A free cancel of a paid booking writes credit (as now).
- **`recordLateCancellation(bookingId, opts)`** (admin; requireAdmin in the action wrapper). It applies to confirmed or pending future/started bookings:
  - **cooling-off** → status `cancelled`, free (paid → credit)
  - **otherwise** → status `late_cancelled`, `fee_pence = lateFeePence(price, percent)`
    - if `payment_status` is 'paid': write ledger `credit` for `price + travel − fee`, and keep the booking 'paid'
    - if unpaid: the fee is owed
  - Pass seats are handled in Task V5. `cancelled_by = 'parent'`.
- **`markNoShow`:** sets `fee_pence` = 50% (plus travel owed for home visits). A paid no-show credits the difference.
- **`waiveFee`:** sets `fee_pence = 0` and records the waiver (as now).
- **Copy:**
  - parent list (< 48 h): "Less than 48 hours to go — please call or email Study Lab Co to cancel. A 50% late cancellation fee applies." with the business phone/email
  - review step and emails: "Free cancellation until <48 h before> (or any time in the first 14 days after booking). After that, cancel by phone or email; a late cancellation fee of £X (50%) applies."

- [ ] **Step 1:** Write failing tests:
  - db:
    - `parent online cancel inside 48h → call_required`
    - `admin late cancel unpaid 1-to-1 → late_cancelled fee 1250 owed`
    - `admin late cancel paid 1-to-1 → fee 1250, credit 1250`
    - `admin late cancel within cooling-off → cancelled free`
    - `no_show home visit owes 1250+500`
    - `waive sets owed 0`
  - e2e: `dashboard shows call/email message inside 48h and no cancel button`
  - unit: `email copy shows 50% fee amount`
- [ ] **Step 2:** Run them → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the full suite (check, db, e2e) → PASS.
- [ ] **Step 5:** Commit `feat: 48-hour online cancellation, admin late cancellation at 50%`.

---

### Task V5: Group passes (replace fixed-week blocks)

**Files:**
- Create: `src/lib/booking/pass.ts` (pure), `src/lib/booking/pass-service.ts` (server), `src/lib/admin/pass-ops.ts`, a parent pass section on `/account` with a "Buy a group pass" wizard type, an admin passes list on the Money page or family page, and an email template `PassConfirmed` (reference + bank details + "sessions unlock once we've received payment")
- Modify:
  - remove the old block flow: wizard block steps, `createBlockBooking`, `block.ts`, `markBlockPaid` UI and the block cron reminder
  - the cron gains a pass awaiting-payment reminder after 48 h and expiry handling
  - tax pack: pass payments are income; ledger rows carry `pass_id`
- Test: `tests/unit/pass.test.ts`, `tests/db/pass-service.test.ts`, `tests/e2e/pass.spec.ts`

**Interfaces:**
- `passRemaining(pass: Pass, seats: Pick<Booking,'status'|'passId'>[]): number`. This is `sessionsTotal` minus seats with status in (pending, confirmed, attended). Late_cancelled, no_show and cancelled seats return the session.
- `passSessionValuePence(pass): number`, computed as `split(price, sessionsTotal)` by index; using `Math.floor` for the fee basis is fine, but document it.
- `passUsable(pass, now): boolean`: status active and `now < expiresAt`.
- Server:
  - `buyPass({parentId, childId, sessions, coolingOff})` → awaiting_payment, plus a consent row, plus the `PassConfirmed` email
  - `bookWithPass({parentId, passId, sessionId | sundayDate})` → checks:
    - the pass is usable
    - the level matches the session
    - `startsAt − now ≥ passMinNoticeDays`
    - enough remaining (2 for a bundle)
    - it then reserves via `reserve_group_seat` with `p_price = passSessionValuePence` and sets `pass_id`
  - `cancelPassForParent(passId)`: within 14 days of `created_at`, the unused value (`remaining × session value`, or all of it if never paid → just cancel) becomes ledger `credit` and the status becomes `cancelled`. Otherwise it's refused with "Unused sessions can't be refunded — please contact Study Lab Co."
- Admin:
  - `markPassPaid(passId, method)` → ledger payment with `pass_id`, status active, `paid_at` now, `expires_at = paid_at + passValidityMonths`
  - `convertPassToCredit(passId)` → unused value to credit at the tutor's discretion
  - pass-seat late cancel / no-show (from V4's `recordLateCancellation` / `markNoShow`): status late_cancelled/no_show, `fee_pence = lateFeePence(sessionValue)`, the session returns to the pass, and **no** credit is written
  - tutor cancel of a pass seat → `cancelled`, session returned
- Parent pass card: "KS3 group pass — 4 of 6 sessions left — expires 1 May 2027 — Book a session". Awaiting payment shows the reference and bank details.
- **Expiry:** the cron sets status `expired` when `expires_at < now`. Booked future seats remain.

- [ ] **Step 1:** Write failing tests:
  - unit: `remaining counts pending/confirmed/attended only`, `session value split sums to price`, `usable only when active and before expiry`
  - db:
    - `buy pass → awaiting_payment, reference SLC-####`
    - `cannot book with unpaid pass`
    - `markPassPaid sets expires_at +6 months and ledger payment with pass_id`
    - `book 6 days ahead refused, 8 days ok`
    - `KS3 pass cannot book GCSE session`
    - `Sunday bundle uses 2`
    - `parent cancel ≥48h returns session`
    - `late cancel of pass seat returns credit and owes half session value, no ledger credit`
    - `expired pass refuses new bookings but keeps booked seats`
    - `cancel pass within 14 days → unused value as credit`
    - `after 14 days refused`
    - `level change keeps existing pass but restricts new bookings`
  - e2e: `parent buys KS3 6-pass (£79), admin marks paid, parent books a Saturday session a week+ ahead, dashboard shows 5 of 6 left`
- [ ] **Step 2:** Run them → FAIL.
- [ ] **Step 3:** Implement. Remove the dead block code and its tests. The old `block_bookings` table stays in the DB, unused.
- [ ] **Step 4:** Run the full suite → PASS.
- [ ] **Step 5:** Commit `feat: group passes replace fixed-week blocks`.

---

### Task V6: Credit administration and deletion guard

**Files:**
- Modify: `src/lib/admin/payments.ts` or a new `src/lib/admin/credit-ops.ts`; the admin family page; `/account` credit card; `src/lib/account-deletion.ts`; the tax pack (sheet 6 labels)
- Test: `tests/db/credit-ops.test.ts`, `tests/db/account-deletion.test.ts`

**Interfaces:**
- `adjustCredit(parentId, amountPence > 0, direction: 'add'|'remove', reason: string)`:
  - add → ledger `credit` with a note
  - remove → ledger `credit_applied` with a note
  - refuses a remove above the balance, with "That's more than the £X credit on this account."
  - goes through the `apply_credit` RPC (or an equivalent locked path)
- `refundCredit(parentId, amountPence, method)` → ledger `refund` plus `credit_applied` (balance down, turnover down), capped at the balance.
- Parent `/account` credit card adds "Want it refunded to your card instead? Email studylabco123@gmail.com."
- `deleteAccount` refuses with "You have £X credit or unused group-pass sessions. Please contact Study Lab Co before deleting your account." when the credit balance > 0 or an active pass has remaining > 0.

- [ ] **Step 1:** Write failing tests:
  - `add credit 500 → balance 500`
  - `remove credit above balance refused`
  - `remove 200 → balance 300`
  - `refund credit 300 → balance 0, ledger refund 300`
  - `adjustments excluded from turnover`
  - `deletion refused with credit`
  - `deletion refused with unused active pass`
- [ ] **Step 2:** Run them → FAIL.
- [ ] **Step 3:** Implement, with the admin UI (amount, reason, buttons) and a guard test.
- [ ] **Step 4:** Run the full suite → PASS.
- [ ] **Step 5:** Commit `feat: admin credit adjustments and refunds; deletion guard`.

---

### Task V7: Test results for parents

**Files:**
- Create:
  - `supabase/migrations/0012_test_results.sql`: table, RLS, and a private bucket `results` with admin-only storage policies and the same MIME whitelist as receipts
  - `src/lib/admin/results-ops.ts`
  - admin UI on the family page: a "Results" section with add/edit/delete/publish
  - parent pages `src/app/account/children/[id]/results/{page.tsx,[resultId]/page.tsx}`
  - email template `ResultsPublished`
- Test: `tests/db/results.test.ts`, `tests/e2e/results.spec.ts`, `tests/unit/results.test.ts`

**Interfaces:**
- **Table `test_results`:**
  - `id`, `child_id → children on delete cascade`
  - `title` (1–120 characters), `kind` ('initial_assessment'|'end_of_topic'|'other'), `taken_on` date
  - `score` int ≥ 0, `out_of` int > 0, with `score ≤ out_of`
  - `grade` text null (≤ 20)
  - `went_well` text (1–2000), `to_improve` text (1–2000)
  - `attachment_path` null, `published_at` null, `created_at`, `updated_at`
  - **RLS:** parent select where the child is theirs **and published_at is not null**; admin all.
- `percent(score, outOf): number` (rounded to an integer).
- **Admin ops** (`requireAdmin` in the wrappers):
  - `saveResult(input)` creates or updates a draft
  - `publishResult(id)` sets `published_at` and emails the parent `ResultsPublished` ("New results for <first name>", with a link to `/account/children/<id>/results`, no scores in the email)
  - `deleteResult(id)` also removes the attachment
  - `prepareResultUpload` (signed upload for `results/YYYY/<uuid>.<ext>`)
- **Parent detail page:**
  - shows the title, type, date, score "34 / 50 (68%)", grade, and the "What went well" and "What to improve" paragraphs (`whitespace-pre-line`)
  - an attachment link via a 5-minute signed URL, generated server-side only after verifying ownership and that the result is published

- [ ] **Step 1:** Write failing tests:
  - db:
    - `parent sees only own child's published results`
    - `parent cannot read draft result or its attachment`
    - `other parent sees nothing`
    - `score > out_of rejected`
    - `publish emails parent once`
    - `delete removes attachment object`
  - unit: `percent(34,50)=68`
  - e2e: `admin adds an end-of-topic result with a photo and publishes; parent sees 34 / 50 (68%) and feedback; another parent gets 404`
- [ ] **Step 2:** Run them → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the full suite → PASS.
- [ ] **Step 5:** Commit `feat: test results with feedback and attachments for parents`.

---

### Task V8: Public content, Q&A page and info icons on prices/settings

**Files:**
- Modify:
  - `src/app/(public)/{page.tsx,lessons/page.tsx,groups/page.tsx,faq/page.tsx,terms/page.tsx,refunds/page.tsx,about/page.tsx,safeguarding/page.tsx}`
  - `src/components/site/HowItWorks.tsx`, `src/components/site/PriceTable.tsx`
  - admin settings fields (add InfoTips)
  - `tests/e2e/public.spec.ts`
- Test: `tests/e2e/public.spec.ts`

**Interfaces / content:**
- **Lessons page:** separate KS3 and GCSE price tables, all from settings:

  | | KS3 | GCSE |
  |---|---|---|
  | Assessment | £7.50 (Years 7–8; Year 9 books GCSE) | £10 |
  | 1-to-1 | £20 | £25 |
  | Group | £14, "KS3 only (Years 7–9)" | £18 |
  | Passes | £79/£126 | £102/£162 |

  Also show the Sunday bundle (£30) and the home visit +£5. Every price gets an InfoTip with a short explanation.
- **/groups:** a level badge on each session ("KS3 only — Years 7–9" / "GCSE — Years 10–11").
- **The FAQ page is retitled "Common questions and answers"** and covers:
  - bookings, prices
  - KS3/GCSE and Year 9
  - group passes, explained simply
  - cancellations and the 50% fee, the 14-day cooling-off right explained simply
  - credit and refunds to card, payment
  - test results, safeguarding

  It ends with "Still have a question? Email **studylabco123@gmail.com**" as a mailto link.
- **Terms and Refund Policy:** match spec §§1–4 (50% fee, phone/email inside 48 h, passes and their refund-as-credit rule, credit refundable to card on request, cooling-off).
- **Restore the claims removed in commit `0fb9537`** (see `git show 0fb9537`), except the Terms "lesson ended early" charge line and the vague privacy retention period. Keep those two as they are now.
- **Settings page:** an InfoTip next to each field.

- [ ] **Step 1:** Write failing e2e tests:
  - `lessons shows KS3 assessment £7.50, 1-to-1 £20, group £14, passes £79/£126 and GCSE passes £102/£162`
  - `faq titled Common questions and answers with mailto studylabco123@gmail.com`
  - `terms mention 50% late cancellation fee and call or email inside 48 hours`
  - `Saturday group labelled KS3 only (Years 7–9)`
  - `footer shows Study Lab Co is run by Abdullah Chopdat`
  - `no "fine"/"penalty"/online wording`, `axe clean`
- [ ] **Step 2:** Run them → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the full suite → PASS.
- [ ] **Step 5:** Commit `feat: KS3/pass content, Q&A page, info icons, restored claims`.
