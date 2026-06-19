import type { MissionManifest } from "./types";

/**
 * dev-organizer — la mission historique d'Assistant : organiser/auditer un projet de dev.
 *
 * Son handler EST organise.ts, INCHANGÉ (on enveloppe, on ne réécrit pas) : le câblage
 * organise → lifecycle-audit reste intact. La seule nouveauté Mois 1 : organise refuse
 * désormais d'écrire dans l'arbre d'Assistant (resolveTarget, sauf --self).
 *
 * scopeKind=project → la cible est un <path> de projet ; le routage par ÉTAT interne de
 * organise (SEED/DIRTY/BOOTSTRAP/NEXT-GAP) reste l'outil pour choisir la BRANCHE, une fois
 * la mission choisie par intention.
 */
const devOrganizer: MissionManifest = {
  id: "dev-organizer",
  intent: "Organiser/auditer un projet de dev → verdict /10 + 3 gaps + 1 action + prescription",
  triggers: [
    /\/assistant\b|organise mon dev|configure ce projet/i,
    /\baudit\b|check mon projet|qu'est-ce que je rate|optimi[sz]e/i,
    /\/ship100\b|ship\s?100|pleine puissance|\/conseil\b|board produit/i,
    /\bbootstrap\b|nouveau projet|initialise ce projet/i,
  ],
  scopeKind: "project",
  needsArg: true,
  isolation: "inline", // déjà ~5s, stateless — pas besoin d'un subagent
  allowedWrites: ["${TARGET}/**"],
  deniedWrites: [], // ${ASSISTANT_DIR}/** injecté d'office (allowSelf absent)
  recallScope: null, // le scoping mémoire forcé arrive au Mois 4
  handler: "scripts/organise.ts",
  removable: true,
  restore:
    "git rm scripts/missions/dev-organizer.mission.ts — dev-organizer redevient le cold-start direct via SKILL.md (organise.ts reste l'entrée inchangée).",
};

export default devOrganizer;
