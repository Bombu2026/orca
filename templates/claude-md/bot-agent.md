# {{PROJECT_NAME}}

## Overview
{{DESCRIPTION}}

## Commands
- `{{PACKAGE_MANAGER}} install` — Install dependencies
- `{{PACKAGE_MANAGER}} run dev` — Start bot in dev mode
- `{{PACKAGE_MANAGER}} run build` — Production build
- `{{PACKAGE_MANAGER}} run start` — Start bot in production

## Architecture
- **Platform**: {{BOT_PLATFORM}}
- **Runtime**: {{RUNTIME}}
- **AI Provider**: {{AI_PROVIDER}}
- **AI Model**: {{AI_MODEL}}
- **Database**: {{DATABASE}}
- **Deployment**: {{DEPLOYMENT}}

### MCP Servers
{{MCP_SERVERS}}

### Webhook Routes
{{WEBHOOK_ROUTES}}

## State Management
- Session storage: {{SESSION_STORAGE}}
- Conversation context: {{CONTEXT_STRATEGY}}
- Rate limiting: {{RATE_LIMITING}}

## Command Handlers
{{COMMAND_HANDLERS}}

## AI Engine
- **Runtime**: {{AI_RUNTIME}}
- When using `claude -p` as AI engine: never use API keys, never mock AI output
- All AI-generated content must come from real Claude invocations

## Conventions
- All handlers are async, errors caught at middleware level
- Strict TypeScript, no `any`
- Secrets via environment variables only
- Tout texte en français : accents obligatoires (é, è, ê, à, ô, û, etc.)
- Jamais de `<br />` ni de `<span>` pour fragmenter une phrase à des fins stylistiques — une phrase = un flux continu
- No trailing summary in responses — read the diff
- Accuracy over approval: correct weak premises directly, say `unknown` when evidence is missing, and use confidence labels (`high` / `medium` / `low` / `unknown`) for uncertain judgments
- No flattery or diplomatic padding; lead with the real blocker, counterargument, or risk when one exists
- {{ADDITIONAL_CONVENTIONS}}

## Dependencies
- Runtime: {{RUNTIME}}
- Package manager: {{PACKAGE_MANAGER}}
