# ORCA

**A permanent architect for your AI-assisted projects — a [Claude Code](https://www.claude.com/product/claude-code) skill.**

Drop ORCA into any project and ask it to organise your dev. It scans the repo, returns a
scored verdict, shows the gaps that actually block you, and prescribes the right tools. You
never pick a mode — it deduces one.

```
  /assistant
      │  scan ~5s  (detect-project + audit-project)
      ▼
  ┌─────────────────────────────────────────────────────────────┐
  │  "Your repo is 6/10 ready to ship with agents."             │
  │  3 blocking gaps:   1. …   2. …   3. …                       │
  │  → Action #1  (fix it? [Enter])                              │
  │  Prescription: Playwright + Context7 + frontend-design + …  │
  └─────────────────────────────────────────────────────────────┘
      │  writes QUALITY_SCORE.md into the project (drift visible next run)
      ▼
  deduced route:  SEED · BOOTSTRAP · NEXT-GAP   (DIRTY-FIRST if the git tree is dirty)
```

> Interactive output is in **French** (the author's working language); code, identifiers and
> this README are in English.

---

## What is a Claude Code skill?

A *skill* is a folder Claude Code loads on demand: a `SKILL.md` definition plus supporting
scripts, references and templates. When its triggers match what you ask, Claude Code pulls the
skill into context and follows it. ORCA is such a skill — its entry command is **`/assistant`**.
It is **not** a runtime app or an npm package; it is tooling that configures *other* projects.

## Surface = 3 commands

| Command | Role |
|---|---|
| `/assistant` | **Deterministic cold-start.** Scan → score `/10` → 3 blocking gaps → one action → stack→tools prescription. The tool decides whether to seed, bootstrap, audit, or close the next gap. |
| `/ship100` | **Hard delivery gate:** proofs, QA, E2E, review → `SHIP / DON'T SHIP`. |
| `/conseil` | **Opt-in product layer:** business+dev board, highest-leverage features (RICE), an honest "is it finished?" verdict backed by end-to-end proof. |

Everything else (`init`, `audit`, `site`, `senior-designer`, `teach`, `token-doctor`) is a
**sub-routine** triggered automatically by `/assistant` according to context — never something
you have to know.

## How it works

- **Deterministic core.** `scripts/organise.ts` is the heart of `/assistant`: it detects the
  project type, audits the Claude Code configuration across 18 weighted dimensions, computes a
  Repo Readiness Score, surfaces the 3 blocking gaps and the single next action, and routes to
  one of four branches (`SEED` / `BOOTSTRAP` / `NEXT-GAP` / `DIRTY-FIRST`). No LLM guesswork in
  the routing — it is a pure function of the repo state.
- **Lifecycle conductor.** ORCA does not only configure the Claude Code harness; it tracks the
  full **product** lifecycle (auth, RBAC, GDPR, CI/CD, monitoring, perf, a11y, backups…)
  against a **Definition of Done per project type**, and gives you *one* next step at a time,
  explained for a non-technical operator. It never says "done" on a green build — only on
  direct proof (a real browser run, a real `curl` with persisted state).
- **Multi-mission & fenced.** Each mission is a declarative manifest
  (`scripts/missions/*.mission.ts`) with an explicit write-scope. A two-layer **scope-fence**
  (a `PreToolUse` hook + a `resolveTarget` guard) enforces, by construction, that a mission can
  only write inside its own zone — and never into ORCA's own tree.
- **Bounded autonomy.** `scripts/loop-controller.ts` gives hard loop bounds
  (`DONE / MAX_TURNS / DEADLINE / NO_PROGRESS`); `scripts/lib/rule-of-two.ts` refuses unattended
  autonomy when private-data + untrusted-content + outbound-action coexist (lethal-trifecta guard).

## Prerequisites

- **[Bun](https://bun.sh) 1.2+** — the only runtime. Every script is TypeScript, run directly,
  with **zero npm dependencies** and no build step.
- **[Claude Code](https://www.claude.com/product/claude-code)** — to actually invoke the skill.
- *(optional)* A **skill library** for the `install-toolkit` step — a directory containing
  `skills/ hooks/ subagents/ plugins/`, pointed to by `SKILL_LIBRARY_DIR`. Without it, a static
  baseline is installed.

## Install

```bash
# 1. Clone
git clone <your-fork-url> orca
cd orca

# 2. Install it as a Claude Code skill (symlink into your skills dir)
ln -s "$(pwd)" ~/.claude/skills/assistant

# 3. Sanity check (no install needed — Bun runs the TypeScript directly)
bun run check        # documentation ↔ code self-check (231 assertions)
```

> The Claude Code skill directory stays named `assistant` and the command is `/assistant` — both
> predate the ORCA rebrand and are kept so existing setups (and the recall hook) keep working.

Then, in any project, ask Claude Code to "organise my dev" (or type `/assistant`).

## Usage

```bash
bun run organise "$(pwd)"          # the cold-start, on any project (scan → score → gaps → action)
bun run lifecycle "$(pwd)"         # product-lifecycle audit → next product step → LIFECYCLE.md
bun scripts/detect-project.ts .    # detect type / stack / framework (JSON)
bun scripts/audit-project.ts .     # score a Claude Code config, 0–10 per dimension (JSON)
bun run missions                   # list registered missions
bun run ship:check <dir>           # the /ship100 delivery gate
```

## Architecture

| Path | Role |
|---|---|
| `SKILL.md` | The skill definition Claude Code loads. Kept lean; deep content lives in `references/`. |
| `scripts/` | Bun + TypeScript, zero build. `organise.ts` (cold-start dispatcher), `detect-project.ts`, `audit-project.ts`, `lifecycle-audit.ts`, `generate-config.ts`, `loop-controller.ts`, `validation-layer.ts`, `missions/` + `lib/scope.ts` (the fence). |
| `references/` | The knowledge base consumed during INIT/AUDIT — Claude Code internals, best practices, feature checklist, the product-lifecycle corpus, one Definition of Done per project type. |
| `templates/` | `{{PLACEHOLDER}}` starter templates: CLAUDE.md variants, agents, hook sets, canonical commands, the autonomous loop. |
| `tests/` | The behavioural test suite (`bun run test`) — real stdin payloads and exit-code tables, not file-existence checks. |
| `.claude/` | ORCA's own Claude Code config (hooks + commands + the shareable `settings.json`). |

## Development

```bash
bun run check        # self-check: every documented claim must match the code (231 assertions)
bun run test         # full behavioural suite (smoke, missions, loop-controller, ship-gate, …)
bun run quality      # self-check + smoke + audit threshold + token-hygiene gate
```

The project **dogfoods** itself: it never works on its own dirty git tree, and "functional"
means a script was actually executed — never a green build alone.

## Skill library — upstream sources

ORCA can mine a community skill library, resolved via `SKILL_LIBRARY_DIR` (see *Prerequisites*).
**It bundles none of that content** — point `SKILL_LIBRARY_DIR` at a library you assemble yourself.
For reference, the library used while developing ORCA aggregated **~9,300 artifacts from the 79
upstream repositories below**. All credit goes to their authors; consult each repository's own
license before redistributing any of its content.

#### Tier S (10k+ stars)
- [affaan-m/ECC](https://github.com/affaan-m/ECC) — 187k★, 239 artifacts
- [anthropics/skills](https://github.com/anthropics/skills) — 137k★, 19 artifacts
- [ComposioHQ/awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills) — 48k★, 866 artifacts
- [garrytan/gstack](https://github.com/garrytan/gstack) — 45k★, 53 artifacts
- [gsd-build/get-shit-done](https://github.com/gsd-build/get-shit-done) — 41k★, 4 artifacts
- [thedotmack/claude-mem](https://github.com/thedotmack/claude-mem) — 40k★, 16 artifacts
- [wshobson/agents](https://github.com/wshobson/agents) — 32k★, 158 artifacts
- [hesreallyhim/awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code) — 32k★, 4 artifacts
- [musistudio/claude-code-router](https://github.com/musistudio/claude-code-router) — 30k★, 2 artifacts
- [sickn33/antigravity-awesome-skills](https://github.com/sickn33/antigravity-awesome-skills) — 27k★, 1463 artifacts
- [ruvnet/ruflo](https://github.com/ruvnet/ruflo) — 25k★, 244 artifacts
- [davila7/claude-code-templates](https://github.com/davila7/claude-code-templates) — 24k★, 838 artifacts
- [shanraisshan/claude-code-best-practice](https://github.com/shanraisshan/claude-code-best-practice) — 22k★, 12 artifacts
- [SuperClaude-Org/SuperClaude_Framework](https://github.com/SuperClaude-Org/SuperClaude_Framework) — 22k★, 8 artifacts
- [winfunc/opcode](https://github.com/winfunc/opcode) — 21k★, 1 artifacts
- [OthmanAdi/planning-with-files](https://github.com/OthmanAdi/planning-with-files) — 17k★, 10 artifacts
- [VoltAgent/awesome-claude-code-subagents](https://github.com/VoltAgent/awesome-claude-code-subagents) — 15k★, 3 artifacts
- [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official) — 14k★, 27 artifacts
- [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) — 13k★, 3 artifacts
- [jarrodwatts/claude-hud](https://github.com/jarrodwatts/claude-hud) — 13k★, 1 artifacts
- [blader/humanizer](https://github.com/blader/humanizer) — 11k★, 1 artifacts
- [EveryInc/compound-engineering-plugin](https://github.com/EveryInc/compound-engineering-plugin) — 11k★, 87 artifacts

#### Tier A (1k-10k stars)
- [travisvn/awesome-claude-skills](https://github.com/travisvn/awesome-claude-skills) — 10k★, 3 artifacts
- [BehiSecc/awesome-claude-skills](https://github.com/BehiSecc/awesome-claude-skills) — 8k★, 3 artifacts
- [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills) — 7k★, 367 artifacts
- [ykdojo/claude-code-tips](https://github.com/ykdojo/claude-code-tips) — 7k★, 9 artifacts
- [Jeffallan/claude-skills](https://github.com/Jeffallan/claude-skills) — 7k★, 68 artifacts
- [Lum1104/Understand-Anything](https://github.com/Lum1104/Understand-Anything) — 6k★, 11 artifacts
- [op7418/Humanizer-zh](https://github.com/op7418/Humanizer-zh) — 5k★, 1 artifacts
- [YishenTu/claudian](https://github.com/YishenTu/claudian) — 5k★, 2 artifacts
- [parcadei/Continuous-Claude-v3](https://github.com/parcadei/Continuous-Claude-v3) — 4k★, 158 artifacts
- [trailofbits/skills](https://github.com/trailofbits/skills) — 4k★, 76 artifacts
- [SawyerHood/dev-browser](https://github.com/SawyerHood/dev-browser) — 4k★, 2 artifacts
- [revfactory/harness](https://github.com/revfactory/harness) — 3k★, 3 artifacts
- [davepoon/buildwithclaude](https://github.com/davepoon/buildwithclaude) — 3k★, 316 artifacts
- [agenticnotetaking/arscontexta](https://github.com/agenticnotetaking/arscontexta) — 3k★, 29 artifacts
- [glitternetwork/pinme](https://github.com/glitternetwork/pinme) — 3k★, 6 artifacts
- [disler/claude-code-hooks-mastery](https://github.com/disler/claude-code-hooks-mastery) — 3k★, 4 artifacts
- [jeremylongshore/claude-code-plugins-plus-skills](https://github.com/jeremylongshore/claude-code-plugins-plus-skills) — 2k★, 3786 artifacts
- [htdt/godogen](https://github.com/htdt/godogen) — 2k★, 5 artifacts
- [mrgoonie/claudekit-skills](https://github.com/mrgoonie/claudekit-skills) — 2k★, 48 artifacts
- [nidhinjs/prompt-master](https://github.com/nidhinjs/prompt-master) — 2k★, 2 artifacts
- [lackeyjb/playwright-skill](https://github.com/lackeyjb/playwright-skill) — 2k★, 2 artifacts
- [yctimlin/mcp_excalidraw](https://github.com/yctimlin/mcp_excalidraw) — 2k★, 2 artifacts
- [SimoneAvogadro/android-reverse-engineering-skill](https://github.com/SimoneAvogadro/android-reverse-engineering-skill) — 1k★, 2 artifacts
- [disler/claude-code-hooks-multi-agent-observability](https://github.com/disler/claude-code-hooks-multi-agent-observability) — 1k★, 6 artifacts
- [Ceeon/videocut-skills](https://github.com/Ceeon/videocut-skills) — 1k★, 5 artifacts
- [browserwing/browserwing](https://github.com/browserwing/browserwing) — 1k★, 3 artifacts
- [polyuiislab/infiAgent](https://github.com/polyuiislab/infiAgent) — 1k★, 19 artifacts
- [shuvonsec/claude-bug-bounty](https://github.com/shuvonsec/claude-bug-bounty) — 1k★, 11 artifacts
- [yohey-w/multi-agent-shogun](https://github.com/yohey-w/multi-agent-shogun) — 1k★, 8 artifacts
- [coleam00/claude-memory-compiler](https://github.com/coleam00/claude-memory-compiler) — 1k★, 1 artifacts
- [zarazhangrui/codebase-to-course](https://github.com/zarazhangrui/codebase-to-course) — 1k★, 1 artifacts

#### Tier B (100-1k stars)
- [simonw/claude-skills](https://github.com/simonw/claude-skills) — 1k★, 1 artifacts
- [SynaLinks/synalinks-skills](https://github.com/SynaLinks/synalinks-skills) — 1k★, 12 artifacts
- [rohitg00/awesome-claude-code-toolkit](https://github.com/rohitg00/awesome-claude-code-toolkit) — 1k★, 43 artifacts
- [0xfurai/claude-code-subagents](https://github.com/0xfurai/claude-code-subagents) — 1k★, 2 artifacts
- [obra/superpowers-marketplace](https://github.com/obra/superpowers-marketplace) — 1k★, 1 artifacts
- [BrownFineSecurity/iothackbot](https://github.com/BrownFineSecurity/iothackbot) — 1k★, 14 artifacts
- [muratcankoylan/ralph-wiggum-marketer](https://github.com/muratcankoylan/ralph-wiggum-marketer) — 1k★, 4 artifacts
- [team-attention/plugins-for-claude-natives](https://github.com/team-attention/plugins-for-claude-natives) — 1k★, 21 artifacts
- [ananddtyagi/cc-marketplace](https://github.com/ananddtyagi/cc-marketplace) — 1k★, 16 artifacts
- [ccplugins/awesome-claude-code-plugins](https://github.com/ccplugins/awesome-claude-code-plugins) — 1k★, 4 artifacts
- [hamelsmu/claude-review-loop](https://github.com/hamelsmu/claude-review-loop) — 1k★, 4 artifacts
- [sangrokjung/claude-forge](https://github.com/sangrokjung/claude-forge) — 1k★, 28 artifacts
- [gmickel/gmickel-claude-marketplace](https://github.com/gmickel/gmickel-claude-marketplace) — 1k★, 35 artifacts
- [kingbootoshi/cartographer](https://github.com/kingbootoshi/cartographer) — 1k★, 3 artifacts
- [shinpr/claude-code-workflows](https://github.com/shinpr/claude-code-workflows) — <1k★, 32 artifacts
- [win4r/claude-code-hooks](https://github.com/win4r/claude-code-hooks) — <1k★, 1 artifacts
- [karanb192/claude-code-hooks](https://github.com/karanb192/claude-code-hooks) — <1k★, 1 artifacts
- [LeastBit/Claude_skills_zh-CN](https://github.com/LeastBit/Claude_skills_zh-CN) — <1k★, 17 artifacts
- [anthropics/life-sciences](https://github.com/anthropics/life-sciences) — <1k★, 8 artifacts
- [cassler/awesome-claude-code-setup](https://github.com/cassler/awesome-claude-code-setup) — <1k★, 1 artifacts
- [shanraisshan/claude-code-hooks](https://github.com/shanraisshan/claude-code-hooks) — <1k★, 3 artifacts
- [starbaser/ccproxy](https://github.com/starbaser/ccproxy) — <1k★, 2 artifacts
- [NakanoSanku/OhMySkills](https://github.com/NakanoSanku/OhMySkills) — <1k★, 3 artifacts
- [GowayLee/cchooks](https://github.com/GowayLee/cchooks) — <1k★, 2 artifacts
- [team-attention/agent-council](https://github.com/team-attention/agent-council) — <1k★, 2 artifacts
- [bencium/bencium-marketplace](https://github.com/bencium/bencium-marketplace) — <1k★, 15 artifacts

## License

[MIT](./LICENSE).

## Status

A personal, evolving Claude Code skill, shared as-is. It is opinionated (Bun-first, a specific
default stack, French interactive output) and assumes you run it from `~/.claude/skills/assistant`.
Use it as a reference for skill design, or fork and adapt it to your own conventions.
