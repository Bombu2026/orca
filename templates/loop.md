# Tour de maintenance /assistant — idempotent (un tour = UN gap maximum)

1. **Re-scan** : exécute `bun ~/.claude/skills/assistant/scripts/organise.ts . --json` et lis
   `QUALITY_SCORE.md` + `LIFECYCLE.md` (l'état persistant entre les tours). Compte les `gaps`
   bloquants restants (blockers + auditeurs manquants + prochaine étape DoD).
2. **Borne dure (contrôleur de boucle)** : au 1er tour, CALIBRE le plafond depuis le scan —
   `MAX=$(bun ~/.claude/skills/assistant/scripts/organise.ts . --json | bun ~/.claude/skills/assistant/scripts/loop-controller.ts calibrate)`
   (= `max(5, gaps critiques + auditeurs manquants + étapes DoD bloquantes)`). Puis passe le compte —
   `bun ~/.claude/skills/assistant/scripts/loop-controller.ts tick --session "$CLAUDE_SESSION_ID" --gaps <N> --max-turns "$MAX"`.
   S'il imprime `LOOP STOP:<raison>` (exit 10 — DONE / MAX_TURNS / DEADLINE / NO_PROGRESS), **ARRÊTE-TOI**
   en une ligne : la boucle a atteint sa borne, ne touche plus à rien. La limite est figée au 1er tour
   et n'est PAS modifiable en cours de route. Sinon (`LOOP CONTINUE`), poursuis ce tour.
3. **Arbre sale** : si git rapporte plus de 30 fichiers non commités → STOP, signale-le en une
   ligne, ne touche à rien.
4. Sinon, traite **UN seul** élément, dans cet ordre de priorité :
   1. un gap `[critical]`/`[high]` du score,
   2. la « prochaine étape produit » de `LIFECYCLE.md`,
   3. un auditeur listé dans `auditors` (lance l'agent — model `claude-opus-4-8` — qui écrit
      son rapport `SECURITY_AUDIT.md` / `BACKEND_AUDIT.md` / `A11Y_REPORT.md` / `PERF_REPORT.md`).
5. **Preuve** : ré-exécute le scan — le progrès (score, % DoD) doit apparaître dans ta sortie,
   pas seulement dans un fichier.
6. **Rien à faire** (score ≥ 9/10, DoD verte, zéro rapport manquant) : dis-le en UNE ligne et
   termine sans rien modifier (le contrôleur émettra `STOP:DONE` au tour suivant).

Contraintes : jamais de push ; jamais de commit sans demande explicite ; niveau production par
défaut (pas de `--mock` sauf consigne explicite) ; « fonctionnel » = preuve directe
(navigateur/curl), pas un build vert.
