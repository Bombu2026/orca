# RUBRIC — comment juger un workflow agentique (la stratégie répétable)

> C'est le filtre que `/assistant` applique **à chaque fois** que l'opérateur demande « le
> meilleur workflow ». On ne note pas à l'intuition : on teste sur des tâches réelles et on
> accumule (`scripts/workflow-bench.ts`). **Anti-hype : stars GitHub et fraîcheur presse = 0.
> Seuls les runs réels comptent.** Issu d'un workflow de recherche 15 agents (2026-06-04).

## Les 6 critères (poids ∑ = 10)

| Poids | Critère | Comment mesurer |
|---|---|---|
| **2** | **Vélocité réelle de shipping** | Wall-clock du prompt initial → commit/PR qui passe la doctrine « fonctionnel » (testé e2e, pas tsc+200). Mesure = `temps_baseline / temps_workflow` (>1 = gain). Compter aussi les allers-retours humains (moins = mieux). |
| **2** | **Justesse-de-cible** (le BON problème ?) | Écrire l'intention métier en 1 phrase AVANT le run (scellée). Après, noter 0-10 l'écart livré↔intention. Pénaliser « 100 tests verts pour un comportement faux » (Angry Client Problem). |
| **2** | **Fiabilité vérifiable** | Le workflow produit-il un check exécutable (tests/typecheck/lint/screenshot) que l'agent **montre** (output réel, pas « done ») ? Croiser avec un reviewer frais (writer≠reviewer) : bugs réels attrapés avant merge. Pénaliser le verification gap + le reward hacking. |
| **1.5** | **Coût tokens / quota** | Logger tokens (ou durée × intensité agents). Single-agent ≈ baseline ; orchestrator ≈ 4-7× ; multi-agent research ≈ 15×. Normaliser vs baseline. Ne « gagne » que si le surcoût est amorti. Pénaliser un quota Max brûlé en <30 min sans livrable mergeable. |
| **1.5** | **Charge cognitive & friction** (solo founder) | 0-10 : setup avant de démarrer, décisions imposées à l'humain, « productivity panic » vs flow. Proxy : nb de commandes/fichiers d'infra avant le 1er code utile. Pénaliser la cérémonie pure sur petites tâches (Waterfall in Markdown). |
| **1** | **Robustesse multi-tâches** | Tester sur 4 classes (A bug fix, B feature multi-fichiers, C refactor transverse, D UI subjectif). Bonne moyenne **et** faible écart-type. Un workflow spécialisé est pénalisé hors de sa zone ; son `bestFor` doit être borné. |

`scorePondéré (run) = Σ(score_critère × poids) / 10`, rendu sur /10.
**Garde-fou** : si `greenBuildTrompeur=oui` OU `rewardHacking=oui` → `fiabilité` plafonnée à 3, peu importe le reste.

## Protocole de test (tâches appariées)

1. Suite de **4 tâches-étalon** réelles sur un repo Bun/Next.js, une par classe (A/B/C/D).
2. Pour chaque workflow : **même tâche, même commit de départ** (`git reset --hard` ou worktree dédié), **même CLAUDE.md, même modèle** (Opus 4.8 ; orchestrator = Opus lead + Sonnet workers, documenté).
3. Toujours un run **BASELINE** « prompt direct sans workflow » comme dénominateur.
4. Écrire l'**intention-cible en 1 phrase AVANT** (scellée) → score justesse sans biais.
5. Vérif finale identique pour tous : doctrine « fonctionnel » (skill `browse`, vrai contexte d'usage).
6. **≥2 runs** par (workflow × tâche) pour capter la variance (stochasticité).
7. Scoring justesse/fiabilité/charge cognitive par un **juge en contexte frais** (ou l'opérateur), **blind** (ne sait pas quel workflow a produit le diff).
8. Tout est loggé dans `references/workflows-benchmark.jsonl` (append-only) → benchmark **vivant** (re-test périodique, demi-vie 90j).

## Schéma d'un run (`workflows-benchmark.jsonl`)

```json
{
  "runId": "auto", "date": "ISO", "ccVersion": "2.1.x", "model": "claude-opus-4-8", "startCommit": "abc123",
  "workflow": "EPCT + Verify durci", "task": "ajouter route /pricing", "taskClass": "B",
  "intention": "une phrase scellée du résultat attendu",
  "wallClockSeconds": 1800, "interruptions": 2, "tokenRatio": 1.1,
  "scores": { "velocite": 8, "justesse": 9, "fiabilite": 9, "cout": 8, "chargeCognitive": 7, "robustesse": 7 },
  "verifyGate": { "existed": true, "blockedOnRed": 2 },
  "bugsCaught": 1, "bugsEscaped": 0, "rewardHacking": false, "greenBuildTrompeur": false,
  "verdict": "SHIP", "note": "le Stop hook a bloqué 2× sur du rouge réel"
}
```
`scorePondere` est calculé par le script (ne pas le fournir).

## Classement & statut

- Score d'un workflow = moyenne pondérée de ses runs avec **demi-vie 90j** (récents pèsent plus).
- Un workflow est **classé** seulement avec **≥3 runs sur ≥2 classes** ; sinon « provisoire ».
- `bun scripts/workflow-bench.ts leaderboard` régénère `LEADERBOARD.md`.
- `bun scripts/workflow-bench.ts select <A|B|C|D>` → le gagnant pour cette classe.

## Prior de recherche (PAS des scores de benchmark — à confirmer par les tests)

Classement issu de la recherche 2026 (rubrique appliquée aux *preuves documentaires*, pas à des runs réels). Sert d'hypothèse de départ, **remplacé** par le `LEADERBOARD.md` dès qu'on a des runs.

| Prior | Workflow | Note recherche |
|---|---|---|
| 1 | Agentic loop (Gather→Act→Verify) + Stop hook | 9.1 — squelette universel, contient les autres |
| 2 | **EPCT via Plan Mode** | 8.9 — défaut universel, zéro config *(→ top 3, playbook 01)* |
| 3 | Evaluator-Optimizer / Verification gate | 8.6 — contre-pouvoir du vibe coding solo |
| 4 | Subagent adversarial review (writer≠reviewer) | 8.4 — add-on quasi gratuit |
| 5 | TDD agentique (red→green→refactor) | 8.0 — feedback binaire, borne le scope |
| 6 | **Spec-driven** (interview→SPEC.md→fresh session) | 7.8 — grosses features *(→ top 3, playbook 02)* |
| 7 | Long-running harness (progress.txt + feature-list) | 7.5 — runs autonomes overnight |
| 8 | Context-as-finite-resource (/clear, lean CLAUDE.md) | 7.4 — discipline transverse |
| 9 | **Orchestrator-Workers** (lead + 3-5 workers //) | 6.8 — largeur parallèle *(→ top 3, playbook 03)* |
| 10 | Superpowers (brainstorm→worktree→TDD→2-review) | 6.7 — structure max, cérémonie lourde |
| 11 | Dynamic Workflows (plan JS, fan-out→verify) | 6.5 — gros chantiers décomposables |
| 12 | RPI + Intentional Compaction | 6.4 — gros codebases existants |
| 13 | Agent Teams (mailbox, task list partagée) | 5.5 — expérimental, coûteux |
| 14 | Best-of-N parallèle (N worktrees, garder le meilleur) | 5.2 — exploite la stochasticité, N× compute |
| 15 | PRP (Product Requirement Prompt) | 5.0 — redondant avec spec+gate pour un solo |
| 16 | Ralph Loop (`while true; claude < PROMPT.md`) | 4.6 — brutal sur le quota |

Les **3 retenus pour les tests** (top3) couvrent 3 philosophies distinctes : tactique (01), stratégique (02), largeur parallèle (03). Voir les playbooks.
