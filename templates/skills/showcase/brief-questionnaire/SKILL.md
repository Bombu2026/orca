---
name: brief-questionnaire
description: >-
  Conduit ou relance le questionnaire brief client (9 sections, 32 questions)
  pour un projet site vitrine. Écrit/met à jour docs/BRIEF.md. Triggers :
  "lance le brief", "relance le questionnaire", "update le brief", "ajoute les
  infos client", "cadre le projet". User-invoked via /brief ou model-invoked en
  phase 1 d'un nouveau projet showcase.
allowed-tools:
  - Read
  - Write
  - Edit
  - AskUserQuestion
  - Glob
---

# Brief Questionnaire Skill

Mission : transformer une demande vague en brief structuré documenté.

## Phase 1 — Load or init

1. Check `docs/BRIEF.md` existe :
   - Si oui : lire, identifier sections vides/obsolètes → mode **update incremental**
   - Si non : copier depuis le template ORCA ou générer from scratch → mode **full questionnaire**

2. Lis `docs/MOODBOARD.md` si dispo (pour ne pas dupliquer les questions mood).

## Phase 2 — Conduite du questionnaire

9 sections, 32 questions. Utilise **AskUserQuestion en batch de 4 max** pour garder le flow. Ordre fixe :

### 1. Client & Positionnement (4 Q, batch 1)
- Entreprise / industrie / taille
- Proposition de valeur en 1 phrase
- 3 concurrents directs (URLs)
- Différenciation fondamentale

### 2. Audience & Objectif conversion (3 Q, batch 2 partie 1)
- Persona primaire
- Action #1 attendue
- KPI 3 mois

### 3. Contenu & Ton (4 Q, batch 2 partie 2 + batch 3 partie 1)
- Rédacteur
- Ton (3 adjectifs)
- Langues
- Volume de pages

### 4. Mood visuel (4 Q, batch 3 partie 2 + batch 4)
- URLs refs positives (3-8)
- URLs à éviter (3-8)
- Palette (claire/sombre/colorée/mono/editorial)
- Typographie (grotesque/serif/kinetic/mix)

### 5. Motion & Interactivité (4 Q)
- Ambition motion 1→5
- Smooth scroll oui/non
- Effets (parallax/cursor/narratif)
- 3D/WebGL

### 6. Assets (4 Q)
- Photos (client/banque/shooting/inconnu)
- Vidéos (combien/durées/hero bg)
- Logo + brand assets
- Illustrations/icônes

### 7. Tech & Contraintes (3 Q)
- CMS headless requis
- Intégrations (analytics/contact/newsletter/Calendly/chat)
- Performance budget mobile

### 8. SEO & Diffusion (3 Q)
- Mots-clés cibles
- Schema.org type
- OG images (custom/template)

### 9. Exécution (3 Q)
- Deadline
- Revue intermédiaire client
- Hébergement (Vercel cdg1 default)

**Règles** :
- AskUserQuestion avec options concrètes quand possible (Q fermées) + option "Autre" implicite
- Skip sections déjà remplies en mode update
- Jamais plus de 4 questions par round — garde le user engagé

## Phase 3 — Synthèse

1. Compile toutes les réponses dans `docs/BRIEF.md` (utilise le template `templates/showcase/BRIEF.template.md` comme base).
2. Ajoute section "Notes" avec commentaires user libres si dispo.
3. Lance `bun scripts/detect-complexity.ts docs/BRIEF.md docs/MOODBOARD.md` → remplit `{{TIER}}` + `{{TIER_JUSTIFICATION}}`.
4. Présente le brief final au user pour validation : "Voilà le brief. Valide / amende avant qu'on passe au moodboard."

## Phase 4 — Commit

Si git initialisé : propose `git add docs/BRIEF.md && git commit -m "brief: initial client brief"`.

## Exit

`docs/BRIEF.md` existe, 9 sections remplies, tier détecté + validé.
