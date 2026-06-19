---
name: moodboard
description: Capture ou update le moodboard visuel du projet. WebFetch URLs refs, annote, synthétise palette + motion signature dans docs/MOODBOARD.md.
model: claude-opus-4-8
---

# /moodboard

Lance la skill `moodboard-capture`.

Arguments : `$ARGUMENTS` — si liste d'URLs fournie (séparées par espaces), les ajoute/remplace. Sinon, demande au user.

Exemple : `/moodboard https://basement.studio https://obys.agency https://lusion.co`
