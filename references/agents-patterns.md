# Agent & Orchestration Patterns for Claude Code

Reference for designing agents, choosing orchestration patterns, and structuring context.

---

## 1. Agent Definition Reference

Agents live in `.claude/agents/` as `.md` or `.json` files. Claude Code discovers them automatically.

### Markdown Format (.md)

```markdown
---
name: builder
description: Implements features from a structured plan
model: claude-opus-4-8
tools:
  - Read
  - Edit
  - Write
  - Bash
  - Glob
  - Grep
allowed_tools_pattern: "mcp__*"
max_turns: 50
---

You are a builder agent. You receive a plan and implement it exactly.

## Rules
- Read the plan file first
- Implement one task at a time
- Commit after each task
- Never modify the plan
```

### JSON Format (.json)

```json
{
  "name": "reviewer",
  "description": "Reviews code for quality and correctness",
  "model": "opus",
  "tools": ["Read", "Glob", "Grep", "Bash"],
  "max_turns": 20,
  "system_prompt": "You review code. Be terse. Flag bugs, not style."
}
```

### Available Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Unique identifier |
| `description` | string | yes | What triggers this agent (acts as routing key) |
| `model` | string | no | `opus`, `sonnet`, `haiku` (default: session model) |
| `effort` | string | no | Reasoning effort: `min`, `low`, `medium`, `high`, `max` |
| `tools` | string[] | no | Allowed tools (default: all) |
| `disallowedTools` | string[] | no | Explicitly blocked tools |
| `allowed_tools_pattern` | string | no | Glob for additional tools (e.g. `mcp__*`) |
| `skills` | string[] | no | Skills available to this agent |
| `mcpServers` | object | no | MCP server connections for this agent |
| `hooks` | object | no | Agent-specific hooks (same format as settings.local.json) — apply only to this agent's lifecycle (v2.1.117+) |
| `context` | string | no | Context inheritance: `shared` (default, inherits parent) / `fork` (clean slate, no parent context — prevents anchoring bias) / `summary` (receives compressed parent summary) (v2.1.117+) |
| `max_turns` | number | no | Turn limit before forced stop |
| `memory` | string | no | Memory scope: `user`, `project`, `local` |
| `isolation` | string | no | `"worktree"` — runs in isolated git working copy |
| `background` | boolean | no | Run agent in background (non-blocking) |
| `permissionMode` | string | no | `default`, `plan`, `acceptEdits`, `bypassPermissions`, `auto` |
| `initialPrompt` | string | no | First prompt sent to agent on spawn (v2.1.83+) |
| `system_prompt` | string | no | Instructions (JSON only; in MD, use body text) |

### Model Strategy

| Tier | Model | Use For |
|---|---|---|
| All tasks | Opus | All agents — architecture, implementation, review, operations |

Always use Opus for all agents. Never use Haiku or Sonnet.

**Hard rule:** Never use Haiku or Sonnet for any agent, regardless of task complexity. This is a non-negotiable preference. Even for "simple" tasks, Opus produces significantly better results that compound over the project lifecycle.

---

### Built-in Agent Types

Claude Code ships with 3 built-in agent types that can be used via the Agent tool:

| Type | Purpose | Tools |
|---|---|---|
| `general-purpose` | Default. Multi-step research and code tasks | All |
| `Explore` | Fast codebase exploration — file patterns, keyword search, architecture questions | All except Agent, Edit, Write, NotebookEdit |
| `Plan` | Software architecture planning — step-by-step plans, critical files, trade-offs | All except Agent, Edit, Write, NotebookEdit |

Custom agents extend these capabilities with project-specific instructions and tool restrictions.

### Agent Memory Scopes

Agents can persist data across sessions via the `memory` field:

- `user` — memories visible to this user across all projects
- `project` — memories scoped to the current project directory
- `local` — memories private to this agent instance

### Agent Isolation

Set `isolation: "worktree"` to run an agent in a temporary git worktree. This gives each agent its own copy of the repository — no merge conflicts when multiple agents work in parallel. The worktree is auto-cleaned if no changes are made.

---

## 2. Orchestration Patterns

### Pattern A: Solo Agent

**When:** Single-scope task, < 30 minutes, no parallelism needed.

```
User -> Agent -> Done
```

No orchestration overhead. One agent, one task, one commit.

### Pattern B: Planner + Executor

**When:** Medium tasks requiring a plan before execution. 1-3 hours of work.

```
User -> Planner (Opus) -> Plan File -> Executor (Opus) -> Done
```

The planner produces a structured plan file. The executor reads it and implements. They never share context directly -- the plan file is the interface.

Key rules (GSD):
- Plans are prompts, not documents. Write them so an agent can execute without ambiguity.
- The planner never writes code.
- The executor never deviates from the plan.

### Pattern C: Wave Execution

**When:** Complex multi-feature work with dependency ordering. 3+ hours.

```
Planner -> Plan with Waves
  Wave 1: [Agent A, Agent B, Agent C]  (parallel, no deps)
  Wave 2: [Agent D, Agent E]           (depends on Wave 1)
  Wave 3: [Agent F]                    (depends on Wave 2)
```

From GSD. Each wave contains independent tasks that run in parallel. Waves execute sequentially. Each agent gets fresh context (no accumulated garbage).

Implementation:
1. Planner analyzes requirements, identifies tasks, maps dependencies
2. Planner groups tasks into waves (DAG ordering)
3. Orchestrator spawns agents per wave, waits for completion
4. Next wave starts only when previous wave fully succeeds

### Pattern D: Sprint Workflow

**When:** Full product cycle from idea to shipped feature.

```
Think -> Plan -> Build -> Review -> Test -> Ship -> Reflect
```

From gstack. Each phase has clear entry/exit criteria:

| Phase | Agent | Exit Criteria |
|---|---|---|
| Think | Opus | Problem statement + constraints documented |
| Plan | Opus | Numbered task list with acceptance criteria |
| Build | Opus | All tasks implemented, code compiles |
| Review | Opus | No critical issues, style clean |
| Test | Opus | All tests pass, edge cases covered |
| Ship | Opus | PR created, changelog updated |
| Reflect | Opus | Retro notes saved for next sprint |

The Conductor (gstack) can run multiple sprints in parallel across different features.

### Pattern E: Continuous Loop

**When:** Autonomous development over extended periods.

From ECC (affaan-m), 6 sub-patterns:

| Loop | Description | Use Case |
|---|---|---|
| Sequential Pipeline | A -> B -> C -> D, linear | Migration, refactoring |
| NanoClaw REPL | Read-Eval-Print with self-correction | Exploratory coding |
| Infinite Agent Loop | Agent spawns next agent on completion | Long-running autonomous work |
| Continuous PR Loop | Pick issue -> implement -> PR -> repeat | Issue queue draining |
| De-sloppify | Implement -> review -> clean -> repeat | Quality-first development |
| RFC-driven DAG | RFC doc defines dependency graph of tasks | Large architecture changes |

Critical: every loop MUST have an exit condition (max iterations, empty queue, time limit). Loops without exits consume unbounded resources.

### Pattern F: Complexity Routing

**When:** Variable-size tasks where agent overhead should match task scope.

Source: shinpr/claude-code-workflows. Route tasks through different pipeline depths based on estimated scope:

| Complexity | Criteria | Pipeline |
|---|---|---|
| Small | 1-2 files changed | Direct execution (no planning overhead) |
| Medium | 3-5 files changed | Analyze → Design → Execute |
| Large | 6+ files changed | PRD → Analyze → Design → Execute |

Specialized agents per phase: `requirement-analyzer`, `codebase-analyzer`, `technical-designer`, `code-verifier`, `quality-fixer`, `security-reviewer`.

Key principles:
- **Vertical slice decomposition** — break features into end-to-end slices (route → handler → DB → UI) rather than horizontal layers
- **Fresh context per phase** — each agent starts clean, receives only the output of the previous phase (no accumulated context drift)
- **Stage gates** — each phase produces a deliverable that must pass validation before the next phase starts

**When to recommend:** Projects with mixed task sizes (quick fixes alongside large features). Avoids over-planning small changes while ensuring large changes get proper architecture review.

---

## 3. Context Engineering

### The GSD Context File System

Place these in the project root. Agents read them for grounding.

| File | Purpose | Updated By |
|---|---|---|
| `PROJECT.md` | What the project is, tech stack, structure | Human (rarely changes) |
| `REQUIREMENTS.md` | Functional requirements, constraints | Human + Planner |
| `ROADMAP.md` | Phases, milestones, current phase | Human + Planner |
| `STATE.md` | Current status, what's done, what's next | Agents (after each task) |
| `CONTEXT.md` | Session-specific notes, decisions, blockers | Agents (per session) |
| `PLAN.md` | Current execution plan (the prompt) | Planner only |

### Rules for Context Files

1. **Fresh context per agent.** Never pass accumulated chat history. Point agents to files.
2. **STATE.md is the source of truth.** Every agent updates it after completing work.
3. **Plans are prompts.** Write PLAN.md so an LLM can execute it without asking questions.
4. **Lock decisions.** Once a decision is made and recorded, it is non-negotiable. Agents must not re-debate locked decisions (GSD: "user decision fidelity").
5. **Keep files short.** If a context file exceeds 200 lines, split it.

---

## 4. Anti-patterns

| Anti-pattern | Why It Fails |
|---|---|
| Unbounded agent spawning | Resource exhaustion, no convergence |
| Shared mutable context | Race conditions, stale reads, context rot |
| No exit conditions on loops | Infinite execution, wasted tokens |
| Orchestrator does implementation | Loses oversight, context bloat |
| Passing full chat history to subagents | Context window waste, irrelevant noise |
| Single mega-agent for everything | No parallelism, single point of failure |
| Skipping the plan phase | Rework, inconsistent implementation |
| Agents modifying each other's files simultaneously | Merge conflicts, lost work |
| No STATE.md updates | Next agent has no idea what happened |
| Over-specifying agent instructions | Brittleness, can't adapt to edge cases |

---

## 5. Template: Agent JSON

```json
{
  "name": "feature-builder",
  "description": "Implements a single feature from PLAN.md. Reads the plan, implements the assigned task, writes tests, updates STATE.md.",
  "model": "opus",
  "tools": ["Read", "Edit", "Write", "Bash", "Glob", "Grep"],
  "max_turns": 40,
  "system_prompt": "You are a feature builder.\n\n## Process\n1. Read PLAN.md to find your assigned task\n2. Read STATE.md for current project status\n3. Implement the task exactly as specified\n4. Write tests for the new code\n5. Run tests and fix failures\n6. Update STATE.md with completion status\n7. Create an atomic git commit\n\n## Rules\n- Never modify PLAN.md\n- Never skip tests\n- One commit per task\n- If blocked, document the blocker in STATE.md and stop"
}
```

---

## 6. Self-Learning & Session Meta-Patterns

Source: ecosystem survey 2026-04-11

### Claudeception: Self-Learning Meta-Skill

Pattern from Siqi Chen (@blader, 1.4k stars). A meta-skill that observes completed sessions, detects reusable knowledge, and auto-generates new skills.

**Flow:**
1. Session completes
2. PostSession hook triggers analysis agent
3. Agent scans conversation for: repeated patterns, tool sequences, domain knowledge
4. If a reusable pattern is found, generates a SKILL.md draft
5. Draft saved to `.claude/skills-draft/` for human review

**When to recommend:** Projects with 10+ Claude Code sessions where the user repeatedly solves similar problems.

### Session Auto-Rotation (Clauditor Pattern)

Monitors active session token consumption and triggers a structured handoff when waste exceeds a threshold.

**Handoff protocol:**
1. Save current task state to `STATE.md`
2. Save working context to `CONTEXT.md`
3. End current session
4. New session reads state files and continues

**When to recommend:** Users hitting rate limits or working on sessions > 2 hours.

### Skill Creation Pipeline (Skillify Pattern)

Source: 0xMH/claude-skillify (extracted from Anthropic's internal `/skillify`).

Interview-based flow for generating SKILL.md from completed workflows:
1. Analyze session transcript for distinct workflow phases
2. Interview user about intent, triggers, success criteria
3. Generate structured SKILL.md with frontmatter, phases, exit criteria
4. Validate against skill-optimizer's 14 static checks

**When to recommend:** INIT phase when user describes workflows that could become skills.

### Domain-Specific Team Assembly (Harness Pattern)

Source: ecosystem survey 2026-04-11 (revfactory/harness, 2,285 stars)

A meta-skill that generates entire agent teams tailored to a specific domain. Instead of generic planner/executor/reviewer agents, it creates domain-aware specialists.

**Flow:**
1. Analyze the project domain (e-commerce, fintech, healthcare, etc.)
2. Identify domain-specific concerns (compliance, billing, patient data, etc.)
3. Generate specialized agents with domain knowledge baked into their system prompts
4. Wire agents into an orchestration pattern (Wave or Sprint)

**Example:** For a fintech project, generates: `compliance-reviewer` (checks for PCI-DSS), `api-security-auditor` (checks for financial data exposure), `settlement-tester` (validates money flow), plus standard planner/executor.

**When to recommend:** INIT for projects in regulated or specialized domains where generic agents miss critical domain constraints.

### Memory Compilation (claude-memory-compiler Pattern)

Source: ecosystem survey 2026-04-11 (coleam00/claude-memory-compiler, 519 stars)

A post-session agent that compiles raw session memory into structured knowledge. Unlike raw memory accumulation, compilation explicitly filters noise and normalizes format.

**Architecture:**
- PostSession hook → compilation agent (Agent SDK)
- Agent reads session transcript + existing memory files
- Extracts: decisions, patterns, constraints, domain facts
- Writes compiled knowledge to `.claude/memory/` as atomic YAML/MD facts
- SessionStart hook loads relevant compiled memory

**When to recommend:** Projects with 15+ sessions, growing memory files, or team setups where compiled knowledge is shared across developers.

---

## 7. CLI Claude as AI Engine

Some projects use Claude Code not just as a dev assistant, but as the runtime AI engine for the product (e.g., generating exercises, processing data, running analyses).

**Detection signals:**
- User has Max Plan and explicitly avoids API keys
- The product's core feature IS AI-generated content
- No `@anthropic-ai/sdk` or `openai` in dependencies

**Configuration:**
- Never suggest using an API key when the user has CLI access
- Configure prompts and workflows to use `claude` CLI for AI processing
- Add to CLAUDE.md: explicit note that Claude Code is the AI engine, not a dev tool
- Mock generators and fake data are forbidden — Claude generates real content

**Agent topology:**
- Main orchestrator handles user requests
- Specialized agents handle domain-specific generation (exercises, content, analysis)
- All agents use `model: claude-opus-4-8`

---

## 8. Agent Teams vs Scheduled/Background Agents

Two distinct agent orchestration modes exist in the ecosystem. Do not confuse them.

**Agent Teams (Claude Code built-in):**
- Interactive, session-scoped multi-agent collaboration
- Agents defined in `.claude/agents/` with YAML/MD
- User spawns agents via `Agent` tool during a conversation
- Agents share the conversation context and terminate with the session
- Best for: development tasks, code generation, review cycles

**Scheduled/background agents:**
- Autonomous, 24/7 orchestration with persistent state
- Agents run on schedules or event triggers (heartbeats/cron), not user sessions
- Task management via a queue or issue tracker, with claim/release coordination
- Agents communicate through a shared task store and assignments, not shared context
- Best for: continuous improvement loops, monitoring, cross-project automation

**When to recommend which:**
- If the user needs agents collaborating within a coding session → Agent Teams
- If the user needs agents running autonomously on schedules → scheduled/background agents
- Both can coexist: Agent Teams for dev work, a background agent loop for maintenance/evolution

---

## 9. Agent SDK Programmatic Patterns

For building agents programmatically (pipelines, CI/CD, external orchestrators).

### Pattern F: One-Shot Pipeline (TypeScript V1)

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";
for await (const msg of query({
  prompt: "Run tests and fix failures",
  options: {
    allowedTools: ["Read", "Edit", "Bash", "Glob", "Grep"],
    permissionMode: "bypassPermissions",
    model: "claude-opus-4-6",
    maxTurns: 30,
    maxBudgetUsd: 5.0,
    systemPrompt: { type: "preset", preset: "claude_code" },
    settingSources: ["project"],
  }
})) {
  if ("result" in msg) console.log(msg.result);
}
```

### Pattern G: Multi-Turn Session (TypeScript V2 preview)

```typescript
import { unstable_v2_createSession } from "@anthropic-ai/claude-agent-sdk";
await using session = unstable_v2_createSession({ model: "claude-opus-4-6" });
await session.send("Analyze the codebase architecture");
for await (const msg of session.stream()) { /* process */ }
await session.send("Now refactor the auth module based on your analysis");
for await (const msg of session.stream()) { /* process */ }
```

### Pattern H: Custom Tool Server

```typescript
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
const searchTool = tool("search", "Search codebase", { q: z.string() },
  async ({ q }) => ({ content: [{ type: "text", text: `Results for: ${q}` }] })
);
const server = createSdkMcpServer({ name: "custom", tools: [searchTool] });
```

### Pattern I: Python Persistent Client

```python
from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions
options = ClaudeAgentOptions(permission_mode="acceptEdits", model="claude-opus-4-6")
async with ClaudeSDKClient(options=options) as client:
    await client.query("Analyze the bug report")
    async for msg in client.receive_response(): print(msg)
    await client.query("Apply the fix")  # retains context
    async for msg in client.receive_response(): print(msg)
```

### Key SDK Differences

| | V1 (TS) | V2 Preview (TS) | Python |
|---|---|---|---|
| Interface | `query()` async gen | `session.send()/stream()` | `query()` or `ClaudeSDKClient` |
| Multi-turn | New query each time | Same session | `ClaudeSDKClient` |
| Custom tools | `tool()` + `createSdkMcpServer()` | Same as V1 | `@tool` decorator |
| Session fork | Yes | No | No |

---

## 10. Agent Teams Deep Patterns

Experimental (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`). For parallel work within a single coding session.

### Architecture

- **Team Lead**: main session, creates tasks, approves teammate plans
- **Teammates**: independent CC instances (own 1M context each), claim tasks from shared list
- **Task List**: shared state with pending/in-progress/completed + dependency management
- **Mailbox**: `message` (point-to-point) + `broadcast` (all teammates)

### When to Use

- Large refactors with independent subsystems (e.g., frontend + backend + tests)
- Parallel feature implementation across modules
- Research + implementation in parallel

### Configuration

- Display: `in-process` (Shift+Down) or `tmux`/iTerm2 split panes
- Storage: `~/.claude/teams/{name}/config.json`, `~/.claude/tasks/{name}/`
- Teammates inherit permissions from lead

### Limits

- 3-5 teammates optimal, 5-6 tasks each
- No same-file edits across teammates (use file-locking)
- One team per session, no nested teams, no lead promotion
- Hooks: `TeammateIdle`, `TaskCreated`, `TaskCompleted`

### Managed Agents (Official Guidance)

From `anthropics/skills` repo (commit ca1e7dc) — official guidance on managing agents in Claude Code:

- Agents defined in `.claude/agents/` with YAML frontmatter
- `model: claude-opus-4-8` recommended for complex, multi-step reasoning
- Agent isolation: each agent runs in its own context, inherits project CLAUDE.md
- Management patterns:
  - **Direct delegation**: parent agent spawns child with specific task
  - **Team assembly**: define a team of agents for different aspects of a project
  - **Supervision**: parent agent monitors child output, intervenes when needed
- Key fields: `name`, `description`, `model`, `allowedTools`, `disallowedTools`, `maxTurns`, `skills`, `hooks`, `permissionMode`

---

## 11. Production Multi-Agent Patterns (Anthropic Internal)

Patterns extracted from Anthropic's internal use of multi-agent systems at scale.

### 5-Agent PR Review (Anthropic Internal)

Anthropic uses 5 independent specialized agents to review every PR:

| Agent | Role |
|---|---|
| CLAUDE.md Compliance Checker | Verifies PR respects project conventions defined in CLAUDE.md |
| Bug Detection Agent | Static + semantic analysis for logic errors, edge cases, regressions |
| Git History Context Agent | Analyzes blame, recent changes to touched files, related commits |
| Previous PR Comments Reviewer | Checks if feedback from prior reviews was addressed |
| Code Comments Verifier | Validates inline comments accuracy, detects stale/misleading comments |

**Results:** confidence scoring 0-100 (threshold 80), 84% real bug detection rate, $15-25 per review, ~20min wall time. Internal PR review coverage went from 16% to 54%.

**Key insight:** independent parallel agents with strict specialization outperform a single broad reviewer. Each agent has a narrow focus and produces a confidence score — the orchestrator aggregates scores and flags PRs below threshold for human review.

### 16-Agent Parallel Compiler (Anthropic Internal)

16 Opus 4.6 agents building a C compiler in parallel.

**Synchronization mechanism:**
- Lock files in `current_tasks/` directory for task claiming (no external service)
- Native git for code integration between agents
- Each agent claims a task by creating a lock file, releases on completion

**Output discipline:**
- Grep-friendly output with `ERROR` markers (avoids context window pollution)
- Structured formatting so orchestrator can parse results without reading full output
- Failed tasks produce machine-readable error summaries

**Fast verification mode:**
- `--fast` flag: 1-10% random test sampling for rapid iteration cycles
- Full test suite runs only on merge candidates
- Statistical sampling catches most regressions at a fraction of the cost

**Stats:** 2000 sessions, 2B input tokens, 140M output tokens, ~$20k total cost.

**Key patterns:**

| Pattern | Description |
|---|---|
| Context pollution avoidance | Grep-friendly formatting with clear markers, no verbose output |
| Fast verification mode | Statistical test sampling instead of full suite during development |
| File-based coordination | Lock files for task claiming without external orchestration service |

### When to Use

| Scenario | Pattern | Trigger |
|---|---|---|
| PR review automation | 5-Agent PR Review | >5 contributors or security-critical codebase |
| Large parallel compilation | 16-Agent Compiler | Tasks with clear file-level boundaries, large codebase |
| Cost justification | Either | Bug cost >> review cost ($15-25 per review) |

**Not appropriate for:** small teams (<3 devs), projects with fewer than 10 PRs/week, codebases where most changes touch shared state (high merge conflict risk).

---

## 12. Agent View & /goal (v2.1.139)

### Agent View — `claude agents`

Research Preview TUI that shows all Claude Code sessions on the machine in a single screen (running, blocked, completed). Supervisor process manages sessions; each runs in background with optional worktree isolation.

**Key CLI flags:**

| Flag | Effect |
|---|---|
| `claude agents` | Open Agent View TUI hub |
| `claude --bg "<prompt>"` | Start a session in the background |
| `claude --agent <name> --bg` | Background session with specific subagent |
| `/bg` or `<` in TUI | Move current session to background |
| `claude respawn --all` | Restart all sessions after sleep/shutdown |

**Scheduled-agent compatibility:** background sessions map directly to heartbeat/cron execution. When building scheduled or background agents, prefer `--bg` for long-running tasks — the supervisor process keeps them alive across sleep cycles.

**In INIT/AUDIT:** add to `.claude/CLAUDE.md` a note about using Agent View for parallel subagent monitoring. Replace multi-terminal setups.

### /goal — Autonomous Loop Until Condition

Defines a completion condition in natural language. Claude runs until Haiku (as evaluator) confirms the condition is met. Works in interactive mode, `claude -p`, and Remote Control.

```bash
# Interactive
/goal all tests pass and lint is clean

# Headless pipeline
claude -p "/goal CHANGELOG has an entry for every PR merged this week"
```

**Live overlay:** shows elapsed time, turn count, and token usage while running.

**Integration patterns:**

| Use case | /goal prompt |
|---|---|
| CI gate | `all TypeScript errors resolved and tests green` |
| Background audit | `self-check passes all 46+ assertions` |
| Release readiness | `CHANGELOG updated and no open critical issues` |
| Refactor completion | `no TODO comments remain in src/ and coverage stays above 80%` |

**Anti-patterns:**
- Avoid vague conditions (`"the code is good"`) — Haiku can't verify these reliably.
- Add a `max_turns` bound in headless pipelines to prevent unbounded execution.
- Pair with `continueOnBlock: true` PostToolUse hooks so quality gate failures trigger retries instead of stops.
