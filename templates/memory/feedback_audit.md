---
name: Audit feedback {{DATE}}
description: User rating {{SCORE}}/5 on /assistant audit session for {{PROJECT_NAME}}. Score is anchored to actionable value, not effort.
type: feedback
---

# Audit feedback — {{DATE}}

**Project:** `{{PROJECT_PATH}}`
**User rating:** {{SCORE}}/5 ({{CATEGORY}})
**Audit score (before/after):** {{AUDIT_SCORE_BEFORE}} → {{AUDIT_SCORE_AFTER}}
**Reflection:** [{{REFLECTION_PATH}}]({{REFLECTION_PATH}})

## User note

> {{USER_NOTE}}

## How to apply

- **Score 1-2 (unhelpful/weak)** — flag dimensions that were over-weighted, recommendations that missed. The feedback loop lowers defaults in `references/`.
- **Score 3 (ok)** — check whether the gap is a missing pattern (add to references/) or over-recommendation fatigue (tighten scoring in `audit-project.ts`).
- **Score 4-5 (good/excellent)** — extract which recommendations the user applied; promote those as defaults. Keep the patterns that led to this audit as high-priority.

## What the feedback loop should extract

1. Which dimensions' recommendations were actioned (check git log of project since audit date).
2. Which recommendations were ignored (ditto).
3. Patterns across score-1/score-5 sessions to identify calibration drift.
