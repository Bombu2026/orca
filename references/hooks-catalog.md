# Hooks Catalog

Ready-to-use hook configurations for Claude Code `settings.json`. Copy any block directly into your `"hooks"` array.

---

## Category 1: Security (must-have)

### block-no-verify

Blocks `--no-verify` flag on git commands, preventing hook bypass.

Source: Everything Claude Code (ECC)

```json
{
  "event": "PreToolUse",
  "matcher": "Bash",
  "config": {
    "type": "command",
    "command": "bash -c 'if echo \"$TOOL_INPUT\" | grep -q \"\\-\\-no-verify\"; then echo \"{\\\"decision\\\": \\\"block\\\", \\\"reason\\\": \\\"--no-verify is not allowed. Git hooks must always run.\\\"}\" && exit 2; fi; exit 0'"
  },
  "timeout": 5
}
```

### config-protection

Blocks modifications to linter, formatter, and build configuration files.

Source: Everything Claude Code (ECC)

```json
{
  "event": "PreToolUse",
  "matcher": "Write|Edit",
  "config": {
    "type": "command",
    "command": "bash -c 'PROTECTED=\"biome.json biome.jsonc .prettierrc .prettierrc.json eslint.config.js .eslintrc.json tsconfig.json tailwind.config.ts vite.config.ts next.config.js next.config.ts webpack.config.js\"; FILE=$(echo \"$TOOL_INPUT\" | grep -oP '\"file_path\"\\s*:\\s*\"\\K[^\"]+' || echo \"$TOOL_INPUT\" | grep -oP '\"path\"\\s*:\\s*\"\\K[^\"]+'); BASENAME=$(basename \"$FILE\" 2>/dev/null); for p in $PROTECTED; do if [ \"$BASENAME\" = \"$p\" ]; then echo \"{\\\"decision\\\": \\\"block\\\", \\\"reason\\\": \\\"$BASENAME is a protected config file. Modify manually.\\\"}\" && exit 2; fi; done; exit 0'"
  },
  "timeout": 5
}
```

### security-reminder

Prompt-type hook that checks for dangerous code patterns before writing files.

Source: Anthropic security-guidance plugin

```json
{
  "event": "PreToolUse",
  "matcher": "Edit|Write",
  "config": {
    "type": "prompt",
    "prompt": "Check the proposed file change for dangerous patterns: eval(), exec(), execSync(), dangerouslySetInnerHTML, innerHTML assignment, document.write(), Function() constructor, new Function(), child_process without input validation, SQL string concatenation (potential injection), hardcoded credentials or tokens. If any are found, block with a clear explanation. If the pattern is justified and safe in context, approve with a note."
  },
  "timeout": 15
}
```

### secret-detection

Warns about hardcoded secrets, API keys, passwords, and tokens in code.

```json
{
  "event": "PreToolUse",
  "matcher": "Write|Edit",
  "config": {
    "type": "command",
    "command": "bash -c 'CONTENT=$(echo \"$TOOL_INPUT\" | grep -oP '\"(new_string|content)\"\\s*:\\s*\"\\K[^\"]+' || true); if echo \"$CONTENT\" | grep -qiE \"(api[_-]?key|secret[_-]?key|password|token|private[_-]?key|credentials)\\s*[=:]\\s*[\\x27\\\"][A-Za-z0-9+/=_-]{8,}\"; then echo \"{\\\"decision\\\": \\\"block\\\", \\\"reason\\\": \\\"Potential hardcoded secret detected. Use environment variables instead.\\\"}\" && exit 2; fi; exit 0'"
  },
  "timeout": 5
}
```

### gateguard (fact-check gate)

Pre-action verification gate that forces Claude to verify claims/commands before executing. When an action could have side effects, the hook prompts Claude to fact-check before proceeding.

Source: Everything Claude Code (ECC) v1.10.0

```json
{
  "event": "PreToolUse",
  "matcher": "Bash|Edit|Write",
  "config": {
    "type": "prompt",
    "prompt": "Before this action executes, verify: 1) If this modifies external state (API calls, file writes, git operations), are the targets correct? 2) If this relies on assumptions about the codebase (file paths, function signatures, config values), have they been confirmed by reading the actual files? 3) If this could be destructive, is there a rollback path? Block if any claim is unverified. Approve if all facts are confirmed or the action is read-only."
  },
  "timeout": 15
}
```

> **When to recommend:** Projects using `bypassPermissions` or autonomous agent pipelines where fact-checking errors can cascade. Combines well with `careful` skill for defense-in-depth.

### block-dangerous (destructive command blocker)

Blocks destructive Bash commands via regex matching. External JS script for maintainability (reads JSON from stdin).

Source: Melvynx/Codelynx

```json
{
  "event": "PreToolUse",
  "matcher": "Bash",
  "config": {
    "type": "command",
    "command": "node $CLAUDE_PROJECT_DIR/.claude/hooks/block-dangerous.js"
  },
  "timeout": 5
}
```

Script `.claude/hooks/block-dangerous.js`:

```js
const BLOCK_PATTERNS = [
  /rm\s+.*-rf\s*\//i,
  /drop\s+(database|table)/i,
  /truncate\s+table/i,
  /git\s+push.*--force\s+origin\s+(main|master)/i,
  /sudo\s+rm/i,
  />\s*\/dev\/sd/i,
  /mkfs\./i,
];

let input = '';
process.stdin.on('data', d => input += d);
process.stdin.on('end', () => {
  const { tool_input } = JSON.parse(input);
  const cmd = tool_input?.command || '';
  const match = BLOCK_PATTERNS.find(p => p.test(cmd));
  if (match) {
    console.log(JSON.stringify({ decision: 'block', reason: `Blocked dangerous pattern: ${match}` }));
    process.exit(2);
  }
  process.exit(0);
});
```

> **When to recommend:** All projects using `bypassPermissions` (yolo sécurisé combo). Pair with deny rules for belt-and-suspenders safety. The JS file approach is more maintainable than inline bash regex.

---

## Category 2: Quality (recommended)

### post-edit-format

Auto-format files after edits. Detects Biome or Prettier and runs the appropriate formatter.

```json
{
  "event": "PostToolUse",
  "matcher": "Edit|Write",
  "config": {
    "type": "command",
    "command": "bash -c 'FILE=$(echo \"$TOOL_INPUT\" | grep -oP '\"file_path\"\\s*:\\s*\"\\K[^\"]+' || echo \"$TOOL_INPUT\" | grep -oP '\"path\"\\s*:\\s*\"\\K[^\"]+'); if [ -z \"$FILE\" ] || [ ! -f \"$FILE\" ]; then exit 0; fi; DIR=$(dirname \"$FILE\"); while [ \"$DIR\" != \"/\" ]; do if [ -f \"$DIR/biome.json\" ] || [ -f \"$DIR/biome.jsonc\" ]; then npx @biomejs/biome format --write \"$FILE\" 2>/dev/null; exit 0; fi; if [ -f \"$DIR/.prettierrc\" ] || [ -f \"$DIR/.prettierrc.json\" ] || [ -f \"$DIR/prettier.config.js\" ]; then npx prettier --write \"$FILE\" 2>/dev/null; exit 0; fi; DIR=$(dirname \"$DIR\"); done; exit 0'"
  },
  "timeout": 15
}
```

### post-edit-typecheck

Runs TypeScript type checking after `.ts` or `.tsx` file edits.

```json
{
  "event": "PostToolUse",
  "matcher": "Edit|Write",
  "config": {
    "type": "command",
    "command": "bash -c 'FILE=$(echo \"$TOOL_INPUT\" | grep -oP '\"file_path\"\\s*:\\s*\"\\K[^\"]+' || echo \"$TOOL_INPUT\" | grep -oP '\"path\"\\s*:\\s*\"\\K[^\"]+'); if [[ \"$FILE\" == *.ts || \"$FILE\" == *.tsx ]]; then DIR=$(dirname \"$FILE\"); while [ \"$DIR\" != \"/\" ]; do if [ -f \"$DIR/tsconfig.json\" ]; then cd \"$DIR\" && npx tsc --noEmit --pretty 2>&1 | head -20; exit 0; fi; DIR=$(dirname \"$DIR\"); done; fi; exit 0'"
  },
  "timeout": 30
}
```

### console-log-check

Checks for leftover `console.log` statements in modified files at the end of a response.

```json
{
  "event": "Stop",
  "config": {
    "type": "command",
    "command": "bash -c 'MODIFIED=$(git diff --name-only HEAD 2>/dev/null || true); if [ -z \"$MODIFIED\" ]; then exit 0; fi; FOUND=\"\"; for f in $MODIFIED; do if [ -f \"$f\" ] && [[ \"$f\" == *.ts || \"$f\" == *.tsx || \"$f\" == *.js || \"$f\" == *.jsx ]]; then HITS=$(grep -n \"console\\.log\" \"$f\" 2>/dev/null || true); if [ -n \"$HITS\" ]; then FOUND=\"$FOUND\\n$f:\\n$HITS\"; fi; fi; done; if [ -n \"$FOUND\" ]; then echo \"{\\\"systemMessage\\\": \\\"Warning: console.log found in modified files:$FOUND\\nRemove before committing.\\\"}\"; fi; exit 0'"
  },
  "timeout": 10
}
```

### post-tool-output-replace (v2.1.121+)

`PostToolUse` can now replace tool output for **all** tools (not just MCP) via `hookSpecificOutput.updatedToolOutput`. Useful to sanitize Bash output, truncate verbose logs, or inject metadata before Claude sees the result.

```json
{
  "event": "PostToolUse",
  "matcher": "Bash",
  "config": {
    "type": "command",
    "command": "bash -c 'OUTPUT=$(cat); LINES=$(echo \"$OUTPUT\" | wc -l); if [ \"$LINES\" -gt 200 ]; then HEAD=$(echo \"$OUTPUT\" | head -50); TAIL=$(echo \"$OUTPUT\" | tail -20); TRIMMED=\"$HEAD\n...[$(($LINES - 70)) lines truncated]...\n$TAIL\"; echo \"{\\\"hookSpecificOutput\\\": {\\\"updatedToolOutput\\\": $(echo \"$TRIMMED\" | jq -Rs .)}}\"; else echo \"{}\"; fi'"
  },
  "timeout": 5
}
```

> **When to recommend:** Long-running Bash commands (builds, test suites) that produce thousands of lines — truncating preserves context budget while keeping head+tail. Works on Edit, Write, or any tool. Only available in v2.1.121+.

### completeness-check

Prompt-type hook that verifies all required implementation phases were completed before stopping.

Source: Trail of Bits pattern

```json
{
  "event": "Stop",
  "config": {
    "type": "prompt",
    "prompt": "Review the conversation and verify: 1) All requirements from the user's request were addressed. 2) No TODO or FIXME comments were left in code without explanation. 3) If tests were expected, they were written. 4) If the task involved multiple files, all files were saved. If anything is incomplete, respond with what remains. If everything is done, approve."
  },
  "timeout": 20
}
```

---

## Category 2b: Cost Safety (recommended)

### bulk-api-guard

Warns before Bash commands that loop over external API calls (curl, gh api, npm publish, etc.). Prevents runaway costs from unintended bulk operations.

Source: the audit feedback loop (ASS-5)

```json
{
  "event": "PreToolUse",
  "matcher": "Bash",
  "config": {
    "type": "prompt",
    "prompt": "Check if this Bash command contains a loop (for, while, xargs, find -exec) that makes external API calls (curl, wget, gh api, npm publish, aws, gcloud, az). If it would make more than 10 external calls, block it and ask the user to confirm the bulk operation first. Approve single calls or small batches (<=10)."
  },
  "timeout": 10
}
```

### agent-spawn-limit

Prompt-type guard that checks if too many agents are being spawned in one turn.

```json
{
  "event": "PreToolUse",
  "matcher": "Agent",
  "config": {
    "type": "prompt",
    "prompt": "Check conversation context: have more than 5 Agent tool calls already been made in the current turn? If so, warn that spawning additional agents may be excessive and suggest batching or sequential processing instead. Approve if under the limit."
  },
  "timeout": 10
}
```

---

## Category 2c: Pipeline & Orchestration (v2.1.89+)

### defer-to-orchestrator

PreToolUse hook that defers a tool decision to an external orchestrator. Returns `permissionDecision: "defer"`, causing Claude to exit with `stop_reason: "tool_deferred"`. The orchestrator (e.g. a `claude -p` pipeline or a scheduled background agent) can then inspect the tool call and resume with an allow/deny decision.

Use case: human-in-the-loop pipelines, multi-agent approval chains, cost gates that need async external logic.

```json
{
  "event": "PreToolUse",
  "matcher": "Bash",
  "config": {
    "type": "command",
    "command": "bash -c 'CMD=$(echo \"$TOOL_INPUT\" | grep -oP '\"command\"\\s*:\\s*\"\\K[^\"]+'); if echo \"$CMD\" | grep -qE \"(rm -rf|DROP TABLE|curl.*-X DELETE)\"; then echo \"{\\\"permissionDecision\\\": \\\"defer\\\"}\"; exit 0; fi; exit 0'"
  },
  "timeout": 5
}
```

> **Note:** `permissionDecision: "defer"` is distinct from `"block"`. A block rejects the call inline; a defer pauses the entire session so an external process can decide. Only useful in headless / pipeline mode (`claude -p`).

### permission-denied-retry

Fires when auto-mode's built-in classifier denies a tool call. Returns `{retry: true}` to let the model rephrase and retry. Useful for agents that hit auto-mode refusals on legitimate operations (e.g. writing to paths the classifier flags).

Source: CC v2.1.89 changelog

```json
{
  "event": "PermissionDenied",
  "config": {
    "type": "command",
    "command": "bash -c 'TOOL=$(echo \"$HOOK_DATA\" | grep -oP '\"tool\"\\s*:\\s*\"\\K[^\"]+' || echo \"unknown\"); REASON=$(echo \"$HOOK_DATA\" | grep -oP '\"reason\"\\s*:\\s*\"\\K[^\"]+' || echo \"unknown\"); echo \"{\\\"retry\\\": true, \\\"systemMessage\\\": \\\"Auto-mode denied $TOOL ($REASON). Retrying with adjusted parameters.\\\"}\" ; exit 0'"
  },
  "timeout": 5
}
```

> **Note:** Unconditional retry can loop. In production, add logic to track retry count (e.g. a temp file counter) and bail after 2-3 attempts.

---

## Category 3: DX (optional)

### notification

macOS notification when Claude needs user input or finishes a long task.

```json
{
  "event": "Notification",
  "config": {
    "type": "command",
    "command": "bash -c 'MSG=$(echo \"$HOOK_DATA\" | grep -oP '\"message\"\\s*:\\s*\"\\K[^\"]+' || echo \"Claude needs attention\"); osascript -e \"display notification \\\"$MSG\\\" with title \\\"Claude Code\\\" sound name \\\"Glass\\\"\" 2>/dev/null; exit 0'"
  },
  "timeout": 5,
  "async": true
}
```

### session-context

Loads previous session context from a state file at session start.

```json
{
  "event": "SessionStart",
  "config": {
    "type": "command",
    "command": "bash -c 'STATE_FILE=\".claude/local/session-state.json\"; if [ -f \"$STATE_FILE\" ]; then echo \"{\\\"systemMessage\\\": \\\"Previous session context: $(cat \"$STATE_FILE\" | head -c 2000)\\\"}\"; fi; exit 0'"
  },
  "timeout": 5
}
```

### pre-compact-save

Saves current session state to disk before context compaction, so key information survives.

```json
{
  "event": "PreCompact",
  "config": {
    "type": "command",
    "command": "bash -c 'mkdir -p .claude/local; echo \"{\\\"savedAt\\\": \\\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\\\", \\\"workingDir\\\": \\\"$(pwd)\\\", \\\"branch\\\": \\\"$(git branch --show-current 2>/dev/null || echo none)\\\", \\\"modifiedFiles\\\": \\\"$(git diff --name-only 2>/dev/null | tr \"\\n\" \",\" || echo none)\\\"}\" > .claude/local/session-state.json; exit 0'"
  },
  "timeout": 5
}
```

### pre-compact-block-auto

Blocks automatic compaction (system-triggered) while allowing manual `/compact`. Useful when running long autonomous pipelines where context loss would break multi-step plans.

Source: CC v2.1.105 (PreCompact matcher field)

```json
{
  "event": "PreCompact",
  "matcher": "auto",
  "config": {
    "type": "command",
    "command": "bash -c 'echo \"{\\\"decision\\\": \\\"block\\\", \\\"reason\\\": \\\"Auto-compaction blocked to preserve full context. Use /compact manually when ready.\\\"}\" && exit 2'"
  },
  "timeout": 5
}
```

### tmux-dev

Auto-starts development servers in a tmux session when Claude runs build/dev commands.

Requires a script file at `.claude/scripts/tmux-dev.sh`.

```json
{
  "event": "PreToolUse",
  "matcher": "Bash",
  "config": {
    "type": "command",
    "command": "bash -c 'CMD=$(echo \"$TOOL_INPUT\" | grep -oP '\"command\"\\s*:\\s*\"\\K[^\"]+'); if echo \"$CMD\" | grep -qE \"^(npm|bun|pnpm|yarn) (run )?(dev|start|serve)\"; then if command -v tmux >/dev/null && ! tmux has-session -t claude-dev 2>/dev/null; then tmux new-session -d -s claude-dev \"$CMD\"; echo \"{\\\"decision\\\": \\\"block\\\", \\\"reason\\\": \\\"Dev server started in tmux session claude-dev. Use: tmux attach -t claude-dev\\\"}\"; exit 2; fi; fi; exit 0'"
  },
  "timeout": 10
}
```

### git-push-reminder

Prompts for confirmation before any `git push` command, showing what will be pushed.

```json
{
  "event": "PreToolUse",
  "matcher": "Bash",
  "config": {
    "type": "command",
    "command": "bash -c 'CMD=$(echo \"$TOOL_INPUT\" | grep -oP '\"command\"\\s*:\\s*\"\\K[^\"]+'); if echo \"$CMD\" | grep -qE \"git\\s+push\"; then BRANCH=$(git branch --show-current 2>/dev/null); COMMITS=$(git log --oneline @{u}..HEAD 2>/dev/null | head -5 || echo \"(unable to determine)\"); echo \"{\\\"systemMessage\\\": \\\"About to push branch $BRANCH. Commits to push:\\n$COMMITS\\\"}\"; fi; exit 0'"
  },
  "timeout": 5
}
```

---

## Category 4: Skill & Token Optimization (advanced)

### skill-auto-invoke

UserPromptSubmit hook that matches user prompt keywords against a rules file and injects skill activation instructions. Fixes unreliable skill auto-triggering.

Source: community signals scan 2026-04-11 (Carl Vellotti / Aakash Gupta pattern)

Requires `.claude/skill-rules.json`:
```json
{
  "rules": [
    { "keywords": ["review", "pr", "code review"], "skill": "review" },
    { "keywords": ["ship", "deploy", "push"], "skill": "ship" },
    { "keywords": ["qa", "test the site", "find bugs"], "skill": "qa" },
    { "keywords": ["debug", "investigate", "why is this"], "skill": "investigate" }
  ]
}
```

```json
{
  "event": "UserPromptSubmit",
  "config": {
    "type": "command",
    "command": "bash -c 'RULES=\".claude/skill-rules.json\"; if [ ! -f \"$RULES\" ]; then exit 0; fi; PROMPT=$(echo \"$TOOL_INPUT\" | tr \"[:upper:]\" \"[:lower:]\"); MATCH=$(python3 -c \"import json,sys; rules=json.load(open(\\\"$RULES\\\"))[\\\"rules\\\"]; prompt=sys.stdin.read(); matches=[r[\\\"skill\\\"] for r in rules if any(k in prompt for k in r[\\\"keywords\\\"])]; print(matches[0] if matches else \\\"\\\")\" <<< \"$PROMPT\" 2>/dev/null); if [ -n \"$MATCH\" ]; then echo \"{\\\"systemMessage\\\": \\\"The user request matches skill /$MATCH. Consider invoking it.\\\"}\"; fi; exit 0'"
  },
  "timeout": 5
}
```

### lsp-enforcement-gate

PreToolUse hook that encourages LSP navigation over raw Read/Grep for code navigation. Saves ~73% navigation tokens on TS/JS projects.

Source: community signals scan 2026-04-11 (nesaminua/claude-code-lsp-enforcement-kit)

```json
{
  "event": "PreToolUse",
  "matcher": "Read",
  "config": {
    "type": "prompt",
    "prompt": "Check if this Read call is for code navigation (jumping to a definition, finding references, understanding a symbol). If the project has LSP tools available (cclsp, Serena, or other MCP language servers), suggest using go-to-definition or find-references instead, which is faster and cheaper. Approve reads that are for: initial file exploration, reading configs, reading non-code files, or reading specific line ranges after LSP pointed to the file. Block only when a clear LSP alternative exists and the read is a full-file navigation read."
  },
  "timeout": 10
}
```

### document-to-markdown

PreToolUse hook that auto-converts PDF/DOCX files to Markdown before reading, avoiding expensive vision tokens. Intercepts Read calls on binary document files and runs a conversion tool first.

Source: community signals scan 2026-04-12 (sunlesshalo)

```json
{
  "event": "PreToolUse",
  "matcher": "Read",
  "config": {
    "type": "command",
    "command": "bash -c 'FILE=$(echo \"$TOOL_INPUT\" | grep -oP '\"file_path\"\\s*:\\s*\"\\K[^\"]+'); EXT=\"${FILE##*.}\"; if [[ \"$EXT\" == \"pdf\" || \"$EXT\" == \"docx\" || \"$EXT\" == \"doc\" || \"$EXT\" == \"pptx\" ]]; then MD_FILE=\"${FILE%.*}.md\"; if [ ! -f \"$MD_FILE\" ] || [ \"$FILE\" -nt \"$MD_FILE\" ]; then if command -v pandoc >/dev/null; then pandoc -t markdown -o \"$MD_FILE\" \"$FILE\" 2>/dev/null && echo \"{\\\"decision\\\": \\\"block\\\", \\\"reason\\\": \\\"Converted $FILE to $MD_FILE — read the .md version instead (saves vision tokens).\\\"}\"; exit 2; elif command -v markitdown >/dev/null; then markitdown \"$FILE\" > \"$MD_FILE\" 2>/dev/null && echo \"{\\\"decision\\\": \\\"block\\\", \\\"reason\\\": \\\"Converted $FILE to $MD_FILE — read the .md version instead.\\\"}\"; exit 2; fi; else echo \"{\\\"decision\\\": \\\"block\\\", \\\"reason\\\": \\\"$MD_FILE already exists and is up-to-date — read that instead.\\\"}\"; exit 2; fi; fi; exit 0'"
  },
  "timeout": 15
}
```

> **Note:** Requires `pandoc` or `markitdown` installed. Falls through to normal Read if neither is available. Generated `.md` files should be added to `.gitignore`.

### guard-bash-compiled

Reference pattern: compiled Go/Rust hook for PreToolUse/Bash that uses AST parsing instead of regex for command validation. Provides superior security and sub-millisecond execution.

Source: community signals scan 2026-04-12 (htakahama)

**Pattern (not a copy-paste config — requires building the binary):**
- Go binary receives `$TOOL_INPUT` via stdin
- Parses shell command using `syntax` package (AST, not regex)
- Validates against allowlist/denylist of commands, flags, paths
- Returns JSON `{decision: "allow"}` or `{decision: "block", reason: "..."}`
- P99 < 1ms vs ~50ms for equivalent bash+grep hook

```json
{
  "event": "PreToolUse",
  "matcher": "Bash",
  "config": {
    "type": "command",
    "command": ".claude/hooks/guard-bash"
  },
  "timeout": 5
}
```

> **When to recommend:** Projects with high security requirements or heavy agent usage where hook latency matters. The AST approach catches obfuscated commands that regex misses (e.g. `r''m -r''f /`).

### session-waste-monitor

Stop hook that tracks token usage patterns and warns when waste factor is high. Based on clauditor's waste factor metric.

Source: community signals scan 2026-04-11 (IyadhKhalfallah/clauditor)

```json
{
  "event": "Stop",
  "config": {
    "type": "prompt",
    "prompt": "Analyze the conversation for token waste patterns: 1) Repeated reads of the same file, 2) Grep/Glob searches that could have been avoided with LSP, 3) Re-deriving information that was already in context, 4) Verbose explanations the user didn't ask for. If significant waste is detected, add a systemMessage suggesting the user start a fresh session with focused context."
  },
  "timeout": 15
}
```

### session-end-feedback-loop

SessionEnd hook that auto-classifies session gaps and generates improvement signals. Analyzes the transcript to identify what went wrong and why, then posts structured feedback to an external channel.

Source: community signals scan 2026-04-17 (Brian Scanlan / Intercom pattern, score 9/10)

```json
{
  "event": "SessionEnd",
  "config": {
    "type": "command",
    "command": "bash -c 'TRANSCRIPT=\"$CLAUDE_SESSION_TRANSCRIPT\"; if [ -z \"$TRANSCRIPT\" ]; then exit 0; fi; ANALYSIS=$(echo \"$TRANSCRIPT\" | claude -p \"Analyze this Claude Code session transcript. Classify any gaps into: missing_skill (user needed a skill that doesn'\''t exist), missing_tool (MCP or CLI tool was needed), repeated_failure (same error occurred 3+ times), wrong_info (Claude gave incorrect information). Output JSON: {gaps: [{type, description, severity}]}. If no significant gaps, output {gaps: []}.\"); echo \"$ANALYSIS\" > .claude/local/last-session-gaps.json; exit 0'"
  },
  "timeout": 60,
  "async": true
}
```

> **Pattern:** Uses `claude -p` with Haiku to analyze the session transcript at exit. Writes gaps to `.claude/local/last-session-gaps.json` for later processing by a maintenance agent or CI system. The async flag ensures the hook doesn't block session exit.
>
> **Variants:**
> - Post to Slack: replace file write with `curl -X POST "$SLACK_WEBHOOK" -d "$ANALYSIS"`
> - Create GitHub issues: pipe gaps through `gh issue create` per finding
> - Feed back into memory: merge gaps into `~/.claude/projects/*/memory/feedback_*.md`
>
> **When to recommend:** Teams running 10+ Claude Code sessions/day who want systematic improvement signals. Directly applicable to continuous-improvement loops driven by a scheduled background agent.
>
> **Observability (Intercom production setup):** Intercom emits 14 OpenTelemetry event types to Honeycomb per session (no prompts/messages captured — only structural events like tool calls, durations, gap classifications). Useful for building dashboards over aggregate session quality.

---

## Category 5: Cost Visibility (advanced)

Source: community signals scan 2026-04-17 (zivtech/claude-cost-helpers, 7 hooks)

### idle-tax-warning

Stop hook that detects when Claude is idle-looping (asking questions instead of working) and warns about token waste.

```json
{
  "event": "Stop",
  "config": {
    "type": "prompt",
    "prompt": "Check if the last 3 responses were primarily questions or clarifications without making progress. If Claude is in a question loop instead of working, warn: 'Idle tax detected — Claude is asking instead of doing. Consider providing more context or being more directive.' Approve if real progress is being made."
  },
  "timeout": 10
}
```

### context-rot-zone-alert

PreCompact hook that alerts when context is about to be compacted, suggesting a subagent split.

```json
{
  "event": "PreCompact",
  "matcher": "auto",
  "config": {
    "type": "command",
    "command": "bash -c 'echo \"{\\\"systemMessage\\\": \\\"Context rot zone: auto-compaction triggered. Consider splitting remaining work into a fresh subagent to preserve quality.\\\"}\"; exit 0'"
  },
  "timeout": 5
}
```

### subagent-file-count-guard

PreToolUse hook that warns when an agent spawn includes too many files in its prompt.

```json
{
  "event": "PreToolUse",
  "matcher": "Agent",
  "config": {
    "type": "prompt",
    "prompt": "Check the Agent tool call prompt. If it references more than 15 specific files or asks the subagent to read/modify many files, warn that this may cause context bloat in the subagent. Suggest breaking the work into smaller, focused subagents. Approve if file count is reasonable (<15)."
  },
  "timeout": 10
}
```

> **When to recommend:** Projects experiencing high token costs or frequent rate limits. These hooks provide visibility into cost drivers and suggest mitigations in real-time. Pairs well with TOKEN-DOCTOR mode.

---

## Category 6: Productivity & Workflow Enforcement (advanced)

Source: community signals scan 2026-04-17

### force-skill-gate

PreToolUse hook that blocks raw CLI commands and forces the user (or Claude) to invoke the canonical skill instead. Captures business intent and ensures consistent workflows.

Source: community signals scan 2026-04-17 (Brian Scanlan / Intercom pattern)

```json
{
  "event": "PreToolUse",
  "matcher": "Bash",
  "config": {
    "type": "command",
    "command": "bash -c 'CMD=$(echo \"$TOOL_INPUT\" | grep -oP '\"command\"\\s*:\\s*\"\\K[^\"]+'); if echo \"$CMD\" | grep -qE \"gh\\s+pr\\s+create\"; then echo \"{\\\"decision\\\": \\\"block\\\", \\\"reason\\\": \\\"Use /create-pr skill instead of raw gh pr create. This captures business intent first.\\\"}\"; exit 2; fi; exit 0'"
  },
  "timeout": 5
}
```

> **Pattern:** Block raw tool invocations that have a skill equivalent. The skill wraps the tool with structured prompts, context injection, and post-processing — raw calls bypass all of that.
>
> **Variants:**
> - Block `gh issue create` → force `/create-issue` skill
> - Block `git commit` → force `/commit` skill
> - Block `npm publish` → force `/release` skill
>
> **When to recommend:** Teams with canonical skills for common workflows. Prevents drift between "skill way" and "raw way" of doing the same thing.

### hook-skill-hint

PostToolUse hook that nudges toward a canonical skill after detecting a related raw command. Softer alternative to `force-skill-gate` — hints instead of blocking.

Source: community signals scan 2026-04-17 (Carl Vellotti / @aakashgupta pattern)

```json
{
  "event": "PostToolUse",
  "matcher": "Bash",
  "config": {
    "type": "command",
    "command": "bash -c 'CMD=$(echo \"$TOOL_INPUT\" | grep -oP '\"command\"\\s*:\\s*\"\\K[^\"]+'); if echo \"$CMD\" | grep -qE \"^git\\s+add\"; then echo \"{\\\"systemMessage\\\": \\\"Hint: Run /commit to use the canonical commit workflow.\\\"}\"; fi; exit 0'"
  },
  "timeout": 5
}
```

> **Pattern:** Skills don't reliably auto-invoke via frontmatter triggers alone. This hook acts as a workaround — after detecting a precursor command (`git add`), it injects a systemMessage reminding Claude to invoke the matching skill (`/commit`). Non-blocking: the raw command still executes.
>
> **Variants:**
> - After `npm test` fails → hint `/fix` skill
> - After `git diff` → hint `/review` skill
> - After `grep -r "TODO"` → hint `/refactor` skill
>
> **When to recommend:** Projects with skills that should fire after certain tool patterns but don't trigger reliably from frontmatter keywords alone. Combines well with `skill-auto-invoke` (Category 4) for full coverage: UserPromptSubmit catches keyword triggers, PostToolUse catches action-based triggers.

---

## Category 7: Enterprise Patterns (Intercom production + v2.1.118)

Source: community signals scan 2026-04-23 (community-signals-23-april-2026.md — Brian Scanlan / Intercom blog)

### pre-tool-intent-gate

PreToolUse hook that captures the **why** before a potentially risky action. Forces Claude to articulate business intent before executing certain tool calls — creates an audit trail and surfaces misaligned operations early.

Source: Intercom production (13 plugins, 100+ skills — "why before what" pattern)

```json
{
  "event": "PreToolUse",
  "matcher": "Bash",
  "if": "tool_input.command matches 'gh pr create*'",
  "config": {
    "type": "prompt",
    "prompt": "Before allowing this PR creation, extract the intent: What business problem does this PR solve? Is this completing a tracked task or an ad-hoc change? If the intent is unclear or this looks like a shortcut bypassing the /pr skill, block and suggest the user run /pr instead. Approve if intent is clear and this is a legitimate direct PR creation."
  },
  "timeout": 15
}
```

> **Pattern:** The "why before what" gate. Slows down one-off raw commands to create intentional workflows. Pairs with `force-skill-gate` for enforcement; use this when you want advisory friction instead of hard blocks.
>
> **When to recommend:** Enterprise teams with compliance requirements, or projects where ad-hoc commands frequently bypass the established skill workflow.

### post-tool-auto-fix-environment

PostToolUse hook that detects missing tools from error output and auto-installs them. Eliminates "command not found" interruptions.

Source: Intercom production (PostToolUse auto-install pattern)

```json
{
  "event": "PostToolUse",
  "matcher": "Bash",
  "config": {
    "type": "command",
    "command": "bash -c 'OUTPUT=$(echo \"$TOOL_OUTPUT\"); if echo \"$OUTPUT\" | grep -qE \"command not found|not installed|No such file\"; then MISSING=$(echo \"$OUTPUT\" | grep -oE \"'[a-z][a-z0-9_-]+': command not found\" | head -1 | cut -d\"'\" -f2); if [ -n \"$MISSING\" ]; then echo \"{\\\"systemMessage\\\": \\\"Missing tool detected: $MISSING. Suggest running: brew install $MISSING or equivalent.\\\"}\"; fi; fi; exit 0'"
  },
  "timeout": 5
}
```

> **When to recommend:** Projects running on developer machines with varying toolchains. Especially useful for onboarding or cross-platform teams where tool availability varies.

### permissions-analyzer

Stop hook (or SessionEnd) that tracks permission prompts and proposes allowlist entries after repeated patterns. Reduces permission fatigue systematically.

Source: Intercom production (Permissions Analyzer — GREEN/YELLOW/RED classification after 5 prompts)

```json
{
  "event": "SessionEnd",
  "config": {
    "type": "prompt",
    "prompt": "Analyze this session for repeated permission prompts. Classify each repeated tool pattern as: GREEN (safe to allow permanently — e.g. read-only bash, file reads), YELLOW (allow for this project — e.g. project-specific writes), RED (never allow — e.g. system-level changes, exfiltration risks). Output JSON: {allowlist_candidates: [{pattern, classification, rationale}]}. Write suggestions to .claude/local/permission-suggestions.json."
  },
  "timeout": 30,
  "async": true
}
```

> **Pattern:** After 5+ permission prompts in a session, Intercom's production system classifies them GREEN/YELLOW/RED and proposes an allowlist. This hook replicates that at SessionEnd. The output feeds into a periodic `allowlist-review` workflow.
>
> **Note (v2.1.118):** Hooks can now invoke MCP tools directly — this hook could call a compliance MCP to validate allowlist candidates against company policy without spawning a subagent.
>
> **When to recommend:** Teams running CC at scale (10+ daily sessions) where permission prompts are causing friction. Pairs with Intercom's approach of reviewing 14-day transcript windows for classification.

---

## Installation

### Single hook

Add any hook object to your `settings.json`:

```json
{
  "hooks": [
    { ... }
  ]
}
```

### Recommended starter set

For a new project, install these hooks as a baseline:

```json
{
  "hooks": [
    // Security (always)
    { "event": "PreToolUse", "matcher": "Bash", "config": { "type": "command", "command": "..." }, "timeout": 5 },
    // block-no-verify ^

    { "event": "PreToolUse", "matcher": "Write|Edit", "config": { "type": "command", "command": "..." }, "timeout": 5 },
    // config-protection ^

    // Quality (recommended)
    { "event": "PostToolUse", "matcher": "Edit|Write", "config": { "type": "command", "command": "..." }, "timeout": 15 },
    // post-edit-format ^

    // DX (optional)
    { "event": "Notification", "config": { "type": "command", "command": "..." }, "timeout": 5, "async": true }
    // notification ^
  ]
}
```

### Settings file locations

| Scope | Path |
|---|---|
| User | `~/.claude/settings.json` |
| Project | `.claude/settings.json` |
| Local | `.claude/settings.local.json` |

Security hooks should go in the **user** scope so they apply globally. Quality and DX hooks can be project-specific.

---

## Handler Types Reference (v2.1.92+, mcp_tool v2.1.118)

Claude Code supports 5 hook handler types:

| Type | `config.type` | Description | Timeout |
|---|---|---|---|
| **Command** | `"command"` | Runs a shell script. Exit 0 = allow, exit 2 = block. | 5-30s typical |
| **Prompt** | `"prompt"` | LLM evaluation of the action. Returns approve/block. | 15-30s |
| **HTTP** | `"http"` | POSTs JSON to an external endpoint. Endpoint returns standard hook response. | 10-30s |
| **Agent** | `"agent"` | Spawns a sub-agent with Read/Grep/Glob tools. Max 50 turns. | 60s |
| **MCP Tool** | `"mcp_tool"` | Invokes an MCP tool directly — no shell script or subagent needed. `name`: `"server:tool_name"`, `args`: tool arguments with `{{ tool.output }}` templating. (v2.1.118) | 15-30s |

**MCP Tool handler** — new in v2.1.118, directly calls an MCP server tool from a hook:
```json
{
  "event": "PostToolUse",
  "matcher": "Edit",
  "config": {
    "type": "mcp_tool",
    "name": "memory-server:save_context",
    "args": {
      "context": "{{ tool.output }}",
      "file": "{{ tool_input.file_path }}"
    }
  },
  "timeout": 15
}
```

**Use cases:** persist tool outputs to memory MCP after every edit, log audit trail to external MCP server, trigger notifications via Slack/Telegram MCP without a shell script. ⚠ Doc `hooks.md` not yet updated — verify behavior against v2.1.118 release notes.

**HTTP handler** -- useful for centralized policy servers, external approval workflows, or logging:
```json
{
  "event": "PreToolUse",
  "matcher": "Bash",
  "config": {
    "type": "http",
    "url": "https://policy.internal/hooks/validate",
    "headers": { "Authorization": "Bearer $POLICY_TOKEN" }
  },
  "timeout": 10
}
```

**Agent handler** -- useful for complex validation that needs codebase context:
```json
{
  "event": "PreToolUse",
  "matcher": "Edit",
  "config": {
    "type": "agent",
    "prompt": "Check if this edit follows the project's naming conventions and architectural patterns. Read the CLAUDE.md and compare. Approve if consistent, block with explanation if not."
  },
  "timeout": 60
}
```

### Conditional Hooks (`if` field, v2.1.85+)

Any hook can include an `if` field to conditionally fire, using permission rule syntax:

```json
{
  "event": "PreToolUse",
  "matcher": "Bash",
  "if": "tool_input.command matches 'git push*'",
  "config": { "type": "command", "command": "..." }
}
```

### Observability fields (v2.1.119+)

**`duration_ms` in `PostToolUse` / `PostToolUseFailure` input** — every post-tool hook receives the elapsed milliseconds of the tool invocation in its JSON payload. Enables per-tool latency dashboards and slow-tool alerts without wrapping tool calls externally.

```bash
# Example: log slow Bash calls to a file
DURATION=$(jq -r '.duration_ms' <<< "$HOOK_INPUT")
if [ "$DURATION" -gt 10000 ]; then
  echo "$(date -Iseconds) slow bash ${DURATION}ms: $(jq -r '.tool_input.command' <<< "$HOOK_INPUT")" >> .claude/local/slow-tools.log
fi
exit 0
```

**OpenTelemetry event enrichment (v2.1.119)** — `tool_result` and `tool_decision` OTel events now carry `tool_use_id` + `tool_input_size_bytes`. Use `tool_use_id` to correlate decision → result pairs; use `tool_input_size_bytes` to flag oversized payloads (e.g. Read on huge files) in dashboards.

**`PostToolBatch` hook (v2.1.119+)** — fires after a batch of parallel tool calls completes. Receives the full list of tools and their outputs. Use for batch-level monitoring, aggregation, or post-parallel-execution logic that would fire too many times if attached to individual `PostToolUse` events.

```json
{
  "event": "PostToolBatch",
  "config": {
    "type": "command",
    "command": "bash .claude/hooks/batch-monitor.sh"
  }
}
```

```bash
# batch-monitor.sh — log batch summary
TOOLS=$(echo "$HOOK_INPUT" | jq -r '[.tools[].name] | join(", ")')
COUNT=$(echo "$HOOK_INPUT" | jq '.tools | length')
echo "$(date -Iseconds) batch[${COUNT}]: ${TOOLS}" >> .claude/local/batch-log.log
exit 0
```

### message-display-filter (v2.1.152)

**`MessageDisplay` hook** — 7ème type d'event Output (après Stop, Notification). Permet de transformer ou masquer le texte des messages assistant **avant affichage**. Utile pour : redacter des PII dans les outputs, ajouter un prefix de brand, filtrer des outputs verbeux.

```json
{
  "event": "MessageDisplay",
  "config": {
    "type": "command",
    "command": "bash .claude/hooks/message-filter.sh"
  },
  "timeout": 3
}
```

```bash
# message-filter.sh — redact secrets before display
INPUT=$(cat)
echo "$INPUT" | sed 's/sk-[a-zA-Z0-9]\{20,\}/[REDACTED]/g'
exit 0
```

Le hook reçoit le texte du message assistant en stdin et doit renvoyer le texte transformé en stdout. Retourner une chaîne vide masque le message entièrement.

### session-reload-skills (v2.1.152)

`SessionStart` hook avec `reloadSkills: true` — force le re-scan des dossiers `skills/` à chaque session, équivalent à `/reload-skills` automatique au démarrage.

```json
{
  "event": "SessionStart",
  "reloadSkills": true,
  "config": {
    "type": "command",
    "command": "echo '{\"sessionTitle\": \"Dev session — $(git branch --show-current 2>/dev/null || echo no-git)\"}'"
  }
}
```

`sessionTitle` : injecte un titre dans la session (visible dans `claude agents` et les logs d'orchestration). Recommandé pour les projets multi-branches.

### Caveats

- **Async `PostToolUse` without payload (pre-v2.1.119)** wrote empty entries to the transcript — upgrade to v2.1.119+ or ensure async hooks always emit at least `{"continue": true}`.
- **`mcp_tool` handler (v2.1.118+)** — when adding a hook that replaces a subagent-based MCP call, verify the MCP server is listed in the project's `.mcp.json` and that its tools are auto-approved in `permissions.allow`, otherwise the hook hangs on permission prompt.
- **`MessageDisplay` hook (v2.1.152)** — s'exécute côté client uniquement, ne modifie pas le transcript sous-jacent ni les tokens facturés. Le contexte Claude voit toujours le texte original.
