---
project: {{PROJECT_NAME}}
design_system: {{DESIGN_SYSTEM}}
primary_color: {{PRIMARY_COLOR}}
font_family: {{FONT_FAMILY}}
component_prefix: {{COMPONENT_PREFIX}}
---

# DESIGN.md — {{PROJECT_NAME}}

Design companion to CLAUDE.md. Governs how UI/UX decisions map to code.

## Design System

- **Library**: {{DESIGN_SYSTEM}} (e.g. shadcn/ui, Radix, custom)
- **Token source**: `src/styles/tokens.css` (CSS custom properties)
- **Icon set**: {{ICON_SET}}
- **Naming**: tokens use kebab-case (`--color-surface-primary`), components use PascalCase

## Layout Principles

- **Grid**: 12-column, `gap-4` base, `gap-6` on desktop
- **Max content width**: `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8`
- **Spacing scale**: Tailwind default (4px base unit) — no arbitrary values
- **Breakpoints**: `sm` 640px · `md` 768px · `lg` 1024px · `xl` 1280px

## Component Conventions

- **Prefix**: `{{COMPONENT_PREFIX}}` (e.g. `Ui`, `App`, `DS`)
- **File location**: `src/components/{{COMPONENT_PREFIX}}/ComponentName.tsx`
- **Variant naming**: `variant` prop accepts `"default" | "outline" | "ghost" | "destructive"`
- **Size naming**: `size` prop accepts `"sm" | "md" | "lg"`
- **Compound components**: co-locate in same file, export named (`Root`, `Trigger`, `Content`)
- **No inline styles** — use Tailwind classes or CSS custom properties only

## Design → Code Workflow

1. Design decisions are documented here first (DESIGN.md), then implemented
2. Each new component requires a matching entry in the Design System section above
3. Colors and spacing must reference tokens — no hardcoded hex values in source
4. When Figma is the source of truth: extract tokens via Figma Variables, update `tokens.css`
5. Screenshots or Figma links go in `docs/design/` — never in source files

## Accessibility Standards

- **WCAG level**: AA minimum (AAA for primary user flows)
- **Contrast ratio**: ≥ 4.5:1 for normal text, ≥ 3:1 for large text and UI components
- **Keyboard navigation**: all interactive elements reachable via Tab, activated via Enter/Space
- **Focus visible**: `focus-visible:ring-2` on all interactive elements — never `outline-none` alone
- **ARIA**: use semantic HTML first; add `aria-*` only when semantics are insufficient
- **Reduced motion**: wrap animations in `@media (prefers-reduced-motion: no-preference)`

## Quality Gates (verify-artifact)

Before considering any UI component or screen "done", verify:

- [ ] **Contrast**: all text ≥ 4.5:1 (normal), ≥ 3:1 (large/UI). Check with browser DevTools or axe.
- [ ] **Text size**: body ≥ 16px, secondary ≥ 14px, no text below 12px.
- [ ] **AI-slop signals**: no generic placeholder lorem ipsum left, no 8px rounded-corners on everything, no identical card shadows everywhere.
- [ ] **Spacing consistency**: margins/padding follow the 4px grid — no arbitrary values.
- [ ] **Responsive**: key breakpoints (375px mobile, 768px tablet, 1280px desktop) tested.
- [ ] **States covered**: hover, focus-visible, disabled, loading, empty state all designed.

Fail any gate → do not merge. Fix first.
