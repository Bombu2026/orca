# ORCA AUDIT Workflow

AUDIT vérifie un projet existant, score l'exploitation Claude Code, applique les fixes acceptés et collecte le feedback.

## Phase 1 — Deep Scan

1. Version Claude Code :
   - `claude --version`
   - si `< v2.1.90`, signaler risque critique de deny rules.
2. Projet :
   - `bun scripts/detect-project.ts <path>`
   - package scripts, stack, framework, intégrations.
3. Config IA :
   - `.claude/CLAUDE.md`
   - `.claude/settings.local.json`
   - `.claude/agents/`
   - `.claude/skills/`
   - `.claude/loop.md`
4. Codebase :
   - tests, strictness, CI/CD, git activity, deployment.
5. Token hygiene :
   ```bash
   bun scripts/token-audit.ts <path>
   ```
6. Mémoire :
   ```bash
   bun scripts/recall.ts --project <slug> --limit 50 "<query>"
   ```
   Lire aussi `corrections-queue.md` si présent.

Pour ORCA ou tooling CC, lancer `bun scripts/self-check.ts`.

## Phase 2 — Feature Audit

Lire `references/claude-code-features-checklist.md`.

Scorer chaque section sur 10 :

- CC version
- CLAUDE.md
- Response discipline
- Skills
- Agents
- Hooks
- Tools
- MCP
- Memory
- Permissions
- Plugins
- CI/CD
- Workflow
- Agent SDK
- Optimisations
- Observabilité
- Sandboxing
- Checkpointing
- Token hygiene

Sections critiques : CC version, CLAUDE.md, skills, hooks, permissions, token hygiene.

Comparer les claims de docs au code réel. Une instruction stale vaut finding, même si le fichier existe.

## Phase 3 — Report & Fix

Rapport :

- Scores BEFORE.
- Findings par priorité : CRITICAL, HIGH, MEDIUM, LOW.
- Actions concrètes.
- Patterns corpus : indiquer combien de repos confirment chaque pattern.

Fixes possibles :

- Skills manquantes.
- CLAUDE.md stale.
- Hooks manquants ou dangereux.
- Agents mal bornés.
- Boucle autonome (`loop.md`) ou recall mémoire absents.
- Mémoire absente, stale ou dupliquée.

Après corrections :

```bash
bun scripts/validation-layer.ts all --project=<path>
bun scripts/audit-project.ts <path>
```

Afficher BEFORE/AFTER. Si Token Hygiene < 5/10, proposer TOKEN-DOCTOR.

## Phase 4 — Feedback Collection

Toujours terminer par feedback :

1. Demander score 1-5 :
   - 1 inutile
   - 2 faible
   - 3 OK
   - 4 bien
   - 5 excellent
2. Persister :
   ```bash
   bun scripts/save-audit-feedback.ts "<project_path>" <score> "<note>"
   ```
3. Si score <= 2, demander quelle dimension ou reco était mal calibrée.

La boucle de feedback consolide ces retours et ajuste les scores/règles.
