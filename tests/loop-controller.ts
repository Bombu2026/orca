#!/usr/bin/env bun

/**
 * tests/loop-controller.ts — bornes DURES de la boucle (loop-engineering P2).
 *
 * On EXÉCUTE le contrôleur (CLI réel, exit codes) avec une horloge injectée (--now) et un HOME
 * factice (ASSISTANT_HOME) pour un test déterministe : CONTINUE tant que dans les bornes ; STOP
 * (exit 10) sur DONE / MAX_TURNS / DEADLINE / NO_PROGRESS. Plus quelques asserts sur le cœur pur.
 */

import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { applyTick, calibrateMaxTurns } from "../scripts/loop-controller";

const ROOT = import.meta.dir.slice(0, import.meta.dir.lastIndexOf("/"));
const SCRIPT = join(ROOT, "scripts", "loop-controller.ts");
const HOME = mkdtempSync(join(tmpdir(), "loopctl-"));

let passed = 0;
const failures: string[] = [];
function assert(cond: boolean, name: string): void {
  if (cond) passed++;
  else failures.push(name);
}

/** Lance le CLI ; retourne {code, out}. Horloge et session déterministes. */
function tick(session: string, gaps: number, now: number, extra: string[] = []): { code: number; out: string } {
  const p = Bun.spawnSync(
    ["bun", SCRIPT, "tick", "--session", session, "--gaps", String(gaps), "--now", String(now), ...extra],
    { cwd: ROOT, env: { ...process.env, ASSISTANT_HOME: HOME }, stdout: "pipe", stderr: "pipe" },
  );
  return { code: p.exitCode ?? -1, out: new TextDecoder().decode(p.stdout).trim() };
}
function reset(session: string): void {
  Bun.spawnSync(["bun", SCRIPT, "reset", "--session", session], { cwd: ROOT, env: { ...process.env, ASSISTANT_HOME: HOME } });
}

// 1. Cœur PUR — applyTick.
const t1 = applyTick(null, 3, 0);
assert(t1.decision === "CONTINUE" && t1.state.turns === 1 && t1.state.maxTurns === 25, "1er tick → CONTINUE, turn 1, maxTurns défaut 25");
assert(applyTick({ session: "x", startedAt: 0, turns: 1, maxTurns: 25, deadlineMin: 120, gapsHistory: [3] }, 0, 1000).reason === "DONE", "gaps 0 → DONE");
const decreasing = applyTick({ session: "x", startedAt: 0, turns: 3, maxTurns: 25, deadlineMin: 120, gapsHistory: [5, 4, 3] }, 2, 0);
assert(decreasing.decision === "CONTINUE", "gaps qui baissent (5,4,3,2) → CONTINUE (progrès)");

// 2. CLI — CONTINUE dans les bornes.
reset("s1");
const c1 = tick("s1", 3, 0);
assert(c1.code === 0 && /CONTINUE/.test(c1.out) && /turn 1\/25/.test(c1.out), "CLI tick 1 → exit 0 CONTINUE turn 1/25");
const c2 = tick("s1", 2, 1000);
assert(c2.code === 0 && /turn 2\/25/.test(c2.out), "CLI tick 2 → CONTINUE turn 2/25");

// 3. DONE — 0 gap → STOP exit 10.
const done = tick("s1", 0, 2000);
assert(done.code === 10 && /STOP:DONE/.test(done.out), "0 gap → exit 10 STOP:DONE");

// 4. MAX_TURNS — plafond fixé au 1er tick, non relevable ensuite.
reset("s2");
assert(tick("s2", 5, 0, ["--max-turns", "2"]).code === 0, "max-turns=2 : tick 1 CONTINUE");
assert(tick("s2", 5, 1000, ["--max-turns", "99"]).code === 0, "tick 2 CONTINUE (le 99 est IGNORÉ : plafond figé à 2)");
const over = tick("s2", 5, 2000);
assert(over.code === 10 && /STOP:MAX_TURNS/.test(over.out), "tick 3 > plafond 2 → STOP:MAX_TURNS (l'agent n'a pas pu relever sa limite)");

// 5. DEADLINE — wall-clock dépassé.
reset("s3");
assert(tick("s3", 5, 0, ["--deadline-min", "10"]).code === 0, "deadline=10min : tick 1 à t=0 CONTINUE");
const late = tick("s3", 5, 10 * 60000 + 1);
assert(late.code === 10 && /STOP:DEADLINE/.test(late.out), "t > 10min → STOP:DEADLINE");

// 6. NO_PROGRESS — gaps stables sur la fenêtre.
reset("s4");
assert(tick("s4", 5, 0).code === 0, "no-progress: tick 1 CONTINUE");
assert(tick("s4", 5, 0).code === 0, "tick 2 CONTINUE");
assert(tick("s4", 5, 0).code === 0, "tick 3 CONTINUE");
const stuck = tick("s4", 5, 0);
assert(stuck.code === 10 && /STOP:NO_PROGRESS/.test(stuck.out), "tick 4 sans baisse des gaps → STOP:NO_PROGRESS");

// 7. CALIBRATE (G9) — max-turns auto-calibré depuis organise --json.
assert(calibrateMaxTurns(null) === 5, "calibrate: snapshot vide → plancher 5");
assert(
  calibrateMaxTurns({
    blockers: [{ severity: "critical" }, { severity: "critical" }, { severity: "important" }],
    spawnPlan: [1, 2, 3, 4],
    lifecycle: { missingCapabilities: [{ severity: "blocker" }, { severity: "blocker" }, { severity: "blocker" }, { severity: "nice" }] },
  }) === 9,
  "calibrate: 2 critiques + 4 auditeurs + 3 DoD bloquantes = 9",
);
assert(
  calibrateMaxTurns({ blockers: [], auditors: [1], lifecycle: { missingCapabilities: [{ severity: "important" }] } }) === 5,
  "calibrate: dette faible → plancher 5 (auditors fallback quand pas de spawnPlan)",
);
// CLI calibrate : lit la sortie organise --json sur stdin.
const calProc = Bun.spawnSync(["bun", SCRIPT, "calibrate"], {
  stdin: Buffer.from(JSON.stringify({ blockers: [{ severity: "critical" }], spawnPlan: [1, 2, 3, 4], lifecycle: { missingCapabilities: [{ severity: "blocker" }, { severity: "blocker" }] } })),
  stdout: "pipe",
  stderr: "pipe",
});
assert((calProc.exitCode ?? -1) === 0 && new TextDecoder().decode(calProc.stdout).trim() === "7", "CLI calibrate: 1 critique + 4 auditeurs + 2 DoD = 7");
const calBad = Bun.spawnSync(["bun", SCRIPT, "calibrate"], { stdin: Buffer.from("not json"), stdout: "pipe", stderr: "pipe" });
assert((calBad.exitCode ?? -1) === 0 && new TextDecoder().decode(calBad.stdout).trim() === "5", "CLI calibrate: stdin invalide → plancher 5, exit 0");

rmSync(HOME, { recursive: true, force: true });

const total = passed + failures.length;
console.log(`\nloop-controller: ${passed}/${total} passed`);
if (failures.length) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log("loop-controller: ok");
