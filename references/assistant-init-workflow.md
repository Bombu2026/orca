# Assistant INIT Workflow

INIT équipe un nouveau projet avec Claude Code : skills, agents, hooks, mémoire, boucle autonome et gates.

## Phase 1 — Project Understanding (= l'Onboarding Interview)

**Porte d'entrée obligatoire : l'Onboarding Interview** (`references/assistant-onboarding-interview.md`).
Ne demande pas "web ou CLI ?" en premier — `organise.ts` émet `onboarding.questions[]` (gap-driven, via
`AskUserQuestion` batché) ; les poser AVANT toute écriture, en partant du brief de l'opérateur. Mène la
conversation sur :

1. Projet : produit, utilisateurs, domaine, fonctionnalités, complexité.
2. Technique : stack préférée, intégrations, contraintes, solo/team.
3. Ambition : MVP, prod-grade, existant ou zéro.
4. Détecte `ai-engine: claude-cli` si le projet utilise `claude -p` comme moteur.

Synthétise un `PROJECT_PROFILE` (les 7 types réels de `detect-project.ts` — pas de type fantôme) :

```text
Project:
Domain:
Type: web-fullstack | website-showcase | bot-agent | cli-tool | api-backend | design-only | unknown
AI Engine: none | claude-cli | other
Stack:
Key domains:
Complexity: simple | medium | complex | very-complex
Integrations:
Workflow: solo | team | full-cicd
```

**En fin de phase (non négociable)** : écrire `PROJECT_BRIEF.md` à la racine de la cible (brief + réponses
+ `/goal`·/loop retenus). Sa présence bascule les `/assistant` suivants en health-check (idempotence).
Si le projet ressemble à un site vitrine (`website-showcase`), proposer le flux `/site`.

## Phase 2 — Intelligence Gathering

1. La library locale est résolue automatiquement par les scripts via la variable
   d'env `SKILL_LIBRARY_DIR` (sinon `~/Desktop/skill/library`). Inspecter au besoin :
   `ls $SKILL_LIBRARY_DIR/skills/ | wc -l`.
2. Ranking lexical :
   ```bash
   bun scripts/strategy-select.ts "<domain stack integrations ambition>" --type=<project-type> --write=<project_path>
   ```
3. **Matérialiser** l'équipe complète (skills + subagents) dans le projet —
   c'est cette étape qui transforme le ranking en code installé :
   ```bash
   bun scripts/install-toolkit.ts <project_path> \
     --keywords="<domain stack integrations>" --type=<project-type> \
     --skills=top:8 --agents=top:6
   # add --dry-run first if you want to see picks without writing
   ```
   Le script copie les `SKILL.md` (+ leurs `references/` éventuels) depuis la
   library vers `<project>/.claude/skills/<name>/`, et les subagents
   individuels vers `<project>/.claude/agents/<name>.md`. Il filtre
   automatiquement les agents language-specific (python/java/flutter/…) si le
   nom ne matche pas le projet. Il force `model: claude-opus-4-8` partout.
   Le receipt est écrit dans `<project>/.claude/TOOLKIT_INSTALLED.json`.
4. Lire les références pertinentes : internals, best practices, agents, hooks, memory.
5. Rappeler l'expérience passée :
   ```bash
   bun scripts/recall.ts "<domain-keywords>"
   ```
6. Compiler le `TOOLKIT_PLAN` final : skills/agents installés + ceux qui doivent
   être créés sur-mesure pour le domaine, hooks, sections CLAUDE.md.

## Phase 3 — Skills

Créer `.claude/skills/{skill-name}/SKILL.md`.

Règles :

- Frontmatter `name`, `description`, `allowed-tools`.
- Description spécifique au domaine : c'est le trigger principal.
- Phases avec entry/exit criteria.
- Exemples concrets du projet.
- `SKILL.md` court ; détails dans `references/`.

## Phase 4 — Agents

Créer `.claude/agents/{agent}.md`.

Règles :

- `model: claude-opus-4-8` pour tous les agents Claude générés.
- Ownership borné, outils minimum, deliverables explicites.
- Topologie : simple = peu/pas d'agents ; medium = Planner/Executor ; complex = spécialistes + Reviewer ; very-complex = wave GSD.

## Phase 5 — Hooks & Commands

Toujours installer :

- Security hooks : standard ou strict si `bypassPermissions`.
- Quality hooks : format/typecheck/console checks.
- Cost safety : bulk API calls et agent spawns.
- DX : notifications, git push reminder, session digest.
- Commands canoniques : `/commit`, `/fix`, `/test`, `/refactor`, `/pr`, `/explain`, `/review`, `/epct`, `/ship-check`, `/ship100`.
- Pre-prod QA agents : `qa-hunter`, `slop-janitor`, `architect-auditor`, `e2e-scripter`.
- `.claude/skill-rules.json` pour l'auto-invocation par mots-clés.

## Phase 5.5 — Memory Seed

Toujours créer :

- `MEMORY.md`
- `user_role.md`
- `project_purpose.md`
- `project_stack.md`
- `feedback_conventions.md`
- `reference_claude_md.md`
- `progress.md`
- `feature-checklist.md`

Écrire dans `.claude/memory/` et, si possible, dans
`~/.claude/projects/<slug>/memory/`.

Règles : un topic par fichier, frontmatter valide hors `MEMORY.md`, descriptions courtes, pas d'état éphémère.

## Phase 6 — Feature Coverage

Lire `references/claude-code-features-checklist.md` et vérifier les sections pertinentes :

CLAUDE.md, skills, agents, hooks, tools, MCP, memory, permissions, plugins, CI/CD,
workflow, Agent SDK, optimisations, observabilité, sandboxing, checkpointing.

Corriger les gaps avant de sortir.

## Phase 7 — CLAUDE.md + boucle autonome

Créer :

- `.claude/CLAUDE.md` dense, spécifique, actionnable.
- `.claude/loop.md` (tour de boucle idempotent, borné par `loop-controller`) + le hook de recall
  mémoire (`recall-auto`), tous deux matérialisés par `generate-config`.

CLAUDE.md court (< 200 lignes, always-on) ; contenu lourd déporté en `.claude/rules/` + références.

## Phase 8 — Scaffold & Verify

Scaffold si nécessaire, puis vérifier :

```bash
bun scripts/validation-layer.ts all --project=<path>
bun scripts/audit-project.ts <path>
```

Si le projet a des tests, les lancer. Pour un frontend, lancer aussi un check UI pertinent.

Sortie attendue : stack, config créée, skills/agents/hooks, runbooks, checks passés, caveats.
