# Assistant Memory Hygiene

Mémoire Claude Code : `~/.claude/projects/<slug>/memory/`.

## Inventory

1. Calculer le slug depuis le chemin absolu du projet.
2. Lire `MEMORY.md`.
3. Lire chaque fichier référencé.
4. Lister les fichiers non référencés.

## Diagnose

Vérifier chaque fichier :

- Frontmatter : `name`, `description`, `type`.
- Type dans `user`, `feedback`, `project`, `reference`.
- Un seul topic.
- Toujours vrai selon le code actuel.
- Pas d'état éphémère.
- Pas de doublon.
- Descriptions assez spécifiques.

## Act

- Supprimer l'éphémère.
- Fusionner les doublons.
- Corriger les claims stales.
- Seeder les fichiers manquants :
  - `user_role.md`
  - `project_purpose.md`
  - `project_stack.md`
  - `feedback_conventions.md`
  - `reference_claude_md.md`
  - `progress.md`
  - `feature-checklist.md`
- Réécrire `MEMORY.md` en ordre sémantique : user, project, feedback, reference.

## Corrections Queue

Utiliser :

```bash
bun run memory:corrections capture
bun run memory:corrections list
bun run memory:corrections graduate --id=<id>
bun run memory:corrections prune --max=200
```

Ne graduate une correction que si elle est durable et utile hors de la session.

## Report

Format court :

```text
Memory hygiene: +N seeded, -M removed, ~K updated, index rewritten.
```
