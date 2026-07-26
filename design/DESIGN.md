# Waypoint design system

Codified from the approved Claude Design deliverable (_Waypoint Phase 3a_).
This file is the source of truth for future phases — reference it here rather
than re-deriving values from the original `.dc.html` (which is a Claude Design
runtime full of `{{ }}` bindings and `<sc-if>` elements, not portable markup).

The tokens live in `src/app/globals.css` as `--wp-*` primitives; the shadcn
semantic names (`--background`, `--primary`, …) are mapped onto them so the
Phase 2 admin portal and every vendored component inherit this look for free.

---

## The spine — three acts

Every consumer screen serves one narrative, in order:

**Open a card → Earn the rest → Redeem.**

A goal is stated as a destination; the engine works backward to the cheapest
reachable redemption; the UI shows _what you hold_, _what one new card unlocks_,
_what steady spend earns_, and _the booking_. Never lead with the card pitch —
lead with the trip, and let the card fall out as the honest next step.

## Palette

Warm, deliberately **not** black-on-white. Navy ink on warm paper, one
champagne accent, calm semantic colors that never turn alarmist.

| Role                | Token                 | Hex       | Use                                              |
| ------------------- | --------------------- | --------- | ------------------------------------------------ |
| Navy ink            | `--wp-ink`            | `#20263B` | Headings, primary buttons, ink, dark panels      |
| Ink (gradient)      | `--wp-ink-2`          | `#2B3450` | Card-mark gradient start                         |
| Ink (deep)          | `--wp-ink-3`          | `#161B2C` | Gradient end, deepest shadow                     |
| Body                | `--wp-body`           | `#4A5063` | Body copy on paper                               |
| Muted               | `--wp-muted`          | `#6C7385` | Secondary text                                   |
| Muted 2             | `--wp-muted-2`        | `#9AA0AE` | Tertiary text, placeholders, hex captions        |
| Warm paper          | `--wp-paper`          | `#F7F4ED` | App background, primary-button text              |
| Canvas              | `--wp-canvas`         | `#E7E4DD` | Deeper canvas behind panels                      |
| Panel white         | `--wp-panel`          | `#FFFFFF` | Cards, panels                                    |
| Track               | `--wp-track`          | `#EFEBE2` | Progress track, subtle fills, "stretch" badge bg |
| Surface 2           | `--wp-surface-2`      | `#EBE6DC` | Active nav pill, "reachable" badge bg            |
| Border              | `--wp-border`         | `#E6E0D4` | Hairline borders                                 |
| Border 2            | `--wp-border-2`       | `#DED8CC` | Panel borders, input borders                     |
| Divider             | `--wp-divider`        | `#D2CEC4` | Section rules                                    |
| Dashed              | `--wp-border-dashed`  | `#C9C2B2` | "No card art" dashed placeholders                |
| **Champagne**       | `--wp-accent`         | `#C6A35C` | THE accent — fills, dots, lines, focus ring      |
| Champagne (text)    | `--wp-accent-text`    | `#8C6E2C` | Accent-colored **text** (contrast-safe on paper) |
| Success             | `--wp-success`        | `#3C7A5A` | "Bookable now", positive text                    |
| Success bg          | `--wp-success-bg`     | `#E7F1EA` | "Bookable now" badge background                  |
| Error only          | `--wp-danger`         | `#B4453A` | Errors — never for emphasis                       |

### The accent-restraint rule — champagne ≤ 5 per screen

`#C6A35C` is a spice, not a base. **Five uses per screen is a ceiling, not a
target.** An eyebrow label, a primary figure's underline, one CTA, a progress
fill, a single badge — then stop. Check every screen you build against this
before shipping it. Everything else is navy, paper, and muted gray.

### Contrast — champagne is the value at risk

`--wp-accent` (`#C6A35C`) **fails 4.5:1 as text on paper.** It is only ever a
fill, dot, line, border, or focus ring. Any accent-_colored text_ uses
`--wp-accent-text` (`#8C6E2C`), which passes. This split is deliberate — do not
collapse them. All other text pairings (ink/body/muted on paper or panel) clear
4.5:1.

## Type — Fraunces display over Inter body

- **Fraunces** (serif), weight 600, tracking `-0.02em`, line-height 1 — the
  wordmark, page headings, section heads, and every large **figure**. Loaded
  via `next/font/google`; use the `.font-display` class or `font-serif`.
- **Inter** (sans) — every word of body, label, and control. Regular for prose,
  600 for labels. Loaded as `--font-inter`; it is the default `font-sans`.
- **`tabular-nums` on every number that changes.** Balances, points, dollars,
  percentages — all tabular so columns don't jitter.

Display scale (px, Fraunces 600): 46 display · 38 page title · 34 form title ·
26 section head · 24 panel head · 22 figure · 19 meter. Body scale (Inter):
15 lede · 14 control · 13 body · 12.5 caption · 12 label · 11 eyebrow.

**Eyebrow labels** (`.wp-eyebrow`): 11px, weight 700, `letter-spacing: 0.14em`,
uppercase, `--wp-accent-text`.

## Shape & elevation

| Element | Radius   |
| ------- | -------- |
| Panels  | 16–18 px |
| Cards   | 14 px    |
| Buttons | 10 px    |
| Pills   | 999 px   |

Base `--radius` is `0.75rem` (12px), giving shadcn `md`≈10 (buttons), `lg`≈12,
`xl`≈16 (panels).

Shadows (extracted):

- `--shadow-wp-sm` — `0 1px 3px rgba(32,38,59,.08)` — resting cards.
- `--shadow-wp-panel` — `0 24px 60px -28px rgba(32,38,59,.4)` — wide, faint
  screen panels.
- `--shadow-wp-dark` — `0 16px 34px -18px rgba(22,27,44,.7)` — elevated dark
  surfaces.

## Components — the invariants

- **App header.** Translucent paper (`rgba(247,244,237,.85)`) with
  `backdrop-filter: blur`, Waypoint wordmark in Fraunces, nav as pills — the
  active pill is `--wp-surface-2` with ink text, the rest muted.
- **Buttons.** Primary = ink bg / paper text / 10px. Secondary = panel bg / ink
  text / `--wp-border-2` border. A champagne-fill button exists but counts
  against the ≤5 budget — prefer ink.
- **Reachability tiers** (calm at every tier, never red):
  - _Bookable now_ — success text on `--wp-success-bg`, dot `--wp-success`.
  - _Reachable_ — ink text on `--wp-surface-2`, dot ink.
  - _Needs a card_ — `--wp-accent-text` on `color-mix(--wp-accent, #fff 84%)`,
    dot `--wp-accent`.
  - _A stretch_ — muted text on `--wp-track`, dot `--wp-muted-2`.
  - _Not planned_ — muted text on `--wp-track`, no dot (used before a plan is
    generated; never guess a tier).
- **Card & program marks — brand color + wordmark + IATA, never logos.** A held
  card is a small brand-colored tile (ink or champagne gradient) with the issuer
  wordmark (Fraunces italic). A program with no art is a dashed
  `--wp-border-dashed` placeholder with the program name + IATA. `logo_url`
  exists in the schema but stays **unused** until Design signs off on real art.
- **Honest empty states.** Never a broken CTA, never a false "unavailable"
  (unknown seat data ≠ sold out), never a fake logo. "Not planned" is a real
  state, not an error.
- **Meters.** Track `--wp-track`; fill a champagne gradient
  (`linear-gradient(90deg, var(--wp-accent), color-mix(in oklab, var(--wp-accent), #fff 25%))`).

## Hard rules (all Phase 3b screens)

- No airline logos, no card art beyond brand color + wordmark.
- No `localStorage` / `sessionStorage`.
- Light mode only — the `.dark` block in `globals.css` stays present and
  unmodified but is never activated.
- Responsive to 375px on wallet, goal creation, and dashboard.
- Visible keyboard focus on every interactive element (champagne ring).
- `prefers-reduced-motion` respected (handled globally in `globals.css`).
- Text contrast ≥ 4.5:1 everywhere — champagne text uses `--wp-accent-text`.
