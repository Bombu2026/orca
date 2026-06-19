#!/usr/bin/env bun
/**
 * score.ts — lit la sortie du workflow "arms", grade chaque solution contre le test caché,
 * émet un tableau objectif { taskId, arm, agentCount, passed, total, ratio }.
 * Usage : bun score.ts <chemin-output-arms.json>
 */
import { readFileSync } from "fs";
import { basename, join } from "path";

const outPath = process.argv[2];
const HERE = import.meta.dir;
const root = JSON.parse(readFileSync(outPath, "utf-8"));
const results = root.result?.results ?? root.results ?? [];

function gradeOne(taskId: string, files: Record<string, string>): { passed: number; total: number } {
  const proc = Bun.spawnSync(["bun", join(HERE, "grade.ts"), "--task", taskId, "--files", JSON.stringify(files)], { stdout: "pipe", stderr: "pipe" });
  const out = new TextDecoder().decode(proc.stdout).trim();
  try { const j = JSON.parse(out.split("\n").pop() || "{}"); return { passed: j.passed ?? 0, total: j.total ?? 1 }; }
  catch { return { passed: 0, total: 1 }; }
}

const rows: any[] = [];
for (const r of results) {
  const filesArr = r.solution?.files ?? [];
  const files: Record<string, string> = {};
  for (const f of filesArr) files[basename(f.name || "SUT.ts")] = f.content ?? "";
  const { passed, total } = gradeOne(r.taskId, files);
  rows.push({ taskId: r.taskId, arm: r.arm, agentCount: r.agentCount, passed, total, ratio: Math.round((passed / (total || 1)) * 100) / 100 });
}

// table
const arms = ["baseline", "epct", "spec", "orchestrator"];
const tasks = ["A", "B", "C"];
console.log("\n=== GRADING OBJECTIF (passed/total) ===\n");
console.log("arm".padEnd(14) + tasks.map(t => `task ${t}`.padEnd(12)).join("") + "moy.");
for (const arm of arms) {
  const cells = tasks.map(t => { const r = rows.find(x => x.arm === arm && x.taskId === t); return r ? `${r.passed}/${r.total}` : "—"; });
  const ratios = tasks.map(t => { const r = rows.find(x => x.arm === arm && x.taskId === t); return r ? r.ratio : 0; });
  const avg = (ratios.reduce((a, b) => a + b, 0) / tasks.length).toFixed(2);
  console.log(arm.padEnd(14) + cells.map(c => c.padEnd(12)).join("") + avg);
}
console.log("\n" + JSON.stringify(rows));
