# Typography 2026

Reference for type selection, pairing, and loading in Next.js 16 + Tailwind 4 showcase sites. Consumed by `/site` during moodboard and design-token setup.

---

## 2026 Trend

The Inter hegemony is over. 2023-2024 premium sites pivoted to **modern neo-grotesques** (Neue Montreal, General Sans, Satoshi) for body and **soft/editorial serifs** (Fraunces, Instrument Serif, PP Editorial New) for display. 2025-2026 continues and deepens this — expressive variable serifs in hero, tight neo-grotesque in body, kinetic treatments (split text, variable proximity) as signature.

Inter still appears in SaaS defaults (Vercel, Linear) but reads as corporate-safe rather than premium. If the brief is studio-grade, pick elsewhere.

---

## Top Picks 2026

### PP Neue Montreal (Pangram Pangram)
Geometric neo-grotesque, 6 weights. The reference body font of premium studios (Obys, Basement, Darkroom). Crisp, neutral, high legibility.
**License** — Pangram SaaS, ~$200 commercial for single-domain. Not redistributable.
**Source** — `pangrampangram.com`

### PP Editorial New (Pangram Pangram)
High-contrast display serif with dramatic italic. Used by premium brands for hero statements.
**License** — Pangram SaaS, same tier as Neue Montreal.
**Source** — `pangrampangram.com`

### Fraunces (Google Fonts)
Variable display serif, 7 axes (weight, optical size, soft, wonky, italic, slant, grade). Editorial, expressive, free. One of the most versatile fonts ever shipped to Google Fonts.
**License** — Open Font License. Free commercial.
**Source** — `fonts.google.com/specimen/Fraunces`

### Satoshi (Fontshare)
Geometric neo-grotesque, 9 weights. Cleaner, more modern alternative to Inter. Popular choice for product UI.
**License** — Fontshare free commercial unlimited (Indian Type Foundry).
**Source** — `fontshare.com/fonts/satoshi`

### General Sans (Fontshare)
Neutral cleanique sans, 6 weights. The best free alternative to Neue Montreal. High x-height, narrow, excellent for dense body text.
**License** — Fontshare free commercial unlimited.
**Source** — `fontshare.com/fonts/general-sans`

### Migra (Pangram Pangram)
Heavy display serif with extreme contrast. Editorial hero font — one word, huge, statement.
**License** — Pangram SaaS.
**Source** — `pangrampangram.com`

### Instrument Serif (Google Fonts)
High-contrast modern serif. Only regular and italic — minimal but impactful.
**License** — Open Font License. Free commercial.
**Source** — `fonts.google.com/specimen/Instrument+Serif`

---

## Editorial Pairings

Canonical combinations. Display font for hero/section titles, body font for paragraphs, UI, and small text.

- **Fraunces + General Sans** — free, editorial, balanced. Default recommendation when license budget is zero.
- **PP Editorial New + PP Neue Montreal** — premium studio pairing. Coherent same-foundry aesthetic. Budget ~$400 commercial license.
- **Migra + Satoshi** — Migra for hero statement only (1-2 words), Satoshi for everything else.
- **Instrument Serif + Inter** — safe, free, editorial-leaning SaaS. When the client wants "elegant but not fancy".
- **Fraunces (variable) alone** — one variable font, display at `opsz` ~120 / `wght` 500, body at `opsz` ~14 / `wght` 400. Single file, multiple voices. Budget-conscious and legit.

---

## Loading in Next.js 16

### Google Fonts — `next/font/google`

Zero-CLS automatic, subsets preloaded, self-hosted on Vercel edge. Always prefer over `<link>` tags.

```tsx
// app/fonts.ts
import { Fraunces, General_Sans } from 'next/font/google'

export const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
  axes: ['opsz', 'SOFT', 'WONK'],
})

export const generalSans = General_Sans({
  subsets: ['latin'],
  variable: '--font-general-sans',
  display: 'swap',
  weight: ['400', '500', '600'],
})
```

```tsx
// app/layout.tsx
import { fraunces, generalSans } from './fonts'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${generalSans.variable}`}>
      <body>{children}</body>
    </html>
  )
}
```

### Local fonts — `next/font/local`

For Pangram, Fontshare (WOFF2 download), or custom foundry licenses. Drop WOFF2 files in `public/fonts/`.

```tsx
// app/fonts.ts
import localFont from 'next/font/local'

export const neueMontreal = localFont({
  src: [
    { path: '../public/fonts/PPNeueMontreal-Regular.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/PPNeueMontreal-Medium.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/PPNeueMontreal-Bold.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-neue-montreal',
  display: 'swap',
  preload: true,
})
```

**WOFF2 only** in 2026 — no WOFF, no TTF fallback. Every modern browser supports WOFF2 and the size win is 30-40%.

---

## Tailwind 4 Integration

Tailwind 4 is CSS-first. Expose fonts via `@theme` in `app/globals.css`:

```css
@import "tailwindcss";

@theme {
  --font-display: var(--font-fraunces), Georgia, serif;
  --font-sans: var(--font-general-sans), system-ui, sans-serif;
  --font-mono: ui-monospace, "SF Mono", monospace;
}
```

Now `font-display`, `font-sans`, `font-mono` work as Tailwind utilities. Always include a real fallback stack — if the custom font fails to load, the page stays legible.

Usage:

```tsx
<h1 className="font-display text-7xl">Editorial heading</h1>
<p className="font-sans text-base">Body copy.</p>
```

---

## Variable Fonts

Prefer variable fonts for hero typography. One file carries multiple weights/slants/optical sizes — smaller bundle, more expressive range.

Activate axes via CSS:

```css
.hero-title {
  font-family: var(--font-fraunces);
  font-variation-settings: 'opsz' 144, 'wght' 500, 'SOFT' 80, 'WONK' 1;
}
```

Or via Tailwind arbitrary values:

```tsx
<h1 className="font-display [font-variation-settings:'opsz'_144,'wght'_500]">
```

Canonical axes
- `wght` — weight (100-900)
- `opsz` — optical size (tight glyphs at small sizes, loose at display)
- `slnt` / `ital` — slant / italic
- `SOFT` — roundness (Fraunces)
- `WONK` — irregular glyph variants (Fraunces)

---

## Rules

- **`display: 'swap'`** — always. FOIT (invisible text until font loads) kills perceived performance.
- **`preload: true`** — on the font used in the hero (first paint). Skip preload on body fonts if the hero uses a different family — avoid over-preloading.
- **Fallback stack** — always include 1-2 system fonts in `--font-*` values. Matching metrics matters more than matching aesthetic.
- **Max 3 families** — one display, one body, one mono (if needed). Beyond 3 = bundle bloat + visual incoherence.
- **Subset carefully** — `subsets: ['latin']` is default; add `['latin-ext']` only if you need diacritics (Polish, Turkish, etc.).
- **Weight hygiene** — load only weights you use. Each weight is a separate download. 400 + 500 + 700 is typical; 400 + 500 + 600 + 700 + 800 + 900 is wasteful.
- **Line-breaking** — never ship default greedy wrap on read copy. See the non-negotiable section below.

---

## Line-breaking & micro-typography (NON-NEGOTIABLE)

The #1 tell of machine-generated layout is a **stranded short word** — a pronoun, article or preposition left dangling at the end of a line while its phrase continues on the next:

```
…se choisit séparément. Vous        ← "Vous" stranded, inhuman
prenez seulement celle qui…
```

No human typesetter ships that. Every multi-line title and every short paragraph a visitor reads MUST be wrapped intentionally. This is not cosmetic — it is the line between human and machine typesetting, and it is auditable.

### Global safety net — always, in `globals.css`

```css
body { text-wrap: pretty; }         /* reflows last lines, kills orphans site-wide */
h1, h2, h3 { text-wrap: balance; }  /* evens out 2–4 line headings */
```

`text-wrap: pretty` is supported by every 2026 evergreen browser (Chrome 117+, Safari 17.5+, FF 121+). It is a progressive enhancement — older engines fall back to normal wrap, never break.

### Per-block — required

- **Headings, subheads, kickers, short intros (≤ 3 lines)** → Tailwind `text-balance`. Balancing forces even line lengths and removes the stranded-word break. This is what fixes the example above.
- **Body paragraphs (≥ 4 lines)** → Tailwind `text-pretty`. Browsers cap `balance` at ~6 lines; it is the wrong tool for long copy.
- The default greedy wrap is acceptable ONLY for text no visitor reads closely (hidden, decorative).

### Prominent headings — prefer ONE line (operator preference)

For hero subtitles and section headings, a clean single line beats a balanced two-line wrap — a two-line heading with a short, stranded second line (`…ou sur devis.`) reads as unfinished. When the operator wants the full text kept:

1. **Reduce the size** (smaller `clamp()`), drop any `max-w-*` cap so the heading can use the full column width.
2. Force one line on desktop with `lg:whitespace-nowrap` (NOT `md:` — at ~768px the column is too narrow and it overflows).
3. On mobile, let it wrap normally — `frtypo` handles the orphans.
4. **Measure, don't guess**: the element must be exactly 1 line AND the page must have 0 horizontal overflow at 1024 / 1280 / 1440 / 1680, plus 0 overflow at 320 / 360 / 390. Tune the `clamp()` until both pass.

Shrinking to fit one line is preferred over a two-line break whenever the operator flags wrapping as ugly.

### When CSS isn't enough — hard joins

`text-balance` / `text-pretty` are hints, not guarantees. For a seam that must never break, glue the words with a non-breaking space ` ` (or wrap in `white-space: nowrap`):

- Subject pronoun + verb that would otherwise split: `Vous prenez`.
- A short tail you refuse to strand: `… celle qui vous concerne.`
- Brand / number tokens: `Bac+3`, `750 €`, `2 à 3 jours`.

### French micro-typography (NON-NEGOTIABLE on FR sites)

French puts a (thin) non-breaking space before double punctuation and inside guillemets. A plain space lets the punctuation wrap alone to the next line — another inhuman tell.

- Before `: ; ! ?` and before `»` → ` ` (or thin ` `).
- After `«` → ` `.
- Number + unit/symbol → ` ` : `750 €`, `48 h`, `20 %`.
- Real typographic apostrophe `’` (U+2019), never straight `'`.
- **No em dash or en dash (`—` `–`) as punctuation.** It is a top AI-slop tell, and an explicit operator ban (l'opérateur). Use a comma, a colon, parentheses, or a full stop instead. Keep ONLY orthographic hyphens inside compound words (`Bouches-du-Rhône`, `sur-mesure`, `Bac+3`). When auditing copy, grep for `[—–]` and rewrite every hit.

### Authoring rule — the final pass

After writing ANY visible copy (hero, subhead, card body, CTA, legal), **read each rendered line**. If a line ends on a 1–4 letter function word (le, la, un, de, et, à, ou, en, je, **Vous**…) that belongs to the next line, fix it with `text-balance` or a ` `. Do this pass at the rendered width(s) the user actually sees — a screenshot, not a guess. It is not optional.

**Elisions are the blind spot** that defeats a naive detector: `qu'un`, `jusqu'à`, `l'on`, `d'une` strand the word AFTER the apostrophe (`un`, `à`, `on`, `une`), but a whole-token lookup sees `qu'un` (not a stop-word) and passes. The orphan linker AND any detector MUST split each token on the apostrophe and test the LAST segment. A green orphan-check that ignores elisions is a false negative — verify the detector catches `qu'un` before trusting it.

---

## Licensing

- **Google Fonts** — Open Font License (OFL). Free commercial, redistributable, bundleable. Zero legal risk.
- **Fontshare** — Indian Type Foundry, free commercial unlimited. Attribution appreciated but not required. Bundleable.
- **Pangram Pangram** — SaaS license, per-domain (typically $200-500 for one domain, perpetual). Not redistributable. Must track domains per client. Can cache WOFF2 on your CDN.
- **Commercial Type, Klim, Grilli, OH no** — premium foundries, high-end licensing ($500-5000). Reserved for named-budget brand projects.

Always archive the license PDF/email in the client's asset drive. On handoff, document which fonts the client has license rights to.
