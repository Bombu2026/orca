# Changelog

All notable changes to ORCA are documented here. ORCA is the public release of a personal
Claude Code skill (developed under the internal name "Assistant"); the skill command stays
`/assistant` for stability.

## 1.0.0 — First public release

First public, self-contained release. What ORCA does:

### Deterministic cold-start
- **`scripts/organise.ts`** — the `/assistant` entry point. Detects the project type, audits the
  Claude Code configuration across weighted dimensions, computes a Repo Readiness Score, surfaces
  the 3 blocking gaps and the single next action, and routes to one of
  `SEED / BOOTSTRAP / NEXT-GAP / DIRTY-FIRST`. The routing is a pure function of repo state — no
  LLM guesswork. Writes `QUALITY_SCORE.md` into the target project so drift is visible next run.
- **`scripts/detect-project.ts` / `scripts/audit-project.ts`** — typed detection (type / stack /
  framework) and per-dimension scoring, both JSON-first.

### Lifecycle conductor
- **`scripts/lifecycle-audit.ts`** — maps a project against a Definition of Done per project type
  (`references/lifecycle/<type>.md`), returns the single next product step, writes `LIFECYCLE.md`.
  Wired into `organise.ts` on NEXT-GAP / BOOTSTRAP.
- Baseline auditors (security / backend / perf / a11y, Opus, `context: fork`) generated per type;
  `/ship100` blocks delivery without direct proof (a real browser run or `curl` with persisted state),
  never on a green build alone.

### Bounded autonomy & safety
- **`scripts/loop-controller.ts`** — hard loop bounds (`DONE / MAX_TURNS / DEADLINE / NO_PROGRESS`),
  with max-turns auto-calibrated from the cold-start debt.
- **`scripts/lib/rule-of-two.ts`** — lethal-trifecta guard: refuses unattended autonomy when
  private-data + untrusted-content + outbound-action coexist.
- **`scripts/spec-gate.ts`** — spec-driven development lock for `feature-list.json` (passes-only
  mutable, tests immutable).

### Multi-mission layer
- Declarative mission manifests (`scripts/missions/*.mission.ts`) carry an explicit write-scope,
  enforced by a two-layer scope-fence (a `PreToolUse` hook + a `resolveTarget` guard) so a mission
  can only write inside its own zone — never into ORCA's own tree. Glob-loaded (no central registry),
  removable, each shipped with its inverse `restore` procedure.

### Memory bridge
- **`scripts/index-memories.ts` / `scripts/recall.ts`** — index project memory into SQLite FTS5 for
  just-in-time recall, with project-scoped boosting; **`scripts/recall-auto.ts`** wires it as a
  `UserPromptSubmit` hook. **`scripts/assistant-proof.ts`** emits an `ORCA_PROOF.json` certificate.

### Quality & conventions
- `bun run check` — documentation↔code self-check (231 assertions).
- `bun run test` — full behavioural suite (real stdin payloads and exit-code tables, not
  file-existence checks).
- `bun run quality` — self-check + smoke + audit threshold + token-hygiene gate.
- Zero npm dependencies beyond `@types/bun`; every script runs directly under Bun, no build step.
- Agent definitions pin `model: claude-opus-4-8`; interactive output is French, code and identifiers
  are English.
