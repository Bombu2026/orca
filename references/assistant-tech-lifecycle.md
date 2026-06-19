# Assistant — Tech Lifecycle Catalog (A→Z, niveau top boîte tech)

> Référence-doctrine lue à **chaque run** par `/assistant`. C'est la mémoire maîtresse du **cycle de vie produit** : ce qu'une équipe de classe mondiale fait sur n'importe quel projet, comment détecter où on en est, quelle est l'**étape suivante** concrète, et quand le produit est **VRAIMENT FINI**.
> Additif et sûr : aucune logique TS réécrite. Modèle des sœurs `assistant-large-codebase-schema.md` et [[assistant-excellence-standards]]. Tout ce qui n'existe pas encore est marqué `(à construire)` — jamais minimisé.

---

## 1. Principe directeur — `/assistant` CONDUIT le lifecycle

l'opérateur ne maîtrise pas la tech. Il ne doit **jamais** avoir à savoir qu'il faut faire l'AUTH, le RBAC, le CI/CD, les backups, le RGPD. **C'est `/assistant` qui le sait, le détecte, et le lui dit étape par étape pendant qu'il travaille.**

Trois lois non négociables :

1. **UNE seule étape suivante à la fois.** À chaque `next-gap`, `/assistant` ne déballe pas la liste des 50 choses qui manquent. Il surface **la plus prioritaire**, expliquée **pour un non-tech** (la colonne `(non-tech)` de chaque capacité), avec le « pourquoi ça compte ». Le reste reste en réserve dans `QUALITY_SCORE.md`.

2. **FINI = toute la Definition of Done applicable est verte, par preuve directe.** Un projet n'est jamais déclaré fini sur la foi d'un `build vert`, d'un typecheck OK, ou d'un HTTP 200. FINI exige une **preuve directe** : parcours cliqué dans un vrai navigateur (Playwright headful), appel `curl` avec payload réel + état persisté vérifié, **restauration de backup testée** (un backup jamais restauré ne compte pas). C'est exactement la doctrine de l'opérateur (« Définition de fonctionnel ») et de `/conseil` gate-FINI / `/ship100`, **étendue du harness Claude Code au PRODUIT**.

3. **Tout DoD applicable non-vert = gap bloquant, jamais « tu ».** `/assistant` ne masque pas un manque pour faire bonne figure. Une capacité requise dont la DoD n'est pas verte devient un **gap bloquant du `QUALITY_SCORE.md`**. Le silence sur un manque est une violation de confiance, au même titre que bluffer « c'est fonctionnel ».

**Le trou que ce catalogue comble.** Aujourd'hui `scripts/audit-project.ts` score **uniquement le harness Claude Code** (CLAUDE.md, hooks, skills, MCP, détection CI…) — jamais la **complétude produit** (auth, paiements, CRM, RGPD, observabilité métier). [[assistant-excellence-standards]] liste déjà les 4 gaps majeurs comme une matrice de couverture du *harness*. Ce catalogue est la pièce manquante : la **Definition of Done produit cycle de vie**, la mémoire A→Z qui dit l'étape suivante et quand c'est vraiment fini.

---

## 2. Boucle de pilotage (à chaque run)

```
1. DÉTECTER le type        → scripts/detect-project.ts
                              (web-fullstack | api-backend | bot-agent |
                               cli-tool | website-showcase | design-only | unknown)
2. FILTRER les capacités   → ne garder que les capacités applicables à ce type
                              (un website-showcase n'a pas besoin d'auth/billing ;
                               un web-fullstack qui vend a besoin de toute la chaîne P1→P9)
3. SCANNER l'état          → capacité par capacité, DoD verte ou non ?
                              (détecté en partie par detect-project.ts / audit-project.ts ;
                               le reste = (à construire))
4. CLASSER les gaps        → tout DoD applicable non-vert = gap bloquant QUALITY_SCORE.md
5. DIRE L'ÉTAPE SUIVANTE   → UNE seule, la plus prioritaire, en langage non-tech
6. VERDICT FINI ?          → uniquement si TOUTE la DoD applicable est verte
                              par preuve directe (jamais build vert)
                              → gate via ship-check-gate.ts / /ship100
```

**Comment lire chaque capacité** — pour chacune :
- **(non-tech)** = ce que ça veut dire pour un fondateur qui ne code pas.
- **Requis quand** = par type de projet / si applicable.
- **DoD** = à quoi ressemble « fait » (preuve directe, pas build vert).
- **Stack** = le pattern par défaut de l'opérateur.
- **Levier `/assistant`** = le moyen réel de l'opérer (skill library / agent / script / hook), ou `(à construire)` si le gap n'est pas encore codé.

**Stack par défaut l'opérateur (injectée dans toutes les DoD)** : Bun · Next.js App Router + Turbopack · Tailwind 4 · shadcn base-nova (@base-ui/react) · Drizzle ORM · Better-auth · Vercel (région cdg1) · Vitest + Playwright.

---

## 3. Les PHASES du cycle de vie (Cadrage → Maintenance)

| # | Phase | Ce que `/assistant` pilote |
|---|-------|----------------------------|
| **P0** | **Cadrage & Fondations** | Définir le produit, choisir la stack, modéliser les données, séparer les environnements |
| **P1** | **Identité & Accès** | Auth, RBAC/permissions, onboarding |
| **P2** | **Cœur fonctionnel & Données** | CRUD/logique métier, CRM/admin, recherche, upload, i18n |
| **P3** | **Monétisation** | Paiements/abonnements, webhooks entrants |
| **P4** | **Communication** | Email transactionnel, notifications |
| **P5** | **Fiabilité, Robustesse & Perf** | Validation, erreurs, logging, observabilité, rate-limit, cache, jobs, perf, API versioning |
| **P6** | **Sécurité & Conformité** | OWASP, secrets, RGPD, supply-chain, backups |
| **P7** | **Qualité & Tests** | Unitaires, intégration, E2E headful, a11y |
| **P8** | **Acquisition & Croissance** | SEO, analytics, pages légales |
| **P9** | **Livraison & Exploitation** | CI/CD, gate de livraison, rollback/incident, docs/DX |
| **P10** | **Lancement & Maintenance** | Go-live, monitoring vivant, mises à jour, dette |

Les 6 types réels filtrent l'applicabilité de chaque phase. Un `design-only` ne traverse quasiment que P0.1 et les leviers vitrine ; un `web-fullstack` qui vend traverse **toute** la chaîne P0→P10.

---

## 4. Le CATALOGUE des capacités transverses

> Chaque item : **(non-tech)** · **Requis quand** · **DoD** · **Stack** · **Levier `/assistant`**.

### PHASE 0 — Cadrage & Fondations *(avant la première ligne)*

**P0.1 Définition produit & scope** — (non-tech) écrire en une page ce que fait le produit, pour qui, et la frontière de la V1. · Requis quand : **toujours**. · DoD : `docs/BRIEF.md` (web/api/bot) ou `docs/BRIEF.md` + `docs/MOODBOARD.md` (showcase) existe et nomme persona + parcours principal. · Stack : markdown. · Levier : `references/client-brief-template.md` + skill `init` / `site` (détection showcase par `detect-project.ts`).

**P0.2 Choix de stack & architecture** — (non-tech) décider les briques techniques pour ne pas se peindre dans un coin. · Requis quand : **toujours**. · DoD : runtime/framework/DB/auth posés et cohérents. · Stack : Bun · Next.js App Router + Turbopack · Tailwind 4 · shadcn base-nova · Drizzle · Better-auth · Vercel cdg1. · Levier : `detect-project.ts` (lecture stack) + `generate-config.ts`.

**P0.3 Modélisation des données (schéma)** — (non-tech) le plan des « tiroirs » où vivent les données (users, commandes…). · Requis quand : `web-fullstack`, `api-backend`, souvent `bot-agent`. · DoD : schéma versionné, relations + index posés, pas de table fourre-tout. · Stack : Drizzle schema + migrations. · Levier : `(à construire)` — check schéma dans l'audit produit.

**P0.4 Environnements & config (12-factor)** — (non-tech) séparer dev / preview / prod et ne jamais coder un réglage en dur. · Requis quand : tout sauf `design-only`. · DoD : config par variables d'env, `.env.example` présent, parité dev↔prod. · Stack : Vercel env vars + `.env.local`. · Levier : `detect-project.ts` (détecte partiellement `env-configured`).

### PHASE 1 — Identité & Accès *(qui peut faire quoi)*

**P1.1 Authentification** — (non-tech) le login : prouver qui est l'utilisateur. · Requis quand : `web-fullstack`, `api-backend` (si users), parfois `bot-agent`. Jamais : `website-showcase`, `cli-tool` local, `design-only`. · DoD : signup / login / logout + reset password + vérif email + session sécurisée **testés end-to-end (navigateur)**. · Stack : Better-auth. · Levier : `detect-project.ts` (détecte Better-auth) ; `(à construire)` check parcours auth dans l'audit produit. **Règle 2026 : ne pas coder l'auth maison sans security engineer.**

**P1.2 RBAC / permissions / autorisation** — (non-tech) qui a le droit de voir/faire quoi (admin vs client). · Requis quand : dès qu'il y a > 1 rôle. · DoD : chaque route/action vérifie le rôle **côté serveur**, RLS si multi-tenant, **tests d'accès négatifs** (un user ne lit pas les données d'un autre). · Stack : Better-auth roles + checks serveur + Drizzle RLS. · Levier : `(à construire)` — agent `security-reviewer` (gap #1 de [[assistant-excellence-standards]]).

**P1.3 Onboarding utilisateur** — (non-tech) les premières minutes qui font rester ou partir l'utilisateur. · Requis quand : `web-fullstack`, app `bot-agent`. · DoD : premier parcours « zero-to-value » prouvé sans friction, état vide géré. · Stack : Next.js flows + emails de bienvenue. · Levier : `senior-designer.ts` (UX vitrine) ; `(à construire)` check onboarding produit.

### PHASE 2 — Cœur fonctionnel & Données

**P2.1 CRUD & logique métier** — (non-tech) créer/lire/modifier/supprimer les objets du produit. · Requis quand : tout produit avec données. · DoD : chaque entité CRUD-testée, règles métier couvertes, états limites gérés. · Stack : Next.js Route Handlers / Server Actions + Drizzle. · Levier : `(à construire)` — check complétude CRUD.

**P2.2 CRM / back-office / admin** — (non-tech) le tableau de bord interne pour gérer clients, contenus, commandes. · Requis quand : `web-fullstack` avec clients/contenu. · DoD : admin protégé par RBAC, CRUD complet sur entités clés, recherche/filtre. · Stack : zone `/admin` Next.js + shadcn tables. · Levier : `(à construire)`.

**P2.3 Recherche** — (non-tech) trouver vite dans beaucoup de données. · Requis si applicable (catalogue, contenus volumineux). · DoD : recherche pertinente + paginée + performante. · Stack : Postgres FTS / index Drizzle, ou Typesense si volume. · Levier : `(à construire)`.

**P2.4 Upload & gestion de fichiers** — (non-tech) déposer images/PDF en sécurité. · Requis si applicable. · DoD : validation type/taille, stockage hors-serveur, URLs signées, antivirus si public. · Stack : Vercel Blob / S3 + URLs signées. · Levier : `(à construire)`.

**P2.5 i18n / localisation** — (non-tech) plusieurs langues/devises. · Requis si applicable (cible multi-pays). · DoD : strings externalisées, formats date/monnaie locaux, fallback. · Stack : `next-intl`. · Levier : `(à construire)`.

### PHASE 3 — Monétisation

**P3.1 Paiements / billing / abonnements** — (non-tech) encaisser : one-shot ou abonnement. · Requis quand : tout produit qui vend. · DoD : succès, échec, dunning, remboursement, remboursement partiel, changement de plan **tous** testés (pas juste « ça paie ») ; webhooks idempotents. · Stack : Stripe + webhooks + table subscriptions Drizzle. · Levier : `detect-project.ts` (détecte Stripe) ; `(à construire)` check matrice d'états billing.

**P3.2 Webhooks entrants** — (non-tech) écouter les événements d'un service tiers (Stripe, etc.). · Requis si applicable. · DoD : signature vérifiée, idempotence, retries, dead-letter. · Stack : Route Handler + vérif signature Stripe. · Levier : `(à construire)`.

### PHASE 4 — Communication & Notifications

**P4.1 Email transactionnel** — (non-tech) emails déclenchés par une action (reset, reçu, alerte). · Requis quand : tout produit avec comptes/paiements. · DoD : templates, délivrabilité (SPF/DKIM), base légale RGPD (intérêt légitime / contrat), pas de secrets en clair. · Stack : Resend + React Email. · Levier : `detect-project.ts` (détecte Resend) ; `(à construire)` check délivrabilité.

**P4.2 Notifications (in-app / push / webhooks sortants)** — (non-tech) prévenir l'utilisateur d'un événement. · Requis si applicable. · DoD : préférences utilisateur + canal fiable + opt-out. · Stack : in-app Next.js, push web, ou webhooks sortants signés. · Levier : `(à construire)`.

### PHASE 5 — Fiabilité, Robustesse & Performance *(backend complet — gap #2)*

**P5.1 Validation des entrées** — (non-tech) ne jamais faire confiance à ce qui arrive de l'extérieur. · Requis quand : toute frontière (API, formulaire, webhook). · DoD : schéma de validation à chaque entrée serveur, erreurs claires. · Stack : Zod. · Levier : `(à construire)` — check dans backend-auditor.

**P5.2 Gestion d'erreurs structurée** — (non-tech) quand ça casse, savoir quoi et où sans planter l'utilisateur. · Requis quand : tout sauf `design-only`. · DoD : erreurs typées, pas de stack-trace exposée, codes HTTP corrects, fallback UI. · Stack : error boundaries Next.js + erreurs domaine typées. · Levier : `(à construire)`.

**P5.3 Logging structuré** — (non-tech) le journal de bord lisible par machine. · Requis quand : `api-backend`, `web-fullstack`, `bot-agent`. · DoD : logs JSON + niveaux + correlation id, zéro secret loggé. · Stack : pino / console structuré Vercel. · Levier : `(à construire)`.

**P5.4 Observabilité — monitoring / traces / métriques / alerting** — (non-tech) voir en temps réel si le produit va bien et être prévenu AVANT le client. · Requis quand : tout produit en prod. · DoD : erreurs + latence + uptime monitorés, alertes branchées, incident ownership défini (jour 1, pas semaine 10). · Stack : Sentry + Vercel Analytics + OpenTelemetry. · Levier : `(à construire)` — dimension observabilité absente de l'audit (gap #2).

**P5.5 Rate-limiting / anti-abus** — (non-tech) empêcher qu'on abuse ou attaque le service. · Requis quand : toute API/auth publique. · DoD : limites par IP/clé/route, throttling auth, réponse 429 propre. · Stack : Upstash rate-limit / middleware Next.js. · Levier : `(à construire)`.

**P5.6 Caching** — (non-tech) servir vite en évitant de recalculer. · Requis si applicable (charge/latence). · DoD : stratégie cache + invalidation maîtrisée, pas de données périmées servies. · Stack : Next.js cache + Redis/Upstash si besoin. · Levier : `(à construire)`.

**P5.7 Queues / jobs / tâches asynchrones** — (non-tech) faire le travail long en arrière-plan (mails de masse, traitement). · Requis si applicable. · DoD : retries, idempotence, visibilité d'échec. · Stack : QStash / cron Vercel. · Levier : `(à construire)`.

**P5.8 Budget de performance** — (non-tech) garantir que ça reste rapide. · Requis quand : `web-fullstack`, `website-showcase`, `api-backend`. · DoD : web-vitals/Lighthouse OK (vitrine), budgets latence p95 (API). · Stack : Lighthouse + web-vitals. · Levier : `senior-designer.ts` (vitrine, **couvert**) ; `(à construire)` — `perf-auditor` hors vitrine (gap #3).

**P5.9 API versioning & contrats** — (non-tech) faire évoluer l'API sans casser les clients existants. · Requis quand : `api-backend` exposée à des tiers. · DoD : versioning + schéma stable + dépréciation annoncée. · Stack : routes `/v1`, OpenAPI. · Levier : `(à construire)`.

### PHASE 6 — Sécurité & Conformité *(angle mort #1 de l'opérateur — gap #1)*

**P6.1 Sécurité applicative OWASP** — (non-tech) se protéger des attaques connues (vol de données, injection). · Requis quand : `web-fullstack`, `api-backend`, `bot-agent`. · DoD : OWASP ASVS niveau visé tenu (injection SQL/XSS/CSRF, authz, trust boundaries) — pas juste détection de secrets en dur. · Stack : Zod + Better-auth + headers sécurité + SAST. · Levier : `.claude/hooks/security.ts` (détecte secrets en dur, partiel) ; `(à construire)` — `/security-review` câblé au gate ship + dimension OWASP dans l'audit (gap #1).

**P6.2 Secrets management** — (non-tech) ne jamais laisser traîner les clés/mots de passe. · Requis quand : tout sauf `design-only`. · DoD : secrets en env/vault, jamais commités, `.gitignore` couvre `.env*`, rotation possible. · Stack : Vercel env + scan secrets. · Levier : `.claude/hooks/security.ts` (détecte `AKIA`/`sk-`, partiel).

**P6.3 RGPD / privacy / data-flow** — (non-tech) respecter la loi sur les données personnelles (consentement, suppression, registre). · Requis quand : tout produit EU avec données perso. · DoD : bannière consentement granulaire (accept/reject égaux), export + suppression compte, registre de traitement, base légale par usage, cookieless si possible. · Stack : bannière consentement + endpoints export/delete. · Levier : `(à construire)` — check RGPD absent de l'audit.

**P6.4 Dépendances & supply chain** — (non-tech) ne pas embarquer de briques vérolées. · Requis quand : tout projet avec deps. · DoD : audit deps régulier, lockfile, pas de CVE critique. · Stack : `bun audit` / Dependabot. · Levier : `plugin-hygiene.ts` / `mcp-hygiene.ts` (hygiène harness) ; `(à construire)` — dep-scan produit.

**P6.5 Backups & restauration** — (non-tech) pouvoir tout récupérer après une catastrophe. · Requis quand : tout produit avec DB de prod. · DoD : backups automatiques + **restauration testée** (un backup non restauré ne compte pas) + rollback. · Stack : backups managés Postgres + runbook restore. · Levier : `(à construire)`.

### PHASE 7 — Qualité & Tests *(point fort existant à étendre au produit)*

**P7.1 Tests unitaires** — (non-tech) vérifier chaque petite brique isolément. · Requis quand : logique métier non triviale. · DoD : fonctions critiques couvertes, vert en CI. · Stack : Vitest. · Levier : `quality-gate.ts` + `ship-check-gate.ts`.

**P7.2 Tests d'intégration** — (non-tech) vérifier que les briques marchent ensemble (API+DB). · Requis quand : `api-backend`, `web-fullstack`. · DoD : parcours serveur clés testés avec DB de test. · Stack : Vitest + DB éphémère. · Levier : `(à construire)`.

**P7.3 Tests E2E** — (non-tech) simuler un vrai utilisateur dans un vrai navigateur. · Requis quand : `web-fullstack`, `website-showcase`. · DoD : parcours promis prouvés **headful** (pas « build vert »). · Stack : Playwright. · Levier : **couvert** — `ship-check-gate.ts` exige la preuve E2E (`E2E_REPORT.md` + `SHIP_PROOF.json`, règle `e2e-proof`). C'est le point fort de référence.

**P7.4 Accessibilité (a11y)** — (non-tech) utilisable par tous, y compris handicaps. · Requis quand : `web-fullstack`, `website-showcase`. · DoD : WCAG AA (contraste, clavier, ARIA). · Stack : axe + checks. · Levier : **couvert vitrine** (`.claude/hooks/showcase.ts` + `senior-designer.ts`) ; `(à construire)` hors vitrine (gap #3).

### PHASE 8 — Acquisition & Croissance

**P8.1 SEO** — (non-tech) être trouvé sur Google. · Requis quand : `website-showcase`, `web-fullstack` public. · DoD : metas, sitemap, OG, données structurées, SSR. · Stack : Next.js metadata API + sitemap. · Levier : `senior-designer.ts` / `showcase.ts` (vitrine) ; `(à construire)` produit.

**P8.2 Analytics produit** — (non-tech) comprendre ce que font les utilisateurs. · Requis quand : tout produit en prod. · DoD : events clés trackés, RGPD-compliant (consentement/cookieless). · Stack : Plausible / PostHog + Vercel Analytics. · Levier : `(à construire)`.

**P8.3 Pages légales / CGU / privacy** — (non-tech) les pages obligatoires (mentions, CGU, confidentialité). · Requis quand : tout produit public. · DoD : mentions légales + politique de confidentialité + CGU/CGV si vente, à jour. · Stack : pages statiques Next.js. · Levier : `(à construire)`.

### PHASE 9 — Livraison & Exploitation

**P9.1 CI/CD** — (non-tech) la chaîne qui teste et déploie automatiquement à chaque changement. · Requis quand : tout produit en prod. · DoD : pipeline lint + typecheck + test + build qui bloque le merge si rouge, déploiement auto. · Stack : GitHub Actions + Vercel cdg1. · Levier : **détecté** (`audit-project.ts`, `detect-project.ts`) ; `(à construire)` — **génération** du pipeline en bootstrap (gap #4).

**P9.2 Gate de livraison (DoD dure)** — (non-tech) la barrière qui interdit de livrer un produit pas prêt. · Requis quand : toute livraison. · DoD : rapports QA + preuve E2E, blocage sur critical/high, décision `SHIP / DON'T SHIP`. · Stack : `ship-check-gate.ts` / `/ship100`. · Levier : **couvert (point fort)**.

**P9.3 Rollback & incident response** — (non-tech) annuler vite un déploiement raté et savoir qui gère. · Requis quand : tout produit en prod. · DoD : rollback 1-clic testé + ownership incident défini (non négociable 2026). · Stack : Vercel instant rollback + runbook. · Levier : `(à construire)`.

**P9.4 Documentation & DX** — (non-tech) que l'équipe (et l'IA) sachent faire tourner et comprendre le projet. · Requis quand : **toujours**. · DoD : `CLAUDE.md` + `README` + runbooks + mémoire à jour. · Stack : `generate-config.ts`. · Levier : **couvert** (`generate-config.ts`).

### PHASE 10 — Lancement & Maintenance

**P10.1 Go-live** — (non-tech) le passage en vrai, ouvert au public. · Requis quand : tout produit. · DoD : gate `/ship100` `SHIP`, monitoring branché (P5.4), pages légales (P8.3), rollback prêt (P9.3). · Stack : Vercel prod cdg1. · Levier : `ship-check-gate.ts` + `(à construire)` checklist go-live.

**P10.2 Monitoring vivant & maintenance** — (non-tech) surveiller, corriger, mettre à jour après le lancement. · Requis quand : tout produit en prod. · DoD : alertes actives, deps à jour (P6.4), dette suivie, incidents tracés. · Stack : Sentry + Dependabot + runbooks. · Levier : `clean.ts` / `status.ts` (harness) ; `(à construire)` monitoring produit.

---

## 5. Couverture vs gaps — où on en est

| État | Capacités |
|------|-----------|
| **Couvert (point fort)** | P7.3 E2E headful (`ship-check-gate.ts`), P9.2 gate de livraison (`/ship100`), P9.4 docs/DX (`generate-config.ts`), vitrine : P5.8/P7.4/P8.1 (`senior-designer.ts` + `showcase.ts`) |
| **Détecté seulement** | P0.4 env, P1.1 auth (Better-auth), P3.1 Stripe, P4.1 Resend, P9.1 CI/CD — vus par `detect-project.ts`/`audit-project.ts`, jamais scorés en complétude produit |
| **Partiel** | P6.1/P6.2 secrets en dur (`.claude/hooks/security.ts`), P6.4 hygiène (`plugin-hygiene.ts`/`mcp-hygiene.ts`) |
| **`(à construire)`** | Tout le reste du backend-completeness, sécurité OWASP/RGPD applicative, perf/a11y hors vitrine, génération CI/CD, backups testés + rollback |

**Gaps prioritaires à coder** (alignés sur [[assistant-excellence-standards]]) :
1. **Sécurité OWASP/RGPD applicative** (P6.1, P6.3) — absente de l'audit.
2. **Backend-completeness** (P5.1 validation, P5.4 observabilité, P5.5 rate-limit).
3. **Perf + a11y hors vitrine** (P5.8, P7.4).
4. **Génération CI/CD en bootstrap** (P9.1) — aujourd'hui détecté, pas généré.
5. **Backups testés + rollback** (P6.5, P9.3).

Quand ces gaps seront codés, ils s'exprimeront comme **nouvelles dimensions de `QUALITY_SCORE.md`** consommant ce catalogue (et les DoD par type dans `references/lifecycle/`), sans réécrire la logique TS existante.

---

## 6. Renvois

- **Standards d'excellence & matrice de couverture du harness** → [[assistant-excellence-standards]]
- **Doctrine grand codebase (7 composants CC + L1–L7)** → [[assistant-large-codebase-schema]]
- **DoD par type de projet** → `references/lifecycle/` *(dossier présent ; fiches par type `(à construire)` : web-fullstack, api-backend, bot-agent, cli-tool, website-showcase, design-only)*
- **Gate de livraison** → `scripts/ship-check-gate.ts` (règle `e2e-proof`) / skill `/ship100`
- **Détection de type & stack** → `scripts/detect-project.ts`
- **Audit harness actuel** → `scripts/audit-project.ts`
- **Gabarit de brief** → `references/client-brief-template.md`

---

## Sources

- [DevSquad — SaaS Launch Checklist 2026](https://devsquad.com/blog/saas-launch-checklist)
- [MindStudio — AI Agent Production Checklist](https://www.mindstudio.ai/blog/ai-agent-production-checklist)
- [Vetted Outsource — Production Readiness Checklist 2026](https://vettedoutsource.com/blog/production-readiness-checklist/)
- [The Twelve-Factor App](https://12factor.net/)
- [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/)
- [Formbricks — GDPR Compliance Checklist 2026](https://formbricks.com/blog/gdpr-compliance-checklist-2025)
- [Plausible — GDPR-compliant analytics without consent](https://plausible.io/blog/legal-assessment-gdpr-eprivacy)
- [CookieYes — GDPR Checklist for Websites](https://www.cookieyes.com/blog/gdpr-checklist-for-websites/)
