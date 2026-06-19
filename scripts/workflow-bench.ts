#!/usr/bin/env bun

/**
 * workflow-bench.ts — le benchmark VIVANT des workflows agentiques.
 *
 * l'opérateur teste des workflows sur des tâches réelles ; on note chaque run selon la
 * rubrique (references/workflow-playbooks/RUBRIC.md) ; le classement se construit dans
 * le temps et /assistant prescrit le gagnant pour le profil de tâche courant.
 *
 * Principe anti-hype : SEULS les runs réels comptent. Les stars GitHub et la fraîcheur
 * presse pèsent 0. Un workflow doit avoir >=3 runs sur >=2 classes pour être "classé".
 *
 * Données : references/workflows-benchmark.jsonl (append-only, une ligne JSON par run).
 * Sortie  : references/workflow-playbooks/LEADERBOARD.md (régénéré).
 *
 * Usage :
 *   bun scripts/workflow-bench.ts record --json '<runObject>'
 *   bun scripts/workflow-bench.ts leaderboard
 *   bun scripts/workflow-bench.ts select <A|B|C|D>
 */

import { existsSync, readFileSync, appendFileSync, writeFileSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");
const JSONL = join(ROOT, "references", "workflows-benchmark.jsonl");
const LEADERBOARD = join(ROOT, "references", "workflow-playbooks", "LEADERBOARD.md");

// Rubrique (poids ∑ = 10) — doit rester synchro avec RUBRIC.md.
const WEIGHTS: Record<string, number> = {
  velocite: 2,
  justesse: 2,
  fiabilite: 2,
  cout: 1.5,
  chargeCognitive: 1.5,
  robustesse: 1,
};
const TOTAL_WEIGHT = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
const HALF_LIFE_DAYS = 90;
const MIN_RUNS_CLASSED = 3;
const MIN_CLASSES_CLASSED = 2;
const TASK_CLASSES: Record<string, string> = {
  A: "bug fix avec repro",
  B: "feature multi-fichiers",
  C: "refactor transverse imprévisible",
  D: "UI/visuel subjectif",
};

type Scores = { velocite: number; justesse: number; fiabilite: number; cout: number; chargeCognitive: number; robustesse: number };
type Run = {
  runId: string; date: string; ccVersion?: string; model?: string; startCommit?: string;
  workflow: string; task: string; taskClass: string; intention: string;
  wallClockSeconds?: number; interruptions?: number; tokenRatio?: number;
  scores: Scores; verifyGate?: { existed: boolean; blockedOnRed: number };
  bugsCaught?: number; bugsEscaped?: number; rewardHacking?: boolean; greenBuildTrompeur?: boolean;
  verdict?: string; note?: string; scorePondere: number;
};

function readRuns(): Run[] {
  if (!existsSync(JSONL)) return [];
  return readFileSync(JSONL, "utf-8").split("\n").map(l => l.trim()).filter(Boolean)
    .map(l => { try { return JSON.parse(l) as Run; } catch { return null; } }).filter(Boolean) as Run[];
}

function weighted(scores: Scores, caps: { rewardHacking?: boolean; greenBuildTrompeur?: boolean }): number {
  const s = { ...scores };
  // Garde-fou : reward hacking OU green-build trompeur → fiabilité plafonnée à 3.
  if (caps.rewardHacking || caps.greenBuildTrompeur) s.fiabilite = Math.min(s.fiabilite, 3);
  let total = 0;
  for (const [k, w] of Object.entries(WEIGHTS)) total += ((s as any)[k] ?? 0) * w;
  return Math.round((total / TOTAL_WEIGHT) * 10) / 10;
}

function halfLifeWeight(dateIso: string): number {
  const ageDays = (Date.now() - new Date(dateIso).getTime()) / 86_400_000;
  return Math.pow(0.5, Math.max(0, ageDays) / HALF_LIFE_DAYS);
}

type Standing = { workflow: string; score: number; runs: number; classes: Set<string>; classed: boolean };
function standings(runs: Run[]): Standing[] {
  const byWf = new Map<string, Run[]>();
  for (const r of runs) { (byWf.get(r.workflow) || byWf.set(r.workflow, []).get(r.workflow)!).push(r); }
  const out: Standing[] = [];
  for (const [wf, rs] of byWf) {
    let num = 0, den = 0; const classes = new Set<string>();
    // Forge fermée : on RECALCULE le score pondéré depuis r.scores à la lecture, on ne fait
    // jamais confiance au champ r.scorePondere stocké (une ligne JSONL forgée avec un
    // scorePondere gonflé mais de vrais scores faibles ne peut plus truquer le classement).
    for (const r of rs) { const w = halfLifeWeight(r.date); num += weighted(r.scores, r) * w; den += w; classes.add(r.taskClass); }
    out.push({
      workflow: wf, score: den ? Math.round((num / den) * 10) / 10 : 0, runs: rs.length, classes,
      classed: rs.length >= MIN_RUNS_CLASSED && classes.size >= MIN_CLASSES_CLASSED,
    });
  }
  return out.sort((a, b) => (Number(b.classed) - Number(a.classed)) || (b.score - a.score));
}

function regenLeaderboard(runs: Run[]): string {
  const st = standings(runs);
  const date = new Date().toISOString().slice(0, 10);
  const L: string[] = [
    "# LEADERBOARD — workflows agentiques (benchmark vivant)", "",
    `> Régénéré le ${date} par \`workflow-bench.ts\`. Classement = moyenne pondérée des runs RÉELS`,
    `> (demi-vie ${HALF_LIFE_DAYS}j). Stars/hype = 0. "Classé" exige ≥${MIN_RUNS_CLASSED} runs sur ≥${MIN_CLASSES_CLASSED} classes.`, "",
    `**${runs.length} runs enregistrés.**`, "",
    "| # | Workflow | Score /10 | Runs | Classes | Statut |", "|---|---|---|---|---|---|",
  ];
  st.forEach((s, i) => L.push(`| ${i + 1} | ${s.workflow} | ${s.score} | ${s.runs} | ${[...s.classes].sort().join("")} | ${s.classed ? "classé" : "provisoire"} |`));
  if (!st.length) L.push("| — | _aucun run encore — lance un test puis `record`_ | — | 0 | — | — |");
  L.push("", "## Meilleur par classe de tâche", "");
  for (const [c, label] of Object.entries(TASK_CLASSES)) {
    const best = bestFor(runs, c);
    L.push(`- **${c}** (${label}) → ${best ? `**${best.workflow}** (${best.score}/10, ${best.runs} run${best.runs > 1 ? "s" : ""})` : "_pas encore testé_"}`);
  }
  L.push("");
  return L.join("\n");
}

function bestFor(runs: Run[], taskClass: string): { workflow: string; score: number; runs: number } | null {
  const subset = runs.filter(r => r.taskClass === taskClass);
  if (!subset.length) return null;
  const st = standings(subset);
  const top = st[0];
  return top ? { workflow: top.workflow, score: top.score, runs: top.runs } : null;
}

// ---------- CLI ----------
const [cmd, ...rest] = process.argv.slice(2);

if (cmd === "record") {
  const jsonArg = rest.includes("--json") ? rest[rest.indexOf("--json") + 1] : null;
  if (!jsonArg) { console.error("record requires --json '<runObject>' (voir RUBRIC.md pour le schéma)"); process.exit(1); }
  let obj: any;
  try { obj = JSON.parse(jsonArg); } catch (e) { console.error("JSON invalide:", (e as Error).message); process.exit(1); }
  if (!obj.workflow || !obj.taskClass || !obj.scores) { console.error("Champs requis: workflow, taskClass (A/B/C/D), scores{6}"); process.exit(1); }
  const date = obj.date || new Date().toISOString();
  const slug = String(obj.workflow).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 20);
  const run: Run = {
    runId: obj.runId || `${date.slice(0, 10)}-${slug}-${obj.taskClass}-${Math.random().toString(36).slice(2, 7)}`,
    date, workflow: obj.workflow, task: obj.task || "", taskClass: obj.taskClass, intention: obj.intention || "",
    ccVersion: obj.ccVersion, model: obj.model, startCommit: obj.startCommit,
    wallClockSeconds: obj.wallClockSeconds, interruptions: obj.interruptions, tokenRatio: obj.tokenRatio,
    scores: obj.scores, verifyGate: obj.verifyGate, bugsCaught: obj.bugsCaught, bugsEscaped: obj.bugsEscaped,
    rewardHacking: obj.rewardHacking, greenBuildTrompeur: obj.greenBuildTrompeur, verdict: obj.verdict, note: obj.note,
    scorePondere: weighted(obj.scores, { rewardHacking: obj.rewardHacking, greenBuildTrompeur: obj.greenBuildTrompeur }),
  };
  appendFileSync(JSONL, JSON.stringify(run) + "\n");
  const runs = readRuns();
  writeFileSync(LEADERBOARD, regenLeaderboard(runs));
  console.log(`Run enregistré: ${run.runId} — score pondéré ${run.scorePondere}/10`);
  console.log(`Leaderboard régénéré (${runs.length} runs).`);
} else if (cmd === "leaderboard") {
  const runs = readRuns();
  writeFileSync(LEADERBOARD, regenLeaderboard(runs));
  console.log(regenLeaderboard(runs));
} else if (cmd === "select") {
  const taskClass = (rest[0] || "").toUpperCase();
  const runs = readRuns();
  if (!TASK_CLASSES[taskClass]) { console.error(`Usage: select <A|B|C|D>  (${Object.entries(TASK_CLASSES).map(([k, v]) => `${k}=${v}`).join(", ")})`); process.exit(1); }
  const best = bestFor(runs, taskClass);
  const st = best ? standings(runs.filter(r => r.taskClass === taskClass))[0] : null;
  if (!best) { console.log(`Classe ${taskClass} (${TASK_CLASSES[taskClass]}) : pas encore de run. Teste un workflow puis 'record'.`); process.exit(0); }
  console.log(JSON.stringify({
    taskClass, label: TASK_CLASSES[taskClass], recommended: best.workflow, score: best.score,
    runs: best.runs, status: st?.classed ? "classé" : "provisoire",
    justification: `${best.workflow} — ${best.score}/10 sur ${best.runs} run(s) en classe ${taskClass} (${st?.classed ? "classé" : "provisoire, <3 runs/2 classes"})`,
  }, null, 2));
} else {
  console.log("workflow-bench.ts — benchmark vivant des workflows");
  console.log("  record --json '<runObject>'   enregistre un run de test + régénère le leaderboard");
  console.log("  leaderboard                    régénère + affiche le classement");
  console.log("  select <A|B|C|D>               recommande le meilleur workflow pour une classe de tâche");
}
