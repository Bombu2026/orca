---
name: moodboard-capture
description: >-
  Capture et annote les URLs de références visuelles fournies par le user pour
  un projet vitrine. WebFetch chaque URL pour extraire hero/nav/palette/motion
  cues. Génère docs/MOODBOARD.md avec annotations + palette inférée + motion
  signature. Triggers : "capture le moodboard", "ajoute cette ref", "remplace
  le moodboard", "analyse ces sites". User-invoked via /moodboard.
allowed-tools:
  - Read
  - Write
  - Edit
  - WebFetch
  - AskUserQuestion
---

# Moodboard Capture Skill

Mission : transformer une liste d'URLs en moodboard structuré avec annotations actionnables.

## Phase 1 — Collecte

1. AskUserQuestion : "URLs références positives (3-8) ?"
2. AskUserQuestion : "URLs à éviter absolument (3-8) ?"
3. Charge `references/showcase-sites-references.md` pour suggérer des refs additionnelles si user hésite.

## Phase 2 — Analyse

Pour chaque URL positive :
1. WebFetch l'URL → extrait heading, hero text, typo choices, palette probable (via meta/css cues).
2. Génère annotations structurées :
   - Ce qui marche (hero / motion / typo / spacing)
   - À prendre (spécifiquement)
   - À ne pas prendre (si applicable)
   - Tags (motion / kinetic / editorial / brutalist / minimal / warm / dark / 3d)

Pour chaque URL négative : annotations courtes sur ce qui ne va pas (helps future decisions).

## Phase 3 — Synthèse

Compile dans `docs/MOODBOARD.md` (template `templates/showcase/MOODBOARD.template.md`) :
- **Refs positives** (avec annotations)
- **Refs négatives** (avec why-avoid)
- **Palette inférée** (cross-analyse des refs positives → 4 couleurs probables)
- **Motion signature** (keywords + patterns à reproduire)
- **Typographie pressentie** (display + body)
- **Photographie / imagerie** (style + sources + keywords curation)
- **Sketch structure home** (liste sections + ordre + intention motion)

## Phase 4 — Validation

Présente le moodboard au user : "Valide / amende". Itère si besoin.

## Exit

`docs/MOODBOARD.md` existe, refs annotées, palette + motion signature définis.
