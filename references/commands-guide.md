# Commands Guide

Quick reference for Claude Code custom commands (`.claude/commands/`).

---

## Command Files

Commands live in `.claude/commands/` and are invoked with `/command-name`. Each file is a Markdown prompt with optional YAML frontmatter.

```
.claude/commands/
  commit.md        → /commit
  fix.md           → /fix
  review.md        → /review
  deploy/prod.md   → /deploy:prod
```

### Frontmatter

```yaml
---
description: One-line description shown in command picker
allowed-tools: Bash, Read, Edit, Grep, Glob
model: claude-opus-4-8
---
```

Only `description` is required. Other fields are optional and follow the same spec as SKILL.md frontmatter.

---

## $ARGUMENTS

When the user types `/commit fix typo`, the value `fix typo` is injected as `$ARGUMENTS`.

**Positional access:** `$ARGUMENTS` also supports positional references — `$0`, `$1`, etc. map to space-separated tokens.

**Auto-append rule:** If `$ARGUMENTS` does not appear anywhere in the command file, Claude Code automatically appends `ARGUMENTS: <value>` at the end of the prompt. If it does appear, it substitutes in-place.

**Example:**
```md
---
description: Refactor target code
---
Refactor $ARGUMENTS. Read first, understand context, then refactor.
Run {{BUILD_COMMAND}} to verify nothing broke.
```

`/refactor src/utils/auth.ts` → `$ARGUMENTS` becomes `src/utils/auth.ts`.

---

## Priority: Skill vs Command

If a skill and a command share the same name (e.g., both `/review` exists as a skill and a command), **the skill always wins**. The command is shadowed.

**Implication:** Name custom commands carefully to avoid colliding with installed skills. Use project-specific prefixes if needed (`/proj-review` instead of `/review`).

---

## Canonical Command Pack

The `templates/commands/canonical-pack/` directory contains 8 proven command templates:

| Command | Purpose |
|---------|---------|
| `/commit` | Conventional commit from staged diff |
| `/fix` | Iterative build error fix until clean |
| `/test` | Iterative test fix until green |
| `/refactor` | Targeted refactor with build validation |
| `/pr` | Create PR with structured body |
| `/explain` | Adaptive explanation of code/concept |
| `/review` | Security-first code review |
| `/epct` | Explore → Plan → Code → Test (human gate after Plan) |

Source: Codelynx/Melvynx EPCT workflow pattern.

---

## Built-in Official Skills (v2.1.111+)

These are first-party skills shipped with Claude Code — no installation needed.

| Skill | Trigger | Purpose | Since |
|-------|---------|---------|-------|
| `/code-review` | `/code-review` | Ex-`/simplify` (renommé v2.1.146). Détecte bugs, effort configurable (`/code-review high`). `--comment` (v2.1.147) = inline GitHub PR comments. `--fix` (v2.1.152) = applique automatiquement les findings à l'arbre de fichiers. Gate entre "it works" et "ready to merge". Note: `/simplify` conservé comme alias. | v2.1.111 → renommé v2.1.146 |
| `/batch` | `/batch` | Interactive migration planning → parallel execution via N agents in isolated git worktrees. Each agent tests before creating a PR. | v2.1.111 |
| `/ultrareview` | `/ultrareview` | Fleet of cloud reviewer agents. 5-10 min, $5-20/review, 3 free runs (Pro/Max). Comprehensive PR analysis. | v2.1.111 |
| `/less-permission-prompts` | `/less-permission-prompts` | Scans transcripts + proposes automatic allowlist to reduce permission fatigue. | v2.1.111 |

**Note**: `/code-review` (ex-`/simplify`, renommé v2.1.146) est le gate recommandé entre "it works" et "merge". `--comment` pour inline GitHub PR comments. Référencer dans CLAUDE.md pre-merge workflow.

---

## Built-in Utility Commands

| Command | Replaces | Purpose | Since |
|---------|---------|---------|-------|
| `/reload-skills` | — | Re-scanne les dossiers `skills/` sans redémarrer la session. Pattern install+activate en une session (v2.1.152). | v2.1.152 |
| `/usage` | `/cost` + `/stats` | Unified usage dashboard (cost + token stats merged) | v2.1.118 |
| `/resume` | — | Resume previous session (67% faster on sessions ≥40MB since v2.1.116) | — |
| `/rewind` | ESC ESC | Checkpoint history + code rollback | — |
| `/context` | — | Shows Reserved segment (auto-compact + output token budget) | — |
| `/doctor` | — | Diagnostics (accessible during active responses since v2.1.116) | — |

---

## MCP Scope Flags

When adding MCP servers with `claude mcp add`:

| Flag | Scope | Config file | Use case |
|------|-------|-------------|----------|
| `-s user` | Global | `~/.claude.json` | Personal tools (Context7, Exa) |
| `-s project` | Project, committed | `.mcp.json` | Team-shared MCP (db, CMS) |
| (default) | Project + user | Local only | Solo dev, not committed |

**Rule:** For team projects, use `-s project` so MCP config is committed and shared.
