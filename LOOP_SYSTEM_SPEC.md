# LOOP_SYSTEM_SPEC — câbler le loop engineering dans ORCA

> Spec écrite AVANT l'implémentation (dogfood de la recherche état-de-l'art : on élucide le
> QUOI avant le COMMENT, on écrit le hors-scope explicite, et on rend la condition de fin
> machine-vérifiable). Source : audit `ORCA vs SOTA loop-engineering` (8 piliers).

## 1. Outcomes (le QUOI / POURQUOI)

Transformer ORCA d'un système qui *connaît* la doctrine loop-engineering (elle dort dans
`references/`) en un système qui l'**applique pour lui-même** ET l'**installe dans les projets**
qu'il configure. Trois propriétés visées :

1. **Comprendre avant d'agir** — la phase d'interview devient une vraie phase CLARIFY :
   gap-driven réelle, hors-scope + décisions figées capturés, paraphrase-confirm + règle d'arrêt,
   sortie dans un artefact structuré (6 cases) au lieu de prose libre.
2. **Boucler avec des bornes dures** — un contrôleur de boucle non modifiable par l'agent
   (turns / wall-clock / non-progrès), livré aux cibles via `.claude/loop.md`.
3. **Autonomie sûre** — refuser l'autonomie longue quand la lethal trifecta (A données privées
   + B contenu non fiable + C action sortante) est réunie sans humain (Rule of Two), et fermer
   le trou MCP-write du scope-fence.

## 2. In-scope (ce qu'on construit)

| # | Composant | Fichiers |
|---|---|---|
| C1 | Interview → phase CLARIFY (gap-driven + 2 cases + paraphrase/stop-rule + template brief) | `scripts/lib/onboarding.ts`, `templates/memory/PROJECT_BRIEF.template.md`, `references/assistant-onboarding-interview.md` |
| C2 | Contrôleur de boucle à bornes dures + matérialisation `.claude/loop.md` | `scripts/loop-controller.ts`, `templates/loop.md`, `scripts/generate-config.ts` |
| C3 | Rule of Two / lethal-trifecta, branché sur l'Autonomy Card | `scripts/lib/rule-of-two.ts`, `scripts/lib/autonomy.ts` |
| C4 | Fermer le trou MCP-write du scope-fence | `scripts/missions/scope-fence.ts`, `.claude/settings.local.json` |
| C5 | Recall mémoire just-in-time en hook `UserPromptSubmit` | `scripts/recall-auto.ts`, `.claude/settings.local.json` |
| C6 | Intégrité du gate : test null-agent (proof fabriqué = FAIL) | `tests/null-agent.ts`, `scripts/ship-check-gate.ts` |

Chaque composant : code + doc synchronisée + test comportemental + assertions self-check.

## 3. Out-of-scope (frontière négative explicite)

- **PAS** de refonte du moteur d'auto-amélioration (hors arbre, hors scope de cette spec).
- **PAS** la mission `persona-twin` elle-même (Mois 5) — on livre seulement le prérequis (C4) qui la débloque.
- **PAS** les primitives serveur context-engineering (clearing/Tool Search/code-mode) — pilier P4, batch ultérieur.
- **PAS** d'agent `gui-verifier` ni de boucle screenshot-act (P7.3) — batch ultérieur.
- **PAS** de `git commit`/`push` — interdits sans demande explicite.

## 4. Contraintes & décisions figées

- Bun + TypeScript, **zéro dépendance npm** (built-ins seulement) — invariant du repo.
- **Aucune écriture dans `CORE_DENYLIST`** par une mission ; `loop-controller`/`rule-of-two`/`recall-auto` sont du code exécutable hors interception (comme `merge-gate`).
- **Idempotence** : un tour de boucle sans gap se termine en une ligne sans rien modifier.
- **Honnêteté de capacité** : `/goal` reste gaté par version CC ; aucun faux « armed ».
- Doc et code **synchronisés** (le self-check vérifie que les claims de doc matchent le code).

## 5. Découpage en tâches

C1 → C4 → C3 → C2 → C5 → C6 (interview d'abord = focus user ; fence ensuite = sécurité ; puis
boucle, mémoire, intégrité). Checkpoint vert obligatoire après chaque : `bun run check` (≥234) +
le test du composant + `bun run test` à la fin.

## 6. Critères d'acceptation (Given/When/Then, machine-vérifiables)

- **C1.a** *Given* `type=web-fullstack` *When* `onboarding --auth=Better-auth` *Then* la question `data-sensitivity` a `kind="confirm"` (et `kind="question"` sans `--auth`).
- **C1.b** *Given* n'importe quel type *When* interview *Then* `out-of-scope` ET `fixed-decisions` sont émis ; *When* health-check *Then* `clarify === null` et 0 question.
- **C1.c** *Given* interview *Then* `plan.clarify` porte `paraphrase` + `stopRule` + `gate` non vides.
- **C2.a** *Given* `loop-controller tick --session S --gaps 3` répété *When* `turns > max` OU `deadline` dépassé OU `NO_PROGRESS` *Then* exit ≠ 0 avec verdict `STOP:<raison>`.
- **C2.b** *Given* `generate-config web-fullstack <dir>` *Then* `<dir>/.claude/loop.md` existe.
- **C3.a** *Given* A∧B∧C sans HITL *When* `ruleOfTwo` *Then* verdict `REQUIRE-HUMAN` ; *Given* ≤2 *Then* `ALLOW`.
- **C3.b** *Given* `type=bot-agent` autonomie demandée *When* Autonomy Card *Then* un levier `rule-of-two` bloquant apparaît si trifecta.
- **C4.a** *Given* mission armée *When* hook reçoit un écrivain MCP (`mcp__mcpvault__write_note`, Drive `create_file`…) *Then* exit 2 (fail-closed : un store externe est hors du périmètre filesystem d'une mission) ; *When* une LECTURE MCP (`read_note`, `search_notes`) *Then* exit 0. _(L'autorisation d'écritures MCP ciblées est déléguée à la future mission persona via un périmètre MCP explicite — ici on ferme le trou, on ne l'ouvre pas sélectivement.)_
- **C5.a** *Given* un prompt *When* `recall-auto` *Then* sortie JSON `hookSpecificOutput.additionalContext` (ou vide, jamais d'erreur), borné (timeout, limit 3).
- **C6.a** *Given* un `SHIP_PROOF.json` bien formé mais fabriqué (aucun travail réel) *When* `ship-check-gate` *Then* verdict ≠ `SHIP`.
- **Global** : `bun run check` et `bun run test` verts ; les nouveaux scripts ont chacun un test dans la chaîne `package.json`.

## 7. Backlog d'amélioration continue (loop self-improve)

> Câblé par `/loop` (session `loop-self-improve`, borné par `loop-controller`). UN gap par cycle :
> mini-spec (outcome · in/out-scope · critère Given/When/Then) → code → test comportemental → doc
> synchronisée → assertion self-check → commit atomique vert. Du plus haut levier au plus bas.

- [x] **G1 — Evals première classe (LLM-backed).** Capacité `evals` dans `lifecycle-audit` (bloquante
  bot-agent ; api-backend si LLM-backed seulement, via `appliesWhen` — pas de faux gap CRUD) +
  `templates/evals/` (README doctrine + `example.eval.ts` runnable, cas attendus ET interdits) +
  `generate-config` copie `evals/` et injecte `## Evals` dans le CLAUDE.md des types LLM-backed.
  _Gain : +3 assertions self-check, +1 bloc de test lifecycle (5 asserts), gabarit vert 3/3._
- [x] **G2 — Primitives context 2026** dans `generate-config` : runtime `context.ts` (PostToolUse Bash
  `tool-output-trim` >200 lignes via `updatedToolOutput` v2.1.121+ ; PreCompact `precompact-dump`
  → `.claude/local/session-state.json`) + `context.json` mergé + `ENABLE_TOOL_SEARCH=1` posé en
  `settings.env` quand `mcpServerNames(dir).size > 2` (chaque MCP coûte 5-10 % de contexte).
  _Gain : +4 assertions self-check, +3 tests hooks-runtime (trim 300/10 + dump) + 1 bloc seuil smoke isolé._
- [x] **G3 — Constitution always-on** : `generate-config` injecte une section `## Non-négociables`
  dans le CLAUDE.md généré (locks universels + locks de stack dérivés d'`opts` + `fixedDecisions`/
  `outOfScope` confirmés en interview) — injectée chaque tour, plus seulement dans le PROJECT_BRIEF.
  Doctrine onboarding mise à jour (passage interview→generate-config). Showcase loggé hors-scope.
  _Gain : +1 assertion self-check, +6 asserts smoke (section + injection interview + lock stack)._
- [x] **G4 — feature-list.json verrouillé** par `scripts/spec-gate.ts` (PreToolUse) : `evaluateSpecGate`
  pur + hook (Write/Edit/MultiEdit) — `passes` seul mutable, `tests`/`description` immuables, retrait
  interdit, ≤1 false→true/invocation, flip→true exige un arbre merge-clean. Copié dans `.claude/scripts/`
  + câblé via `templates/hooks/spec-gate.json` ; inerte hors feature-list.json.
  _Gain : +6 assertions self-check, +1 test (14 asserts : 4 invariants × cas + bout-en-bout git)._
- [x] **G5 — Sandbox OS + cost-safety hooks** : `generate-config` pose `sandbox.filesystem.deniedPaths`
  (secrets `~/.ssh|~/.aws|gcloud|gnupg|kube|Keychains`, union jamais écrasement — universel) ;
  runtime `cost-safety.ts` (`bulk-api-guard` >10 appels API → exit 2 ; `agent-spawn-guard` >5 spawns
  `claude -p` → exit 2 ; boucle+API → avertit) câblé en PreToolUse Bash, mergé pour LLM-backed
  seulement (jamais sur le Task du dev — préserve « max agents »).
  _Gain : +4 assertions self-check, +5 tests hooks-runtime (curl/xargs) + 3 asserts smoke (sandbox + gating)._
- [x] **G6 — Validité temporelle mémoire** : `recall-auto` joint `memory_meta` (mtime), re-trie
  pertinence-par-buckets puis récence, affiche l'âge (« il y a Nj »), et EXCLUT les faits `superseded_by`
  / `valid_from` futur (frontmatter borné). `scan-memories.detectSupersededFacts` flague à thème égal
  toute version plus ancienne (par `date:` sinon mtime) + tout `superseded_by` explicite. Convention
  documentée (references/memory-systems.md).
  _Gain : +6 assertions self-check, +7 asserts recall-auto (22/22), +1 test scan-memories (7 asserts)._
- [x] **G7 — Orchestration enforced** : `audit-project` SCORE le split read/write des agents (least-privilege,
  `agentTools`) + isolation `context:fork/summary` (pénalités + findings). `organise` émet un `spawnPlan`
  exécutable (agent + prompt concret + scopes read/write DISJOINTS, read-only + 1 rapport/auditeur) ;
  SKILL.md passe de « à lancer » à « SPAWN maintenant ». Les 7 templates review/audit déclarent
  `context: fork`. _Rejet loggé : un script déterministe ne spawn pas de sous-agent LLM (honnêteté de
  capacité) — il produit le plan, l'orchestrateur exécute._
  _Gain : +6 assertions self-check, +1 test (orchestration 10/10), agents 7 templates + dogfood reviewer._
- [x] **G8 — Boucle GUI screenshot→act** : `templates/agents/gui-verifier.md` (Opus, `context: fork`) —
  protocole screenshot AVANT → act (click/fill) → screenshot APRÈS → diff, + design-review interactif
  état-par-état (hover/focus/responsive/AI-slop), sortie `GUI_REVIEW.md`. Généré pour web-fullstack
  (`GUI_VERIFIER_TYPES`, generate-config) et website-showcase (vitrine-seed) ; absent pour cli/api.
  _Gain : +3 assertions self-check, +3 asserts smoke (web/vitrine présents, cli absent)._
- [x] **G9 — loop-controller auto-calibré** : `calibrateMaxTurns` (pur, exporté) + commande `calibrate`
  (lit `organise --json` sur stdin) = `max(5, blockers critiques + auditeurs manquants + capacités DoD
  bloquantes)`. `templates/loop.md` calibre le plafond au 1er tour (`organise --json | calibrate` →
  `--max-turns`). Additif : tick/status/reset inchangés, sensibles verts (loop-controller 20/20,
  missions 61/61, security). _Gain : +3 assertions self-check, +5 asserts loop-controller (pur + CLI)._
- [x] **G10 — Recall scopé projet** : `recall-auto` reçoit le `cwd`, dérive le slug (`cwdSlug`), et
  BOOSTE les mémoires du projet courant (`isLocal`) — à pertinence égale, local d'abord, puis récence.
  Boost « quand pertinent », jamais un filtre dur (les conventions globales restent réinjectables).
  _Gain : +1 assertion self-check, +3 asserts recall-auto (25/25)._
