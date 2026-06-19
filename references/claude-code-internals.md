# Claude Code Internals -- Cheat Sheet

Reference for the internal architecture of Claude Code: hooks, skills, agents, prompt structure, and permission system.

---

## Hook System

### Events (31)

| Event | Phase | Description |
|---|---|---|
| `SessionStart` | Init | Fired when a session begins |
| `Setup` | Init | Fired during first-time setup |
| `UserPromptSubmit` | Input | Before user prompt is processed |
| `PreToolUse` | Execution | Before a tool is invoked (use `matcher` to target specific tools) |
| `PostToolUse` | Execution | After a tool completes successfully. Input payload includes `duration_ms` (tool execution time in ms) since v2.1.119. |
| `PostToolUseFailure` | Execution | After a tool invocation fails. Input payload includes `duration_ms` since v2.1.119. |
| `PostToolBatch` | Execution | After a batch of parallel tool calls completes (v2.1.119+) |
| `PermissionRequest` | Execution | When a tool requests user permission |
| `SubagentStart` | Agent | Before a subagent is spawned |
| `SubagentStop` | Agent | After a subagent finishes |
| `TeammateIdle` | Agent | When a teammate in an agent team becomes idle (exit code 2 = send feedback to teammate) |
| `PreCompact` | Memory | Before context compaction occurs |
| `Stop` | Output | When Claude finishes its response |
| `Notification` | Output | When Claude sends a notification to the user |
| `SessionEnd` | Cleanup | When the session is terminated |
| `PermissionDenied` | Execution | When auto-mode classifier refuses a tool call (v2.1.89+) |
| `InstructionsLoaded` | Init | When CLAUDE.md/rules are loaded into context (v2.1.69+) |
| `CwdChanged` | Execution | When working directory changes (v2.1.83+) |
| `FileChanged` | Execution | When a file is modified on disk (v2.1.83+) |
| `TaskCreated` | Execution | When a todo task is created (v2.1.84+) |
| `TaskCompleted` | Execution | When a todo task transitions to completed state |
| `TaskStopped` | Execution | When a todo task is stopped before completion |
| `WorktreeCreate` | Agent | When an agent worktree is created (v2.1.84+) |
| `WorktreeRemove` | Agent | When an agent worktree is removed (v2.1.84+) |
| `PostCompact` | Memory | After context compaction completes |
| `Elicitation` | Input | When Claude asks the user a question |
| `ElicitationResult` | Input | When the user answers an elicitation |
| `ConfigChange` | Init | When settings are modified |
| `PreBashCommand` | Execution | Before a Bash command is executed (finer-grained than PreToolUse on Bash) |
| `PostBashCommand` | Execution | After a Bash command completes successfully |
| `BashCommandTimeout` | Execution | When a Bash command exceeds its timeout limit |

### Hook Types

**Command hook** -- runs a shell script:
- Exit code `0` = allow (continue execution)
- Exit code `2` = block (stop the tool/action)
- Any other exit code = error

**Prompt hook** -- sends context to Claude for evaluation:
- Claude returns a structured decision: `approve` or `block`
- Useful for semantic checks that require reasoning

**HTTP hook** (v2.1.92+) -- POSTs to an external endpoint:
- Sends tool input and hook data as JSON payload
- Endpoint returns the standard hook response JSON
- Useful for centralized policy servers, external approval workflows, logging

**Agent hook** (v2.1.92+) -- runs a sub-agent with tools:
- Agent gets access to Read, Grep, Glob tools
- Timeout: 60s, max 50 turns
- Returns structured decision after analysis
- Useful for complex validation that needs codebase context (e.g. checking if an edit breaks conventions)

**MCP Tool hook** (v2.1.118+) -- invokes an MCP tool directly (no subagent needed):
- Calls any tool from a connected MCP server inline, within the hook pipeline
- Replaces the previous pattern of delegating to a subagent just to call an MCP tool
- ⚠ Breaking change for existing hooks that delegated to subagents for MCP calls — review and migrate
- Useful for: sending Slack alerts, posting to GitHub, querying external APIs, triggering webhooks from hooks

### Response Schema

```json
{
  "continue": true,
  "suppressOutput": false,
  "stopReason": "string | null",
  "decision": "approve | block",
  "reason": "human-readable explanation",
  "systemMessage": "injected into system prompt",
  "hookSpecificOutput": {}
}
```

### `defer` in PreToolUse (v2.1.89+)

A `PreToolUse` hook can return `permissionDecision: "defer"`. The process exits immediately with `stop_reason: "tool_deferred"`, signaling the external orchestrator to resume or resolve the decision. Designed for `claude -p` headless pipelines where an outer process controls permission flow.

### `PermissionDenied` Hook (v2.1.89+)

New hook event that fires when the auto-mode classifier denies a tool call. The hook can return `{retry: true}` to retry the tool call instead of failing. Enables autonomous agents to recover from classifier false positives without human intervention.

### Configuration

Hooks live in `settings.json` under the `"hooks"` key, or inside plugin/skill definitions.

```json
{
  "hooks": [
    {
      "event": "PreToolUse",
      "matcher": "Bash",
      "config": {
        "type": "command",
        "command": "bash -c '...'"
      },
      "timeout": 5
    }
  ]
}
```

**Inline hooks in YAML frontmatter:** Skills and agents can define hooks directly in their SKILL.md or agent `.md` frontmatter using a `hooks:` field. Supports `PreToolUse`, `PostToolUse`, and `Stop` events. Inline hooks are scoped to the skill/agent context and do not affect the global hook pipeline.

### Conditional Hooks (`if` field, v2.1.85+)

Hooks can include an `if` field using the same syntax as permission rules to conditionally fire:

```json
{
  "event": "PreToolUse",
  "matcher": "Bash",
  "if": "tool_input.command matches 'git*'",
  "config": { "type": "command", "command": "..." }
}
```

### Priority Order

`policy` > `user` > `project` > `local`

Hooks from higher-priority sources override lower ones. A policy hook cannot be bypassed by user or project hooks.

### Async Hooks

Set `"async": true` to run a hook in the background without blocking the main execution flow. Useful for logging, notifications, and telemetry.

### Exec Form: `args: string[]` (v2.1.139)

Instead of a `"command"` string (which goes through a shell), you can provide `"args": ["cmd", "arg1", "arg2"]`. The process is spawned directly — no shell quoting issues, env vars passed cleanly.

```json
{
  "event": "PreToolUse",
  "matcher": "Bash",
  "config": {
    "type": "command",
    "args": ["node", ".claude/hooks/guard-bash.js"]
  },
  "timeout": 5
}
```

> **When to use:** Hooks that call scripts with variable paths, or where shell quoting of `${VAR}` causes failures. Simpler and more secure than `bash -c '...'` wrappers.

### `continueOnBlock` in PostToolUse (v2.1.139)

When a `PostToolUse` hook blocks (exit 2), setting `"continueOnBlock": true` sends the rejection reason back to Claude as a system message and **continues the turn** instead of terminating it. Claude can then react to the rejection and retry or correct the action.

```json
{
  "event": "PostToolUse",
  "matcher": "Edit",
  "continueOnBlock": true,
  "config": {
    "type": "command",
    "command": "bash .claude/hooks/lint-check.sh"
  },
  "timeout": 15
}
```

> **When to use:** Quality gates (lint, typecheck) where you want Claude to auto-fix the issue rather than fail the turn.

---

## Skills System (Skills 2.0 — Unified Model)

### Overview

Skills 2.0 unifies the former `.claude/commands/*.md` and `.claude/skills/*/SKILL.md` into a single system. Both user-invoked (`/skill-name`) and model-invoked (auto-loaded by Claude when relevant) skills share the same format, discovery, and execution mechanism.

The SKILL.md format is a cross-platform standard adopted by 7+ platforms: Claude Code, Cursor, Gemini CLI, Codex CLI, GitHub Copilot, VS Code, OpenClaw. Over 800k skills are cross-platform compatible via the `anthropics/skills` spec (`agent-skills-spec.md`).

### Structure

A skill is a folder containing a `SKILL.md` file with YAML frontmatter.

```
my-skill/
  SKILL.md          # required -- frontmatter + body
  references/       # deep context loaded on demand
  workflows/        # step-by-step procedures
  scripts/          # executable scripts
  assets/           # images, templates, etc.
```

### SKILL.md Frontmatter (required fields)

```yaml
---
name: my-skill
description: One-line trigger description
allowedTools: ["Bash", "Read", "Edit"]
model: claude-opus-4-6
effort: max
hooks: [...]
context: inline | fork
---
```

### Extended Frontmatter Fields (v2.1.105+)

| Field | Type | Description |
|---|---|---|
| `effort` | low/medium/high/xhigh/max | Override reasoning effort level for this skill (`xhigh` is between `high` and `max`) |
| `model` | model ID string | Override model for this skill (e.g., `claude-haiku-4-5`) |
| `when_to_use` | string | Invocation hint appended to description for trigger matching |
| `argument-hint` | string | Autocomplete hint shown in `/` menu (e.g., `[issue-number]`) |
| `user-invocable` | boolean | Set to `false` to hide from `/` menu. Used for background knowledge skills that Claude auto-loads but users don't invoke directly. |
| `agent` | boolean | If `true`, the skill runs in a dedicated agent subprocess instead of inline |
| `hooks` | YAML array | Inline hook definitions scoped to this skill (PreToolUse, PostToolUse, Stop) |
| `paths` | list of strings | File paths auto-included in context when the skill activates; supports `${CLAUDE_SKILL_DIR}` |
| `shell` | string | Default shell for hook commands defined in this skill (e.g., `bash`, `zsh`) |

`${CLAUDE_SKILL_DIR}` is an env var substitution available in `paths` and `hooks` fields, resolving to the directory containing the skill's `SKILL.md`.

- `name` and `description` are **required**
- `description` is the **only trigger mechanism** -- Claude matches user intent against skill descriptions to decide activation
- The body of SKILL.md is loaded **only after** activation, not before

### Invocation Modes

- **User-invoked** -- triggered by `/skill-name` slash command or explicit user request. Listed in the `Available skills` system reminder.
- **Model-invoked** -- Claude auto-loads the skill when user intent matches the `description` field. No explicit `/` prefix needed. The Skill tool handles both modes transparently.

### Loading Sources

1. Bundled skills (shipped with Claude Code)
2. Disk skills: `~/.claude/skills/` (user-level) and `.claude/skills/` (project-level)
3. Plugin skills (from installed plugins)
4. MCP skills (from MCP server tool definitions)

### Installation

- **Manual**: place skill folder in `~/.claude/skills/` (global) or `.claude/skills/` (project)
- **Standard**: `npx skills add <owner/repo>` (cross-platform installer from `anthropics/skills`)
- **Plugin**: skills bundled with Claude Code plugins are auto-installed

### Size Limit

SKILL.md should stay under ~500 lines. For larger skills, use **progressive disclosure**: put detailed content in `references/` and `workflows/` subdirectories.

### Context Modes

- `inline` (default) -- skill instructions are injected into the current conversation context
- `fork` -- skill runs in an isolated subagent context, preventing context pollution

### Subagent Support

Skills can spawn subagents via the Agent tool. When a skill runs in `fork` context, the subagent gets an isolated context with only the skill's allowed tools and instructions. This enables:
- Heavy skills that would pollute the main context
- Parallel skill execution in separate agent contexts
- Skills that orchestrate multi-step workflows via agent chains

### `$ARGUMENTS` in Commands and Skills

When a user invokes a command with arguments (`/my-command some text here`), the full argument string is available as `$ARGUMENTS`. Positional access: `$ARGUMENTS[0]` or `$0`, `$1`, etc.

If `$ARGUMENTS` does not appear in the command/skill file, Claude Code automatically appends `ARGUMENTS: <value>` to the end of the prompt.

### Skill vs Command Priority

When a skill and a command share the same name, **the skill always wins**. This is relevant when migrating from commands to skills — the old command file can remain without conflict, but it will never be invoked.

### Cross-Platform Compatibility

Skills written for Claude Code work on other platforms that support the SKILL.md standard. The frontmatter format is the interop layer. Platform-specific features (hooks, MCP, CC-specific tools) degrade gracefully on other platforms.

---

## Agent System

### Definition

Agents are defined as JSON or Markdown files in `.claude/agents/`.

### Key Fields

| Field | Description |
|---|---|
| `agentType` | Agent category identifier |
| `whenToUse` | Trigger condition description |
| `tools` | Allowed tool list |
| `disallowedTools` | Explicitly blocked tools |
| `skills` | Skills available to this agent |
| `mcpServers` | MCP server connections |
| `hooks` | Agent-specific hooks |
| `model` | Model override (e.g., `claude-haiku-4-5`) |
| `effort` | Reasoning effort level |
| `permissionMode` | Permission handling mode |
| `maxTurns` | Maximum conversation turns |
| `memory` | Memory scope configuration |
| `background` | Run in background |
| `isolation` | `"worktree"` for isolated git working copy |
| `context` | `shared` (default, inherits parent context) / `fork` (clean slate, no parent context) / `summary` (receives a summary of parent context). Use `fork` for independent audit/review agents to avoid anchoring bias. (v2.1.117+) ⚠ Known bug #40104 : MCP tools configured at session level can bleed through into `context: fork` agents — their tool definitions remain available even though context is supposed to be clean. No fix in v2.1.126. Workaround: explicitly set `allowedTools` in the agent definition to exclude unwanted MCP tools. |
| `hooks` | Agent-scoped hooks in frontmatter — apply only to this agent's lifecycle, not to the main thread. Same syntax as global hooks. (v2.1.117+) |
| `initialPrompt` | First prompt sent to the agent on spawn (v2.1.83+) |

### Built-in Agents

- **general-purpose** -- default agent for most tasks
- **Explore** -- read-only codebase exploration
- **Plan** -- read-only planning and architecture

### Memory Scopes

- `user` -- persists across all projects (`~/.claude/`)
- `project` -- persists for this project (`.claude/`)
- `local` -- persists for this machine only (`.claude/local/`)

---

## CLAUDE.md Hierarchy

### Loading Order (merged into system prompt)

1. **Policy** -- enforced by organization, cannot be overridden
2. **User** -- `~/.claude/CLAUDE.md` (personal global preferences)
3. **Project** -- `.claude/CLAUDE.md` (shared project conventions)
4. **Local** -- `.claude/local/CLAUDE.md` (machine-specific, gitignored)

All levels are merged. Higher-priority levels take precedence on conflicts.

Folder-level `CLAUDE.md` files inside `.claude/` subdirectories are also loaded when relevant.

### Modular Rules (`.claude/rules/*.md`)

Individual rule files in `.claude/rules/` are loaded alongside CLAUDE.md. Each file covers a single concern (e.g., `testing.md`, `api.md`, `db.md`). Benefits:

- **Composable**: enable/disable rules per topic without editing a monolithic CLAUDE.md
- **Reviewable**: each rule file can be code-reviewed independently
- **Selective**: Claude loads only relevant rules based on the current task context

Effective hierarchy with rules:
1. `~/.claude/CLAUDE.md` — global user preferences
2. `.claude/CLAUDE.md` — shared project conventions (committed)
3. `.claude/rules/*.md` — modular per-topic rules (committed)
4. `.claude/local/CLAUDE.md` — machine-specific overrides (gitignored)

### REVIEW.md

Separate file type read exclusively by Code Review (not part of the CLAUDE.md hierarchy). Contains review-specific rules: what to flag, what to skip, style enforcement overrides. Auto-discovered at the repository root. Used by `@claude review` and `@claude review once` on GitHub.

CLAUDE.md directives are treated as **hard constraints** during execution.

---

## Permission System

### Modes

| Mode | Behavior |
|---|---|
| `default` | Ask for each tool use |
| `plan` | Read-only, no writes allowed |
| `bypassPermissions` | Skip all permission checks |
| `dontAsk` | Never prompt, deny if not pre-allowed |
| `acceptEdits` | Auto-approve file edits, ask for others |
| `auto` | Classifier-based safe auto-approval |

### `autoMode.hard_deny` (v2.1.136)

In `settings.json`, `autoMode.hard_deny` accepts the same pattern syntax as deny rules but applies unconditionally — the classifier cannot override them based on user intent. Use for absolute blockers in autonomous pipelines.

```json
{
  "autoMode": {
    "hard_deny": ["Bash(rm -rf*)", "Bash(git push --force*)"]
  }
}
```

Contrast with standard deny rules: deny rules can be bypassed when the classifier determines the intent is safe. `hard_deny` rules are never bypassed.

### Permission Defer (v2.1.89+)

In `PreToolUse` hooks, returning `permissionDecision: "defer"` causes the process to exit with `stop_reason: "tool_deferred"`. The external orchestrator can then resume the session with the resolved decision. Pair with `PermissionDenied` hooks for full autonomous control over the permission pipeline.

### Rules Format

```
allow: "ToolName:pattern"
deny:  "ToolName:pattern"
ask:   "ToolName:pattern"
```

### CVE: Deny Rules Bypass (patched v2.1.90)

Deny rules in `settings.json` were silently ignored beyond 50 sub-commands. A malicious CLAUDE.md could exploit this to exfiltrate credentials via allowed tools. Patched in v2.1.90 (2026-04-06). **Minimum required CC version: 2.1.90** — any earlier version is vulnerable.

### Priority

`policy` > `user` > `project` > `local` > `CLI args` > `session`

---

## System Prompt Architecture

### Structure

**Static section (cached):**
- Base instructions and behavioral guidelines
- Tool definitions and schemas
- Output style directives

**Dynamic section (per-turn):**
- Merged CLAUDE.md content
- Agent memory
- Session state and context

### Cache Behavior

The prompt cache is renewed on:
- `/clear` -- clears conversation history
- `/compact` -- compresses context
- `/rewind` -- rolls back to a previous state

### 2-Tier Prompt Cache Splitting (Orb pattern)

Split system prompt into two tiers: stable content (SKILL.md, AGENTS.md, CLAUDE.md — cached long) vs dynamic content (user prompt, tool results — rebuilt each turn). Keep skill/agent definitions in the stable tier for longer cache hits. Source: KarryViber/Orb framework.

### Large Tool Results

Tool results exceeding `maxResultSizeChars` are persisted to disk and referenced by metadata pointer, keeping the context window clean. As of v2.1.91, `anthropic/maxResultSizeChars` is raised to **500,000 characters** per tool result (MCP included).

---

## Optimization Tips

### Use Dedicated Tools

| Instead of | Use |
|---|---|
| `find` | `Glob` |
| `grep`, `rg` | `Grep` |
| `cat`, `head`, `tail` | `Read` |

Dedicated tools are faster, permission-aware, and produce better-formatted output.

### Context Management

- **Subagents get fresh context** -- use them to avoid context rot in long sessions
- **Agent tool** -- use for complex parallel searches across large codebases
- **Skills with `context: "fork"`** -- prevent skill instructions from polluting main context
- **Async hooks** (`async: true`) -- don't block the main execution flow

### Tool Result Budget

Large results are automatically truncated or persisted to disk. Design tool invocations to request only the data you need (e.g., use `limit` and `offset` with `Read`).

### `/powerup` (v2.1.90+)

Interactive in-terminal tutorial with 10 lessons covering hooks, MCP, sub-agents, `/loop`, and context management. Run `/powerup` to launch.

### `/team-onboarding` (v2.1.101+)

Generates a teammate ramp-up guide from your local CC configuration. Inspects CLAUDE.md, installed skills, agents, hooks, and recent workflows to produce an onboarding document. Useful for standardizing CC usage across a team.

### `/insights`

Generates rules from session pain points. Analyzes past tool failures, repeated corrections, and common friction to produce actionable rules + an HTML report. Useful for evolving CLAUDE.md conventions based on actual usage.

### `CLAUDE_CODE_SUBAGENT_MODEL`

Environment variable to override the model for all subagents in a session. Enables mixed-model sessions (e.g., Opus lead + Haiku subagents for cost optimization). Set in shell or `.env`.

---

## Computer Use CLI (v2.1.86+, research preview)

Claude can interact with native desktop applications, click UI elements, and test its own changes from the terminal. Activation via `/mcp` > computer-use.

**Capabilities:**
- Open native apps, take screenshots, click buttons, fill forms
- Test web UIs, verify visual changes, interact with desktop tools

**Security:**
- Prompt per application
- Browsers: view-only (no credential entry)
- Terminals: click-only (no typing)
- Availability: Pro and Max plans

**When relevant:** Projects with native UIs (desktop apps, macOS, iOS simulators) or complex web testing that goes beyond Playwright.

---

## Monitor Tool (v2.1.98+)

Streams internal events from a running CC session. Enables external tools to observe agent behavior in real-time. Use for debugging, observability dashboards, or orchestrator supervision.

---

## Channels (v2.1.80+)

Plugin-based MCP servers that connect chat platforms to a CC session. Multiple channels can run simultaneously.

**Activation:** `claude --channels plugin:telegram@claude-plugins-official`
**State:** `~/.claude/channels/<platform>/`

| Platform | Plugin | Key tools |
|----------|--------|-----------|
| Telegram | `telegram@claude-plugins-official` | `reply`, `react`, `edit_message`, `download_attachment` |
| Discord | `discord@claude-plugins-official` | Similar messaging tools |
| Slack | `slack@claude-plugins-official` | Workspace integration |
| Webhooks | Custom MCP server | Incoming/outgoing hooks |

**Setup (Telegram):** BotFather → `/plugin install` → `/telegram:configure <token>` → `--channels` flag → pairing (6-char code) → lockdown to `allowlist` mode.
**Limitation:** Bot API exposes no history/search — only live messages.

---

## UltraPlan

Deep multi-agent planning mode. Triggered by including "ultraplan" in prompt, or via plan approval dialog.

**Flow:** Local session → CCR (Claude Code Remote, claude.ai/code) → Opus spawns parallel sub-agents on 3 axes (existing code, files to modify, risks) → critique agent review → plan returned to local session.

**Key details:**
- Duration: 10-30 minutes deep thinking
- `ULTRAPLAN_TELEPORT_LOCAL` token: forces plan back to local terminal instead of remote execution
- Disable: `disableUltraplan: true` in settings (v2.1.92+)
- Errors: `terminated`, `timeout_pending`, `timeout_no_plan`, `extract_marker_missing`

**vs Plan mode:** Plan mode = local, single agent, read-only. UltraPlan = remote (CCR), multi-agent parallel, with dedicated critique agent. Can auto-execute remotely + create PR.

**Web editor (v2.1.110+):** Web-based plan editor with inline comments, emoji reactions, and outline sidebar. Review and refine the plan before executing locally or in cloud. Docs: code.claude.com/docs/en/ultraplan.

**Limitation:** Cloud session does not see local changes made after plan launch — plan is based on the repo state at launch time.

---

## UltraReview (v2.1.111)

Multi-agent cloud code review. Triggered by `/ultrareview`. Fleet of specialized reviewer agents running on Anthropic infrastructure.

**Key details:**
- Duration: 5-10 minutes per review
- Cost: $5-20 depending on codebase size
- Free tier: 3 free runs for Pro/Max subscribers
- Analysis: security, performance, correctness, style, architecture

---

## Scheduled Tasks

Two mechanisms:

| Type | Activation | Persistence | Use case |
|------|-----------|-------------|----------|
| `/loop` | `/loop 5m run tests` | Session-scoped (dies on exit) | Quick recurring checks |
| Desktop (Cowork) | `/schedule` in Cowork mode | Cron-based, survives restart | Daily tests, dep audits |
| CC Routines (Cloud) | `/schedule` or web UI | Cloud-persistent, runs 24/7 | Daily PR review, dep audit, overnight tests |

**Desktop cron:** Standard 5-field cron syntax. Requires Cowork mode in Claude Desktop.
**Known issues:** Tasks don't run when app is closed (all fire on relaunch). MCP connectors don't init until human interaction.

**CC Routines (Research Preview, v2.1.108):**
- Cloud-scheduled tasks running on Anthropic infrastructure — no local machine needed
- Triggers: cron schedule, API call, GitHub webhook
- Limits: Pro 5/day, Max 15/day, Team/Enterprise 25/day
- Min interval: 1 hour. Fresh GitHub clone per run (no local files)
- Setup: `/schedule` command or web UI at claude.ai/code
- **GitHub trigger types**: only `pull_request` and `release` events (not push, issue, workflow_run)
- **PR filter fields (9)**: author, title, body, base branch, head branch, labels, draft, merged, from-fork
- **Filter operators (6)**: equals, contains, starts_with, is_one_of, is_not_one_of, matches_regex
- **Not shareable**: routines are per-user, cannot be shared between teammates
- **API beta**: requires header `experimental-cc-routine-2026-04-01`
- **Branch safety**: default config only allows pushes to `claude/`-prefixed branches
- **Taxonomy** (Noah Zweben, Anthropic): Routine = cloud, schedule desktop = local, `/loop` = current session

---

## Voice Dictation

Built-in CLI: `/voice`. Push-to-talk: hold Space to record, release to transcribe. Language configurable via `"language"` in `~/.claude/settings.json`. CLI only (not VS Code).

---

## Remote Control (Max plan)

`/remote-control` generates a session URL + QR code. Connect from Claude mobile app or claude.ai/code. Bidirectional: read conversation and send messages to the CLI session. Enable for all sessions via `/config`.

---

## Advisor Tool API (beta, 2026-04-09)

Pattern: executor model + strategic advisor model invoked mid-generation. Quality close to advisor-solo at executor cost. Beta header: `advisor-tool-2026-03-01`.

**INIT pattern:** Haiku executor + Opus advisor for complex decisions — reduces cost while maintaining quality on critical reasoning steps.

---

## Models

### Claude Opus 4.8 (2026-04-16)

Integrated in CC v2.1.111. Key changes:
- **Literal instruction following** — more precise than Opus 4.6
- **New tokenizer** — same input = 1.0-1.35x more tokens (plan for higher token usage)
- **Effort level `xhigh`** — new level between `high` and `max`
- **Vision HD** — 2576px long edge
- **Auto mode** for Max subscribers
- **Pricing** — same as Opus 4.6: $15/$75 per MTok input/output
- **Not on Bedrock/Vertex** at launch
- **Deprecation** — `claude-sonnet-4-20250514` and `claude-opus-4-20250514` retire June 15, 2026

---

## Fast Mode

Opus 4.6 at 2.5x output speed. Same model, faster generation. Toggle via `/fast`, persists between sessions. Extra usage only — not available on Opus 4.8. Pricing: $30/$150 per MTok.

---

## Plugins

Official repo: `anthropics/claude-plugins-official`. Structure:

```
plugin-name/
  .claude-plugin/plugin.json    # Metadata (required)
  .mcp.json                     # MCP server config (optional)
  commands/                     # Slash commands
  agents/                       # Agent definitions
  skills/                       # Skills
```

**Install:** `/plugin install <name>@claude-plugins-official`
**Discover:** `/plugin > Discover`
**Submit:** Official submission form at clau.de/plugin-directory-submission

---

## Agent SDK

Programmatic access to Claude Code. Renamed from "Claude Code SDK" to "Claude Agent SDK".

| SDK | Package | Interface |
|-----|---------|-----------|
| TypeScript V1 | `@anthropic-ai/claude-agent-sdk` | `query()` async generator |
| TypeScript V2 (preview) | Same package, `unstable_v2_*` prefix | `createSession()` + `send()/stream()` |
| Python | `claude-agent-sdk` | `query()` one-shot or `ClaudeSDKClient` persistent |

**Breaking changes (v0.1.0):** System prompt, settings sources (CLAUDE.md, settings.json), and `.claude/agents/` no longer loaded by default — must be explicitly opted in via `systemPrompt` and `settingSources` options.

**Key V1 options:** `prompt`, `allowedTools`, `permissionMode`, `model`, `agents` (inline subagents), `hooks`, `mcpServers`, `maxTurns`, `maxBudgetUsd`, `sandbox`, `thinking`, `effort`, `outputFormat` (JSON schema).

**Custom tools:** `tool()` + `createSdkMcpServer()` (TS) or `@tool` decorator (Python).

**Permission modes:** `"default"`, `"acceptEdits"`, `"bypassPermissions"`, `"plan"`, `"dontAsk"`, `"auto"`.

**V2 preview:** Session-based. `unstable_v2_createSession()` / `unstable_v2_resumeSession()` / `unstable_v2_prompt()`. Each turn is a separate `send()`→`stream()` cycle. Cleanup via `await using` (TS 5.2+). No session forking in V2.

---

## Environment Variables

### Prompt Cache TTL

| Variable | Effect | Since |
|----------|--------|-------|
| `ENABLE_PROMPT_CACHING_1H` | Sets prompt cache TTL to 1 hour instead of default 5 minutes. Dramatically reduces costs on long sessions (up to 10x cheaper). Bug fix v2.1.129: was silently downgraded to 5 min in some cases — now reliably 1h. | v2.1.108 |
| `FORCE_PROMPT_CACHING_5M` | Forces 5-minute cache TTL even when 1h is available. Useful for debugging cache behavior. | v2.1.108 |
| ~~`ENABLE_PROMPT_CACHING_1H_BEDROCK`~~ | **Deprecated** — replaced by `ENABLE_PROMPT_CACHING_1H` which works across all providers. | Pre-v2.1.108 |

Works on all providers: API key, Bedrock, Vertex, Foundry. Combined with a `PreCompact` hook (to control when compaction discards cached context), this forms a complete long-context cost strategy.

### Recap / Away Summary

| Variable | Effect | Since |
|----------|--------|-------|
| `CLAUDE_CODE_ENABLE_AWAY_SUMMARY` | Forces `/recap` on every session resume (context summary of what happened while you were away). Also configurable via `/config`. | v2.1.108 |

---

## Version Notes

### v2.1.105-109

Source: changelog tracking 2026-04-15

- **PreCompact hook enhanced** — `matcher` field accepts `manual` (user-triggered /compact) or `auto` (system-triggered compaction). Exit code 2 or `{"decision": "block"}` prevents compaction. (v2.1.105)
- **PostCompact confirmed** — fires after compaction completes, matcher same as PreCompact (v2.1.105)
- **Skill description cap raised to 1,536 chars** — was 250. Includes `when_to_use` field (alias for `description`). Warning at startup if truncated. (v2.1.105)
- **ENABLE_PROMPT_CACHING_1H** — 1-hour prompt cache TTL, replaces `ENABLE_PROMPT_CACHING_1H_BEDROCK` (deprecated). Also: `FORCE_PROMPT_CACHING_5M`. (v2.1.108)
- **`/recap` command** — context summary when returning to a session. Via `/config` or `CLAUDE_CODE_ENABLE_AWAY_SUMMARY` env var. (v2.1.108)
- **Slash commands via Skill tool** — model can discover and invoke built-in commands like `/init`, `/review`, `/security-review` through the Skill tool. (v2.1.108)
- **CC Routines (Research Preview)** — cloud-scheduled tasks with cron, API, and GitHub webhook triggers. Limits: Pro 5/day, Max 15/day, Team/Enterprise 25/day. Runs on Anthropic infra without local machine. (v2.1.108)
- **CVE: deny rules bypass patched** — deny rules were silently ignored beyond 50 sub-commands. A malicious CLAUDE.md could exfiltrate credentials. **Requires CC >= v2.1.90.** (v2.1.90)

### v2.1.110

Source: changelog tracking 2026-04-17

- **`/tui fullscreen`** — flicker-free fullscreen render, new `/focus` command. `autoScrollEnabled` config for fullscreen mode. (v2.1.110)
- **Push notifications (mobile)** — flag `tengu_kairos_push_notifications`, new `PushNotification` tool. (v2.1.110)
- **Custom rules override built-ins** — custom rules now replace built-in rules instead of stacking on top. (v2.1.110)
- **Bug: plugin skills disappear from `/` menu** — issue #48963. (v2.1.110)
- **Bug: bare "changelog" prompt triggers recursive spawn** — issue #48929, potentially dangerous. (v2.1.110)

### v2.1.113-114

Source: changelog tracking (2026-04-19)

- **Native binary CLI** — CC no longer ships as a JS bundle; the CLI now spawns a compiled native binary. Startup is faster; patching or monkey-patching the bundle is no longer possible. (v2.1.113)
- **`sandbox.network.deniedDomains`** — new setting in `.claude/settings.json` alongside `allowedDomains`; supports fine-grained domain blacklist in addition to allowlist. (v2.1.113) ⚠ Known limitation: `allowedDomains` is ignored in Cowork mode (Issue #37970). Known bypass: path tricks can circumvent denylist — do not rely on `deniedDomains` alone as the sole security control (Ona research, March 2026). Use PreToolUse hook deny rules as defense in depth.
- **Security hardening** — `/private/{etc,var,tmp,home}` paths marked dangerous; deny rules added for `env`, `sudo`, and `watch`; `find -exec` pattern blocked. (v2.1.113)
- **Bug: crash on permission dialogue in agent-teams** — fixed crash that occurred when a permission dialogue was shown while an agent team was active. (v2.1.114, 2026-04-18)

### v2.1.119 (2026-04-23, published by ashwin-ant@Anthropic)

Source: GitHub release body `anthropics/claude-code@v2.1.119` (docs.claude.com/release-notes lagging — public page still at v2.1.110 on 2026-04-24; always cross-check GitHub releases).

**New hook event**
- **`PostToolBatch`** — fires after a batch of parallel tool calls completes. Receives the list of tools in the batch + their outputs. Use for batch-level monitoring, aggregation, or post-parallel-execution logic. Official page: `posttoolbatch.md` (llms.txt entry 117).

**Observability**
- **`PostToolUse` / `PostToolUseFailure` gain `duration_ms`** in hook input payload — measure per-tool latency without external wrapping
- **OpenTelemetry `tool_result` / `tool_decision` events** now carry `tool_use_id` + `tool_input_size_bytes` — enables per-invocation correlation and payload-size dashboards
- **Status line stdin JSON** includes `effort.level` + `thinking.enabled` — status line scripts can surface current effort/thinking without `/config` lookup

**Agent/Print mode alignment**
- **`--print` (headless) mode now honors `tools:` / `disallowedTools:`** from agent frontmatter (previously ignored in `-p`) — impacts any `claude -p --agent <name>` pipeline
- **`--agent <name>` honors `permissionMode`** from the built-in agent frontmatter
- **Subagent + SDK MCP server reconfiguration parallelized** on session start (previously serial per-MCP)
- **Agent tool `isolation: "worktree"`** no longer reuses stale worktrees from prior sessions (fixes leaked state across `Agent({isolation:"worktree"})` calls)

**PR / VCS**
- **`--from-pr`** now accepts GitLab MR, Bitbucket PR, GitHub Enterprise URLs (previously GitHub.com only)
- **`prUrlTemplate`** setting — customize the PR badge footer URL (point at internal code-review system instead of `github.com/.../pull/N`)

**Settings / UX**
- **`/config` settings persistence**: theme, editor, verbose persist to `~/.claude/settings.json` with standard override precedence (project > local > policy > user)
- **`CLAUDE_CODE_HIDE_CWD=1`** env var — hides cwd in logo (useful for screencasts/tutorials)
- **PowerShell tool commands** can be auto-approved in permission mode (parity with Bash — previously always prompted)
- **Plugin auto-update** now selects the highest git tag satisfying version constraints (deterministic resolution for plugin-dependencies.md)

**Fixes**
- Skills invoked before auto-compaction no longer re-fire against the next user message (structural bug on skill lifecycle across compaction)
- `TaskList` tool returns tasks sorted by ID (was filesystem-arbitrary order)
- Async `PostToolUse` hooks without payload no longer write empty entries to transcript
- MCP HTTP OAuth "Invalid OAuth error response" fixed when server returns non-JSON
- **`workspace` is a reserved MCP server name** (v2.1.128) — servers named `workspace` are silently skipped with a warning. Rename existing configs.
- **`CLAUDE_CODE_SESSION_ID`** injected into Bash subprocess environment (v2.1.132) — same `session_id` as hooks receive. Useful for log correlation.
- **MCP stdio unbounded memory** (10GB+ RSS) when server writes non-protocol data to stdout — fixed in v2.1.132. Drain buffer correctly.
- **Bedrock/Vertex 400 + `ENABLE_PROMPT_CACHING_1H`** — fixed in v2.1.132; 1h cache is now safe on all providers including Bedrock and Vertex.
- **`--permission-mode` in plan-mode `--resume`** — was ignored; fixed in v2.1.132. Plan mode now correctly re-applied after `ExitPlanMode`.
- **External SIGINT graceful shutdown** — `kill -INT` / IDE stop button now triggers graceful shutdown (v2.1.132); terminal modes restored + `--resume` hint shown.
- `/plan` + `/plan open` now act on an existing plan when entering plan mode (previously no-op)
- Vim INSERT mode: `Esc` no longer dequeues a queued message (behavior tightening)
- Glob/Grep disappearance on macOS/Linux native builds when Bash denied (follow-up to v2.1.116 bfs/ugrep)

**Vertex AI**
- `ENABLE_TOOL_SEARCH` is opt-in on Vertex (beta header unsupported by default)

### v2.1.120 — RÉTRACTÉE

Référencée dans SDK Python v0.1.67 puis rétractée. Non publiée officiellement. Surveiller réapparition.

> **ORCA impact summary**: hooks `duration_ms` is the highest-value addition (direct observability upgrade for all our template hooks). `--print` mode honoring `tools:/disallowedTools:` is a behavioral change to verify across scheduled agents running in `-p`. Skill pre-compaction fix removes a known confusing edge case for INIT sessions.

### v2.1.115-118

Source: changelog tracking 2026-04-23 (community-signals-23-april-2026.md — Releasebot, X/Twitter)

#### v2.1.115
- **Does not exist** — version number was skipped. Jump is v2.1.114 → v2.1.116 directly.

#### v2.1.116 (2026-04-21)
- **`/resume` 67% faster** on sessions 40MB+ (large session optimization)
- **MCP startup accelerated** — deferred resource loading when multiple stdio servers active
- **bfs/ugrep** replace Glob/Grep in native binary builds (faster file traversal)
- Spinner "still thinking" with descriptive states
- `/config` search now matches values (not just keys)
- `/doctor` accessible during active Claude responses
- Fix: sandbox rm/rmdir on `/` and `$HOME` no longer auto-approved
- Fix: Devanagari rendering, Ctrl+- undo in Kitty, Ctrl+Z hang via wrapper processes
- ⚠ **ECC argv-dup bug**: CC v2.1.116 may duplicate hook argv entries in `settings.local.json`. Fixed in v2.1.117. Guard: `generate-config.ts` deduplicates on generation.

#### v2.1.117 (2026-04-22)
- **Model selections persist** across restarts despite project pins
- **MCP server connections concurrent by default** — faster init for multi-MCP projects
- **Plugin dependency auto-installation** from marketplaces
- **Default effort changed**: `medium` → `high` for Pro/Max on Opus 4.6 / Sonnet 4.6 (~1.5x token consumption per turn)
- **`mcpServers` frontmatter** now active in `--agent` mode — agent `.md` files can declare MCPs that load automatically
- **`"$defaults"` in `autoMode`** — add custom allow/deny rules without erasing CC built-in defaults
- **`DISABLE_UPDATES=1`** env var — prevents CC auto-updates in production/CI environments
- **Fix: Opus 4.8 context window** — was incorrectly calculated at 200K → now correct 1M. Long sessions no longer compact prematurely.
- Model choices written to `.claude/settings.local.json` if project pins another model
- Fix: OAuth token expiration ("Please run /login")
- Fix: WebFetch hang on large HTML pages

#### v2.1.118 (2026-04-23)
- **Vim visual mode** — `v` (visual) and `V` (visual-line) with selection, operators, visual feedback
- **`/usage`** — replaces merged `/cost` + `/stats` (unified usage dashboard)
- Custom named themes from `/theme`
- **Hooks can invoke MCP tools directly** — hooks no longer need a subagent to call MCP tools. ⚠ Potential breaking change: existing hook scripts that delegated to subagents for MCP calls should be reviewed.

### v2.1.111-112

Source: changelog tracking 2026-04-17

- **`/ultrareview`** — fleet of cloud-based reviewer agents. 5-10 min, $5-20 per review, 3 free runs for Pro/Max subscribers. Multi-agent cloud review for comprehensive PR analysis. (v2.1.111)
- **`/less-permission-prompts`** — official Anthropic skill that scans transcripts and proposes an automatic allowlist. Reduces permission fatigue. (v2.1.111)
- **Auto mode flag removed** — `--enable-auto-mode` flag is no longer needed, auto mode is now the default behavior. (v2.1.111)
- **Push notifications** — mobile push notifications via Remote Control. (v2.1.112)
- **PermissionRequest hooks fix** — PermissionRequest hooks were not re-verifying deny rules. Fixed. (v2.1.111)
- **PreToolUse additionalContext fix** — `additionalContext` was lost when a hook failed. Fixed. (v2.1.112)
- **Read-only bash with globs** — `ls *.ts` and similar read-only bash commands no longer trigger permission prompts. (v2.1.112)
- **PowerShell tool** — progressive rollout on Windows. (v2.1.112)

### v2.1.100

Source: marckrenn/claude-code-changelog (community tracker)

- **Monitor tool added** — streams internal events from a running CC session (see Monitor Tool section above)
- **Sleep delays >= 2s blocked** — Bash `sleep` calls with duration >= 2 seconds are rejected to prevent idle token burn
- **Conciseness constraint removed** — model no longer forced into terse responses, can give full explanations when warranted

### v2.1.104

Source: marckrenn/claude-code-changelog (community tracker)

- **System reminder prompts reduced from 4 to 2 variants** — lighter context overhead, fewer tokens consumed per turn on system instructions
- **Tool calls require explicit approval when blocked by permission mode** — when a tool is blocked by the active permission mode, the user must explicitly approve instead of silent denial or retry

### v2.1.152

**v2.1.152** — 2026-05-27

- `/code-review --fix` : applique les findings de review directement dans le working tree (reuse, simplification, efficiency). `/simplify` est maintenant un alias de `/code-review --fix`
- `disallowed-tools` en frontmatter skill/agent : retire des outils du modèle pendant l'exécution du skill. Ex: `disallowed-tools: [Bash, Edit]` pour un skill read-only
- `/reload-skills` : re-scanne les dossiers skills sans redémarrer la session
- `SessionStart` hook → `reloadSkills: true` : permet à un hook SessionStart d'installer des skills **et** de les rendre immédiatement disponibles dans la même session (pattern : install-skills hook)
- `SessionStart` hook → `hookSpecificOutput.sessionTitle` : définit le titre de la session dès le démarrage ou la reprise
- **`MessageDisplay` hook** : nouvel event qui permet aux hooks de **transformer ou masquer le texte des messages assistant** avant affichage. 7ème type de hook phase Output (après Stop, Notification)
- `--fallback-model` : si le modèle primaire n'est pas trouvé, CC bascule automatiquement sur le fallback pour le reste de la session (au lieu d'échouer chaque requête)
- Auto mode : ne nécessite plus de consent opt-in
- Vim mode : `/` en mode NORMAL ouvre le reverse history search (comme Ctrl+R dans bash/zsh vi-mode)
- `/usage` : inclut maintenant les gros fichiers de session (streaming read, mémoire plate)
- Résumés thinking (collapsed) : restent lisibles ≥3s, rendu markdown, cap 10 lignes
- Indicateur "Thinking for Ns" (fullscreen) : compte en live pendant la réflexion
- Workflow tool : simplification affichage progression (compteurs live uniquement dans la ligne de statut persistante)
- Post-response timer : affiche "Waiting for N background agents" quand des agents/workflows tournent encore
- OTel : `app.entrypoint` comme attribut métrique (opt-in via `OTEL_METRICS_INCLUDE_ENTRYPOINT=true`)

### v2.1.149–2.1.150

**v2.1.149**
- `/usage` : per-category breakdown des limites (skills, subagents, plugins, coût par MCP server)
- `/diff` : navigation clavier dans le detail view (arrows, j/k, PgUp/PgDn, Space, Home/End)
- Markdown : rendu GFM task list checkboxes (`- [ ]` / `- [x]`) au lieu de bullets
- `allowAllClaudeAiMcps` managed setting (enterprise) : charge les cloud MCP connectors claude.ai alongside `managed-mcp.json`
- **Security fix** : PowerShell — les `cd` built-in (`cd..`, `cd\`, `cd~`, `X:`) changeaient le working directory sans détection, permettant des lectures hors workspace
- **Security fix** : sandbox write allowlist dans les git worktrees couvrait tout le repo principal au lieu du seul `.git/` partagé
- **Security fix** : permission-analysis parser se fiait à des valeurs stales de `PWD`/`OLDPWD`/`DIRSTACK` après `cd`/`pushd`/`popd`
- **Bug critique macOS** : `find` dans le Bash tool épuisait la table vnode système et crashait le host sur les grands arbres de fichiers — **ne jamais utiliser `find` sans limitation `-maxdepth`**
- Status bar affiche maintenant le niveau d'effort réel appliqué par le frontmatter skill/agent (était le niveau baseline de l'user)

**v2.1.150**
- Internal infrastructure improvements (pas de changements user-facing)

### v2.1.147–2.1.148

**v2.1.147**
- **Pinned background sessions** (`Ctrl+T` dans `claude agents`) : restent actives à l'idle, se redémarrent automatiquement lors d'une mise à jour CC, évictées en dernier sous pression mémoire
- **`/code-review --comment`** : poste les findings comme inline GitHub PR comments directement depuis le terminal. Effort configurable (`/code-review high`). L'ancien comportement cleanup-and-fix est supprimé.
- Note : régression Bash exit code 127 introduite (fixée en 2.1.148)

**v2.1.148**
- Fix critique : Bash tool retournait exit code 127 sur toutes les commandes (régression 2.1.147)

### v2.1.146

- `/simplify` renommé `/code-review` avec effort optionnel (`/code-review high`) — même feature, nouveau nom dans les skills et shortcuts
- **Fix `CLAUDE_CODE_SUBAGENT_MODEL`** : n'était pas transmis aux process enfants dans les sessions multi-agents. Quiconque utilise cette env var pour contrôler le modèle des subagents doit mettre à jour CC.
- Auto mode ne supprime plus `AskUserQuestion` si l'user ou un skill en dépend explicitement (fix regression)
- Fix MCP pagination : `resources/list`, `resources/templates/list`, `prompts/list` ne droppent plus les items au-delà de la page 1

### v2.1.144–2.1.145

**v2.1.144**
- `/resume` supporte les background sessions — sessions démarrées via `claude --bg` ou agent view apparaissent dans le picker, marquées `bg`
- `/model` change uniquement la session courante ; touche `d` dans le picker pour définir le défaut des nouvelles sessions
- Fixed startup hang jusqu'à 75s quand `api.anthropic.com` est injoignable (captive portal, VPN) — side-channel timeouts réduits à 15s
- `/bg` et `←`-detach préservent les répertoires ajoutés via `/add-dir`

**v2.1.145** ⚠️ Security fix
- **Security fix** : bypass auto-approve sur les assignations de variables non-allowlistées dans les commandes Bash (ex: `FOO=bar cmd`) — désormais soumis au prompt de permission
- `claude agents --json` : liste les sessions CC en JSON pour scripting (tmux-resurrect, status bars, session pickers)
- Stop et SubagentStop hook input contiennent maintenant `background_tasks` et `session_crons` — permet aux hooks de détecter les tâches en arrière-plan avant la fin de session
- Status line JSON input inclut repo GitHub et PR quand détectés
- Read tool : retourne une première page tronquée avec notice "PARTIAL view" au lieu d'une erreur dure si le fichier dépasse la limite tokens
- Fixed skill `context: fork` boucle infinie (se ré-invoque lui-même) — résout bug #40104 workaround partiellement

### v2.1.140–2.1.143

**v2.1.141**
- `terminalSequence` champ dans le JSON output d'un hook : émet notifications desktop, window titles, bells sans accès au terminal contrôlant
- `ANTHROPIC_WORKSPACE_ID` env var : workload identity federation, scope le token à un workspace spécifique
- `/bg` et `←←` preservent maintenant le permission mode actif (ne reviennent plus au mode par défaut)

**v2.1.142**
- `claude agents` flags : `--add-dir`, `--settings`, `--mcp-config`, `--plugin-dir`, `--permission-mode`, `--model`, `--effort`, `--dangerously-skip-permissions` pour configurer les background sessions dispatched
- **Fast mode → Opus 4.8** par défaut (était 4.6). Opt-out : `CLAUDE_CODE_OPUS_4_6_FAST_MODE_OVERRIDE=1`
- Plugin avec `SKILL.md` à la racine et sans `skills/` subdirectory est maintenant surfacé comme skill

**v2.1.143**
- **Plugin dependency enforcement** : `claude plugin disable` refuse si un autre plugin enabled dépend de la cible (hint disable-chain fourni) ; `claude plugin enable` force-active les dépendances transitives
- `worktree.bgIsolation: "none"` : background sessions peuvent éditer le working copy directement sans `EnterWorktree` — pour repos où les worktrees sont impraticables
- `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` : nombre max de blocks consécutifs Stop hook (défaut 8). Evite les boucles infinies. Le tour se termine avec warning au-delà.
- `/bg` préserve `--mcp-config`, `--settings`, `--add-dir`, `--plugin-dir`, `--strict-mcp-config` lors du respawn des background sessions
- `claude --bg --dangerously-skip-permissions` persiste à travers retire/wake

### v2.1.133–2.1.139

**v2.1.133**
- `worktree.baseRef: "fresh" | "head"` — contrôle si `--worktree`/`EnterWorktree` branche depuis `origin/<default>` (fresh, défaut) ou `HEAD` local (head)
- `sandbox.bwrapPath` / `sandbox.socatPath` managed settings (Linux/WSL) — chemin custom pour bubblewrap et socat
- `parentSettingsBehavior: "first-wins" | "merge"` — admin tier, contrôle la fusion des managedSettings parent
- Hooks reçoivent `effort.level` dans leur JSON input et `$CLAUDE_EFFORT` comme env var Bash

**v2.1.136**
- `settings.autoMode.hard_deny` — règles classifier qui bloquent inconditionnellement (pas d'exception user intent)
- Fix MCP OAuth multi-server concurrent (tokens perdus en parallèle → plus de re-auth quotidienne)
- Fix plan-mode qui n'bloquait pas les writes avec des règles `Edit(...)` allow existantes

**v2.1.139**
- **Agent view** : `claude agents` — liste toutes les sessions CC (running, blocked, done) en Research Preview
- **`/goal` command** : définit une condition de completion ; Claude tourne jusqu'à satisfaction (interactive, `-p`, Remote Control). Overlay live elapsed/turns/tokens
- **Hook `args: string[]`** (exec form) : lance la commande directement sans shell, aucun quoting de placeholders nécessaire
- **Hook `continueOnBlock`** (PostToolUse) : si `true`, le motif de rejet est renvoyé à Claude qui continue le tour
- MCP stdio servers reçoivent `CLAUDE_PROJECT_DIR` dans leur env (comme les hooks). Variable `${CLAUDE_PROJECT_DIR}` utilisable dans plugin configs
- Subagent API requests portent `x-claude-code-agent-id` / `x-claude-code-parent-agent-id` headers ; OTEL spans `claude_code.llm_request` incluent `agent_id` / `parent_agent_id`
- Remote Control, `/schedule`, claude.ai MCP connectors et notification prefs désactivés si `ANTHROPIC_API_KEY`/`apiKeyHelper`/`ANTHROPIC_AUTH_TOKEN` est set

### Microsoft Foundry Integration

Enterprise deployment option alongside AWS Bedrock and Google Vertex. Env vars: `CLAUDE_CODE_USE_FOUNDRY=1` + `ANTHROPIC_FOUNDRY_RESOURCE` (resource identifier). Auth via Microsoft Entra ID or API key. Provides enterprise-grade compliance, networking, and access control through the Microsoft Azure ecosystem.

---

## Agent Teams (experimental)

Multi-agent orchestration. Env: `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`.

| Component | Role |
|-----------|------|
| Team Lead | Creates team, coordinates, approves plans |
| Teammates | Independent CC instances, own 1M context each |
| Task List | Shared, with states (pending/in-progress/completed) + dependencies |
| Mailbox | Direct peer-to-peer messaging + broadcast |

**vs Subagents:** Subagents report only to parent. Teams have peer-to-peer communication, shared task list, autonomous coordination.

**Best practices:** 3-5 teammates, 5-6 tasks each, avoid same-file edits across teammates.
**Hooks:** `TeammateIdle`, `TaskCreated`, `TaskCompleted` (exit code 2 = reject/feedback).
**Limitations:** No nested teams, no lead promotion, one team per session, no session resumption with in-process teammates.

---

## Managed Agents (Platform, v2026-04-01)

Anthropic's managed infrastructure for deploying autonomous agents as a hosted service.

**API access:** Requires beta header `managed-agents-2026-04-01`.

**Resources:** agents, sessions, environments, events, deployments, skills. All manageable via API or CLI.

**Tool type:** `agent_toolset_20260401` — includes bash, file operations, and web search.

**Pricing:** $0.08/session-hour + standard token costs.

**SDKs:** Python, TypeScript, Go, Java, C#, Ruby, PHP.

**Agent definitions:** YAML-based, version-controllable, CI/CD deployable. Define agent behavior, tools, and constraints in declarative config files.

**ant CLI:** Official Go CLI for managed agents. Install: `brew install anthropics/tap/ant`. Resource-based commands use `beta:` prefix for managed agent resources (e.g., `ant beta:agents list`, `ant beta:sessions create`).
