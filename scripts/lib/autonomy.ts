#!/usr/bin/env bun

/**
 * autonomy.ts — l'Autonomy Card de /assistant.
 *
 * Faire tourner Opus en autonomie des heures/jours tient à 6 leviers. À CHAQUE
 * cold-start, /assistant les passe en revue pour qu'aucun ne soit oublié :
 *
 *   1. Permissions auto   — Claude n'attend pas une validation à chaque action.
 *   2. Workflows dynamiques — orchestrer des dizaines/centaines d'agents (Workflow/ultracode).
 *   3. /loop · /goal      — nudge pour que la session ne s'arrête pas avant que ce soit fini.
 *   4. Cloud              — laptop fermé : session dans l'app desktop/mobile.
 *   5. Self-verify E2E    — Claude peut vérifier son travail en vrai (navigateur/curl/sim),
 *                           sinon « fonctionnel » est un bluff (doctrine CLAUDE.md).
 *   6. Rule of Two        — sécurité agentique : refuse l'autonomie non surveillée si la lethal
 *                           trifecta (données privées + contenu non fiable + action sortante) est réunie.
 *
 * Honnêteté technique : un script Bun ne PEUT PAS activer les leviers 1 et 4 (réglages de
 * lancement / d'environnement de la session, pas du filesystem). Pour ceux-là, la carte
 * DÉTECTE au mieux puis RAPPELLE l'action exacte — jamais un faux « activé ». Les leviers
 * 2/3 sont des capacités du harness (toujours dispo → rappel d'usage). Le levier 5 est le
 * seul vraiment auditable côté projet : son absence sur un type qui en a besoin est un
 * GAP BLOQUANT, cohérent avec la règle « trois preuves indirectes ≠ une preuve directe ».
 *
 * Lecture seule : aucune écriture → hors périmètre du scope-fence. Consommé par organise.ts.
 *
 * CLI :  bun scripts/lib/autonomy.ts <target> [--type=<projectType>] [--json]
 */

import { existsSync } from "fs";
import { join } from "path";
import { HOME, readJson, mcpServerNames, setIncludesToken } from "./cc-config";
import { detectTrifecta, ruleOfTwo } from "./rule-of-two";

export type LeverState = "armed" | "partial" | "missing" | "reminder";

export interface Lever {
  id: "permissions" | "workflows" | "loop-goal" | "cloud" | "self-verify" | "rule-of-two";
  label: string;
  state: LeverState;
  detail: string;
  /** Seul un levier réellement manquant ET requis bloque (self-verify). */
  blocking?: boolean;
}

export interface AutonomyReport {
  levers: Lever[];
  /** Lignes pré-formatées pour le terminal (indent + marqueur). */
  lines: string[];
  /** Lignes Markdown pour QUALITY_SCORE.md. */
  md: string[];
  /** Nombre de leviers bloquants (self-verify manquant). */
  blockers: number;
}

const MARKS: Record<LeverState, string> = {
  armed: "OK",
  partial: "~ ",
  missing: "X ",
  reminder: "· ",
};

// HOME, readJson, mcpServerNames, setIncludesToken : importés de ./cc-config (partagé avec onboarding.ts).

// ---------------------------------------------------------------------------
// Lecture best-effort de la config (jamais ne lève)
// ---------------------------------------------------------------------------

/** defaultMode peut vivre top-level ou sous `permissions` selon la version de settings.json. */
function defaultModeOf(cfg: Record<string, unknown> | null): string | null {
  if (!cfg) return null;
  const top = cfg["defaultMode"];
  if (typeof top === "string") return top;
  const perms = cfg["permissions"];
  if (perms && typeof perms === "object") {
    const dm = (perms as Record<string, unknown>)["defaultMode"];
    if (typeof dm === "string") return dm;
  }
  return null;
}

function pkgScripts(target: string): Record<string, unknown> {
  const pkg = readJson(join(target, "package.json"));
  const s = pkg?.["scripts"];
  return s && typeof s === "object" ? (s as Record<string, unknown>) : {};
}

/** Noms de toutes les dépendances déclarées — alimente la détection de la lethal trifecta. */
function depNames(target: string): string[] {
  const pkg = readJson(join(target, "package.json"));
  const out: string[] = [];
  for (const k of ["dependencies", "devDependencies", "peerDependencies"]) {
    const d = pkg?.[k];
    if (d && typeof d === "object") out.push(...Object.keys(d as Record<string, unknown>));
  }
  return out;
}

/** Compare deux versions "x.y.z" — retourne <0, 0, >0 (segments manquants = 0). */
function cmpVersion(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

// Versions minimales vérifiées (doc officielle code.claude.com, 2026-06) :
// /loop ≥ 2.1.72 · /goal ≥ 2.1.139. L'évaluateur /goal ne lit QUE le transcript.
const GOAL_MIN = "2.1.139";
const LOOP_MIN = "2.1.72";

// ---------------------------------------------------------------------------
// Détection des 6 leviers
// ---------------------------------------------------------------------------

export function autonomyCard(opts: { target: string; projectType: string | null; ccVersion?: string | null }): AutonomyReport {
  const { target } = opts;
  const type = opts.projectType ?? "unknown";
  const cc = opts.ccVersion ?? null;

  // --- 1. Permissions auto (non vérifiable en runtime → best-effort + rappel) ---
  const autoModes = new Set(["acceptEdits", "bypassPermissions"]);
  const configuredMode =
    defaultModeOf(readJson(join(target, ".claude", "settings.local.json"))) ??
    defaultModeOf(readJson(join(target, ".claude", "settings.json"))) ??
    defaultModeOf(readJson(join(HOME, ".claude", "settings.json")));
  const permissions: Lever =
    configuredMode && autoModes.has(configuredMode)
      ? { id: "permissions", label: "Permissions", state: "armed", detail: `defaultMode=${configuredMode} configuré — Claude n'attend pas tes validations.` }
      : {
          id: "permissions",
          label: "Permissions",
          state: "reminder",
          detail: "non lisible en runtime — pour tenir des heures : /config → Auto-accept, ou relance `claude --permission-mode acceptEdits`.",
        };

  // --- 2. Workflows dynamiques (capacité harness → toujours dispo) ---
  const wfDir = join(target, ".claude", "workflows");
  const hasWfDir = existsSync(wfDir);
  const workflows: Lever = {
    id: "workflows",
    label: "Workflows",
    state: "armed",
    detail: hasWfDir
      ? "Workflow dispo + .claude/workflows/ présent — sur une grosse tâche, dis « ultracode » pour fan-out massif d'agents."
      : "Workflow dispo — sur une tâche lourde, dis « ultracode » pour orchestrer des dizaines d'agents en parallèle.",
  };

  // --- 3. /loop · /goal (gated par la version CC — jamais un faux « armed ») ---
  // /goal : condition PROUVABLE PAR OUTPUT (l'évaluateur ne lit aucun fichier, que le
  // transcript) + clause de borne. /loop : polling, /loop 30m /assistant reconverge seul.
  const goalTip = `/goal "<condition prouvable par output, ex. bun run check exit 0> or stop after 20 turns"`;
  const loopTip = `/loop 30m /assistant`;
  const loopGoal: Lever = ((): Lever => {
    const base = { id: "loop-goal" as const, label: "/loop · /goal" };
    if (cc && cmpVersion(cc, GOAL_MIN) >= 0)
      return { ...base, state: "armed", detail: `tâche longue : ${goalTip} (preuve dans le transcript, pas un fichier) · polling : ${loopTip}.` };
    if (cc && cmpVersion(cc, LOOP_MIN) >= 0)
      return { ...base, state: "partial", detail: `/goal indisponible (CC ${cc} < ${GOAL_MIN}) → npm i -g @anthropic-ai/claude-code@latest. En attendant : ${loopTip}.` };
    if (cc)
      return { ...base, state: "missing", detail: `CC ${cc} : ni /loop (≥ ${LOOP_MIN}) ni /goal (≥ ${GOAL_MIN}) → upgrade obligatoire pour les boucles autonomes.` };
    return { ...base, state: "reminder", detail: `version CC non détectée — /goal exige ≥ ${GOAL_MIN}, /loop ≥ ${LOOP_MIN}. Si à jour : ${goalTip}.` };
  })();

  // --- 4. Cloud (non détectable → rappel pur) ---
  const cloud: Lever = {
    id: "cloud",
    label: "Cloud",
    state: "reminder",
    detail: "ferme le laptop : reprends la session dans l'app desktop/mobile Claude Code (exécution cloud).",
  };

  // --- 5. Self-verify E2E (le seul vraiment auditable → bloquant si manquant) ---
  const scripts = pkgScripts(target);
  const canRun = ["dev", "start", "serve", "preview"].some((k) => k in scripts) || existsSync(join(target, "Procfile"));
  const mcp = mcpServerNames(target);
  const playwright = setIncludesToken(mcp, "playwright") || setIncludesToken(mcp, "chrome");
  const browse = existsSync(join(target, ".claude", "skills", "browse")) || existsSync(join(HOME, ".claude", "skills", "browse"));
  const sim = setIncludesToken(mcp, "computer-use") || setIncludesToken(mcp, "ios") || setIncludesToken(mcp, "android");
  const browserVerify = playwright || browse;

  const selfVerify = ((): Lever => {
    const base = { id: "self-verify" as const, label: "Self-verify" };
    if (type === "web-fullstack" || type === "website-showcase" || type === "design-only") {
      if (browserVerify && (canRun || type === "design-only"))
        return { ...base, state: "armed", detail: `${playwright ? "Playwright MCP" : "skill browse"} dispo${canRun ? " + serveur lançable" : ""} — pilote le rendu réel avant de dire « fonctionnel ».` };
      if (browserVerify && !canRun)
        return { ...base, state: "partial", detail: `${playwright ? "Playwright" : "browse"} OK mais aucune commande de serveur (package.json dev/start) — ajoute-la pour servir l'app.` };
      return { ...base, state: "missing", blocking: true, detail: "type web sans Playwright MCP ni skill browse — impossible d'auto-vérifier l'UI → ajoute l'un des deux, sinon « fonctionnel » = bluff." };
    }
    if (type === "api-backend") {
      if (canRun) return { ...base, state: "armed", detail: "serveur démarrable + curl via Bash — vérifie payload réel ET état persisté, pas juste HTTP 200." };
      return { ...base, state: "missing", blocking: true, detail: "API sans commande de démarrage (package.json dev/start) — ajoute-la pour pouvoir curl en réel." };
    }
    if (type === "bot-agent") {
      if (canRun) return { ...base, state: "armed", detail: "lancement dispo — rejoue l'agent de bout en bout sur un vrai input." };
      return { ...base, state: "partial", detail: "ajoute une commande de lancement pour rejouer l'agent end-to-end avant de livrer." };
    }
    if (type === "cli-tool") {
      const hasBin = !!readJson(join(target, "package.json"))?.["bin"] || canRun;
      if (hasBin) return { ...base, state: "armed", detail: "exécutable lançable — teste la vraie commande sur un cas réel, pas un --help." };
      return { ...base, state: "partial", detail: "expose un bin/commande pour exécuter le CLI réel en vérification." };
    }
    // unknown / autres
    const extra = sim ? " (sim mobile MCP détecté)" : "";
    return { ...base, state: "reminder", detail: `type indéterminé${extra} — garantis UN moyen de rejouer le produit de bout en bout (navigateur/curl/sim) avant « fini ».` };
  })();

  // --- 6. Rule of Two (lethal trifecta) — sécurité de l'autonomie ; bloquant si trifecta sans humain ---
  // Best-effort depuis les deps + le type. humanInLoop inconnu au scan → conservateur (false) : une
  // trifecta complète devient un gap BLOQUANT (on refuse l'autonomie non surveillée plutôt que de mentir).
  const tri = detectTrifecta(depNames(target), type);
  const r2 = ruleOfTwo(tri, false);
  const ruleOfTwoLever: Lever =
    r2.verdict === "ALLOW"
      ? { id: "rule-of-two", label: "Rule of Two", state: "armed", detail: r2.reason }
      : { id: "rule-of-two", label: "Rule of Two", state: "missing", blocking: true, detail: r2.reason };

  const levers: Lever[] = [permissions, workflows, loopGoal, cloud, selfVerify, ruleOfTwoLever];

  const lines = levers.map((l) => `   [${MARKS[l.state]}] ${l.label.padEnd(14)} ${l.detail}`);
  const md = levers.map((l) => `- **[${MARKS[l.state].trim()}] ${l.label}** — ${l.detail}${l.blocking ? " _(gap bloquant)_" : ""}`);
  const blockers = levers.filter((l) => l.blocking).length;

  return { levers, lines, md, blockers };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

if (import.meta.main) {
  const args = process.argv.slice(2);
  const target = args.find((a) => !a.startsWith("--")) ?? process.cwd();
  const typeArg = args.find((a) => a.startsWith("--type="));
  const type = typeArg ? typeArg.slice("--type=".length) : null;
  const ccArg = args.find((a) => a.startsWith("--cc="));
  const report = autonomyCard({ target, projectType: type, ccVersion: ccArg ? ccArg.slice("--cc=".length) : null });
  if (args.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("\n  Autonomie (faire tourner Opus en continu) :");
    console.log(report.lines.join("\n"));
    if (report.blockers) console.log(`\n  ${report.blockers} levier bloquant — self-verify manquant : « fonctionnel » non prouvable.`);
    console.log("");
  }
}
