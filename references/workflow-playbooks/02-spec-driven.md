# Playbook 02 — Spec-driven solo + adversarial review

**Philosophie : stratégique — verrouiller le QUOI avant le COMMENT, et le producteur ne note pas sa copie.** Claude t'interviewe (AskUserQuestion, 5-10 rounds sur edge cases/UX/tradeoffs), écrit un `SPEC.md` self-contained, puis `/clear` et exécution en session **fraîche** référençant la spec. Au merge, un subagent en contexte frais (writer≠reviewer) qui ne voit que le diff + critères tente de réfuter.

## Quand
**Grosses features multi-fichiers, décisions d'archi/UX** où une mauvaise assumption coûte cher à défaire. **PAS** pour bug 1-ligne, formatting, CRUD trivial (ROI négatif, ~10× plus lent pour le même résultat).

## Comment l'exécuter
1. « Interviewe-moi en détail avec AskUserQuestion sur l'implémentation, l'UX, les edge cases et les tradeoffs de `<feature>`, puis écris une spec complète dans `SPEC.md`. »
2. Relire/corriger `SPEC.md` jusqu'à ce qu'elle soit **vraiment self-contained** (sanity-check : nomme-t-elle les fichiers ? le hors-scope ? une vérif e2e ?).
3. `/clear` (ou nouvelle session).
4. « Lis `SPEC.md` et implémente-le intégralement, tests inclus. **Montre les preuves.** »
5. Au merge : `/review` ou subagent read-only frais — « Tu ne vois que ce diff + `SPEC.md` ; signale **uniquement** les gaps qui affectent correctness/requirements » (cadrage anti-over-engineering **obligatoire**).
6. Vérif e2e réelle.

## Pourquoi retenu
Couvre la classe où **EPCT seul sature** (features larges, contexte qui re-déborde). L'interview découvre les assumptions quand elles sont bon marché, la fresh session attaque le context exhaustion, l'adversarial review attrape la classe de bugs que la relecture humaine laisse passer. Preuves chiffrées indépendantes (Spec Kit ~10× moins de regen, AWS 40h→8h). **Philosophie distincte d'EPCT** (stratégique vs tactique) → vraie diversité de test.

## Hypothèse de test
Devrait **dominer la justesse-de-cible** et réduire les interruptions humaines sur grosses features, au prix d'un overhead de cérémonie. Faiblesse attendue : perte sèche sur petites tâches ; sous-spécification si l'interview est bâclée (la fresh session hallucine les critères manquants) ; l'adversarial review sur-signale si mal cadré.

## Métrique de succès
Gagne si : (a) écart-intention ≤ 1 **et** interruptions pendant l'implémentation < baseline, (b) la fresh session ne ré-évoque aucune décision déjà rejetée dans l'interview, (c) le reviewer frais attrape ≥1 bug réel non vu par la session principale, **sans** noyer de faux positifs (>70% de findings actionnables).
