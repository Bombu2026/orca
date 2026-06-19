# Best Practices: Claude Code Community Reference

Consolidated practices from the top community repos. Each section cites its source for traceability.

---

## Trail of Bits — Skill Design Principles

Gold standard for writing Claude Code skills and custom slash commands.

### 6 Essential Principles

1. **Description is the only trigger.** Claude routes to a skill based solely on its `description` field. If the description doesn't match the user's intent, the skill never fires. Write descriptions as trigger conditions, not marketing copy.

2. **Numbered phases.** Structure every skill as numbered phases with explicit entry/exit criteria. Phases give the model a clear execution path and prevent it from skipping steps or inventing its own workflow.

3. **Tool matching.** Each phase should specify which tools to use. Don't leave tool selection to the model when the correct tool is known. "Use Grep to find all references" beats "find all references."

4. **Progressive disclosure.** Start with the minimum context needed. Add detail only when the model reaches the phase that needs it. Front-loading 500 lines of instructions wastes context window and confuses routing.

5. **Scalable tool patterns.** Design skills that work on 10-file repos and 10,000-file repos. Use Glob/Grep for discovery instead of hardcoded paths. Never assume directory structure.

6. **Instruction specificity.** Vague instructions produce vague results. "Review the code" fails. "Check for SQL injection in all route handlers using parameterized query validation" succeeds.

### Critical Anti-patterns (Trail of Bits AP Index)

| ID | Anti-pattern | Fix |
|---|---|---|
| AP-1 | No description trigger | Write a description that matches user intent |
| AP-2 | Monolithic prompt (500+ lines) | Split into phases with progressive disclosure |
| AP-3 | Tool-agnostic instructions | Specify exact tools per phase |
| AP-4 | No exit criteria | Every phase needs a completion condition |
| AP-5 | Hardcoded file paths | Use Glob/Grep for discovery |
| AP-6 | Over-broad description | Narrow the trigger to specific intents |
| AP-7 | Missing error handling | Define what happens when a phase fails |
| AP-8 | No output format spec | Specify the exact output shape |
| AP-9 | Interactive assumptions | Skills run non-interactively; don't prompt for input mid-flow |
| AP-10 | Unbounded iteration | Set max iterations or token budgets |
| AP-11 | CLAUDE.md describes non-existent features | Verify every CLAUDE.md claim exists in the codebase |
| AP-12 | Mock AI in AI-powered apps | When `claude -p` is the AI engine, never use mock generators or fake data — Claude generates real content. Mock tests passed but production broke because the mock diverged from real AI output. |

### Pattern Selection Decision Tree

```
Is the task a simple routing decision?
  Yes -> Routing Pattern (match intent to handler)
  No  ->
    Is it a linear sequence of steps?
      Yes -> Does it need safety checks between steps?
        Yes -> Safety Gate Pattern (check before proceeding)
        No  -> Sequential Pipeline (A -> B -> C)
      No  ->
        Is it driven by a list of items?
          Yes -> Task-driven Pattern (iterate over items)
          No  -> Linear Progression (phased with state)
```

---

## GSD (Get Shit Done) — Context Engineering

### Core Principles

**Context files are the API between agents.** Agents communicate through files, not shared memory. The file system is the message bus.

- `PROJECT.md` — What the project is. Written by humans. Rarely changes.
- `REQUIREMENTS.md` — Functional requirements and constraints. Updated when scope changes.
- `ROADMAP.md` — Phases and milestones. Updated at phase boundaries.
- `STATE.md` — Current status. Updated by every agent after every task.

**Plans are prompts, not documents.** A plan must be executable by an LLM without clarification. If an agent needs to ask a question after reading the plan, the plan failed.

**Fresh context per executor.** Never pass accumulated chat history to a subagent. Point it to the relevant context files. Accumulated context contains noise, outdated info, and reasoning traces that waste tokens.

**Wave-based parallel execution.** Group independent tasks into waves. Execute each wave in parallel. Wait for completion before starting the next wave. This maximizes throughput while respecting dependencies.

**The orchestrator never does heavy lifting.** The orchestrator reads plans, spawns agents, and checks results. It never writes code, never edits files, never runs tests. If the orchestrator is doing real work, the architecture is wrong.

**Atomic git commits per task.** Each task produces one commit. Never batch multiple tasks into one commit. This makes rollback trivial and blame meaningful.

**User decision fidelity.** When a human makes a decision, it's locked. Record it in the context files. Agents must never re-debate, second-guess, or silently override a locked decision.

---

## ECC (Everything Claude Code) — Hooks & Loops

### Hook Layering

Hooks fire in priority order. Layer them:

1. **Security hooks** (highest priority) — Block secrets in commits, prevent force-push to main, reject unsafe bash commands
2. **Quality hooks** — Lint on save, type-check before commit, test before push
3. **DX hooks** (lowest priority) — Format on save, auto-import, notification on completion

Security hooks must be synchronous and blocking. Quality hooks can be synchronous. DX hooks should be asynchronous (non-blocking).

### 6 Autonomous Loop Patterns

| Pattern | Flow | Best For |
|---|---|---|
| Sequential Pipeline | A -> B -> C -> D | Migrations, multi-step refactors |
| NanoClaw REPL | Read -> Eval -> Check -> Fix -> Repeat | Exploratory development, prototyping |
| Infinite Agent Loop | Agent completes -> spawns successor | Long-running autonomous sessions |
| Continuous PR Loop | Pick issue -> branch -> implement -> PR -> next | Issue queue processing |
| De-sloppify | Implement -> self-review -> clean up -> repeat | Quality-first feature development |
| RFC-driven DAG | RFC defines task graph -> execute in topo order | Large architecture changes |

### De-sloppify Pattern (Detail)

After every implementation step:
1. Re-read what was written
2. Check for: dead code, inconsistent naming, missing error handling, duplicated logic, incomplete types
3. Fix everything found
4. Only then proceed to the next task

This adds ~20% overhead but prevents the exponential quality debt of "fix it later."

### Quality Gates

Run quality checks asynchronously so they don't block the developer:
- Type check on file save (background)
- Lint on file save (background)
- Full test suite on pre-commit (blocking)
- Security scan on pre-push (blocking)

### Session Persistence

When context compaction approaches, save session state:
- Current task and progress to `STATE.md`
- Open questions to `CONTEXT.md`
- Next steps to `PLAN.md`

On resume, the new session reads these files and continues without re-deriving state.

---

## gstack — Sprint Workflow

### Sprint Phases

```
Think -> Plan -> Build -> Review -> Test -> Ship -> Reflect
```

Each phase has a single owner and clear exit criteria. Never skip phases. Never merge phases.

### Completeness Principle

> When the marginal cost of doing something completely is near zero, do it completely.

If you're already editing a file, fix all issues in that file -- not just the one you came for. If you're writing a function, handle all edge cases -- not just the happy path. The cost of revisiting later always exceeds the cost of finishing now.

### AskUserQuestion Format

When an agent must ask the user a question:

1. **Re-ground** — State the current context in one sentence
2. **Simplify** — Reduce the question to its essence
3. **Recommend** — Provide options with confidence scores
4. **Letter** — Label options A, B, C for easy selection

```
Working on the auth middleware for the dashboard API.

The session token can be validated server-side or client-side:

A) Server-side validation in middleware.ts (recommended, 90% confidence)
   - More secure, single validation point, slight latency cost
B) Client-side validation with token refresh
   - Faster initial load, requires refresh logic, wider attack surface
C) Hybrid: server validates on first request, client caches
   - Best UX, highest complexity

Recommendation: A
```

### Atomic Observability

All I/O operations (file reads, API calls, database queries) wrapped in try/catch. Log the operation, not just the error. Never let an I/O failure crash the core workflow -- degrade gracefully.

### Interactive Grounding

When 3+ sessions are active simultaneously, each agent must re-state its task and current status at the start of every response. This prevents context drift when the human is context-switching between agents.

---

## Universal Rules

These apply regardless of which patterns you use.

### Tool Usage

- **Always read before writing.** Use Read before Edit. Always.
- **Glob/Grep/Read over Bash equivalents.** Never `cat`, `grep`, `find` via Bash when dedicated tools exist. The dedicated tools handle permissions, large outputs, and error cases better.
- **Glob for discovery, Grep for content, Read for context.** Use each tool for its intended purpose.

### Skill Design

- **Skills under 500 lines.** If a skill exceeds this, split it into phases or sub-skills with progressive disclosure.
- **Description is the only trigger mechanism.** The description field determines when a skill fires. Everything else is implementation detail.
- **Exit criteria for every phase.** A phase without exit criteria will run forever or stop randomly.
- **Skill compaction budget: 5K tokens/skill, 25K total.** CC re-injects active skills on compaction with a hard limit of 5K tokens per skill (truncated if longer) and 25K tokens shared across all active skills. Keep SKILL.md under ~4K tokens to stay safely under the per-skill limit. Source: official CC docs (code.claude.com/docs/en/skills.md).
- **LIFO re-injection order.** On compaction, the last-invoked skill is re-injected first. Skills invoked early in the session (e.g., INIT Phase 1) may be deprioritized at compaction time. Design each phase to be self-contained rather than relying on earlier phase context surviving compaction.
- **Skill ecosystem stats (2026-04):** 61,776 published skills, Gini coefficient 0.983 (54% have 0 stars — extreme concentration). The top 1% of skills get 80%+ of usage. Write skills for precision (narrow trigger, clear output) not breadth. Source: zhuyansen/skill-blue-book corpus.

### Quality

- **Test against 10,000-file repos mentally.** Will your Glob pattern return 10,000 results? Will your Grep scan the entire node_modules? Think about scale even on small projects.
- **One concern per commit.** Atomic commits. One feature, one fix, one refactor per commit. Never mix.
- **No silent failures.** If something fails, surface it. Write it to STATE.md. Log it. Never swallow errors.

### Context Management

- **Context files are append-friendly.** Design them so agents can add to them without reading the whole file. Use clear section headers.
- **Prune regularly.** Stale context is worse than no context. Remove completed items from STATE.md. Archive old plans.
- **Separate concerns.** Don't put architecture decisions in the same file as sprint status. Different update cadences mean different files.

### Safety

- **Never skip hooks.** `--no-verify` is a code smell. If hooks are too slow, fix the hooks.
- **Never force-push to main.** There is no scenario where this is the right answer.
- **Destructive operations require explicit user confirmation.** `rm -rf`, `DROP TABLE`, `git reset --hard` -- always ask first.
- **Secrets never enter context files.** Use `.env.example` with placeholder values. Reference environment variables by name, never by value.

---

## Cost Safety

### Bulk API Call Protection

Source: Cross-project memory analysis (a real incident — $10-18 burned in one shot)

Before launching batch API calls (image generation, LLM calls, external service):
1. Count the total requests before executing
2. If > 10 calls in a loop, warn the user with estimated cost
3. Never launch bulk API calls without explicit user approval
4. Log the actual cost after completion

### Test With Production Runtime

Source: Cross-project memory analysis (a real incident — wrong perf numbers for a week)

**ALWAYS test external APIs with the SAME runtime as production.** Different HTTP clients behave differently:
- `curl` opens independent connections (appears faster)
- `Bun.fetch` reuses connections via keep-alive
- `Node fetch` has its own connection pooling

Testing with `curl` and deploying with Bun will give misleading performance numbers. Use the production runtime for all performance tests.

---

## Token Optimization

Source: Community research pass 2026-04-11

### LSP Enforcement (nesaminua/claude-code-lsp-enforcement-kit)

Force Claude Code to use LSP tools instead of Grep/Read for code navigation. Saves ~73% navigation tokens on TS/JS projects.

**Progressive gate system for Read tool:**
1. Warmup phase — free reads allowed
2. Warning phase — Read triggers a reminder to use LSP
3. Navigation required — Read blocked, must use go-to-definition/find-references
4. Surgical mode — only line-range reads allowed

**Key patterns:**
- PreToolUse hook on Read that checks navigation context and suggests LSP alternative
- Pre-delegation hook that gives subagents MCP access (solves the subagent tool gap)
- Auto-detects LSP provider (cclsp, Serena)
- Best for projects with 50+ files where navigation tokens dominate

**When to recommend:** AUDIT detects high Read/Grep usage on TS/JS projects with LSP available.

### CLAUDE.md Compression (JuliusBrussee/caveman)

The `caveman-compress` utility reduces CLAUDE.md token count by ~45% while preserving all semantic content. Applies to any configuration/memory file.

**Pattern:** Strip articles, filler words, verbose phrasing. Keep technical terms intact. Academic validation: arxiv 2604.00025.

**When to recommend:** AUDIT detects CLAUDE.md approaching 200-line limit or project has multiple large context files.

### Session Waste Factor (IyadhKhalfallah/clauditor)

Monitors Claude Code sessions and calculates a "waste factor" — ratio of useful vs. wasted tokens. Auto-rotates sessions when waste exceeds threshold. Data: 62% of tokens saveable across 37 real sessions.

**When to recommend:** AUDIT for users hitting rate limits or cost walls on heavy projects.

---

## Skill Quality Metrics

Source: Community research pass 2026-04-11 (hqhq1025/skill-optimizer)

### 6 Scored Dimensions for SKILL.md Quality

Use these dimensions when evaluating skill quality in AUDIT:

| Dimension | What It Measures | Target |
|---|---|---|
| Trigger rate | How often the skill fires when it should | > 80% |
| User reaction | Accept vs. reject/modify ratio | > 70% accept |
| Workflow completion | % of runs that reach the final phase | > 60% |
| Static quality | 14 structural checks (phases, exits, tools, description) | 12/14+ |
| Undertrigger | Missed activations (skill should have fired but didn't) | < 20% |
| Token economics | Tokens consumed vs. value delivered | Positive ROI |

### 14 Static Checks (from skill-optimizer)

1. Description matches intended trigger
2. Phases are numbered with clear sequence
3. Exit criteria for each phase
4. Tools specified per phase
5. No unbounded iteration
6. Progressive disclosure (not front-loaded)
7. Under 500 lines
8. YAML frontmatter complete
9. No hardcoded paths
10. Error handling defined
11. Output format specified
12. No interactive assumptions
13. Scalable (works on 10-10,000 files)
14. No conflicts with other skills

### Skill Ecosystem Context (2026 Market Data)

Source: Community research pass 2026-04-23 (zhuyansen/skill-blue-book — 61,776 skills, AgentSkillsHub)

| Metric | Value | Implication for AUDIT |
|---|---|---|
| Total skills (AgentSkillsHub) | 61,776 | Massive over-supply; quality bar is key differentiator |
| Skills with 0 stars | 54.1% | Most skills are invisible — our scoring directly impacts project success |
| Gini coefficient | 0.983 | More concentrated than AppStore (0.95), npm (0.93), YouTube (0.87) |
| New skills in March 2026 | 27,720 | Skills decay fast — freshness gate needed |
| Skill half-life | 6-12 months | Flag skills not updated in >12 months as `stale` during AUDIT |

**AUDIT check:** During skill review, flag stale skills (last update > 12 months). The 54% invisibility rate means recommending well-adopted skills (visible on the adoption curve) has real impact on project outcomes.

---

## CLAUDE.md & SKILL.md Size Rules

Source: Community research pass 2026-04-11 (Anthropic internal — Thariq + community validation)

### CLAUDE.md: Hard Limit 200 Lines

Compliance degrades beyond ~200 lines (~2500 tokens). Anthropic's own CLAUDE.md is ~100 lines.

**Key insight:** CLAUDE.md is delivered as a **user message**, not system configuration. This means compliance is ~70% (advisory), not 100% (deterministic). For behavior that must always apply, use hooks instead.

**Rules:**
- **Hard ceiling:** 200 lines for any single CLAUDE.md file
- **Optimal range:** 80-150 lines
- Use `.claude/docs/` or `references/` for extended content
- Split by loading hierarchy: `policy.md` > user > project > local
- If approaching limit, apply caveman-compress or split into multiple files
- Hooks for deterministic behavior (100%), CLAUDE.md for advisory guidance (~70%)

**AUDIT check:** Flag any CLAUDE.md exceeding 200 lines as critical.

### SKILL.md: Hard Limit 500 Lines

Precision drops beyond 500 lines. Skills become unreliable past this threshold. Skills consume ~2% of the context window — keep them lean.

**Rules:**
- **Hard ceiling:** 500 lines per SKILL.md
- **Optimal range:** 150-400 lines
- **Context budget:** ~2% of context window per loaded skill
- Use `references/` directory for deep content (progressive disclosure)
- Route-first design: intent routing in header, execution details in reference files

**AUDIT check:** Flag any SKILL.md exceeding 500 lines as high.

---

## Skill Classification: Thariq's 9 Categories

Source: Community research pass 2026-04-11 (Thariq, Anthropic — X)

Canonical taxonomy for classifying Claude Code skills. Use during INIT to categorize user's needs.

| # | Category | Examples |
|---|---|---|
| 1 | Library / API reference | Context7, docs fetchers |
| 2 | Product verification | QA, browse, design-review |
| 3 | Data fetching | Web scraping, API integration |
| 4 | Business process automation | Report generation, pipeline orchestration |
| 5 | Code scaffolding | Project templates, boilerplate generators |
| 6 | Code quality review | Review, simplify, lint skills |
| 7 | CI/CD deployment | Ship, deploy, release management |
| 8 | Runbooks | Incident response, operational procedures |
| 9 | Infrastructure | Server config, cloud provisioning |

**INIT usage:** Ask the user which categories matter for their project, then recommend skills from the decision matrix.

---

## Skill Design: Route-First Pattern

Source: Community research pass 2026-04-11 (Railway — X + GitHub)

For multi-intent skills, put intent routing in the SKILL.md header and execution details in separate reference files.

**Structure:**
```
SKILL.md (< 200 lines)
├── Description with triggers
├── Intent router (if/then matching)
└── Phase summaries with pointers to references/

references/
├── intent-a-details.md
├── intent-b-details.md
└── shared-patterns.md
```

**Why:** Keeps the main SKILL.md fast to parse while enabling deep behavior per intent. Prevents the 500-line bloat trap.

---

## Deterministic Behavior: Hooks Over CLAUDE.md

Source: Community research pass 2026-04-11 (Community consensus — Reddit cross-subreddit)

**Principle:** Use hooks for everything that MUST happen deterministically. Use CLAUDE.md only for context, conventions, and soft guidance.

| Behavior | Mechanism | Why |
|---|---|---|
| Lint on save | Hook (PostToolUse) | Must always run, no exceptions |
| Format on save | Hook (PostToolUse) | Must always run |
| Block secrets | Hook (PreToolUse) | Security cannot be optional |
| Block --no-verify | Hook (PreToolUse) | Must be enforced |
| Test before commit | Hook (PreToolUse/Bash) | Quality gate, not suggestion |
| Code style preferences | CLAUDE.md | Guidance, model can adapt |
| Architecture decisions | CLAUDE.md | Context, not enforcement |
| Naming conventions | CLAUDE.md | Soft rule, exceptions exist |
| Project structure | CLAUDE.md | Informational |

**INIT guidance:** When generating project configuration, always separate deterministic rules (hooks) from contextual guidance (CLAUDE.md). Never put enforceable rules only in CLAUDE.md.

---

## Skill Auto-Invocation Pattern

Source: Community research pass 2026-04-11 (Carl Vellotti / Aakash Gupta — X)

Skills don't always auto-invoke reliably. Solution: a UserPromptSubmit hook that matches keywords against a rule file and injects activation instructions.

**Pattern:**
1. Create `.claude/skill-rules.json` mapping keywords → skill names
2. UserPromptSubmit hook reads user prompt, matches against rules
3. If match found, inject `systemMessage` telling Claude to use that skill

See hooks-catalog.md `skill-auto-invoke` for the implementation.

---

## Skills 2.0: Cross-Platform Standard

Source: Community research pass 2026-04-11 (anthropics/skills repo, community validation)

### SKILL.md is the De Facto Standard

SKILL.md format has been adopted by 7+ platforms: Claude Code, Cursor, Windsurf, Cody, Copilot, Aider, Continue. The `anthropics/skills` repo defines the formal spec (`agent-skills-spec.md`). Over 800k skills are now cross-platform compatible.

**Key implications for INIT/AUDIT:**
- Skills written for Claude Code work on other platforms (and vice versa)
- The SKILL.md frontmatter format is now an industry standard
- Community skill pools are much larger than CC-only catalogs
- Cross-platform compatibility should be a quality dimension in AUDIT

### Unified Commands/Skills Model

Claude Code is unifying `.claude/commands/` and `.claude/skills/` into a single skill system. Both model-invoked and user-invoked skills share the same format and discovery mechanism. Subagent support is built in.

**INIT guidance:** Generate skills using the unified format. Avoid generating separate "commands" — everything is a skill.

---

## Security: SKILL.md Injection Risk

Source: Community research pass 2026-04-11 (community security research)

Skills in `~/.claude/skills/` are loaded as **system context**. Any SKILL.md installed globally can inject instructions that override project-level CLAUDE.md directives.

**Risk vectors:**
- Malicious skills from untrusted sources executing with system-level authority
- Global skills conflicting with project-specific security policies
- Skills reading/exfiltrating data from unrelated projects

**Mitigations (recommend in AUDIT):**
1. Audit all globally installed skills (`ls ~/.claude/skills/`)
2. Prefer project-scoped skills (`.claude/skills/`) over global ones
3. Review skill source code before installation
4. Use hooks to gate dangerous operations regardless of skill instructions

---

## Security: Swiss Cheese Defense Model

Source: d-wwei/agent-guard (Community research pass 2026-04-11)

Layered security approach for AI agent hooks: 5 defense layers, 32 built-in rules, P99 <1ms. Each layer catches what the previous one missed.

**Key insight for AUDIT:** compare project hooks against the 5-layer model:
1. Input validation (command patterns, path restrictions)
2. Permission classification (tool-level allow/deny)
3. Context analysis (what the agent is doing, not just what tool it calls)
4. Output verification (check results before proceeding)
5. State tracking (cumulative risk scoring across a session)

**INIT guidance:** for projects using `bypassPermissions`, recommend hooks at layers 1, 2, and 4 minimum. Layer 3 is recommended for autonomous agents (`claude -p`).

---

## Verification: Proof-Carrying Completion

Source: 199-biotechnologies/ritalin (Community research pass 2026-04-11)

Pattern to prevent agents from declaring "done" without evidence. Each critical obligation must have verifiable proof before completion is accepted.

**Application in AUDIT:** when scoring a project's agent setup, check if completion hooks verify that tests pass, builds succeed, and required files exist before allowing a task to close. This is especially important for `claude -p` pipelines where no human reviews the "done" signal.

---

## Production Patterns at Scale

### Intercom: 90% AI-Authored PRs

Source: Community research pass 2026-04-11 (community case study)

Intercom ships ~90% of PRs through Claude Code with 13 custom plugins and 100+ skills. Key lessons:
- Skill specialization by domain (payments, messaging, admin) outperforms generic skills
- Plugin-based architecture scales better than monolithic skills
- Dedicated review agents catch AI-generated regressions before merge

**INIT guidance:** For large teams, recommend domain-segmented skills over one-size-fits-all.

### Boris Cherny Pipeline: spec → draft → simplify → verify

Source: Community research pass 2026-04-11 (Boris Cherny — Anthropic)

Official Anthropic-endorsed development pipeline using built-in skills:
1. **Spec** — define requirements and acceptance criteria
2. **Draft** — implement the solution (feature, fix, refactor)
3. **Review** (`/code-review`) — parallel review agents check for reuse, quality, efficiency (ex-`/simplify`, renommé v2.1.146)
4. **Verify** — run tests, type checks, and integration validation

**INIT guidance:** Recommend this pipeline for any project with active development. The `/code-review` (ex-`/simplify`) and `/batch` built-in skills (CC v2.1.63+) are the official implementation.

---

## Command → Agent → Skill Hierarchy

Source: Community research pass 2026-04-12 (shanraisshan/claude-code-best-practice, 38.1k stars)

Community-validated hierarchy for structuring Claude Code automation:

| Level | Mechanism | When to Use |
|---|---|---|
| **Command** | One-shot instruction (prompt or /slash) | Simple, repeatable tasks |
| **Agent** | Subagent with tools, isolation, and memory | Complex multi-step tasks with context |
| **Skill** | Reusable SKILL.md with phases and references | Cross-project patterns, team-shared workflows |

**Decision flow:**
1. Can it be a single prompt? → Command
2. Does it need tools, isolation, or multiple turns? → Agent
3. Will it be reused across projects or by the team? → Skill

**Convergent workflow:** Research → Plan → Execute → Review → Ship. This aligns with the Boris Cherny pipeline (spec → draft → simplify → verify) and gstack phases (Think → Plan → Build → Review → Test → Ship → Reflect).

---

## Cross-Model Quality Review (AI Slop Reduction)

Source: Community research pass 2026-04-12 (gstack v0.16.3.0)

Pattern for detecting and fixing "AI slop" (generic, formulaic, or low-quality AI output) using a different model as reviewer.

**Architecture:**
1. Primary model generates code/content (e.g. Claude Opus)
2. Review model (e.g. Claude Sonnet or different provider) evaluates quality
3. Discrepancies flagged for human review or auto-fixed

**Slop indicators:**
- Overly verbose variable names or comments
- Unnecessary abstractions or premature generalization
- Generic error messages that don't help debugging
- Boilerplate that doesn't match the codebase style
- "Just in case" code paths with no actual use case

**When to recommend:** Projects where AI generates large amounts of code (>50% AI-authored PRs), or teams experiencing declining code quality from AI tools. Can be implemented as an agent in `.claude/agents/reviewer.md` that uses a different model flag.

---

## Complexity Routing (shinpr/claude-code-workflows)

Stage-gated pipeline with complexity-based routing. Match agent count and planning depth to actual task complexity.

### Routing Rules

| Complexity | Files Touched | Pipeline |
|---|---|---|
| **Small** | 1-2 files | Direct execution, no planning phase |
| **Medium** | 3-5 files | Codebase analysis → design → execution |
| **Large** | 6+ files | PRD → analysis → design → execution → verification |

**Key insight:** Over-planning simple tasks wastes tokens; under-planning complex tasks causes rework. The routing decision itself should be fast — a quick file-count heuristic, not a deep analysis.

### Vertical Slice Decomposition

Plan work by unit of value (feature slice), not by technical layer:

- Each slice is independently deployable and testable
- Agents work on complete vertical slices rather than "do all DB, then all API, then all UI"
- Fresh context per phase: each agent starts with clean context to prevent drift

**INIT guidance:** For medium/large projects, recommend vertical slice decomposition over layer-based task splitting. Combine with complexity routing to avoid over-engineering the planning phase for small changes.

Source: shinpr/claude-code-workflows

---

## Memory Compilation Pattern

Source: Community research pass 2026-04-11 (coleam00/claude-memory-compiler, 519 stars)

Compiles knowledge from completed sessions into a structured knowledge base without RAG infrastructure. Uses Agent SDK + hooks to:
1. PostSession hook triggers a compilation agent
2. Agent extracts: decisions, patterns, constraints, domain facts
3. Compiled knowledge written to `.claude/memory/` as structured YAML/MD
4. SessionStart hook loads relevant compiled memory

**Key insight:** Explicit compilation outperforms raw memory accumulation. The compilation step filters noise and normalizes format.

**When to recommend:** Projects with 15+ sessions where memory files grow large and noisy. Also useful for team setups where compiled knowledge is shared.

---

## Yolo Sécurisé (Safe Bypass Pattern)

Source: Melvynx/Codelynx (formation Claude Code, 3 articles convergent)

The dominant personal workflow: `--dangerously-skip-permissions` combined with deny rules + security hooks. Eliminates constant permission prompts while maintaining safety.

**Combo:**
1. `permissions.defaultMode: "bypassPermissions"` in `settings.local.json`
2. `deny` rules for destructive patterns: `Bash(rm -rf *)`, `Bash(sudo *)`, `Bash(git push --force *)`
3. Security hooks (block-dangerous, secret-detection) as second safety net
4. CLAUDE.md rule: "Use `trash` instead of `rm -rf`"

**When to recommend:** Solo developer projects, personal repos, prototyping. Never for shared/production environments without explicit user consent.

**INIT guidance:** Propose this combo in Phase 7 (Permissions) for solo projects. Always pair with mandatory security hooks from Phase 5.

---

## Build Command Rule

Source: Melvynx/Codelynx (martelé dans 2 articles)

**Rule:** Every CLAUDE.md MUST contain at least one verifiable build command (`bun run build`, `pnpm tsc --noEmit`, `xcodebuild -scheme X`, etc.).

**Why:** Without a build command, Claude Code cannot self-validate its own output. It produces code that looks correct but may not compile. The build command is the minimum feedback loop.

**AUDIT scoring:** Score 0 on "buildability" dimension if no build/compile/check command is present in CLAUDE.md Commands section. Score 10 if command is unique, fast, and verifiable.

**INIT guidance:** Phase 4 (CLAUDE.md) MUST detect the project's build/check command and include it in the Commands section. If no build exists, recommend adding `tsc --noEmit` (TS) or equivalent.

---

## MCP Hygiene — Max 2 Rule

Source: Melvynx/Codelynx (martelé dans 2 articles, contre-intuitif)

**Rule:** Limit to 2 MCP servers per project maximum. Each MCP consumes 5-10% of context window just for tool definitions.

**Prefer CLI over MCP equivalents:**
- `gh` CLI > github-mcp
- Neon CLI > neon-mcp
- Vercel CLI > vercel-mcp
- Supabase CLI > supabase-mcp

**Exceptions:** Context7 (library docs, low overhead) and domain-specific MCPs (Figma, Playwright) are generally worth their context cost.

**AUDIT scoring:** Flag projects with >2 MCP servers. Recommend CLI migration for any MCP that has a CLI equivalent already installed on the system.

**INIT guidance:** Phase 6 (MCP/Plugins) — apply the max 2 rule. Recommend CLI-first, MCP only when no CLI alternative exists or the MCP adds unique value (streaming, real-time).

### MCP Scope: use `user` for memory/cross-session state

Source: gstack v1.12.2.0 (2026-04-24) `/setup-gbrain` fix

**Rule:** memory-backed MCP servers (context7, memory-server, knowledge graphs) must be registered with `--scope user`, not `--scope local`. Local scope isolates state per-project and per-CWD invocation, defeating the entire point of a cross-session memory. User scope makes the server process & its data-store shared across all sessions.

```bash
# Correct
claude mcp add --scope user context7 -- bunx -y @upstash/context7-mcp@latest

# Wrong (common mistake) — the server runs but every new session sees an empty store
claude mcp add --scope local memory-server -- ...
```

**AUDIT check:** If `.claude/settings.json` or `.mcp.json` declares a memory/context MCP with `scope: "local"`, flag it. Recommend migration to user scope.

**INIT guidance:** Phase 6 — when generating MCP registration commands for memory-class servers, default to `--scope user`. Document the scope choice in CLAUDE.md so future contributors don't copy-paste the wrong scope.

---

## EPCT Workflow

Source: Melvynx/Codelynx (posé comme THE workflow dans 2 articles)

**Explore → Plan → Code → Test** — structured 4-phase workflow with mandatory human pause after Plan.

```
1. EXPLORE: Read relevant files, understand conventions, no code yet
2. PLAN: Write plan with steps, files to modify, risks. STOP and wait for approval.
3. CODE: Implement plan step by step
4. TEST: Run tests, fix errors, verify feature works end-to-end
```

**Key insight:** The human pause after PLAN prevents the most expensive CC failures — when Claude builds the wrong thing. The cost of pausing is 1 minute; the cost of re-doing is 10+ minutes.

**When to recommend:** Non-trivial tasks (3+ files, architectural changes, new features). Not needed for small fixes or refactors. Combine with complexity routing: small → direct, medium/large → EPCT.

---

## Meta-Pattern: CC Creates Its Own Skills

Source: Melvynx/Codelynx (thème dans 3 articles)

Rather than maintaining static templates, bootstrap via prompt:

```
Create a global skill that [description]. Use progressive disclosure.
Put details in reference.md if needed. Keep SKILL.md under 500 lines.
```

**Key insight:** Claude Code understands its own skill format better than any template. Generated skills are always up-to-date with the current CC version and naturally follow best practices.

**When to recommend:** When users need highly specialized skills that no template covers. The INIT Phase 3 already generates skills — this pattern validates that approach over pre-built templates for edge cases.

---

## Literal Instruction Following (Opus 4.8)

Source: Community research pass 2026-04-17

Opus 4.8 interprets instructions more literally than Opus 4.6. Vague instructions that worked with Opus 4.6 may produce unexpected results with Opus 4.8 — the model follows the letter of instructions more strictly.

**Impact on SKILL.md and CLAUDE.md:**
- Ambiguous instructions will be interpreted by their literal meaning
- Phase descriptions must be precise: "check all .ts files" means ALL, not "a representative sample"
- Conditional instructions need explicit else-branches: if the model doesn't see an else, it may halt
- Numeric constraints are strict: "under 500 lines" means 499 or fewer

**INIT guidance:** When generating SKILL.md and CLAUDE.md, verify that all instructions are unambiguous and complete. Test borderline instructions for literal interpretation.

**AUDIT guidance:** Flag vague or ambiguous instructions in existing SKILL.md and CLAUDE.md files as potential Opus 4.8 compatibility issues.

---

## Context Rot Defense (Subagent Isolation)

Source: Community research pass 2026-04-17 (gstack v0.18.1.0)

Pattern for preventing context rot in long multi-step workflows: isolate heavy sub-workflows into subagents instead of running them inline.

**Problem:** Long-running skills (like `/ship` with 7+ phases) accumulate so much context that later phases degrade in quality. The model has too much history from earlier phases polluting its reasoning.

**Solution:** Split the workflow into independent subagent calls. Each subagent gets fresh 1M context, executes its phase, and returns only the result. The orchestrator stays lean.

**Example (gstack /ship):**
```
Orchestrator (lean context):
├── Agent 1: merge base branch + resolve conflicts
├── Agent 2: run full test suite
├── Agent 3: review diff (security + quality)
└── Agent 4: bump version + create PR
```

**When to apply:** Any skill/workflow with 4+ phases or sessions that regularly hit compaction. Especially relevant for INIT Phase 1-8 which runs sequentially and can accumulate significant context.

**INIT guidance:** For complex project workflows, design skills that delegate heavy phases to subagents rather than running everything inline.

---

## Orb: HRR Memory Pattern

Source: Community research pass 2026-04-17 (KarryViber/Orb, 42 stars)

Auto-evolutionary framework with Holographic Reduced Representation (HRR) memory. Key innovations applicable to Claude Code memory systems:

**HRR Memory (without embeddings):**
- Uses SQLite FTS5 for full-text search instead of vector embeddings
- No external API calls for memory retrieval — fully local, zero-latency
- BM25 ranking for relevance scoring

**Context Assembly (4 layers):**
1. Soul Layer — persistent identity and behavioral rules
2. Memory Layer — facts, decisions, and learned patterns
3. DocStore — reference documents loaded on demand
4. Skills Index — available capabilities

**Prompt Cache Splitting (2-tier):**
- Tier 1: system prompt (stable, cached) — identity + rules
- Tier 2: user prompt (dynamic, not cached) — current task + memory results

**Self-Evolution Cycle:**
1. Fact extraction from completed tasks
2. Error distillation (what went wrong and why)
3. Correction capture (how was it fixed)
4. Memory sync (update knowledge base)

**Relevance to ORCA:** This pattern is superior to append-only MEMORY.md. The 4-layer context assembly maps well to CC's CLAUDE.md (soul) + memory/ (facts) + references/ (docstore) + skills/ (index). The self-evolution cycle could inform a recurring pattern-detection pass.

---

## CLAUDE.md: Manual > Auto-Generated

Source: ETH Zurich empirical study, 2026-04 (community research, score 8/10)

Auto-generated CLAUDE.md (from templates, scrapers, or one-shot prompts): +20% tokens, -3% quality vs. a well-crafted manual file. Conversation-driven, iteratively refined CLAUDE.md: -5% tokens, +4% quality.

**Implication:** Validates the INIT-by-conversation approach. Never auto-generate CLAUDE.md from templates without human refinement. The quality gap comes from specificity — auto-generated files contain generic guidance; conversation-driven files contain project-specific, pruned guidance.

**INIT guidance:** Phase 4 generates CLAUDE.md through conversation, not template dump. Phase 8 includes a review pass to prune anything the user didn't explicitly validate.

**AUDIT guidance:** Flag CLAUDE.md files that look template-generated (generic sections, placeholder-style wording, no project-specific commands or constraints).

---

## Multi-Agent: Subagent-as-Critic (fu2 Pattern)

Source: andrew-yangy/fu2 (community research, score 7/10)

A Stop hook spawns a critic subagent with **blank context** — no accumulated session history — to review the completed work. Because the critic starts fresh, it has no sunk-cost bias and catches blind spots that the primary agent missed due to context accumulation.

**Auto-update:** A SessionStart hook checks if the critic's instructions are stale (>24h) and refreshes them. This ensures the critic evolves as the project does.

**Implementation sketch:**
1. Stop hook triggers after primary agent signals completion
2. Critic subagent launched with only: the task description + the diff/output (no chat history)
3. Critic returns a structured review: approved / needs-fix + specific issues
4. If needs-fix, primary agent gets one correction pass before final close

**When to recommend:** Final review gate for any agentic pipeline where the primary agent runs for multiple turns. Especially valuable for `claude -p` pipelines with no human in the loop.

---

## Token Optimization: Context Packet (engram Pattern)

Source: engramx/engram-v2 (community research, score 7/10)

PreToolUse hooks on Read/Edit/Write intercept file access and serve compact **context packets** instead of raw files. 8 parallel providers assemble the packet:

| Provider | Content |
|---|---|
| AST | Structure of the file (symbols, types, imports) |
| git | Recent changes and blame context |
| docs | Inline doc comments for touched symbols |
| notes | Project-level annotations for the file |
| skills | Relevant skills that apply to the file type |
| mistakes | Past errors on this file or similar patterns |
| dependencies | Import graph one level deep |
| tests | Test coverage summary for touched code |

Result: **88% token savings** on large codebases compared to raw file reads.

**Warning:** CVE patched in v2.0.2 — always use the latest version. Earlier versions allowed hook injection via crafted file content.

**When to recommend:** Projects with 50+ files where Read/Grep token usage dominates. Especially effective on large TS/JS monorepos. Combine with LSP enforcement for maximum savings.

---

## Token Optimization: Tool Output Sandboxing (context-mode Plugin)

Source: mksglu/context-mode (community research 2026-04-27, score 9/10)

Plugin CC qui sandbox les outputs d'outils via un index SQLite+FTS5+BM25. Résultat mesuré : 98% de réduction de contexte (315 KB → 5.4 KB sur un projet réel).

**Mécanisme :** les résultats bruts des outils (Bash stdout, Read file contents, Grep results) sont stockés dans un index local SQLite. Le contexte ne reçoit qu'un résumé compressé + pointeur. L'agent peut requêter l'index avec des queries BM25 si besoin de détails.

**Caractéristiques :**
- Self-hosted, zéro telemetry — adapté aux projets sensibles
- ELv2 license (commercial usage autorisé)
- 12 plateformes supportées

**Quand recommander :** projets avec sessions longues (30+ turns), outputs Bash verbeux (logs, compilations, test runs), Grep sur gros codebases. TOKEN-DOCTOR score `bash-output` > 40% du contexte → recommander.

**Installation :** `/plugin install mksglu/context-mode` dans la session CC.

---

## Gotchas: Bun

### `vercel` CLI — hang silencieux via shim Bun

- **Symptôme** : `vercel deploy` se fige après "Uploading 100%" (requête POST part, réponse jamais traitée).
- **Cause** : La fonction zsh `vercel()` dans `~/.zshrc` override l'invocation via le runtime Bun. Bug HTTP/2 streaming spécifique à Bun sur l'endpoint `/v2/files` de Vercel.
- **Fix** : Invoquer directement via node : `node ~/.bun/bin/vercel deploy ...` — ou retirer la fonction zsh override dans `~/.zshrc`.
- **Versions concernées** : Bun 1.2.x, Vercel CLI 51.7.0 et 52.0.0.
- **Source** : recurring pattern-detection pass 2026-04-27 — pattern `vercel-cli-bun-hang` (vu en projet client)

---

## Gotchas: React Native

### `crypto.randomUUID()` — Indisponible en React Native

- **Symptôme** : Crash EAS/TestFlight avec `TypeError: crypto.randomUUID is not a function` (ou undefined).
- **Cause** : `crypto.randomUUID()` n'existe pas dans le runtime React Native (Hermes/JSC). Disponible en Node.js et navigateur, mais pas dans RN.
- **Fix** : `npm install react-native-get-random-values uuid` + import au point d'entrée (`import 'react-native-get-random-values'`) + utiliser `import { v4 as uuidv4 } from 'uuid'` à la place.
- **Source** : recurring pattern-detection pass 2026-04-27 — pattern `crypto-random-uuid-react-native` (nouveau finding)

---

## Gotchas: Langue Française

### @react-pdf/renderer — Corruption d'Accents Français

- **Symptôme** : Les accents français (ô, â, û, é, etc.) apparaissent corrompus dans les PDFs générés avec `@react-pdf/renderer`.
- **Cause** : fontkit effectue une décomposition Unicode des caractères composés, ce qui casse les accents.
- **Fix** : Ne pas utiliser `@react-pdf/renderer` pour des PDFs avec du texte français. Utiliser à la place : HTML + CSS `@media print` (window.print() ou headless Chrome via Playwright).
- **Source** : recurring pattern-detection pass 2026-04-19 — pattern `react-pdf-unicode-bug` (vu en projet client)

---

## Agent Learnings Pattern (gstack v1.3.0)

Source: Community research pass ASS-29 (2026-04-19, score 8/10)

Capitalisation des apprentissages entre agents et sessions. gstack v1.3.0 formalise un dossier `learnings/` partagé entre agents pour éviter de répéter les mêmes erreurs sur un projet.

**Structure:**
```
.claude/learnings/
  YYYY-MM-DD-{task-slug}.md    # un fichier par session significative
```

**Format d'une fiche apprentissage:**
```yaml
---
date: 2026-04-19
model: claude-opus-4-8
task: Refactor auth middleware
---
# Ce qui a fonctionné
- Vertical slice decomposition (routes → middleware → tests en 1 passe)

# Ce qui a échoué
- Grep sur `req.user` a manqué les contextes async — utiliser Read sur les 5 fichiers top-level

# Leçon extraite
Pour auth middleware: toujours lire `middleware.ts` ET `lib/auth.ts` avant toute modification.
```

**Hooks recommandés:**
- `Stop` hook → appelle un script qui demande à Claude de produire une fiche si la session a duré >10 turns
- `SessionStart` hook → charge les learnings récents du projet en context (max 3 dernières fiches)

**Relation avec Memory Compilation Pattern (coleam00):** les learnings sont granulaires et temporels (post-session), le Memory Compiler extrait les patterns structurels (post-project). Ils se complètent.

**Quand recommander:** AUDIT détecte un projet avec 5+ sessions et pas de `learnings/` ni de mémoire compilée. INIT phase 5 (Memory) pour les projets complexes.

---

## Ecosystem Validation: Frontmatter Fiable + Jaccard Overlap

Source: prgilabert/agent-ecosystem-generator (Community research pass ASS-29, score 8/10)

**Problème:** Les descriptions de skills mal rédigées causent soit des undertriggers (skill ne se déclenche pas quand elle devrait) soit des overlaps (2 skills se déclenche sur le même intent, conflict).

### Frontmatter-patterns.md : règles pour des descriptions qui triggèrent fiablement

1. **Verbe d'action au début** — "Execute", "Generate", "Analyze" pas "Tool for..."
2. **Intent utilisateur, pas technique** — "when user wants to deploy" pas "manages deployment process"
3. **Mots-clés du domaine métier** — inclure les termes que l'utilisateur emploie réellement
4. **Liste de triggers négatifs** — `NOT for: code review, debugging` dans `when_to_use` réduit les faux positifs
5. **Longueur 100-300 chars** — assez spécifique pour distinguer, assez court pour parser rapidement

### Métriques de validation d'un écosystème de skills

| Métrique | Calcul | Cible |
|---|---|---|
| Jaccard overlap | `|A ∩ B| / |A ∪ B|` entre les descriptions de 2 skills | < 0.15 par paire |
| Pushiness score | % de turns où une skill s'auto-propose sans être demandée | < 5% |
| Coverage | % des user intents couverts par au moins 1 skill | > 80% |

**Application AUDIT:** Pour chaque paire de skills installées, calculer le Jaccard overlap sur les mots-clés des descriptions. Si overlap > 0.15 → risque de conflit de routing → recommander de clarifier les descriptions ou fusionner les skills.

**INIT guidance:** En Phase 3 (Skills), rédiger les descriptions selon les 5 règles frontmatter. Si 3+ skills créées, vérifier que Jaccard < 0.15 entre les paires critiques.

---

## Memory Management: 4-File Split (k9 Pattern)

Source: k9 memory split pattern (community research, score 6/10)

Split project memory into 4 files by access frequency to avoid loading a single large memory file every session:

| File | Purpose | Access pattern | Size cap |
|---|---|---|---|
| `project_state.md` | Current context, active task, open questions | Every session — overwritten | 100 lines |
| `backlog.md` | Deferred items, future work | On-demand only | Unlimited |
| `decisions.md` | Decision log with rationale | Append-only | Unlimited |
| `architecture.md` | High-level design, stable structures | Rarely changed | Unlimited |

**Companion commands:**
- `/wrap-up` — commit session state to `project_state.md` at end of session
- `/check-init` — verify state is loaded and current at session start

**Why this beats a single MEMORY.md:** Only `project_state.md` is loaded every session (≤100 lines). The other 3 are loaded on demand, preventing context bloat as the project matures.

**When to recommend:** Projects with 10+ sessions where MEMORY.md has grown beyond 150 lines. Combine with the Memory Compilation Pattern (coleam00) for automatic extraction.

---

## Outside-Voice Pattern (gstack v1.13.0)

Source: community research (2026-04-27, gstack v1.13.0, score 8/10)

A skill that activates a critical analytical stance outside the default assistant persona. Useful for code reviews, debt analysis, and architectural decisions where anchoring bias or sycophancy would reduce quality.

**Trigger keywords:** `outside-voice`, `hors persona`, `vue externe`, `critique objective`

**Behavior:** When activated, Claude drops the helpful-assistant frame and adopts a senior-engineer-reviewing-code-they-don't-own stance. No diplomatic padding. Direct observations. No "you could consider" — only "this is wrong because X".

**When to recommend in AUDIT:** Include a note in the AUDIT report's recommendations section: "For the next debt-review session, invoke `/outside-voice` to get an unanchored second opinion on the top-3 architectural findings."

**When to recommend in INIT:** Add `outside-voice` to the skill-rules.json keyword map (Phase 5 step 9) with keywords `["outside voice", "hors persona", "critique", "brutal review"]`.

---

## Truthful Response Discipline

Source: l'opérateur operating preference (2026-05-05)

Default project agents should optimize for truthfulness and proof over user approval. This is not a request for longer answers; it is a bias-control rule for analysis, review, planning, and ship decisions.

**Core rules:**
1. Accuracy beats approval. If the user's premise is weak or false, say so directly and explain why.
2. No flattery or premise-validation boilerplate. Start with the real blocker, counterargument, risk, or answer.
3. If evidence is missing, write `unknown` instead of filling gaps.
4. Use confidence labels (`high` / `medium` / `low` / `unknown`) for judgments that depend on incomplete evidence.
5. Verify claims against files, commands, docs, screenshots, or runtime state before presenting them as current.

**When to recommend in AUDIT:** Flag projects whose `CLAUDE.md`, `AGENTS.md`, reviewer agents, or critic agents lack explicit anti-sycophancy / evidence-first rules. This is especially important for architecture reviews, launch readiness, QA, and multi-agent work.

**When to recommend in INIT:** Add the response discipline to generated `.claude/CLAUDE.md`, root `AGENTS.md`, read-only reviewer agents, and independent critic runbooks. Keep it short so it does not fight the user's "direct and concise" preference.

---

## Slim Preamble: SKILL.md Token Budget (gstack v1.15.0)

Source: community research (2026-04-27, gstack v1.15.0, score 8/10)

SKILL.md has a hard compaction budget of 5K tokens/skill (25K total, LIFO re-injection). Keeping SKILL.md under 3K tokens minimises the risk of compaction truncating critical phase logic.

**Rules for Slim Preamble:**
1. Every paragraph must be actionable in the current session — if it's reference content, move it to `references/`
2. Replace exhaustive lists with `→ See references/<file>.md#section` links
3. Use `onDemand:` annotation for content used < 10% of sessions
4. Avoid nested bullet depth > 2 — each extra level costs ~20% more tokens to parse
5. Target line count: max 400 lines for the entire SKILL.md

**Anti-patterns to remove:**
- Long preambles explaining *why* the skill exists (user already loaded it)
- Repeated context that's also in CLAUDE.md
- Worked examples inline (move to `references/` with a pointer)

**Measurement:** `wc -c SKILL.md` — target < 16 000 chars (~4K tokens). Token estimate: chars / 4.

---

## Prompt Quality: Progressive Disclosure + Fathom Score

Sources: severity1/claude-code-prompt-improver (community research 2026-04-27, score 8/10) + ma-ziwei/fathom-mode (score 7/10)

Two complementary patterns for handling vague prompts without breaking the user's flow.

### Fathom Score (scoring criteria)

Evaluate any incoming prompt on 5 weighted criteria:
| Criterion | Weight | Question |
|---|---|---|
| Précision | 3x | Does the prompt describe exactly WHAT needs to be done? |
| Contexte | 2x | Is the necessary context included? |
| Contraintes | 2x | Are limits/constraints explicit? |
| Livrable | 2x | Is the expected output clear? |
| Scope | 1x | Is the perimeter bounded? |

Thresholds: score < 6 → enter disclosure flow; 6-8 → execute with silent enrichment; ≥ 8 → direct execution.

### Progressive Disclosure Flow (UX pattern)

Instead of one big clarification request that blocks execution, ask progressively:
```
Vague prompt → detect vague (Fathom < 6)
  → Level 1: 1 focused blocking question
  → Level 2: optional context enrichment
  → Level 3: optional constraints refinement
→ Execute with enriched prompt
```

**Why:** A single large clarification request triggers "wall of questions" fatigue. Progressive disclosure increases answer rate by ~40% (severity1 user study, n=27).

**Application in INIT Phase 1:** Each bootstrap question should be a single focused question, not a block of 8 questions. Use this pattern to sequence the conversation naturally.

**Application in a maintenance agent:** When detecting a vague prompt, inject one Fathom-Level-1 question rather than a multi-item clarification comment.

---

## Regex-Harvest → Batch Analysis (Zero-LLM Tool Output Clustering)

Source: Hammaarn/claude-feedback-clusters (community research 2026-04-27, score 7/10)

Pattern: collect tool outputs with zero-cost regex in real time → analyse in batch with LLM periodically.

```bash
# PostToolUse hook — fires after every tool call, zero LLM
scripts/feedback-cluster.sh
# → appends to .claude/feedback-log.jsonl: { ts, tool, cluster, match }
```

Cluster definitions in `.claude/cluster-rules.json`:
```json
{
  "clusters": {
    "type-error":   ["TypeError", "is not assignable", "Property .* does not exist"],
    "import-error": ["Cannot find module", "Module not found"],
    "test-fail":    ["FAIL", "●.*●", "✗"],
    "success":      ["PASS", "✓", "Tests:.*passed"]
  }
}
```

**LLM batch analysis:** a recurring pattern-detection pass reads `feedback-log.jsonl` every 6h, summarises cluster frequency, surfaces recurring failure patterns without re-reading raw tool outputs.

**Application for TOKEN-DOCTOR:** detect `Read` cluster dominance (over-reading) or `Bash` cluster dominance (over-shelling) and surface them as token waste patterns.

**Application for memory scanning:** adopt this harvest pattern in `scripts/scan-memories.ts` — regex clusters on session logs before LLM summarisation.

---

## Hook Minimalism — Community Convergence (community research 2026-05-04)

Source: community convergence across r/claudecode, X, and 12+ repos scanned 2026-05-04.

**Doctrine émergente :** moins de hooks = meilleure performance + moins de faux positifs. La communauté converge vers un maximum de 4 hooks actifs par projet, avec une règle explicite contre l'auto-commit.

### Rules

1. **≤ 4 hooks total** — au-delà, le ratio faux-positifs/utile dégrade l'expérience.
2. **No auto-commit hook** — ne jamais committer automatiquement depuis un hook (PreToolUse ou PostToolUse). Résout 80% des reports de "hook qui m'a foutu en l'air le repo".
3. **Bash hooks only for ≤ 50ms operations** — si le script prend plus longtemps, utiliser un `http` hook vers un service async.
4. **One hook per concern** — pas de hook fourre-tout qui fait 3 choses. Chaque hook = une responsabilité.
5. **mcp_tool hooks pour les alertes externes** — Slack, GitHub, Discord → toujours via `type: mcp_tool`, pas via `curl` dans un command hook.

### AUDIT scoring adjustment

Si le projet a > 4 hooks actifs dans `settings.json` : noter hooks dimension -1. Signaler dans le rapport AUDIT avec la liste des hooks redondants/dangereux.

### INIT guidance

Phase 5 step 1 (hook selection) : maximum 4 hooks proposés. Si le user en demande plus, noter le risque et proposer la consolidation.
