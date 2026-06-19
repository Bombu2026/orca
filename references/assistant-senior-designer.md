# Senior Designer — MEGA Skill

`/senior-designer` (alias `/sd`) — orchestrateur qui spawn **6 spécialistes en parallèle**
via le tool `Agent`, audite ou élève un site Next.js au niveau pro senior designer
(Awwwards-grade restraint, editorial typography, deliberate motion).

S'invoque dans trois modes :

| Mode | Trigger | Effet |
|---|---|---|
| `audit` | défaut, ou `/sd audit` | Audite un site existant, n'écrit rien, livre rapport `docs/SENIOR-DESIGN-REVIEW.md` |
| `apply` | `/sd apply` | Audite **et** applique les fixes sûrs (avec confirmation pour les risqués) |
| `scaffold` | `/sd scaffold` (= `/site --senior`) | Extension de `/site` qui génère un site avec les 6 patterns dès le seed |

Tous les modes partagent le même socle de 6 spécialistes.

---

## Doctrine

Senior designer ≠ "qui ajoute des effets". Senior designer = qui **enlève**, **calibre**,
**hiérarchise** et **rythme**. Cinq principes non-négociables :

1. **Cohérence > brillance.** 7 couleurs max, 3 families max, 1 motion primitive
   dominante. Tout le reste est bruit.
2. **Rythme typographique.** Aucune section ne réutilise la même taille de display
   sans intention. Échelle modulaire (1.250 / 1.333 / 1.414), pas de valeur magique.
3. **Hiérarchie par contraste, pas par couleur.** Ember sur paper > bold black sur
   couleur. Une seule couleur d'accent par site (max 2 avec un complément froid).
4. **Motion = ponctuation, pas symphonie.** Un effet signature (kinetic / cursor /
   transition), deux micro-interactions, le reste statique. Trois effets dans le
   même viewport = AI-slop garanti.
5. **Art direction = identité.** Photos retraitées (saturate / sepia / grain) ou
   pas de photos. Jamais des stocks bruts.

Ces principes sont opposables : un agent qui propose une 8e couleur, une 4e font,
ou un 3e effet hero doit **justifier** ou être rejeté.

---

## Les 6 Spécialistes

Chaque spécialiste a un contrat I/O strict, un livrable testable, et tourne en
parallèle des autres (ownership disjoint). Le parent thread orchestre, collecte,
arbitre les conflits, décide.

### 1. `moodboard-analyzer`

**Input** — 3 à 8 URLs de références + 3 à 8 URLs à éviter (depuis `docs/BRIEF.md` ou questionnaire).

**Output** — `docs/MOODBOARD.md` enrichi :
- screenshots WebP de chaque URL (`docs/moodboard/<slug>.webp`)
- palette détectée par site (5 dominant colors via canvas color extraction)
- fonts détectées (`Fraunces`, `Neue Montreal`, ...) via `document.fonts` API
- tags croisés (3-5 par site depuis `references/showcase-sites-references.md`)
- **convergence test** : au moins 1 tag partagé par tous les sites. Si non → fail, demander re-pick au user.

**Tool** — `scripts/moodboard-analyzer.ts` (Playwright headless + sharp + color extraction).

**Quand spawner** — phase 2 (moodboard) du `/site`, ou au début d'un `/sd audit`.

---

### 2. `design-tokens-gen`

**Input** — `docs/BRIEF.md` + `docs/MOODBOARD.md`.

**Output** — `src/app/globals.css` avec `@theme` complet :
- **Colors** : 1 ink, 1 paper (+ 2 variants), 1 accent dominant (+ 1 soft), 2 neutrals utility. Max 8 tokens.
- **Fonts** : 1 display, 1 sans, 1 mono (3 max). Variable axes documentées (`opsz`, `wght`, `SOFT`, `WONK`).
- **Spacing scale** : modulaire 1.250 (8, 10, 13, 16, 20, 25, 31, 39, ...) en CSS variables `--space-*`.
- **Radius scale** : différencié (`--radius-button: 6px`, `--radius-card: 12px`, `--radius-image: 0`, `--radius-pill: 999px`).
- **Shadow elevations** : 3 niveaux (`--shadow-flat`, `--shadow-card`, `--shadow-hover`), valeurs réelles (pas `rgb(0 0 0 / 0.1)` partout).
- **Easings nommés** : `--ease-expo`, `--ease-quart`, `--ease-back`, `--ease-spring`.
- **Motion durations** : `--dur-fast: 180ms`, `--dur-base: 320ms`, `--dur-slow: 640ms`.

Plus des utility classes signature (`serif-xl`, `serif-italic`, `mono`, `caps`,
`italic-wonky`) qui exploitent les axes variable du display font.

**Tool** — `scripts/design-tokens-gen.ts` + `templates/showcase/senior-designer/tokens/globals-template.css`.

**Quand spawner** — phase 4 (scaffold) du `/site`, ou en `/sd apply` si `globals.css` < 50 lignes (signe de scaffold générique).

---

### 3. `art-direction`

**Input** — assets dans `public/photos/raw/` ou `public/images/raw/` + ton du brief (warm / cold / editorial / brutalist).

**Output** :
- guidelines `docs/ART-DIRECTION.md` : ratios cohérents (3/4, 4/5, 1/1), treatment recommandé (sépia / duotone / b&w / cinema), grain calibration, figcaption pattern.
- CSS utility classes injectées dans `globals.css` (`.photo-warm`, `.photo-cinema`, `.grain-paper`, `.grain-dense`).
- conversion + optimisation des photos brutes vers WebP/AVIF (sharp).
- détection des photos hors-charte (mauvais ratio, qualité < 1200px, saturation excessive).

**Tool** — `scripts/art-direction.ts` (sharp + grain SVG injector).

**Quand spawner** — toujours si `public/photos/` ou `public/images/raw/` existe avec ≥ 3 fichiers.

---

### 4. `kinetic-type`

**Input** — components hero / section titles dans `src/components/sections/`.

**Output** — 1 à 2 patterns signature copiés dans `src/components/motion/` :
- `SplitLines.tsx` — split par ligne avec Motion stagger (canonique). Toujours présent.
- `ScrambleText.tsx` — alphabet pseudo-décryptage (tech / dev brands).
- `VariableProximity.tsx` — cursor proximity → font-variation-settings `wght` (Fraunces, Recursive).
- `MarqueePerspective.tsx` — marquee en perspective 3D (kinetic statement).

Choisi selon le tag dominant du moodboard :
- `editorial` / `magazine` → SplitLines uniquement
- `tech` / `dev tool` → SplitLines + ScrambleText
- `brutalist` / `kinetic-type` → SplitLines + VariableProximity ou MarqueePerspective
- `minimal` → SplitLines fade-only (pas de Y translate)

Jamais plus de 2 patterns kinetic par site. Le hero a au max 1 effet kinetic.

**Tool** — copie depuis `templates/showcase/senior-designer/kinetic-type/`.

---

### 5. `micro-interactions`

**Input** — components dans `src/components/sections/` + `src/components/motion/`.

**Output** — micro-interactions cohérentes injectées :
- `LinkUnderlineSweep` — wrapper de `<Link>` avec underline qui sweep gauche → droite sur hover. Canonique pour les CTA secondaires.
- `MagneticButton` — bouton qui attire le curseur dans un rayon (8-16px max). Réservé au CTA primaire du hero. **Jamais sur mobile.**
- `CustomCursor` — curseur custom qui change selon les zones (default / link / image / drag). Optionnel, seulement si le moodboard a `custom-cursor` tag.
- `RevealStagger` — reveal staggered standard, déjà dans `templates/showcase/`. Vérifier qu'il existe.

Règle : **3 micro-interactions max par site**. CTA primaire (magnetic ou underline), liens secondaires (underline sweep), un effet signature optionnel (cursor).

**Tool** — copie depuis `templates/showcase/senior-designer/micro-interactions/`.

---

### 6. `design-review`

**Input** — site en local (`http://localhost:3000`) ou URL distante.

**Output** — `docs/SENIOR-DESIGN-REVIEW.md` :
- screenshots Playwright en 3 viewports (375 mobile, 768 tablet, 1280 desktop)
- 7 checklists senior (typo rhythm, color discipline, alignment, hierarchy, motion budget, a11y, AI-slop)
- score global /100 + score par catégorie
- liste des fixes proposés avec preuves visuelles (annotations sur screenshots)
- verdict `SHIP` / `NEEDS-FIX` / `NOT-SENIOR-GRADE`

**Tool** — `scripts/design-review.ts` (Playwright + sharp annotation + `scripts/ai-slop-grep.sh`).

**Quand spawner** — toujours en `/sd audit` et `/sd apply`. Run **deux fois** en `apply` mode (before + after).

---

## Workflow d'exécution

### Mode `/sd audit` (lecture seule)

```
Phase 1 — Discover (5s, séquentiel)
  → détecter Next.js, Tailwind, motion lib, palette actuelle
  → vérifier docs/BRIEF.md et docs/MOODBOARD.md (sinon questionnaire court)

Phase 2 — Parallel Audit (90-180s, 6 agents en parallèle via tool Agent)
  ├── moodboard-analyzer    → MOODBOARD enrichi (si pas déjà fait)
  ├── design-tokens-gen     → propose globals.css amélioré (output: diff, pas write)
  ├── art-direction         → guidelines + photos audit (output: rapport)
  ├── kinetic-type          → diagnostic des patterns hero/sections (output: liste)
  ├── micro-interactions    → diagnostic des interactions actuelles (output: liste)
  └── design-review         → Playwright + checklists + screenshots annotés

Phase 3 — Synthèse (parent thread)
  → arbitrer les conflits (ex: tokens-gen propose 9 couleurs, doctrine = 7 max → revoir)
  → consolider en docs/SENIOR-DESIGN-REVIEW.md
  → afficher score global + top 5 fixes prioritaires
```

### Mode `/sd apply` (audit + write)

```
Phase 1 — Audit (idem ci-dessus)
Phase 2 — Plan
  → présenter les fixes par priorité (P0 = ship-blocker, P1 = senior-grade, P2 = polish)
  → demander confirmation user (skip si --yes)
Phase 3 — Apply (parallèle, ownership disjoint)
  ├── design-tokens-gen     écrit src/app/globals.css
  ├── art-direction         écrit utility classes + optimise photos
  ├── kinetic-type          copie 1-2 patterns dans src/components/motion/
  ├── micro-interactions    copie 1-3 patterns + wire dans 1-2 sections
Phase 4 — Re-audit
  → re-run design-review → docs/SENIOR-DESIGN-REVIEW-after.md
  → BEFORE/AFTER scoring + ship-readiness verdict
```

### Mode `/sd scaffold` (extension de `/site`)

```
Hook dans references/assistant-showcase-workflow.md phase 4 (scaffold)
  → après vitrine-seed.ts, lancer en parallèle :
    ├── design-tokens-gen
    ├── art-direction (si photos)
    ├── kinetic-type (1 pattern obligatoire)
    └── micro-interactions (LinkUnderlineSweep par défaut)
  → puis design-review pour valider le baseline
```

---

## Contrats des agents (prompts canoniques)

Quand le parent thread spawne un spécialiste, le prompt suit ce format :

```
ROLE — Senior <speciality> for a Next.js 16 showcase site.

CONTEXT
- Project path: <abs path>
- Brief: <résumé 3 lignes>
- Moodboard tags: <3-5 tags>
- Mode: audit | apply | scaffold

INPUT FILES
- <list of files à lire>

OUTPUT
- <list of files à écrire ou rapport markdown>

CONSTRAINTS
- Respect doctrine (5 principes ci-dessus).
- Aucun import autre que ceux déjà dans package.json (sauf si justifié).
- Tous les composants : RSC par défaut, 'use client' uniquement sur motion wrappers.
- TypeScript strict, no any, no try/catch défensif.

DELIVER
- Un seul rapport markdown <file> OU une liste de patchs avec preuves.
- Verdict en première ligne : OK / GAPS / BLOCKED.
```

---

## Scripts associés

| Script | Rôle | Invocation |
|---|---|---|
| `scripts/senior-designer.ts` | Orchestrator CLI (peut être appelé hors Claude) | `bun scripts/senior-designer.ts <path> --mode=audit\|apply\|scaffold` |
| `scripts/design-review.ts` | Playwright + checklists | `bun scripts/design-review.ts <url> [--viewport=375,768,1280]` |
| `scripts/moodboard-analyzer.ts` | Scrape URLs, extract palette/fonts | `bun scripts/moodboard-analyzer.ts <moodboard.md>` |
| `scripts/design-tokens-gen.ts` | Génère `globals.css @theme` | `bun scripts/design-tokens-gen.ts <project-path> --from=docs/MOODBOARD.md` |
| `scripts/ai-slop-grep.sh` | Grep patterns AI-slop | `bash scripts/ai-slop-grep.sh <project-path>` |

---

## Templates

Tous dans `templates/showcase/senior-designer/` :

```
checklists/
├── design-review.md       Checklist 7 catégories + score grid
├── ai-slop-grep.md        Patterns greppables (rounded-lg, shadow-md, Get started, ...)
└── typo-rhythm.md         Modular scale + line-height rules

art-direction/
└── photo-treatments.md    Recettes treatment par mood (warm / cinema / brutalist)

tokens/
└── globals-template.css   Squelette @theme + utility classes (Fraunces axes inclus)

kinetic-type/
├── SplitLines.tsx
├── ScrambleText.tsx
└── VariableProximity.tsx

micro-interactions/
├── MagneticButton.tsx
├── CustomCursor.tsx
└── LinkUnderlineSweep.tsx

motion/
└── PageTransition.tsx     AnimatePresence avec View Transitions API fallback
```

---

## Anti-patterns (refus automatique)

Un spécialiste **doit refuser** d'apply un changement qui produit :

- 8+ couleurs dans `@theme` (doctrine principe 1)
- 4+ font-family dans le bundle
- 3+ effets kinetic visibles dans le même viewport
- `rounded-lg` ou `shadow-md` globalement (AI-slop pattern 1 & 2)
- Lorem ipsum résiduel ou copy "Get started", "Your tagline here"
- Animation de `width`, `height`, `top`, `left` (motion-libraries-guide perf rule)
- `outline: none` sans `focus-visible:ring-*` (a11y)
- Custom cursor activé sur mobile sans guard `matchMedia('(pointer: fine)')`

Refus = blocked verdict + raison + suggestion concrète.

---

## Completion

- **DONE** — audit complet, fixes appliqués si mode=apply, re-review PASS.
- **DONE_WITH_NOTES** — fixes appliqués mais le score post-fix < 80/100 (encore du polish à faire manuellement).
- **BLOCKED** — un anti-pattern critique non résoluble (ex: client impose 4 couleurs accent), arrêt et explication.
- **NEEDS_INPUT** — moodboard incohérent, brief manquant, ou conflit irrésoluble entre spécialistes.

---

## Référence pour le routage

Ajouté dans le SKILL.md principal :

```
| `/senior-designer`, `/sd`, "passe en senior", "niveau Awwwards", "audit design" → lire `references/assistant-senior-designer.md`.
```

Le hook dans `assistant-showcase-workflow.md` phase 4 ajoute :

```
Après vitrine-seed.ts, si --senior, spawn senior-designer en mode scaffold.
```
