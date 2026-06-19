# Website Showcase Patterns

Canonical reference for building high-end showcase / marketing websites in 2026 with Next.js 16 App Router + Tailwind 4 + shadcn base-nova. Consumed during the `/site` flow (showcase sub-mode) to brief the assistant on section patterns, composition rules, and AI-slop red flags.

The target is premium studio-grade output: Awwwards-level restraint, editorial typography, deliberate motion. Not SaaS marketing templates. Not generic "landing page in a box".

---

## Section Taxonomy

9 canonical sections cover 95% of showcase sites. For each: role, pattern variants, when to choose, reference implementations.

### 1. Hero

**Role** — first 100vh. Establishes tone, positioning, mood in under 2 seconds. Single clearest message on the site.

**Variants**
- **Centered** — headline + subline + CTA, symmetric. Safe default. Used by Linear, Vercel.
- **Split** — text left, visual right (photo, 3D, video). Product-oriented. Used by Stripe, Framer.
- **Video-bg** — autoplay muted loop behind text. High bandwidth, needs poster + fallback. Used by Apple marketing, Obys.
- **Parallax** — scroll-driven layers. Editorial feel. Used by Locomotive, Studio Freight alumni.
- **Minimal** — single large wordmark / statement, negative space. Used by agencies (Basement, Darkroom).
- **Kinetic** — animated typography (split text, marquee, morph). Awwwards-grade signal. Used by Lusion, 14islands.

**When to choose** — centered/split for product sites, video-bg only if client provides 10s+ of high-quality footage, parallax/kinetic for studios or editorial brands. Avoid video-bg on mobile-first projects without a static fallback.

### 2. Logo cloud / trust bar

**Role** — social proof via client logos. Never hero — always secondary.

**Variants**
- **Static grid** — 5-8 monochrome logos, uniform optical size. Default.
- **Marquee** — horizontal scroll (CSS `animation` or Motion `<Marquee>`). Works when 10+ logos.
- **Grouped** — clustered by category (clients / press / partners).

**When to choose** — static if 8 or fewer, marquee if more. Always desaturate to single color (currentColor or neutral-600) for visual unity.

### 3. Features

**Role** — explain the what/how. 3-6 propositions max.

**Variants**
- **Grid 3-col** — icon + title + 1-line. Densest, coldest. Used by SaaS defaults.
- **Alternating** — text/image flipped row-by-row. Storytelling feel. Used by Stripe Atlas, Linear feature pages.
- **Bento** — asymmetric tiles, 1 hero tile + 4-6 smaller. Popularized by Apple 2022+, Vercel 2024. Used by Linear, Cursor, Arc.
- **Cards-icons** — uniform cards with custom illustrations/3D. Agency showcase.

**When to choose** — bento for product sites (signals modernity), alternating for editorial/story-driven, grid only if features are genuinely parallel. Bento done wrong = AI-slop; it requires hand-crafted visuals per tile.

### 4. Testimonials

**Role** — third-party validation. Quality > quantity.

**Variants**
- **Grid** — 3-9 cards, equal weight. Safe.
- **Carousel** — swipeable, 1 at a time on mobile. Use when quotes are long.
- **Single-quote** — one large pull quote, centered. Highest-impact, requires strong quote.
- **Video** — embedded testimonial clips. Highest trust, highest production cost.

**When to choose** — single-quote if one quote carries the page, grid for balance, video only if shot professionally. Never Lorem Ipsum testimonials — flag for client.

### 5. Pricing

**Role** — convert. Reduce friction to purchase/contact.

**Variants**
- **Toggle** — monthly/yearly switch with savings highlight. Standard SaaS.
- **Comparison** — feature matrix across tiers. Enterprise-oriented.
- **Single tier** — one price, high-end positioning. Used by agencies, premium products.

**When to choose** — single tier for studio/service brands, toggle+comparison for SaaS. If client sells "contact us" — skip pricing entirely, use CTA section.

### 6. FAQ

**Role** — objection handling + SEO (FAQPage schema).

**Variants**
- **Accordion** — default. Use shadcn `<Accordion>` with `type="single"` or `type="multiple"`.
- **Grouped accordion** — categorized by theme (Pricing / Tech / Delivery).
- **Two-column** — Q left, A right static. For short FAQs (3-5 items).

**When to choose** — accordion everywhere, grouped if 12+ questions. Always emit `FAQPage` JSON-LD — free SEO win.

### 7. CTA

**Role** — final conversion push. One action, unambiguous.

**Variants**
- **Banner** — full-width band with headline + button. Standard.
- **Inline** — embedded between sections (mid-scroll). Higher engagement.
- **Full-page split** — last screen, 100vh, dramatic. Editorial choice.

**When to choose** — banner as default pre-footer, full-page split for statement closing, inline CTAs only if the page is long-form and needs re-engagement.

### 8. Footer

**Role** — navigation fallback, legal, secondary links.

**Variants**
- **Simple** — 1-2 rows, links + copyright. Minimalist sites.
- **Mega** — multi-column, sitemap-style, newsletter signup, socials. Corporate/SaaS.
- **Minimal** — single line (studios, portfolios). Often combined with large wordmark.

**When to choose** — minimal for studios, mega only when site has 20+ pages, simple as safe default.

### 9. Navigation

**Role** — orient. Persistent across pages.

**Variants**
- **Sticky** — fixed top, translucent bg + backdrop-blur. Default.
- **Mega-menu** — hover reveals panel with categorized links. For 10+ pages.
- **Offcanvas mobile** — full-screen overlay on mobile, hamburger trigger. Mandatory mobile pattern.
- **Scroll-hide** — hide on scroll down, reveal on scroll up. Saves viewport. Used by medium.com, linear.app.

**When to choose** — sticky + scroll-hide on content-heavy sites, offcanvas mandatory below 768px, mega-menu only if IA truly requires it.

---

## RSC vs Client Boundaries

The rule: **sections are Server Components by default. Motion wrappers are Client Components.**

Never mark an entire section `'use client'`. Isolate the reactive part into a thin wrapper.

```tsx
// components/sections/Hero.tsx — RSC (no 'use client')
import { HeroMotion } from '@/components/motion/HeroMotion'

export function Hero() {
  return (
    <section className="min-h-screen grid place-items-center">
      <HeroMotion>
        <h1 className="font-display text-7xl">We build the invisible.</h1>
        <p className="text-muted-foreground mt-6">Systems, interfaces, products.</p>
      </HeroMotion>
    </section>
  )
}
```

```tsx
// components/motion/HeroMotion.tsx — Client
'use client'
import { motion } from 'motion/react'

export function HeroMotion({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}
```

Benefits: content stays server-rendered (SEO, streaming), hydration cost is bounded to the motion wrapper, bundle splits cleanly.

---

## Directory Structure

```
components/
  sections/         # RSC — Hero, Features, Pricing, FAQ, CTA, Footer
  motion/           # 'use client' wrappers — HeroMotion, StaggerList, ScrollReveal
  ui/               # shadcn primitives — button, card, accordion, input
app/
  (marketing)/      # public showcase pages — /, /about, /work, /contact
    layout.tsx      # marketing layout (nav + footer)
    page.tsx
  (app)/            # authed product — /dashboard, /settings
    layout.tsx
lib/
  design-tokens.ts  # shared tokens (shadows, easings, spacing scale, motion durations)
```

Route groups `(marketing)` and `(app)` let you ship distinct layouts (marketing has nav+footer, app has sidebar) without nested URL segments.

---

## Composition Rules

- **Sections never import other sections.** Hero does not import Features. They're siblings composed in `app/(marketing)/page.tsx`.
- **Tokens live in `lib/design-tokens.ts`** and are consumed via Tailwind 4 `@theme` exports. No magic numbers in components.
- **No cross-section state.** If a section needs state (carousel index, accordion open), it lives inside that section's client wrapper. Global state (theme, cart) belongs in `app/providers.tsx`.
- **Props > configuration objects.** `<Hero title="..." eyebrow="..." />` beats `<Hero config={heroConfig} />` — keeps sections typable and debuggable.
- **One motion primitive per section.** Mixing Motion + GSAP in the same component = cleanup hell. Pick one, isolate.

---

## AI-Slop Red Flags

Signals that a site was produced by an LLM with no human curation. Audit against these before shipping.

1. **Rounded-lg (8px) everywhere** — cards, buttons, inputs, images all at the same radius. Real design varies radii by element (buttons 6px, cards 12px, images 4px or sharp).
2. **Identical shadows on every card** — `shadow-md` globally. Real design uses shadow to establish hierarchy (hero card elevated, grid cards flat).
3. **Residual Lorem Ipsum** or placeholder copy ("Lorem ipsum dolor", "Feature title", "Your tagline here"). Instant tell.
4. **Generic icon sets** — lucide-react icons used identically (Zap, Rocket, Sparkles, Star). Signals no iconographic thinking. Real sites use custom icons or a single distinctive family.
5. **Gradient backgrounds everywhere** — every section has `bg-gradient-to-br from-purple-500`. Real design rations gradients to 1-2 moments.
6. **Every section is 100vh centered** — uniform rhythm kills hierarchy. Real sites vary section heights deliberately.
7. **CTA says "Get started"** on every button. Copywriting tell — client hasn't specified the action.

Fix: run `/audit` sub-check on sections, grep for `rounded-lg`, `shadow-md`, `Get started`, `Lorem`. If 3+ hits, the site reads as generated.
