# Definition of Done — `web-fullstack`

> **Pour qui :** un fondateur qui ne maîtrise pas la tech. Chaque case = une chose qu'une
> **équipe produit de classe mondiale** livrerait pour une vraie app web (Next.js + DB + comptes).
> `/assistant` coche ces cases À TA PLACE, une étape à la fois, et ne dit **« produit fini »**
> que quand **toutes les cases applicables sont vertes avec preuve directe** (navigateur cliqué /
> curl réel), **jamais** sur un simple « build vert ».
>
> **Comment lire :** chaque ligne = ce que ça veut dire en clair · le **levier `/assistant`**
> (skill, script, hook ou agent réel qui t'aide) · `(si applicable)` = optionnel selon ton produit.
> Les leviers marqués `(à construire)` = `/assistant` te le signale comme **gap réel à coder**,
> il ne fait pas semblant que c'est automatique.
>
> **Type détecté par** `scripts/detect-project.ts` → `web-fullstack` (Next.js, Nuxt, SvelteKit,
> Astro, React, Vue, Django). C'est le type le plus exigeant : **toute la chaîne P0→P9 s'applique**.

---

## Phase 0 — Fondations (avant la première ligne de code)

- [ ] **Brief produit écrit** — une page : ce que fait l'app, pour qui, où s'arrête la V1.
  Levier : gabarit `references/client-brief-template.md` → `docs/BRIEF.md`.
- [ ] **Repo + `CLAUDE.md` + mémoire** — le projet est lisible par toi et par l'IA, rien n'est dans ta tête.
  Levier : `/init` (skill `init`) → `scripts/generate-config.ts` génère `.claude/`, `CLAUDE.md`, README, mémoire.
- [ ] **Stack & architecture posées** — les briques techniques sont choisies et cohérentes (pas de cul-de-sac).
  Levier : `scripts/detect-project.ts` + `scripts/organise.ts` (`prescribe()`). Défaut : Bun · Next.js App Router + Turbopack · Tailwind 4 · shadcn base-nova · Drizzle · Better-auth · Vercel cdg1.
- [ ] **Modèle de données + migrations** — le plan des « tiroirs » (users, contenus, commandes…), versionné, avec relations et index ; pas de table fourre-tout.
  Levier : Drizzle schema + migrations. `(à construire)` : check schéma dans `audit-project.ts`.
- [ ] **Environnements & config (12-factor)** — dev / preview / prod séparés, aucun réglage en dur, `.env.example` présent.
  Levier : `audit-project.ts` §8 (env sensibles non commités) + détection `env-configured` dans `detect-project.ts`. Stack : Vercel env vars + `.env.local`.

## Phase 1 — Identité & accès (qui peut faire quoi)

- [ ] **Authentification** — login complet : inscription, connexion, déconnexion, **reset mot de passe**, **vérification email**, session sécurisée. Testé **dans le navigateur**, pas juste « la page s'affiche ».
  Levier : Better-auth (détecté par `detect-project.ts`) + preuve E2E via `/ship100` (`E2E_REPORT.md`). Règle 2026 : ne jamais coder l'auth maison sans expert sécu.
- [ ] **RBAC / permissions** *(si applicable, dès qu'il y a >1 rôle)* — admin vs client : chaque page et chaque action vérifie le rôle **côté serveur**, et un utilisateur ne peut pas lire les données d'un autre (test d'accès négatif).
  Levier : Better-auth roles + checks serveur + Drizzle RLS + agent `security-reviewer` (généré en baseline). `(à construire)` : RLS/accès négatif auto-scorés dans l'audit (gap #1 `assistant-excellence-standards.md`).
- [ ] **Onboarding utilisateur** *(si applicable)* — les premières minutes mènent à la valeur sans friction ; l'état « vide » (zéro donnée) est géré proprement.
  Levier : flows Next.js + email de bienvenue (Resend). `/conseil` évalue le « zero-to-value ».

## Phase 2 — Cœur métier (ce que l'app fait vraiment)

- [ ] **CRUD & logique métier** — créer / lire / modifier / supprimer les objets du produit, règles métier et cas limites couverts.
  Levier : Next.js Route Handlers / Server Actions + Drizzle ; tests via `/ship100`.
- [ ] **CRM / back-office / admin** *(si applicable : tu as des clients ou du contenu à gérer)* — un tableau de bord interne protégé pour gérer clients, contenus, commandes (CRUD + recherche/filtre).
  Levier : zone `/admin` Next.js + shadcn tables, protégée par RBAC.
- [ ] **Recherche** *(si applicable : catalogue ou gros volume)* — trouver vite, résultats pertinents et paginés.
  Levier : Postgres FTS / index Drizzle (Typesense si gros volume).
- [ ] **Upload & fichiers** *(si applicable)* — déposer images/PDF en sécurité : type et taille validés, stockage hors-serveur, URLs signées.
  Levier : Vercel Blob / S3 + URLs signées + validation Zod.
- [ ] **i18n / multi-langue** *(si applicable : cible multi-pays)* — textes externalisés, formats date/monnaie locaux, langue de secours.
  Levier : `next-intl`.

## Phase 3 — Monétisation *(si tu vends)*

- [ ] **Paiements / abonnements** *(si applicable)* — encaisser pour de vrai : **succès, échec, relance impayé (dunning), remboursement, remboursement partiel, changement de plan** tous testés (pas juste « ça paie »).
  Levier : Stripe (détecté `stripe`) + table subscriptions Drizzle + preuve E2E `/ship100`.
- [ ] **Webhooks entrants** *(si applicable)* — écouter Stripe & co : signature vérifiée, **idempotence**, retries, dead-letter.
  Levier : Route Handler + vérif signature Stripe.

## Phase 4 — Communication

- [ ] **Email transactionnel** *(si applicable : comptes ou paiements)* — emails déclenchés par une action (reset, reçu, alerte) : templates, délivrabilité (SPF/DKIM), base légale RGPD, zéro secret en clair.
  Levier : Resend (détecté `resend`) + React Email.
- [ ] **Notifications** *(si applicable)* — prévenir l'utilisateur d'un événement, avec préférences et opt-out.
  Levier : in-app Next.js / push web / webhooks sortants signés.

## Phase 5 — Fiabilité, robustesse & performance

- [ ] **Validation des entrées** — ne jamais faire confiance à ce qui arrive de l'extérieur : un schéma de validation à chaque formulaire / API / webhook.
  Levier : Zod + agent `backend-auditor` (généré en baseline) qui vérifie la validation aux frontières. Capacité `validation` scorée par `lifecycle-audit.ts`.
- [ ] **Gestion d'erreurs structurée** — quand ça casse, l'utilisateur voit un écran propre et toi tu sais quoi/où ; jamais de trace technique exposée.
  Levier : error boundaries Next.js (`app/error.tsx`, `app/global-error.tsx`) + erreurs domaine typées.
- [ ] **Logging structuré** *(si applicable)* — un journal lisible par machine, sans aucun secret écrit dedans.
  Levier : pino / logs structurés Vercel.
- [ ] **Observabilité (monitoring / alertes)** — voir en temps réel si l'app va bien et être prévenu **avant** le client : erreurs, latence, uptime surveillés, alertes branchées dès le jour 1.
  Levier : Sentry + Vercel Analytics + OpenTelemetry. `(à construire)` : dimension observabilité absente de l'audit (gap #2).
- [ ] **Rate-limiting / anti-abus** — empêcher qu'on abuse ou attaque (surtout login et API publiques) : limites par IP/clé, 429 propre.
  Levier : Upstash rate-limit / middleware Next.js. `(à construire)`.
- [ ] **Caching** *(si applicable : charge ou latence)* — servir vite sans recalculer, avec invalidation maîtrisée (pas de donnée périmée).
  Levier : Next.js cache + Redis/Upstash.
- [ ] **Queues / jobs asynchrones** *(si applicable : envois de masse, traitements longs)* — travail lourd en arrière-plan, avec retries et idempotence.
  Levier : QStash / cron Vercel.
- [ ] **Budget de performance** — l'app reste rapide : web-vitals / Lighthouse OK.
  Levier : web-vitals / Lighthouse + agent `perf-auditor` (généré en baseline par `generate-config.ts`) ; capacité `perf` **scorée par `lifecycle-audit.ts`**. **Couvert.**
- [ ] **Accessibilité (a11y)** — utilisable par tous (contraste, clavier, lecteurs d'écran), WCAG AA.
  Levier : axe + agent `a11y-auditor` (généré en baseline par `generate-config.ts`) ; capacité `a11y` **scorée par `lifecycle-audit.ts`**. **Couvert.**

## Phase 6 — Sécurité & conformité (ton angle mort #1)

- [ ] **Sécurité applicative OWASP** — se protéger des attaques connues (injection SQL, XSS, CSRF, vol d'accès) ; pas juste « pas de mot de passe en dur ».
  Levier : Zod + Better-auth + headers sécurité ; hook `.claude/hooks/security.ts` (secrets/commandes dangereuses). `(à construire)` : skill `/security-review` câblé au gate + dimension OWASP dans l'audit (gap #1).
- [ ] **Secrets management** — aucune clé/mot de passe ne traîne : tout en variables d'env, `.gitignore` couvre `.env*`, rotation possible.
  Levier : Vercel env + hook `security.ts` (détecte AKIA / `sk-` / password) + `audit-project.ts` §8.
- [ ] **RGPD / vie privée** *(si applicable : données perso d'utilisateurs EU)* — bannière de consentement (accepter/refuser à égalité), export et suppression de compte, registre de traitement, base légale par usage.
  Levier : bannière consentement + endpoints export/delete. `(à construire)` : check RGPD absent de l'audit (gap #1).
- [ ] **Dépendances / supply chain** — ne pas embarquer de brique vérolée : lockfile, audit régulier, zéro CVE critique.
  Levier : `bun audit` / Dependabot. `(à construire)` : dep-scan dans le pipeline qualité.
- [ ] **Backups & restauration testée** *(si applicable : DB de prod)* — pouvoir tout récupérer après catastrophe ; un backup **non restauré ne compte pas**.
  Levier : backups managés Postgres (Neon/Supabase) + runbook restore. `(à construire)`.

## Phase 7 — Qualité & tests

- [ ] **Tests unitaires** — chaque brique métier critique vérifiée isolément, verte en CI.
  Levier : Vitest.
- [ ] **Tests d'intégration** — les briques marchent ensemble (API + DB) sur une base de test.
  Levier : Vitest + DB éphémère.
- [ ] **Tests E2E headful** — un vrai utilisateur dans un vrai navigateur, chaque parcours promis prouvé (pas « build vert »).
  Levier : Playwright + skill `browse`. **Couvert** : `scripts/ship-check-gate.ts` exige `E2E_REPORT.md` + `SHIP_PROOF.json` (règle `e2e-proof`).

## Phase 8 — Acquisition & croissance

- [ ] **SEO** *(si applicable : app publique)* — être trouvé sur Google : metas, sitemap, OG, données structurées, SSR.
  Levier : Next.js metadata API + `app/sitemap.ts` / `app/robots.ts`.
- [ ] **Analytics produit** *(si applicable)* — comprendre ce que font les utilisateurs, en respectant le RGPD (consentement / cookieless).
  Levier : Plausible / PostHog + Vercel Analytics.
- [ ] **Pages légales** *(si applicable : produit public)* — mentions légales + politique de confidentialité (+ CGU/CGV si vente), à jour.
  Levier : pages statiques Next.js.

## Phase 9 — Livraison & exploitation

- [ ] **CI/CD** — la chaîne qui teste et déploie automatiquement et **bloque le merge si rouge** (lint + typecheck + test + build).
  Levier : GitHub Actions + Vercel. **Détecté** par `audit-project.ts` §10 ; `(à construire)` : **génération** du pipeline en BOOTSTRAP (gap #4).
- [ ] **Déploiement Vercel** — l'app est en ligne, région cdg1 (France), preview par PR.
  Levier : Vercel (détecté `vercel`) ; config via `scripts/generate-config.ts`.
- [ ] **Rollback & incident response** *(si applicable : en prod)* — annuler un déploiement raté en 1 clic (testé) et savoir qui gère l'incident.
  Levier : Vercel instant rollback + runbook. `(à construire)`.
- [ ] **Docs & DX** — `CLAUDE.md` + README + runbooks + mémoire à jour, l'équipe et l'IA savent faire tourner le projet.
  Levier : `scripts/generate-config.ts` + hook `dx.ts`. **Couvert**.
- [ ] **GATE `/ship100` — DoD dure** — la barrière finale : 7 rapports QA + preuve E2E, blocage sur tout critical/high, décision explicite `SHIP / DON'T SHIP`.
  Levier : `scripts/ship-check-gate.ts` + skill `/ship100`. **Couvert (point fort).**

---

## Verdict « VRAIMENT FINI » (doctrine)

`/assistant` ne déclare ce `web-fullstack` **fini** que si **toutes les cases applicables ci-dessus
sont vertes**, chacune avec **preuve directe** : parcours cliqué en navigateur (skill `browse` /
`/ship100`) ou `curl` réel + état persisté vérifié — **jamais** sur un typecheck OK ou un déploiement
vert seul. Tant qu'une case applicable reste vide, elle apparaît comme **gap bloquant** dans
`QUALITY_SCORE.md` et `/assistant` te donne **UNE seule prochaine étape**, expliquée en clair. C'est
l'extension au **produit** de la logique `/conseil` gate-FINI + `/ship100`.
