---
description: Code review the current diff with security checklist
---
Review the current diff (`git diff` or `git diff --cached`). Check for: SQL injection, XSS, command injection, auth bypass, sensitive data exposure, error handling gaps, race conditions. Also check code quality: naming, complexity, duplication. Output findings grouped by severity (critical/high/medium/low).
