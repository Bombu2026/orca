/**
 * types.ts — le contrat d'une MISSION Assistant.
 *
 * Une mission est une CAPACITÉ déclarative et isolée (organiser un dev, parler au nom de
 * l'opérateur, ausculter la machine…). Calqué sur le pattern data-driven du type Capability
 * de lifecycle-audit.ts : un objet const par mission, jamais de logique dans le registre.
 *
 * Trois garanties portées par ce contrat :
 *  - COMPRÉHENSION : `intent` + `triggers` alimentent la Mission Card confirmée avant tout effet.
 *  - ISOLATION : `scopeKind` + `isolation` séparent les contextes (jamais le même thread).
 *  - NON-CONTAMINATION : `allowedWrites`/`deniedWrites` fencent l'écriture au seul périmètre déclaré.
 */

export type ScopeKind = "project" | "machine" | "persona";
export type Isolation = "inline" | "subagent";

export interface MissionManifest {
  /** identifiant court, kebab-case (ex. "machine-health"). */
  id: string;
  /** 1 phrase verdict-first, affichée dans la Mission Card. */
  intent: string;
  /** signaux d'intention (regex) → routage. Le routeur classe, il ne devine pas. */
  triggers: RegExp[];
  /** nature de la cible : un projet, la machine hôte, ou la persona de l'opérateur. */
  scopeKind: ScopeKind;
  /** la mission prend-elle un <path> de projet ? (project=true ; machine/persona ignorent le cwd) */
  needsArg: boolean;
  /** "inline" (thread courant) ou "subagent" (contexte neuf, jeté après — jamais un skill séparé). */
  isolation: Isolation;
  /** globs ABSOLUS où la mission a le droit d'écrire. ${TARGET}, ${ASSISTANT_DIR}, ~ supportés. SEULE zone d'écriture. */
  allowedWrites: string[];
  /** globs explicitement interdits. ${ASSISTANT_DIR}/** est ajouté d'office sauf allowSelf. */
  deniedWrites: string[];
  /** true = mission de self-maintenance d'Assistant (lève l'interdiction d'écrire dans son propre arbre). */
  allowSelf?: boolean;
  /** filtre --project forcé pour recall.ts (null = la mission ne lit aucune mémoire projet). */
  recallScope: string | null;
  /** chemin du script à SPAWN (relatif à la racine du repo). Le cœur ne l'importe jamais. */
  handler: string;
  /** contrat : toute mission est archivable. */
  removable: true;
  /** procédure inverse, livrée DÈS la création (le découplage se pense d'emblée). */
  restore: string;
}
