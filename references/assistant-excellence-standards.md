# Excellence Standards — Matrice de couverture du jumeau dev

> Doctrine additive (couche SKILL.md + references). Aucune logique TS n'est réécrite ici :
> cette matrice est une **baseline lue à chaque invocation** (même mécanisme que
> `assistant-large-codebase-schema.md`), qui transforme les **angles morts de l'opérateur**
> en garanties automatiques de `/assistant` — niveau « top global dev shop ».

## Règle d'application (NON NÉGOCIABLE)

Sur **tout** passage `BOOTSTRAP`, `NEXT-GAP` et `/ship100` (ship-check-gate), cette matrice
EST appliquée, dimension par dimension :

- Chaque dimension ci-dessous est évaluée pour le projet courant selon son `detect.type`.
- **Une dimension non couverte = GAP BLOQUANT du `QUALITY_SCORE`**, listé dans les « Gaps qui
  bloquent » — **jamais passé sous silence, jamais minimisé**.
- Si la couverture vient d'un script/gate/hook/skill **réel**, on le nomme. Si la garantie
  n'existe pas encore dans la logique TS, c'est marqué **`(à construire)`** — c'est un vrai
  manque, pas une excuse pour baisser le standard.
- Le jumeau compense ce que l'opérateur ne maîtrise pas : **cybersécurité**, **backend complet**,
  **perf/a11y hors site vitrine**, **CI/CD généré**. Ces angles morts sont traités comme des
  exigences de livraison, pas des options.

Anti-hallucination : tous les artefacts cités ci-dessous ont été vérifiés par lecture du code
(`scripts/`, `.claude/hooks/`, `SKILL.md`). Les manques réels portent `(à construire)`.

---

## Matrice

| DIMENSION | Ce que `/assistant` garantit TOUJOURS | COMMENT (script / gate / hook / skill réel) | Statut |
|---|---|---|---|
| **Skills selection** | Les meilleurs skills de la library (7876) sont rankés, sélectionnés et **matérialisés** dans `.claude/` du projet, modèle Opus forcé. | `scripts/strategy-select.ts` (ranking + boosts repos trusted → `TOOLKIT_PLAN.md`) → `scripts/install-toolkit.ts` (matérialise, force `model: claude-opus-4-8`, receipt `TOOLKIT_INSTALLED.json`) ; `scripts/conseil-skill-match.ts` (croise besoins↔skills). | **Couvert** — GAP mineur : pas d'**épinglage forcé** des skills sécurité/backend si le brief ne les mentionne pas. **`(à construire)`** : forcer `senior-security` + `senior-backend` au socle de `prescribe()`. |
| **Subagents wiring** | 7 agents de base + 4 auditeurs (`security-reviewer, backend-auditor, perf-auditor, a11y-auditor`) générés selon le type, tous Opus. | `scripts/strategy-select.ts` L251 (« Always generate: … ») ; `scripts/generate-config.ts` (`AUDITORS_BY_TYPE`, copie conditionnelle des `templates/agents/auditors/*.md`) ; `scripts/install-toolkit.ts` force `model: claude-opus-4-8`. | **Couvert** — les 4 auditeurs sont matérialisés en baseline par type (a11y/perf réservés web/app ; vitrine = agents showcase). GAP restant : sécurité applicative OWASP non auto-scorée par `lifecycle-audit` (couverte par l'agent `security-reviewer`). |
| **Hooks / Plugins / Commands** | Garde-fous d'exécution actifs : blocage `--no-verify`, `force-push`, `rm -rf`, `DROP/TRUNCATE TABLE`, secrets hardcodés (AKIA/`sk-`/password) ; protection des configs lint/build ; hygiène plugins & MCP. | `.claude/hooks/security.ts` (action `secret` L141-147 bloque/avertit ; `--no-verify` + `DROP/TRUNCATE` L92-105), `.claude/hooks/quality.ts`, `.claude/hooks/dx.ts`, `.claude/hooks/showcase.ts` ; `scripts/plugin-hygiene.ts` + `scripts/mcp-hygiene.ts`. | **Couvert** — GAP mineur : `security.ts` est **défensif** (pattern-match sur secrets/commandes), **pas de SAST sur le code généré**. **`(à construire)`** : passe SAST/dep-scan dans le pipeline qualité. |
| **Tests (unit / integration / e2e)** | Livraison interdite sans 7 rapports QA + preuve E2E **headful** ; blocage sur tout critical/high, cycle de dépendances, violation de frontière, ou décision « DON'T SHIP / SHIP UNCERTAIN ». | `scripts/ship-check-gate.ts` (REPORT_NAMES = `BUGS.md, SLOP.md, ARCH.md, CODE_PATH_COVERAGE.md, E2E_REPORT.md, SHIP_CHECK.md, SHIP_PROOF.json` ; règles `critical-high-blocker` + `e2e-proof`) ; doctrine `references/pre-prod-qa-strategy.md` (14 stratégies) ; skill `/ship100`. | **Couvert (point fort)** — pas de gap. C'est le standard de référence : preuve directe end-to-end, pas « build vert ». |
| **Cybersécurité** (secrets, deps, authz, injection, RGPD) | Détection des secrets hardcodés (hook) + audit permissions/.gitignore (env sensibles non commités). | `.claude/hooks/security.ts` (secrets) ; `scripts/audit-project.ts` §8 « PERMISSIONS & SECURITY » (weight 1.5 : `permissions.allow/deny` + `.gitignore` env sensibles). | **GAP RÉEL PRINCIPAL** — zéro OWASP / SAST / trust-boundary / injection (SQLi/XSS/CSRF) / authz-RLS / RGPD-data-flow dans `audit-project.ts`, `ship-check-gate.ts`, `SKILL.md`. §8 = permissions + gitignore **seulement**. Angle mort explicite du jumeau (`08-Garde-fous`, hors-périmètre sécurité-info). **`(à construire)`** : agent `security-reviewer` (library `trailofbits`, `senior-security`, affaan-m `security-review`/`scan`) + dimension sécurité applicative dans l'audit. Skill natif `security-review` (`/security-review`) à câbler au gate ship. |
| **Backend complet** (schema / migrations / API / erreurs / idempotence / observabilité) | Stack backend détectée (DB, auth, API) et outillage prescrit (DB MCP si drizzle/prisma/neon/supabase) ; skills/agents backend matérialisables depuis la library. | `scripts/detect-project.ts` (détecte database/auth/api) ; `scripts/organise.ts` `prescribe()` (add-on DB MCP) ; `scripts/install-toolkit.ts` (matérialise agents `backend/api/database`). | **PARTIEL / GAP** — aucune dimension **backend-completeness** : pas de check validation des inputs, authz/RLS, migrations réversibles, **idempotence**, rate-limit, gestion d'erreurs structurée, **observabilité** (logs/traces/métriques). Library `senior-backend`/`api-design`/`database-migrations` **non épinglée**. **`(à construire)`** : agent `backend-auditor` (Opus) + checklist backend dans l'audit. |
| **Performance** | Sur sites vitrine : audit Lighthouse / web-vitals exigé. | `.claude/hooks/showcase.ts` ; `scripts/senior-designer.ts` (Lighthouse/web-vitals) ; doctrine `references/assistant-showcase-workflow.md`. | **Couvert (vitrine)** — **GAP général** : aucune budget perf / profilage sur web-fullstack & api-backend. **`(à construire)`** : agent `perf-auditor` (library `core-web-vitals`, `performance-profiler`) hors `website-showcase`. |
| **Accessibilité** | Sur sites vitrine : conformité WCAG vérifiée. | `.claude/hooks/showcase.ts` (section a11y) ; `scripts/senior-designer.ts` (WCAG) ; doctrine `references/assistant-showcase-workflow.md`. | **Couvert (vitrine)** — **GAP général** : pas de check a11y sur les apps web-fullstack. **`(à construire)`** : agent `a11y-auditor` (library `a11y-audit`, `accessibility`) hors `website-showcase`. |
| **CI/CD** | Détection de l'existence d'un pipeline (GitHub Actions / GitLab CI / vercel) et recommandation si absent. | `scripts/audit-project.ts` §10 « CI/CD & DEPLOYMENT » (weight 0.5 : `.github/workflows`, `.gitlab-ci`, `vercel`). | **Couvert (détection)** — **GAP génération** : `/assistant` ne **génère** pas le pipeline manquant. **`(à construire)`** : génération `.github/workflows/` (library `github-actions-creator`, `ci-cd-pipeline-builder`) en mode BOOTSTRAP. |
| **Docs / DX** | CLAUDE.md + mémoire seedés ; hygiène DX (config protection, hooks DX) ; verdict /10 + dérive visible re-écrit à chaque passage. | `scripts/generate-config.ts` (`buildStandardMemoryFiles()` + templates `claude-md/*.md`) ; `.claude/hooks/dx.ts` ; `scripts/organise.ts` (écrit `QUALITY_SCORE.md` + drift ↑/↓/→). | **Couvert** — pas de gap bloquant. |

---

## Synthèse des GAPS bloquants (à reporter dans QUALITY_SCORE)

Ordre de priorité, alignés sur les angles morts du jumeau :

1. **Cybersécurité applicative** (GAP principal) — OWASP/SAST/injection/authz/RGPD absents de l'audit et du gate ship → agent `security-reviewer` + dimension sécurité.
2. **Backend-completeness** — validation/authz-RLS/migrations/idempotence/rate-limit/observabilité non vérifiés → agent `backend-auditor` + checklist.
3. **Perf & a11y hors vitrine** — couverts uniquement sur `website-showcase` → agents `perf-auditor` + `a11y-auditor` pour web-fullstack/api-backend.
4. **CI/CD génération** — détecté mais non généré → génération du pipeline en BOOTSTRAP.

Tant que ces `(à construire)` ne sont pas livrés, ils **comptent comme gaps du QUALITY_SCORE**
pour les types de projet concernés — c'est la garantie « top global dev shop » : aucune dimension
n'est tue.

OK excellence-standards
