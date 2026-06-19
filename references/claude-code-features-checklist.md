# Claude Code — Checklist complète des fonctionnalités

Chaque fonctionnalité de Claude Code qui peut être exploitée pour un projet.
Pour chaque item : est-ce utilisé ? Pourrait-il l'être ? Comment ?

---

## 0. CC Version (Sécurité — prérequis)

| Feature | Description | Check |
|---------|-------------|-------|
| Version minimale | CC >= v2.1.90 requis (CVE: deny rules ignorées au-delà de 50 sub-commands) | `claude --version` >= 2.1.90 ? |
| Version courante | Dernière stable : **v2.1.152 (2026-05-27)**. v2.1.152 : `/code-review --fix` (apply findings to tree, `/simplify` → alias), `disallowed-tools` frontmatter skill/agent, `/reload-skills` command, `SessionStart` hook → `reloadSkills: true` + `sessionTitle`, **`MessageDisplay` hook** (transform/hide assistant text), `--fallback-model` switch auto (au lieu d'échec), auto mode sans opt-in, vim `/` = reverse history. Historique : v2.1.150 : infra interne. v2.1.149 : `/usage` per-category, `/diff` keyboard scroll, GFM checkboxes, fix `find` crash macOS vnode + PowerShell cd security. v2.1.148 : fix Bash exit 127. v2.1.147 : pinned bg sessions, /code-review --comment. v2.1.146 : fix CLAUDE_CODE_SUBAGENT_MODEL. v2.1.145 : security. v2.1.142 : Fast mode Opus 4.8. v2.1.139 : Agent view, /goal. | Version à jour ? `npm i -g @anthropic-ai/claude-code@latest` si outdated. |
| Scoring | 10/10 = latest stable. 5/10 = outdated sans CVE connue. 0/10 = < v2.1.90 (critique). Poids ×2. | — |

---

## 1. CLAUDE.md (System Prompt du projet)

| Feature | Description | Check |
|---------|-------------|-------|
| `.claude/CLAUDE.md` | Instructions projet dans le system prompt | Existe ? Complet ? Dense ? |
| Hiérarchie | policy > user > project > local | Le projet override-t-il des préfs globales ? |
| `.claude/local/CLAUDE.md` | Instructions locales (pas commit) | Utile pour dev-specific ? |
| Sections structurées | Overview, Commands, Architecture, Conventions | Toutes les sections critiques présentes ? |
| Domain knowledge | Connaissance métier dans CLAUDE.md | Le domaine du projet est-il documenté ? |
| Densité | Chaque mot doit compter (lu chaque tour) | Pas de fluff, pas de duplication README ? |
| Build command | Commande de build/check dans la section Commands | CC peut-il vérifier son propre output ? (`build`, `tsc --noEmit`, `xcodebuild`) |
| Custom rules override | Les règles utilisateur overrident les built-ins (ne s'empilent plus). Attention aux conflits. (v2.1.110) | Règles vérifiées post-upgrade ? |
| `.claude/rules/*.md` | Règles modulaires par sujet (testing.md, api.md, db.md) | Conventions split en fichiers atomiques ? |
| `REVIEW.md` | Fichier review-specific séparé de CLAUDE.md (ce qu'il faut signaler, ce qu'il faut ignorer) | Présent à la racine ? Règles de review documentées ? |
| `max 2 MCP` rule | Chaque MCP consomme 5-10% du contexte pour tool definitions — limiter à 2 MCP max, préférer CLI (`gh`, `neon`, `vercel`) | Règle documentée dans CLAUDE.md ? MCP count vérifié ? |

## 2. Skills (Unified Model — Skills 2.0)

| Feature | Description | Check |
|---------|-------------|-------|
| Skills globaux | `~/.claude/skills/` (disponibles partout) | gstack installé ? Autres ? |
| Skills projet | `.claude/skills/` (spécifiques au projet) | Skills custom pour le domaine ? |
| SKILL.md frontmatter | 15 champs disponibles: `name`, `description`, `allowed-tools`, `model`, `effort` (xhigh inclus), `when_to_use`, `argument-hint`, `agent`, `hooks`, `paths`, `shell`, `user-invocable`, `context`, `background`, `${CLAUDE_SKILL_DIR}` (variable path du skill) | Description = trigger mots du domaine ? Champs avancés exploités ? |
| Progressive disclosure | SKILL.md < 500 lignes + references/ | Skills pas trop longs ? references/ utilisé ? |
| allowed-tools | Restreindre aux outils nécessaires | Chaque skill a le minimum d'outils ? |
| context: fork | Contexte isolé pour skills lourds | Skills lourds en fork ? |
| Skills effort override | `effort` field in frontmatter override le niveau par skill | Effort adapté par skill ? (v2.1.105+) |
| Skills model override | `model` field in frontmatter override le modèle par skill | Modèle adapté par skill ? (v2.1.105+) |
| user-invocable: false | Cache le skill du menu `/`, pour knowledge background auto-loadé | Skills background cachés du menu ? (v2.1.105+) |
| `skillOverrides` setting | Contrôle la visibilité des skills par projet : `off` (caché modèle + menu), `user-invocable-only` (caché modèle seulement), `name-only` (description collapsée). Fonctionne depuis v2.1.129 (était buggé avant). | Skills bruyants ou dangereux désactivés via `skillOverrides` ? Skills background supprimés du menu `/` via `off` ? |
| Composition | Skills qui référencent d'autres skills | Skills composables entre eux ? |
| Plugins skills | Skills via plugins (Anthropic, community) | Plugins pertinents activés ? |
| Model-invoked | CC auto-charge le skill quand le contexte match | Skills critiques model-invoked (pas que /slash) ? |
| Subagent skills | Skills qui spawnnent des subagents isolés | Skills complexes avec orchestration agent ? |
| Cross-platform | SKILL.md compatible 7+ plateformes (Cursor, Codex CLI, etc.) | Skills portables si pertinent ? |
| /powerup | Tutoriel interactif built-in pour découvrir les features CC | Connu de l'équipe ? (v2.1.90) |
| /team-onboarding | Génère un guide d'onboarding depuis la config CC locale (CLAUDE.md, skills, hooks, agents) | Utilisé pour onboarder les nouveaux devs ? (v2.1.101) |
| Installation standard | `npx skills add <owner/repo>` | Installation documentée pour l'équipe ? |
| /skillify | Capture un workflow de session et génère un SKILL.md réutilisable (built-in) | Connu de l'équipe pour créer des skills à partir de sessions ? |
| /insights | Génère des rules depuis les pain points de session + rapport HTML | Utilisé pour améliorer les conventions ? |
| /less-permission-prompts | Skill officielle: scanne transcripts et propose un allowlist automatique | Utilisé pour réduire la fatigue de permissions ? (v2.1.111) |
| Skill budget | Skills consomment ~2% du context window | Skills optimisées en taille ? |

## 3. Agents & Subagents

| Feature | Description | Check |
|---------|-------------|-------|
| `.claude/agents/` | Agents custom en MD ou JSON | Agents adaptés à la complexité du projet ? |
| Agent tools | Restreindre les outils par agent | Principe de moindre privilège respecté ? |
| Agent skills | Assigner des skills spécifiques aux agents | Agents ont les bons skills ? |
| Agent model | Choisir le modèle par agent | Opus pour architecture, adapté pour le reste ? |
| CLAUDE_CODE_SUBAGENT_MODEL | Env var pour forcer le modèle de tous les subagents. **Fix v2.1.146** : était non transmis aux process enfants en multi-agents — mettre à jour CC si cette env var est utilisée. | Utilisé pour sessions mixed-model ? |
| Agent effort | Niveau d'effort par agent (low/medium/high/xhigh/max) | xhigh disponible (v2.1.111), max pour agents critiques ? |
| Model deprecation | `claude-sonnet-4-20250514` et `claude-opus-4-20250514` deprecated 15 juin 2026. Utiliser versions explicites (`claude-opus-4-8`, `claude-sonnet-4-6`) dans AGENTS.md | Modèles pinned sur versions courantes ? |
| Agent memory | Scope: user / project / local | Agents avec mémoire persistent quand utile ? |
| Agent isolation | worktree pour branches parallèles | Agents parallèles sur branches séparées ? |
| Agent maxTurns | Limiter les tours par agent | Pas d'agents qui tournent indéfiniment ? |
| Agent permissionMode | Mode permission par agent | acceptEdits pour exécuteurs, plan pour planificateurs ? |
| Agent view | `claude agents` — liste toutes les sessions CC (en cours, en attente, terminées) en un seul écran (Research Preview, v2.1.139). Flags : `--add-dir`, `--settings`, `--mcp-config`, `--plugin-dir`, `--permission-mode`, `--model`, `--effort`, `--dangerously-skip-permissions`, `--cwd <path>` (v2.1.141-2.1.143) | Dashboard multi-sessions utilisé ? Sessions scoped par répertoire ? |
| Background sessions | `/bg` ou `←←` pour détacher en background. Préservent : permission mode, `--mcp-config`, `--settings`, `--add-dir`, `--plugin-dir`, `--strict-mcp-config`, `--fallback-model` (v2.1.143). `--bg --dangerously-skip-permissions` persiste across retire/wake (v2.1.143). | Sessions background configurées proprement ? |
| `worktree.bgIsolation: "none"` | Laisse les background sessions éditer le working copy directement sans `EnterWorktree` — pour les repos où les worktrees sont impraticables (v2.1.143) | Repos sans worktree support configurés ? |
| /goal command | Définit une condition de completion ; Claude continue sur plusieurs tours jusqu'à ce qu'elle soit atteinte. Fonctionne en interactive, `-p`, et Remote Control. Overlay live elapsed/turns/tokens (v2.1.139) | Tâches longues lancées avec /goal plutôt que -p manuel ? |
| Built-in Explore | Agent read-only rapide pour recherche | Utilisé pour exploration codebase ? |
| Built-in Plan | Agent read-only pour planification | Utilisé pour architecture ? |
| Agent teams | Plusieurs agents en parallèle | TeamCreate pour tâches indépendantes ? |
| Subagent spawning | Agent tool dans les skills/prompts | Skills qui spawnnent des sous-agents ? |

## 4. Hooks (31 événements)

| Feature | Description | Check |
|---------|-------------|-------|
| **PreToolUse** | Avant exécution d'un outil | Bloque commandes dangereuses ? |
| PreToolUse/Bash | Intercepte commandes shell | --no-verify, rm -rf, DROP TABLE bloqués ? |
| PreToolUse/Write\|Edit | Intercepte modifications fichiers | Config protection ? Secret detection ? |
| **PostToolUse** | Après exécution réussie d'un outil — peut remplacer l'output via `hookSpecificOutput.updatedToolOutput` pour TOUS les outils (v2.1.121) | Quality gates ? Output sanitization ? |
| PostToolUse/Edit | Après modification de fichier | Auto-format ? Typecheck ? |
| **Stop** | Quand Claude finit de répondre | Completeness check ? Console.log check ? |
| Stop (prompt type) | Claude évalue si le travail est complet | Verification des phases ? |
| **SessionStart** | Au démarrage/reprise de session | Chargement contexte projet ? |
| **PreCompact** | Avant compaction du contexte (`matcher`: `manual`\|`auto`, exit 2 = block) | Sauvegarde d'état ? Compaction bloquée si critique ? |
| **UserPromptSubmit** | Avant traitement du prompt | Injection de contexte ? |
| **PostToolUseFailure** | Après échec d'un outil | Logging erreurs ? Retry logic ? |
| **PostToolBatch** | Après un batch d'appels d'outils parallèles (v2.1.119+) | Monitoring batch ? Agrégation résultats parallèles ? |
| **SubagentStart/Stop** | Lifecycle des sous-agents | Tracking des agents ? |
| **Notification** | Événements async | Notification macOS quand Claude attend ? |
| **SessionEnd** | Fin de session | Persistance d'état ? Analytics ? |
| **Setup** | Init/maintenance | Vérification environnement ? |
| Async hooks | `async: true` pour non-bloquant | Hooks lourds en async ? |
| Prompt hooks | `type: "prompt"` pour évaluation Claude | Hooks de vérification intelligents ? |
| HTTP hooks | `type: "http"` pour POSTer vers endpoint externe | Policy server ou logging centralisé ? (v2.1.92) |
| Agent hooks | `type: "agent"` sub-agent avec Read/Grep/Glob, 60s timeout | Validation complexe nécessitant du contexte code ? (v2.1.92) |
| Hook timeout | Limiter le temps d'exécution | Timeouts configurés ? |
| Hook `if` conditionnel | Condition de déclenchement (syntax permission rules) | Hooks ciblés par pattern ? (v2.1.85) |
| Hook `args: string[]` exec form | Lance la commande directement sans shell — aucun quoting de `${var}` nécessaire, env vars passées proprement (v2.1.139) | Hooks shell-free pour sécurité et fiabilité ? |
| Hook `continueOnBlock` (PostToolUse) | `true` = renvoie la raison du rejet à Claude et continue le tour au lieu de bloquer (v2.1.139) | PostToolUse blockers réessayés intelligemment ? |
| Hook `terminalSequence` | Champ dans le JSON output du hook pour émettre notifications desktop, window titles, bells — sans accès au terminal contrôlant (v2.1.141) | Hooks qui notifient l'user via desktop notification ? |
| `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` | Nombre max de blocks Stop hook consécutifs avant abandon forcé (défaut 8). Evite les boucles infinies sur Stop hooks bloquants (v2.1.143) | Configuré si Stop hooks récursifs possibles ? |
| Stop/SubagentStop `background_tasks` + `session_crons` | Les hooks Stop et SubagentStop reçoivent maintenant ces champs dans leur JSON input — permet de détecter les tâches background en cours avant la fin de session (v2.1.145) | Hooks Stop adaptés pour attendre les bg tasks ? |
| **PermissionDenied** | Quand auto-mode refuse un outil (peut retry) | Retry logic sur refus auto-mode ? (v2.1.89) |
| **defer** (PreToolUse) | PreToolUse peut déléguer la décision à un process externe | Décision de permission externalisée ? (v2.1.89) |
| **InstructionsLoaded** | Quand CLAUDE.md/rules sont chargés | Hook de post-traitement des instructions ? (v2.1.69) |
| **CwdChanged** | Changement de working directory | Réaction au changement de répertoire ? (v2.1.83) |
| **FileChanged** | Modification de fichier sur disque | Trigger sur modification fichier ? (v2.1.83) |
| **WorktreeCreate/Remove** | Création/suppression de worktrees agent | Tracking des worktrees ? (v2.1.84) |
| **PostCompact** | Après compaction du contexte | Sauvegarde post-compaction ? |
| **Elicitation/ElicitationResult** | Quand CC pose/reçoit une question | Logging des interactions ? |
| **TeammateIdle** | Teammate inactif dans une équipe d'agents | Quality gate sur inactivité ? |
| **TaskCreated/TaskCompleted/TaskStopped** | Lifecycle des tâches dans Agent Teams | Tracking progression équipe ? |
| **ConfigChange** | Changement de config CC en live | Réaction aux changements de settings ? |
| Project-specific hooks | Hooks custom pour le domaine | Validation métier automatique ? |

## 5. Outils & Dispatching

| Feature | Description | Check |
|---------|-------------|-------|
| Glob | Recherche fichiers par pattern | Utilisé au lieu de `find` ? |
| Grep | Recherche contenu par regex | Utilisé au lieu de `grep`/`rg` ? |
| Read | Lecture fichier avec lignes | Utilisé au lieu de `cat`/`head`/`tail` ? |
| Edit | Modification par remplacement exact | Utilisé au lieu de `sed`/`awk` ? |
| Write | Création/réécriture fichier | Utilisé au lieu de `echo >` ? |
| Agent (parallel) | Spawn agents pour tâches parallèles | Recherches parallèles ? |
| Agent (Explore) | Agent spécialisé read-only | Exploration codebase rapide ? |
| TodoWrite | Suivi de progression | Tâches complexes trackées ? |
| Plan mode | Architecture avant implémentation | Utilisé pour changements majeurs ? |
| AskUserQuestion | Questions structurées avec options | Pas de questions ouvertes quand fermées possible ? |
| Monitor | Surveille scripts background, réagit à chaque ligne output | Process longue durée observé en temps réel ? |
| NotebookEdit | Édition cellules Jupyter `.ipynb` | Notebooks édités via CC (pas vim) ? |
| ListMcpResources | Liste les resources d'un serveur MCP | Resources MCP découvertes avant usage ? |
| ReadMcpResource | Lit une resource MCP (URI) | Data MCP lue via outil dédié ? |
| EnterWorktree / ExitWorktree | Gestion worktrees git depuis CC | Worktrees isolés pour agents parallèles ? |
| TaskOutput / TaskStop | Lecture output + arrêt tâches background | Tâches background gérées proprement ? |
| SendMessage | Messagerie inter-agents (agent teams) | Coordination agents via messages (vs hooks) ? |
| ToolSearch | Chargement différé des schemas de tools (auto) | ENABLE_TOOL_SEARCH configuré pour projet avec beaucoup de MCPs ? |

## 6. MCP (Model Context Protocol)

| Feature | Description | Check |
|---------|-------------|-------|
| MCP servers custom | `.claude/settings.local.json` mcpServers | Serveur MCP pour le domaine ? |
| MCP tools | Outils exposés par des serveurs MCP | Outils externes intégrés ? |
| MCP resources | Données accessibles via MCP | Sources de données connectées ? |
| Max result size | Résultat MCP tronqué à 500K chars (v2.1.91) | Serveurs MCP respectent la limite ? |
| MCP hygiene | Max 2 MCP par projet (chaque MCP = 5-10% contexte) | >2 MCP ? CLI équivalent disponible ? (`gh` > github-mcp, Vercel CLI > vercel-mcp) |
| `alwaysLoad` | `alwaysLoad: true` sur un serveur MCP — skip ToolSearch deferral, outils disponibles immédiatement (v2.1.121) | MCPs critiques marqués `alwaysLoad: true` ? |
| Context7 | Docs à jour des librairies | Plugin activé pour les deps du projet ? |
| Playwright | Tests browser automatisés | Plugin activé pour projets web ? |
| Vercel MCP | Interaction avec déploiements Vercel | Connecté pour projets Vercel ? |

## 7. Mémoire & Persistance

| Feature | Description | Check |
|---------|-------------|-------|
| Auto-memory | `~/.claude/projects/{path}/memory/` | Mémoires projet pertinentes ? |
| MEMORY.md | Index des mémoires | Index à jour ? |
| Memory types | user, feedback, project, reference | Bons types utilisés ? |
| Agent memory | Mémoire persistante par agent | Agents avec mémoire quand utile ? |

## 8. Permissions & Sécurité

| Feature | Description | Check |
|---------|-------------|-------|
| **CC version >= v2.1.90** | CVE: deny rules bypass patché en v2.1.90 (exfiltration via CLAUDE.md malveillant) | `claude --version` vérifié ? **Critique** |
| Permission mode | default/plan/acceptEdits/auto | Mode adapté au workflow ? |
| Allow rules | Auto-approuver des patterns safe | Rules pour les commandes fréquentes ? |
| Deny rules | Bloquer des patterns dangereux | Production protégée ? |
| settings.local.json | Config permissions projet | Permissions projet-spécifiques ? |
| .gitignore | Exclusion fichiers sensibles | .env*.local, credentials exclus ? |
| Microsoft Foundry | `CLAUDE_CODE_USE_FOUNDRY=1` + `ANTHROPIC_FOUNDRY_RESOURCE`, auth Entra ID ou API key | Pertinent pour environnement Azure/Microsoft ? |
| `sandbox.network.deniedDomains` | Blacklist réseau fine dans `settings.json` — bloque des domaines spécifiques en sandbox (v2.1.113) | Domaines exfiltration bloqués ? Complète les deny rules outil. |

## 9. Plugins & Channels

| Feature | Description | Check |
|---------|-------------|-------|
| Vercel | Déploiement, functions, storage | Activé si projet Vercel ? |
| Playwright | Tests browser, screenshots | Activé si projet web ? |
| Context7 | Documentation live des librairies | Activé pour avoir les docs à jour ? |
| GitHub | Issues, PRs, Actions | Activé si projet GitHub ? |
| Telegram | Notifications, channel bidirectionnel | Activé si bot Telegram ? |
| Discord | Channel Discord intégré | Activé si serveur Discord ? |
| Slack | Channel Slack intégré | Activé si workspace Slack ? |
| Webhooks | Channels via webhooks custom | Triggers externes configurés ? |
| Security-guidance | Hooks sécurité automatiques | Activé pour projets sensibles ? |
| Computer Use | Contrôle clavier/souris/écran pour testing GUI | Activé pour tests desktop/web complexes ? |
| Plugin marketplaces | Découverte et installation de plugins tiers | Plugins pertinents installés depuis le marketplace ? |
| Plugin authoring | Projet publie un plugin — `.claude-plugin/marketplace.json` requis (schéma: `anthropic.com/claude-code/marketplace.schema.json`). Catégories: `integration`, `tool`, `workflow`. Dépendances dans `plugin-dependencies.md`. (v2.1.117) | Si projet est un plugin CC : manifest `.claude-plugin/` présent ? |

## 10. CI/CD & Déploiement

| Feature | Description | Check |
|---------|-------------|-------|
| vercel.ts | Config Vercel en TypeScript (remplace vercel.json) | Utilisé au lieu de vercel.json ? |
| GitHub Actions | CI/CD automatisé | Workflow configuré ? |
| vercel env pull | Sync env vars | OIDC tokens provisionnés ? |
| Preview deployments | URLs de preview par PR | Configuré ? |

## 11. Workflow & Productivité

| Feature | Description | Check |
|---------|-------------|-------|
| /review | Code review pre-commit (gstack) | Dans le workflow ? |
| /qa | Test + fix automatique (gstack) | Dans le workflow ? |
| /ship | Ship complet avec PR (gstack) | Dans le workflow ? |
| /investigate | Debug root-cause (gstack) | Connu pour les bugs ? |
| /browse | Browser headless pour tests (gstack) | Utilisé pour QA web ? |
| /design-review | Audit visuel (gstack) | Utilisé pour UI ? |
| /ultrareview | Cloud multi-agent code review (5-10 min, $5-20, 3 free runs Pro/Max) | Utilisé pour reviews approfondies ? (v2.1.111) |
| /retro | Rétrospective (gstack) | Pour tracking progrès ? |
| Cron jobs | Tâches planifiées | CronCreate pour maintenance ? |
| Scheduled tasks | `/loop <interval> <prompt>` (session) + Desktop cron via `/schedule` (Cowork) | Tâches récurrentes configurées ? Desktop pour durable, /loop pour adhoc |
| Remote triggers | Invocation externe | RemoteTrigger pour CI ? |
| Remote control | `/remote-control` → URL + QR code, mobile Claude + claude.ai/code (Max plan) | Utilisé pour monitoring distant ? |
| TUI fullscreen | `/tui fullscreen` + `/focus` mode — interface immersive plein écran (v2.1.110) | Connu de l'équipe ? |
| Push notifications (mobile) | `tengu_kairos_push_notifications` flag, nécessite Remote Control actif (v2.1.110) | Activé pour sessions longues ? |
| Voice dictation | `/voice` → push-to-talk (Space), CLI only, langue configurable | Connu de l'équipe ? |
| Code Review (managed) | Review IA multi-agent sur chaque PR — `@claude review` / `@claude review once` (Team/Enterprise) | Activé pour le repo ? (v2.1.104) |
| /rewind | Checkpoints historiques + rollback code (ex-ESC ESC) | Connu de l'équipe ? |
| /context | Affiche segment Reserved (auto-compact + output tokens) | Utilisé pour diagnostiquer la pression contexte ? |
| /code-review | Ex-`/simplify` (renommé v2.1.146). Détecte les bugs de correction avec effort configurable (`/code-review high`). Flag `--comment` (v2.1.147) = poste les findings comme inline comments GitHub PR directement depuis le terminal. L'ancien comportement cleanup-and-fix a été supprimé. | `/code-review --comment` utilisé dans le workflow PR ? Effort adapté (default/high) ? |
| Pinned background sessions | `Ctrl+T` dans `claude agents` (v2.1.147) : sessions pinnées survivent à l'idle, se redémarrent auto lors des updates CC, sont évictées en dernier sous pression mémoire | Sessions critiques (watchers, monitors longue durée) pinnées ? |
| /batch | Migrations parallèles via worktrees isolés, N agents, chaque agent teste avant PR — first-party (v2.1.111) | Connu pour migrations/refactors larges ? |
| /usage | Dashboard unifié usage = `/cost` + `/stats` fusionnés (v2.1.118) | Remplace `/cost` et `/stats` ? |
| Vim visual mode | `v` (visual) et `V` (visual-line) dans l'éditeur TUI — selection, operators, feedback visuel (v2.1.118) | Connu des utilisateurs Vim ? |
| `prUrlTemplate` | Setting pour rediriger le badge PR footer vers code-review URL custom (GitLab/Bitbucket/interne) (v2.1.119) | Défini si le projet utilise un code-review non-GitHub ? |
| `--from-pr` multi-plateforme | `claude --from-pr` accepte désormais GitLab MR, Bitbucket PR, GitHub Enterprise (v2.1.119) | Utilisé pour reviewer des PR non-GitHub.com ? |
| `CLAUDE_CODE_HIDE_CWD` | Env var qui masque le cwd dans le logo CC — utile pour screencasts/tutos (v2.1.119) | Activé dans les demos/captures ? |
| PowerShell auto-approve | PowerShell tool commands auto-approvables en permission mode, parité avec Bash (v2.1.119) | Projets Windows: PowerShell rules définies dans `permissions.allow` ? |
| Status line `effort` + `thinking` | `effort.level` et `thinking.enabled` injectés dans le stdin JSON du status line (v2.1.119) | Status line custom surface l'effort courant ? |
| OTel `tool_use_id` + `tool_input_size_bytes` | Events `tool_result` / `tool_decision` enrichis pour corrélation decision→result et détection payloads géants (v2.1.119) | Dashboard OTel exploite ces champs ? |
| `claude_code.skill_activated` + `invocation_trigger` | Event OTel émis à chaque activation de skill. `invocation_trigger` = `user-slash` (via `/skill`), `claude-proactive` (CC auto-invoque), `nested-skill` (skill dans skill). Permet de distinguer usage actif vs passif dans les dashboards. (v2.1.128) | Dashboard OTel track les 3 modes d'invocation ? Un agent de maintenance peut détecter si skill invoquée proactivement ? |
| `CLAUDE_EFFORT` env var skills | Skills peuvent lire `CLAUDE_EFFORT` (injected in env) pour adapter leur comportement selon l'effort courant (`low`/`normal`/`high`/`xhigh`). Pattern effort-adaptatif. (v2.1.127) | Skills lourdes lisent `CLAUDE_EFFORT` et skippent les étapes optionnelles en mode `low` ? |
| Skills pre-compaction fix | Skills invoquées avant auto-compaction ne re-firent plus sur le prochain user message (v2.1.119) | Bug connu : si observé avant, upgrade requis. |
| `/config` persistence | `/config` persiste theme, editor, verbose dans `~/.claude/settings.json` avec cascade project > local > policy > user (v2.1.119) | Workflow onboarding : `/config` documenté pour les nouveaux arrivants ? |
| `--print` + agent `tools:` | `claude --print --agent <name>` honore désormais `tools:` et `disallowedTools:` du frontmatter agent (v2.1.119) | Pipelines CI avec `claude -p --agent <name>` vérifiés après upgrade ? |
| `--agent` + `permissionMode` | `claude --agent <name>` applique le `permissionMode` défini dans la définition agent (v2.1.119) | Agents executor/planner ont `permissionMode: acceptEdits/plan` défini ? |
| MCP parallel startup | MCP servers se connectent en parallèle au démarrage de session (subagent + SDK) — réduit la latence de boot (v2.1.119) | N/A (automatique) — mesurer le gain si beaucoup de MCPs. |
| Plugin git-tag auto-update | Plugins se mettent à jour vers le git tag le plus élevé satisfaisant les contraintes — résolution déterministe (v2.1.119) | `plugin-dependencies.md` définit les contraintes de version pour les plugins critiques ? |
| `PostToolUse` output replacement | `PostToolUse` peut désormais remplacer le résultat d'un outil via `hookSpecificOutput.updatedToolOutput` pour TOUS les outils (était MCP-only). Permet de sanitiser/enrichir l'output avant que Claude le voie. (v2.1.121) | Hooks de post-processing sur Edit/Bash implémentés ? |
| `alwaysLoad` MCP | `alwaysLoad: true` sur un serveur MCP — ses tools skipent le ToolSearch différé et sont toujours disponibles dès la première invocation. (v2.1.121) | MCPs critiques (ex: Playwright) configurés avec `alwaysLoad: true` ? |
| `claude plugin prune` | Supprime les dépendances plugin orphelines ; `plugin uninstall --prune` cascade. (v2.1.121) | Lancé après désinstallation de plugins ? |
| `CLAUDE_CODE_FORK_SUBAGENT=1` | Force le mode fork pour les subagents dans les sessions non-interactives (`claude -p`). (v2.1.121) | Pipelines CI avec subagents : variable configurée si besoin d'isolation ? |
| Paste PR URL in `/resume` | Coller une URL de PR dans la recherche `/resume` retrouve la session qui a créé ce PR (GitHub, GitLab, Bitbucket, GitHub Enterprise). (v2.1.122) | Connu de l'équipe pour reprendre une session PR ? |
| `ANTHROPIC_BEDROCK_SERVICE_TIER` | Env var pour sélectionner le tier Bedrock (`default`, `flex`, `priority`) — header `X-Amzn-Bedrock-Service-Tier`. (v2.1.122) | Projets Bedrock : tier configuré selon la criticité des workloads ? |
| `claude project purge` | Efface tout l'état CC d'un projet (transcripts, tâches, historique fichiers, entrée config). Options : `--dry-run`, `-y`, `-i`, `--all`. (v2.1.126) | Connu pour nettoyer des projets abandonnés sans résidu ? |
| Deferred tools + `context: fork` | Bug fix : les deferred tools (WebSearch, WebFetch…) sont maintenant disponibles aux skills en `context: fork` dès le premier tour. (v2.1.126) | Skills en `context: fork` avec WebSearch/WebFetch testées après upgrade ? |
| `claude auth login` pasted code | `claude auth login` accepte désormais le code OAuth collé dans le terminal si le callback localhost est inaccessible (WSL2, SSH, containers). (v2.1.126) | Doc onboarding mise à jour pour les devs en WSL2/SSH ? |
| `--plugin-url <url>` | Charge un plugin `.zip` depuis une URL pour la session courante (sans installation permanente). (v2.1.129) | Plugins expérimentaux testables sans installation globale ? |
| Plugin manifest `experimental` | `themes` et `monitors` doivent être déclarés sous `"experimental": { ... }` dans le manifest. Les déclarations top-level fonctionnent encore mais `claude plugin validate` avertit. (v2.1.129) | Templates de plugins mis à jour ? |
| Prompt cache 1h TTL fix | Bug fix : la TTL de 1h (`ENABLE_PROMPT_CACHING_1H`) était silencieusement rétrogradée à 5 min dans certains cas — corrigé en v2.1.129. La stratégie long-context est maintenant fiable. (v2.1.129) | Après upgrade, vérifier que les sessions longues bénéficient du cache 1h ? |
| `OTEL_*` isolation subprocesses | `OTEL_*` env vars ne sont plus héritées par les subprocesses (Bash, hooks, MCP, LSP). Les apps OTEL-instrumentées lancées via Bash ne pickent plus le endpoint OTLP du CLI. (v2.1.129) | Pipelines de monitoring : reconfiguré `OTEL_*` explicitement dans les hooks si besoin ? |
| `EnterWorktree` HEAD fix | `EnterWorktree` crée la nouvelle branche depuis le HEAD local (pas `origin/<default>`) — les commits non-pushés ne sont plus perdus. (v2.1.129) | Agents avec `isolation: worktree` testés sur branches avec commits non-pushés ? |
| `/context` token waste fix | Bug fix : `/context` ne dumpe plus sa visualisation ASCII dans la conversation (~1.6k tokens par appel gaspillés — maintenant affiché sans pollution). (v2.1.129) | N/A (automatique) — si TOKEN-DOCTOR détectait des pics à chaque `/context`, c'est résolu. |
| Gateway model discovery opt-in | `/v1/models` gateway discovery est maintenant opt-in via `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1` (était automatique en 2.1.126-128). (v2.1.129) | Déploiements Bedrock/Vertex/Foundry : variable configurée si picker modèle requis ? |
| MCP `workspace` réservé | `workspace` est maintenant un nom réservé pour les serveurs MCP — un serveur nommé `workspace` est skippé avec un warning. (v2.1.128) | Templates MCP / `.mcp.json` : renommer les serveurs nommés `workspace` ? |
| `CLAUDE_CODE_SESSION_ID` dans Bash | La variable `CLAUDE_CODE_SESSION_ID` est maintenant injectée dans le subprocess Bash, aligné avec le `session_id` passé aux hooks. Utile pour corrélation logs/traces. (v2.1.132) | Scripts Bash qui ont besoin du session ID pour logging ? Hooks déjà en reçoivent un via `session_id`. |
| `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1` | Désactive le rendu fullscreen alternate-screen et garde la conversation dans le scrollback natif du terminal. Utile pour capture/tmux/IDE avec terminal embedded. (v2.1.132) | Doc onboarding pour dev en tmux ou IDE sans alternate-screen support ? |
| SIGINT graceful shutdown fix | `kill -INT` (bouton stop IDE, Ctrl+C externe) lance maintenant la shutdown gracieuse — modes terminaux restaurés + hint `--resume` affiché. (v2.1.132) | N/A (automatique) — les pipelines CI qui tuwaient via SIGINT ne laissent plus le terminal dans un état corrompu. |
| Bedrock/Vertex 400 + `ENABLE_PROMPT_CACHING_1H` | Fix : Bedrock et Vertex renvoyaient une erreur 400 quand `ENABLE_PROMPT_CACHING_1H` était actif — maintenant corrigé. La stratégie 1h-cache est fiable sur tous les providers. (v2.1.132) | Projets Bedrock/Vertex : activer `ENABLE_PROMPT_CACHING_1H` maintenant sécurisé ? |
| MCP stdio unbounded memory fix | Bug fix : un serveur MCP stdio qui écrit des données non-protocole sur stdout causait une croissance mémoire illimitée (10GB+ RSS observé). Maintenant drainé proprement. (v2.1.132) | Serveurs MCP stdio locaux : vérifier qu'ils n'écrivent pas sur stdout hors protocol JSON-RPC ? |
| `--permission-mode` plan-mode resume fix | Bug fix : `--permission-mode` était ignoré lors du `--resume` d'une session plan-mode avec `-p --continue`. Plan mode non ré-appliqué après `ExitPlanMode` dans la même session. (v2.1.132) | Agents avec plan-mode + bypass permissions : tester après upgrade. |

## 12. Agent SDK (v2.1.104+)

| Feature | Description | Check |
|---------|-------------|-------|
| Agent SDK TypeScript V1 | `@anthropic-ai/claude-agent-sdk` — `query()` async gen, custom tools, inline subagents | Utilisé pour pipelines CI/CD, orchestrateurs ? |
| Agent SDK TypeScript V2 | `unstable_v2_*` — session-based `send()/stream()`, multi-turn simplifié. `unstable_v2_createSession()` / `unstable_v2_resumeSession()`. Cleanup via `await using`. | Évalué pour nouvelles apps agent ? |
| Agent SDK Python | `claude-agent-sdk` (ex `claude-code-sdk-python`, renommé 2026-05) — `query()` one-shot + `ClaudeSDKClient` persistent sessions | Utilisé pour pipelines Python ? Import mis à jour post-rename ? |
| Memory Stores (public beta) | Mémoire persistante cross-sessions via primitives `memstore_` / `mem_` / `memver_`. Montée FUSE `/mnt/memory/` pour accès fichier. Intégré dans `anthropics/skills`. | Évalué pour remplacer les sessions-log CC ? Activé pour des agents planifiés (scheduled) ? |
| SDK `outputFormat` | JSON schema pour structured outputs — `outputFormat: { type: "json", schema: zodSchema }` — extrait des données sans parsing ad-hoc | Utilisé pour pipelines d'extraction structurée ? |
| SDK `thinking` + `effort` | `thinking: { enabled: true }` + `effort: "xhigh"` — active le raisonnement étendu dans les pipelines programmatiques | Activé pour les tâches d'analyse complexe automatisées ? |
| SDK `maxBudgetUsd` | Cap de coût par run — protège contre boucles infinies en production | Défini sur tous les agents autonomes ? |
| SDK `settingSources` | Contrôle ce que CC charge (`global`, `project`, `local`) — **breaking change v0.1.0** : rien chargé par défaut, `systemPrompt` et `settingSources` requis explicitement | Pipelines migrés post-breaking-change ? |
| SDK cost-safety hooks | `PreToolUse` guards pour bulk API calls >10 et spawns agents >5 — requis si `claude -p` en CI | Hooks de garde sur les projets avec budget IA ? |
| Agent teams | Expérimental: Team Lead + Teammates (1M ctx chacun), task list partagée, mailbox P2P | Activé pour tâches parallèles (3-5 teammates) ? |
| Ultraplan | Deep planning via CCR: multi-agent parallèle (3 axes + critique), 10-30min, `/ultraplan` ou `/plan`. Web review editor, execute local ou cloud. Check: `CC.ultraplan` | Utilisé pour refactors/migrations complexes ? |
| Managed Agents (Platform) | Infrastructure managée Anthropic pour agents autonomes — agents, sessions, environments, `agent_toolset_20260401`, YAML definitions, ant CLI | Projet déploie des agents en production ? Managed Agents évalué ? |

## 13. Optimisations Avancées

| Feature | Description | Check |
|---------|-------------|-------|
| Prompt cache | Contenu statique cache entre les tours | CLAUDE.md optimisé pour le cache ? |
| Fast Mode | Opus 4.6 à 2.5x vitesse, toggle `/fast`, persiste entre sessions ($30/$150 MTok) | Activé pour sessions interactives rapides ? (v2.1.111) |
| `ENABLE_PROMPT_CACHING_1H` | TTL 1h au lieu de 5min — jusqu'à 10x moins cher sur sessions longues. `ENABLE_PROMPT_CACHING_1H_BEDROCK` deprecated → utiliser la var unifiée. Combiner avec PreCompact hook pour maximiser les hits cache (v2.1.108) | Activé pour projets à sessions longues ? |
| `FORCE_PROMPT_CACHING_5M` | Force TTL 5min même quand 1h dispo — debug cache (v2.1.108) | Utile pour diagnostiquer ? |
| `/recap` | Résumé de contexte au retour sur une session (`CLAUDE_CODE_ENABLE_AWAY_SUMMARY`) | Activé via /config pour sessions interrompues ? (v2.1.108) |
| Tool result budget | Résultats > max persistés sur disque | Pas de résultats énormes inline ? |
| Context compaction | /compact pour libérer du contexte | Utilisé dans les sessions longues ? |
| Fresh context per agent | Chaque agent a son propre contexte | Pas de context rot ? |
| Parallel tool calls | Appels outils indépendants en parallèle | Maximisé ? |
| Output styles | Formatage de sortie personnalisé | Style adapté au projet ? |

## 14. Observabilité & Monitoring

Source: MCP registry review 2026-04-27 — Sentry MCP (relevance 8/10)

| Feature | Description | Check |
|---------|-------------|-------|
| Error tracking | Sentry, Datadog, BugSnag ou équivalent configuré | Erreurs capturées en prod ? |
| Source maps | Source maps frontend uploadées vers l'outil de tracking | Stack traces lisibles ? |
| Alerting | Alertes sur erreurs critiques (taux, seuil, nouveauté) | SLA erreurs défini ? |
| Release health | Suivi crash rate / sessions par déploiement | Release health dashboard actif ? |
| Sentry MCP | `@sentry/mcp` — accès erreurs, traces, stack traces depuis CC (MCP registry Anthropic, 22 serveurs) | Invoquer pendant AUDIT si projet Sentry pour vérifier erreurs non traitées ? |
| Chrome DevTools MCP (officiel) | MCP officiel Anthropic pour Chrome DevTools — accès console, réseau, DOM, screenshots directement depuis CC sans plugin tiers. Score de pertinence 9/10. | Configuré pour les projets web frontend qui font du debugging/QA ? |
| Logging structuré | Logs JSON avec correlation ID, niveau, timestamp | Logs exploitables en prod ? |
| Performance monitoring | APM / Core Web Vitals / p99 latency trackés | Perf régression détectée ? |

## 15. Sandboxing (Isolation Sécurité)

Source: CC docs gap analysis (2026-04-27, 35% coverage gap)

| Feature | Description | Check |
|---------|-------------|-------|
| `/sandbox` activation | Isolation filesystem + réseau activée | Environnement de confiance validé ? |
| Filesystem isolation | `sandbox.filesystem.allowedPaths` / `deniedPaths` | Chemins sensibles protégés ? |
| Network isolation | `sandbox.network.allowedDomains` / `deniedDomains` | Réseau restreint aux domaines nécessaires ? |
| `dangerouslyDisableSandbox` | Flag pour désactiver le sandbox (⚠ risk) | Utilisé uniquement quand nécessaire ? |
| `sandbox.failIfUnavailable` | Échec si sandbox non disponible (macOS Seatbelt / Linux bubblewrap) | Configuré pour prod ? |
| `excludedCommands` | Commandes exclues du sandbox (docker, etc.) | Liste minimale ? |
| `@anthropic-ai/sandbox-runtime` | Package npm pour runtime sandboxé | Utilisé pour exécution code non fiable ? |

## 16. Checkpointing & Récupération

Source: CC docs gap analysis (2026-04-27, section entièrement manquante)

| Feature | Description | Check |
|---------|-------------|-------|
| Auto-checkpoint | Sauvegarde automatique à chaque prompt | Feature active par défaut — checkpoint avant chaque action risquée |
| `/rewind` ou `Esc+Esc` | Menu 5 actions : restore code+conv, restore conv, restore code, summarize, cancel | Connu du user pour récupération après erreur ? |
| "Summarize from here" | Compresse messages postérieurs en résumé AI (conservation du contexte compacté) | Utilisé pour les longues sessions ? |
| Retention 30 jours | Checkpoints conservés 30 jours | Aware des limites de rétention ? |
| Scope limité | Ne suit PAS les modifications Bash (`rm`, `mv`, `cp`) — uniquement les fichiers édités via CC | Anti-pattern : destructive bash avant rewind ? |
| `enableFileCheckpointing` (SDK) | File checkpointing programmatique dans SDK | Utilisé dans pipelines CI pour rollback ? |
| `rewindFiles()` (SDK) | Rewind programmatique des fichiers (SDK) | Intégré dans pipelines de recovery ? |

---

## Comment utiliser cette checklist

### En mode INIT (Phase intégrée entre Phase 5 et Phase 6)
Parcourir chaque section. Pour chaque item :
- "Est-ce pertinent pour CE projet ?" → Si oui, l'implémenter
- "Est-ce déjà couvert ?" → Si non, l'ajouter au TOOLKIT_PLAN
- Objectif : 100% des features pertinentes exploitées

### En mode AUDIT (Phase intégrée dans Phase 2)
Parcourir chaque section. Pour chaque item :
- "Est-ce utilisé ?" → Scorer
- "Pourrait-il l'être ?" → Recommander
- "Est-il bien configuré ?" → Optimiser
- Objectif : aucune feature utile laissée de côté

### Scoring
- Chaque section a N items pertinents pour le projet
- Score = items exploités / items pertinents × 10
- Score global = moyenne pondérée (sections critiques pèsent plus)

---

## Feature Matching Guide

During AUDIT, match project signals to CC features. For each match, give the exact setup and a project-specific example.

**Source**: https://code.claude.com/docs/en/ (130 pages as of v2.1.139 — +6 pages: agent-view, goal, agents-parallel, create-custom-subagents, plugin-dependencies, discover-install-plugins). Use WebFetch to verify current state if unsure.

### Computer Use (macOS only, Pro/Max plan)

**Signal**: GUI app (React Native, Electron, SwiftUI, desktop), iOS Simulator, visual QA
**Setup**: `/mcp` → enable `computer-use`. Grant Accessibility + Screen Recording permissions.
**What it does**: Claude opens apps, clicks, types, scrolls, screenshots. Drives iOS Simulator, Xcode, native apps. Not for browser (use Chrome instead). Not available with `-p` flag.
**Example**: "Build the app, launch it, click through onboarding, screenshot any broken layout"
**Alternatives**: Chrome (for web), Playwright (for automated web tests)

### Chrome Integration (beta)

**Signal**: Web app with browser UI, needs console debugging, authenticated web apps, form testing
**Setup**: `claude --chrome` or `/chrome`. Install Claude in Chrome extension from Chrome Web Store.
**What it does**: Opens tabs, navigates, clicks, fills forms, reads console logs, records GIFs. Works with ANY site you're logged into (Google Docs, Gmail, Notion, CRM). Shares browser login state.
**Example**: "Open localhost:3000, test the checkout flow, check console for errors"
**Alternatives**: Computer Use (for native apps), Playwright plugin (for CI/automated tests)

### Channels (Telegram, Discord, iMessage)

**Signal**: Team communication, remote notifications, bot integration, push events into session
**Setup**: `/plugin install telegram@claude-plugins-official` + `/telegram:configure <token>` + restart with `claude --channels plugin:telegram@claude-plugins-official`
**What it does**: Bidirectional chat bridge. Messages arrive in your running session. Claude replies back in the chat. Can relay permission prompts to approve from phone. Requires Bun.
**Platforms**: Telegram, Discord, iMessage (macOS). Build custom channels for webhooks/CI.
**Example**: "Forward CI failure alerts from GitHub Actions into my Claude session via Telegram"

### Scheduled Tasks (3 tiers)

| Tier | Signal | Persists | Local files | Setup |
|------|--------|----------|-------------|-------|
| `/loop` (session) | Quick polling during dev | No (dies with session) | Yes | `/loop 5m check deploy` |
| Desktop tasks | Recurring local work | Yes (survives restart) | Yes | Desktop app > Scheduled Tasks |
| Cloud tasks / CC Routines | Recurring work 24/7 (research preview) | Yes (runs without machine) | No (fresh GitHub clone) | `/schedule` or web UI. Limits: Pro 5/day, Max 15/day, Team/Enterprise 25/day |

**`/loop` details**: Can run another skill (`/loop 20m /review-pr 1234`). Dynamic interval if you omit the time. Custom default prompt via `.claude/loop.md`. Max 50 tasks/session. 7-day auto-expiry.
**Cloud tasks**: Min interval 1h. Runs on Anthropic infra. Perfect for: daily PR review, weekly dep audit, overnight test runs.

### Agent Teams (experimental)

**Signal**: Monorepo, multi-layer changes (frontend+backend+tests), competing hypotheses debugging, parallel code review
**Setup**: Add `"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"` to `settings.json` env. Then ask Claude to create a team.
**What it does**: Multiple independent Claude sessions coordinated via shared task list + peer messaging. Lead manages, teammates self-claim tasks. Split-pane mode with tmux/iTerm2.
**Best for**: 3-5 teammates, each owning different files/packages. Security+performance+tests review in parallel.
**Not for**: Sequential work, same-file edits, simple tasks (use subagents instead).
**Hooks**: `TeammateIdle`, `TaskCreated`, `TaskCompleted` for quality gates.

### Custom Subagents

**Signal**: Repetitive delegated tasks, context isolation needs, parallel research
**Setup**: Create `.claude/agents/{name}.md` with frontmatter (name, description, tools, model, skills, memory, isolation).
**Fields**: `model` (opus/sonnet/haiku), `effort` (min/low/medium/high/max), `permissionMode`, `maxTurns`, `memory` (user|project|local), `isolation` (worktree), `skills` (preloaded skills), `hooks`, `background`.
**Example**: A `security-reviewer` agent that only has Read+Grep tools and preloads a security checklist skill.

### UltraPlan (research preview)

**Signal**: Complex multi-step changes (migrations, large refactors, architecture decisions)
**Setup**: `/ultraplan migrate the auth service from sessions to JWTs`
**What it does**: Sends planning to Claude Code on the web (plan mode). You review in browser with inline comments, emoji reactions, outline sidebar. Then execute on web (auto-PR) or teleport back to terminal.
**Requires**: Claude Code on the web account + GitHub repo. Not available on Bedrock/Vertex/Foundry.

### Remote Control

**Signal**: Need to continue work from phone/tablet, away from desk
**Setup**: Built-in. Connect from claude.ai/code to a running local session.
**What it does**: Drive your local Claude Code session from any browser or the Claude iOS app.

### Plugins (marketplace system)

**Signal**: Team project needing shared config, or project needing external integrations
**Official marketplace**: `/plugin` > Discover. Categories: Code Intelligence (11 LSP languages), External Integrations (github, gitlab, atlassian, asana, linear, notion, figma, vercel, firebase, supabase, slack, sentry), Dev Workflows (commit-commands, pr-review-toolkit).
**Community**: `/plugin marketplace add owner/repo` for third-party marketplaces.
**Install**: `/plugin install name@marketplace`. Scopes: user, project, local.
**Browse catalog**: https://claude.com/plugins

### MCP Servers

**Signal**: External service integration (databases, APIs, design tools, communication)
**Registry**: WebFetch `https://api.anthropic.com/mcp-registry/v0/servers?version=latest&visibility=commercial&limit=100`
**Key servers**: Context7 (library docs), Playwright (browser), Figma (designs), Pencil (.pen files), GitHub, Gmail, Google Calendar, Linear, Telegram.
**Setup**: `/mcp` to manage servers. Config in `.claude/settings.local.json` or `~/.claude/settings.json`.
**Best practice**: Max 2 MCP par projet — chaque serveur MCP injecte ses tool definitions (5-10% du contexte). Préférer les CLI équivalents quand ils existent : `gh` > github-mcp, `vercel` > vercel-mcp, `neon` > neon-mcp. Réserver les MCP aux cas sans alternative CLI (Context7, Figma, Playwright).

### GitHub Actions / GitLab CI/CD

**Signal**: CI/CD pipeline, PR workflow, code review automation
**Setup**: `.github/workflows/` with `claude -p` for automated review/triage.
**GitHub Code Review**: Automatic AI review on every PR.

### Slack Integration

**Signal**: Team uses Slack for communication
**What it does**: `@Claude` in Slack spawns a web session. Bug report → PR automatically.

### Dispatch (Desktop)

**Signal**: Start tasks from phone/mobile
**What it does**: Message Dispatch a task, it creates a Desktop session. Open later to review.
