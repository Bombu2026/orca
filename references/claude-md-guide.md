# Guide: Writing the Perfect CLAUDE.md

How to generate a project-specific CLAUDE.md that makes Claude Code maximally effective.

---

## 1. Purpose

CLAUDE.md is the project-level instruction file that Claude Code loads into the system prompt **every turn**. It provides project-specific context that overrides default behavior.

It answers one question: **what does an engineer need to know on day one to be productive in this codebase?**

It is NOT documentation. It is NOT a README. It is a machine-readable briefing.

### Loading Hierarchy

CLAUDE.md files merge in this order (later overrides earlier):

1. **Policy** — organization-level (enterprise only)
2. **User** — `~/.claude/CLAUDE.md` (personal preferences, applied to all projects)
3. **Project** — `.claude/CLAUDE.md` (project-level, shared via git)
4. **Local** — `.claude/local/CLAUDE.md` (personal project overrides, gitignored)

All levels are merged and loaded into the system prompt on every turn. This means CLAUDE.md is **dynamic content** — it is reloaded each turn, not cached like the base system prompt.

### @import Syntax

CLAUDE.md files support `@import` to include other markdown files:

```
@import ./conventions/naming.md
@import ./conventions/testing.md
```

- Relative paths resolved from the importing file's directory
- Allows modular CLAUDE.md organization without monolithic files
- Imported content is inlined at load time
- Useful for keeping CLAUDE.md under the 200-line limit while maintaining comprehensive documentation

### Cache & Performance Implications

- CLAUDE.md content is reloaded every turn, so keep it **dense and concise**
- The base system prompt (tools, skills descriptions) benefits from prompt cache — CLAUDE.md sits after it
- Every token in CLAUDE.md is processed every turn — unnecessary verbosity has a real cost
- Target: **50-150 lines** for most projects. Under 200 is a hard ceiling for readability

---

## 2. Mandatory Sections

Every CLAUDE.md must include these. No exceptions.

### Project Overview

One paragraph. What it is, what it does, who it's for. No marketing language.

```markdown
## Project Overview
Internal dashboard for monitoring warehouse inventory across 12 sites. Built with Next.js 15 + Drizzle ORM + PostgreSQL. Deployed on Vercel.
```

### Build & Run Commands

Exact commands. Copy-pasteable. Not descriptions of what to do.

```markdown
## Commands
- Install: `bun install`
- Dev: `bun dev` (port 3000)
- Build: `bun run build`
- Test: `bun test`
- Lint: `bun run lint`
- Type check: `bunx tsc --noEmit`
- Single test: `bun test src/lib/inventory.test.ts`
```

### Architecture

Numbered subsystems. One line each. File paths where relevant.

```markdown
## Architecture
1. **App Router** — `src/app/` — file-based routing, RSC by default
2. **API Layer** — `src/app/api/` — Route Handlers, JSON responses
3. **Database** — `src/db/` — Drizzle ORM, schema in `schema.ts`, migrations in `drizzle/`
4. **Auth** — `src/lib/auth.ts` — Clerk middleware, protected routes in `middleware.ts`
5. **Components** — `src/components/` — shadcn/ui base, project components in `src/components/app/`
```

### Dependencies

Package manager, runtime, and key dependencies only (not the full list).

```markdown
## Dependencies
- Runtime: Bun 1.2+
- Package manager: bun
- Key deps: next 15, drizzle-orm, @clerk/nextjs, zod
```

### Development Notes

Runtime version, conventions, anything that would trip up a new contributor.

```markdown
## Development Notes
- Node 22+ / Bun 1.2+ required
- Strict TypeScript: no `any`, no `as` casts without justification
- All API responses use `src/lib/response.ts` helpers
- Environment: copy `.env.example` to `.env.local`
```

---

## 3. Recommended Sections

Add based on project type and complexity.

### API Reference (backends, APIs)

```markdown
## API
- All routes under `/api/v1/`
- Auth: Bearer token in Authorization header
- Errors: `{ error: string, code: number }` shape
- Rate limit: 100 req/min per key
```

### Database Schema (data-heavy apps)

```markdown
## Database
- PostgreSQL 16 via Neon
- Schema: `src/db/schema.ts` (source of truth)
- Migrations: `bun run db:generate` then `bun run db:migrate`
- Seed: `bun run db:seed`
```

### Testing

```markdown
## Testing
- Framework: vitest
- Run all: `bun test`
- Coverage: `bun test --coverage` (target: 80%)
- Pattern: colocated test files (`*.test.ts` next to source)
- Mocks: `src/test/mocks/` for external services
```

### Deployment

```markdown
## Deployment
- Platform: Vercel
- Preview: auto on PR push
- Production: merge to `main`
- Env vars: managed in Vercel dashboard
```

### Conventions

```markdown
## Conventions
- Commits: conventional commits (`feat:`, `fix:`, `chore:`)
- Branches: `feat/description`, `fix/description`
- Imports: absolute from `@/` (mapped to `src/`)
- File naming: kebab-case for files, PascalCase for components
- No barrel exports (no `index.ts` re-exports)
```

---

## 4. Anti-patterns

**Don't duplicate README content.** CLAUDE.md is for Claude, README is for humans. They serve different audiences.

**Don't include ephemeral info.** Current bugs, WIP notes, sprint status — these belong in STATE.md or issue trackers, not CLAUDE.md.

**Don't write essays.** Every line should be scannable. If a section needs more than 10 lines, it's too verbose.

**Don't include secrets or env values.** Never put API keys, tokens, or actual `.env` values. Reference `.env.example` instead.

**Don't list every file.** Architecture should describe subsystems, not individual files. Claude can use Glob for discovery.

**Don't over-constrain.** Give Claude enough rope to make good decisions. Specify outcomes, not step-by-step procedures.

**Don't make false claims.** Every command, path, and dependency listed must actually exist in the codebase (AP-11: CLAUDE.md Reality Check). Stale claims mislead Claude into errors.

**Don't ignore the hierarchy.** Put personal preferences in `~/.claude/CLAUDE.md`, not the project file. Project CLAUDE.md should be team-appropriate.

---

## 5. Example: Minimal CLAUDE.md

```markdown
# CLAUDE.md

## Project
E-commerce storefront. Next.js 15 App Router + Drizzle + Stripe. Deployed on Vercel.

## Commands
- Dev: `bun dev`
- Build: `bun run build`
- Test: `bun test`
- Lint: `bun run lint`
- DB migrate: `bun run db:migrate`

## Architecture
1. App Router — `src/app/` — RSC default, client components marked explicitly
2. API — `src/app/api/` — Route Handlers, Stripe webhooks at `/api/webhooks/stripe`
3. DB — `src/db/` — Drizzle + Neon PostgreSQL, schema in `schema.ts`
4. Auth — Clerk, middleware in `middleware.ts`
5. Payments — `src/lib/stripe.ts`, webhook verification required

## Conventions
- Strict TypeScript, no `any`
- Conventional commits
- Imports use `@/` alias
- Tests colocated with source
```

14 lines. Everything an agent needs. Nothing it doesn't.
