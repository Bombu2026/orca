---
name: motion
description: Design et implémente une séquence motion pour une section. Délègue à motion-engineer agent, respecte BRIEF/MOODBOARD, check reduced-motion + cleanup + perf.
model: claude-opus-4-8
---

# /motion

Design et implémente motion pour une section du projet vitrine.

Arguments : `$ARGUMENTS` — nom de la section (ex : `/motion hero`, `/motion features`).

Workflow :
1. `site-director` charge BRIEF.md §5 (Motion & Interactivité) + MOODBOARD.md motion signature
2. Délègue à `motion-engineer` agent avec contexte complet
3. `motion-engineer` propose 2 approches (safe + ambitious) avec code snippets
4. User choisit / amende
5. Implémentation + `motion-audit` skill post-édition

Si section inexistante : propose `/section {name}` d'abord.
