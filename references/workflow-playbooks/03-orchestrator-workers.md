# Playbook 03 — Orchestrator-Workers parallèle

**Philosophie : largeur parallèle — multi-agent pour couvrir, pas pour approfondir.** Un lead décompose une tâche **réellement parallélisable** et délègue à 3-5 subagents en worktrees isolés (`isolation:worktree`), chacun avec objectif + format + scope + contexte frais ; le lead synthétise ; une couche adversariale séparée tente de réfuter chaque livrable. C'est exactement le cas où Anthropic dit que le multi-agent paie (parallélisable) et où il casse (tightly-interdependent).

## Quand
Tâches dont l'imprévisibilité de surface paie le surcoût : **migration de masse** (rename d'API à travers le repo, framework migration), **recherche/audit** de codebase multi-angles, **refactor transverse** dont on ignore le nombre de fichiers. **PAS** pour mono-fichier ni coding tightly-interdependent (assets incohérents type Flappy Bird).

## Comment l'exécuter
1. **Spec claire en amont** (sinon les erreurs se composent ×N).
2. « Décompose `<tâche>` en sous-tâches indépendantes ; pour chaque, lance un subagent en worktree isolé avec objectif, format de sortie et scope bornés. **Autorité d'écriture single-threaded** : sous-tâches disjointes, jamais d'édition concurrente du même fichier. »
3. **Plafonner à 3-5 workers** (au-delà : le contexte de l'orchestrateur déborde).
4. **Modèles tiered** : Opus lead + Sonnet workers (~−40% de coût).
5. **Fan-out → verify** : pour chaque livrable, un subagent sceptique frais tente de le réfuter contre une rubrique ; ne survit que sous convergence/vote.
6. Lead **synthétise** + tests globaux.
7. **Review humaine** du diff agrégé (le vrai goulot).

## Pourquoi retenu
**Troisième philosophie radicalement différente** (largeur parallèle vs profondeur séquentielle des deux autres) — et c'est le terrain où le benchmark doit honnêtement mesurer **quand le multi-agent paie vs quand c'est du gaspillage 4-7×**. Aligné sur la préférence de l'opérateur « maximiser la parallélisation » — mais à tester rigoureusement contre le coût pour ne pas la suivre aveuglément.

## Hypothèse de test
Devrait **gagner en vélocité ET couverture** sur tâches vraiment parallélisables (migration 50 fichiers), et **perdre lourdement** (coût + incohérence) sur le coding tightly-interdependent. Le test doit exhiber **les deux régimes** pour cartographier la frontière. Coût attendu : 4-7× tokens, à justifier.

## Métrique de succès
Gagne **seulement si** : (a) sur tâche parallélisable, `temps_baseline/temps_workflow ≥ 2` **et** cohérence inter-fichiers préservée (style/API uniformes), (b) coût tokens (≤7×) amorti par le gain, (c) l'adversarial verify a éliminé ≥1 livrable faux. **Perd** si appliqué hors zone (incohérences cross-file / surcoût sans gain) → consigné comme anti-pattern.
