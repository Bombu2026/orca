---
name: brief
description: Lance ou relance le questionnaire brief client pour le projet vitrine en cours. Écrit/update docs/BRIEF.md.
model: claude-opus-4-8
---

# /brief

Relance le questionnaire brief client (9 sections, 32 questions).

Si `docs/BRIEF.md` existe déjà → mode update incremental (skip sections validées).
Si absent → full questionnaire.

Invoque la skill `brief-questionnaire`. Délégué à l'agent `site-director` pour conduire en profondeur.

Arguments : `$ARGUMENTS` — si fourni, cible une section spécifique (ex : `/brief motion` → saute directement à section 5).
