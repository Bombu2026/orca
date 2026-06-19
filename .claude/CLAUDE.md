# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

**ORCA** is a Claude Code skill (not a traditional codebase). Symlinked at `~/.claude/skills/assistant` (the skill dir and `/assistant` command predate the rebrand and are kept for stability).

**Principe organisateur unique** : *le context window est LA contrainte*. Tout en découle —
subagents pour isoler le contexte, `/clear` entre tâches, skills chargés on-demand,
CLAUDE.md court (<200 lignes, always-on), MCP ≤2 (chacun coûte 5-10% de contexte).
Quand un arbitrage se pose, trancher en faveur de l'économie de contexte.

**Philosophie user-facing** : 3 commandes, le mode est *déduit* pas *choisi*.
- **`/assistant`** — cold-start déterministe (`scripts/organise.ts`) : scan → verdict /10 →
  3 gaps bloquants → 1 action → prescription stack→outils. Route en SEED / BOOTSTRAP /
  NEXT-GAP (ou DIRTY-FIRST si l'arbre git est sale).
- **`/ship100`** — gate de livraison dur : preuves, QA, E2E, review, `SHIP / DON'T SHIP`.
- **`/conseil`** — couche produit opt-in : board business+dev, features RICE, verdict « fini ? ».

**Sous le capot** (sous-routines, jamais des commandes à connaître) : INIT, AUDIT (+ TOKEN-DOCTOR
auto), SITE/SENIOR-DESIGNER, TEACH, LIVE. Complexité cachée derrière le dispatch.

**Dogfood non négociable** : ORCA audite la config des autres — il ne travaille jamais
sur son propre arbre git sale. Avant toute refonte interne : 0 fichier non commité. « Fonctionnel »
= script exécuté réellement, pas un build vert.

**Cold-start** : `bun run organise <path>` (`scripts/organise.ts`) est le cœur de `/assistant` —
scan → Repo Readiness Score /10 → 3 gaps → 1 action → prescription stack→outils, écrit
`QUALITY_SCORE.md` dans le projet cible.

**ORCA est MULTI-MISSION et ÉVOLUTIF.** l'opérateur lui confie des missions de natures
différentes (organiser un dev, parler en son nom via le jumeau, ausculter la machine, et d'autres
à venir) ET fait évoluer son code en continu, chaque mois. Deux exigences en découlent, non
négociables :
- **Chaque mission est réifiée, comprise et fencée.** Une mission = un manifeste déclaratif
  (`scripts/missions/*.mission.ts`, type `MissionManifest`) : `intent` + `triggers` (compréhension,
  via Mission Card confirmée avant tout effet), `scopeKind` + `isolation` (contextes jamais mélangés),
  `allowedWrites`/`deniedWrites` (la mission n'écrit QUE dans sa zone). Le **scope-fence** à deux
  couches l'applique par construction, pas par discipline : hook `PreToolUse` (`scripts/missions/scope-fence.ts`,
  intercepte Write/Edit/Bash du LLM) + garde `resolveTarget` côté scripts (`scripts/lib/scope.ts`).
  `${ASSISTANT_DIR}` est toujours interdit à l'écriture (dogfood enfin codé). Routage par INTENTION
  (quelle mission) PUIS par ÉTAT (quelle branche, dans `organise.ts`) — on empile, on n'écrase pas.
- **Chaque mission est retirable.** Tout manifeste porte `removable: true` + `restore:` (procédure
  inverse livrée dès la création — le découplage se pense d'emblée). Ajouter la mission N+1 (un `*.mission.ts`,
  chargé par glob via `registry.ts`) ne touche jamais les missions 1..N. Une mission isolée se
  supprime sans dette. Statut Mois 1 : socle (fence + registre + `dev-organizer`) livré ; le routeur
  d'intention + Mission Card (Mois 2), `machine-health` (Mois 3), recall scopé (Mois 4) et
  `persona-twin` (Mois 5) suivent. Voir `CHANGELOG.md`.

The skill can optionally mine a community library (resolved via `SKILL_LIBRARY_DIR` env var — a directory of `skills/ hooks/ subagents/ plugins/`) to find proven patterns for each project type. `install-toolkit.ts` materializes the top picks into `.claude/skills/` and `.claude/agents/` of the target project. Without a library, INIT installs a static baseline.

## Commands

```bash
bun run check                            # Verify ORCA documentation and generated-workflow assertions
bun run quality                          # Run self-check + smoke + audit threshold + token audit
bun scripts/audit-project.ts <path>      # Score a project's CC config (0-10 per dim)
bun scripts/detect-project.ts <path>     # Detect project type/stack/framework
bun scripts/generate-config.ts <project-type> <path> '<json-options>'  # Generate .claude/ (CLAUDE.md, hooks, agents, commands, loop.md)
bun scripts/loop-controller.ts tick --session <id> --gaps <n>  # Hard-bounded autonomous loop (DONE/MAX_TURNS/DEADLINE/NO_PROGRESS)
bun scripts/lib/rule-of-two.ts --deps=<csv> --type=<type>      # Lethal-trifecta / Rule of Two safety verdict
bun scripts/spec-gate.ts                 # PreToolUse lock for feature-list.json (SDD: passes-only mutable, tests immutable, 1 flip/call, merge-clean)
bun scripts/recall-auto.ts               # Just-in-time memory recall hook (UserPromptSubmit)
bun scripts/memory-corrections.ts <cmd>  # Capture/list/graduate/prune user corrections into memory queues
bun scripts/assistant-proof.ts <path>    # Produce ORCA_PROOF JSON for generated/audited projects
bun scripts/organise.ts <path>           # /assistant cold-start: scan -> score -> 3 gaps -> 1 action -> prescription (+ prochaine étape produit via lifecycle-audit)
bun scripts/lifecycle-audit.ts <path>    # cold-start lifecycle: type -> DoD applicable -> couverture -> UNE prochaine étape produit, écrit LIFECYCLE.md
bun run missions                         # List registered missions (scripts/missions/*.mission.ts, loaded by glob)
bun run missions:validate                # Validate every mission manifest (no open fence, restore present)
bun run scope <arm|disarm|status|check>  # Mission scope-fence engine (scripts/lib/scope.ts) — arm/check write-scope per session
bun scripts/validation-layer.ts <mode>   # Fast invariant checks for templates/generated/runtime/ship
bun scripts/token-audit.ts <path>        # Measure context overhead + token hygiene
bun scripts/strategy-select.ts "<brief>" --type=<type> --write=<path>  # Rank best local skills/agents/hooks
bun scripts/mcp-hygiene.ts               # Dry-run global MCP pruning plan
bun scripts/plugin-hygiene.ts            # Dry-run global plugin pruning plan
bun scripts/scan-memories.ts             # Cross-project memory pattern scan
```

All scripts run directly with `bun` — TypeScript, zero build step, no dependencies beyond Bun built-ins.

## Architecture

1. **`SKILL.md`** (~16KB, ~333 lines) — the actual skill definition loaded by Claude Code. INIT phases 1-8, AUDIT phases 1-4, TOKEN-DOCTOR phases 1-5. Keep under 500 lines; use `references/` for deep content.
2. **`references/`** — ~28 knowledge base documents consumed during INIT/AUDIT phases (CC internals, best practices, feature checklist, hooks catalog, agent patterns, CLAUDE.md guide, skills decision matrix, commands guide). Includes the **Lifecycle Conductor** corpus: `assistant-tech-lifecycle.md` (product lifecycle A→Z catalogue) + `lifecycle/<type>.md` (one Definition of Done per detected project type) + `assistant-excellence-standards.md` (the operator's blind-spots). These are authoritative — kept in sync with Claude Code source.
3. **`templates/`** — starter templates with `{{PLACEHOLDER}}` syntax: CLAUDE.md variants, agent types, hook sets (incl. `hooks/memory.json` recall), `memory/PROJECT_BRIEF.template.md` (6-case spec), `loop.md` (autonomous tour), REVIEW.md, and canonical commands (`/commit`, `/fix`, `/test`, `/refactor`, `/pr`, `/explain`, `/review`, `/epct`, `/ship100`).
4. **`scripts/`** — Bun TS scripts. `generate-config.ts` merges hook JSON arrays into `.claude/settings.local.json` and materializes `.claude/loop.md` + the recall hook; `loop-controller.ts` enforces hard loop bounds; `lib/rule-of-two.ts` is the lethal-trifecta safety gate; `recall-auto.ts` is the just-in-time memory recall hook; `memory-corrections.ts` captures user corrections into reviewable memory queues; `validation-layer.ts` runs fast invariant checks; `organise.ts` is the `/assistant` cold-start dispatcher; `lifecycle-audit.ts` is the product-lifecycle cold-start (type → applicable DoD → next product step → `LIFECYCLE.md`), wired into `organise.ts` on NEXT-GAP/BOOTSTRAP and generating the 4 baseline auditors via `generate-config.ts`.
5. **`scripts/missions/` + `scripts/lib/scope.ts`** — the multi-mission layer. `types.ts` (the `MissionManifest` contract), `registry.ts` (glob-loads `*.mission.ts`, no central list), `*.mission.ts` (one declarative manifest per mission — `dev-organizer` today), `scope-fence.ts` (PreToolUse hook, layer A). `lib/scope.ts` is the shared fence engine (canonicalize, glob-match, per-session arm/disarm, `resolveTarget` dogfood guard, layer B). Self-contained + removable; coupled to core only via the hook (settings) and `resolveTarget` in `organise.ts`. Tested by `tests/missions.ts` (real stdin payloads, not file-existence).

## Memory bridge & proof

Core memory tooling: the Unified Memory Bridge (`index-memories.ts` / `recall.ts`, `bun run memory:bridge`)
indexes project memory (and optional external notes) into SQLite FTS5 for just-in-time recall, and the
proof certificate (`assistant-proof.ts`) produces an `ORCA_PROOF.json` used by `/audit` and `/ship100`.

## Conventions

- Scripts: Bun + TypeScript, no build, no npm deps
- Templates: `{{PLACEHOLDER}}` substitution
- Agent definitions: **always** `model: claude-opus-4-8` (explicit version — bare `model: opus` alias deprecated June 15 2026)
- High-power orchestration: via **Workflow / ultracode** (read-only mapping first, then disjoint write scopes, then independent review). Lethal-trifecta guard (`lib/rule-of-two.ts`) refuses unattended autonomy when private-data + untrusted-content + outbound-action coexist.
- Text output: French, code/identifiers in English
- Response discipline: accuracy over approval; correct weak premises directly; state `unknown` when evidence is missing; use confidence labels (`high` / `medium` / `low` / `unknown`) for uncertain judgments; avoid flattery and diplomatic padding.
- Reference docs are authoritative — never speculate, verify against CC source before editing
- Cost safety hooks: required for projects that use `claude -p` as AI engine (PreToolUse guards for bulk API calls >10 and agent spawns >5)

## Tool Preferences

- Use Glob/rg-style file discovery before slower shell scans.
- Use Grep/rg for text search; avoid broad `grep -r` on large trees.
- Use parallel reads when inspecting independent files.
- Use Plan mode for multi-step audits or generation work.
- Use the Agent tool for bounded sidecar research, review, and QA tasks.
- Keep TodoWrite/current checklist state accurate during long implementation passes.

## Key Files to Read First

- `SKILL.md` — the skill definition itself; phases 1-8 (INIT) + phases 1-3 (AUDIT)
- `references/claude-code-features-checklist.md` — exhaustive 13-section CC feature list used in AUDIT scoring
- `references/claude-code-internals.md` — how CC works (hooks, skills loading, permission modes, prompt cache)
- `references/best-practices.md` — Trail of Bits + GSD + ECC + gstack patterns
- `CHANGELOG.md` — recent changes

## Dependencies

- **Runtime**: Bun 1.2+ only
- **External library** (optional): resolved via `SKILL_LIBRARY_DIR` — a directory of `skills/ hooks/ subagents/ plugins/`. Used by INIT phase 2 (intelligence gathering) and phase 3 (install-toolkit). Without it, a static baseline is installed.
- **No npm packages** — scripts use Bun built-ins + shell commands (`gh api`, `git`)
