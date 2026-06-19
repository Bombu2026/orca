#!/usr/bin/env bash
# ai-slop-grep — fast grep for AI-slop signals in a Next.js project.
# Used by design-review and as a standalone pre-commit check.
#
# Usage: bash scripts/ai-slop-grep.sh <project-path>

set -uo pipefail

PROJECT="${1:-.}"
cd "$PROJECT" || { echo "BLOCKED: cannot cd into $PROJECT"; exit 2; }

if [ -d src ]; then
  ROOT=src
elif [ -d app ]; then
  ROOT=app
else
  echo "BLOCKED: no src/ or app/ in $PROJECT"
  exit 2
fi

declare -a PATTERNS=(
  "rounded-lg|rounded-lg used (radius not differentiated)|2"
  "shadow-md|shadow-md used (elevation flat across cards)|2"
  "Get started|'Get started' generic CTA copy|2"
  "Lorem ipsum|Lorem ipsum residual|4"
  "Your tagline|'Your tagline here' placeholder|4"
  "from-purple-|Purple gradient (AI-slop signature)|3"
  "to-purple-|Purple gradient target (AI-slop signature)|2"
  "lucide-react.*Sparkles|Sparkles icon generic|1"
  "lucide-react.*Zap|Zap icon generic|1"
  "lucide-react.*Rocket|Rocket icon generic|1"
  "min-h-screen.*flex.*items-center.*justify-center|Every section centered 100vh (flat rhythm)|3"
)

TOTAL_PENALTY=0
HITS=0
echo "ai-slop-grep — scanning $PROJECT/$ROOT"
echo "---"

for entry in "${PATTERNS[@]}"; do
  IFS='|' read -r RE REASON PENALTY <<< "$entry"
  if matches=$(grep -rE "$RE" "$ROOT" 2>/dev/null | head -5); then
    if [ -n "$matches" ]; then
      count=$(echo "$matches" | wc -l | tr -d ' ')
      HITS=$((HITS + count))
      TOTAL_PENALTY=$((TOTAL_PENALTY + PENALTY * count))
      echo "[-$((PENALTY * count))] $REASON ($count hit$([ "$count" -gt 1 ] && echo s))"
      echo "$matches" | sed 's/^/      /' | head -3
    fi
  fi
done

# Widow/orphan handling — absence is a senior-typography gap (stranded short words).
# A page with read copy but zero text-wrap/balance/pretty anywhere ships default
# greedy wrap → inhuman line breaks. See references/typography-2026.md § Line-breaking.
if ! grep -rqE "text-(balance|pretty|wrap)" "$ROOT" 2>/dev/null; then
  echo "[-3] Widow/orphan handling absent (no text-balance/pretty/wrap in $ROOT/)"
  HITS=$((HITS + 1))
  TOTAL_PENALTY=$((TOTAL_PENALTY + 3))
fi

echo "---"
echo "Total hits: $HITS"
echo "Total penalty: $TOTAL_PENALTY"

if [ "$TOTAL_PENALTY" -ge 10 ]; then
  echo "VERDICT: BLOCKED (penalty $TOTAL_PENALTY >= 10)"
  exit 1
elif [ "$TOTAL_PENALTY" -ge 4 ]; then
  echo "VERDICT: GAPS (penalty $TOTAL_PENALTY)"
  exit 0
else
  echo "VERDICT: OK"
  exit 0
fi
