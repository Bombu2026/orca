# Large Codebase Schema — doctrine baseline d'Assistant

Source canonique : [How Claude Code works in large codebases — best practices and where to start](https://claude.com/blog/how-claude-code-works-in-large-codebases-best-practices-and-where-to-start).

Ce fichier est la **doctrine de référence** que toute invocation d'Assistant
doit appliquer. `/init` la **seed**, `/audit` la **vérifie**, `/live` la
**surveille**. Aucun mode ne peut s'en affranchir : si une dimension manque,
elle entre dans la todo d'init.

---

## Principe directeur

> "Claude Code navigates codebases the way a software engineer would: it
> traverses the file system, reads files, uses grep to find exactly what it
> needs, and follows references across the codebase."

- Pas d'index centralisé, pas de RAG : Claude Code lit le filesystem en local.
- La **qualité de navigation est conditionnée par la légibilité du projet** —
  donc Assistant investit en amont sur la "scaffolding" (CLAUDE.md, skills,
  hooks, plugins, LSP, MCP, subagents) plutôt que d'espérer que Claude devine.
- Layering : on **empile du contexte** en descendant l'arbre, on ne le
  recopie pas.

---

## Les 7 composants du harness Claude Code

À traiter **dans cet ordre** lors d'un `/init` ou d'un `/audit`. Chaque
composant a son moment de chargement, ses pièges, ses commandes de vérif.

### 1. CLAUDE.md hierarchy *(chargé à chaque session)*

- **Racine** : vue d'ensemble (stack, conventions globales, ownership, what/why).
- **Sous-dossiers** : conventions locales (`packages/api/CLAUDE.md`,
  `apps/web/CLAUDE.md`, `infra/CLAUDE.md`). Claude remonte automatiquement,
  donc on **n'initialise jamais qu'à la racine d'un monorepo** — on crée des
  CLAUDE.md scopés à chaque sous-projet pertinent.
- Reste lean : pas de duplication du README, pas de 500 lignes de prose.
- Test/lint/build commands **scopés par sous-dossier** (pour éviter les
  timeouts et la pollution de contexte).
- Revoir tous les **3-6 mois** ou après une release majeure du modèle :
  supprimer les béquilles devenues inutiles.
- Vérification : `bun scripts/audit-project.ts <path>` (section CLAUDE.md
  hierarchy).

### 2. Hooks *(event-triggered)*

- **Stop hooks** : reflect sur la session, proposent un patch CLAUDE.md
  (cas d'usage : capturer les corrections récurrentes).
- **Start hooks** : injectent du contexte spécifique au module touché.
- **Pre/post tool hooks** : appliquent lint/format/typecheck **de manière
  déterministe** — c'est plus fiable que de demander au modèle.
- Vérification : `references/hooks-catalog.md`.

### 3. Skills *(on-demand)*

- Packagent une expertise spécialisée derrière un `description`-trigger
  (doctrine Trail of Bits, cf. `references/best-practices.md`).
- **Path-scoped** : un skill ne doit se déclencher que là où il sert
  (`paths:` dans le frontmatter quand pertinent).
- Progressive disclosure : SKILL.md court → references/*.md détaillées.
- Vérification : `bun scripts/audit-project.ts` (section skills),
  `references/skills-decision-matrix.md`.

### 4. Plugins *(toujours disponibles)*

- Bundle réutilisable : skills + hooks + MCP en un seul package installable
  via marketplace.
- Garantit que **tout nouvel ingénieur a le même contexte** que les anciens.
- Idéal pour distribuer org-wide (entreprise) ou usine-wide (l'opérateur).
- Vérification : présence d'un plugin manifest et d'un marketplace si
  l'équipe > 1 humain.

### 5. Language Server Protocol (LSP) *(toujours disponible)*

- **Navigation symbolique** : Claude distingue deux fonctions homonymes,
  suit les références, filtre avant de lire.
- Indispensable en monorepo polyglotte et en langages compilés.
- À configurer dès l'init côté Claude Code (settings) et côté MCP si besoin.
- Vérification : tester `find references` sur un symbole partagé entre
  deux packages — si Claude lit 12 fichiers au lieu de 2, le LSP n'est pas
  en place.

### 6. MCP Servers *(toujours disponibles)*

- Pont vers les outils internes : docs, ticketing, analytics, base de données,
  recherche structurée.
- Les équipes mûres exposent leur **recherche maison comme un MCP tool**
  plutôt que d'attendre que Claude grep tout le repo.
- Vérification : `claude mcp list` + audit des MCP attachés au projet
  (présence, scope, permissions).

### 7. Subagents *(on invocation)*

- Context window indépendante par subagent → essentiel sur gros repos.
- Pattern d'or : **split read/write**.
  - Subagent read-only : explore, mappe le sous-système, retourne un brief.
  - Parent : reçoit le brief et orchestre les éditions cohérentes.
- N'utiliser des subagents qu'en cas de tâche **complexe et parallélisable**
  (CLAUDE.md global de l'opérateur — cf. mémoire user).
- Toujours **Opus** pour les subagents utilisateur, Sonnet pour les recurring.
- Vérification : `references/agents-patterns.md`.

---

## Patterns de configuration grande codebase

À appliquer systématiquement en `/init` ; à scorer en `/audit`.

1. **Hiérarchie CLAUDE.md** : root → sous-dossiers, additif.
2. **Init en sous-dossier, pas à la racine du monorepo** : Claude remonte
   tout seul.
3. **Commandes test/lint scopées par sous-dossier** : évite timeouts.
4. **`.claudeignore` + `permissions.deny`** dans `.claude/settings.json` pour
   exclure generated/vendored.
5. **Codebase map** : un `MAP.md` ou `references/repo-map.md` si l'arbo
   n'est pas évidente (microservices, packages atypiques, conventions héritées).
6. **LSP** : déployer pour chaque langage présent.
7. **DRI / agent manager** : un humain responsable de la config CC pour
   l'équipe, propriétaire des CLAUDE.md, des skills, des plugins, et des
   reviews "AI-generated".

---

## Starting Point Checklist (à appliquer en `/init`)

1. CLAUDE.md hierarchy (racine + sous-dossiers pertinents).
2. LSP integrations pour chaque langage.
3. `.claudeignore` pour generated/third-party.
4. 1-2 skills initiaux pour les workflows fréquents.
5. DRI organisationnel nommé (même si c'est juste l'opérateur).
6. Plugins fondamentaux avant rollout large.
7. Process de code review explicite pour le code "AI-generated".
8. Démarrer **scope restreint + skills approuvés**, élargir avec confiance.

---

## Grille de scoring `/audit` — Large Codebase Schema

Ajouter ces 7 dimensions au scoring existant si elles n'y figurent pas déjà
(complémentaires aux 18 sections de `references/assistant-audit-workflow.md`) :

| # | Dimension | Pondération | Signal "ok" | Signal "fail" |
|---|---|---|---|---|
| L1 | CLAUDE.md hierarchy | 2.0 | racine + ≥1 sous-dossier | un seul CLAUDE.md racine pour monorepo |
| L2 | Hooks event-driven | 1.5 | hooks lint/format/typecheck actifs | aucun hook |
| L3 | Skills path-scoped | 1.5 | skills avec `paths:` quand pertinent | tous globaux |
| L4 | Plugins/bundle | 1.0 | plugin local ou marketplace | rien de réutilisable |
| L5 | LSP integration | 2.0 | LSP listé dans settings, fonctionnel | absent |
| L6 | MCP coverage | 1.5 | MCP attachés au projet et scopés | aucun MCP |
| L7 | Subagent split read/write | 1.5 | agents séparés explore vs edit | un seul agent fait tout |

Score < 7/10 sur l'un de ces 7 axes → ajoute un Coach Action `large-codebase-schema/<dimension>`.

---

## Verbatim baseline (à coller dans la sortie utilisateur quand pertinent)

> "La qualité de navigation de Claude Code est façonnée par la qualité du
> setup. On layer du contexte via CLAUDE.md + skills + hooks + LSP + MCP +
> subagents, et on traite le repo comme un IDE pour Claude, pas comme un
> document à RAG."

---

## Quand ce schéma s'applique

- **À chaque invocation d'Assistant**, le skill lit cette doctrine en
  baseline et vérifie quel mode demande quelle action :
  - `/init` → seed les 7 composants + la checklist.
  - `/audit` → score les 7 dimensions L1-L7 + applique les fixes.
  - `/live` → surveille la dérive (hooks désactivés, CLAUDE.md gonflé,
    MCP cassé) et émet des actions correctives.
  - `/ship100` → bloque le ship si L1, L2 ou L5 sont en échec critique.
  - `/site` → reprend a minima L1 (CLAUDE.md root) et L3 (skill showcase
    path-scopé).
