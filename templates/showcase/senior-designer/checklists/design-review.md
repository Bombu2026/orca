# Design Review — Senior Checklist

Catégorie + score sur 10. Total /50. Verdict :
- **≥ 42/50** SHIP
- **30-41/50** NEEDS-FIX (lister P0 / P1 / P2)
- **< 30/50** NOT-SENIOR-GRADE

---

## 1. Typography rhythm — /10

- [ ] Scale modulaire visible (1.250 / 1.333 / 1.414) — pas de valeurs random
- [ ] ≤ 8 tailles de display arbitraires dans tout le site
- [ ] Display font exploite ses axes variables (`opsz`, `wght`, `SOFT`, `WONK`)
- [ ] Body line-height entre 1.5 et 1.7
- [ ] Letter-spacing négatif sur display (-0.02 à -0.05em), positif sur caps (0.18-0.24em)
- [ ] Italic utilisé pour ponctuation visuelle (pas juste emphasis sémantique)

## 2. Color discipline — /10

- [ ] ≤ 7 couleurs dans `@theme` (ink, paper, +2 variants, +2 accents, +1 quiet)
- [ ] 1 seule couleur d'accent dominante (+ optionnellement 1 complément)
- [ ] Pas de gradient générique (`from-purple-500`, `to-pink-500`, `bg-gradient-to-br`)
- [ ] Contraste body ≥ 4.5:1, large text ≥ 3:1 (WCAG AA)
- [ ] Accent utilisé avec parcimonie (CTA + 1-2 highlights max par section)

## 3. Hierarchy & alignment — /10

- [ ] Grid 12 cols ou 8 cols cohérent, pas de `flex` partout
- [ ] Optical alignment respecté (kicker au baseline du titre, pas au top)
- [ ] Asymétrie volontaire (7/5 ou 8/4) plutôt que tout 50/50
- [ ] Espace blanc rationnel — sections varient en hauteur (pas toutes 100vh)
- [ ] Hierarchy visuelle évidente en 2 secondes (titre > kicker > body > meta)

## 4. Motion budget — /10

- [ ] 1 effet kinetic signature MAX dans le hero
- [ ] 2-3 micro-interactions cohérentes (CTA, lien, image hover)
- [ ] Aucun effet animé sur `width`, `height`, `top`, `left`, `margin`, `padding`
- [ ] `prefers-reduced-motion` respecté partout (motion lib hooks ou matchMedia)
- [ ] `viewport={{ once: true }}` sur reveal — pas de re-trigger au scroll-back
- [ ] FPS stable ≥ 50 sur DevTools Performance (CPU 4x throttle)

## 5. Art direction — /10

- [ ] Photos retraitées (`.photo-warm` / `.photo-cinema` / `.photo-bw`) — pas stock brut
- [ ] Ratios cohérents (max 2 ratios différents dans tout le site : 3/4 + 4/5 par ex)
- [ ] Grain calibré (SVG `feTurbulence`, opacité 0.12-0.32) — pas opacity Tailwind
- [ ] Figcaption numérotée (`Fig. 01`) ou légende italique courte
- [ ] Icônes custom OU un seul jeu cohérent (jamais Lucide générique mixé)
- [ ] Aucun emoji utilisé comme illustration

## 6. AI-slop absent — /10

- [ ] `rounded-lg` non utilisé globalement (radius différenciés)
- [ ] `shadow-md` non utilisé globalement (3 elevations distinctes)
- [ ] Aucune mention "Get started", "Your tagline", "Lorem ipsum"
- [ ] Pas de gradient mauve/violet en background
- [ ] Pas de bento grid identique partout (max 1 bento par site, intentionnel)
- [ ] Icônes lucide-react Sparkles/Zap/Rocket/Star non visibles
- [ ] Pas de "Trusted by 10000+ companies" placeholder

## 7. A11y & robustesse — /10

- [ ] Focus-visible ring sur tous les interactifs
- [ ] Aucun `outline: none` sans `focus-visible:ring-*`
- [ ] Semantic HTML (h1 unique, article, section, figure/figcaption, dl/dt/dd)
- [ ] Mobile viewport tested (375px) — pas de débordement horizontal
- [ ] Reduced motion testé (`@media prefers-reduced-motion`)
- [ ] Custom cursor désactivé sur `pointer: coarse`

---

## Output

Score final + verdict + top 5 fixes prioritaires (P0/P1/P2) avec preuves
(file:line ou screenshot).

VERDICT: SHIP | NEEDS-FIX | NOT-SENIOR-GRADE
