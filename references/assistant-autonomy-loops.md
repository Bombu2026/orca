# Autonomy Card · Production Reality · Boucles autonomes

> Référence détaillée des leviers d'autonomie et du niveau de sortie par défaut. SKILL.md n'en
> garde qu'un résumé (budget always-on) ; le détail vit ici. Porté en données par
> `scripts/lib/autonomy.ts` (Autonomy Card) + `scripts/lifecycle-audit.ts` (Production Reality)
> + `scripts/lib/onboarding.ts` (prescription /goal·/loop), tous consommés par `organise.ts`.

## Autonomy Card — 6 leviers pour faire tourner Opus en continu (à chaque cold-start)

Faire tourner Opus en autonomie des heures/jours tient à **6 leviers**. `organise.ts` les émet
automatiquement à la fin de chaque verdict (et les écrit dans `QUALITY_SCORE.md`) via
`scripts/lib/autonomy.ts` — pour qu'aucun ne soit **jamais oublié**. /assistant ne se contente pas
de les afficher : il **agit** dessus selon l'état détecté.

| # | Levier | Ce que /assistant fait de l'état détecté |
|---|---|---|
| 1 | **Permissions auto** | Non lisible en runtime. Si `defaultMode` ∈ {acceptEdits, bypassPermissions} → `armed`. Sinon `reminder` : **dire à l'opérateur** de passer en Auto-accept (`/config`) ou de relancer `claude --permission-mode acceptEdits`. |
| 2 | **Workflows dynamiques** | Capacité harness (toujours `armed`). Sur une tâche lourde, **prescrire** « ultracode »/Workflow pour orchestrer des dizaines d'agents. |
| 3 | **`/loop` · `/goal`** | Gated par la version CC (`/loop` ≥ 2.1.72, `/goal` ≥ 2.1.139) — jamais un faux `armed`. Si dispo : **rappeler** la syntaxe exacte (voir « Boucles autonomes ») ; sinon prescrire l'upgrade. |
| 4 | **Cloud** | Non détectable → `reminder` : **rappeler** de reprendre dans l'app desktop/mobile (laptop fermé). |
| 5 | **Self-verify E2E** | Auditable côté projet. Web sans Playwright MCP ni `browse`, ou API sans commande de serveur → `missing` **bloquant** : devient un gap, jamais sous silence (« trois preuves indirectes ≠ une preuve directe »). |
| 6 | **Rule of Two** (sécurité agentique) | La **lethal trifecta** — A données privées + B contenu non fiable + C action sortante — réunie sans humain rend l'autonomie dangereuse (exfiltration par un seul prompt injecté). `scripts/lib/rule-of-two.ts` déduit A/B/C des deps + du type ; les 3 sans human-in-the-loop → `missing` **bloquant** : on refuse l'autonomie non surveillée (mitiger : HITL, casser une branche, ou sessions fraîches ≤2 propriétés). |

Règle non négociable : un levier `reminder` (1, 4) se **dit à voix haute** dans la réponse, pas
seulement dans le fichier ; un levier `missing` (5 self-verify, 6 Rule of Two) est traité comme un
**gap bloquant** au même titre que les gaps du score. Honnêteté technique : /assistant ne prétend
jamais avoir « activé » les permissions auto ou le cloud — il ne peut que détecter au mieux et prescrire.

```bash
bun scripts/lib/autonomy.ts <path> --type=<projectType> [--json]   # carte seule (debug)
```

## Production Reality — niveau de sortie par défaut (& profil mock)

Par défaut, TOUT projet est conduit au niveau « full-stack production reality » : la DoD lifecycle
exige aussi les couches infra — caching, CDN/edge, scaling, cible de déploiement, audit sécurité
applicative (OWASP/RLS), complétude backend. Sur PaaS détecté (Vercel/Netlify/Cloudflare/Fly/Render),
CDN + scaling + compute sont **délégués à la plateforme** et comptés couverts ; le jour où le projet
en sort, ils redeviennent des gaps visibles.

- **Auditeurs auto (non négociable)** : si `organise.ts --json` renvoie `auditors` non vide, lancer
  IMMÉDIATEMENT ces agents **en parallèle** (model `claude-opus-4-8`), sans demander. Prompt = le
  template `templates/agents/auditors/<agent>.md` ; consigne ajoutée = écrire le rapport
  (`SECURITY_AUDIT.md`, `BACKEND_AUDIT.md`, `A11Y_REPORT.md`, `PERF_REPORT.md`) à la racine de la
  cible, findings concrets `fichier:ligne`, verdict en première ligne. Un rapport écrit rend sa
  capacité lifecycle verte au passage suivant — c'est ce qui fait **converger** la boucle /assistant.
- **Profil mock (opt-out explicite)** : si l'opérateur dit « en mock » / « mock » / « juste un
  prototype », passer `--mock` à organise.ts — les couches `prodOnly` sortent de la DoD et les
  auditeurs ne sont pas prescrits. L'exclusion est toujours **listée**, jamais silencieuse. Sans ce
  mot explicite, le niveau production est le défaut : ne jamais déduire « mock ».

## Boucles autonomes — /goal d'abord, /loop pour le polling

La prescription concrète et copiable est produite par `scripts/lib/onboarding.ts`
(`onboarding.goal.command` / `onboarding.loop.command`), dérivée de l'état réel (score, DoD,
auditeurs manquants) et gatée par la version CC.

- **`/goal`** (CC ≥ 2.1.139) : l'évaluateur ne lit **que le transcript**, aucun fichier — chaque
  tour doit faire APPARAÎTRE la preuve (output réel de `organise.ts`, exit codes). Condition type :
  `/goal "Repo Readiness ≥ 9/10 ET DoD lifecycle verte ET 0 rapport d'auditeur manquant, prouvés
  dans le transcript par l'output du scan — or stop after 20 turns"`.
- **`/loop`** (CC ≥ 2.1.72) : `/loop 30m /assistant` reconverge seul — chaque tour relit
  QUALITY_SCORE.md / LIFECYCLE.md (état persistant), traite UN gap, re-scanne. Au bootstrap, copier
  `templates/loop.md` → `.claude/loop.md` de la cible : `/loop` sans argument exécute alors ce tour
  de maintenance idempotent.
- L'idempotence est par construction : organise.ts relit l'état écrit (drift visible) ; un tour sans
  gap se termine en une ligne sans rien modifier.
