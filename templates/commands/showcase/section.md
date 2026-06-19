---
name: section
description: Scaffold une nouvelle section depuis le catalogue canonique (hero/features/testimonials/CTA/etc.) en respectant BRIEF + MOODBOARD. Update Sections Catalog dans CLAUDE.md.
model: claude-opus-4-8
---

# /section

Scaffold une nouvelle section du site.

Arguments : `$ARGUMENTS` — nom de la section (ex : `/section hero`, `/section testimonials`).

Workflow :
1. Read `references/website-showcase-patterns.md` pour voir les variantes disponibles pour ce type de section
2. Read BRIEF.md + MOODBOARD.md pour contextualiser
3. AskUserQuestion : quelle variante ? (centered/split/video-bg/... selon type)
4. Crée `components/sections/{Name}.tsx` (RSC)
5. Si motion requis → crée aussi `components/motion/{Name}Motion.tsx` (client wrapper)
6. Update `Sections Catalog` table dans CLAUDE.md (ajoute ligne : `{Name} | file | tier | draft | motion-desc`)
7. Propose `/motion {name}` en next step si ambition motion du BRIEF > 2

Sections canoniques supportées : hero, logo-cloud, features, bento, testimonials, pricing, faq, cta, footer, navigation.
