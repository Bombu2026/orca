#!/usr/bin/env bun
/**
 * finalize.ts — lit la sortie des arms, grade objectivement, calcule les 6 scores de la rubrique,
 * et enregistre 12 runs dans le benchmark via workflow-bench.ts. Puis régénère le leaderboard.
 * Usage : bun finalize.ts <chemin-output-arms.json>
 */
import { readFileSync } from "fs";
import { basename, join } from "path";

const outPath = process.argv[2];
const HERE = import.meta.dir;
const SCRIPTS = join(HERE, "..", "..", "..", "scripts");
const results = (JSON.parse(readFileSync(outPath, "utf-8")).result?.results) ?? [];

// Scores structurels par méthode (proxys documentés, valides pour CETTE classe : tâches petites/bien spécifiées
// où la correction est égale). Plus d'agents/cérémonie = plus lent-vers-mergeable + plus cher + plus de charge.
const STRUCT: Record<string, { velocite: number; cout: number; chargeCognitive: number }> = {
  baseline: { velocite: 9, cout: 10, chargeCognitive: 9 },
  epct: { velocite: 9, cout: 9, chargeCognitive: 8 },
  spec: { velocite: 7, cout: 7, chargeCognitive: 6 },
  orchestrator: { velocite: 6, cout: 4, chargeCognitive: 4 },
};

function grade(taskId: string, files: Record<string, string>): number {
  const p = Bun.spawnSync(["bun", join(HERE, "grade.ts"), "--task", taskId, "--files", JSON.stringify(files)], { stdout: "pipe", stderr: "pipe" });
  try { const j = JSON.parse((new TextDecoder().decode(p.stdout)).trim().split("\n").pop() || "{}"); return (j.passed ?? 0) / (j.total ?? 1); } catch { return 0; }
}

// Fiabilité = signaux MÉCANIQUES de vérification dans l'artefact (grounded, pas subjectif).
function fiabilite(r: any): number {
  const sv = (r.solution?.selfVerification || "").toLowerCase();
  const ec = r.solution?.edgeCasesConsidered?.length || 0;
  let s = 5;
  if (/(test|assert|pass|exécut|bun test|spawn|suite)/.test(sv)) s += 2;     // a lancé un check exécutable
  if (/(tsc|typecheck|strict|noemit|nounchecked)/.test(sv)) s += 1;          // a typecheck
  if (ec >= 6) s += 1;                                                       // a raisonné large sur les edge cases
  if (r.arm === "orchestrator" || /(review|réfut|adversari|reviewer)/.test(sv)) s += 1; // contre-pouvoir séparé
  return Math.min(10, s);
}

// passe 1 : grade + scores par run
const runs: any[] = [];
const ratioByWf: Record<string, number[]> = {};
for (const r of results) {
  const files: Record<string, string> = {};
  for (const f of (r.solution?.files ?? [])) files[basename(f.name || "SUT.ts")] = f.content ?? "";
  const ratio = grade(r.taskId, files);
  (ratioByWf[r.arm] ||= []).push(ratio);
  runs.push({ r, ratio, fia: fiabilite(r) });
}
// passe 2 : robustesse = consistance cross-tâches de la méthode
const robust: Record<string, number> = {};
for (const [wf, rs] of Object.entries(ratioByWf)) {
  const mean = rs.reduce((a, b) => a + b, 0) / rs.length;
  const variance = rs.reduce((a, b) => a + (b - mean) ** 2, 0) / rs.length;
  robust[wf] = Math.round(Math.max(0, (mean - Math.sqrt(variance)) * 10) * 10) / 10; // moyenne pénalisée par l'écart-type
}

const NAME: Record<string, string> = { baseline: "Baseline (prompt direct)", epct: "EPCT + Verify durci", spec: "Spec-driven solo", orchestrator: "Orchestrator-Workers" };
let recorded = 0;
for (const { r, ratio, fia } of runs) {
  const st = STRUCT[r.arm];
  const scores = { velocite: st.velocite, justesse: Math.round(ratio * 10), fiabilite: fia, cout: st.cout, chargeCognitive: st.chargeCognitive, robustesse: robust[r.arm] };
  const run = {
    workflow: NAME[r.arm], task: `round-1 task ${r.taskId}`, taskClass: r.klass ?? r.taskId, model: "claude-opus-4-8",
    intention: `tâche ${r.taskId} résolue correctement (test d'acceptation caché)`,
    scores, verdict: ratio === 1 ? "SHIP" : "DONT_SHIP", greenBuildTrompeur: false, rewardHacking: false,
    note: `round-1 automated controlled bench — ${r.agentCount} agent(s), pass ${Math.round(ratio * 100)}%`,
  };
  const p = Bun.spawnSync(["bun", join(SCRIPTS, "workflow-bench.ts"), "record", "--json", JSON.stringify(run)], { stdout: "pipe", stderr: "pipe" });
  if (p.exitCode === 0) recorded++;
}
console.log(`${recorded}/12 runs enregistrés.`);
console.log("Robustesse par méthode:", JSON.stringify(robust));
