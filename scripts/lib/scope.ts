#!/usr/bin/env bun

/**
 * scope.ts — moteur du scope-fence des missions Assistant.
 *
 * Source unique de vérité pour :
 *  - canonicaliser un chemin (même un fichier pas encore créé), à travers les symlinks
 *    (un appel via ~/.claude/skills/assistant et le vrai repo résolvent à l'identique) ;
 *  - matcher un chemin contre des globs d'écriture autorisés/refusés (Bun.Glob natif) ;
 *  - calculer le scope concret d'une mission à partir de son manifeste + sa cible ;
 *  - armer/désarmer un scope PAR SESSION (deux sessions parallèles ne se marchent pas dessus) ;
 *  - resolveTarget : garde dogfood qui refuse d'écrire dans l'arbre d'Assistant.
 *
 * Le hook scope-fence.ts (couche A, intercepte le LLM) ET les scripts Bun (couche B,
 * via resolveTarget) consomment ce module — aucune logique de fence dupliquée.
 *
 * CLI :  bun scripts/lib/scope.ts arm <missionId> <target> [--session <id>]
 *        bun scripts/lib/scope.ts disarm [--session <id>]
 *        bun scripts/lib/scope.ts status [--session <id>]
 *        bun scripts/lib/scope.ts check  <path>          [--session <id>]
 */

import { lstatSync, readlinkSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "fs";
import { join, resolve, isAbsolute } from "path";
import { homedir } from "os";
import type { MissionManifest } from "../missions/types";

// Racine du repo = deux niveaux au-dessus de scripts/lib/, CANONICALISÉE : un appel via
// le symlink ~/.claude/skills/assistant et le vrai chemin pointent vers la même cible.
export const ASSISTANT_DIR = canonical(join(import.meta.dir, "..", ".."));

const HOME = process.env.ASSISTANT_HOME ?? homedir();
export const SCOPE_DIR = join(HOME, ".assistant", "scopes");

// ---------------------------------------------------------------------------
// Denylist NOYAU — la serrure que le gardien ne peut pas modifier
// ---------------------------------------------------------------------------

/**
 * Zones de l'arbre d'Assistant qu'AUCUNE mission ne peut écrire — même une mission de
 * self-maintenance (`allowSelf: true`). Injectée dans `deniedWrites` de TOUT scope calculé,
 * AVANT allowedWrites et JAMAIS levée par allowSelf. Conséquence : une future mission
 * self-improvement (auto-merge) ne peut PAS réécrire le code exécutable, le fence lui-même,
 * les manifestes (anti élévation de privilège : elle ne se vote pas de nouveaux droits),
 * le câblage des hooks, la skill, le manifeste npm, ni les tests. Seules des données/docs
 * INERTES re-dérivables (ex. `references/workflows-benchmark.jsonl`, playbooks markdown)
 * restent écrivables par une mission allowSelf. C'est le mur porteur de la gouvernance
 * auto-merge : le signal mesurable franchit la frontière, le code jamais sans PR humaine.
 */
export const CORE_DENYLIST: string[] = [
  "${ASSISTANT_DIR}/scripts/**", // tout code exécutable : couvre scope.ts, scope-fence.ts, missions/**, merge-gate.ts
  "${ASSISTANT_DIR}/.claude/settings*.json", // câblage des hooks (la serrure se déclare ici)
  "${ASSISTANT_DIR}/SKILL.md", // la définition de la skill
  "${ASSISTANT_DIR}/CLAUDE.md",
  "${ASSISTANT_DIR}/.claude/CLAUDE.md",
  "${ASSISTANT_DIR}/AGENTS.md",
  "${ASSISTANT_DIR}/package.json", // scripts npm + dépendances
  "${ASSISTANT_DIR}/tests/**", // la preuve : une mission ne réécrit pas ses propres tests
];

/**
 * Un chemin sentinelle par zone protégée — pour VÉRIFIER (registry.validate, self-check,
 * tests) qu'un manifeste ne s'octroie pas l'écriture dans la denylist noyau via son
 * `allowedWrites`. Renvoie des chemins ABSOLUS réels (ASSISTANT_DIR déjà résolu).
 */
export function coreDenylistSentinels(): string[] {
  return [
    `${ASSISTANT_DIR}/scripts/lib/scope.ts`,
    `${ASSISTANT_DIR}/scripts/missions/scope-fence.ts`,
    `${ASSISTANT_DIR}/scripts/missions/probe.mission.ts`,
    `${ASSISTANT_DIR}/scripts/workflow-bench.ts`,
    `${ASSISTANT_DIR}/tests/probe.ts`,
    `${ASSISTANT_DIR}/SKILL.md`,
    `${ASSISTANT_DIR}/CLAUDE.md`,
    `${ASSISTANT_DIR}/.claude/CLAUDE.md`,
    `${ASSISTANT_DIR}/.claude/settings.json`,
    `${ASSISTANT_DIR}/.claude/settings.local.json`,
    `${ASSISTANT_DIR}/AGENTS.md`,
    `${ASSISTANT_DIR}/package.json`,
  ];
}

// ---------------------------------------------------------------------------
// Canonicalisation
// ---------------------------------------------------------------------------

/**
 * Canonicalise un chemin qui peut NE PAS encore exister (cas d'un fichier en création).
 * Marche segment par segment depuis la racine et résout CHAQUE symlink rencontré — même
 * un symlink PENDANT (dangling, cible inexistante), via lstat+readlink. Sans ça, écrire
 * « à travers » un lien créé in-scope (ln -s /dehors in-scope/porte) s'échapperait du fence
 * alors que matchAny verrait un chemin in-scope. Ne lève jamais. Garde anti-boucle de liens.
 */
export function canonical(p: string, _depth = 0): string {
  const abs = isAbsolute(p) ? p : resolve(process.cwd(), p);
  if (_depth > 40) return abs; // boucle de symlinks → on s'arrête
  const segs = abs.split("/").filter(Boolean);
  let cur = "/";
  for (let i = 0; i < segs.length; i++) {
    const next = cur === "/" ? `/${segs[i]}` : `${cur}/${segs[i]}`;
    const st = lstatSync(next, { throwIfNoEntry: false });
    if (!st) {
      // segment inexistant → le reste est une queue littérale (fichier/dossier en création)
      return segs.slice(i).reduce((acc, s) => `${acc}/${s}`, cur === "/" ? "" : cur) || "/";
    }
    if (st.isSymbolicLink()) {
      // lien (même dangling) : on résout sa cible AVANT de continuer. Un lien relatif se
      // résout contre le dossier QUI CONTIENT le lien (= cur), conformément à POSIX.
      const link = readlinkSync(next);
      const resolved = isAbsolute(link) ? link : `${cur === "/" ? "" : cur}/${link}`;
      cur = canonical(resolved, _depth + 1);
    } else {
      cur = next;
    }
  }
  return cur;
}

/** Étend ~, ${ASSISTANT_DIR} et ${TARGET} dans une spec de glob. */
function expand(spec: string, target?: string): string {
  let s = spec;
  if (s === "~") s = HOME;
  else if (s.startsWith("~/")) s = join(HOME, s.slice(2));
  s = s.replaceAll("${ASSISTANT_DIR}", ASSISTANT_DIR);
  if (target) s = s.replaceAll("${TARGET}", target);
  return s;
}

/**
 * Canonicalise le PRÉFIXE littéral d'un glob (avant le premier métacaractère) pour que
 * le matching survive aux symlinks, tout en gardant la queue glob intacte.
 */
function canonicalizeGlob(pattern: string): string {
  const metaIdx = pattern.search(/[*?[{]/);
  if (metaIdx === -1) return canonical(pattern);
  const slashBefore = pattern.lastIndexOf("/", metaIdx);
  if (slashBefore <= 0) return pattern; // glob relatif sans tête → tel quel
  return canonical(pattern.slice(0, slashBefore)) + pattern.slice(slashBefore);
}

/** Vrai si `path` matche au moins un des globs (specs déjà étendues). */
export function matchAny(path: string, specs: string[]): boolean {
  const p = canonical(path);
  return specs.some((spec) => {
    const cg = canonicalizeGlob(expand(spec));
    if (p === cg || p.startsWith(cg.replace(/\/$/, "") + "/")) return true;
    return new Bun.Glob(cg).match(p);
  });
}

// ---------------------------------------------------------------------------
// Scope actif (par session)
// ---------------------------------------------------------------------------

export interface ActiveScope {
  missionId: string;
  sessionId: string;
  scopeKind: string;
  target: string; // canonical
  allowedWrites: string[]; // specs (${TARGET} déjà substitué)
  deniedWrites: string[];
  armedAt: string;
}

function scopeFile(sessionId: string): string {
  const safe = sessionId.replace(/[^a-zA-Z0-9_-]/g, "_") || "default";
  return join(SCOPE_DIR, `active-${safe}.json`);
}

export function readActiveScope(sessionId: string): ActiveScope | null {
  try {
    return JSON.parse(readFileSync(scopeFile(sessionId), "utf-8")) as ActiveScope;
  } catch {
    return null;
  }
}

export function computeScope(m: MissionManifest, target: string, sessionId: string): ActiveScope {
  const tgt = canonical(target);
  const sub = (s: string) => s.replaceAll("${TARGET}", tgt);
  const denied = m.deniedWrites.map(sub);
  // Denylist NOYAU : injectée pour TOUTE mission et JAMAIS levée par allowSelf — la serrure
  // que le gardien ne peut pas modifier (anti élévation de privilège). denyReason teste
  // deniedWrites EN PREMIER, donc elle l'emporte même si allowedWrites recouvrait la zone.
  denied.push(...CORE_DENYLIST);
  // Invariant dogfood : sauf mission self-maintenance explicite, le RESTE de l'arbre
  // d'Assistant est aussi interdit — codé, plus jamais une simple phrase de doctrine.
  if (!m.allowSelf) denied.push("${ASSISTANT_DIR}/**");
  return {
    missionId: m.id,
    sessionId,
    scopeKind: m.scopeKind,
    target: tgt,
    allowedWrites: m.allowedWrites.map(sub),
    deniedWrites: denied,
    armedAt: new Date().toISOString(),
  };
}

export function arm(scope: ActiveScope): void {
  mkdirSync(SCOPE_DIR, { recursive: true });
  writeFileSync(scopeFile(scope.sessionId), JSON.stringify(scope, null, 2));
}

export function disarm(sessionId: string): void {
  try {
    rmSync(scopeFile(sessionId));
  } catch {
    /* déjà absent */
  }
}

/**
 * Décision de fence partagée. Retourne `null` si l'écriture est autorisée, sinon une
 * raison (string) lisible. Règle : BLOQUER si (match deniedWrites) OU (hors allowedWrites).
 */
export function denyReason(path: string, scope: ActiveScope): string | null {
  if (matchAny(path, scope.deniedWrites)) {
    return `chemin dans la zone interdite de la mission « ${scope.missionId} »`;
  }
  if (!matchAny(path, scope.allowedWrites)) {
    return `chemin hors zone autorisée de la mission « ${scope.missionId} »`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Garde côté script (couche B) — refus dogfood d'écrire dans l'arbre d'Assistant
// ---------------------------------------------------------------------------

/**
 * Résout la cible d'un script d'écriture (organise, lifecycle, generate-config…) et
 * REFUSE (exit 2) si elle tombe dans l'arbre d'Assistant — sauf --self explicite.
 * Le hook (couche A) ne voit pas les writeFileSync internes : ce garde les couvre.
 */
export function resolveTarget(arg: string | undefined, opts: { allowSelf?: boolean } = {}): string {
  const raw = arg && !arg.startsWith("--") ? arg : process.cwd();
  const t = canonical(raw);
  const inSelf = t === ASSISTANT_DIR || t.startsWith(ASSISTANT_DIR + "/");
  if (inSelf && !opts.allowSelf) {
    console.error(
      `[scope] Refus d'écrire dans l'arbre d'Assistant (${ASSISTANT_DIR}).\n` +
        `        Dogfood : un auditeur ne travaille jamais sur son propre repo.\n` +
        `        Pour une self-maintenance légitime, passe --self.`,
    );
    process.exit(2);
  }
  return t;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

if (import.meta.main) {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const positionals = args.slice(1).filter((a) => !a.startsWith("--"));
  const sessIdx = args.indexOf("--session");
  const sessionId = sessIdx !== -1 ? (args[sessIdx + 1] ?? "default") : (process.env.CLAUDE_SESSION_ID ?? "default");

  if (cmd === "arm") {
    const [missionId, target] = positionals;
    if (!missionId || !target) {
      console.error("usage: scope.ts arm <missionId> <target> [--session <id>]");
      process.exit(1);
    }
    const { loadMissions } = await import("../missions/registry");
    const m = (await loadMissions()).find((x) => x.id === missionId);
    if (!m) {
      console.error(`mission inconnue: ${missionId}`);
      process.exit(1);
    }
    const scope = computeScope(m, target, sessionId);
    arm(scope);
    console.log(`armé · mission=${scope.missionId} · cible=${scope.target}`);
    console.log(`  autorisé: ${scope.allowedWrites.join(", ")}`);
    console.log(`  interdit: ${scope.deniedWrites.join(", ")}`);
  } else if (cmd === "disarm") {
    disarm(sessionId);
    console.log(`désarmé (session ${sessionId})`);
  } else if (cmd === "status") {
    const s = readActiveScope(sessionId);
    console.log(s ? JSON.stringify(s, null, 2) : `aucun scope armé (session ${sessionId})`);
  } else if (cmd === "check") {
    const [p] = positionals;
    const s = readActiveScope(sessionId);
    if (!p) {
      console.error("usage: scope.ts check <path> [--session <id>]");
      process.exit(1);
    }
    if (!s) {
      console.log(`ALLOW (aucun scope armé · legacy) — ${canonical(p)}`);
      process.exit(0);
    }
    const reason = denyReason(p, s);
    console.log(reason ? `DENY  ${canonical(p)} — ${reason}` : `ALLOW ${canonical(p)}`);
    process.exit(reason ? 2 : 0);
  } else {
    console.error("commandes: arm | disarm | status | check");
    process.exit(1);
  }
}
