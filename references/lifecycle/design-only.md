# Definition of Done — `design-only`

> **Pour qui :** un fondateur non-tech. Chaque case = ce qu'un **studio produit/design de classe
> mondiale** livrerait pour un projet **purement design** (fichiers `.pen` Pencil, maquettes,
> design system) — **avant** que la moindre ligne de code applicatif existe. `/assistant` coche
> À TA PLACE, une étape à la fois, et ne dit **« design fini »** que quand **toutes les cases
> applicables sont vertes avec preuve directe** (maquette ouverte, parcours cliquable parcouru,
> tokens exportés) — **jamais** sur « le fichier existe ».
>
> **Spécificité design-only :** **pas de code serveur, pas d'auth, pas de DB, pas de paiements,
> pas de CI/CD applicatif, pas de tests E2E navigateur.** Ce qui compte : **complétude des écrans,
> cohérence du design system, accessibilité du design (contraste/tailles), prototype cliquable,
> et un handoff propre vers le dev.** La preuve directe = ouvrir le fichier de design et parcourir
> le prototype. C'est aussi le **point de départ** d'un futur `web-fullstack` / `website-showcase`.
>
> **Comment lire :** explication en clair · **levier `/assistant`** réel · `(si applicable)` ·
> `(à construire)` = gap réel signalé.
>
> **Type détecté par** `scripts/detect-project.ts` → `design-only` (présence de fichiers `.pen`,
> intégration `pencil`). Les fichiers `.pen` se manipulent **uniquement** via le MCP `pencil`.

---

## Phase 0 — Cadrage & direction artistique

- [ ] **Brief & moodboard validés** — une page : à quoi sert le produit, pour qui, le ton, et un moodboard qui fixe la direction visuelle.
  Levier : gabarit `references/client-brief-template.md` → `docs/BRIEF.md` + `docs/MOODBOARD.md` ; analyse via `scripts/moodboard-analyzer.ts`.
- [ ] **Repo / dossier + `CLAUDE.md` + mémoire** — le projet de design est rangé et documenté.
  Levier : `/init` → `scripts/generate-config.ts`.
- [ ] **Outil & format posés** — fichier `.pen` (Pencil) ou équivalent, structure claire (pages, écrans).
  Levier : MCP `pencil` (`get_editor_state`, `batch_get`, `batch_design`).

## Phase 1 — Design system (les fondations visuelles)

- [ ] **Tokens de design** — couleurs, typographies, espacements, rayons : définis une fois, réutilisés partout (pas de valeur posée au hasard).
  Levier : `scripts/design-tokens-gen.ts` + variables Pencil (`get_variables` / `set_variables`).
- [ ] **Composants UI réutilisables** — boutons, champs, cartes, en-têtes : une bibliothèque de composants cohérente, prête pour shadcn base-nova côté dev.
  Levier : composants Pencil + `references/ui-registries-catalog.md`.
- [ ] **Typographie pro** — échelle typographique lisible, hiérarchie claire, conforme aux standards 2026.
  Levier : `references/typography-2026.md`.

## Phase 2 — Écrans & parcours (le cœur du design)

- [ ] **Tous les écrans promis** — chaque écran du périmètre est maquetté, y compris les **états oubliés** : vide, chargement, erreur, succès.
  Levier : `batch_design` (Pencil) + checklist des états.
- [ ] **Responsive / multi-format** *(si applicable : web + mobile)* — les écrans clés existent en desktop et mobile, sans incohérence.
  Levier : variantes Pencil + `snapshot_layout`.
- [ ] **Prototype cliquable** — un parcours principal navigable (les écrans sont reliés), pour valider l'expérience avant le code.
  Levier : liens de prototype Pencil ; parcouru et vérifié.
- [ ] **Contenu réel (pas de lorem)** — vrais libellés, vrais exemples ; le design ne « sent pas l'IA » et reflète le vrai produit.
  Levier : revue anti-IA ; visuels non-IA via `references/photo-sources-non-ai.md`.

## Phase 7 — Qualité du design (l'équivalent « tests » ici)

- [ ] **Accessibilité du design (WCAG)** — contrastes suffisants, tailles de texte et de cibles tactiles correctes, états de focus prévus. L'a11y se pense **dès le design**.
  Levier : check contraste/typo ; doctrine `scripts/senior-designer.ts` (WCAG) appliquée à la maquette.
- [ ] **Cohérence & finition** — espacements réguliers, alignements propres, aucune incohérence entre écrans (niveau Awwwards).
  Levier : skill `/senior-designer` (`assistant-senior-designer.md`) + `scripts/design-review.ts` + `scripts/critic-loop.ts`.
- [ ] **Revue design senior** — un œil « directeur artistique » valide la direction, la hiérarchie et la finition avant handoff.
  Levier : `/senior-designer` + `scripts/design-review.ts`.

## Phase 8 — Présentation

- [ ] **Présentation client** *(si applicable)* — les écrans exportés et présentables (PNG/PDF), une narration claire du parcours.
  Levier : `export_nodes` (Pencil) + `get_screenshot`.

## Phase 9 — Handoff vers le développement

- [ ] **Export des tokens & specs** — couleurs/typo/espacements exportés dans un format exploitable par le dev (variables, JSON), specs des composants documentées.
  Levier : `scripts/design-tokens-gen.ts` + `export_nodes` (Pencil).
- [ ] **Assets exportés** — icônes, images, logos exportés aux bons formats/résolutions, nommés proprement.
  Levier : `export_nodes` (Pencil).
- [ ] **Docs de handoff** — `CLAUDE.md` + un document qui explique le design system et le parcours, pour que le dev (ou `/assistant` en mode `web-fullstack`/`website-showcase`) reprenne sans deviner.
  Levier : `scripts/generate-config.ts` + hook `dx.ts`. **Couvert.**
- [ ] **Transition vers le code** *(si applicable : la suite est une app/site)* — relancer `/assistant` une fois le code amorcé : le type bascule vers `website-showcase` ou `web-fullstack`, et la DoD correspondante s'applique.
  Levier : `scripts/detect-project.ts` re-détecte le type + DoD `lifecycle/web-fullstack.md` ou `lifecycle/website-showcase.md`.

---

## Verdict « VRAIMENT FINI » (doctrine)

`/assistant` ne déclare ce `design-only` **fini** que si **toutes les cases applicables sont
vertes**, chacune avec **preuve directe** : maquette ouverte dans Pencil, **tous les états** d'écran
présents, prototype cliquable parcouru, contraste/a11y vérifiés, tokens et assets **réellement
exportés** pour le dev — **jamais** sur « le fichier `.pen` existe ». Pas de code/serveur/tests
applicatifs ici : un design est « fini » quand il est **complet, cohérent, accessible et prêt au
handoff**. Toute case applicable vide = **gap bloquant** dans `QUALITY_SCORE.md`, et `/assistant`
donne **UNE seule prochaine étape** expliquée en clair. Quand le code démarre, la DoD bascule vers
le nouveau type détecté. Extension au **produit** de `/conseil` gate-FINI + `/ship100`.
