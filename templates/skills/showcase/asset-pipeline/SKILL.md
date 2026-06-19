---
name: asset-pipeline
description: >-
  Pipeline complet assets visuels pour site vitrine — photos (sharp → WebP/AVIF
  + blur placeholder), vidéos (ffmpeg → mp4/webm + poster), fonts (next/font
  setup). Triggers : "ajoute cette photo", "optimise image", "video pour hero",
  "setup font", "pipeline photos". Model-invoked naturellement, ou user-invoked
  pour orchestration manuelle.
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - WebFetch
---

# Asset Pipeline Skill

Mission : passer d'un asset brut à un asset optimisé prêt à intégrer.

## Photos

### Sourcing
Référence : `references/photo-sources-non-ai.md`. Workflow manuel (pas d'API) :
1. User télécharge depuis Unsplash+ / Dupe / Pexels / Picjumbo → `public/images/raw/`
2. Propose mots-clés curation selon BRIEF.md §6 + MOODBOARD.md imagerie

### Optimisation
Check `sharp` installé (`bun pm ls sharp`). Si non : `bun add sharp` (seule dep accessoire autorisée ici).

Pattern script `scripts/optimize-images.ts` (génère si absent) :
```typescript
import sharp from 'sharp'
import { readdirSync } from 'fs'
import { join } from 'path'

const RAW = 'public/images/raw'
const OPT = 'public/images/opt'
const SIZES = [{ label: 'sm', w: 640 }, { label: 'md', w: 1280 }, { label: 'lg', w: 1920 }]

for (const file of readdirSync(RAW)) {
  const slug = file.replace(/\.[^.]+$/, '')
  for (const { label, w } of SIZES) {
    await sharp(join(RAW, file)).resize(w).webp({ quality: 85 }).toFile(join(OPT, `${slug}-${label}.webp`))
    await sharp(join(RAW, file)).resize(w).avif({ quality: 65 }).toFile(join(OPT, `${slug}-${label}.avif`))
  }
  // Blur placeholder base64 (10px)
  const blur = await sharp(join(RAW, file)).resize(10).toBuffer()
  const dataUri = `data:image/webp;base64,${blur.toString('base64')}`
  // Écrit dans lib/blur-placeholders.ts (append)
}
```

### Integration
Génère JSX snippet prêt à coller :
```tsx
<Image
  src="/images/opt/{slug}-lg.webp"
  alt="{{alt}}"
  width={1920}
  height={1080}
  priority  // hero only
  placeholder="blur"
  blurDataURL={blurPlaceholders.{slug}}
  sizes="(max-width: 768px) 100vw, 80vw"
/>
```

## Vidéos

Check ffmpeg installé (`which ffmpeg`). Si non : `brew install ffmpeg`.

Pattern compression :
```bash
ffmpeg -i input.mov -vf "scale=1920:-2,fps=30" -c:v libx264 -crf 23 -preset slow -an -movflags +faststart public/videos/{slug}.mp4
ffmpeg -i input.mov -vf "scale=1920:-2,fps=30" -c:v libvpx-vp9 -crf 30 -b:v 0 -an public/videos/{slug}.webm
ffmpeg -i input.mov -ss 00:00:01 -vframes 1 -q:v 2 public/videos/{slug}-poster.webp
```

Budget : hero bg < 3MB, fallback poster obligatoire.

Integration snippet :
```tsx
<video autoPlay muted loop playsInline poster="/videos/{slug}-poster.webp" className="...">
  <source src="/videos/{slug}.webm" type="video/webm" />
  <source src="/videos/{slug}.mp4" type="video/mp4" />
</video>
```

Wrap dans client component qui check `useReducedMotion()` → render poster-only si reduced.

## Fonts

### Google Fonts (free)
Pattern `lib/fonts.ts` :
```typescript
import { Fraunces, Inter } from 'next/font/google'

export const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
})
```

### Local WOFF2 (PP Neue Montreal, Editorial New, Satoshi direct download, etc.)
```typescript
import localFont from 'next/font/local'

export const neueMontreal = localFont({
  src: [
    { path: '../public/fonts/PPNeueMontreal-Book.woff2', weight: '400' },
    { path: '../public/fonts/PPNeueMontreal-Medium.woff2', weight: '500' },
  ],
  variable: '--font-neue-montreal',
  display: 'swap',
  preload: true,
})
```

### Tailwind 4 integration (`app/globals.css`)
```css
@theme {
  --font-display: var(--font-fraunces);
  --font-sans: var(--font-neue-montreal);
}
```

### Apply in `app/layout.tsx`
```tsx
<html className={`${fraunces.variable} ${neueMontreal.variable}`}>
```

## Livrable

- Assets optimisés en `public/{images,videos,fonts}/`
- JSX snippets prêts à coller
- Update `Sections Catalog` CLAUDE.md si asset lié à section
