# Pre-Prod QA Strategy — Doctrine "Agent Maxxing avec discipline"

Source : retours terrain d'un dev senior qui pilote 8-10 agents/jour sur un produit en cours, après avoir traversé la phase de psychose LLM. Distillé en 14 stratégies actionnables que les agents pre-prod d'Assistant doivent appliquer avant tout ship.

## La règle d'or : Discriminatory > Generative

> "La psychose LLM apparaît quand on génère sans discriminer."

**Génératif** = ajouter des features. **Discriminatoire** = trouver et corriger les défauts. Une équipe d'agents qui ne fait que générer produit du slop. La QA pre-prod est par essence discriminatoire — c'est là que `qa-hunter`, `slop-janitor`, `architect-auditor` et `e2e-scripter` brillent.

---

## Les 14 stratégies

### 1. Équilibre génération / discrimination
Si 2-3 agents construisent en parallèle, il faut **autant** d'agents qui chassent le slop, la duplication et les bugs. Sans ça, le repo dérive en quelques heures.

### 2. Rapports de slop systématiques
Générer en continu des rapports sur :
- duplications de types/composants
- consolidation et componentization
- documentation manquante
- internationalisation (i18n)
- couverture de tests
- lint strict + type strict (zéro `any`)
- larp (commentaires inutiles, abstractions à un usage)

→ implémenté par `slop-janitor`

### 3. TDD avec E2E uniquement, **no mocks**
Code qui n'est pas exécuté dans le vrai stack en live n'existe pas. Pas de `vi.mock()`, pas de `page.route()`, pas d'env de test fake. Le UX peut être moche au premier run, mais si les actions passent et qu'on voit le résultat, on a une base solide à sculpter.

→ implémenté par `e2e-scripter`

### 4. Monorepo + petits packages testables
Chaque package doit être :
- petit
- isolé
- individuellement testable
- auto-cohérent

Si chaque brique est prouvée seule, on peut empiler du complexe par-dessus avec confiance. → implémenté par `architect-auditor`

### 5. Parallélisation uniquement sur des zones non-conflictuelles
On peut paralléliser plusieurs agents si et seulement si ils touchent des packages/fichiers différents. Sinon : merge conflicts garantis et code écrasé.

### 6. Petit > grand
Les LLM sont **magiques sur des petits bouts de code** et **catastrophiques sur les grosses constructions**. Donc :
- fichiers < 400 LOC
- composants < 250 LOC
- packages avec API publique claire (`index.ts` exclusivement)

→ vérifié par `architect-auditor`

### 7. Pas d'unit tests par les agents
Les agents hallucinent des test harnesses massifs avec leurs propres bugs, qui rendent la recherche de code pire. **Conséquence** : `e2e-scripter` ne génère **jamais** d'unit tests. L'user les écrit à la main si nécessaire.

### 8. Headful verification obligatoire
Les agents en headless **mentent** sur les résultats. Au moins une vérif headful visuelle par parcours, avant de lui faire confiance.

→ règle inviolable de `e2e-scripter` et `qa-hunter`

### 9. Bug triage flow
Boucle disciplinée :
1. Trouver un bug
2. L'écrire dans `BUGS.md`
3. Dispatcher à un agent
4. Passer au suivant sans attendre
5. Une fois le contexte plein, repasser et vérifier les fixes

Quand on n'arrive plus à suivre, redescendre à 1 agent et reprendre la lecture du code en main.

### 10. Discipline horaire (max 3 agents après 22h)
Au-delà, la fatigue empêche de discriminer correctement les outputs. Mieux vaut 1 agent qu'on suit que 8 qui dérivent.

### 11. Lire les plans
Si on demande un plan à un agent :
- **lire** le plan
- demander à l'agent de poser des questions sur ce dont il n'est pas sûr
- demander à identifier les risques
- faire expliquer les parties incomprises

> "Les plans proposés sont **toujours** 20% faux."

### 12. Dogfooding obligatoire
La qualité du produit est directement proportionnelle au temps que **l'user** passe à l'utiliser lui-même. La majorité du temps ne devrait **pas** être à piloter des agents, mais à utiliser le produit, et ne revenir aux agents que quand un truc cloche.

### 13. Tests visuels E2E sur tout le user journey
Tout ce qu'un user fera doit être couvert par un test E2E visuel. Spécialement critique sur du temps réel (jeux, chat, collab).

### 14. Anti-psychose : connaître son domaine
Si on ne comprend pas le sens des mots ou du code, si on ne peut pas lire et dire "oh putain c'est tout faux", la psychose est garantie 100% du temps. Particulièrement dangereux en math/physique/bio, où les LLM jouent les juniors qui sonnent intelligents.

> "If you can't plan and manage a project for 10 engineers, you can't do it for a bunch of agents either."

---

## Comment Assistant utilise cette doctrine

Cette stratégie est ancrée dans 4 agents et 1 commande, installables via `/init` ou ajoutables à un projet existant via `/audit` :

| Artefact | Rôle |
|---|---|
| `templates/agents/qa-hunter.md` | Discriminatoire bug hunter (live stack, no mocks) |
| `templates/agents/slop-janitor.md` | Rapport de slop (stratégie 2) |
| `templates/agents/architect-auditor.md` | Rapport d'architecture (stratégies 4, 5, 6) |
| `templates/agents/e2e-scripter.md` | E2E Playwright sur live stack (stratégies 3, 7, 8, 13) |
| `templates/commands/canonical-pack/ship-check.md` | Orchestre les 4 en parallèle avant prod (synthèse + go/no-go) |

**Workflow type avant ship** :
```
/ship-check
↓
4 agents lancés en parallèle (qa-hunter + slop-janitor + architect-auditor + e2e-scripter)
↓
4 rapports : BUGS.md + SLOP.md + ARCH.md + E2E_REPORT.md
↓
Synthèse SHIP_CHECK.md avec score + bloqueurs + verts
↓
Décision : SHIP / DON'T SHIP / SHIP WITH CAVEATS
```

**Règles de ship-readiness** :
- Tout bug `critical`/`high` non résolu → DON'T SHIP
- Tout cycle de deps → DON'T SHIP
- Toute boundary violation (server code in client, secrets exposés) → DON'T SHIP
- Slop important / fichiers > 400 LOC / couverture E2E < 80% → SHIP WITH CAVEATS
- Pas de headful verif → SHIP UNCERTAIN
- Le reste vert → SHIP
