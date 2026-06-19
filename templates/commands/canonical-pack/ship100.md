---
description: Final proof-oriented ship gate. Runs review, QA, E2E, architecture/slop checks, and returns SHIP / DON'T SHIP.
---

Run the final delivery gate before any production handoff.

1. Run the relevant pre-prod agents independently: `qa-hunter`, `slop-janitor`, `architect-auditor`, `e2e-scripter`, plus security/release review when relevant.
3. Require evidence: commands, exit codes, URLs, screenshots/traces for UI, changed files, and `CODE_PATH_COVERAGE.md`.
4. Do not accept an implementation agent certifying its own work.
5. Parent thread runs final deterministic checks and writes the final decision.
6. Write `SHIP_PROOF.json` with `decision`, `commands[]`, `reviewers[]`, `blockers[]`, and evidence artifact paths.
7. Run the deterministic ship gate after writing `SHIP_CHECK.md` and `SHIP_PROOF.json`:
   - if `.claude/scripts/ship-check-gate.ts` exists: `bun .claude/scripts/ship-check-gate.ts .`
   - otherwise: `bun ~/.claude/skills/assistant/scripts/ship-check-gate.ts .`
   - if the gate fails, do not ship.

Decision must be exactly one of:
- `SHIP`
- `SHIP WITH CAVEATS`
- `DON'T SHIP`
- `SHIP UNCERTAIN`
