# Benchmark workflows — Round 2 (2026-06-04)

> Tâches **conçues pour casser le baseline** : pièges de correction classiques. Validés
> discriminants (une implémentation naïve échoue : median 5/8, billing **2/6**, order 5/7).
> Même protocole que Round 1 : 4 méthodes × 3 tâches, test d'acceptation caché.

## Les 3 tâches-pièges
- **t1 median** — piège du tri lexicographique (`[10,2,1]`), mutation de l'entrée, longueur paire, vide.
- **t2 nextBillingDate** — débordement de mois (`31 jan +1 → 28 fév`), année bissextile, calcul UTC.
- **t3 computeTotal** — moteur de commande à 5 règles ordonnées + **cap de remise à 50%** qui clamp vers le haut.

## Résultat : le baseline n'a PAS cassé

| Méthode | t1 | t2 | t3 | Correction | Pondéré /10 |
|---|---|---|---|---|---|
| Baseline | 100% | 100% | 100% | **3/3** | **9.5** |
| EPCT + Verify | 100% | 100% | 100% | **3/3** | **9.2** |
| Spec-driven | 100% | 100% | 100% | **3/3** | 8.2 |
| Orchestrator | 100% | 100% | 100% | **3/3** | 7.2 |

**Les 12 solutions passent 100%, y compris le baseline.** Même en mode « prompt direct », Opus 4.8
écrit `[...nums].sort((a,b)=>a-b)` (pas de mutation, pas de tri lexico), calcule les dates en UTC avec
clamp de fin de mois, et applique le cap à 50%. Le modèle **ne code pas naïvement** : il raisonne sur
les pièges classiques de lui-même.

## Conclusion combinée (Round 1 + Round 2, 24 runs)

| # | Méthode | Score /10 |
|---|---|---|
| 1 | **Baseline (prompt direct)** | **9.5** |
| 2 | **EPCT + Verify durci** | **9.2** |
| 3 | Spec-driven solo | 8.2 |
| 4 | Orchestrator-Workers | 7.3 |

**Le constat qui compte, à contre-courant du discours internet :** pour des tâches qui **tiennent dans
le contexte**, le choix du workflow n'affecte quasiment **pas la correction** avec un modèle fort comme
Opus 4.8 — *même sur des tâches-pièges*. La différenciation se joue sur le **coût** et la **rigueur de
process**, pas sur la qualité du résultat. Donc :

1. **Pour le quotidien (tâches bornées) : le plus léger gagne.** Ajouter de la cérémonie (spec, orchestration)
   coûte 2-7× sans gain de correction. C'est l'anti-pattern « Waterfall in Markdown » confirmé par les données.
2. **EPCT + Verify (9.2) reste le meilleur défaut** : à 0,3 du baseline, il ajoute un filet de sécurité
   (plan + gate de preuve) pour un coût négligeable — l'assurance qui ne se voit pas tant que rien ne casse,
   mais qui paie le jour où une tâche sort de la zone one-shot.
3. **Orchestration (7.3) ne se justifie PAS** sur des tâches non-parallélisables : 3× le coût, zéro gain ici.
   Son domaine (migration de masse, recherche multi-angles) n'a volontairement pas été stressé.

## Limite honnête & suite

Deux rounds n'ont pas réussi à faire échouer le baseline → **les méthodes lourdes ne peuvent gagner que
là où le baseline ÉCHOUE vraiment** : tâches qui dépassent la capacité one-shot (très larges / multi-sessions /
ambiguïté nécessitant une clarification humaine / parallélisme massif). Un banc automatisé contrôlé ne
reproduit pas bien ces régimes — c'est exactement ce que le **benchmark vivant alimenté par l'usage réel**
est fait pour capturer (wall-clock, interruptions humaines, vraies tâches difficiles). Les 24 runs automatisés
établissent la ligne de base ; l'usage réel de l'opérateur affinera le classement (demi-vie 90j).

**Reco actionnable :** défaut = **EPCT + Verify durci**. Bascule sur Spec-driven seulement pour une grosse
feature ambiguë, sur Orchestrator seulement pour du parallélisable massif. Ne sur-orchestre jamais une tâche
qui tient en un prompt.
