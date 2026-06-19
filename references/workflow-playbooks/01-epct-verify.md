# Playbook 01 — EPCT + Verify durci

**Philosophie : tactique — plan-avant-code + preuve-avant-fini.** Le défaut Anthropic (Explore → Plan → Code → Commit) instrumenté avec une phase verify **déterministe** : un Stop hook qui force `tsc + lint + vitest (+ Playwright/screenshot pour l'UI)` et bloque la fin de tour tant que c'est rouge. Fusion de l'agentic loop (squelette) + EPCT (gate de plan) + evaluator-optimizer niveau 3 (gate de preuve).

## Quand
Défaut pour **toute tâche moyenne/élevée qu'on ne peut pas décrire en une phrase** : feature multi-fichiers, nouvelle intégration, refactor non trivial. Skip le plan (mais garde le verify-gate) pour typo/rename/log.

## Comment l'exécuter
1. **Plan mode** (Shift+Tab ×2). Prompt : « Lis les fichiers liés à `<feature>`, ne modifie rien, propose un plan détaillé (fichiers touchés, interfaces, hors-scope, étape de vérif e2e). »
2. **Lire le plan** (Ctrl+G), corriger les hypothèses fausses, approuver — gate humain **réel**, pas du théâtre.
3. Sortir du plan mode : « Implémente le plan, écris les tests, lance la suite et corrige jusqu'au vert. **Montre la sortie des tests.** »
4. S'assurer qu'un **Stop hook** exécute `bun tsc --noEmit && bun biome check && bun vitest run` (+ `playwright test` si UI) et bloque tant que rouge (flag `stop_hook_active` anti-boucle + max-iterations).
5. Vérifier le **diff contre le plan**.
6. Commit + PR descriptif.
7. **Vérif e2e** dans le vrai contexte (doctrine « fonctionnel » : navigateur via skill `browse`).

## Pourquoi retenu
Socle non négociable consensus 2026 (Anthropic + power-users), **zéro setup**, transforme directement la doctrine « fonctionnel » de l'opérateur en harness. Le gate de plan attaque le failure mode #1 (mauvais problème), le Stop hook le #2 (fini sans preuve). 4 critères de la rubrique couverts pour un coût d'entrée nul.

## Hypothèse de test
Devrait **gagner sur vélocité-vers-mergeable et justesse** sur tâches moyennes/élevées, coût tokens ≈ baseline. Faiblesse attendue : overhead pur sur tâches triviales (mesurer pour calibrer le seuil de skip) ; révèle un mauvais CLAUDE.md (le plan amplifie un contexte pauvre).

## Métrique de succès
Gagne si : (a) écart-intention ≤ 1, (b) le Stop hook a bloqué ≥1× sur du rouge réel avant le « fini », (c) `temps_baseline/temps_workflow ≥ 1` sur tâches moyennes/élevées, (d) zéro « green build trompeur » (vérif e2e manuelle confirme).
