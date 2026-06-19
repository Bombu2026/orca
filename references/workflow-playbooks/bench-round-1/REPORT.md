# Benchmark workflows — Round 1 (2026-06-04)

> **Expérience contrôlée automatisée**, pas encore de l'usage réel humain. 4 méthodes ×
> 3 tâches objectives (A bug fix, B feature, C refactor), modèle Opus 4.8, même tâche /
> même départ pour tous, solutions gradées contre un **test d'acceptation caché** (zéro
> contamination : les arms n'ont jamais vu les tests).

## Classement

| # | Méthode | Score pondéré /10 | Statut |
|---|---|---|---|
| 1 | **Baseline (prompt direct)** | **9.4** | classé |
| 2 | **EPCT + Verify durci** | **9.1** | classé |
| 3 | Spec-driven solo | 8.2 | classé |
| 4 | Orchestrator-Workers | 7.3 | classé |

## Ventilation par critère (moyenne des 3 runs)

| Méthode | Vélocité | Justesse | Fiabilité | Coût | Charge cog. | Robustesse | **Pondéré** |
|---|---|---|---|---|---|---|---|
| Baseline | 9.0 | **10** | 8.7 | **10** | 9.0 | 10 | **9.4** |
| EPCT + Verify | 9.0 | **10** | 8.7 | 9.0 | 8.0 | 10 | **9.1** |
| Spec-driven | 7.0 | **10** | 9.0 | 7.0 | 6.0 | 10 | **8.2** |
| Orchestrator | 6.0 | **10** | **9.7** | 4.0 | 4.0 | 10 | **7.3** |

- **Justesse / Robustesse = objectifs** (tests cachés) : **les 12 solutions passent 100%**.
- **Fiabilité = signaux mécaniques de vérification** dans l'artefact (a-t-il lancé tests/tsc, raisonné les edge cases, eu une review séparée).
- **Vélocité / Coût / Charge cognitive = proxys structurels** (nb d'agents, cérémonie) — valides pour CETTE classe de tâches (correction saturée).

## Le constat honnête

**Sur des tâches petites et bien spécifiées, Opus 4.8 réussit quelle que soit la méthode.** La correction est *saturée* (10/10 partout), donc le classement est dicté par le **coût** et la **charge cognitive** → le baseline gagne d'un cheveu, EPCT colle à 0,3.

Ce n'est **pas** « le baseline est le meilleur workflow ». C'est : *quand une tâche tient en un one-shot fiable, ajouter de la cérémonie ne paie pas* — exactement l'anti-pattern « Waterfall in Markdown » de la rubrique. Détails qui comptent :

- **EPCT (9.1)** = quasi gratuit ET il **verifie** (un de ses arms a lancé `tsc --strict --noUncheckedIndexedAccess` et corrigé une vraie erreur de type avant de rendre). C'est l'assurance qui ne coûte presque rien → **le meilleur défaut robuste**.
- **Orchestrator (7.3)** a la **meilleure fiabilité (9.7)** grâce à sa review adversariale — mais paie 3× le coût pour zéro gain de correction sur des tâches non-parallélisables. Le « 4-7× tokens » que la rubrique annonçait, sans contrepartie ici.
- **Spec-driven (8.2)** : la cérémonie d'interview+spec+session fraîche est du poids mort sur des tâches de cette taille.

## Limite de ce round (→ Round 2)

Les 3 tâches étaient **dans la zone de compétence one-shot du modèle** : aucune n'a fait échouer un arm. Le benchmark a donc mesuré l'**efficience**, pas la **différenciation par la correction**. Pour révéler la vraie valeur d'EPCT/Spec/Orchestrator, le Round 2 doit utiliser des tâches qui **cassent le baseline** :

- tâches **ambiguës** (le piège « résoudre le mauvais problème » que le gate de plan/spec est censé éviter) ;
- tâches **larges** qui débordent le contexte (là où la session fraîche du spec-driven gagne) ;
- tâches **vraiment parallélisables** (migration 30+ fichiers) où l'orchestrator doit enfin payer ;
- introduire un **bug subtil planté** que seule la review adversariale attrape.

## Reproduire / étendre

```bash
cd references/workflow-playbooks/bench-round-1
bun grade.ts --task A --files '{"price.ts":"<code>"}'   # grader une solution
bun finalize.ts <arms-output.json>                       # regrader + ré-enregistrer
bun ../../../scripts/workflow-bench.ts leaderboard        # classement à jour
```

Les 12 runs sont dans `references/workflows-benchmark.jsonl` (notés `round-1 automated`). L'usage réel humain s'ajoutera par-dessus (demi-vie 90j → les runs réels finissent par dominer).
