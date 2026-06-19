# Assistant SHOWCASE Workflow

`/site` est un alias de `/init --type=showcase` pour sites vitrines clients.

## Phase 1 — Brief

Si `docs/BRIEF.md` existe, travailler en update incremental. Sinon conduire un questionnaire :

- Client & positionnement
- Audience & objectif conversion
- Contenu & ton
- Mood visuel
- Motion & interactivité
- Assets
- Tech & contraintes
- SEO & diffusion
- Exécution

Références : `references/client-brief-template.md`, `references/website-showcase-patterns.md`.

Livrable : `docs/BRIEF.md`.

## Phase 2 — Moodboard

Demander 3-8 URLs positives et 3-8 URLs à éviter. Extraire heading, hero, typo, palette cues.

Utiliser `references/showcase-sites-references.md` si le user hésite.

Livrable : `docs/MOODBOARD.md`.

## Phase 3 — Complexity

Détecter :

- `simple` : <=5 sections, pas vidéo bg, pas 3D.
- `medium` : vidéo bg, scroll narratif ou parallax.
- `premium` : GSAP lourd, WebGL/R3F, kinetic type, Awwwards-grade.

Script :

```bash
bun scripts/detect-complexity.ts docs/BRIEF.md docs/MOODBOARD.md
```

## Phase 4 — Scaffold

```bash
bun scripts/vitrine-seed.ts <output-dir> <simple|medium|premium> [brief-path]
```

Génère :

- `.claude/CLAUDE.md`
- agents showcase
- skills showcase
- commands `/brief`, `/moodboard`, `/motion`, `/section`, `/ship-vitrine`
- hooks security/quality/showcase
- `.claude/showcase.json`
- mémoire seed

Après seed, proposer le scaffold Next.js si le dossier n'a pas encore d'app.

## Phase 5 — Assets Pipeline

Photos : user met les sources dans `public/images/raw/`, puis optimisation WebP/AVIF/blur.

Vidéos : H.264/VP9 + poster, hero bg < 3MB, fallback reduced-motion.

Fonts : `next/font/google` ou `next/font/local`, Tailwind 4 `@theme`.

Références : `photo-sources-non-ai.md`, `typography-2026.md`, `motion-libraries-guide.md`.

## Phase 6 — Living Review

Hooks attendus :

- motion-audit
- perf-audit
- a11y-audit
- brief-drift-check

Revue inline si `/live` est activé.

Exit : BRIEF/MOODBOARD validés, tier détecté, scaffold prêt, living review actif.
