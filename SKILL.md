---
name: assistant
description: >
  Architecte permanent Claude Code. Cold-start déterministe : tape /assistant
  (ou "organise mon dev") dans un projet → scan en ~5s → verdict chiffré /10 + 3 gaps
  qui bloquent + UNE action à valider + prescription stack→outils (via scripts/organise.ts).
  Tu ne choisis aucun mode, l'outil le déduit (seed / bootstrap / audit / next-gap).
  Surface = 3 commandes : /assistant (dispatch), /ship100 (gate de livraison dur),
  /conseil (board produit business+dev). Sous-routines : init, audit, site, senior-designer,
  teach, token-doctor.
  Triggers : assistant, organise mon dev, init, bootstrap, nouveau projet, configure, audit, check mon projet, optimize,
  conseil, board, rends mon projet excellent, meilleures features, est-ce que mon produit est fini,
  qu'est-ce qui manque, trouve les meilleurs skills, niveau excellent, ship100, ship 100%, pleine puissance,
  20 agents, maximum d'agents, site vitrine, site client, landing page, showcase, moodboard, brief client.
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
  - Agent
---

# ORCA — Architecte permanent Claude Code

## Contrat

ORCA est un bootstrapper/auditeur de workspaces IA, pas une app produit.
Il crée et maintient : `.claude/CLAUDE.md`, skills, agents, hooks,
commands, mémoire, la boucle autonome (`.claude/loop.md`), gates de ship.

**Surface user = 3 commandes. Le reste est déduit, pas choisi.**

| Commande | Rôle |
|---|---|
| `/assistant` | **Cold-start déterministe.** Scanne le projet → verdict chiffré /10 + 3 gaps qui bloquent + UNE action à valider + prescription stack→outils. Tu ne choisis aucun mode : l'outil déduit s'il faut seeder, bootstrapper, auditer ou combler le gap suivant. |
| `/ship100` | Gate de livraison dur : preuves, QA, E2E, review, décision `SHIP / DON'T SHIP`. |
| `/conseil` | Couche produit (opt-in) : board business+dev, meilleures features (RICE), verdict « produit fini ? » avec preuves end-to-end. |

Sous-routines, déclenchées par `/assistant` selon le contexte (pas par toi) :
`init` (seed projet vierge), `audit` (scoring profond `--deep`), `site` / `senior-designer`
(showcase), `teach` (prof socratique post-session), `token-doctor` (dimension du score).
Procédures détaillées dans `references/assistant-*.md` pour garder ce skill sous le budget
de contexte ; lis la référence avant une phase longue.

## Baseline — Large Codebase Schema (à chaque invocation)

Doctrine obligatoire de référence : `references/assistant-large-codebase-schema.md`
(synthèse fidèle de
[How Claude Code works in large codebases](https://claude.com/blog/how-claude-code-works-in-large-codebases-best-practices-and-where-to-start)).

**À chaque invocation, avant tout routage**, ORCA doit :

1. Lire `references/assistant-large-codebase-schema.md` si la doctrine n'est
   pas déjà en contexte.
2. Vérifier les 7 composants du harness Claude Code dans le projet courant :
   CLAUDE.md hierarchy, hooks, skills (path-scoped), plugins, LSP, MCP,
   subagents (split read/write).
3. Suivre le **principe directeur** : Claude navigue comme un ingénieur
   (filesystem + grep + références) — investir en amont sur la légibilité,
   pas sur du RAG.
4. Adapter la branche déduite :
   - **SEED** (`init`) → **seed** les 7 composants + Starting Point Checklist (8 items).
   - **NEXT-GAP** (`audit`) → **score** les 7 dimensions L1-L7 (poids dans le tableau de
     la doctrine) en complément des sections existantes ; tout axe < 7/10 devient un gap
     bloquant du Repo Readiness Score (`QUALITY_SCORE.md`).
   - `/ship100` → **bloque** le ship si L1 (CLAUDE.md hierarchy), L2 (hooks)
     ou L5 (LSP) sont en échec critique.
   - `site` → applique a minima L1 (CLAUDE.md root) et L3 (skill showcase `paths:`-scopé).
5. En monorepo : ne **jamais** initialiser uniquement à la racine — créer un
   CLAUDE.md par sous-projet pertinent (Claude remonte automatiquement).

Cette baseline est non négociable : si une dimension manque, elle entre dans la todo d'init
ou dans les gaps de `QUALITY_SCORE.md`, jamais sous silence.

## Operator Baseline — viser le niveau d'une top-tier dev shop

/assistant sert **l'opérateur** à une barre non négociable : le **niveau d'une des plus
grosses boîtes de dev mondiales**. L'opérateur est typiquement un solo founder / vibe coder
qui ne maîtrise pas toute la tech — il n'a PAS à savoir qu'il faut faire l'auth, le RBAC ou
le CI/CD.

Ses ANGLES MORTS (cybersécurité, backend complet, stratégie de tests, choix des meilleurs
skills/subagents/hooks/plugins) sont une **couverture NON NÉGOCIABLE** : sur tout BOOTSTRAP,
NEXT-GAP et /ship100, appliquer `references/assistant-excellence-standards.md` — chaque
dimension non couverte devient un **gap bloquant** de `QUALITY_SCORE.md`, jamais sous silence.
/assistant pense à ces dimensions À SA PLACE, même s'il ne les demande pas.

## Lifecycle Conductor — gérer le projet de A à Z

/assistant ne configure pas que le harness Claude Code : il **conduit le cycle
de vie produit complet**, comme le ferait une équipe d'une des plus grosses boîtes tech
mondiales (auth, RBAC, paiements, CRM/admin, email transactionnel, RGPD, sécurité, tests,
observabilité/monitoring, CI/CD, perf, a11y, backups, secrets, rate-limit, gestion d'erreurs,
SEO, analytics, pages légales, onboarding…). l'opérateur ne maîtrise pas la tech : il n'a PAS à
savoir qu'il faut faire l'auth, le CRM ou le CI/CD. **C'est /assistant qui sait tout ça à sa
place, détecte où en est le projet, et lui donne l'étape suivante — une seule à la fois,
expliquée pour un non-tech — pendant qu'il travaille.**

**À charger** (en plus de la baseline Large Codebase et de l'Operator Baseline) :

1. `references/assistant-tech-lifecycle.md` — la doctrine du cycle de vie produit
   complet : tout ce qu'une top boîte tech prend en compte, du jour 0 au jour N.
2. `references/lifecycle/<type>.md` — la **Definition of Done** (DoD) du type détecté
   par `scripts/detect-project.ts`. Les 7 types réels : `web-fullstack`, `api-backend`,
   `bot-agent`, `cli-tool`, `website-showcase`, `design-only`, `unknown`. Chaque fichier
   liste les exigences **applicables** à ce type (un `cli-tool` n'a pas besoin de RBAC ;
   un `web-fullstack` SaaS si).

**Sur chaque NEXT-GAP**, après le score harness, ORCA évalue le projet contre sa DoD
applicable et **surface l'ÉTAPE SUIVANTE unique et concrète**, jamais une todo-list noyante :

- Détecter ce qui existe déjà (filesystem + grep + deps + config), pas l'auto-déclaré.
- Choisir le **prochain maillon manquant** le plus bloquant de la DoD.
- L'énoncer en clair pour un non-tech, avec le POURQUOI et le COMMENT concret. Exemple :
  « Ton app a un login mais n'importe qui peut voir les données des autres → on ajoute le
  contrôle d'accès (RBAC) avec Better-auth, voilà comment » ou « Tu n'as pas d'auth → on
  ajoute Better-auth, voilà les étapes ».
- Écrire la progression dans `LIFECYCLE.md` (où en est le projet sur sa DoD, ce qui est
  vert/manquant/N/A) ET dans `QUALITY_SCORE.md` (le gap entre dans le score). Toute exigence
  DoD applicable non couverte est un **gap bloquant**, jamais sous silence.

**Verdict FINI (gate `/ship100`)** : un projet n'est déclaré **FINI** que quand TOUTE la DoD
applicable est verte **avec preuve directe** (navigateur/curl/test réel) — jamais sur build
vert, typecheck OK ou HTTP 200 (règle CLAUDE.md : trois preuves indirectes ≠ une preuve
directe). Les 4 auditeurs **security / backend / perf / a11y** (`templates/agents/auditors/`, Opus,
`context: fork`) sont **générés en baseline** par `generate-config.ts` selon le type (`AUDITORS_BY_TYPE`),
non optionnels sur NEXT-GAP et `/ship100`. **Orchestration enforced** : `organise.ts` émet un `spawnPlan`
exécutable (agent + prompt + scopes read/write DISJOINTS, read-only + un seul rapport par auditeur) — un
script ne peut pas spawn un sous-agent LLM, donc quand il est non vide **SPAWN-les en parallèle MAINTENANT**
(`context: fork`), ne rapporte pas « à lancer » ; `audit-project.ts` SCORE en miroir le split read/write +
`context:fork/summary` des agents. `lifecycle-audit.ts`
score directement **perf** et **a11y** (capacités du MATRIX) ; la **sécurité applicative OWASP** et
la **complétude backend** restent couvertes par les auditeurs (vérification humaine + agent), pas
encore auto-scorées — c'est explicite, jamais masqué derrière un faux « fini ».

Cold-start lifecycle : `scripts/lifecycle-audit.ts` cartographie le projet contre sa DoD
(coché / manquant / N/A), rend l'unique prochaine étape produit et écrit `LIFECYCLE.md`. Il est
**câblé dans `organise.ts`** : sur NEXT-GAP/BOOTSTRAP, `/assistant` réutilise le type déjà détecté
(oracle unique), appelle `lifecycle-audit --json`, et fusionne la « prochaine étape produit » dans
son verdict + `QUALITY_SCORE.md`. Aussi lançable seul : `bun run lifecycle <path>`.

## Routage — le MODE se déduit, le PRODUIT s'interroge

Distinction non négociable :

- **Le MODE (harness) se DÉDUIT, jamais ne se questionne.** seed / bootstrap / audit / next-gap
  est une déduction de `organise.ts`, pas un choix de l'user. Aucune question là-dessus.
- **Le PRODUIT s'INTERROGE.** À quoi sert le projet, pour qui, ce que « fini à 100% » veut dire,
  la cible de déploiement, le niveau de design — rien de tout ça n'est dans le filesystem. Sur un
  **nouveau projet**, /assistant pose un maximum de questions AVANT d'agir (voir « Onboarding »).

Quand ORCA est invoqué (`/assistant`, "organise mon dev", ou simple ouverture
d'un projet sans mode explicite), **PREMIÈRE ACTION, avant tout routage ou question** :

```bash
bun ~/.claude/skills/assistant/scripts/organise.ts "$(pwd)"
```

`organise.ts` réutilise `detect-project.ts` + `audit-project.ts`, écrit `QUALITY_SCORE.md`
dans le projet (boucle de feedback / dérive visible), et renvoie une **branche déduite** :

- **SEED** (dossier vierge) → procédure INIT : `references/assistant-init-workflow.md`.
- **DIRTY-FIRST** (> 30 fichiers non commités) → **STOP** : faire committer/assainir l'arbre
  git AVANT toute autre chose (ORCA dogfoode sa propre doctrine : un auditeur ne
  travaille pas sur un arbre sale).
- **BOOTSTRAP** (code présent, pas de `.claude/CLAUDE.md`) → générer la config :
  `generate-config.ts` + `install-toolkit.ts`.
- **NEXT-GAP** (config présente) → présenter le verdict, régler le **gap #1** du score
  (l'action par défaut, validable d'un mot), puis re-scanner pour montrer le gain.

Sur le **MODE**, zéro question (sauf détection ambiguë : monorepo → `AskUserQuestion`). `organise.ts`
renvoie aussi `onboarding.mode` : `interview` (nouveau projet) → enchaîner l'interview produit AVANT
d'agir ; `health-check` (re-run) → check d'organisation + rapport de direction ; `dirty` (DIRTY-FIRST)
→ STOP, aucune interview ni boucle prescrite tant que l'arbre n'est pas commit.

Baseline obligatoire (avant le routage spécifique) :
`references/assistant-large-codebase-schema.md`.

### Onboarding — interroger d'abord (nouveau projet), check au re-run

Référence complète : `references/assistant-onboarding-interview.md`. Porté en données par
`scripts/lib/onboarding.ts` → `organise.ts` renvoie `onboarding` (mode, questions, discovery, /goal,
/loop, installation). **Non négociable** : sur un nouveau projet, ne PAS coder avant d'avoir interrogé.

`mode === "interview"` (SEED/BOOTSTRAP, ou NEXT-GAP sans `PROJECT_BRIEF.md`), dans l'ordre :

1. **Brief** — le premier texte donné par l'opérateur EST le brief : le lire, en extraire le connu.
2. **Interroger un maximum** — `onboarding.questions[]` via `AskUserQuestion` (batché, gap-driven : jamais
   redemander ce que la détection/le brief donnent).
3. **Chercher tous les outils** — exécuter `onboarding.discovery` (`strategy-select` + `install-toolkit`
   pré-remplis) qui minent la library ; matérialiser chaque outil `missing` de `installation` + auditeurs.
4. **Mémoire Obsidian** _(étape LLM via `mcpvault`, non exécutée par le script)_ — relire `Memory.md` +
   l'index projet, **signaler toute contradiction** (jamais écraser), écrire le cadrage selon `_ROUTING.md`.
5. **Dicter /goal et /loop** — `onboarding.goal.command` / `loop.command` copiables (gatés version CC).
6. **Persister** `PROJECT_BRIEF.md` _(écriture LLM obligatoire, pas automatique)_ → bascule les `/assistant`
   suivants en health-check (idempotence).

`mode === "health-check"` (re-run cadré) : pas de questions → rapport de direction (organisation complète ?
`installation` + 6 leviers · prochaine étape DoD + gap #1 · boucles à jour · drift). `mode === "dirty"`
(DIRTY-FIRST) : STOP, commit d'abord, rien d'autre. Verdict d'abord, puis détail.

### Prescription de workflow (benchmark vivant)

Quand la tâche à venir est de complexité **moyenne/élevée** (pas un typo/rename), `/assistant`
prescrit **le** workflow agentique gagnant pour son profil, jamais à l'intuition :

```bash
bun run workflow:select <A|B|C|D>   # A=bug fix · B=feature multi-fichiers · C=refactor transverse · D=UI subjectif
```

- Le classement vient de **runs réels** loggés dans `references/workflows-benchmark.jsonl`
  (stars/hype = 0). Voir `references/workflow-playbooks/RUBRIC.md` (la stratégie) + `LEADERBOARD.md`.
- Tant que le benchmark est vide ou « provisoire » (< 3 runs / 2 classes), utiliser le **prior** :
  **EPCT + Verify durci** (playbook 01) par défaut, **Spec-driven** (02) pour les grosses features,
  **Orchestrator-Workers** (03) pour le parallélisable.
- Après chaque exécution réelle d'un workflow, **logger un run** :
  `bun run workflow:bench record --json '<run>'` (schéma dans RUBRIC.md) → le classement s'auto-corrige.

### Commandes explicites encore reconnues

Au-delà du cold-start, ces invocations directes restent câblées (sous-routines) :

- `/ship100`, "ship 100%", "pleine puissance", "ultracode" → gate de livraison dur (preuves, QA, E2E, review) ; orchestration via Workflow (voir « Pleine Puissance »).
- `/conseil`, "board", "meilleures features", "est-ce que mon produit est fini", "trouve les meilleurs skills" → `references/assistant-conseil-workflow.md`.
- `/site`, "site vitrine", "showcase", "moodboard" → `references/assistant-showcase-workflow.md`.
- `/senior-designer`, `/sd`, "niveau Awwwards", "design review" → `references/assistant-senior-designer.md`.
- `/teach`, "explique-moi", "vérifie que j'ai compris" → `references/assistant-teach-workflow.md`.
- `token-doctor`, `token audit`, `too expensive` → `references/assistant-token-doctor.md` (sinon dimension auto du score).

> Le coaching live continu (`/live`) ne fait pas partie de cette version publique d'ORCA.

## Autonomy Card · Production Reality · Boucles autonomes (résumé)

Détail complet : `references/assistant-autonomy-loops.md`. Émis à chaque cold-start par `organise.ts`
(via `scripts/lib/autonomy.ts` + `onboarding.ts`), jamais oublié.

- **Autonomy Card — 6 leviers** pour run Opus des heures/jours : permissions auto, workflows
  (« ultracode »), `/loop`·/goal (gated version CC — jamais un faux `armed`), cloud, self-verify E2E,
  et **Rule of Two** (sécurité agentique). Un levier `reminder` se **dit à voix haute** ; un `missing`
  est un **gap bloquant** : self-verify (web sans navigateur / API sans serveur) OU **lethal trifecta**
  (données privées + contenu non fiable + action sortante réunis sans humain → autonomie refusée,
  `scripts/lib/rule-of-two.ts`). /assistant ne prétend jamais avoir « activé » permissions/cloud.
- **Production Reality (défaut)** : la DoD exige les couches infra (caching, CDN, scaling, déploiement,
  sécurité OWASP, backend), déléguées au PaaS si détecté ; auditeurs lancés en parallèle si leur rapport
  manque. **Profil mock** (`--mock`, opt-out explicite) sort les couches `prodOnly` — toujours **listé**.
- **Boucles** : `/goal` d'abord (l'évaluateur ne lit QUE le **transcript** → faire apparaître l'output
  du scan), `/loop 30m /assistant` pour le polling. Texte exact prescrit par `onboarding.ts` (voir « Onboarding »).

## Pleine Puissance

Quand le user demande "pleine puissance", "maximum d'agents", "ultracode" ou
une livraison de bout en bout :

- Orchestrer via **Workflow / ultracode** (dizaines de sous-agents concurrents).
- D'abord exploration/review read-only ; ensuite seulement workers avec ownership non chevauchant.
- Writers parallèles : worktrees/branches isolées ou périmètres de fichiers disjoints.
- Aucun agent ne certifie son propre travail (vérificateur indépendant).
- Le parent thread lance les checks, collecte les preuves et décide `SHIP / DON'T SHIP`.
- Lethal trifecta (Rule of Two) : si l'autonomie réunit données privées + contenu non fiable +
  action sortante sans humain, refuser et mitiger (`scripts/lib/rule-of-two.ts`).

## TEACH Résumé

Référence complète : `references/assistant-teach-workflow.md`.

Mode prof socratique : à la fin (ou au milieu) d'une session, vérifier que
l'opérateur **comprend en profondeur** ce qui a été fait — pas un résumé, une
démonstration active.

Principe directeur :

1. **Incrémental** — enseigner étape par étape, confirmer la maîtrise de chaque
   bucket avant d'avancer, jamais tout déverser à la fin.
2. **Restate-first** — lui faire reformuler sa compréhension d'abord, puis combler
   les gaps (eli5 / eli14 / elii à la demande).
3. **Running doc** — checklist vivante dans `<cwd>/.mentor/teach/<date>-<slug>.md`,
   trois buckets : (1) le problème + ses branches, (2) la solution + design + edge
   cases, (3) le contexte large + impacts. Une case se coche quand c'est
   **démontré**, pas expliqué.
4. **Quiz** via `AskUserQuestion` — ouvert ou QCM, position de la bonne réponse
   variée, jamais révélée avant soumission ; montrer le vrai code / debugger si un
   point résiste.
5. **`/goal`** — la session ne se termine pas tant que toute la checklist n'est pas
   démontrée. Verdict final `MAÎTRISÉ` / `MAÎTRISÉ_AVEC_RÉSERVES`.

## INIT Résumé

Référence complète : `references/assistant-init-workflow.md`.

Phases obligatoires :

1. Comprendre le projet par vraie conversation, pas par question générique.
2. Chercher les patterns dans la library locale (résolue automatiquement via
   `SKILL_LIBRARY_DIR` ou par fallback vers `~/Desktop/skill/library`),
   via `strategy-select.ts`, `references/`, et `recall.ts`.
3. **Matérialiser** l'équipe complète (skills + subagents) avec
   `install-toolkit.ts` : il copie réellement les meilleurs SKILL.md/agents
   depuis la library de 7000+ entrées vers `.claude/skills/` et
   `.claude/agents/` du projet cible (et écrit un receipt
   `.claude/TOOLKIT_INSTALLED.json`). C'est cette étape qui répond au
   contrat "équipe complète déployée" — ne pas l'omettre.
4. Compléter avec les skills projet sur-mesure que la library ne couvre pas,
   sous `.claude/skills/` avec `SKILL.md` court et références.
5. Créer/personnaliser les agents `.claude/agents/` avec ownership clair et
   `model: claude-opus-4-8` (install-toolkit force déjà le modèle).
6. Configurer hooks sécurité/qualité/DX/cost safety, commands canoniques, skill-rules.
7. Seeder la mémoire standard : `MEMORY.md`, `user_role.md`, `project_purpose.md`,
   `project_stack.md`, `feedback_conventions.md`, `reference_claude_md.md`,
   `progress.md`, `feature-checklist.md`.
8. Matérialiser la boucle autonome (`.claude/loop.md`, bornée par `loop-controller`) et le
   hook de recall mémoire (`recall-auto`), générés par `generate-config`.
9. Vérifier via scripts pertinents, puis livrer un résumé opérationnel.

Commandes clés :

```bash
bun scripts/detect-project.ts <path>
bun scripts/strategy-select.ts "<brief>" --type=<type> --write=<path>
bun scripts/install-toolkit.ts <path> --keywords="<brief>" --type=<type> \
  --skills=top:8 --agents=top:6 [--dry-run]
bun scripts/generate-config.ts <project-type> <path> '<json-options>'
```

## AUDIT Résumé

Référence complète : `references/assistant-audit-workflow.md`.

Phases obligatoires :

1. Deep scan : version Claude Code, projet, config `.claude/`, tests, CI, mémoire.
2. Scoring 18 sections : CLAUDE.md, response discipline, skills, agents, hooks,
   tools, MCP, mémoire, permissions, plugins, CI/CD, workflow, SDK, optimisations,
   observabilité, sandboxing, checkpointing, token hygiene, version CC.
3. Report & fix : findings par priorité, corrections appliquées si demandé, BEFORE/AFTER.
4. **Phase 4 — Feedback Collection** : demander score 1-5, persister via
   `bun scripts/save-audit-feedback.ts`, et calibrer les futurs audits.

À chaque audit, exécuter le Memory Hygiene Protocol :
`references/assistant-memory-hygiene.md`.

Checks clés :

```bash
bun scripts/audit-project.ts <path>
bun scripts/token-audit.ts <path>
bun scripts/recall.ts --project <slug> --limit 50 "<query>"
bun scripts/validation-layer.ts all --project=<path>
```

## CONSEIL Résumé

Référence complète : `references/assistant-conseil-workflow.md`.

Mode « board business + dev » : regarde **le produit** (pas la config harness comme
`/audit`, pas le build technique comme `/ship100`) avec la franchise d'un co-fondateur
ultra-fort en business ET en dev. Persona non négociable : verdict d'abord, jamais de
flatterie, toujours une décision actionnable. Règle héritée du CLAUDE.md : « fonctionnel »
≠ build vert — la passe FINI exige une preuve directe (navigateur/curl), sinon PAS FINI.

5 passes (1 → 2 → 3∥4 → 5 → 6), orchestrées via Workflow/Agent en parallèle :

1. **Comprendre le produit** — carte produit réelle (code + docs + git, pas le statut auto-déclaré).
2. **Diagnostic 3 casquettes //** — business (monétisation, acquisition, rétention), produit/UX
   (parcours cassés, frictions), dev/tech (archi, sécu, perf, dette). Findings notés impact×effort.
3. **Skill matchmaking** — la réponse à « trouve les meilleurs skills ». Croise findings × skills
   installés × library 12k via `bun scripts/conseil-skill-match.ts <projet> --keywords="..." --json`.
   Sortie classée par ROI : sous-exploités (coût nul) / library à installer / process à enchaîner.
4. **Backlog features (RICE)** — top features avec POURQUOI business + COMMENT dev + skill qui la build.
5. **Gate FINI ?** — DoD produit : chaque parcours promis prouvé end-to-end (build+test+navigateur/curl).
   Verdict FINI / QUASI / PAS FINI + ce qui manque, ordonné. Jamais FINI sur preuve indirecte.
6. **Synthèse** — écrit `<projet>/docs/CONSEIL-<YYYY-MM-DD>.md`, présente verdict d'abord.

Garde-fous : lecture seule par défaut (proposer avant d'appliquer) ; réutiliser
`strategy-select`/`install-toolkit`/`senior-designer`/`qa`/`review` plutôt que dupliquer.

Commandes :

```bash
bun scripts/conseil-skill-match.ts <path> --keywords="<findings>" --top=25 --json
```

## SHOWCASE Résumé

Référence complète : `references/assistant-showcase-workflow.md`.

Flux : brief client, moodboard, détection `simple|medium|premium`, scaffold
`vitrine-seed.ts`, asset pipeline, living review. `/site` reste un alias de
`/init --type=showcase`, pas un nouveau mode primaire.

Commandes :

```bash
bun scripts/vitrine-seed.ts <path> <simple|medium|premium> [brief-path]
bun scripts/detect-complexity.ts docs/BRIEF.md docs/MOODBOARD.md
```

## SENIOR DESIGNER Résumé

Référence complète : `references/assistant-senior-designer.md`.

`/sd` orchestre **6 spécialistes en parallèle** (via tool `Agent`) pour amener un
site Next.js au niveau pro senior. Trois modes :

- `audit` (défaut) — lecture seule, livre `docs/SENIOR-DESIGN-REVIEW.md`
- `apply` — applique les fixes sûrs avec confirmation
- `scaffold` (= `/site --senior`) — extension de `/site` avec patterns dès le seed

Les 6 spécialistes (ownership disjoint) :

1. **moodboard-analyzer** — scrape les URLs ref, extrait palette/fonts, écrit MOODBOARD enrichi
2. **design-tokens-gen** — génère `globals.css @theme` (colors ≤ 8, scale modulaire, radius différenciés, easings nommés)
3. **art-direction** — guidelines photos (`.photo-warm`, `.photo-cinema`), grain calibré, figcaption patterns
4. **kinetic-type** — copie 1-2 patterns dans `src/components/motion/` (SplitLines obligatoire, +ScrambleText/VariableProximity selon tag)
5. **micro-interactions** — LinkUnderlineSweep, MagneticButton, CustomCursor (3 max par site)
6. **design-review** — Playwright + 7 checklists senior + AI-slop grep, score /100, verdict SHIP/NEEDS-FIX/NOT-SENIOR-GRADE

Doctrine non-négociable : 7 couleurs max, 3 fonts max, 1 effet kinetic hero max,
motion = ponctuation pas symphonie.

Commandes :

```bash
bun scripts/senior-designer.ts <path> --mode=audit
bun scripts/senior-designer.ts <path> --mode=apply --yes
bun scripts/design-review.ts http://localhost:3000
bun scripts/moodboard-analyzer.ts docs/MOODBOARD.md
bun scripts/design-tokens-gen.ts <path> --dry-run
bash scripts/ai-slop-grep.sh <path>
```

Templates production-ready dans `templates/showcase/senior-designer/` :
`kinetic-type/`, `micro-interactions/`, `motion/`, `tokens/`, `art-direction/`,
`checklists/`.

## TOKEN-DOCTOR Résumé

Référence complète : `references/assistant-token-doctor.md`.

Déclenche si le user parle de coût, bloat, compaction, ou si Token Hygiene < 5/10.
Mesurer, identifier les offenders, proposer les économies, appliquer seulement les
fixes acceptés, puis re-mesurer.

## Mémoire

Référence complète : `references/assistant-memory-hygiene.md`.

Règles :

- Mémoire = WHY, contraintes, historique durable. `CLAUDE.md` = WHAT.
- Un topic par fichier ; types autorisés : `user`, `feedback`, `project`, `reference`.
- `MEMORY.md` est un index court, sans frontmatter.
- Supprimer l'éphémère ; fusionner les doublons ; le code gagne contre la mémoire stale.
- Corrections user : `bun run memory:corrections <capture|list|graduate|prune>`.
- Unified Memory Bridge : `bun run memory:bridge` (`index-memories.ts`), puis
  `bun scripts/recall.ts --source <auto-memory|vault|master-vault|corpus> "<query>"`.
  Recall just-in-time automatique via le hook `recall-auto` (UserPromptSubmit).
- Certificat de preuve : `bun scripts/assistant-proof.ts <project> --write`.

> Les surfaces de coaching continu (dashboards, boucle autonome)
> ne font pas partie de cette version publique d'ORCA.

## Ressources

- Docs CC : `https://code.claude.com/docs/en/` si un fait peut avoir changé.
- Corpus local *(optionnel)* : résolu via `SKILL_LIBRARY_DIR` — un dossier `library/`
  contenant `skills/ hooks/ subagents/ plugins/`. Sans lui, INIT installe une baseline statique.
- Références internes principales :
  - `references/assistant-excellence-standards.md` *(matrice d'excellence — couverture non négociable des angles morts)*
  - `references/assistant-large-codebase-schema.md` *(baseline — à lire d'abord)*
  - `references/assistant-onboarding-interview.md` *(interroger d'abord sur un nouveau projet : brief → questions → outils → mémoire → /goal·/loop)*
  - `references/assistant-tech-lifecycle.md` *(Lifecycle Conductor — tout ce qu'une top boîte tech prend en compte, du jour 0 au jour N)*
  - `references/lifecycle/` *(une Definition of Done par type produit : web-fullstack, api-backend, bot-agent, cli-tool, website-showcase, design-only — le type `unknown` n'a pas de DoD)*
  - `references/workflow-playbooks/RUBRIC.md` *(benchmark vivant : comment juger un workflow + 3 playbooks testables)*
  - `references/assistant-senior-designer.md` *(orchestrateur 6 spécialistes design)*
  - `references/claude-code-internals.md`
  - `references/claude-code-features-checklist.md`
  - `references/best-practices.md`
  - `references/agents-patterns.md`
  - `references/hooks-catalog.md`
  - `references/memory-systems.md`
  - `references/commands-guide.md`
  - `references/skills-decision-matrix.md`
- Scripts clés : `organise` *(cold-start /assistant — à lancer en premier)*, `lifecycle-audit` *(cold-start lifecycle — projet vs sa DoD)*, `audit-project`, `detect-project`, `generate-config`,
  `strategy-select`, `install-toolkit`, `quality-gate`, `self-check`, `loop-controller` *(bornes dures de boucle)*,
  `lib/rule-of-two` *(garde lethal trifecta)*, `recall-auto` *(recall just-in-time)*, `memory-corrections`, `validation-layer`, `assistant-proof`.

## Completion

- **DONE** — phases exécutées, projet équipé et vérifié.
- **DONE_WITH_NOTES** — terminé avec caveats listées.
- **BLOCKED** — bloqué, dire exactement quoi.
- **NEEDS_INPUT** — décision utilisateur requise.
