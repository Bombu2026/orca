---
name: motion-audit
description: >-
  Batterie de checks sur les animations d'un projet vitrine. Vérifie respect
  prefers-reduced-motion, cleanup GSAP, perf compositor-only (transform/opacity),
  SSR safety (dynamic imports), isolation client/server boundaries. Génère
  rapport pass/fail par fichier. Triggers : "audite les animations",
  "motion-audit", "check les effets", "pourquoi ça saccade". Invoqué aussi en
  PostToolUse hook après édition components/motion/* ou hooks/use-*-scroll.ts.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
---

# Motion Audit Skill

Mission : garantir motion propre et performant sur le projet vitrine.

## Scope

Fichiers audités :
- `components/motion/**/*.tsx`
- `components/sections/**/*.tsx` (check `'use client'` boundary)
- `hooks/use-*-scroll.ts` ou similaire
- `lib/motion.ts` (config Lenis)

## Checks exécutés

### 1. Reduced-motion respect
Grep pour `useReducedMotion` / `matchMedia('(prefers-reduced-motion` / `prefers-reduced-motion`. Chaque fichier avec animation doit avoir un guard.
**Fail** : animation sans guard.

### 2. Cleanup GSAP
Grep pour `gsap.` et `ScrollTrigger`. Vérifier :
- Si React : `useGSAP()` hook utilisé (cleanup auto) — **pass**
- Sinon : `useEffect` return avec `ScrollTrigger.getAll().forEach(t => t.kill())` — **pass**
- Aucun cleanup visible — **fail**

### 3. Compositor-only
Grep pour animations sur `width`, `height`, `top`, `left`, `margin` dans Motion/GSAP configs (`animate={{ width: ... }}`, `gsap.to(el, { width: ... })`). **Fail** — ne doit animer que `transform` et `opacity`.

### 4. SSR safety
Grep `useScroll|useTransform|useSpring` imports de `motion/react`. Check si fichier parent wrappe dans `dynamic(() => import, { ssr: false })` OU si `'use client'` présent.
**Warn** si import server-side sans guard.

### 5. Client/Server isolation
Pour chaque section dans `components/sections/`, check que `'use client'` n'est PAS en haut (sections = RSC). Motion doit être déléguée à wrapper dans `components/motion/`.
**Warn** : section entière marquée client — refactor suggéré.

### 6. will-change abuse
Grep `will-change` en CSS/Tailwind. Acceptable seulement sur éléments animés en continu (hero background). **Warn** sur éléments one-shot reveal.

### 7. Bundle weight (optionnel si `@next/bundle-analyzer` présent)
Si détecté, suggère run `ANALYZE=true bun run build`.

## Livrable

Rapport :
```
Motion Audit — <projet>
─────────────────────
Files scanned: N
Checks passed: X/7
Issues: Y

CRITICAL (N)
  - components/motion/Hero.tsx:42 — animation width (non-compositor)
  - ...

HIGH (N)
  - ...

Suggestions:
  - ...
```

Si invoqué en PostToolUse hook : retourne exit code non-zéro seulement sur CRITICAL — sinon affiche warnings sans bloquer.
