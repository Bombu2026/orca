---
name: ship-vitrine
description: Workflow ship complet pour projet vitrine — lint + typecheck + build + motion-audit + perf-audit + a11y-audit + Lighthouse CI + Vercel preview deploy. Génère lien partageable client.
model: claude-opus-4-8
---

# /ship-vitrine

Ship le projet vitrine après tous les gates.

Séquence :
1. `bun run lint` — zéro erreur
2. `bun run typecheck` — strict mode
3. `bun run build` — Turbopack production build
4. Skill `motion-audit` — toutes sections passent
5. Agent `design-critic` — review visuelle (AI-slop + cohérence MOODBOARD)
6. Agent `perf-auditor` — Lighthouse CI local (desktop + mobile) sur `bun run start`
7. Agent `perf-auditor` a11y audit (contrast, keyboard, alt, focus-visible)
8. Écris les preuves dans `BUGS.md`, `SLOP.md`, `ARCH.md`, `CODE_PATH_COVERAGE.md`, `E2E_REPORT.md`, `SHIP_CHECK.md`, `SHIP_PROOF.json`
9. Lance la gate déterministe :
   ```bash
   if [ -f .claude/scripts/ship-check-gate.ts ]; then
     bun .claude/scripts/ship-check-gate.ts .
   else
     bun ~/.claude/skills/assistant/scripts/ship-check-gate.ts .
   fi
   ```
10. Si tous gates pass → `vercel --prod false` (preview deploy sur cdg1)
11. Récupère URL preview → format lien partageable client + QR code (optionnel)
12. Commit final : "ship: preview ready" — jamais auto, propose seulement

Si un gate fail : **stop** et rapporte. Pas de bypass.

Arguments : `$ARGUMENTS` — `--skip-lighthouse` pour skip (pas recommandé), `--no-deploy` pour dry-run.
