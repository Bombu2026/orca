# {{PROJECT_NAME}}

## Overview
{{DESCRIPTION}}

## Commands
- `{{PACKAGE_MANAGER}} run build` — Compile to dist/
- `{{PACKAGE_MANAGER}} run dev` — Run in dev mode with watch
- `{{PACKAGE_MANAGER}} run test` — Run tests
- `{{PACKAGE_MANAGER}} run lint` — Lint check

## Entry Point
- Binary: `{{BIN_NAME}}`
- Main: `{{ENTRY_POINT}}`

## Command Structure
```
{{COMMAND_STRUCTURE}}
```

## Arguments & Flags
{{ARGUMENTS_FLAGS}}

## Architecture
- **Runtime**: {{RUNTIME}}
- **Arg parsing**: {{ARG_PARSER}}
- **Output format**: {{OUTPUT_FORMAT}}
- **Config file**: {{CONFIG_FILE}}

### Directory Structure
```
{{DIRECTORY_STRUCTURE}}
```

## Build & Distribution
- Build target: {{BUILD_TARGET}}
- Package format: {{PACKAGE_FORMAT}}
- Registry: {{REGISTRY}}

## Testing
- Unit tests: {{TEST_FRAMEWORK}}
- Integration tests: CLI snapshot testing via subprocess
- Coverage: {{COVERAGE_TARGET}}

## Conventions
- Exit code 0 = success, 1 = user error, 2 = internal error
- Stderr for logs/errors, stdout for output
- Strict TypeScript, no `any`
- Tout texte en français : accents obligatoires (é, è, ê, à, ô, û, etc.)
- Jamais de `<br />` ni de `<span>` pour fragmenter une phrase à des fins stylistiques — une phrase = un flux continu
- No trailing summary in responses — read the diff
- Accuracy over approval: correct weak premises directly, say `unknown` when evidence is missing, and use confidence labels (`high` / `medium` / `low` / `unknown`) for uncertain judgments
- No flattery or diplomatic padding; lead with the real blocker, counterargument, or risk when one exists
- {{ADDITIONAL_CONVENTIONS}}

## Dependencies
- Runtime: {{RUNTIME}}
- Package manager: {{PACKAGE_MANAGER}}
