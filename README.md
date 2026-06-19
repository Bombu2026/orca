# ORCA

**A permanent architect for your AI-assisted projects — a [Claude Code](https://www.claude.com/product/claude-code) skill.**

Drop ORCA into any project and ask it to organise your dev. It scans the repo, returns a
scored verdict, shows the gaps that actually block you, and prescribes the right tools. You
never pick a mode — it deduces one.

```
  /assistant
      │  scan ~5s  (detect-project + audit-project)
      ▼
  ┌─────────────────────────────────────────────────────────────┐
  │  "Your repo is 6/10 ready to ship with agents."             │
  │  3 blocking gaps:   1. …   2. …   3. …                       │
  │  → Action #1  (fix it? [Enter])                              │
  │  Prescription: Playwright + Context7 + frontend-design + …  │
  └─────────────────────────────────────────────────────────────┘
      │  writes QUALITY_SCORE.md into the project (drift visible next run)
      ▼
  deduced route:  SEED · BOOTSTRAP · NEXT-GAP   (DIRTY-FIRST if the git tree is dirty)
```

> Interactive output is in **French** (the author's working language); code, identifiers and
> this README are in English.

---

## What is a Claude Code skill?

A *skill* is a folder Claude Code loads on demand: a `SKILL.md` definition plus supporting
scripts, references and templates. When its triggers match what you ask, Claude Code pulls the
skill into context and follows it. ORCA is such a skill — its entry command is **`/assistant`**.
It is **not** a runtime app or an npm package; it is tooling that configures *other* projects.

## Surface = 3 commands

| Command | Role |
|---|---|
| `/assistant` | **Deterministic cold-start.** Scan → score `/10` → 3 blocking gaps → one action → stack→tools prescription. The tool decides whether to seed, bootstrap, audit, or close the next gap. |
| `/ship100` | **Hard delivery gate:** proofs, QA, E2E, review → `SHIP / DON'T SHIP`. |
| `/conseil` | **Opt-in product layer:** business+dev board, highest-leverage features (RICE), an honest "is it finished?" verdict backed by end-to-end proof. |

Everything else (`init`, `audit`, `site`, `senior-designer`, `teach`, `token-doctor`) is a
**sub-routine** triggered automatically by `/assistant` according to context — never something
you have to know.

## How it works

- **Deterministic core.** `scripts/organise.ts` is the heart of `/assistant`: it detects the
  project type, audits the Claude Code configuration across 18 weighted dimensions, computes a
  Repo Readiness Score, surfaces the 3 blocking gaps and the single next action, and routes to
  one of four branches (`SEED` / `BOOTSTRAP` / `NEXT-GAP` / `DIRTY-FIRST`). No LLM guesswork in
  the routing — it is a pure function of the repo state.
- **Lifecycle conductor.** ORCA does not only configure the Claude Code harness; it tracks the
  full **product** lifecycle (auth, RBAC, GDPR, CI/CD, monitoring, perf, a11y, backups…)
  against a **Definition of Done per project type**, and gives you *one* next step at a time,
  explained for a non-technical operator. It never says "done" on a green build — only on
  direct proof (a real browser run, a real `curl` with persisted state).
- **Multi-mission & fenced.** Each mission is a declarative manifest
  (`scripts/missions/*.mission.ts`) with an explicit write-scope. A two-layer **scope-fence**
  (a `PreToolUse` hook + a `resolveTarget` guard) enforces, by construction, that a mission can
  only write inside its own zone — and never into ORCA's own tree.
- **Bounded autonomy.** `scripts/loop-controller.ts` gives hard loop bounds
  (`DONE / MAX_TURNS / DEADLINE / NO_PROGRESS`); `scripts/lib/rule-of-two.ts` refuses unattended
  autonomy when private-data + untrusted-content + outbound-action coexist (lethal-trifecta guard).

## Prerequisites

- **[Bun](https://bun.sh) 1.2+** — the only runtime. Every script is TypeScript, run directly,
  with **zero npm dependencies** and no build step.
- **[Claude Code](https://www.claude.com/product/claude-code)** — to actually invoke the skill.
- *(optional)* A **skill library** for the `install-toolkit` step — a directory containing
  `skills/ hooks/ subagents/ plugins/`, pointed to by `SKILL_LIBRARY_DIR`. Without it, a static
  baseline is installed.

## Install

```bash
# 1. Clone
git clone <your-fork-url> orca
cd orca

# 2. Install it as a Claude Code skill (symlink into your skills dir)
ln -s "$(pwd)" ~/.claude/skills/assistant

# 3. Sanity check (no install needed — Bun runs the TypeScript directly)
bun run check        # documentation ↔ code self-check (231 assertions)
```

> The Claude Code skill directory stays named `assistant` and the command is `/assistant` — both
> predate the ORCA rebrand and are kept so existing setups (and the recall hook) keep working.

Then, in any project, ask Claude Code to "organise my dev" (or type `/assistant`).

## Usage

```bash
bun run organise "$(pwd)"          # the cold-start, on any project (scan → score → gaps → action)
bun run lifecycle "$(pwd)"         # product-lifecycle audit → next product step → LIFECYCLE.md
bun scripts/detect-project.ts .    # detect type / stack / framework (JSON)
bun scripts/audit-project.ts .     # score a Claude Code config, 0–10 per dimension (JSON)
bun run missions                   # list registered missions
bun run ship:check <dir>           # the /ship100 delivery gate
```

## Architecture

| Path | Role |
|---|---|
| `SKILL.md` | The skill definition Claude Code loads. Kept lean; deep content lives in `references/`. |
| `scripts/` | Bun + TypeScript, zero build. `organise.ts` (cold-start dispatcher), `detect-project.ts`, `audit-project.ts`, `lifecycle-audit.ts`, `generate-config.ts`, `loop-controller.ts`, `validation-layer.ts`, `missions/` + `lib/scope.ts` (the fence). |
| `references/` | The knowledge base consumed during INIT/AUDIT — Claude Code internals, best practices, feature checklist, the product-lifecycle corpus, one Definition of Done per project type. |
| `templates/` | `{{PLACEHOLDER}}` starter templates: CLAUDE.md variants, agents, hook sets, canonical commands, the autonomous loop. |
| `tests/` | The behavioural test suite (`bun run test`) — real stdin payloads and exit-code tables, not file-existence checks. |
| `.claude/` | ORCA's own Claude Code config (hooks + commands + the shareable `settings.json`). |

## Development

```bash
bun run check        # self-check: every documented claim must match the code (231 assertions)
bun run test         # full behavioural suite (smoke, missions, loop-controller, ship-gate, …)
bun run quality      # self-check + smoke + audit threshold + token-hygiene gate
```

The project **dogfoods** itself: it never works on its own dirty git tree, and "functional"
means a script was actually executed — never a green build alone.

## License

[MIT](./LICENSE).

## Status

A personal, evolving Claude Code skill, shared as-is. It is opinionated (Bun-first, a specific
default stack, French interactive output) and assumes you run it from `~/.claude/skills/assistant`.
Use it as a reference for skill design, or fork and adapt it to your own conventions.
