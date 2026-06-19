# {{PROJECT_NAME}}

## Overview
{{DESCRIPTION}}

## Mode
**Design-only project.** Code modification is strictly forbidden unless explicitly authorized by the user.

## What You Can Do
- Review and analyze existing code (read-only)
- Create design documents, wireframes descriptions, specifications
- Generate mockup descriptions, DESIGN.md artifacts, and UI/UX recommendations
- Write technical specifications and architecture proposals
- Analyze and document the existing codebase
- Produce Claude Design-compatible DESIGN.md artifacts (text-to-prototype)

## What You Cannot Do
- Modify any source code file
- Create new code files
- Run build, test, or deploy commands that modify state
- Install or remove dependencies

## Design Tools
- **Design system**: {{DESIGN_SYSTEM}}
- **Prototyping**: {{PROTOTYPING_TOOL}} — supports Claude Design (claude.ai/code, Opus 4.8 vision)
- **Documentation**: {{DOC_FORMAT}}
- **DESIGN.md companion**: see `DESIGN.md` in project root (Claude Design-compatible format)

## Claude Design Workflow

When generating design artifacts:

1. **Start from DESIGN.md** — read it for tokens, components, and conventions before generating anything.
2. **Describe before code** — write the design intent in natural language first. Claude Design uses this as a text-to-prototype prompt on Opus 4.8.
3. **Reference design systems** — for design system inspiration, consult VoltAgent/awesome-design-md (55+ DESIGN.md from real brands: Stripe, Linear, Notion, Vercel).
4. **Export formats** — Claude Design outputs: standalone HTML, PDF, PowerPoint, Canva. Specify the target when requesting prototypes.
5. **Google Stitch MCP** — if connected, the Stitch MCP reads DESIGN.md directly from the project and syncs with Cursor/CC/Gemini CLI.

## DESIGN.md — 9-Section Structure (bluzir/claude-code-design standard)

A production-grade DESIGN.md follows this 9-section structure:

```markdown
## 1. Brand Identity
Palette, typography, tone of voice, logo usage rules.

## 2. Design Tokens
Color variables, spacing scale, border radii, shadow levels.
Define as CSS custom properties or Tailwind config values.

## 3. Component Library
Core components with variant rules: Button (primary/secondary/ghost),
Input, Card, Modal, Toast. Each with state definitions.

## 4. Layout System
Grid, breakpoints, page structure, sidebar/header rules.

## 5. Motion & Animation
Transition curves, durations by interaction type (hover/open/dismiss).

## 6. Accessibility Rules
WCAG 2.1 AA minimum: contrast ratios, focus rings, ARIA patterns.

## 7. Page Templates
Wireframe descriptions for key pages: landing, dashboard, form, error.

## 8. Interaction Patterns
Loading states, empty states, error states, success feedback.

## 9. Export Targets
Specify formats: HTML prototype, PDF deck, PowerPoint, Canva.
```

Use this as a seed when the user asks to create a DESIGN.md from scratch.

## Project Structure
```
{{DIRECTORY_STRUCTURE}}
```

## Design Conventions
- All design decisions documented with rationale in DESIGN.md
- Reference existing code patterns when proposing changes
- Strict TypeScript types for any interface definitions
- Tout texte en français : accents obligatoires (é, è, ê, à, ô, û, etc.)
- Jamais de `<br />` ni de `<span>` pour fragmenter une phrase à des fins stylistiques — une phrase = un flux continu
- No trailing summary in responses — read the diff
- Accuracy over approval: correct weak premises directly, say `unknown` when evidence is missing, and use confidence labels (`high` / `medium` / `low` / `unknown`) for uncertain judgments
- No flattery or diplomatic padding; lead with the real blocker, counterargument, or risk when one exists
- {{ADDITIONAL_CONVENTIONS}}

## Dependencies
- Runtime: {{RUNTIME}}
- Package manager: {{PACKAGE_MANAGER}}
