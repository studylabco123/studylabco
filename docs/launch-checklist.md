# Launch checklist

Items the owner (or whoever sets up the hosted services) must do before the
domain goes live. The controller extends this list; items here come from the
final review fix wave.

## Supabase (hosted project)

- **Migrations:** apply `0001`–`0010` in order (`0007` owner name, `0008`
  children policies, `0009`–`0010` family credit).
- **Auth → Email templates** (review I5). The site's email links use
  `token_hash` links to `/auth/callback`, so they work on any device (a reset
  asked for on a laptop can be opened on a phone). Change both templates in the
  dashboard to match `supabase/templates/` in this repository:
  - **Confirm signup**: link
    `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup`
    (copy the body from `supabase/templates/confirmation.html`).
  - **Reset password**: link
    `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=%2Freset%3Fmode%3Dupdate`
    (copy the body from `supabase/templates/recovery.html`).
  - Leave the other templates alone: the callback refuses any other link type.
  - Test both on a real phone with an email requested from a different device.
- **Auth → URL configuration:** Site URL `https://studylabco.co.uk`; redirect
  URL `https://studylabco.co.uk/auth/callback**` (wildcard, so the `next`
  query matches).

## Vercel

- **Email** (review I4): set `RESEND_API_KEY` and `EMAIL_FROM` in Production.
  In production the site always sends through Resend; if either is missing,
  every email fails loudly (an error in the function logs) instead of being
  printed to the logs. Email bodies are never logged.
- **Never set `E2E_HARNESS`.** It is ignored on Vercel anyway (Turnstile and
  email checks stay on), but it should not exist there.

## Content and legal (owner) — launch gates

- **Owner name** (Ruling R24): fill **Your name (shown on the website)** in
  Admin → Settings → Business details. The footer and Contact page then say
  "Study Lab Co is run by <name>." Nothing is shown while it is empty.
- **Business address:** fill **Business address** in Settings (Electronic
  Commerce Regulations 2002: a geographic address must be shown).
- **Claims removed pending confirmation** (R24): "knows … what examiners look
  for", "book without waiting for a reply", "You'll hear what we covered …",
  "Lessons are never passed to anyone else", "It takes about five minutes", and
  the Terms line charging for a lesson ended for behaviour. Reinstate any of
  them only once confirmed true.
- **Reply-time promises** ("usually within one working day", "within five
  working days") are still on the site: confirm or change them.
- **Agreement forms** are now said to be kept "for up to 12 months after your
  child stops lessons": confirm this matches practice.

## Money (owner)

- **Credit** (Ruling R23): when a parent cancels a paid lesson for free, the
  payment becomes family credit (shown on the family page and on the parent's
  account). Use **Pay from credit** on the family page to put it towards a
  later lesson, or **Record a refund** on Money to pay it back (that uses the
  credit up). Credit is never counted as income twice.
- A parent who deletes their account loses sight of any credit: check the
  family page for credit before helping someone delete their account.
