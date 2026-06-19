# Definition of Done — `bot-agent`

> **Pour qui :** un fondateur non-tech. Chaque case = ce qu'une **équipe IA/bot de classe
> mondiale** livrerait pour un vrai bot ou agent (Telegram/Slack/Discord, ou agent LLM
> Anthropic/OpenAI/LangChain). `/assistant` coche À TA PLACE, une étape à la fois, et ne dit
> **« bot/agent fini »** que quand **toutes les cases applicables sont vertes avec preuve
> directe** (conversation/commande réelle déclenchée + résultat observé) — **jamais** sur un
> simple « build vert ».
>
> **Spécificité bot/agent :** souvent **pas d'UI web** (donc pas de SEO/a11y classiques), mais
> la **fiabilité de l'agent** (prompts, garde-fous, idempotence, coût/quotas, boucles infinies),
> la **sécurité des outils** (un agent qui exécute des actions est une surface d'attaque), et
> l'**observabilité des conversations** deviennent centrales. La preuve directe = déclencher une
> vraie commande/message et observer le comportement.
>
> **Comment lire :** explication en clair · **levier `/assistant`** réel · `(si applicable)` ·
> `(à construire)` = gap réel signalé.
>
> **Type détecté par** `scripts/detect-project.ts` → `bot-agent` (telegraf, grammy, slack-bolt,
> discord.js, ou signal IA `ai`/`@ai-sdk`/`@anthropic-ai/sdk`/`openai`/`langchain`).

---

## Phase 0 — Fondations

- [ ] **Brief produit écrit** — une page : ce que fait le bot, sur quelle plateforme, ce qu'il a le droit de faire, frontière V1.
  Levier : gabarit `references/client-brief-template.md` → `docs/BRIEF.md`.
- [ ] **Repo + `CLAUDE.md` + mémoire** — projet lisible par toi et l'IA.
  Levier : `/init` → `scripts/generate-config.ts`.
- [ ] **Stack & architecture posées** — runtime, plateforme (Telegram/Slack/Discord), SDK LLM, stockage d'état cohérents.
  Levier : `scripts/detect-project.ts` (`ai-sdk` détecté) + `scripts/organise.ts`. Défaut : Bun + SDK Anthropic.
- [ ] **Stockage d'état / mémoire** *(si applicable : conversations persistantes)* — où vivent l'historique et le contexte, versionné.
  Levier : Drizzle schema + migrations (ou KV Upstash pour état léger).
- [ ] **Environnements & config (12-factor)** — dev / prod séparés (bot de test vs prod), zéro token en dur, `.env.example`.
  Levier : `audit-project.ts` §8 + détection `env-configured`.

## Phase 1 — Identité & accès

- [ ] **Authentification / allowlist** *(si applicable)* — savoir qui parle au bot ; restreindre les commandes sensibles à des utilisateurs/rôles autorisés.
  Levier : mapping user-id plateforme + allowlist + checks serveur.
- [ ] **Permissions des outils (tool authz)** *(si applicable : l'agent exécute des actions)* — chaque outil que l'agent peut appeler est borné (un agent ne doit pas pouvoir tout faire). Test d'accès négatif.
  Levier : whitelist d'outils + validation des arguments (Zod). `(à construire)` : agent `security-reviewer` (gap #1).

## Phase 2 — Cœur métier (le comportement du bot)

- [ ] **Commandes / intents couverts** — chaque commande ou intention promise répond correctement, y compris l'entrée invalide et l'état « rien à faire ».
  Levier : handlers + tests via `/ship100`.
- [ ] **Qualité de l'agent LLM** *(si applicable : agent génératif)* — prompts système versionnés, garde-fous anti-dérive, **stop conditions** (pas de boucle infinie d'outils), réponses de secours.
  Levier : prompts versionnés + max-steps + évals. `(à construire)` : check qualité agent dans l'audit.
- [ ] **Gestion du contexte / coût** *(si applicable : LLM)* — fenêtre de contexte maîtrisée, troncature/compaction, suivi du coût par conversation.
  Levier : compaction + budget tokens (cf. doctrine `token-doctor` / `references/assistant-token-doctor.md`).

## Phase 3 — Monétisation *(si applicable)*

- [ ] **Paiements / abonnements** *(si applicable : bot payant)* — succès, échec, dunning, remboursement, changement de plan testés ; webhooks idempotents.
  Levier : Stripe (détecté) + table subscriptions.

## Phase 4 — Communication

- [ ] **Notifications / messages sortants** *(si applicable)* — le bot prévient au bon moment, sans spammer ; opt-out respecté.
  Levier : API plateforme + préférences utilisateur.
- [ ] **Email transactionnel** *(si applicable : comptes liés)* — délivrabilité, base légale RGPD.
  Levier : Resend (détecté).

## Phase 5 — Fiabilité, robustesse & coût (cœur d'un bot)

- [ ] **Validation des entrées** — ne jamais faire confiance aux messages/arguments d'outil entrants : schéma de validation à chaque frontière.
  Levier : Zod. `(à construire)` : check dans `backend-auditor` (gap #2).
- [ ] **Gestion d'erreurs structurée** — quand un outil ou le LLM échoue, le bot répond proprement à l'utilisateur et ne crashe pas ; jamais de trace technique envoyée dans le chat.
  Levier : try/catch aux frontières + message de secours typé.
- [ ] **Idempotence / dé-duplication** — un même événement plateforme rejoué (retries Telegram/Slack) ne déclenche pas deux fois l'action.
  Levier : clé d'idempotence + table de déduplication. `(à construire)`.
- [ ] **Logging structuré** — journal des conversations/actions en JSON avec correlation id, **zéro secret ni donnée perso superflue** loggés.
  Levier : pino / logs structurés.
- [ ] **Observabilité (monitoring / alerting)** — taux d'erreur, latence, coût LLM, échecs d'outils surveillés ; alerte si le bot tombe ; ownership défini jour 1.
  Levier : Sentry + métriques custom. `(à construire)` : dimension observabilité absente de l'audit (gap #2).
- [ ] **Rate-limiting / anti-abus & quotas** — limiter par utilisateur pour éviter l'abus et l'explosion de coût LLM ; respecter les quotas de la plateforme.
  Levier : Upstash rate-limit + budget LLM par user. `(à construire)`.
- [ ] **Queues / jobs asynchrones** *(si applicable : tâches longues)* — déporter le travail lourd avec retries et idempotence (éviter les timeouts plateforme).
  Levier : QStash / cron.

## Phase 6 — Sécurité & conformité (ton angle mort #1)

- [ ] **Sécurité agent / prompt-injection** *(si applicable : agent qui lit du contenu externe ou exécute des outils)* — se protéger de l'injection de prompt et de l'exécution d'actions non voulues ; trust boundaries entre entrée utilisateur et outils.
  Levier : bornage des outils + validation + hook `.claude/hooks/security.ts`. `(à construire)` : `/security-review` câblé au gate (gap #1).
- [ ] **Secrets management** — tokens bot et clés LLM en env/vault, jamais commités, `.gitignore` couvre `.env*`.
  Levier : env + hook `security.ts` (AKIA / `sk-`) + `audit-project.ts` §8.
- [ ] **RGPD / vie privée** *(si applicable : stocke des conversations perso EU)* — base légale, rétention limitée, suppression sur demande, minimisation.
  Levier : politique de rétention + endpoint de suppression. `(à construire)` : check RGPD absent de l'audit (gap #1).
- [ ] **Dépendances / supply chain** — lockfile, audit, zéro CVE critique.
  Levier : `bun audit` / Dependabot. `(à construire)`.
- [ ] **Backups** *(si applicable : DB de prod)* — backups + restauration testée.
  Levier : backups managés + runbook. `(à construire)`.

## Phase 7 — Qualité & tests

- [ ] **Tests unitaires** — handlers et logique métier critiques couverts.
  Levier : Vitest.
- [ ] **Évals de l'agent** *(si applicable : LLM)* — jeu de cas qui vérifie que l'agent répond bien sur des scénarios clés (pas juste « ça compile »).
  Levier : suite d'évals + assertions. `(à construire)` : framework d'éval dans l'audit.
- [ ] **Preuve directe (commande/conversation réelle)** — déclencher une vraie commande/message et observer le résultat attendu, pas « build vert ».
  Levier : `scripts/ship-check-gate.ts` (`SHIP_PROOF.json` documente les commandes + exit codes).

## Phase 8 — Documentation

- [ ] **Doc d'usage** — la liste des commandes / capacités du bot, lisible par l'utilisateur final.
  Levier : README + message `/help` du bot.
- [ ] **Pages légales / conditions** *(si applicable : bot public)* — conditions d'utilisation + confidentialité.
  Levier : doc statique.

## Phase 9 — Livraison & exploitation

- [ ] **CI/CD** — lint + typecheck + test + build, bloque le merge si rouge.
  Levier : GitHub Actions. **Détecté** par `audit-project.ts` §10 ; `(à construire)` : **génération** du pipeline en BOOTSTRAP (gap #4).
- [ ] **Déploiement & hébergement du bot** — le bot tourne en continu (serveur/worker), webhook ou polling configuré, redémarrage automatique.
  Levier : Vercel / conteneur (détectés) ; config via `scripts/generate-config.ts`.
- [ ] **Rollback & incident response** *(si applicable : en prod)* — revenir vite à la version qui marchait + ownership incident.
  Levier : rollback déploiement + runbook. `(à construire)`.
- [ ] **Docs & DX** — `CLAUDE.md` + README + mémoire à jour.
  Levier : `scripts/generate-config.ts` + hook `dx.ts`. **Couvert**.
- [ ] **GATE `/ship100` — DoD dure** — rapports QA + preuve directe, blocage sur critical/high, décision `SHIP / DON'T SHIP`.
  Levier : `scripts/ship-check-gate.ts` + skill `/ship100`. **Couvert (point fort).**

---

## Verdict « VRAIMENT FINI » (doctrine)

`/assistant` ne déclare ce `bot-agent` **fini** que si **toutes les cases applicables sont vertes**,
chacune avec **preuve directe** : commande/conversation réelle déclenchée + comportement observé
(et coût/erreurs sous contrôle pour un agent LLM) — **jamais** sur un typecheck OK seul. Toute case
applicable vide = **gap bloquant** dans `QUALITY_SCORE.md`, et `/assistant` donne **UNE seule
prochaine étape** expliquée en clair. Extension au **produit** de `/conseil` gate-FINI + `/ship100`.
