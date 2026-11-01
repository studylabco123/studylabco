# Study Lab Co design system

GCSE science tuition in Blackburn from a qualified teacher. The site speaks to
parents first (trust, clarity, calm) and students second (science, curiosity).
Direction: **the lab notebook**. Squared exercise-book paper in pale sky, navy
ink, and the logo's lightbulb rays as the one recurring flourish. Warm and
professional, science-themed through drawing and texture, never through
cartoon mascots or neon.

Tokens live in `src/app/globals.css` (`@theme`). Pages use token names
(`bg-sky-100`, `text-navy-900`), never raw hex values.

## Colour

All colours are sampled from the owner's logo (`.superpowers/assets/logo-reference.webp`).
Light theme only; `color-scheme: light`.

| Token | Hex | Role | Contrast |
|---|---|---|---|
| `navy-900` | `#001A42` | Logo navy. Body and heading text, primary buttons, logo ring, focus ring on light surfaces, footer background | 17.1:1 on white, 15.4:1 on sky-100 |
| `navy-800` | `#0F3570` | Primary button hover/pressed | white on it 11.9:1 |
| `navy-600` | `#3D5275` | Secondary text (hints, captions, meta) | 7.9:1 on white, 6.2:1 on sky-200 |
| `navy-400` | `#5A6E8C` | Input and checkbox borders (non-text, needs 3:1) | 5.2:1 on white |
| `sky-50` | `#F5FAFE` | Quiet alternate surface (table stripes, footer of cards) | n/a |
| `sky-100` | `#E8F5FE` | Logo background. Section backgrounds, hero paper | n/a |
| `sky-200` | `#CFE7FA` | Graph-paper lines, card borders, dividers | n/a |
| `sky-300` | `#B4D6F4` | Lightbulb / page fill in illustrations, focus ring on navy surfaces | 11.3:1 against navy |
| `sky-500` | `#78B3E8` | Lightbulb rays. **Decoration only** | 2.2:1 on white, never text |
| `white` | `#FFFFFF` | Page and card surface, text on navy | |
| `success-700` / `success-50` | `#1D6B43` / `#E7F4EC` | Paid, confirmed, saved | 5.7:1 |
| `warning-700` / `warning-50` | `#7A4E00` / `#FFF4DC` | Owed, late cancellation notices | 6.6:1 |
| `danger-700` / `danger-50` | `#B3261E` / `#FCEBEA` | Errors, destructive actions | 5.7:1 |

Rules
- **Sky is never text.** Sky tones are backgrounds, borders and illustration only.
- Navy is the only action colour. There is no secondary accent colour.
- Status colours always come with a word ("Paid", "Owed"), never colour alone.

## Typography

Self-hosted at build time with `next/font/google` (no runtime requests).

| Family | Token | Use | Why |
|---|---|---|---|
| Lexend (variable) | `font-display` | Headings, buttons, nav, badges | Geometric and round like the logo lettering (which is outlined Lexend 800/400); designed for reading fluency |
| Atkinson Hyperlegible Next (variable) | `font-sans` | Body copy, forms, tables | Built by the Braille Institute for legibility: unambiguous letterforms for parents and teenagers alike |

Scale (major third, 18px body):

| Token | Size / line height | Weight | Use |
|---|---|---|---|
| `text-display` | clamp(2.5rem → 3.75rem) / 1.05 | Lexend 600, -0.02em | Home hero only |
| `text-h1` | clamp(2rem → 2.75rem) / 1.1 | Lexend 600, -0.015em | Page titles |
| `text-h2` | clamp(1.625rem → 2.125rem) / 1.2 | Lexend 600 | Section headings |
| `text-h3` | 1.375rem / 1.3 | Lexend 600 | Card titles |
| `text-lead` | 1.25rem / 1.55 | Atkinson 400 | Intro paragraphs |
| `text-body` | 1.125rem / 1.6 | Atkinson 400 | Body (default) |
| `text-small` | 1rem / 1.5 | Atkinson 400 | UI text, hints, table cells |
| `text-fine` | 0.875rem / 1.45 | Atkinson 400 | Legal small print, footer meta |

Body never below 16px. Prose max width `65ch`. Sentence case everywhere;
no all-caps labels (the logo's "TUTORING" is the only spaced capitals).

## Spacing and layout

- 4px base (Tailwind default scale). Common steps: 2, 3, 4, 6, 8, 12, 16, 24.
- Content width `max-w-content` = 72rem with `px-5 sm:px-8` gutters.
- Section rhythm: `py-16 md:py-24`.
- Left-aligned content. Centre only short, single-purpose blocks (a final CTA).
- Breakpoints: Tailwind defaults; primary nav switches to desktop at `xl` (1280px); below that the "Menu" disclosure is used.

## Shape and depth

| Token | Value | Use |
|---|---|---|
| `rounded-field` | 0.5rem | Inputs, checkboxes (0.25rem), table wrappers |
| `rounded-card` | 1rem | Cards, dialogs, toasts |
| `rounded-full` | pill | Buttons and badges (echoes the round logo) |
| `shadow-card` | `0 1px 2px rgb(0 26 66 / .06), 0 12px 32px -16px rgb(0 26 66 / .22)` | Raised cards, header when scrolled, toasts |
| `shadow-pop` | `0 24px 64px -24px rgb(0 26 66 / .45)` | Dialogs and the mobile menu |

Shadows are navy-tinted, never grey. Most cards are flat with a `sky-200`
border; `shadow-card` is for things that float.

## Components (`src/components/ui`)

- **Button**: `primary` (navy fill, white text), `secondary` (white fill, navy
  2px border), `quiet` (navy text, sky-100 hover wash). Sizes `md` (44px min
  height, no wrap) and `lg` (52px, may wrap on narrow screens). `ButtonLink` renders the same styles as a Next link.
  Disabled: 50% opacity, no press feedback. Press: scale 0.97.
- **Field**: label above input, optional hint, error below with an icon and
  `aria-invalid` + `aria-describedby`. Supports `input`, `textarea`, `select`.
- **Checkbox**: 24px box, label to the right, optional description; never
  pre-ticked (no `defaultChecked` from callers for consent).
- **Card**: white, `sky-200` border, `rounded-card`; `tone="sky"` for a sky-100 panel.
- **Badge**: pill, `tone` = `sky` (trust badges), `success`, `warning`, `danger`, `neutral`.
- **Dialog**: native `<dialog>` with `showModal()` (focus trap, Escape, inert background for free).
- **Table**: horizontal-scroll wrapper, visible `<caption>`, `scope="col"` headers.
- **Toast**: `ToastProvider` + `useToast()`; polite live region, auto-dismiss 6s, dismiss button.
- **Reveal**: fade/slide-in on scroll. Below-the-fold content only: it stays
  hidden until hydration, so never wrap the headline or other LCP content in it
  (use `motion-safe:animate-rise` for above-the-fold entrances).

Site chrome (`src/components/site`): `Logo`, `Header` (sticky, white; "Menu"
disclosure below `xl`), `Footer` (navy, business details, legal links).
Public page parts (`src/components/site`): `PageIntro` (graph-paper title band)
and `Section`, `Hero`, `Steps` (numbered: only for real sequences),
`HowItWorks`, `PriceTable` (price list that reflows on phones), `GroupList`,
`LegalPage` (policy frame; body styled by the `prose-site` utility),
`ContactForm`. Prices always come from settings via `formatPence`.

Focus: 3px `navy-900` outline with 2px offset on light surfaces; `sky-300` on
navy surfaces. Every interactive element has a visible focus state.

## Motion

| Interaction | Duration | Easing | Property |
|---|---|---|---|
| Hero entrance on load (`animate-rise`, pure CSS) | 600ms (stagger 80ms) | `--ease-out` | opacity, translateY 16px |
| Reveal on scroll (`<Reveal>`, below the fold) | 600ms (stagger 80ms) | `--ease-out` cubic-bezier(0.23, 1, 0.32, 1) | opacity, translateY 16px |
| Button press | 120ms | ease-out | scale 0.97 |
| Hover colour | 150ms | ease | background, border colour |
| Mobile menu open | 200ms | ease-out | opacity, translateY -8px |
| Dialog open | 220ms | ease-out | opacity, scale 0.96 |
| Toast in | 240ms | ease-out | opacity, translateY 12px |

Only `transform` and `opacity` animate. Everything is wrapped in
`prefers-reduced-motion: no-preference` (CSS) or Tailwind `motion-safe:`, so
under `reduce` there is no movement and reveal content is visible immediately.
Hover-only effects are gated to `(hover: hover)`.

## Imagery and icons

- No photographs (none of the tutor exist). Custom inline SVG illustrations in
  navy line (2-3px strokes, round caps) with sky-300 fills: flasks, molecules,
  the lightbulb, the open book.
- Signature texture: graph-paper grid (`.bg-graph`), sky-200 lines on sky-100,
  24px squares, used on the hero and occasional feature panels.
- Icons: inline SVG, 24px grid, 2px navy stroke, round caps (drawn to match).
  Decorative SVGs get `aria-hidden="true"`.

## Logo

- `public/logo.svg`: full logo (ring, arched "STUDYLABCO.", bulb over book,
  "TUTORING"). Generated by `scripts/build-logo.py`; lettering outlined from
  Lexend so it renders identically everywhere.
- `public/logo-mark.svg` / `src/app/icon.svg`: compact mark (ring + bulb + book)
  for favicons and small sizes. Use the full logo at 56px and above.
- Home-screen icons: `src/app/apple-icon.png`, `public/icons/icon-*.png`
  (rendered from `public/icons/app-icon.svg` by `scripts/build-icons.mjs`).
- Alt text: "Study Lab Co Tutoring logo".

## Copy

Plain British English, sentence case, active voice. "Book Assessment", not
"Get started". Never mention online lessons (switched off at launch). Late
fees are a "late cancellation fee", never a fine or penalty.
