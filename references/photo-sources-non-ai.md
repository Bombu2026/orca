# Photo Sources — Non-AI

Reference for sourcing authentic photography that doesn't read as stock or AI-generated. Consumed by `/site` during asset planning.

---

## The Problem

Two failure modes kill showcase-site credibility:

1. **Generic stock** — smiling office workers, handshake diversity shots, "person pointing at laptop". Signals "we had no photos and grabbed Unsplash defaults".
2. **AI imagery** — too-smooth skin, 7-finger hands, identical lighting across sets, uncanny symmetry. Reads as lazy in 2026; clients and visitors both detect it.

The goal is authentic photography — curated, imperfect, with grain, cadrage, depth of field. Often one good photo beats 20 mediocre.

---

## Free / Freemium Sources

### Unsplash
**URL** — `unsplash.com`
**License** — Unsplash License (free commercial, no release on identifiable persons).
Largest library. Quality varies wildly. Filter by photographer (follow curators like Annie Spratt, Brooke Lark, Christopher Campbell) rather than tag search — tag searches return the same stock-looking top results.

### Unsplash+
**URL** — `unsplash.com/plus`
**Pricing** — ~$10/month.
Premium tier, exclusive content, extended commercial license (identifiable persons included, no release needed). Worth it on one client project to get "not-Unsplash" Unsplash.

### Pexels
**URL** — `pexels.com`
**License** — Pexels License (free commercial).
Smaller than Unsplash, similar quality distribution. Useful as second source when Unsplash is exhausted.

### Dupe
**URL** — `dupe.photos`
**License** — free, CC-style.
Community-driven, explicitly anti-stock. Aesthetic lean: grain, muted tones, editorial. Best source for **mood-led** projects (coffee brand, fashion, studio). Smaller catalog, higher per-photo quality.

### Picjumbo
**URL** — `picjumbo.com`
**Pricing** — Premium $179 lifetime (one-time), free tier exists.
Thematic curated collections by one photographer (Viktor Hanacek). Strong for lifestyle, workspace, food. Cohesive sets — useful when you need 5 photos in the same visual universe.

### StockSnap
**URL** — `stocksnap.io`
**License** — CC0 (truly no restrictions).
Smaller, hit-or-miss, but CC0 license is the cleanest possible.

### Lummi
**URL** — `lummi.ai` (misleading name)
**License** — free with attribution / paid tier.
Positioned explicitly against AI imagery — curates human photography. Strong editorial sets, newer library.

---

## Premium (Paid)

### Stocksy
**URL** — `stocksy.com`
**Pricing** — ~$25-$500 per image depending on license (web / print / unlimited).
Co-op of vetted photographers. Highest quality per dollar of any commercial library. Used by Apple, Nike, premium agencies. Worth it when client budget allows 3-10 hero images.

### Death to Stock
**URL** — `deathtostock.com`
**Pricing** — ~$15/month or $159/year.
Monthly photo packs curated by theme (workspace, travel, food). Subscription model. Exclusive to members for 30 days, then broader release. Strong "unstocky" aesthetic.

### Twenty20 (Stills) / Offset / Gallery Stock
Tier above Stocksy for branded editorial — mostly used by ad agencies. Price-prohibitive for studio-site work unless specifically requested.

---

## Anti-Stock-Look Curation

Recognize and reject the stock aesthetic. Rules to hunt good photos:

- **Grain, not clean** — sensor noise, film grain, texture = authenticity signal.
- **Imperfect composition** — subject cropped, off-center, back-to-camera. Rule-of-thirds done wrong deliberately.
- **Occlusion** — hand in frame, hair in face, depth-of-field blur across subject. Reads as captured not staged.
- **Mid-motion** — walking, pouring, reaching. Frozen moments > posed portraits.
- **Real space** — cluttered desk, stained cup, worn chair. Curated messiness beats studio sterility.

**Avoid like the plague**
- Smiling person pointing at laptop screen
- Handshake photo ("partnership")
- Diverse team high-fiving in sunlit office
- Woman laughing alone with salad
- Man looking at sticky notes on glass wall
- Overhead shot of hands on keyboard + coffee + plant + notebook at exactly 45°
- Portrait with blurred cityscape behind and lens flare

Post-processing pass — desaturate slightly (`filter: saturate(0.92)` or `saturate(0.88)`) to unify palette across sources. Apply a subtle warm or cool tint via duotone / CSS `filter` to force visual coherence when photos come from 3+ sources.

---

## Integration in Next.js 16

### `next/image` rules

```tsx
import Image from 'next/image'
import heroImg from '@/public/images/opt/hero.jpg'

<Image
  src={heroImg}
  alt="Descriptive alt"
  priority
  placeholder="blur"
  sizes="(max-width: 768px) 100vw, 50vw"
  className="object-cover"
/>
```

- **`priority`** — on hero (LCP element). One per page, never more.
- **`placeholder="blur"`** — automatic when you `import` a local static image (Next generates blurDataURL at build). For remote images, supply `blurDataURL` manually.
- **`sizes`** — mandatory on any non-fixed-size image. Without it, `next/image` serves the largest size to everyone. Match your layout breakpoints.
- **`alt`** — never empty on content images. Empty only for purely decorative images (`alt=""`).

### Blur placeholder generation

For remote images or when import isn't possible:

```bash
bun add plaiceholder sharp
```

```ts
// lib/placeholder.ts
import { getPlaiceholder } from 'plaiceholder'
import fs from 'node:fs/promises'

export async function blur(path: string) {
  const buf = await fs.readFile(path)
  const { base64 } = await getPlaiceholder(buf)
  return base64
}
```

Use at build time or in Server Components. `plaiceholder` works with Bun.

### Formats

Next.js 16 serves AVIF/WebP automatically based on `Accept` headers. No config needed. Configure `images.formats: ['image/avif', 'image/webp']` in `next.config.ts` only if you want to force AVIF-first ordering (saves ~30% vs WebP on hero).

---

## Cloudinary / imgix (Optional)

URL-based transformations — useful when client delivers 200 raw photos and you don't want to pre-process them. Not required for showcase projects with 5-20 curated images.

If used: wrap in a custom loader for `next/image` so the `Image` component still produces srcsets.

```ts
// lib/image-loader.ts
export const cloudinaryLoader = ({ src, width, quality }: { src: string; width: number; quality?: number }) =>
  `https://res.cloudinary.com/CLOUD/image/upload/w_${width},q_${quality ?? 75},f_auto/${src}`
```

---

## Workflow (Recommended)

1. **Define mood in MOODBOARD.md** — 1-2 sentences: "warm editorial, grain, back-turned subjects, mid-motion, muted palette tending cool".
2. **Curate 20-30 candidates** from 2-3 sources max. Save URLs in a spreadsheet or `assets/curated.md`.
3. **Narrow to 8-12 finals** with client if available, else as designer.
4. **Download raw** to `public/images/raw/` (gitignored in dev, committed in prod if under 5MB each).
5. **Batch optimize** via `sharp` script:

```ts
// scripts/optimize-images.ts
import sharp from 'sharp'
import fs from 'node:fs/promises'
import path from 'node:path'

const IN = 'public/images/raw'
const OUT = 'public/images/opt'
const SIZES = [640, 1280, 1920]

for (const file of await fs.readdir(IN)) {
  if (!/\.(jpe?g|png)$/i.test(file)) continue
  const base = path.parse(file).name
  for (const w of SIZES) {
    await sharp(path.join(IN, file))
      .resize({ width: w })
      .toFormat('avif', { quality: 70 })
      .toFile(path.join(OUT, `${base}-${w}.avif`))
    await sharp(path.join(IN, file))
      .resize({ width: w })
      .toFormat('webp', { quality: 75 })
      .toFile(path.join(OUT, `${base}-${w}.webp`))
  }
}
```

Run with `bun scripts/optimize-images.ts`.

6. **Commit `public/images/opt/*`** — the optimized outputs are source of truth in prod.
7. **Reference via `import`** in components so `next/image` gets dimensions + blur placeholder automatically.

---

## Licensing Caveat

Unsplash License permits commercial use **except** identifiable persons without release. If a photo shows a recognizable face and you're using it in marketing context (CTA section, testimonial, brand hero), either:

- Use Unsplash+ (extended license includes person releases)
- Use Stocksy (per-image model release documented)
- Commission your own shoot

Never use a stock photo of a face as "a customer" or "a team member" — that's impersonation and triggers real legal risk. Flag this to the client during brief.
