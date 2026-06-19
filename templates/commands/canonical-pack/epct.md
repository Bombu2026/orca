---
description: EPCT workflow — Explore, Plan, Code, Test with human validation
---
Follow the EPCT workflow for: $ARGUMENTS

1. **EXPLORE**: Read relevant files, understand conventions, map dependencies. No code changes yet.
2. **PLAN**: Write a step-by-step plan with files to modify, risks, and edge cases. **STOP HERE and wait for user approval before continuing.**
3. **CODE**: Implement the approved plan step by step. Run `{{BUILD_COMMAND}}` after each significant change.
4. **TEST**: Run `{{TEST_COMMAND}}`, fix failures, verify the feature works end-to-end.
