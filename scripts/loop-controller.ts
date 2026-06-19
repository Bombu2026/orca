#!/usr/bin/env bun

/**
 * loop-controller.ts — bornes DURES d'une boucle autonome /assistant (loop-engineering P2).
 *
 * Principe de l'état de l'art : « the worst outcome is a loop that runs for 6 hours and $40 before
 * anyone notices ». La logique d'arrêt doit vivre dans le CODE CONTRÔLEUR, pas dans des strings
 * de prompt que l'agent peut éditer. Ce script tient l'état d'une boucle (turns, horloge, historique
 * de gaps) HORS du contexte LLM (`~/.assistant/loop-state/<session>.json`) et impose 4 arrêts durs :
 *
 *   - DONE        : 0 gap restant → objectif atteint (succès).
 *   - MAX_TURNS   : turns > plafond → budget de tours épuisé.
 *   - DEADLINE    : wall-clock dépassé → budget temps épuisé.
 *   - NO_PROGRESS : le nb de gaps n'a pas baissé sur une fenêtre → la boucle tourne à vide.
 *
 * Appelé EN TÊTE de chaque tour par `templates/loop.md` : exit 0 = CONTINUE (faire UNE unité de
 * travail) ; exit 10 = STOP (le tour ne doit rien faire d'autre que s'arrêter). Le plafond n'est
 * pas modifiable par l'agent : il est fixé au 1er tick et relu tel quel ensuite.
 *
 * CLI :
 *   bun scripts/loop-controller.ts tick   --session <id> --gaps <n> [--max-turns <n>] [--deadline-min <n>] [--now <ms>]
 *   bun scripts/loop-controller.ts status --session <id>
 *   bun scripts/loop-controller.ts reset  --session <id>
 */

import { mkdirSync, readFileSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const HOME = process.env.ASSISTANT_HOME ?? homedir();
const STATE_DIR = join(HOME, ".assistant", "loop-state");

const DEFAULT_MAX_TURNS = 25;
const DEFAULT_DEADLINE_MIN = 120;
const NO_PROGRESS_WINDOW = 3; // tours sans baisse du nb de gaps avant d'abandonner

export interface LoopState {
  session: string;
  startedAt: number; // ms epoch (premier tick)
  turns: number;
  maxTurns: number;
  deadlineMin: number;
  gapsHistory: number[];
}

export type StopReason = "DONE" | "MAX_TURNS" | "DEADLINE" | "NO_PROGRESS";
export interface TickResult {
  decision: "CONTINUE" | "STOP";
  reason: StopReason | null;
  state: LoopState;
  message: string;
}

function stateFile(session: string): string {
  const safe = session.replace(/[^a-zA-Z0-9_-]/g, "_") || "default";
  return join(STATE_DIR, `${safe}.json`);
}

export function readState(session: string): LoopState | null {
  try {
    return JSON.parse(readFileSync(stateFile(session), "utf-8")) as LoopState;
  } catch {
    return null;
  }
}

export function resetState(session: string): void {
  try {
    rmSync(stateFile(session));
  } catch {
    /* déjà absent */
  }
}

function saveState(s: LoopState): void {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(stateFile(s.session), JSON.stringify(s, null, 2));
}

/**
 * Cœur PUR (testable) : applique un tick à un état (ou en crée un) et rend la décision.
 * Le plafond/échéance ne sont lus des options QU'AU PREMIER tick (création) — ensuite l'état fait foi
 * (l'agent ne peut pas relever sa propre limite en cours de route).
 */
export function applyTick(
  prev: LoopState | null,
  gaps: number,
  now: number,
  opts: { maxTurns?: number; deadlineMin?: number } = {},
): TickResult {
  const state: LoopState = prev
    ? { ...prev, turns: prev.turns + 1, gapsHistory: [...prev.gapsHistory, gaps] }
    : {
        session: "",
        startedAt: now,
        turns: 1,
        maxTurns: opts.maxTurns && opts.maxTurns > 0 ? opts.maxTurns : DEFAULT_MAX_TURNS,
        deadlineMin: opts.deadlineMin && opts.deadlineMin >= 0 ? opts.deadlineMin : DEFAULT_DEADLINE_MIN,
        gapsHistory: [gaps],
      };

  const elapsedMin = (now - state.startedAt) / 60000;
  const tail = state.gapsHistory.slice(-(NO_PROGRESS_WINDOW + 1));
  const noProgress =
    tail.length > NO_PROGRESS_WINDOW && gaps > 0 && gaps >= (tail[0] ?? Infinity);

  let reason: StopReason | null = null;
  if (gaps <= 0) reason = "DONE";
  else if (state.turns > state.maxTurns) reason = "MAX_TURNS";
  else if (elapsedMin > state.deadlineMin) reason = "DEADLINE";
  else if (noProgress) reason = "NO_PROGRESS";

  const decision = reason ? "STOP" : "CONTINUE";
  const budget = `turn ${state.turns}/${state.maxTurns} · gaps=${gaps} · ${elapsedMin.toFixed(1)}min/${state.deadlineMin}min`;
  const message = reason ? `LOOP STOP:${reason} · ${budget}` : `LOOP CONTINUE · ${budget}`;
  return { decision, reason, state, message };
}

export interface OrganiseSnapshot {
  blockers?: Array<{ severity?: string }>;
  spawnPlan?: unknown[];
  auditors?: unknown[];
  lifecycle?: { missingCapabilities?: Array<{ severity?: string }> } | null;
}

/**
 * Plafond de tours AUTO-CALIBRÉ depuis `organise --json` : max(5, gaps critiques + auditeurs
 * manquants + étapes DoD bloquantes). Le plancher 5 garantit toujours quelques cycles utiles ; le
 * reste échelonne le budget sur la dette RÉELLE du projet (au lieu d'un 25 arbitraire). Pur, testable.
 */
export function calibrateMaxTurns(o: OrganiseSnapshot | null | undefined): number {
  const critical = (o?.blockers ?? []).filter((b) => b?.severity === "critical").length;
  const auditors = (o?.spawnPlan ?? o?.auditors ?? []).length;
  const dodBlockers = (o?.lifecycle?.missingCapabilities ?? []).filter((m) => m?.severity === "blocker").length;
  return Math.max(5, critical + auditors + dodBlockers);
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const flag = (k: string): string | null => {
    const a = args.find((x) => x.startsWith(`--${k}=`));
    if (a) return a.slice(k.length + 3);
    const i = args.indexOf(`--${k}`);
    const next = args[i + 1];
    return i !== -1 && next !== undefined && !next.startsWith("--") ? next : null;
  };
  const session = flag("session") ?? process.env.CLAUDE_SESSION_ID ?? "default";
  const nowFlag = flag("now");
  const now = nowFlag != null ? parseInt(nowFlag, 10) : Date.now();

  if (cmd === "tick") {
    const gapsRaw = flag("gaps");
    if (gapsRaw == null) {
      console.error("usage: loop-controller.ts tick --session <id> --gaps <n> [--max-turns <n>] [--deadline-min <n>]");
      process.exit(1);
    }
    const gaps = parseInt(gapsRaw, 10) || 0;
    const prev = readState(session);
    const maxTurnsF = flag("max-turns");
    const deadlineF = flag("deadline-min");
    const res = applyTick(prev, gaps, now, {
      maxTurns: maxTurnsF != null ? parseInt(maxTurnsF, 10) : undefined,
      deadlineMin: deadlineF != null ? parseInt(deadlineF, 10) : undefined,
    });
    res.state.session = session;
    saveState(res.state);
    console.log(res.message);
    process.exit(res.decision === "STOP" ? 10 : 0);
  } else if (cmd === "status") {
    const s = readState(session);
    console.log(s ? JSON.stringify(s, null, 2) : `aucune boucle active (session ${session})`);
  } else if (cmd === "reset") {
    resetState(session);
    console.log(`boucle réinitialisée (session ${session})`);
  } else if (cmd === "calibrate") {
    // Lit la sortie `organise --json` (stdin par défaut, ou --from <fichier>) et imprime le plafond
    // de tours calibré. Défensif : toute erreur → plancher 5 (jamais ne bloque la boucle).
    const fromFlag = flag("from");
    let raw = "";
    try {
      raw = fromFlag ? readFileSync(fromFlag, "utf-8") : readFileSync(0, "utf-8");
    } catch {
      raw = "";
    }
    let snap: OrganiseSnapshot | null = null;
    try {
      snap = JSON.parse(raw) as OrganiseSnapshot;
    } catch {
      snap = null;
    }
    console.log(String(calibrateMaxTurns(snap)));
    process.exit(0);
  } else {
    console.error("commandes: tick | status | reset | calibrate");
    process.exit(1);
  }
}
