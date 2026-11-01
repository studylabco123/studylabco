# Study Lab Co — Version 2 Changes (design addendum)

**Date:** 1 November 2026
**Status:** Approved by the owner (Abdullah Chopdat) on 1 November 2026, with: KS3 1-to-1 £20; pass refunds as credit
**Base spec:** `2026-10-31-studylabco-website-design.md`. This addendum **overrides** it where they differ.

---

## 1. Cancellations and the late fee (replaces base §2.9)

| Situation | Result |
|---|---|
| Parent cancels **≥ 48 h** before the lesson | Allowed on the website. Free. If the booking was paid, the amount becomes **account credit** automatically. |
| Parent wants to cancel **< 48 h** before | **Not possible on the website.** The cancel button is replaced by: "Less than 48 hours to go — please call or email Study Lab Co to cancel. A 50% late cancellation fee applies." The tutor records it in admin. |
| Late cancellation (recorded by tutor) | **Late fee = 50% of that lesson's price** (excluding any travel fee). If the lesson was already paid in full, 50% is kept and the other 50% becomes credit. The tutor can waive the fee. |
| No-show | Same as a late cancellation (50% of lesson price). For a **home visit no-show**, the £5 travel fee is also owed (the tutor travelled). Waivable. |
| Within **14 days of making the booking** | Free, whatever the timing (Consumer Contracts Regulations 2013 cooling-off right). Still via call/email when < 48 h; the admin action applies it automatically. |
| Tutor cancels | Always allowed; parent not charged; paid → credit (or refund). Group-pass sessions get their credit back. |

- The late fee percentage is a setting (`late_fee_percent`, default **50**). Fee = `round(price × percent / 100)` in pence.
- Copy always says "late cancellation fee", never "fine"/"penalty".

## 2. Credit

- Credit is created automatically when a paid lesson is cancelled free (≥ 48 h, cooling-off, or by the tutor), and for the unused 50% of a paid late cancellation.
- Parents see their credit balance on their dashboard with: "Want it refunded to your bank account instead? Email studylabco123@gmail.com." (applies to any credit).
- Admin can: **Pay from credit** (existing), **Refund credit** (records a refund, reduces the balance and turnover), and **Add / remove credit** manually with a reason (never income; balance cannot go below £0).
- Account deletion is refused while the family has credit > £0 or an active group pass with unused sessions ("Please contact Study Lab Co first").

## 3. Group passes (replace fixed 6/10-week blocks)

- A parent buys a **group pass for one child**: 6 or 10 sessions, at the child's level.

| Pass | 6 sessions | 10 sessions |
|---|---|---|
| KS3 | **£79** | **£126** |
| GCSE | **£102** | **£162** |

  Prices are settings (explicit amounts, not percentages).
- Payment by bank transfer. The pass is **"Awaiting payment"** until the tutor marks it paid; **only then** can sessions be booked with it ("only I can add the credit once they have paid").
- Valid for **6 months from the date it is marked paid** (setting `pass_validity_months`, default 6). Unused sessions expire.
- Booking with a pass: any upcoming **group session at the child's level** with seats, booked **at least 7 days before** the session (setting `pass_min_notice_days`, default 7). Parents can book sessions any time later — not all at once.
- A **Sunday bundle** booked with a GCSE pass uses 2 sessions. (Buying a Sunday bundle without a pass is still £30.)
- Missing a pass session:
  - **≥ 48 h notice** (parent cancels on the website): the session goes back on the pass.
  - **< 48 h / no-show**: the session still goes back on the pass ("moved"), but the parent owes **50% of one session's pass value** (pass price ÷ sessions), waivable by the tutor.
  - Tutor cancels a session: goes back on the pass automatically.
- **Refunds:** unused pass sessions are **not refunded as money by default**. If a parent cancels a pass within the legal 14-day cooling-off period (from the date it was bought), the value of the sessions not yet taken is turned into **account credit**; as with all credit, the parent may email to ask for it back to their bank account (credit refunds go to the parent's bank account only), and the tutor refunds it (this keeps us within the law). Outside the 14 days, unused sessions are not refundable unless the tutor decides otherwise (admin "Convert pass to credit" / "Refund credit" actions).
- The old fixed-week block booking flow is removed (no live data exists yet).

## 4. KS3 (Years 7–9)

- Children may be in **Years 7–11**. Each child has a **level**: Years 7–8 = KS3; Years 10–11 = GCSE; **Year 9 parents choose KS3 or GCSE** (editable later).
- KS3 children: exam board and tier are not asked; subjects as before.
- What each level can book:

| | KS3 | GCSE |
|---|---|---|
| Assessment Lesson | **£7.50** (home visit +£5) — **Year 7–8 only**; **Year 9 always books the GCSE assessment (£10)** | £10 (home visit +£5) |
| 1-to-1 | **Yes** — KS3 1-to-1 price setting, default **£20** (home visit +£5 = £25) | £25 (home visit £30) |
| Groups | KS3 groups only — £14 | GCSE groups — £18 (per-session price as before) |
| Group passes | KS3 pass | GCSE pass |

- Each group series/session has a **level** (KS3 or GCSE) and a year-group label. The **Saturday group becomes "KS3 only (Years 7–9)", £14**. Sunday groups stay GCSE (Years 10 & 11; Year 9 GCSE students welcome).
- All prices are editable in Settings at any time; existing bookings keep their stored price.
- Public pages make the KS3/GCSE split clear ("KS3 only — Years 7–9").

## 5. Test results (new)

- Admin, on a child's page: **Add result** with
  - title / topic (e.g. "Cell Biology"), date taken, type (**Initial assessment** / **End-of-topic test** / **Other**)
  - score **X out of Y** (percentage calculated), optional grade (free text, e.g. "6" or "working at 5")
  - **What went well** (paragraph) and **What to improve** (paragraph)
  - optional **attachment** (photo or PDF of the marked test, ≤ 10 MB, private storage, same direct-upload pattern as receipts)
  - **Save draft** or **Publish**; results can be edited or deleted.
- On publish the parent gets an email: "New results for <child first name>" with a link to log in (no results in the email).
- Parents see results only for **their own children**, only once published (RLS), at `/account/children/<id>/results`; attachments via short-lived signed URLs after an ownership check.

## 6. Help, content and small changes

- **Info icons:** a small accessible "i" button next to each booking option (lesson types, locations, group pass, Sunday bundle, cooling-off, late fee, credit), next to prices on the Lessons page, and next to admin settings fields, opening a short plain-English explanation.
- **FAQ page** rewritten as "Common questions and answers" covering bookings, prices, KS3/GCSE and Year 9, group passes, cancellations and the 50% fee, cooling-off, credit and refunds, payment, test results, safeguarding — ending with "Still have a question? Email **studylabco123@gmail.com**" (mailto link).
- Owner name seeded: **"Study Lab Co is run by Abdullah Chopdat."**
- Unverified claims removed in the final fix wave are **restored**, except two kept for legal reasons: the Terms line charging for lessons ended early (unfair-term risk) and the specific privacy retention period.
- Terms, Refund Policy and FAQ updated to match §§1–4. Legal requirements override owner rules where they conflict (cooling-off).

## 7. Out of scope (unchanged)
Card payments, SMS reminders, online lessons (still off).
