#!/usr/bin/env bash
# SessionEnd: classify session gaps and create improvement issues
# Pattern: Intercom (Brian Scanlan) — score 9/10
# Usage: add to settings.json under Stop event

TRANSCRIPT_PATH="${CLAUDE_SESSION_TRANSCRIPT:-}"

if [[ -z "$TRANSCRIPT_PATH" || ! -f "$TRANSCRIPT_PATH" ]]; then
  exit 0
fi

# Analyze with a fast model (customize this)
ANALYSIS=$(claude -p "Analyze this Claude Code session transcript. Classify any recurring issues as one of: missing_skill, missing_tool, repeated_failure, wrong_info. Output a JSON array of {type, description, count}. If no issues, output []. Be brief." < "$TRANSCRIPT_PATH" 2>/dev/null)

if [[ -z "$ANALYSIS" || "$ANALYSIS" == "[]" ]]; then
  exit 0
fi

# Log to project memory (customize destination)
MEMORY_FILE=".claude/session-gaps.jsonl"
echo "{\"date\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\", \"gaps\": $ANALYSIS}" >> "$MEMORY_FILE"

echo "Session gaps logged to $MEMORY_FILE" >&2
