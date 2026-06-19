# Motion Libraries Guide

Reference for choosing, combining, and wiring motion libraries in Next.js 16 + React 19 showcase sites. Consumed by `/site` during section and interaction design.

Three libraries cover 95% of needs: **Motion** (React-native component animations), **GSAP** (scroll-driven scenes, timelines), **Lenis** (smooth scroll). The rest (Rive, Lottie) are illustration-specific.

---

## Motion (ex-Framer Motion)

Renamed to `motion/react` in 2025. Same API, new package name. If you see `from 'framer-motion'` in 2026 code, it's legacy.

```bash
bun add motion
```

```tsx
import { motion, AnimatePresence, useScroll, useTransform, useReducedMotion } from 'motion/react'
```

**When to use** — anything that lives inside a React component tree and reacts to React state or viewport entry.

**Core APIs**
- `<motion.div>` with `initial` / `animate` / `exit` / `whileHover` / `whileTap` / `whileInView`
- `AnimatePresence` for enter/exit of unmounted components (modal, route transitions)
- `useScroll()` — returns `scrollYProgress` (0 → 1) for a target ref or the page
- `useTransform(value, [inRange], [outRange])` — map scroll progress to any CSS value
- `layout` prop — auto-animate layout changes (FLIP under the hood)

**Stagger pattern (canonical)**

```tsx
const container = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } }
const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }

<motion.ul variants={container} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-100px' }}>
  {items.map(i => <motion.li key={i.id} variants={item}>{i.label}</motion.li>)}
</motion.ul>
```

`viewport={{ once: true }}` prevents re-firing on scroll back up — always set for marketing pages.

---

## GSAP 3.13+

**100% free for commercial use since Webflow acquired GSAP in 2024.** All plugins — ScrollTrigger, SplitText, MorphSVG, DrawSVG, Flip — are included. No paid Club GSAP tier anymore.

```bash
bun add gsap @gsap/react
```

**When to use** — complex scroll-driven scenes (pinning, horizontal scroll, scrub-through sequences), text splitting/kinetic typography, timeline sequences with precise offsets, SVG morphing.

**Canonical React integration** — `useGSAP()` hook from `@gsap/react`. It handles cleanup automatically on unmount and re-runs when deps change. Do not write raw `useEffect` with GSAP.

```tsx
'use client'
import { useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(ScrollTrigger, useGSAP)

export function ScrollScene() {
  const root = useRef<HTMLDivElement>(null)

  useGSAP(() => {
    gsap.to('.panel', {
      xPercent: -100 * 3,
      ease: 'none',
      scrollTrigger: {
        trigger: root.current,
        pin: true,
        scrub: 1,
        end: () => '+=' + (root.current?.offsetWidth ?? 0),
      },
    })
  }, { scope: root })

  return <div ref={root} className="flex">{/* 4 panels */}</div>
}
```

Key options: `scope` (limits selector resolution to the ref), `dependencies` (re-runs on change), `revertOnUpdate: true` (fully reverts before re-running).

---

## Lenis

Package renamed from `@studio-freight/lenis` to `lenis` in 2024. Tiny (~6KB), production-proven smooth scroll.

```bash
bun add lenis
```

**Standalone setup** (no GSAP)

```tsx
'use client'
import { useEffect } from 'react'
import Lenis from 'lenis'

export function SmoothScroll() {
  useEffect(() => {
    const lenis = new Lenis({ autoRaf: true, duration: 1.2 })
    return () => lenis.destroy()
  }, [])
  return null
}
```

`autoRaf: true` — Lenis manages its own `requestAnimationFrame` loop.

**Coupled with GSAP ScrollTrigger** — critical for scrub synchronization. Disable Lenis's RAF, drive it from GSAP's ticker.

```tsx
import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

const lenis = new Lenis({ autoRaf: false })
lenis.on('scroll', ScrollTrigger.update)
gsap.ticker.add(time => lenis.raf(time * 1000))
gsap.ticker.lagSmoothing(0)
```

This guarantees ScrollTrigger's `scrub` stays perfectly in sync with Lenis's inertia. Without it, scrub animations jitter by one frame.

---

## Canonical Combos

**1. Lenis + GSAP ScrollTrigger (premium scroll-driven narrative)**
- Setup ticker sync as above
- Use ScrollTrigger for pinning and scrub
- Best for: hero storytelling, horizontal sections, pinned reveals

**2. Motion `useScroll` alone (simple, layout-driven)**
- No Lenis, no GSAP
- `useScroll` + `useTransform` for 2-3 scroll-linked values
- Best for: progress bars, simple parallax, fade-on-scroll headers

**3. GSAP timeline + ScrollTrigger scrub (multi-step hero)**
- One timeline with 4-10 steps, tied to scroll via `scrub: 1`
- Best for: apple.com-style hero product reveals

**4. Motion `whileInView` + reduced-motion respect**
- Simplest entry animations
- Pair with `useReducedMotion()` hook

```tsx
const reduced = useReducedMotion()
<motion.div
  initial={reduced ? false : { opacity: 0, y: 16 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true }}
/>
```

---

## SSR Pitfalls

Motion's `useScroll` / `useTransform` and all GSAP code need `window`. They crash or warn in server rendering.

**Pattern A — dynamic import, client-only**

```tsx
import dynamic from 'next/dynamic'
const ScrollScene = dynamic(() => import('./ScrollScene'), { ssr: false })
```

Use for components that have no meaningful server render (pure motion demos).

**Pattern B — `'use client'` + guard**

```tsx
'use client'
import { useEffect, useState } from 'react'

export function HeroParallax() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  // safe to use useScroll here
}
```

Use for components that render content server-side first, then enhance on mount.

**Pattern C — ScrollTrigger refresh on route change** — always call `ScrollTrigger.refresh()` in `useGSAP` callback, and kill all triggers on unmount:

```tsx
useGSAP(() => {
  // create triggers
  return () => ScrollTrigger.getAll().forEach(t => t.kill())
})
```

---

## Reduced Motion

**Always respect** `prefers-reduced-motion: reduce`. Accessibility requirement, not optional.

**Motion** — `useReducedMotion()` hook returns `true | null`. Use it to bypass initial states.

**GSAP** — guard with `matchMedia`:

```tsx
useGSAP(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduced) return
  // heavy scroll scene
})
```

Or use GSAP's built-in `gsap.matchMedia()`:

```tsx
const mm = gsap.matchMedia()
mm.add('(prefers-reduced-motion: no-preference)', () => {
  gsap.to('.box', { x: 200, scrollTrigger: '.box' })
})
```

---

## Cleanup

Leaked triggers = memory leaks + double animations on route change. Rules:

- **Motion** — `AnimatePresence` cleans up automatically. `useScroll`/`useTransform` clean up on unmount automatically. No action needed.
- **GSAP with `useGSAP()`** — automatic. Just use the hook.
- **GSAP raw (avoid)** — always return cleanup from `useEffect`:

```tsx
useEffect(() => {
  const ctx = gsap.context(() => { /* animations */ }, root)
  return () => ctx.revert()
}, [])
```

- **Lenis** — always `lenis.destroy()` in cleanup.

---

## Performance Rules

- **Animate only `transform` and `opacity`.** Compositor-friendly, 60fps guaranteed.
- **Never animate `width`, `height`, `top`, `left`, `margin`, `padding`.** Triggers layout on every frame, janks on mid-range mobile.
- **`will-change`** — set only on elements animating **continuously** (infinite loops, scroll-driven). Never globally. `will-change` creates a compositor layer, too many = GPU memory blowup.
- **Off-screen pause** — for auto-playing loops (marquees, particles), pause when out of viewport using `IntersectionObserver` or Motion's `onViewportLeave`.
- **FPS budget** — aim for <16ms frame on mid-range mobile (iPhone 12, Pixel 5). Profile with Chrome DevTools Performance tab.

---

## Rive vs Lottie

**Rive** (`rive.app`) — interactive illustrations with state machines. ~100KB runtime, file sizes 5-50KB. Runtime can react to scroll, hover, timers, user input. Best for: illustrations that change based on app state, animated icons that respond to interaction.

**Lottie** — exports directly from After Effects via Bodymovin. Non-interactive, plays back timeline. Runtime ~300KB (`lottie-web`) or 60KB (`lottie-light`). Best for: pre-rendered illustration clips from a motion designer's AE file.

Default to Rive in 2026. Only pick Lottie if the client delivers an `.aep` and there's no motion designer to remake it in Rive.
