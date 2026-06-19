# Definition of Done — `cli-tool`

> **Pour qui :** un fondateur non-tech. Chaque case = ce qu'une **équipe de classe mondiale**
> livrerait pour un vrai outil en ligne de commande (un binaire `bin`, ou un CLI Python
> click/typer). `/assistant` coche À TA PLACE, une étape à la fois, et ne dit **« CLI fini »**
> que quand **toutes les cases applicables sont vertes avec preuve directe** (commande lancée
> dans un vrai terminal + sortie/exit-code observés) — **jamais** sur un simple « build vert ».
>
> **Spécificité CLI :** **pas d'auth web, pas de paiements, pas d'UI navigateur, pas de SEO/a11y
> web, souvent pas de DB serveur.** Ce qui compte : une **UX terminal impeccable** (`--help`,
> codes de sortie, flags, stdin/stdout, couleurs/quiet), la **distribution** (installation simple,
> versioning, changelog), la **robustesse** (entrées invalides, erreurs lisibles) et la
> **rétro-compatibilité** des arguments. La preuve directe = exécuter la commande.
>
> **Comment lire :** explication en clair · **levier `/assistant`** réel · `(si applicable)` ·
> `(à construire)` = gap réel signalé.
>
> **Type détecté par** `scripts/detect-project.ts` → `cli-tool` (présence d'un `bin` dans
> package.json, ou Python click/typer).

---

## Phase 0 — Fondations

- [ ] **Brief produit écrit** — une page : ce que fait le CLI, pour qui, la commande principale, frontière V1.
  Levier : gabarit `references/client-brief-template.md` → `docs/BRIEF.md`.
- [ ] **Repo + `CLAUDE.md` + mémoire** — projet lisible par toi et l'IA.
  Levier : `/init` → `scripts/generate-config.ts`.
- [ ] **Stack & architecture posées** — runtime + parseur d'arguments cohérents.
  Levier : `scripts/detect-project.ts` + `scripts/organise.ts`. Défaut : Bun (TS) ou Python typer.
- [ ] **Environnements & config** *(si applicable)* — config par fichier (`~/.config/...`) et/ou variables d'env, jamais de secret en dur, `.env.example` si besoin de clés.
  Levier : `audit-project.ts` §8 + détection `env-configured`.

## Phase 1 — Identité & accès *(rarement applicable)*

- [ ] **Authentification / clé d'API** *(si applicable : le CLI parle à un service distant)* — login/clé stockés en sécurité (keychain ou fichier protégé), jamais affichés ni loggés.
  Levier : keychain OS / fichier 0600 + masquage. `(à construire)` : check secrets-en-clair via hook `security.ts`.

## Phase 2 — Cœur métier (les commandes)

- [ ] **Commandes & sous-commandes couvertes** — chaque commande promise fait ce qu'elle dit, y compris sur entrée vide ou invalide ; codes de sortie corrects (`0` = succès, ≠0 = erreur).
  Levier : handlers + tests via `/ship100`.
- [ ] **UX terminal** — `--help` clair et complet, `--version`, messages utiles, mode `--quiet`/`--json` si pertinent, respect de stdin/stdout/stderr (pipe-friendly).
  Levier : framework CLI (commander/yargs/typer) + revue UX.
- [ ] **Lecture/écriture de fichiers** *(si applicable)* — chemins validés, pas d'écrasement silencieux, confirmation avant action destructive.
  Levier : validation + garde-fou (cf. skill `careful` pour les opérations destructives).

## Phase 5 — Fiabilité & robustesse

- [ ] **Validation des entrées** — arguments, flags et fichiers d'entrée validés ; message d'erreur lisible plutôt que crash technique.
  Levier : validation (Zod côté TS). `(à construire)` : check dans `backend-auditor` (gap #2).
- [ ] **Gestion d'erreurs structurée** — erreurs claires sur **stderr**, code de sortie distinct par type d'échec, **jamais de stack-trace brute** en sortie par défaut (sauf `--verbose`).
  Levier : erreurs typées + sortie formatée.
- [ ] **Logging / verbosité** *(si applicable)* — niveaux `--verbose`/`--debug`, zéro secret loggé.
  Levier : logger avec niveaux.
- [ ] **Performance** *(si applicable : gros volumes)* — reste rapide et sans fuite mémoire sur de grandes entrées.
  Levier : profilage. `(à construire)` : `perf-auditor` hors vitrine (gap #3).

## Phase 6 — Sécurité & conformité

- [ ] **Secrets management** — clés/tokens jamais commités ni affichés, `.gitignore` couvre `.env*`, stockage local protégé.
  Levier : hook `.claude/hooks/security.ts` (AKIA / `sk-` / password) + `audit-project.ts` §8.
- [ ] **Sécurité d'exécution** *(si applicable : le CLI exécute des commandes ou télécharge)* — pas d'injection shell, entrées échappées, téléchargements vérifiés (checksum).
  Levier : éviter `shell: true`, validation. `(à construire)` : `/security-review` câblé au gate (gap #1).
- [ ] **Dépendances / supply chain** — lockfile, audit, zéro CVE critique (un CLI distribué est une cible).
  Levier : `bun audit` / Dependabot. `(à construire)`.

## Phase 7 — Qualité & tests

- [ ] **Tests unitaires** — logique métier critique couverte.
  Levier : Vitest.
- [ ] **Tests de bout en bout CLI** — exécuter le binaire avec de vrais arguments et vérifier sortie + exit code (golden tests), pas « build vert ».
  Levier : `scripts/ship-check-gate.ts` (`SHIP_PROOF.json` documente les commandes + exit codes ; règle `e2e-proof` adaptée CLI).
- [ ] **Tests multi-plateforme** *(si applicable : distribué largement)* — vérifié sur les OS cibles (macOS/Linux/Windows).
  Levier : matrice CI GitHub Actions.

## Phase 8 — Distribution & adoption

- [ ] **Installation simple** — une commande d'install documentée (`npm i -g` / `bun add -g` / `pipx` / brew), binaire qui se lance.
  Levier : `bin` configuré + README install.
- [ ] **Versioning & changelog** — versions sémantiques, `CHANGELOG.md` à jour, dépréciations annoncées (rétro-compatibilité des flags).
  Levier : `CHANGELOG.md` + tags ; cf. skill `ship` (bump VERSION + changelog).
- [ ] **README / docs d'usage** — exemples concrets de chaque commande, copier-coller.
  Levier : README + `--help` aligné.

## Phase 9 — Livraison & exploitation

- [ ] **CI/CD** — lint + typecheck + test + build sur chaque changement, bloque si rouge ; publication automatique du paquet sur tag.
  Levier : GitHub Actions. **Détecté** par `audit-project.ts` §10 ; `(à construire)` : **génération** du pipeline + workflow de publish en BOOTSTRAP (gap #4).
- [ ] **Docs & DX** — `CLAUDE.md` + README + mémoire à jour.
  Levier : `scripts/generate-config.ts` + hook `dx.ts`. **Couvert**.
- [ ] **GATE `/ship100` — DoD dure** — rapports QA + preuve d'exécution réelle, blocage sur critical/high, décision `SHIP / DON'T SHIP`.
  Levier : `scripts/ship-check-gate.ts` + skill `/ship100`. **Couvert (point fort).**

---

## Verdict « VRAIMENT FINI » (doctrine)

`/assistant` ne déclare ce `cli-tool` **fini** que si **toutes les cases applicables sont vertes**,
chacune avec **preuve directe** : commande exécutée dans un vrai terminal + sortie attendue + exit
code correct — **jamais** sur un typecheck OK seul. Pas d'UI ni de SEO/a11y web : la preuve est
l'exécution, et l'**UX terminal + la distribution** sont les vrais critères de qualité. Toute case
applicable vide = **gap bloquant** dans `QUALITY_SCORE.md`, et `/assistant` donne **UNE seule
prochaine étape** expliquée en clair. Extension au **produit** de `/conseil` gate-FINI + `/ship100`.
