#!/usr/bin/env bash
# PreToolUse: force skill invocation before raw tool calls
# Pattern: Intercom — intercept gh pr create, force /pr skill
# Usage: add to settings.json under PreToolUse, filter tool=Bash

TOOL_INPUT="${TOOL_INPUT:-}"

# Gate: gh pr create → force /pr skill
if echo "$TOOL_INPUT" | grep -qE "gh pr create"; then
  echo "Use /pr skill instead of raw 'gh pr create' — it captures context first." >&2
  echo '{"decision": "block", "reason": "Use /pr skill for PR creation. Run /pr to capture business intent and generate a structured PR body."}'
  exit 2
fi

# Gate: add more rules here
# if echo "$TOOL_INPUT" | grep -qE "pattern"; then
#   echo '{"decision": "block", "reason": "Use /skill-name instead."}'
#   exit 2
# fi

exit 0
