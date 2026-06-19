---
description: Show ORCA self-health and the current audit score
---
Run these two commands in parallel and show their output:
1. `bun scripts/status.ts` — ORCA self-health (memory-bridge index, indexed project memories, GitHub auth, recent CHANGELOG)
2. `bun scripts/audit-project.ts ~/.claude/skills/assistant` — current audit score per dimension

Summarize: current score, any dimension below 8/10, and the top 3 blockers.
