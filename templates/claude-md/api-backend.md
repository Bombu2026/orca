# {{PROJECT_NAME}}

## Overview
{{DESCRIPTION}}

## Commands
- `{{PACKAGE_MANAGER}} install` — Install dependencies
- `{{PACKAGE_MANAGER}} run dev` — Start dev server ({{DEV_PORT}})
- `{{PACKAGE_MANAGER}} run build` — Production build
- `{{PACKAGE_MANAGER}} run start` — Start production server
- `{{PACKAGE_MANAGER}} run test` — Run tests
- `{{PACKAGE_MANAGER}} run db:migrate` — Run database migrations
- `{{PACKAGE_MANAGER}} run db:seed` — Seed database

## Architecture
- **Runtime**: {{RUNTIME}}
- **Framework**: {{FRAMEWORK}}
- **Database**: {{DATABASE}}
- **ORM**: {{ORM}}
- **Auth**: {{AUTH}}
- **Deployment**: {{DEPLOYMENT}}

### Directory Structure
```
{{DIRECTORY_STRUCTURE}}
```

## Routes & Endpoints
{{ROUTES}}

## Database
- Connection: {{DB_CONNECTION}}
- Migrations: {{MIGRATION_STRATEGY}}
- Schema location: {{SCHEMA_LOCATION}}

## Auth & Middleware
- Auth strategy: {{AUTH_STRATEGY}}
- Middleware stack: {{MIDDLEWARE_STACK}}
- CORS: {{CORS_CONFIG}}

## Error Handling
- Validation errors: 400 with field-level messages
- Auth errors: 401/403 with generic messages (no info leak)
- Not found: 404 with resource type
- Internal: 500 with error ID for log correlation
- Format: `{ error: string, code: string, details?: unknown }`

## API Documentation
- Spec format: {{API_SPEC_FORMAT}}
- Spec location: {{API_SPEC_LOCATION}}
- Generated from: {{API_SPEC_SOURCE}}

## Conventions
- Input validation at route boundary, never trust client data
- Strict TypeScript, no `any`
- All DB access through ORM, no raw queries unless justified
- Tout texte en français : accents obligatoires (é, è, ê, à, ô, û, etc.)
- Jamais de `<br />` ni de `<span>` pour fragmenter une phrase à des fins stylistiques — une phrase = un flux continu
- No trailing summary in responses — read the diff
- Accuracy over approval: correct weak premises directly, say `unknown` when evidence is missing, and use confidence labels (`high` / `medium` / `low` / `unknown`) for uncertain judgments
- No flattery or diplomatic padding; lead with the real blocker, counterargument, or risk when one exists
- {{ADDITIONAL_CONVENTIONS}}

## Dependencies
- Runtime: {{RUNTIME}}
- Package manager: {{PACKAGE_MANAGER}}
