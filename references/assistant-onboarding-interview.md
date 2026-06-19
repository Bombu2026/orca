# Onboarding Interview — interroger d'abord, prescrire /goal·/loop ensuite

> Référence chargée par `/assistant` quand `organise.ts --json` renvoie `onboarding.mode`.
> Le **harness** se déduit (seed/bootstrap/audit/next-gap — jamais un choix user). Le **produit**,
> lui, ne se devine pas depuis le filesystem : à quoi il sert, pour qui, ce que « fini à 100% »
> veut dire, la cible de déploiement, le niveau de design. Sur un **nouveau projet**, /assistant
> INTERROGE d'abord, PUIS agit. Cette doctrine est portée en données par `scripts/lib/onboarding.ts`
> (consommé par `organise.ts`) pour ne jamais être oubliée.

## Quand l'interview se déclenche

`organise.ts` émet `onboarding.mode` :

- **`interview`** — `branch ∈ {SEED, BOOTSTRAP}` **ou** un `NEXT-GAP` encore **sans brief**
  (`PROJECT_BRIEF.md` / `docs/BRIEF.md` absent). C'est un projet jamais cadré → on interroge.
- **`health-check`** — `NEXT-GAP` **avec** brief présent (projet déjà cadré) → pas de questions,
  on fait le **check d'organisation + rapport de direction** (section dédiée plus bas).
- **`dirty`** — `DIRTY-FIRST` (> 30 fichiers non commités) → plan NEUTRALISÉ : aucune question,
  aucune boucle `/goal`·/loop prescrite. La priorité reste **STOP → assainir l'arbre** avant tout
  (dogfood : un auditeur ne travaille pas sur un arbre sale). `organise.ts` n'affiche que le verdict STOP.

## Mode INTERVIEW — la séquence complète (avant toute écriture de code)

### Phase 1 — Capter le brief

Le « premier texte » que l'opérateur a donné (sa première description du projet en ouverture de
session) **est** le brief de départ. Le lire en entier, en extraire ce qui est déjà connu, et ne
**jamais** redemander ce qui est déjà détecté par `detect-project.ts` (framework, langage, DB,
deps) ni déjà dit dans le brief. Si aucun brief n'a été donné sur un dossier vierge, demander
d'abord la description en une ligne avant le reste.

### Phase 2 — Poser un maximum de questions, GAP-DRIVEN

`organise.ts` renvoie `onboarding.questions[]` : la liste des sujets que la détection ne peut pas
trancher, déjà gatée par type (un `cli-tool` n'a pas de question design). **Les poser via
`AskUserQuestion`, batchés** (≤ 4 par appel ; le nombre réel de sujets dépend du type détecté).
Pour chaque sujet, proposer 2-4 options concrètes + laisser « Autre » faire le reste. Sujets canoniques :

| Sujet | Ce qu'il alimente |
|---|---|
| **Raison d'être** (problème résolu, utilisateur cible) | compréhension, prescription |
| **Définition de « fini à 100% »** (1-3 parcours non négociables) | **le cœur du /goal** + la DoD |
| **Hors-scope explicite** (ce que le projet ne doit PAS faire / hors v1) | borne l'agent autonome (anti gold-plating) + DoD |
| **Décisions déjà figées** (stack imposée, design system, plateformes, modèle éco) | verrouille la prescription + alimente la constitution |
| **Échelle & déploiement** (combien d'users, où ça tourne) | DoD production-reality (caching/CDN/scaling) |
| **Données & conformité** (comptes, paiements, RGPD, qui accède à quoi) | DoD sécurité/auth/RBAC |
| **Niveau de design** (fonctionnel vs vitrine/Awwwards) | enrôler senior-designer ou non |
| **Contraintes** (délai, techno imposée/interdite, systèmes existants) | borne la stack |
| **Autonomie souhaitée** (durée non-stop, auto-accept ou validation) | borne `stop after N turns` + permissions |

**Hors-scope** et **décisions déjà figées** sont UNIVERSELS (tout type) : ce sont les deux cases les
plus omises de l'état de l'art spec-driven et les plus rentables — la frontière négative empêche
l'agent autonome d'élargir le scope sur N tours, les décisions actées coupent le re-débat.

Règle GAP-DRIVEN (réel, pas type-driven) : **poser, ne pas deviner — mais ne jamais reposer à blanc
ce que la détection prouve déjà**. Quand `detect-project` a tranché (auth, déploiement, db),
`buildQuestions` DÉGRADE automatiquement le sujet en **confirmation binaire** (`kind:"confirm"`,
« Auth détectée : Better-auth — périmètre RGPD standard, OK ? ») au lieu de la question ouverte.
C'est la réconciliation de « un maximum de questions » avec « zéro question redondante ».

**Dossier vierge (branche SEED, type `unknown`)** : `buildQuestions` est gap-driven jusqu'au bout —
seuls les **6 sujets universels** (Raison d'être, Définition de « fini », Hors-scope, Décisions figées,
Contraintes, Autonomie) sont émis d'emblée. Les 3 sujets type-dépendants (Échelle & déploiement,
Données & conformité, Niveau de design) sont gatés par type et n'apparaissent **qu'une fois le type
connu** : poser une question d'échelle ou de design avant de savoir si c'est un cli-tool ou un site
vitrine reviendrait à deviner. Sur SEED, faire émerger le type depuis le brief (Phase 1) débloque
alors les sujets restants.

### Phase 2bis — CLARIFY (paraphrase-confirm + règle d'arrêt), avant toute écriture

`organise.ts` renvoie `onboarding.clarify` (non nul en mode interview) qui réifie le protocole
d'élicitation de l'état de l'art (Spec Kit `/clarify`, iReDev) :

- **paraphrase-and-confirm** : reformuler en 2-3 phrases l'intention (raison d'être + « fini » +
  hors-scope) et la faire **confirmer** avant de coder quoi que ce soit ;
- **règle d'arrêt** : arrêter de questionner quand chaque sujet a une interprétation unique ET que
  « fini » est vérifiable (parcours testable Given/When/Then) — puis STOP, ne pas sur-spécifier ;
- **gate** : écrire les réponses dans `PROJECT_BRIEF.md` (6 cases, pas de prose libre) puis le relire en
  self-review adversarial (cohérence / faisabilité / vérifiabilité) AVANT le code, pas seulement au ship.

### Phase 3 — Aller chercher TOUS les outils nécessaires

Une fois les réponses obtenues, **découvrir et matérialiser** l'équipe complète — skills,
subagents, hooks, MCP, plugins — qui rend le projet « parfait » pour son intention :

```bash
bun scripts/strategy-select.ts "<brief + réponses>" --type=<type> --write=<path>
bun scripts/install-toolkit.ts <path> --keywords="<brief>" --type=<type> --skills=top:8 --agents=top:6
```

- La library (`SKILL_LIBRARY_DIR`, 7876+ skills + collections subagents) est minée par
  `strategy-select` / `install-toolkit` — pas de choix à l'intuition.
- `organise.ts` renvoie déjà `prescription[]` (stack → outils plafonnés) **et**
  `onboarding.installation[]` (pour chaque outil prescrit : `installed` / `missing` / `n/a`).
  Tout `missing` se matérialise (install-toolkit pour les skills/agents, `.mcp.json` pour les MCP,
  hook dans `settings.local.json`). Un MCP n'est ajouté que s'il gagne sa place (≤ 2, coût contexte).
- Les **4 auditeurs** (`onboarding`/`auditors` non vide) sont générés en baseline et lancés en
  parallèle (agents Opus) — voir la section Production Reality de `SKILL.md`.

### Phase 4 — Croiser la mémoire Obsidian + vérifier les anciennes données

> **Étape LLM, non exécutée par le script.** `onboarding.ts` est volontairement read-only et ne
> touche jamais au vault (il hardcoderait un vault perso dans un outil destiné à des projets tiers,
> et coûterait du contexte). Le croisement mémoire est donc une discipline du LLM via `mcpvault` —
> à ne pas oublier, car aucun artefact ne le prouve automatiquement.

Le hook SessionStart injecte déjà `Memory.md` + `_ROUTING.md` du vault (`mcpvault`). Pendant
l'onboarding :

1. **Relire** `Memory.md` (identité, stack, préférences) et, si le projet existe déjà côté vault,
   `01 - Projects/<projet>/index.md` (via `mcp__mcpvault__read_note`).
2. **Vérifier la cohérence** : les réponses de l'interview contredisent-elles d'anciennes données
   (stack changée, projet renommé, décision inversée) ? Si oui, **le signaler** et demander quelle
   version fait foi — ne jamais écraser en silence.
3. **Écrire** le brief résolu + les décisions de cadrage dans le vault selon `_ROUTING.md` :
   - cadrage projet → `01 - Projects/<projet>/index.md` (créer si absent) ;
   - décision structurante → `01 - Projects/<projet>/decisions/YYYY-MM-DD-titre.md`.
   La mémoire auto-CC (`~/.claude/projects/.../memory/`) reste séparée — y poser un fait `project`
   seulement s'il est durable et non dérivable du code.

### Phase 5 — Dicter le `/goal` et le `/loop` exacts

`organise.ts` renvoie `onboarding.goal` et `onboarding.loop`, **déjà construits depuis l'état réel**
(score cible, DoD du type, auditeurs manquants) et **gatés par la version CC** (jamais un faux
`/goal` si l'évaluateur n'existe pas — cohérent avec l'Autonomy Card). Présenter à l'opérateur le
texte **copiable tel quel** :

- **`/goal`** — la condition de sortie prouvable. Rappeler la règle non négociable : l'évaluateur
  `/goal` **ne lit que le transcript**, aucun fichier ; chaque tour doit donc FAIRE APPARAÎTRE
  l'output de `organise.ts` (le score, les exit codes), pas seulement écrire `QUALITY_SCORE.md`.
  Si `goal.supported === false` (CC < 2.1.139), dire l'upgrade et piloter avec `/loop` en attendant.
- **`/loop`** — `/loop 30m /assistant` reconverge seul (chaque tour relit l'état persistant, traite
  UN gap, re-scanne). Au bootstrap, copier `templates/loop.md` → `.claude/loop.md` de la cible pour
  que `/loop` sans argument lance le tour de maintenance idempotent.

### Phase 6 — Persister le brief (rendre l'onboarding idempotent)

> **Écriture LLM obligatoire, pas automatique.** `onboarding.ts` ne fait que LIRE `PROJECT_BRIEF.md`
> (pour dériver le mode). C'est au LLM de l'écrire en fin d'interview — sinon chaque `/assistant`
> suivant re-déclenche l'interview sur un projet déjà cadré. Traiter cette écriture comme une étape
> non négociable de l'interview, au même titre que poser les questions.

Écrire `PROJECT_BRIEF.md` à la racine de la cible **à partir du gabarit `templates/memory/PROJECT_BRIEF.template.md`**
(6 cases obligatoires : Raison d'être · Définition de « fini » · Hors-scope · Décisions figées +
contraintes · Critères d'acceptation vérifiables · Boucles `/goal`·/loop) — un artefact **structuré et
diff-able**, jamais de la prose libre. Sa présence fait basculer les `/assistant` suivants en
**health-check** : on ne ré-interroge pas un projet déjà cadré.

> **Constitution always-on.** Le `PROJECT_BRIEF.md` est de la mémoire (recall *on-demand*) ; il peut
> sortir du contexte entre deux tours. Pour qu'une non-négociable ne soit jamais oubliée, passer les
> **décisions figées (case 4)** et le **hors-scope (case 3)** confirmés à `generate-config` via les
> options JSON (`fixedDecisions`, `outOfScope`) : elles sont alors injectées dans la section
> **`## Non-négociables`** du `CLAUDE.md` généré — chargé **chaque tour**. Les deux coexistent : le
> BRIEF porte le détail, le CLAUDE.md le rappel permanent condensé. _(Chemin showcase via
> `vitrine-seed.ts` non couvert pour l'instant — generate-config seulement.)_

## Mode HEALTH-CHECK — le re-run pendant la session

Quand `onboarding.mode === "health-check"` (`/assistant` relancé sur un projet déjà cadré), ne pas
interroger. Faire le **rapport de direction** :

1. **Organisation parfaite ?** Lire `onboarding.installation` : tout outil prescrit est-il bien
   installé ? Lister les `missing` et proposer de les matérialiser. Vérifier les 6 leviers de
   l'Autonomy Card (un `reminder` se dit à voix haute, un `missing` est un gap bloquant).
2. **Direction du projet.** Rappeler la « prochaine étape produit » (DoD lifecycle) + le gap #1 du
   score + les rapports d'auditeur manquants. Une seule action prioritaire à valider, pas une
   todo-list noyante.
3. **Boucles.** Re-présenter `/goal` et `/loop` à jour (ils reflètent l'état courant : % DoD,
   auditeurs restants).
4. **Drift.** `organise.ts` affiche la dérive du score depuis le dernier passage — la commenter
   (progrès réel ou régression).

Verdict d'abord (OK / gaps), puis le détail. Jamais « fini » sans preuve directe (navigateur/curl).
