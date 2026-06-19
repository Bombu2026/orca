# Skills Decision Matrix

Mapping of skills to project types, organized by workflow phase. Use this to decide which skills to install or recommend for a given project.

**Legend:**
- **must** -- essential, install before starting work
- **should** -- recommended, significant productivity gain
- **nice** -- optional but useful in certain situations
- **-** -- not relevant for this project type

**Project type abbreviations:**
- **Web** -- web application (Next.js, SPA, full-stack)
- **Bot** -- chatbot, AI agent, automation
- **CLI** -- command-line tool, script, library
- **API** -- backend service, REST/GraphQL API

---

## Phase 1: Planning

| Skill | Source | Description | Web | Bot | CLI | API |
|---|---|---|---|---|---|---|
| `office-hours` | gstack | YC-style forcing questions to validate demand and scope | should | should | nice | should |
| `plan-ceo-review` | gstack | CEO/founder review -- challenge premises, find the 10-star product | should | nice | nice | nice |
| `plan-eng-review` | gstack | Engineering manager review -- architecture, data flow, edge cases | must | should | should | must |
| `plan-design-review` | gstack | Designer's eye on the plan -- rates each design dimension 0-10 | must | nice | - | - |

### Recommendation

All projects benefit from `plan-eng-review`. Web projects should also run `plan-design-review`. Use `office-hours` when starting a new product or pivoting.

---

## Phase 2: Design

| Skill | Source | Description | Web | Bot | CLI | API |
|---|---|---|---|---|---|---|
| `design-consultation` | gstack | Full design system: aesthetic, typography, color, layout, motion | must | - | - | - |
| `frontend-design` | Anthropic | Frontend component design with best practices | must | nice | - | - |
| `theme-factory` | Anthropic | Generate theme variants and design tokens | should | - | - | - |
| `brand-guidelines` | Anthropic | Create and enforce brand identity guidelines | nice | nice | - | - |
| `canvas-design` | Anthropic | Design on HTML canvas with programmatic layouts | nice | - | - | - |
| `impeccable` | open-source | UI design skill — compatible CC + Cursor + Gemini CLI (10k stars) | must | - | - | - |

### Recommendation

Web projects should always start with `design-consultation` to establish a design system. `frontend-design` is the go-to for component-level design decisions. Other design skills are situational.

---

## Phase 3: Building

| Skill | Source | Description | Web | Bot | CLI | API |
|---|---|---|---|---|---|---|
| `claude-api` | Anthropic | Build with Claude API, Anthropic SDK, Agent SDK | nice | must | nice | should |
| `mcp-builder` | Anthropic | Build MCP servers and tool integrations | nice | must | nice | should |
| `web-artifacts-builder` | Anthropic | Generate standalone web artifacts (HTML/CSS/JS) | should | - | - | - |
| `skill-creator` | Anthropic | Create new Claude Code skills from scratch | nice | nice | nice | nice |
| `algorithmic-art` | Anthropic | Generate art through code (SVG, Canvas, WebGL) | nice | - | - | - |
| `expo-skills` | Anthropic (Evan Bacon) | 3 official Expo skills: app-design, deployment, upgrading-expo | nice | nice | nice | nice |

### Recommendation

Bot/agent projects need `claude-api` and `mcp-builder`. Web projects benefit from `web-artifacts-builder` for prototyping. Use `skill-creator` when building reusable workflows. For React Native/Expo projects, install `expo-skills` (3 official skills from Evan Bacon).

---

## Phase 4: Review

| Skill | Source | Description | Web | Bot | CLI | API |
|---|---|---|---|---|---|---|
| `review` | gstack | Pre-landing PR review: SQL safety, trust boundaries, side effects | must | must | must | must |
| `codex` | gstack | OpenAI Codex wrapper: independent review, adversarial challenge | should | should | should | should |
| `investigate` | gstack | Systematic debugging with root cause analysis (4-phase process) | must | must | must | must |
| `simplify` | built-in | Review changed code for reuse, quality, and efficiency | should | should | should | should |

### Recommendation

`review` and `investigate` are universal must-haves. `codex` provides a valuable second opinion. `simplify` catches over-engineering.

---

## Phase 5: Testing

| Skill | Source | Description | Web | Bot | CLI | API |
|---|---|---|---|---|---|---|
| `qa` | gstack | Systematic QA testing + iterative bug fixing with atomic commits | must | - | - | - |
| `qa-only` | gstack | Report-only QA -- structured report without fixing | should | - | - | - |
| `webapp-testing` | Anthropic | Automated web application testing workflows | must | - | - | - |
| `design-review` | gstack | Visual QA: spacing, hierarchy, AI slop patterns, slow interactions | must | - | - | - |
| `browse` | gstack | Headless browser for navigation, interaction, screenshots | must | nice | - | nice |

### Recommendation

Web projects need the full testing stack: `qa` + `design-review` + `browse`. `qa-only` is useful for audit reports without auto-fixes. API projects can use `browse` for testing endpoints that have a web UI.

---

## Phase 6: Documentation

| Skill | Source | Description | Web | Bot | CLI | API |
|---|---|---|---|---|---|---|
| `document-release` | gstack | Post-ship doc update: README, ARCHITECTURE, CHANGELOG, VERSION | should | should | must | must |
| `doc-coauthoring` | Anthropic | Collaborative document writing and editing | nice | nice | nice | nice |
| `internal-comms` | Anthropic | Draft internal communications (announcements, updates) | nice | nice | - | nice |
| `pdf` | Anthropic | Read and process PDF documents | nice | nice | nice | nice |
| `docx` | Anthropic | Read and process Word documents | nice | nice | - | nice |
| `pptx` | Anthropic | Read and process PowerPoint presentations | nice | - | - | - |
| `xlsx` | Anthropic | Read and process Excel spreadsheets | nice | nice | nice | nice |

### Recommendation

`document-release` is essential for any project that ships. Use it after every release to keep docs in sync. Office format skills (`pdf`, `docx`, `xlsx`) are situational -- install when the project involves document processing.

---

## Phase 7: Shipping

| Skill | Source | Description | Web | Bot | CLI | API |
|---|---|---|---|---|---|---|
| `ship` | gstack | Full ship workflow: merge, test, review, bump, changelog, PR | must | must | must | must |
| `retro` | gstack | Weekly engineering retrospective with trend tracking | should | should | should | should |

### Recommendation

`ship` is the universal shipping skill -- use it for every project. `retro` is valuable for ongoing projects with regular release cycles.

---

## Phase 8: Safety

| Skill | Source | Description | Web | Bot | CLI | API |
|---|---|---|---|---|---|---|
| `careful` | gstack | Warns before destructive commands (rm -rf, DROP TABLE, force-push) | must | must | must | must |
| `freeze` | gstack | Restrict edits to a specific directory for the session | should | nice | nice | nice |
| `guard` | gstack | Combined careful + freeze: maximum safety mode | should | nice | nice | nice |
| `unfreeze` | gstack | Clear freeze boundary, re-allow edits everywhere | nice | nice | nice | nice |
| `setup-browser-cookies` | gstack | Import real browser cookies for authenticated QA testing | should | - | - | - |

### Recommendation

`careful` is a must for all projects -- it prevents catastrophic mistakes. Use `freeze` when working on a specific module to avoid accidental edits elsewhere. `guard` combines both for maximum safety when touching production.

---

## Auth Detection

When evaluating a project's auth needs, detect and support these providers:

| Provider | Detection | Notes |
|---|---|---|
| `better-auth` | `better-auth` in package.json, `auth.ts` with `betterAuth()` | Recommended for new projects. Full-featured, TypeScript-native. |
| `next-auth` / `auth.js` | `next-auth` or `@auth/core` in package.json | Widely adopted, session-based. |
| `clerk` | `@clerk/nextjs` in package.json | Managed service, drop-in UI components. |

---

## Phase 9: Security

| Skill | Source | Description | Web | Bot | CLI | API |
|---|---|---|---|---|---|---|
| Security audit | Trail of Bits | Comprehensive security review (vuln scanning, code analysis) | must | should | should | must |
| Threat modeling | Trail of Bits | Identify attack surfaces and threat vectors | should | should | nice | must |
| Dependency audit | Trail of Bits | Scan dependencies for known vulnerabilities | must | should | should | must |
| Smart contract audit | Trail of Bits | Solidity/EVM security review | - | - | - | - |
| Caido security skill | rez0__ | Web security testing via Caido tool integration | should | - | - | should |

### Recommendation

Web and API projects exposed to the internet must run security audits. Trail of Bits skills are the gold standard for security review. Dependency audits should be part of every CI pipeline.

---

## Phase 10: Token & Skill Optimization

Source: community signals scan 2026-04-11

| Skill/Tool | Source | Description | Web | Bot | CLI | API |
|---|---|---|---|---|---|---|
| `skill-optimizer` | hqhq1025 | 14 static checks + 6 scored dimensions for SKILL.md quality | should | should | should | should |
| `claude-skillify` | 0xMH | Generate SKILL.md from completed session workflows | nice | nice | nice | nice |
| `clauditor` | IyadhKhalfallah | Session waste monitoring + auto-rotation | nice | nice | nice | nice |
| `caveman-compress` | JuliusBrussee | Compress CLAUDE.md/config files (~45% token reduction) | nice | nice | nice | nice |
| LSP enforcement hooks | nesaminua | Force LSP navigation over Read/Grep (~73% savings) | should | - | nice | - |
| `/code-review` | built-in | Ex-`/simplify` (renommé v2.1.146). Parallel review agents + inline PR comments (`--comment`). | should | should | should | should |
| `/batch` | built-in | Plan then execute migrations with isolated agents via worktrees | should | should | should | should |

### Recommendation

Run `skill-optimizer` on all custom skills during AUDIT. Use LSP enforcement hooks on any TS/JS project with 50+ files. `clauditor` and `caveman-compress` are for power users hitting token limits. `/code-review` (ex-`/simplify`) and `/batch` are first-party built-in skills (CC v2.1.63+) — reference them in CLAUDE.md.

---

## Community Skill Sources

| Repository | Focus | Skill Count | Notes |
|---|---|---|---|
| `affaan-m/everything-claude-code` | General collection | 126 skills | Broad catalog, varying quality |
| `wshobson/agents` | Agent definitions | 112 agents | Large agent library, many specialized roles |
| `trailofbits/skills` | Security auditing | ~10 skills | Production-grade security review |
| `davila7/claude-code-templates` | Project templates | ~15 templates | Boilerplate generators |
| `ruvnet/ruflo` | Orchestration | ~8 skills | Multi-agent orchestration patterns |
| `hqhq1025/skill-optimizer` | Skill quality | 1 skill | 14 static checks + 6 behavioral dimensions |
| `0xMH/claude-skillify` | Skill creation | 1 skill | Interview-based SKILL.md generation |
| `IyadhKhalfallah/clauditor` | Token optimization | 1 tool | Session waste monitoring, 326 stars |
| `JuliusBrussee/caveman` | Token optimization | 1 skill | Output compression, 14.7k stars |
| `nesaminua/claude-code-lsp-enforcement-kit` | Token optimization | 6 hooks | LSP enforcement for navigation |
| `coleam00/claude-memory-compiler` | Memory | 1 skill | Knowledge base from sessions, no RAG |
| `revfactory/harness` | Agent orchestration | 1 meta-skill | Domain-specific team assembly, 2.3k stars |
| `safishamsi/graphify` | Knowledge graph | 1 skill | Multi-platform knowledge graph, 20.8k stars |
| `SethGammon/Citadel` | Agent orchestration | 1 framework | 4-level routing, worktree isolation, 486 stars |
| `eze-is/web-access` | Web access | 3 layers + CDP | Browser + scraping + search, 4.5k stars |
| `anthropics/skills` | Official spec | Reference | Skills 2.0 spec (agent-skills-spec.md), cross-platform standard |
| `199-biotechnologies/ritalin` | Verification | 1 CLI | Proof-carrying completion — blocks "done" without evidence, Rust |
| `d-wwei/agent-guard` | Security | 32 rules | Swiss Cheese defense engine, P99 <1ms, zero deps |
| `Galaxy-Dawn/claude-scholar` | Research | 7 workflows | Academic research assistant, Obsidian + Zotero integration |
| `6missedcalls/ultraplan` | Planning | 1 skill | Local UltraPlan reimplementation (5 phases, 1-3 agents per complexity) |
| `shanraisshan/claude-code-best-practice` | Best practices | Reference | Command→Agent→Skill hierarchy, 38.1k stars |
| `kylemclaren/claude-tasks` | Scheduling | 1 TUI | Cron 6 fields + Discord/Slack webhooks |
| `clharman/afk-code` | Channels | 1 bridge | Telegram/Discord/Slack bidirectional, one channel per session |
| `alirezarezvani/claude-skills` | Cross-platform | 235 skills + 305 CLI | POWERFUL tier: agent-designer, RAG-architect, security-auditor, 10.6k stars |
| `anthropics/claude-plugins-official` | Official plugins | 834+ plugins | Official marketplace with submission system, enterprise private marketplaces, 16.7k stars |
| `marckrenn/claude-code-changelog` | Version tracking | Reference | Community npm release tracker, fills changelog gaps (v2.1.100-104) |
| `shinpr/claude-code-workflows` | Workflow patterns | ~7 agents | Complexity routing + vertical slice decomposition, stage-gated pipeline |
| `disler/claude-code-hooks-mastery` | Hooks reference | 13 events | Team-based validation pattern, comprehensive hook examples |
| `johnlindquist/claude-hooks` | Hooks types | TS library | TypeScript types for hook payloads, auto-completion support |
| `anthropics/anthropic-cli` | Platform CLI | 1 tool | Official Go CLI (`ant`) for Managed Agents — resource CRUD, GJSON transforms, Claude Code native, 288 stars |
| `jed1978/instrlint` | Quality | 1 tool | Lint + optimize CLAUDE.md/AGENTS.md: dead rules, token waste, structural issues |
| `zunoworks/tension-detect` | Quality | MCP + CLI | Detects contradictions in AI rules (CLAUDE.md, Cursor Rules) |
| `eddiemessiah/config-claude-code` | Config reference | 9 agents + 7 skills | Anthropic hackathon winner — complete CC config with hooks, MCP, 9 commands |
| `ChrisWiles/claude-code-showcase` | Config reference | hooks + skills + agents | Skill-eval auto hook, branch protection, GitHub Actions (PR review, doc sync, quality) |
| Codelynx/Melvynx | Blog reference | 8 articles | Yolo sécurisé, EPCT workflow, max 2 MCP, build command rule, $ARGUMENTS — formation CC |
| `jakeefr/prism` | Session intelligence | 1 CLI | Python session analyzer — detects token waste (re-reads, tool failures), 5 stars |
| `YijiaDuan/build-managed-agents` | Managed Agents | 1 skill | Create, run, audit cloud-hosted agents via Managed Agents API, 8 stars |
| `subinium/vibesubin` | Quality / Security | ~3 skills | Code honesty, secret leak prevention, dead code detection, 17 stars |
| `KarryViber/Orb` | Memory / Self-evolution | Framework | Auto-evolving agent wrapping CC CLI with persistent HRR memory (SQLite FTS5, no embeddings), prompt cache splitting 2-tier (stable system vs dynamic user), self-evolution cycle (fact extraction → error distillation → correction capture → memory sync), 42 stars. **Relevance 8/10** — cache 2-tier pattern directly applicable to SKILL.md optimization |
| `yzhao062/anywhere-agents` | Agent patterns | Reference | Multi-project portable config (CC + Codex), AGENTS.md (committed, shared) + AGENTS.local.md (gitignored, personal overrides), guard.py PreToolUse hook (anti-destructive), 40 AI-tell words banned list (anti-slop signal), 23 stars. **Relevance 7/10** — AGENTS.local.md pattern applicable to INIT phase 7 |
| `grandamenium/skill-optimizer` | Skill quality | 1 skill | Audit skill execution from JSONL transcript, 5 dimensions, generates diff patch, 4 stars |
| `zivtech/claude-cost-helpers` | Cost visibility | 7 hooks | idle-tax, context-rot-zone, subagent-file-count-guard, compact-gamble-pre-save, tool-output-token-warning, effort-control-pin, auto-persist-state, 1 star. **Relevance 7/10** — directly useful for TOKEN-DOCTOR phase, complements token-audit.ts |
| `prgilabert/agent-ecosystem-generator` | Agent orchestration | 5 patterns + validator | 5 canonical orchestration patterns + decision matrix + `validate_ecosystem.py` (Jaccard overlap, pushiness score), ~8 stars. Mine for AUDIT validation heuristics. |
| `andrew-yangy/fu2` | Review / Anti-bias | 1 pattern | Subagent-as-Critic: Stop hook → fresh context critic subagent. Anti-sunk-cost-bias review gate. SessionStart auto-update (24h). Use for INIT Phase 7 agent patterns. |
| `engramx/engram-v2` | Token optimization | Context Packet | Hooks intercept file access, serve compact context. 8 parallel providers, 88% token savings. CVE patched v2.0.2. Reference for TOKEN-DOCTOR recommendations. |
| `bluzir/claude-code-design` | Design system | 20 skills + 4 commands | Claude Design for CLI: deck/prototype/wireframe/animation/design-system artifacts. `/verify-artifact` gate QA (contrast, text size, AI-slop). Cross-project design registry (`~/.claude/design-systems/`). PPTX/PDF/HTML/React export. 71 stars. **Relevance 8/10** — `/verify-artifact` pattern and design registry applicable to INIT phase 2 + AUDIT design scoring. |
| `zhuyansen/skill-blue-book` | Market intelligence | Report + scripts | "Skill Blue Book 2026" — 61,776 skills analyzed. Gini 0.983, 54% at 0 stars, skill half-life 6-12 months. Source: AgentSkillsHub (agentskillshub.top). 8 stars. **Relevance 7/10** — market data justifies AUDIT quality scoring; stale skill check anchored in data. |
| `BrainBlend-AI/tesseron` | MCP plugin | SDK TS + WebSocket | Typed actions (Zod) exposées via WebSocket à des agents MCP. Premier vrai `.claude-plugin/marketplace.json` confirmé. Capabilities MCP avancées : `ctx.confirm`, `ctx.elicit`, `ctx.sample`. 65 tests, 7 packages, BUSL-1.1. 9 stars. **Relevance 7.3/10** — confirme format `.claude-plugin/marketplace.json`; pattern `ctx.confirm`/`ctx.elicit` à documenter dans references/ quand plugin authoring mature. |
| `@sentry/mcp` (MCP registry) | Observabilité | MCP commercial | Accès erreurs, traces, stack traces, release health Sentry depuis CC. Parmi 22 serveurs MCP registry Anthropic commercial (correction : la valeur 217 était erronée — source mauvaise API endpoint). **Relevance 8/10** — dimension observability absente de l'AUDIT actuel; invoquer pendant AUDIT Phase 2 si projet utilise Sentry pour vérifier erreurs non traitées, patterns récurrents, crash rate. |

---

## Quick Start by Project Type

### Web Application
```
must:  plan-eng-review, plan-design-review, design-consultation,
       frontend-design, review, investigate, qa, design-review,
       browse, webapp-testing, ship, careful
should: office-hours, theme-factory, codex, simplify, document-release,
        retro, freeze, setup-browser-cookies, security-audit
```

### Bot / AI Agent
```
must:  claude-api, mcp-builder, review, investigate, ship, careful
should: plan-eng-review, codex, simplify, document-release, retro
```

### CLI Tool / Library
```
must:  plan-eng-review, review, investigate, document-release, ship, careful
should: codex, simplify, retro, dependency-audit
```

### API Service
```
must:  plan-eng-review, review, investigate, document-release, ship,
       careful, security-audit, dependency-audit
should: claude-api, mcp-builder, codex, simplify, retro, threat-modeling
```

---

## Plugin & MCP Recommendations

### Official Plugins (install via `/plugin install <name>@claude-plugins-official`)

| Project signal | Plugin |
|---------------|--------|
| TypeScript/JS | `typescript-lsp` |
| Python | `pyright-lsp` |
| Rust | `rust-analyzer-lsp` |
| Go | `gopls-lsp` |
| Swift/iOS | `swift-lsp` |
| GitHub | `github` |
| GitLab | `gitlab` |
| Jira/Confluence | `atlassian` |
| Linear | `linear` |
| Notion | `notion` |
| Asana | `asana` |
| Figma | `figma` |
| Vercel | `vercel` |
| Firebase | `firebase` |
| Supabase | `supabase` |
| Slack | `slack` |
| Sentry | `sentry` |
| Git workflow | `commit-commands` |
| PR reviews | `pr-review-toolkit` |

### MCP Server Recommendations

| Project signal | MCP server |
|---------------|-----------|
| Database (Postgres, MySQL) | Database MCP for direct queries |
| Design (.pen files, Figma) | `pencil` MCP / `figma` MCP |
| Web scraping / research | `playwright` MCP |
| Documentation lookup | `context7` MCP |
| Telegram bot/notifications | `telegram` MCP |
| File storage / CDN | Storage MCP (Cloudflare, S3) |
| Payment (Stripe) | Payment provider MCP |
| CMS (Sanity, Contentful) | CMS-specific MCP |
| Email (SendGrid, Resend) | Email provider MCP |
| Auth (Clerk, Auth0) | Auth provider MCP |
| Next.js project | `next-devtools-mcp` (vercel) — runtime diagnostics, Next 16 migration, Cache Components |

### Community Plugins

| Project signal | Plugin | Stars |
|---------------|--------|-------|
| Long sessions / token pressure | `context-mode` (mksglu) — SQLite FTS5 BM25 context sandboxing, 98% reduction | -- |
| Research / market intelligence | `last30days-skill` (mvanhorn) — aggregates 13+ sources (Reddit, X, HN, GitHub, etc.) with engagement scoring; 20.8k stars, 1012 tests | 20800 |

Check the MCP registry: `https://api.anthropic.com/mcp-registry/v0/servers?version=latest&visibility=commercial&limit=100`

For community plugin marketplaces, search GitHub: `topic:claude-code-plugins` or repos with `.claude-plugin/marketplace.json`.
