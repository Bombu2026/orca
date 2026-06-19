#!/usr/bin/env bun
/**
 * finalize2.ts — round 2. Grade chaque solution contre le test-piège caché (grade2.ts),
 * calcule les 6 scores avec les pénalités de correction, enregistre 12 runs.
 * Usage : bun finalize2.ts <arms-output.json>
 */
import { readFileSync } from "fs";
import { basename, join } from "path";
const outPath = process.argv[2];
const HERE = import.meta.dir;
const SCRIPTS = join(HERE, "..", "..", "..", "scripts");
const results = (JSON.parse(readFileSync(outPath, "utf-8")).result?.results) ?? [];

// scores structurels de la méthode (cérémonie / nb agents)
const STRUCT: Record<string, { velocite: number; cout: number; chargeCognitive: number }> = {
  baseline: { velocite: 9, cout: 10, chargeCognitive: 9 },
  epct: { velocite: 9, cout: 9, chargeCognitive: 8 },
  spec: { velocite: 7, cout: 7, chargeCognitive: 6 },
  orchestrator: { velocite: 6, cout: 4, chargeCognitive: 4 },
};
function grade(taskId: string, files: Record<string, string>): number {
  const p = Bun.spawnSync(["bun", join(HERE, "grade2.ts"), "--task", taskId, "--files", JSON.stringify(files)], { stdout: "pipe", stderr: "pipe" });
  try { const j = JSON.parse((new TextDecoder().decode(p.stdout)).trim().split("\n").pop() || "{}"); return (j.passed ?? 0) / (j.total ?? 1); } catch { return 0; }
}
function verifSignal(r: any): number {
  const sv = (r.solution?.selfVerification || "").toLowerCase();
  const ec = r.solution?.edgeCasesConsidered?.length || 0;
  let s = 5;
  if (/(test|assert|pass|exécut|bun test|spawn|suite)/.test(sv)) s += 2;
  if (/(tsc|typecheck|strict)/.test(sv)) s += 1;
  if (ec >= 6) s += 1;
  if (r.arm === "orchestrator" || /(review|réfut|adversari|reviewer)/.test(sv)) s += 1;
  return Math.min(10, s);
}
const NAME: Record<string, string> = { baseline: "Baseline (prompt direct)", epct: "EPCT + Verify durci", spec: "Spec-driven solo", orchestrator: "Orchestrator-Workers" };
const ratioByWf: Record<string, number[]> = {};
const pending: any[] = [];
for (const r of results) {
  const files: Record<string, string> = {};
  for (const f of (r.solution?.files ?? [])) files[basename(f.name || "SUT.ts")] = f.content ?? "";
  const ratio = grade(r.taskId, files);
  (ratioByWf[r.arm] ||= []).push(ratio);
  pending.push({ r, ratio });
}
const robust: Record<string, number> = {};
for (const [wf, rs] of Object.entries(ratioByWf)) {
  const mean = rs.reduce((a, b) => a + b, 0) / rs.length;
  const variance = rs.reduce((a, b) => a + (b - mean) ** 2, 0) / rs.length;
  robust[wf] = Math.round(Math.max(0, (mean - Math.sqrt(variance)) * 10) * 10) / 10;
}
let recorded = 0;
const table: any[] = [];
for (const { r, ratio } of pending) {
  const st = STRUCT[r.arm];
  const shipped = ratio === 1;
  // pénalités de correction : un résultat faux n'est pas "mergeable" (vélocité), et la
  // vérification a clairement échoué à attraper le bug → verification gap (fiabilité plafonnée à 4).
  const justesse = Math.round(ratio * 10);
  const fiabilite = shipped ? verifSignal(r) : Math.min(verifSignal(r), 4);
  const velocite = shipped ? st.velocite : 3;
  const scores = { velocite, justesse, fiabilite, cout: st.cout, chargeCognitive: st.chargeCognitive, robustesse: robust[r.arm] };
  const run = {
    workflow: NAME[r.arm], task: `round-2 task ${r.taskId}`, taskClass: r.klass, model: "claude-opus-4-8",
    intention: `tâche-piège ${r.taskId} résolue correctement (test caché)`, scores,
    verdict: shipped ? "SHIP" : "DONT_SHIP", greenBuildTrompeur: false, rewardHacking: false,
    note: `round-2 hard/trap bench — ${r.arm}, pass ${Math.round(ratio * 100)}%`,
  };
  const p = Bun.spawnSync(["bun", join(SCRIPTS, "workflow-bench.ts"), "record", "--json", JSON.stringify(run)], { stdout: "pipe", stderr: "pipe" });
  if (p.exitCode === 0) recorded++;
  table.push({ task: r.taskId, arm: r.arm, ratio, justesse, fiabilite, velocite });
}
console.log(`${recorded}/12 runs round-2 enregistrés.\n`);
console.log("=== correction par tâche (ratio) ===");
const arms = ["baseline", "epct", "spec", "orchestrator"], tasks = ["t1", "t2", "t3"];
console.log("arm".padEnd(14) + tasks.map(t => t.padEnd(8)).join("") + "moy.");
for (const a of arms) {
  const cells = tasks.map(t => { const x = table.find(z => z.arm === a && z.task === t); return x ? x.ratio.toFixed(2) : "—"; });
  const avg = (cells.reduce((s, c) => s + parseFloat(c), 0) / 3).toFixed(2);
  console.log(a.padEnd(14) + cells.map(c => c.padEnd(8)).join("") + avg);
}
