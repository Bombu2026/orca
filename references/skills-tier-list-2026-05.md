# Skills Tier List — Audit 2026-05-19

Source : audit `gh api` sur les 25 repos sources de la library + recall mémoire ORCA (15 mémoires) + retours du loop d'audit (30 derniers reports).

Library locale : 8021 artefacts indexés au **2026-03-26** (CATALOG.md, 2 mois). **À rafraîchir** : `bun scripts/fetch-corpus.ts`.

## Tier 1 — Must-have (cross-project, à installer presque toujours)

### Repos sources
| Repo | Stars | Last push | Pourquoi |
|---|---|---|---|
| `garrytan/gstack` | 99k | aujourd'hui | qa, review, ship, careful, browse, investigate, simplify, codex |
| `anthropics/claude-plugins-official` | 19k | aujourd'hui | frontend-design, claude-api, mcp-builder, webapp-testing, doc-coauthoring |
| `wshobson/agents` | 35k | il y a 2j | 146 subagents spécialisés (security-reviewer, code-reviewer, architect) |
| `affaan-m/ECC` *(ex everything-claude-code)* | 186k | aujourd'hui | 126 subagents fins (typescript-reviewer, e2e-runner, refactor-cleaner) |
| `trailofbits/skills` | 5k | il y a 2j | security-audit, threat-modeling, dependency-audit |

### Skills individuels Must-have

**Sur tout projet** : `review`, `qa`, `careful`, `ship`, `investigate`, `simplify`
**Web/frontend** : `frontend-design`, `senior-frontend`, `react-nextjs-development`, `web-design-guidelines`
**Backend/API** : `api-security-testing`, `backend-development`, `claude-api`, `mcp-builder`
**Sécurité** : `security-review`, `web-security-testing`, `dependency-audit`

### Subagents individuels Must-have

`security-reviewer`, `code-reviewer`, `architect`, `database-reviewer`, `e2e-runner`, `typescript-reviewer`, `refactor-cleaner`, `docs-lookup`, `harness-optimizer`

## Tier 2 — Situational (selon stack/projet)

| Repo | Stars | Quand l'utiliser |
|---|---|---|
| `davila7/claude-code-templates` | 27k | Web fullstack avec besoins design system (`senior-frontend`) |
| `sickn33/antigravity-awesome-skills` | 38k | Projets Next.js, design system, performance review |
| `ComposioHQ/awesome-claude-skills` | 60k | Catalog curated, lookup ponctuel |
| `alirezarezvani/claude-skills` | 15k | 235 skills variés, complément ad-hoc |
| `ruvnet/ruflo` | 53k | Orchestration multi-agent (long-running) |
| `EveryInc/compound-engineering-plugin` | 17k | Patterns ingénierie séquentielle |
| `VoltAgent/awesome-agent-skills` | 22k | Agents spécialisés |
| `rohitg00/awesome-claude-code-toolkit` | 1.7k | Toolkit dev quotidien |
| `davepoon/buildwithclaude` | 3k | Builder workflows |
| `sangrokjung/claude-forge` | 700 | Commands/hooks compacts |

## Tier 3 — Archive (faible priorité)

| Repo | Stars | Push | Raison |
|---|---|---|---|
| `Jeffallan/claude-skills` | 9k | il y a 17j | SLOW |
| `team-attention/plugins-for-claude-natives` | 770 | 29j | SLOW |
| `polyuiislab/infiAgent` | 1k | 42j | SLOW |
| `mrgoonie/claudekit-skills` | 2k | 46j | SLOW |
| `agenticnotetaking/arscontexta` | 3k | 83j | STALE |
| `BrownFineSecurity/iothackbot` | 760 | 99j | STALE |
| `parcadei/Continuous-Claude-v3` | 3.7k | 112j | STALE |
| `ananddtyagi/cc-marketplace` | 680 | 120j | STALE |
| `jeremylongshore/claude-code-plugins-plus-skills` | 2k | aujourd'hui | 3491 entrées (44% du catalog) mais signal/noise faible — flood, peu de skills singuliers cités en pratique |

## Gaps — Repos hot non indexés (à ajouter au catalog)

| Repo | Stars | Push | Pourquoi l'ajouter |
|---|---|---|---|
| `anthropics/skills` | **137k** | aujourd'hui | Spec officielle Skills 2.0, source canonique |
| `hesreallyhim/awesome-claude-code` | 44k | il y a 22j | Awesome-list de référence |
| `revfactory/harness` | 3.4k | il y a 4j | Domain-specific agent team assembly |
| `shinpr/claude-code-workflows` | 360 | aujourd'hui | Complexity routing patterns |
| `coleam00/claude-memory-compiler` | 1k | il y a 43j | Post-session memory compilation |

## Recommandations pour install-toolkit

### Preset "web-fullstack-team" (à appliquer sur tout nouveau projet web)
```bash
bun scripts/install-toolkit.ts <path> \
  --keywords="<projet> nextjs react design frontend security tailwind testing" \
  --type=web-fullstack \
  --skills="frontend-design,senior-frontend,react-nextjs-development,review,qa,web-security-testing" \
  --agents="security-reviewer,code-reviewer,architect,database-reviewer,e2e-runner,typescript-reviewer"
```

### Preset "api-backend-team"
```bash
bun scripts/install-toolkit.ts <path> \
  --keywords="<projet> api backend security database observability" \
  --type=api-backend \
  --skills="api-security-testing,backend-development,review,claude-api,mcp-builder" \
  --agents="security-reviewer,architect,database-reviewer,code-reviewer,docs-lookup"
```

### Preset "bot-agent-team"
```bash
bun scripts/install-toolkit.ts <path> \
  --keywords="<projet> agent llm mcp memory orchestration" \
  --type=bot-agent \
  --skills="agent-memory-mcp,llm-evaluation,claude-api,mcp-builder,review" \
  --agents="code-reviewer,security-reviewer,architect"
```

## Actions à prendre

1. **Rafraîchir le catalog** (2 mois de retard) : `bun scripts/fetch-corpus.ts` puis recompiler le `CATALOG.md`.
2. **Indexer les 5 repos manquants** (anthropics/skills, hesreallyhim/awesome-claude-code, revfactory/harness, shinpr/claude-code-workflows, coleam00/claude-memory-compiler).
3. **Renommer dans le catalog** : `affaan-m/everything-claude-code` → `affaan-m/ECC`. Le nouveau nom est canonique.
4. **Déprioriser jeremylongshore** dans le ranking : 44% du catalog mais signal/noise faible.
