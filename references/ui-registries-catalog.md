# UI Registries Catalog

Catalog of component registries compatible with shadcn CLI 3.0's namespaced registry system. Consumed by `/site` when selecting hero/section components that go beyond shadcn base-nova primitives.

shadcn CLI 3.0 (2025) accepts any registry URL that exposes a valid `registry.json` schema: `npx shadcn@latest add <url>`. All registries below follow this spec and compose on top of base-nova without breaking primitives.

**Strategic rule** — base-nova stays the foundation (Button, Card, Input, Dialog, Accordion). Registries add signature marketing components. Never replace base-nova primitives with registry equivalents.

---

## Aceternity UI

**URL** — `ui.aceternity.com`
**Install** — `npx shadcn@latest add https://ui.aceternity.com/registry/<component>.json`

**Top picks**
- **Background Beams** — animated SVG beams, dark backgrounds. Hero staple.
- **Spotlight** — cursor-following radial glow.
- **Hero Highlight** — text underline sweep on viewport enter.
- **World Map** — dotted world map with animated arcs. Used by Dev tools (PostHog, Browserless).
- **Background Gradient** — animated conic gradients behind cards.
- **Meteors** — falling light streaks.
- **Card 3D** — perspective tilt card.

**When to use** — marketing hero with moderate wow-effect. Beams + Spotlight is the 2024-2026 cliché; use sparingly or the site reads as AI-generated landing page.

**Dependency** — Motion (`motion/react`). Already in your stack.

---

## Magic UI

**URL** — `magicui.design`
**Install** — shadcn CLI, exposed as `npx shadcn@latest add "https://magicui.design/r/<name>.json"`

**Top picks** (150+ total)
- **Marquee** — infinite horizontal scroll. Replace manual CSS keyframes.
- **Bento Grid** — asymmetric tile layout, 1 hero + 4-6 smaller.
- **Animated Beam** — SVG path connecting two DOM nodes. Used for architecture diagrams.
- **Particles** — canvas particle field, interactive.
- **Number Ticker** — counter animation from 0 to N on viewport enter.
- **Word Rotate** — typewriter-style rotating word.
- **Globe** — interactive 3D globe via COBE (~100KB).
- **Orbiting Circles** — circular orbit animation around a center.
- **Dock** — macOS-style magnifying dock.

**When to use** — Bento + Number Ticker + Animated Beam is the canonical "modern SaaS" trio. Globe is a 100KB add — only use if the product is genuinely global.

---

## 21st.dev

**URL** — `21st.dev`
**Install** — via shadcn CLI through their registry URLs

Marketplace of community-submitted components (YC W2026). Live demos with Figma exports attached. Strong on trendy hero components — updates weekly based on what's shipping on Awwwards.

**Differentiator** — per-component reviews/votes, so quality signal is crowd-sourced rather than one studio's taste. Best discovery tool when you need inspiration but don't know what to search for.

**Top picks** — rotating roster. Check the weekly trending section rather than memorizing names.

---

## Cult UI

**URL** — `cult-ui.com`
**Install** — shadcn CLI compatible

**Top picks**
- **Family Button** — iOS-style expanding action button with children.
- **Direction Aware Tabs** — tab underline that knows which side you came from.
- **Minimal Card** — subtle card with motion on hover.
- **Neumorph Button** — soft UI buttons (use sparingly — dated aesthetic).
- **Texture Button** — button with canvas-drawn noise texture.

**When to use** — targeted micro-interactions for app surfaces. Family Button is genuinely novel, worth a pick for a mobile web app.

---

## React Bits

**URL** — `reactbits.dev`
**Install** — copy-paste or CLI

Extremely popular in 2026 for text/cursor effects. Built on Motion + sometimes GSAP.

**Top picks**
- **Text** — Split Text, Shiny Text, Variable Proximity, Decrypted Text, Scramble Text, Falling Text.
- **Cursor** — Splash Cursor, Click Spark, Blob Cursor, Follower Cursor.
- **Backgrounds** — Aurora, Liquid Chrome, Dot Grid, Waves, Squares, Silk.
- **Animations** — Magnet, Fade Content, Star Border.

**When to use** — one text effect + one background as site signature. Variable Proximity is the 2026 cliché — think twice. Decrypted Text is strong for security/dev tool brands.

---

## Animate UI

**URL** — `animate-ui.com`

Pure animation primitives — no design system, no layout components. Motion-based. Thinner than React Bits.

**When to use** — if React Bits doesn't have the specific effect you need and you want a tested primitive rather than rolling your own.

---

## Combination Strategy

**Rule** — shadcn base-nova + 1 marketing registry (Aceternity **or** Magic UI) + optionally React Bits for text/cursor effects. **Never mix 5 registries.** Each registry has a distinct visual language; stacking them creates Frankenstein UI.

**Canonical stacks by project type**
- **Premium studio site** — base-nova + 1-2 React Bits text effects + 1 custom GSAP scene. No Aceternity/Magic UI.
- **SaaS marketing** — base-nova + Magic UI (Bento, Marquee, Number Ticker, Animated Beam). No React Bits.
- **Agency/portfolio** — base-nova + Aceternity (Spotlight, Background Beams) + custom hero. Optionally 1 React Bits text effect.
- **Dev tool landing** — base-nova + Magic UI (Bento, Globe if global, Animated Beam for architecture).

---

## AI-Slop Risk

Installing 20 animated components at once produces loud, generic, "crypto-project-in-2022" output. Rules:

- **2-3 signature effects max per project.** Everything else is static.
- **Choose signatures from the MOODBOARD.** Don't reach for Background Beams because it's cool — reach for it because the moodboard called for dark atmospheric hero.
- **Test on mobile before committing.** Particles, Globe, Aurora on low-end Android = 15fps. Decide early: are mobile users seeing the effect or a static fallback?
- **One background effect max.** Never Background Beams + Particles + Aurora stacked. Pick one atmosphere.

---

## Pre-Install Checklist

Before `npx shadcn@latest add <url>`, verify:

1. **License** — MIT (Aceternity, Magic UI, React Bits, Cult UI, Animate UI) = safe. Check each; commercial-restricted = flag for user.
2. **Bundle size impact** — `animated-beam` adds nothing (Motion is already in your deps), Globe Magic UI adds COBE (~100KB), Particles add `tsparticles` variants. Run `bun add --dry-run` equivalent or check peer deps in the registry JSON.
3. **Server Components compatibility** — most registry components are `'use client'`. Isolate them in `components/motion/` or `components/marketing/`, never import into RSC sections without a client boundary.
4. **Dependency duplication** — if the registry pulls `framer-motion` instead of `motion`, you've got two motion libraries in your bundle. Patch the component file after install to use `motion/react`.
5. **Accessibility** — many animated registry components skip `prefers-reduced-motion`. Audit after install; add `useReducedMotion()` guard if missing.
6. **Tailwind config** — some registries require `tailwind.config.js` extends. With Tailwind 4 (CSS-first), port those extends into your `@theme` block in `app/globals.css`.

---

## Update Strategy

Registry components are **copy-paste** — once installed, they're yours. Updates don't flow automatically. If a registry publishes a bugfix, re-run `npx shadcn@latest add` on the specific component and review the diff. Treat registry components as vendored code, not dependencies.
