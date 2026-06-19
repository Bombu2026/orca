# Definition of Done — `api-backend`

> **Pour qui :** un fondateur non-tech. Chaque case = ce qu'une **équipe backend de classe
> mondiale** livrerait pour une vraie API (Express, Fastify, Hono, NestJS, FastAPI, Flask).
> `/assistant` coche À TA PLACE, une étape à la fois, et ne dit **« API finie »** que quand
> **toutes les cases applicables sont vertes avec preuve directe** (`curl` réel + état persisté
> vérifié) — **jamais** sur un simple « build vert ».
>
> **Spécificité API :** **pas d'UI, donc pas de SEO ni d'accessibilité** (sauf doc/console
> publique). En revanche le **contrat d'API, la validation, l'autorisation, l'idempotence,
> l'observabilité et le versioning** deviennent centraux. La preuve directe se fait au `curl`,
> pas au navigateur.
>
> **Comment lire :** explication en clair · **levier `/assistant`** réel · `(si applicable)` =
> optionnel · `(à construire)` = gap réel signalé, pas masqué.
>
> **Type détecté par** `scripts/detect-project.ts` → `api-backend`.

---

## Phase 0 — Fondations

- [ ] **Brief produit écrit** — une page : que fait l'API, pour quels clients (front, mobile, tiers), frontière V1.
  Levier : gabarit `references/client-brief-template.md` → `docs/BRIEF.md`.
- [ ] **Repo + `CLAUDE.md` + mémoire** — projet lisible par toi et l'IA.
  Levier : `/init` → `scripts/generate-config.ts`.
- [ ] **Stack & architecture posées** — runtime / framework / DB cohérents.
  Levier : `scripts/detect-project.ts` + `scripts/organise.ts` (`prescribe()`). Défaut : Bun · Hono/Fastify · Drizzle · Vercel cdg1.
- [ ] **Modèle de données + migrations** — schéma versionné, relations + index, migrations **réversibles**.
  Levier : Drizzle schema + migrations. `(à construire)` : check schéma dans `audit-project.ts`.
- [ ] **Environnements & config (12-factor)** — dev / staging / prod séparés, zéro réglage en dur, `.env.example`.
  Levier : `audit-project.ts` §8 + détection `env-configured`. Stack : Vercel env vars.

## Phase 1 — Identité & accès

- [ ] **Authentification API** *(si applicable : API avec utilisateurs ou clients)* — clés d'API / tokens / sessions : émission, révocation, expiration, vérifiées.
  Levier : Better-auth (détecté) ou JWT/clé d'API + preuve `curl` via `/ship100`.
- [ ] **Autorisation (authz)** — chaque endpoint vérifie **côté serveur** que l'appelant a le droit ; un client ne lit/écrit jamais les données d'un autre (test d'accès négatif obligatoire).
  Levier : checks serveur + Drizzle RLS si multi-tenant. `(à construire)` : agent `security-reviewer` (gap #1).

## Phase 2 — Cœur métier

- [ ] **Endpoints CRUD & logique métier** — créer / lire / modifier / supprimer les ressources, règles métier et cas limites couverts, codes HTTP corrects.
  Levier : Route Handlers + Drizzle ; tests via `/ship100`.
- [ ] **Recherche / filtres / pagination** *(si applicable : collections volumineuses)* — lister sans tout charger, résultats paginés et performants.
  Levier : index Drizzle + pagination par curseur.
- [ ] **Upload & fichiers** *(si applicable)* — réception sécurisée : type/taille validés, stockage hors-serveur, URLs signées.
  Levier : Vercel Blob / S3 + URLs signées + validation Zod.

## Phase 3 — Monétisation *(si applicable)*

- [ ] **Paiements / billing** *(si applicable)* — **succès, échec, dunning, remboursement, remboursement partiel, changement de plan** tous testés ; webhooks idempotents.
  Levier : Stripe (détecté) + table subscriptions Drizzle + preuve `curl` `/ship100`.

## Phase 4 — Communication

- [ ] **Email transactionnel** *(si applicable)* — emails déclenchés par l'API (reçu, alerte, reset) : délivrabilité (SPF/DKIM), base légale RGPD, zéro secret en clair.
  Levier : Resend (détecté) + React Email.
- [ ] **Webhooks sortants** *(si applicable : tu notifies des tiers)* — événements signés, retries, idempotence côté receveur documentée.
  Levier : signature HMAC + table d'événements + retries.

## Phase 5 — Fiabilité, robustesse & performance (cœur d'une API)

- [ ] **Validation des entrées** — ne jamais faire confiance à ce qui arrive : un schéma de validation à **chaque** endpoint et webhook, erreurs claires.
  Levier : Zod. `(à construire)` : check dans `backend-auditor` (gap #2).
- [ ] **Gestion d'erreurs structurée** — réponses d'erreur normalisées (code + message + id), **jamais de stack-trace exposée**, codes HTTP justes.
  Levier : middleware d'erreur + erreurs domaine typées.
- [ ] **Idempotence** *(si applicable : POST de paiement, webhooks)* — rejouer la même requête ne crée pas de doublon (clé d'idempotence).
  Levier : clé d'idempotence + table de déduplication. `(à construire)` : check dans `backend-auditor`.
- [ ] **Logging structuré** — journal JSON par requête avec **correlation id**, niveaux, zéro secret loggé.
  Levier : pino / logs structurés Vercel.
- [ ] **Observabilité (monitoring / traces / métriques / alerting)** — erreurs, latence p95, uptime surveillés ; alertes branchées **avant** que le client se plaigne ; ownership incident défini jour 1.
  Levier : Sentry + OpenTelemetry + Vercel Analytics. `(à construire)` : dimension observabilité absente de l'audit (gap #2).
- [ ] **Rate-limiting / anti-abus** — limites par IP / clé / route, réponse 429 propre, protection brute-force sur l'auth.
  Levier : Upstash rate-limit / middleware. `(à construire)`.
- [ ] **Caching** *(si applicable : latence ou charge)* — réponses mises en cache avec invalidation maîtrisée, en-têtes Cache-Control corrects.
  Levier : cache HTTP + Redis/Upstash.
- [ ] **Queues / jobs asynchrones** *(si applicable : traitements longs)* — déporter en arrière-plan avec retries, idempotence, visibilité d'échec.
  Levier : QStash / cron Vercel.
- [ ] **Budget de performance** — latence p95 sous un seuil défini, sous charge représentative.
  Levier : test de charge + métriques. `(à construire)` : `perf-auditor` hors vitrine (gap #3).
- [ ] **API versioning & contrats** *(si applicable : exposée à des tiers)* — faire évoluer sans casser les clients : routes `/v1`, schéma stable, dépréciations annoncées.
  Levier : routes versionnées + OpenAPI.

## Phase 6 — Sécurité & conformité (ton angle mort #1)

- [ ] **Sécurité applicative OWASP** — injection SQL, mauvaise authz, exposition de données, CSRF (si cookies), trust boundaries ; pas juste « pas de secret en dur ».
  Levier : Zod + Better-auth + headers sécurité ; hook `.claude/hooks/security.ts`. `(à construire)` : `/security-review` câblé au gate + dimension OWASP dans l'audit (gap #1).
- [ ] **Secrets management** — clés en env/vault, jamais commitées, `.gitignore` couvre `.env*`, rotation possible.
  Levier : Vercel env + hook `security.ts` (AKIA / `sk-` / password) + `audit-project.ts` §8.
- [ ] **RGPD / vie privée** *(si applicable : données perso EU)* — endpoints d'export et de suppression, registre de traitement, base légale par usage, minimisation des données loggées.
  Levier : endpoints export/delete + politique de rétention. `(à construire)` : check RGPD absent de l'audit (gap #1).
- [ ] **Dépendances / supply chain** — lockfile, audit régulier, zéro CVE critique.
  Levier : `bun audit` / Dependabot. `(à construire)` : dep-scan dans le pipeline qualité.
- [ ] **Backups & restauration testée** *(si applicable : DB de prod)* — récupération après catastrophe ; un backup **non restauré ne compte pas**.
  Levier : backups managés Postgres + runbook restore. `(à construire)`.

## Phase 7 — Qualité & tests

- [ ] **Tests unitaires** — logique métier critique couverte, verte en CI.
  Levier : Vitest.
- [ ] **Tests d'intégration (API + DB)** — parcours serveur clés testés contre une base de test éphémère.
  Levier : Vitest + DB éphémère.
- [ ] **Tests de contrat / endpoint (preuve `curl`)** — chaque endpoint promis prouvé avec une vraie requête + réponse + état persisté vérifié, pas « build vert ».
  Levier : `scripts/ship-check-gate.ts` (`SHIP_PROOF.json` documente les commandes + exit codes ; règle `e2e-proof` adaptée API).

## Phase 8 — Documentation d'API (remplace SEO/analytics côté API)

- [ ] **OpenAPI / référence d'API** — un contrat lisible (schéma OpenAPI/Swagger) que les clients consomment.
  Levier : génération OpenAPI depuis les schémas Zod / routes.
- [ ] **Pages légales / conditions d'usage** *(si applicable : API publique)* — conditions d'utilisation + politique de confidentialité de l'API.
  Levier : doc statique.

## Phase 9 — Livraison & exploitation

- [ ] **CI/CD** — lint + typecheck + test + build, bloque le merge si rouge, déploiement auto.
  Levier : GitHub Actions + Vercel. **Détecté** par `audit-project.ts` §10 ; `(à construire)` : **génération** du pipeline en BOOTSTRAP (gap #4).
- [ ] **Déploiement** — l'API est en ligne (Vercel cdg1 ou conteneur), variables d'env prod posées.
  Levier : Vercel / Docker (détectés) ; config via `scripts/generate-config.ts`.
- [ ] **Rollback & incident response** *(si applicable : en prod)* — rollback 1-clic testé + ownership incident défini.
  Levier : Vercel instant rollback + runbook. `(à construire)`.
- [ ] **Docs & DX** — `CLAUDE.md` + README + runbooks + mémoire à jour.
  Levier : `scripts/generate-config.ts` + hook `dx.ts`. **Couvert**.
- [ ] **GATE `/ship100` — DoD dure** — 7 rapports QA + preuve (ici `curl`/contrat), blocage sur critical/high, décision `SHIP / DON'T SHIP`.
  Levier : `scripts/ship-check-gate.ts` + skill `/ship100`. **Couvert (point fort).**

---

## Verdict « VRAIMENT FINI » (doctrine)

`/assistant` ne déclare cette `api-backend` **finie** que si **toutes les cases applicables sont
vertes**, chacune avec **preuve directe au `curl`** (requête réelle + réponse attendue + état
persisté vérifié) — **jamais** sur un typecheck OK seul. Pas d'UI : la preuve est l'appel d'API, pas
le navigateur. Toute case applicable vide = **gap bloquant** dans `QUALITY_SCORE.md`, et `/assistant`
donne **UNE seule prochaine étape** expliquée en clair. Extension au **produit** de `/conseil`
gate-FINI + `/ship100`.
