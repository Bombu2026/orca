# Memory Systems — State of the art (2026-04)

Reference doc consumed by the audit feedback loop and during `/assistant init` + `/assistant audit` phases to propose the best memory pattern for a given project.

---

## The 5 canonical patterns

### Pattern A — Anthropic Memory Tool (`memory_20250818`) — **gold standard**

- **Source**: [Anthropic memory-tool docs](https://docs.claude.com/en/docs/agents-and-tools/tool-use/memory-tool), [cookbook](https://github.com/anthropics/claude-cookbooks/blob/main/tool_use/memory_cookbook.ipynb), SDK TS `BetaLocalFilesystemMemoryTool`.
- **Status**: beta GA, beta header `context-management-2025-06-27`, tool name `memory_20250818`.
- **Mechanic**: a `/memories/` directory with 6 commands (`view/create/str_replace/insert/delete/rename`), injected system prompt *"ALWAYS VIEW YOUR MEMORY DIRECTORY BEFORE DOING ANYTHING ELSE"*.
- **Measured gain**: +39% agentic search perf, -84% tokens over 100 turns when paired with context editing (`clear_tool_uses_at_least`).
- **Applicable to Claude Code skills**: NOT directly (CC has its own auto-memory), but the **protocol is a perfect convention**: always maintain `progress.md` + `feature-checklist.md` at the root of `~/.claude/projects/*/memory/`.
- **Security**: path traversal validation obligatoire — reject `../`, require `realpath(path).startsWith("/memories")`.

### Pattern B — Lifecycle hooks capture (claude-mem / claude-reflect)

- **Sources**: [thedotmack/claude-mem](https://github.com/thedotmack/claude-mem) (46K stars), [BayramAnnakov/claude-reflect](https://github.com/BayramAnnakov/claude-reflect).
- **Mechanic**: SessionStart/UserPromptSubmit/PostToolUse/Stop/SessionEnd hooks feed a local store. claude-mem writes to SQLite + Chroma (ONNX all-MiniLM-L6-v2 local, port 37777). claude-reflect regexes corrections ("no, use X", "don't", "stop") → queue → `/reflect` review → sync `CLAUDE.md`.
- **Key insight**: **capture at session boundaries is more reliable than relying on the model to remember**. The hook fires regardless of context pressure.
- **Applicable to ORCA**: YES. Already partial (`auto-memory.sh` SessionEnd). Next: PostToolUse capture for corrections.

### Pattern C — Hybrid SQLite FTS5 + optional embeddings (zero-dep)

- **Sources**: [sqliteai/sqlite-memory](https://github.com/sqliteai/sqlite-memory), [KarryViber/Orb](https://github.com/KarryViber/Orb) (HRR phase vectors + FTS5 + Jaccard), [bozbuilds/AIngram](https://github.com/bozbuilds/AIngram) (single-file SQLite + ONNX).
- **Mechanic**: Bun natively supports `bun:sqlite` with FTS5. Can augment with `sqlite-vec` loaded as extension for semantic search without Python/npm deps.
- **Key advantage**: zero dependency, query 341+ markdown files in <10ms.
- **Applicable to ORCA**: **YES, highest priority**. `scripts/recall.ts` + `scripts/index-memories.ts` below.

### Pattern D — Reflexion loop (episodic memory + self-reflection)

- **Sources**: [noahshinn/reflexion](https://github.com/noahshinn/reflexion) (arXiv 2303.11366, NeurIPS 2023).
- **Mechanic**: Actor → Evaluator → Self-Reflection → episodic buffer. After each task, write `reflection.yaml` with `what_worked / what_failed / lesson`.
- **Applicable to ORCA**: YES. Formalize by having the AUDIT phase write `memory/reflections/YYYY-MM-DD-audit.yaml` after each task (Actor → Evaluator → Self-Reflection → episodic buffer).

### Pattern E — Compiled knowledge (Karpathy's LLM-wiki)

- **Source**: [coleam00/claude-memory-compiler](https://github.com/coleam00/claude-memory-compiler) (800 stars).
- **Mechanic**: `daily/YYYY-MM-DD.md` raw notes → LLM compiler → structured `knowledge/{concepts,connections,qa}/` with cross-refs + `index.md`. No RAG — pure markdown linking.
- **Applicable to ORCA**: YES. `scripts/index-memories.ts` compiles daily notes and project memories into the SQLite recall index, which `scripts/recall.ts` queries for deeper synthesis.

---

## The 8 repos to watch continuously

| Repo | Stars | Why watch |
|------|-------|-----------|
| `mem0ai/mem0` | 53K | Fact extraction + semantic/BM25/entity hybrid retrieval — industry standard |
| `letta-ai/letta` | 22K | OS-inspired memory tiers (core/archival/recall) + self-editing |
| `getzep/graphiti` | 25K | Bi-temporal knowledge graph, +15pts LongMemEval |
| `thedotmack/claude-mem` | 46K | 5-hook Claude Code memory plugin (direct integration) |
| `BayramAnnakov/claude-reflect` | 915 | Correction-based learning |
| `KarryViber/Orb` | 44 | HRR + FTS5 single-SQLite memory |
| `sqliteai/sqlite-memory` | — | Reference impl of SQLite+FTS5+vec |
| `anthropics/claude-cookbooks` | — | Official Memory Tool examples |

A scheduled maintenance agent can run a watchlist query on these every 12h. If any releases a v≥X.0 or hits +500 stars/week, it opens an issue.

---

## Decision matrix — which pattern for which project

| Project signal | Recommended pattern | Why |
|----------------|---------------------|-----|
| Solo dev, notes-heavy | A + C + E | Anthropic layout + SQLite recall + weekly compilation |
| Long-running API agent | A + B + D | Memory tool + lifecycle hooks + Reflexion |
| Multi-agent production | A + temporal KG (Graphiti) | Facts need validity windows |
| CI/CD claude -p pipeline | A only | Keep it simple, reset each run |
| Computer-use / GUI tests | B | Hook-driven, captures screenshots + actions |

---

## Implementation status in ORCA (as of 2026-04-18)

- [x] Pattern A — **adopted protocol**: `progress.md` + `feature-checklist.md` + `MEMORY.md` templates (`templates/memory/`).
- [x] Pattern B — **partial**: SessionEnd hook via `auto-memory.sh`. Missing: PostToolUse correction capture.
- [x] Pattern C — **implemented**: `scripts/recall.ts` + `scripts/index-memories.ts` using `bun:sqlite` FTS5, including Claude memories, Obsidian vault, and corpus.
- [x] Pattern D — **to formalize** in AUDIT phase 4 (reflect).
- [x] Pattern E — optional Obsidian vault support: daily notes and project memories are folded into the SQLite recall index via `scripts/index-memories.ts` and surfaced by `scripts/recall.ts`.

Gaps tracked as issues under ASS-28+.

## Validité temporelle d'un fait (loop-engineering)

Un fait n'est pas valide *intemporellement* : il a une fraîcheur. Deux mécanismes l'encodent, lus par
`recall-auto.ts` (au recall) et `scan-memories.ts` (au scan) :

- **Récence par défaut** — le recall remonte le fait LE PLUS RÉCENT à pertinence proche (BM25 par
  buckets, puis `mtime` décroissant via `memory_meta`), et affiche l'âge de chaque snippet (« il y a Nj »).
- **`superseded_by: <slug>`** (frontmatter) — marque un fait explicitement périmé. Le recall ne le
  réinjecte JAMAIS ; `scan-memories` le signale en finding `superseded_fact`.
- **`valid_from: <ISO>`** (frontmatter) — un fait qui n'entre en vigueur qu'à une date donnée. Le recall
  l'exclut tant que `valid_from` est dans le futur.
- **Contradiction temporelle** — `scan-memories.detectSupersededFacts` flague, à thème égal (nom
  normalisé), toute version plus ancienne (par `date:` sinon `mtime`) comme potentiellement contredite
  par la plus récente. Signal advisory (revue humaine), jamais une suppression automatique.
- **Scope projet** — `recall-auto` reçoit le `cwd` (hook UserPromptSubmit) et BOOSTE les mémoires du
  projet courant (slug `/a/b` → `-a-b`) : à pertinence égale, le projet du cwd passe devant, PUIS la
  récence. C'est un boost « quand pertinent », pas un filtre dur — les conventions globales (préférences
  user, autres projets) restent réinjectables.

Frontmatter type d'une mémoire datée :
```yaml
---
name: deploy-region
type: project
date: 2026-06-10
valid_from: 2026-06-10      # optionnel : pas encore valide avant cette date
superseded_by: deploy-v2    # optionnel : ce fait est périmé, voir deploy-v2
---
```
