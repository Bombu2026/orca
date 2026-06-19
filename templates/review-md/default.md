# REVIEW.md

## What to Flag

- {{SECURITY_PATTERNS}} (e.g., SQL injection, XSS, command injection, hardcoded secrets)
- {{PERFORMANCE_PATTERNS}} (e.g., N+1 queries, missing indexes, unbounded loops)
- {{ARCHITECTURE_VIOLATIONS}} (e.g., wrong layer dependencies, circular imports)
- Missing error handling at system boundaries
- Untested public API changes

## What to Skip

- Formatting/style issues (handled by linter)
- Minor naming preferences
- Comment style differences
- Import ordering
- Whitespace changes

## Severity Levels

- **red**: Security vulnerability, data loss risk, or production-breaking bug
- **yellow**: Performance concern, missing test, or logic error
- **purple**: Architecture violation or design pattern mismatch

## Project-Specific Rules

{{PROJECT_RULES}}
