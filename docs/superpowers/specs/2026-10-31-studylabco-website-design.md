# Study Lab Co — Website & Booking System Design

**Date:** 31 October 2026
**Status:** Awaiting owner review
**Owner contact:** studylabco123@gmail.com

---

## 1. Purpose

Study Lab Co is a GCSE (KS4) science tuition business in Blackburn run by a qualified teacher. The website must:

1. Convince parents to trust the tutor (qualifications, QTS, DBS, safeguarding).
2. Let parents create an account, sign an agreement form and book lessons themselves.
3. Only ever show genuinely free slots, based on the tutor's term-time/holiday hours and blocked times.
4. Give the tutor one dashboard to manage bookings, families, payments, group sessions and tax records.
5. Meet UK legal requirements (UK GDPR, consumer law, accessibility, child safety).

**Success looks like:** a parent can go from finding the site to a confirmed Assessment Lesson without contacting the tutor, and the tutor can run the whole business (including the tax return) from their phone.

---

## 2. Business rules

### 2.1 Offer
- **Level:** GCSE / KS4 only (Years 10 and 11).
- **Subjects:** Biology, Chemistry, Physics, Combined Science.
- **Exam boards:** AQA, Edexcel, OCR, WJEC/Eduqas.
- **Tiers:** Foundation, Higher.
- **All lessons are 60 minutes.**

### 2.2 Prices (launch; all editable in Settings)

| Item | Price |
|---|---|
| Assessment Lesson — at tutor's place | £10 |
| Assessment Lesson — home visit | £15 (£10 + £5 travel) |
| 1-to-1 — online or at tutor's place | £25 |
| 1-to-1 — home visit | £30 |
| Group session (per student) | £18 |
| Sunday bundle (both Sunday groups) | £30 |
| Saturday group — 6-week block | £102 |
| Saturday group — 10-week block | £162 |
| Sunday bundle — 6-week block | £171 |
| Sunday bundle — 10-week block | £270 |

Block prices are stored as explicit amounts (not percentages) so there is no rounding ambiguity. Not VAT registered; prices shown are final.

### 2.3 Lesson locations
- **At tutor's place** (BB1 1QR). The address is **never shown publicly**; it is sent only in confirmation emails for confirmed bookings.
- **Online** via one fixed meeting link (Google Meet/Zoom) set in Settings. **Switched OFF at launch** (Settings toggle "Online lessons"). While off, no online option appears anywhere on the site and online wording is hidden from public pages.
- **Home visit:** Sunday 1-to-1 window only, Blackburn postcodes only (**BB1, BB2**), requires tutor approval, and blocks 30 minutes after the lesson for travel.
- **Group venue:** set in Settings. Until it is set, group listings say "Location confirmed on booking". A group may also be marked as online once online lessons are switched on.

### 2.4 Weekly timetable (defaults; editable)

| Day | Term time | School holidays |
|---|---|---|
| Mon–Fri | 1-to-1/assessment slots 17:00, 18:00, 19:00 (tutor's place) | Slots hourly from 07:00, last at 21:00 (tutor's place) |
| Saturday | Group 08:15–09:15 only | Same |
| Sunday | Groups 08:15–09:15 and 09:15–10:15; then 1-to-1/assessment slots hourly from 10:30, last at 16:30 (tutor's place or home visit) | Same |

- "Tutor's place" in the table also means online when online lessons are switched on.
- Lessons are back-to-back with no gap. The only exception is home visits, which add a 30-minute travel buffer afterwards.
- Assessment Lessons are **in person only** (tutor's place or home visit). Online assessments can only be added manually by the tutor.

### 2.5 Calendar data (2026–27, pre-loaded)

**Term periods (term-time hours apply):**
- Autumn: 1 Sep 2026 – 18 Dec 2026, excluding half term 26–30 Oct 2026
- Spring: 4 Jan 2027 – 25 Mar 2027, excluding half term 15–19 Feb 2027 and the Eid ul Fitr closure 9–10 Mar 2027
- Summer: 12 Apr 2027 – 22 Jul 2027, excluding the May Day closure 3 May 2027, Eid ul Adha 17–18 May 2027 and half term 31 May – 4 Jun 2027

(Inset days 1 Sep 2026 and 4 Jan 2027 count as term time and stay open by default. They are highlighted in the admin calendar, and every day has a one-tap **Close this day** / **Reopen** action.)

**Everything outside term periods uses holiday hours**, including the Christmas holiday (21 Dec 2026 – 1 Jan 2027), Easter (26 Mar – 9 Apr 2027) and the summer holiday.

**Blocked by default (tutor can unblock):** 25 Dec 2026, 26 Dec 2026, 1 Jan 2027, 9–10 Mar 2027 (Eid ul Fitr), 17–18 May 2027 (Eid ul Adha). Eid dates are provisional and easy to edit.

### 2.6 New student requirements
Before any lesson other than the Assessment Lesson can be booked, for each child:
1. The parent has an account and has **signed the Parent/Guardian Agreement & Consent Form**.
2. The child has completed a **60-minute Assessment Lesson**, which includes a 15-minute talk with the parent/guardian (who must be present).
3. The tutor has pressed **Approve student**.

This applies to 1-to-1 and group sessions.

### 2.7 Booking rules
- Parents can book up to **4 weeks ahead** and no later than **24 hours** before a slot.
- Lessons at the tutor's place and online are **confirmed instantly**. Home visits are **pending** until the tutor approves or declines.
- Group sessions have a seat limit (default 15). Seats left are shown honestly. A group closes when full.
- **Block bookings: groups only** (Saturday group or Sunday bundle; 6 or 10 weeks). 1-to-1 block booking is designed for but switched off.
- **The database prevents double-booking**, including two parents booking at the same moment.

### 2.8 Payment
- Methods: **bank transfer** (in advance) or **cash/transfer before the lesson starts**. No online card payment in Phase 1.
- Each booking gets a unique **payment reference** (e.g. `SLC-1042`). Bank details are shown only to logged-in parents with a booking and in confirmation emails.
- The tutor marks bookings **Paid** manually.
- Block bookings are held for **72 hours** awaiting payment. After that the tutor is alerted and can release the seats.

### 2.9 Cancellation policy
| Situation | Result |
|---|---|
| Parent cancels ≥ 48 h before | Free. Slot reopens. Prepaid money becomes credit or is refunded (tutor records which). |
| Parent cancels < 48 h before | Allowed online, with a clear warning first. Recorded as a **late cancellation**; lesson fee owed. |
| No-show | Tutor marks it. Recorded as a **no-show**; lesson fee owed. |
| Parent owes money | Cannot make new bookings until it is paid or waived. |
| Repeat late cancellations/no-shows | The account is **flagged**. The tutor decides whether to block (no automatic blocking). |
| Emergency | Tutor can **waive** the fee. |
| Tutor cancels | Parent not charged; prepaid money credited or refunded. |
| One week of a block missed | The same 48-hour rule applies to that week. |

Wording: "late cancellation fee", never "fine" or "penalty". The fee is the lesson price only.

---

## 3. Public website

### 3.1 Pages
| Page | Content |
|---|---|
| Home | Logo; headline about GCSE Science tuition from a qualified teacher in Blackburn; badges "Qualified Teacher (QTS) · Enhanced DBS Checked · All Exam Boards"; 3-step "How it works"; lesson types; upcoming groups; testimonials (hidden until real ones exist); main button "Book your £10 Assessment Lesson" |
| About | No photo. Qualifications: Grade 9 GCSE Science (Jamiatul Ilm Wal Huda, Blackburn); A-Levels in Biology, Chemistry and Psychology (Clitheroe Royal Grammar School Sixth Form); BSc Biology (University of Salford); PGCE with QTS (Edge Hill University); Enhanced DBS checked. Teaching approach. |
| Lessons & Pricing | All lesson types, prices, the travel fee, block discounts and the new student steps |
| Group Sessions | Upcoming groups: topic, date, time, year group, seats left, venue/online |
| FAQ | Exam boards, tiers, the assessment, payment, cancellations, safeguarding |
| Contact | Contact form, email, phone and WhatsApp buttons, business details |
| Terms of Service | Bookings, payment, 48-hour rule, conduct, online lesson rules, 14-day cooling-off |
| Refund Policy | As in section 2.9 |
| Privacy Policy | UK GDPR: data collected, purpose, lawful basis, retention, processors, rights, deletion |
| Cookie Policy | Essential cookies only |
| Safeguarding | DBS, safeguarding approach, parent presence at assessment, online lesson rules |
| Accessibility Statement | Accessibility features and how to report problems |

### 3.2 Visual design
- Colours from the logo: navy (main text and buttons) and soft sky blue (backgrounds and decoration only, never text).
- Clean, trustworthy and friendly, with science-themed custom illustrations instead of a photo. It must not look like a template.
- Subtle, purposeful animations (fade/slide-in on scroll, button feedback) that respect "reduce motion" settings.
- Logo: redrawn as a clean SVG from the owner's logo (navy circle, "STUDYLABCO." arched text, lightbulb over open book, "TUTORING"), plus favicon and home-screen icons.

---

## 4. Parent experience

### 4.1 Account
- **Sign up:** parent/guardian full name, email, phone (required), password.
- Separate unticked checkboxes, each saved with a timestamp: "I am 18+ and the parent/guardian", "I agree to the Terms & Cancellation Policy", and optionally "Send me news and offers".
- Email verification required.
- Children never have accounts.

### 4.2 Children
Each account can hold several children: first name, last name, school year (10/11), exam board, tier, subjects, target grade (optional), and SEN/exam access/medical notes (optional, visible to the tutor only).

### 4.3 Parent/Guardian Agreement & Consent Form (signed once per child)
Emergency contact name and phone; medical/allergy info (optional); SEN needs (optional); agreement to Terms, Refund Policy and online lesson rules; consent to contact by phone and email; typed signature (full name) plus a tick, saved with date and time. Not described as a "waiver".

### 4.4 Booking flow
1. Choose child.
2. Choose type. Only Assessment is available until the child is approved; after approval, 1-to-1, Group, Sunday bundle and group blocks are available.
3. Choose location, limited to what the chosen slot allows. Home visits need an address and pass the BB1/BB2 check.
4. Choose a free slot.
5. Review: full price (including any travel fee), cancellation deadline, and the 14-day cooling-off acknowledgement ("I want lessons to start within 14 days and understand I lose the right to cancel once a lesson has taken place").
6. Confirm. The parent sees the payment reference and bank details, and gets an email.

### 4.5 Parent dashboard
Upcoming and past lessons; cancel (with late-cancellation warning where relevant); amount owed and payment references; children and forms; account details; marketing email opt-in/out; **Delete my account**.

### 4.6 Emails
| Email | When |
|---|---|
| Booking confirmation | On booking. Includes reference, bank details, and address or online link. |
| Home visit approved/declined | On tutor decision |
| Free-cancellation reminder | 3 days before ("Free cancellation ends [date/time]") |
| Lesson reminder | 24 hours before |
| Cancellation receipt | On any cancellation |
| Group session cancelled | When the tutor cancels a group week |
| Block payment reminder | 48 hours after a block booking if still unpaid |

Booking emails are transactional. Marketing emails go only to opted-in parents and always include an unsubscribe link.

---

## 5. Admin dashboard (tutor only, phone-friendly)

- **Today:** today's lessons (who, when, where, paid/unpaid) and alerts (home visit requests, unpaid lessons, overdue block payments, families awaiting assessment, flagged parents).
- **Calendar:** week/month views, colour-coded by type. Tap to block a time/day/repeating slot, **close/reopen a whole day**, or add a manual booking.
- **Group sessions manager:** add (title/topic, day, time, one-off or weekly, seats, price, venue/online, year group), edit, cancel one week (automatic emails, credit/refund recorded), remove a series, and "Email everyone in this group". Pre-loaded: Saturday 08:15, Sunday 08:15 and 09:15 weekly.
- **Bookings:** search/filter; mark Paid / Attended / No-show / Late cancellation / Waive fee; cancel as tutor; approve/decline home visits.
- **Parents & students:** tap to call, WhatsApp or email; children's details; form signed date/time; assessment status and **Approve student**; booking history; amount owed; late-cancellation/no-show count; private notes; **Block/Unblock** with reason (a blocked parent sees "Please contact Study Lab Co").
- **Money:** outstanding payments; income by week, month and year; expenses with receipt photos; mileage; **Tax Year Pack** (section 6).
- **Settings:** all prices and block prices; travel fee; term/holiday hours; term periods and blocked dates; bank details; **location toggles (Online lessons: off; Home visits: on; At tutor's place: on)**; teaching address; group venue; online meeting link; cancellation notice (48 h); booking window (4 weeks); minimum notice (24 h); seat default (15); private calendar feed link for Google/iPhone Calendar; **Download full backup**.
- **Security:** admin login requires a password plus 2-step verification (authenticator app).

---

## 6. HMRC Tax Year Pack

**Money → Tax Year Pack.** Choose a tax year (6 April – 5 April) or a quarter, then download an Excel workbook and a PDF summary.

| Sheet | Content |
|---|---|
| 1. Summary | Total income (turnover), total allowable expenses, profit, labelled for the Self Assessment self-employment pages; comparison with the £1,000 trading allowance |
| 2. Income | Every payment received, by date: date, reference, family ref, lesson type, cash/transfer, amount |
| 3. Monthly totals | By month and by lesson type |
| 4. Expenses | Date, category, description, amount, receipt link |
| 5. Mileage | Home-visit trips (created automatically; tutor enters miles) at HMRC simplified rates (45p/mile for the first 10,000 miles) |
| 6. Refunds & waived fees | So the totals reconcile |
| 7. Unpaid at year end | Money still owed |

**Expense categories:** room/venue hire, insurance, DBS, website & domain, books & resources, ICO fee, stationery, phone/internet, virtual office, other.

Income is counted when payment is received (cash basis). The pack is a record-keeping aid, not tax advice.

---

## 7. Legal & compliance checklist

| # | Item | Implementation |
|---|---|---|
| 1 | Privacy policy | Page per section 3.1 |
| 2 | Terms of service | Page per section 3.1 |
| 3 | Refund policy | Page per section 2.9 |
| 4 | Cookie policy | Page; essential cookies only |
| 5 | Cookie consent banner | Not shown while only essential cookies are used. A consent mechanism must be added before any non-essential cookie/tracker. |
| 6 | Form consents | Separate, unticked checkboxes; each consent stored with a timestamp and the policy version |
| 7 | Data minimisation | Only fields listed in section 4; sensitive notes optional and tutor-only |
| 8 | Third-party code | Supabase, Vercel, Resend and Cloudflare Turnstile (bot protection) only, all listed in the Privacy Policy. Fonts self-hosted. No ad/analytics trackers. |
| 9 | No dark patterns | No pre-ticked boxes, no fake scarcity, cancelling/deleting as easy as signing up |
| 10 | No hidden fees | Full price (including travel fee) shown before confirming; late fee explained up front |
| 11 | No fake reviews | Testimonials hidden until real, permitted reviews exist |
| 12 | No unsupported claims | Only verifiable facts (qualifications, QTS, DBS) |
| 13 | Alt text | All meaningful images; decorative images marked decorative |
| 14 | Colour contrast | WCAG 2.2 AA minimum; light blue never used for text |
| 15 | Keyboard navigation | Every flow usable by keyboard with visible focus |
| 16 | Business details | Trading name, owner name, email, phone. A geographic business address (virtual office recommended) is to be added by the owner; the home address is never published. |
| 17 | Age/parental consent | Only 18+ parents/guardians hold accounts |
| 18 | Unsubscribe | On every marketing email; one-click opt-out in the dashboard |
| 19 | Licensed images | Own logo, custom illustrations, or free-licensed images with sources recorded |
| 20 | Data deletion | "Delete my account": personal data erased; financial records kept 6 years in anonymised form (HMRC) |
| + | Accessibility statement | Page |
| + | 14-day cooling-off | Acknowledgement at booking (section 4.4) |

**Owner actions outside the site:** ICO data protection fee check/registration; virtual office address; consider a professional review of the Terms; public liability insurance for group venue.

---

## 8. Technical design

### 8.1 Stack
- **Next.js** (App Router, TypeScript) with Tailwind CSS. Server-rendered and responsive. Works in current Safari (iPhone/iPad/Mac), Edge and Chrome (Windows) and Chrome (Android). Installable to the home screen (web app manifest, logo icon).
- **Supabase:** Postgres database, authentication (email + password; TOTP 2-factor for admin), storage (receipt photos, private), Row Level Security.
- **Resend:** transactional and marketing email from the business domain.
- **Vercel:** hosting and scheduled jobs (reminder emails, block-payment checks, daily keep-alive).
- **GitHub:** source code.
- All times are stored in UTC and displayed in **Europe/London**, so BST/GMT changes are handled correctly.

### 8.2 Main data (tables)
- `profiles` — parent details, role (parent/admin), blocked flag and reason, marketing opt-in
- `children` — per parent; academic details; tutor-only notes in a separate admin-only table
- `agreements` — signed form per child: content version, typed name, timestamp
- `consents` — consent type, policy version, timestamp
- `student_status` — assessment completed, approved (per child)
- `availability_rules` — weekly windows per period type (term/holiday), allowed locations
- `term_periods`, `blocked_times` — calendar data, including repeating blocks
- `group_series`, `group_sessions` — repeating/one-off groups, capacity, price, venue
- `bookings` — child, type, start/end, location, address/postcode (home visit), status (pending, confirmed, cancelled, late-cancelled, no-show, attended), price, payment reference, block id
- `block_bookings` — group blocks, price, hold expiry
- `payments` — amount, method, date received, booking(s); also credits/refunds/waivers
- `expenses`, `mileage` — tax records
- `settings` — prices, hours, policy values, bank details, addresses, meeting link
- `email_log` — what was sent and when

### 8.3 Key safeguards
- **Row Level Security:** parents can read and write only their own family's rows; admin-only tables are not readable by parents at all.
- **No double booking:** a database exclusion constraint on 1-to-1/assessment time ranges (including the travel buffer), plus a transactional seat-count check for groups.
- Booking rules (prerequisites, windows, postcodes, owed money, blocked accounts) are enforced **on the server**, not only in the browser.
- Bot protection on sign-up, login and contact forms; rate limiting on authentication.
- Bank details, the teaching address and the meeting link are released only to parents with a confirmed relevant booking.

### 8.4 Testing
- **Unit tests** for slot generation (term/holiday/blocked/BST), the 48-hour rule, prices/travel fee/blocks, postcode check, prerequisites, seat limits and tax-year totals.
- **Database tests** for RLS policies and double-booking prevention.
- **End-to-end browser tests** at iPhone and Windows-laptop sizes: sign up → sign form → book assessment → admin approves → book group block → cancel late → mark paid → export Tax Year Pack.
- **Accessibility checks** (automated contrast and keyboard checks) and a design review.
- **Owner acceptance test** with a pretend parent account on a real iPhone and a Windows PC before launch.

---

## 9. Out of scope (Phase 2)
Card payments (Stripe); 1-to-1 block bookings; lesson notes/homework for parents; reviews collection; SMS/WhatsApp reminders; KS3.

## 10. Open items for the owner
Resolved: DBS is enhanced; logo will be redrawn; online lessons off at launch.

1. Buy domain **studylabco.co.uk** (available as of 31 Oct 2026).
2. GitHub and Resend accounts (guided setup).
3. Virtual office address (optional; recommended).
4. Bank details, teaching address and phone, entered directly in the dashboard after launch, not in chat.
