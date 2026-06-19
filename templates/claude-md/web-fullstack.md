# {{PROJECT_NAME}}

## Overview
{{DESCRIPTION}}

## Commands
- `{{PACKAGE_MANAGER}} install` — Install dependencies
- `{{PACKAGE_MANAGER}} run dev` — Start dev server ({{DEV_PORT}})
- `{{PACKAGE_MANAGER}} run build` — Production build
- `{{PACKAGE_MANAGER}} run lint` — Lint check
- `{{PACKAGE_MANAGER}} run test` — Run tests

## Architecture
- **Framework**: {{FRAMEWORK}} (App Router)
- **Styling**: {{STYLING}}
- **Database**: {{DATABASE}}
- **Auth**: {{AUTH}}
- **Deployment**: {{DEPLOYMENT}}

### Directory Structure
```
{{DIRECTORY_STRUCTURE}}
```

## Conventions
- Server Components by default, `'use client'` only for interactivity
- Server Actions for mutations, Route Handlers for public APIs
- Strict TypeScript, no `any`
- UI library: {{UI_LIBRARY}} (default: shadcn/ui with @base-ui/react, not @radix-ui)
- Tout texte en français : accents obligatoires (é, è, ê, à, ô, û, etc.)
- Jamais de `<br />` ni de `<span>` pour fragmenter une phrase à des fins stylistiques — une phrase = un flux continu
- No trailing summary in responses — read the diff
- Accuracy over approval: correct weak premises directly, say `unknown` when evidence is missing, and use confidence labels (`high` / `medium` / `low` / `unknown`) for uncertain judgments
- No flattery or diplomatic padding; lead with the real blocker, counterargument, or risk when one exists
- {{ADDITIONAL_CONVENTIONS}}

## MCP Servers
- `next-devtools-mcp` (vercel) — diagnostics runtime Next.js, migration Next 16 auto, Cache Components, Playwright browser testing. Recommandé pour tous les projets Next.js.

## Dependencies
- Runtime: {{RUNTIME}}
- Package manager: {{PACKAGE_MANAGER}}
