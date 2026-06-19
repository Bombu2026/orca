---
description: Pre-ship QA orchestration — runs qa-hunter, slop-janitor, architect-auditor and e2e-scripter in parallel before prod
---

Avant de ship en prod, lance les 4 agents pre-prod **en parallèle** dans un seul tour pour maximiser le débit :

1. **qa-hunter** — chasse les bugs en utilisant le produit en live (no mocks). Output : `BUGS.md`
2. **slop-janitor** — détecte duplications, dead code, larp, manques i18n/tests/types. Output : `SLOP.md`
3. **architect-auditor** — graphe de deps, cycles, packages mal isolés, fichiers trop gros. Output : `ARCH.md`
4. **e2e-scripter** — écrit/exécute des tests E2E Playwright sur le vrai stack et vérifie en headful. Output : `E2E_REPORT.md`
5. **parent thread** — mappe chemins code ↔ flows user ↔ tests. Output : `CODE_PATH_COVERAGE.md`

Spawn les 4 dans le **même message** avec 4 appels Agent simultanés (jamais en série).

Une fois les 4 rapports prêts :
- **Lire les rapports** et produire une synthèse `SHIP_CHECK.md` avec :
  - Score ship-readiness (0-10) basé sur : critical bugs, slop kill ratio, cycles deps, couverture E2E
  - **Bloqueurs** (ne pas ship) : tout bug critical/high non résolu, tout cycle deps, toute boundary violation
  - **Warnings** (ship possible mais à fixer en suivi) : slop important, fichiers > 400 LOC, couverture E2E < 80%
  - **Verts** : ce qui passe
- Décision finale : `SHIP / DON'T SHIP / SHIP WITH CAVEATS`
- Écrire `SHIP_PROOF.json` avec `decision`, `commands[]`, `reviewers[]`, `blockers[]`, artefacts et chemins de rapports.
- Lancer ensuite le gate déterministe :
  - si `.claude/scripts/ship-check-gate.ts` existe : `bun .claude/scripts/ship-check-gate.ts .`
  - sinon : `bun ~/.claude/skills/assistant/scripts/ship-check-gate.ts .`
  - si le gate échoue, la décision finale devient `DON'T SHIP` ou `SHIP UNCERTAIN` selon le rapport.

**Discipline** :
- Ne pas générer de code de fix. Le ship-check rapporte uniquement.
- Si headful E2E n'a pas été vérifié visuellement, status = `SHIP UNCERTAIN`
- Pas plus de 3 agents en // après 22h (règle anti-psychose)
