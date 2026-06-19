# Definition of Done — `website-showcase`

> **Pour qui :** un fondateur non-tech. Chaque case = ce qu'un **studio web de classe mondiale
> (niveau Awwwards)** livrerait pour un vrai site vitrine / landing / site client (Next.js +
> motion, sans backend lourd). `/assistant` coche À TA PLACE, une étape à la fois, et ne dit
> **« site fini »** que quand **toutes les cases applicables sont vertes avec preuve directe**
> (site ouvert dans le navigateur, scrollé, formulaire testé, Lighthouse vert) — **jamais** sur
> un simple « build vert ».
>
> **Spécificité vitrine :** **pas d'auth, pas de RBAC, pas de paiements, pas de CRM, pas de DB
> serveur** (sauf un formulaire de contact). Ce qui compte : **design & motion impeccables,
> performance (web-vitals), accessibilité (WCAG), SEO, responsive, contenu réel non-IA**. C'est
> le type le mieux outillé par `/assistant` (skills `/site`, `/senior-designer`). La preuve
> directe = ouvrir le site et le manipuler.
>
> **Comment lire :** explication en clair · **levier `/assistant`** réel · `(si applicable)` ·
> `(à construire)` = gap réel signalé.
>
> **Type détecté par** `scripts/detect-project.ts` → `website-showcase` (marqueur
> `.claude/showcase.json`, ou `docs/BRIEF.md`/`docs/MOODBOARD.md`, ou motion-libs sans backend).

---

## Phase 0 — Fondations & direction artistique

- [ ] **Brief client + moodboard** — une page : objectif du site, cible, ton, et un moodboard validé (la direction visuelle).
  Levier : gabarit `references/client-brief-template.md` → `docs/BRIEF.md` + `docs/MOODBOARD.md` ; analyse via `scripts/moodboard-analyzer.ts`.
- [ ] **Repo + `CLAUDE.md` + mémoire** — projet lisible par toi et l'IA.
  Levier : `/init` → `scripts/generate-config.ts`.
- [ ] **Stack & seed vitrine posés** — Next.js + Tailwind 4 + shadcn base-nova + lib motion choisie, structure de pages amorcée.
  Levier : skill `/site` (`assistant-showcase-workflow.md`) + `scripts/vitrine-seed.ts` / `scripts/vitrine-init.ts`. Défaut : Vercel cdg1.
- [ ] **Tokens de design** — couleurs, typo, espacements cohérents et centralisés (pas de valeurs au hasard).
  Levier : `scripts/design-tokens-gen.ts`.

## Phase 2 — Contenu & cœur du site

- [ ] **Pages & sections promises** — toutes les sections du brief sont là (hero, features, à propos, contact…), avec du **contenu réel**, pas du lorem ni du texte qui « sent l'IA ».
  Levier : skill `/site` + revue anti-IA ; photos non-IA via `references/photo-sources-non-ai.md`.
- [ ] **Motion & interactions** *(si applicable)* — animations soignées au scroll/hover, fluides, jamais gadget ni saccadées.
  Levier : `references/motion-libraries-guide.md` (GSAP / Motion / Lenis détectés par `detect-project.ts`).
- [ ] **Formulaire de contact** *(si applicable)* — le formulaire envoie vraiment (email reçu), avec validation et message de succès/erreur.
  Levier : Resend (détecté) + validation Zod ; testé end-to-end via skill `browse`.
- [ ] **i18n / multi-langue** *(si applicable : site multi-pays)* — textes externalisés, langue de secours.
  Levier : `next-intl`.

## Phase 5 — Performance & rendu (cœur d'une vitrine)

- [ ] **Budget de performance (web-vitals / Lighthouse)** — le site charge vite et reste fluide ; score Lighthouse au vert. **Critère central** d'une vitrine.
  Levier : `scripts/senior-designer.ts` (Lighthouse/web-vitals) + hook `.claude/hooks/showcase.ts` + capacité `perf` **scorée par `lifecycle-audit.ts`** (preuve = deps web-vitals/Lighthouse, rapport, ou hook showcase). **Couvert + scoré.**
- [ ] **Responsive (mobile / tablette / desktop)** — impeccable sur toutes les tailles, pas de débordement ni de texte coupé.
  Levier : skill `browse` (check responsive) + `scripts/design-review.ts`.
- [ ] **Images & médias optimisés** — formats modernes, lazy-loading, vidéos optimisées ; rien qui ralentit le chargement.
  Levier : Next.js Image + `video-optimized` (détecté si `next-video`/Mux).
- [ ] **Gestion d'erreurs / pages 404** — page 404 soignée, pas d'écran blanc.
  Levier : `app/not-found.tsx` + `app/error.tsx`.

## Phase 6 — Sécurité & conformité (léger mais réel)

- [ ] **Secrets management** — clés (Resend, analytics) en env, jamais commitées, `.gitignore` couvre `.env*`.
  Levier : hook `.claude/hooks/security.ts` + `audit-project.ts` §8.
- [ ] **RGPD / cookies** *(si applicable : analytics ou formulaire avec données perso EU)* — bannière de consentement (accepter/refuser à égalité) **ou** analytics cookieless, base légale du formulaire de contact.
  Levier : bannière consentement ou Plausible cookieless. `(à construire)` : check RGPD absent de l'audit (gap #1).
- [ ] **Dépendances / supply chain** — lockfile, audit, zéro CVE critique.
  Levier : `bun audit` / Dependabot. `(à construire)`.

## Phase 7 — Qualité & accessibilité (cœur d'une vitrine)

- [ ] **Accessibilité (WCAG AA)** — contraste suffisant, navigation clavier, ARIA, lisible par lecteur d'écran. **Critère central** d'une vitrine.
  Levier : `scripts/senior-designer.ts` (WCAG) + hook `showcase.ts` (section a11y) + capacité `a11y` **scorée par `lifecycle-audit.ts`** (preuve = deps axe/jsx-a11y, rapport, ou hook showcase). **Couvert + scoré.**
- [ ] **Tests E2E headful** — ouvrir le vrai site dans un vrai navigateur, scroller, cliquer chaque CTA, soumettre le formulaire — prouvé, pas « build vert ».
  Levier : Playwright + skill `browse`. **Couvert** : `scripts/ship-check-gate.ts` (`E2E_REPORT.md`, règle `e2e-proof`).
- [ ] **Revue design senior** — un œil « directeur artistique » valide cohérence, hiérarchie, finition (niveau Awwwards).
  Levier : skill `/senior-designer` (`assistant-senior-designer.md`) + `scripts/design-review.ts` + `scripts/critic-loop.ts`.

## Phase 8 — Acquisition & croissance

- [ ] **SEO** — metas par page, sitemap, Open Graph (aperçu social), données structurées, SSR. **Indispensable pour une vitrine.**
  Levier : Next.js metadata API + `app/sitemap.ts` / `app/robots.ts`.
- [ ] **Analytics** *(si applicable)* — mesurer les visites, en respectant le RGPD (cookieless de préférence).
  Levier : Plausible / Vercel Analytics.
- [ ] **Pages légales** — mentions légales + politique de confidentialité (obligatoires pour un site public en France).
  Levier : pages statiques Next.js.

## Phase 9 — Livraison & exploitation

- [ ] **CI/CD** — lint + typecheck + build sur chaque changement, bloque si rouge ; preview par PR.
  Levier : GitHub Actions + Vercel. **Détecté** par `audit-project.ts` §10 ; `(à construire)` : **génération** du pipeline en BOOTSTRAP (gap #4).
- [ ] **Déploiement Vercel** — le site est en ligne, région cdg1, domaine branché, HTTPS.
  Levier : Vercel (détecté `vercel`) ; config via `scripts/generate-config.ts`.
- [ ] **Docs & DX** — `CLAUDE.md` + README + mémoire à jour (l'équipe sait éditer le contenu).
  Levier : `scripts/generate-config.ts` + hook `dx.ts`. **Couvert**.
- [ ] **GATE `/ship100` — DoD dure** — rapports QA + preuve E2E navigateur, blocage sur critical/high, décision `SHIP / DON'T SHIP`.
  Levier : `scripts/ship-check-gate.ts` + skill `/ship100`. **Couvert (point fort).**

---

## Verdict « VRAIMENT FINI » (doctrine)

`/assistant` ne déclare ce `website-showcase` **fini** que si **toutes les cases applicables sont
vertes**, chacune avec **preuve directe** : site ouvert et manipulé dans un vrai navigateur (skill
`browse`), formulaire de contact réellement envoyé, **Lighthouse vert (perf) + WCAG vert (a11y)** —
**jamais** sur un typecheck OK seul. Pas d'auth/paiements/CRM : ici, **design, perf, a11y, SEO,
contenu réel** sont les vrais critères. Toute case applicable vide = **gap bloquant** dans
`QUALITY_SCORE.md`, et `/assistant` donne **UNE seule prochaine étape** expliquée en clair. Extension
au **produit** de `/conseil` gate-FINI + `/ship100`.
