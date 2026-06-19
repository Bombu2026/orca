#!/bin/bash
# auto-memory.sh — appends a one-line session summary to Assistant's memory
# Invoked by SessionEnd hook when session ends in the Assistant project.

CWD="${CLAUDE_PROJECT_DIR:-$PWD}"
MEMORY_DIR="${ASSISTANT_MEMORY_DIR:-$HOME/.claude/assistant-memory}"
LOG="$MEMORY_DIR/session-log.md"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M')

# Only run when a memory dir is configured or the project carries a SKILL.md
# (avoids polluting unrelated projects when wired as a global SessionEnd hook).
if [ -z "${ASSISTANT_MEMORY_DIR:-}" ] && [ ! -f "$CWD/SKILL.md" ]; then
  exit 0
fi

mkdir -p "$MEMORY_DIR"

# Init file if missing
if [ ! -f "$LOG" ]; then
  cat > "$LOG" <<'EOF'
---
name: session-log
description: Timeline of Claude Code sessions in the Assistant project. One line per session. Signals when /assistant init, /assistant audit, or manual edits were run.
type: project
---

# Session Log

EOF
fi

# Append session summary (stop reason + turn count available via env)
REASON="${STOP_REASON:-end}"
echo "- $TIMESTAMP — session ended ($REASON)" >> "$LOG"

# Keep the file under 500 lines (rotate oldest by keeping last 500)
if [ "$(wc -l < "$LOG")" -gt 510 ]; then
  HEAD=$(head -n 7 "$LOG")
  TAIL=$(tail -n 500 "$LOG")
  printf '%s\n%s\n' "$HEAD" "$TAIL" > "$LOG"
fi

exit 0
