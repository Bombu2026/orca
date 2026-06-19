# Assistant TOKEN-DOCTOR Workflow

Déclencheurs : coût élevé, session bloat, compaction, "too expensive", "reduce tokens", ou Token Hygiene < 5/10.

## Phase 1 — Measure

```bash
bun scripts/token-audit.ts <path>
```

Mesurer :

- CLAUDE.md sizes
- skills sizes
- MCP count
- plugins
- total context overhead

Si possible, comparer avec `bunx ccusage daily --json`.

## Phase 2 — Diagnose

Causes fréquentes :

- CLAUDE.md trop gros.
- Trop de MCP/plugins.
- Instructions dupliquées entre CLAUDE.md, AGENTS.md, skills.
- Trop de contexte dans SKILL.md.
- Pas assez d'agents Explore pour isoler la lecture.
- Docs/images qui consomment trop de tokens.

## Phase 3 — Reduction Plan

Proposer par ROI décroissant :

- Split CLAUDE.md vers `.claude/rules/*.md`.
- Split SKILL.md vers `references/`.
- Supprimer MCP/plugins inutiles.
- Migrer MCP vers CLI quand possible.
- Ajouter statusline/context usage.
- Ajouter hooks de conversion docs si utile.

Donner l'économie estimée et le risque.

## Phase 4 — Apply

Appliquer uniquement les fixes acceptés. Ne pas supprimer MCP/plugin sans confirmation explicite.

## Phase 5 — Monitor

Relancer `token-audit.ts`, reporter avant/après, noter une re-vérification.
