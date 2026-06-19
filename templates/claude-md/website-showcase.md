# {{PROJECT_NAME}}

## Overview
{{DESCRIPTION}}

**Type**: Website showcase / vitrine client — {{TIER}} tier.

## Showcase Contract

Sources de vérité du projet :
- `docs/BRIEF.md` — brief client (9 sections, validé)
- `docs/MOODBOARD.md` — références visuelles + mood signature

**Règle absolue** : toute décision design/motion/content doit être traçable au BRIEF ou au MOODBOARD. Si un choix s'en écarte, l'écart doit être documenté et justifié.

## Commands
- `{{PACKAGE_MANAGER}} install` — Install dependencies
- `{{PACKAGE_MANAGER}} run dev` — Start dev server ({{DEV_PORT}})
- `{{PACKAGE_MANAGER}} run build` — Production build (Turbopack)
- `{{PACKAGE_MANAGER}} run lint` — Lint check
- `{{PACKAGE_MANAGER}} run typecheck` — TypeScript strict check
- `{{PACKAGE_MANAGER}} run optimize:images` — Generate WebP/AVIF + blur from `public/images/raw/`
- `{{PACKAGE_MANAGER}} run lighthouse` — Local Lighthouse CI run

## Architecture

- **Framework**: Next.js 16 App Router + Turbopack
- **Runtime**: {{RUNTIME}}
- **Styling**: Tailwind CSS 4 + shadcn/ui (base-nova variant with @base-ui/react)
- **Motion stack**: {{MOTION_STACK}}
- **Video**: {{VIDEO_SOLUTION}}
- **3D**: {{THREED_SOLUTION}}
- **CMS**: {{CMS}}
- **Deployment**: Vercel (region cdg1)
- **Analytics**: {{ANALYTICS}}

### Directory Structure
```
app/
  (marketing)/
    page.tsx              # home
    [slug]/page.tsx       # sub-pages
  layout.tsx
  globals.css             # Tailwind 4 @theme tokens
components/
  sections/               # RSC sections (Hero, Features, CTA, Footer...)
  motion/                 # 'use client' motion wrappers
  ui/                     # shadcn primitives
lib/
  fonts.ts                # next/font declarations
  motion.ts               # motion config (Lenis init, reduced-motion helpers)
  design-tokens.ts        # shared tokens
public/
  fonts/                  # local WOFF2 files
  images/
    raw/                  # source images (gitignored optionally)
    opt/                  # generated WebP/AVIF
  videos/
docs/
  BRIEF.md
  MOODBOARD.md
```

## Motion Stack ({{TIER}})

{{MOTION_STACK_DETAIL}}

**Règles universelles (tous tiers)** :
- Animer uniquement `transform` + `opacity` (compositor-friendly)
- Respecter `prefers-reduced-motion: reduce` — fallback sans animation
- Cleanup rigoureux : `useGSAP()` pour GSAP en React, `AnimatePresence` pour Motion unmounts
- Motion wrappers en Client Components séparés de la section RSC parente

## Sections Catalog

Liste des sections construites (update at every `/section` ou édition manuelle) :

| Section | File | Tier needed | Status | Motion |
|---|---|---|---|---|
| Hero | `components/sections/Hero.tsx` | — | draft | TBD |
| — | — | — | — | — |

Status : `draft` / `review` / `ship`.

## Asset Pipeline

### Photos
- Source : {{PHOTO_SOURCES}}
- Raw files in `public/images/raw/` (may be gitignored if heavy)
- Optimize via `bun scripts/optimize-images.ts` → generates WebP + AVIF + blur placeholder
- Use `next/image` with `priority` on hero, `placeholder="blur"` always, `sizes` obligatoire

### Videos
- {{VIDEO_PIPELINE}}
- Always `autoPlay muted loop playsInline` + poster
- Respect reduced-motion : fallback to poster only

### Fonts
- {{FONT_STACK}}
- Loaded via `next/font` in `lib/fonts.ts`, exposed as CSS vars via Tailwind 4 `@theme`

## Conventions

- Server Components by default, `'use client'` only for interactivity/motion
- Motion library: `motion/react` (framer-motion v11+ rebrand) + `tw-animate-css` pour Tailwind utilities
- Motion = client wrapper around RSC children (pattern `<HeroMotion>{children}</HeroMotion>`)
- Strict TypeScript, no `any`
- UI library: shadcn/ui (base-nova variant, @base-ui/react — NOT @radix-ui)
- Tout texte en français : accents obligatoires (é, è, ê, à, ô, â, û, ù, ç, ï, î, ÿ)
- Jamais de `<br />` ni de `<span>` pour fragmenter une phrase à des fins stylistiques — une phrase = un flux continu
- No trailing summary in responses — lire le diff
- Pas d'abstractions prématurées, pas d'over-engineering
- No console.log en commit — vérifié par hook `quality`
- Accuracy over approval: correct weak premises directly, say `unknown` when evidence is missing, and use confidence labels (`high` / `medium` / `low` / `unknown`) for uncertain judgments
- No flattery or diplomatic padding; lead with the real blocker, counterargument, or risk when one exists

### Anti-AI Feel (clients artisanaux / luxe / éditoriaux)

Applicable si {{ANTI_AI_CLIENT}} = true (client exige un rendu hand-crafted, non IA).

**Mots et formules interdits dans la copy** (AI-slop patterns reconnaissables) :
- Superlatifs vides : "exceptionnel", "inégalé", "incomparable", "unique en son genre"
- Formules d'invitation : "Découvrez", "Explorez", "Plongez dans"
- Emphase creuse : "véritablement", "profondément", "authentiquement"
- CTA génériques : "En savoir plus", "Rejoignez-nous", "Faites le premier pas"
- Phrases templates : "Au cœur de…", "Là où…", "Une expérience qui…"

**Règle assets** : zéro image/vidéo générée par IA — uniquement photos du client, photographes crédités, stock authentique (Unsplash licencié, Pexels).

**Crédits photo obligatoires** : chaque photo utilisée doit avoir un accord écrit (mail ou contrat). Documenter source + accord dans `docs/ASSETS.md`.

**Voix éditoriale** : narration à la 3e personne ou 1re personne du client — jamais voix marketing distante. S'inspirer du MOODBOARD pour le registre (luxe sobre, craft artisanal, éditorial méditerranéen, etc.).

## Quality Gates

Avant toute section taggée `ship` dans le catalog :

- [ ] **Brief drift** : la section respecte BRIEF.md (contenu, ton, CTA) et MOODBOARD.md (couleurs, typo, motion signature)
- [ ] **Motion audit** : `prefers-reduced-motion` respecté, cleanup OK, perf compositor-only
- [ ] **Perf** : LCP {{LCP_BUDGET}}s, CLS < 0.05, INP < 200ms au p75 mobile/desktop
- [ ] **A11y** : contrast AA (AAA sur hero), keyboard nav complète, focus-visible, alt images
- [ ] **Responsive** : 375 / 768 / 1280 testés
- [ ] **SEO** : metadata API (title, description, OG), schema.org si pertinent

LCP budget par tier : simple < 1.8s / medium < 2.2s / premium < 2.8s.

## Skills (project-level, `.claude/skills/`)

- `brief-questionnaire` — conduit ou relance le questionnaire 9 sections → BRIEF.md
- `moodboard-capture` — WebFetch refs → MOODBOARD.md
- `motion-audit` — batterie de checks motion (invoked via `/motion` ou PostToolUse hook)
- `asset-pipeline` — orchestration photos/vidéos/fonts

## Agents (project-level, `.claude/agents/`)

- `site-director` — chef d'orchestre, détient BRIEF/MOODBOARD, arbitre, délègue (user-invoked via `/brief`)
- `design-critic` — review esthétique, AI-slop detection
- `motion-engineer` — GSAP/Motion/Lenis impl + review
- `asset-curator` — photos/vidéos sourcing + optimisation
- `perf-auditor` — Web Vitals + bundle budget

Tous en `model: claude-opus-4-8`.

## Commands (project-level, `.claude/commands/`)

- `/brief` — relance/update BRIEF.md
- `/moodboard` — ajoute/remplace URLs refs MOODBOARD.md
- `/motion [section]` — design + impl motion pour une section
- `/section <name>` — scaffold nouvelle section depuis catalogue
- `/ship-vitrine` — lint + build + Lighthouse + motion-audit + a11y + Vercel preview

## Dependencies

- Runtime: {{RUNTIME}}
- Package manager: {{PACKAGE_MANAGER}}
- Motion: {{MOTION_DEPS}}
- Zero npm deps superflus — respecter hard rule user
