// verify-impact.ts
// Re-audits a project 7+ days after a continuous-improvement integration and
// compares the score delta. Feeds the impact-verification loop with a
// "did my change help?" signal.
//
// Usage:
//   bun scripts/verify-impact.ts <project_path>
//
// Writes a reflection.yaml in ~/.claude/projects/{slug}/memory/reflections/
// so the impact-verification loop can pick up the pattern.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";
import { homedir } from "os";

const projectPath = resolve(process.argv[2] || process.cwd());
const slug = projectPath.replace(/\//g, "-").replace(/^-/, "");
const reflectionsDir = join(homedir(), ".claude", "projects", slug, "memory", "reflections");
if (!existsSync(reflectionsDir)) mkdirSync(reflectionsDir, { recursive: true });

function runAudit(): any {
  const p = Bun.spawnSync([
    "bun", "run",
    join(import.meta.dir, "audit-project.ts"),
    projectPath,
  ]);
  const out = p.stdout.toString();
  try { return JSON.parse(out); } catch { return null; }
}

const latest = runAudit();
if (!latest) {
  console.error("Audit failed — cannot run audit-project.ts on", projectPath);
  process.exit(1);
}

// Find the most recent prior reflection with scores
let prior: any = null;
let priorDate: string | null = null;
try {
  const files = readdirSync(reflectionsDir).filter(f => f.startsWith("audit-") && f.endsWith(".yaml"));
  files.sort().reverse();
  for (const f of files) {
    const content = readFileSync(join(reflectionsDir, f), "utf-8");
    if (!content.includes("score_after:")) continue;
    prior = content;
    priorDate = f.replace("audit-", "").replace(".yaml", "");
    break;
  }
} catch {}

const today = new Date().toISOString().split("T")[0];
const outPath = join(reflectionsDir, `audit-${today}.yaml`);

const priorScoreMatch = prior?.match(/score_after:\s*([\d.]+)/);
const priorScore = priorScoreMatch ? parseFloat(priorScoreMatch[1]) : null;
const currentScore = latest.overall;
const delta = priorScore !== null ? (currentScore - priorScore) : null;

const lines: string[] = [];
lines.push("# Reflexion pattern (arXiv 2303.11366) — impact verification");
lines.push(`session: "audit-${slug}"`);
lines.push(`date: "${today}"`);
lines.push(`project: "${projectPath}"`);
lines.push(`score_before: ${priorScore ?? "null"}`);
lines.push(`score_after: ${currentScore}`);
lines.push(`delta: ${delta !== null ? delta.toFixed(1) : "null"}`);
lines.push(`prior_audit_date: ${priorDate ? `"${priorDate}"` : "null"}`);
lines.push("dimensions:");
for (const [k, v] of Object.entries(latest.scores as Record<string, any>)) {
  lines.push(`  ${k}: ${v.score}`);
}
lines.push("recommendations_count: " + (latest.recommendations?.length || 0));
lines.push("top_recommendations:");
for (const r of (latest.recommendations || []).slice(0, 3)) {
  lines.push(`  - severity: ${r.severity}`);
  lines.push(`    dimension: ${r.dimension}`);
  lines.push(`    message: "${r.message.replace(/"/g, '\\"')}"`);
}
lines.push("what_worked: []  # fill in after reviewing the delta");
lines.push("what_failed: []  # fill in after reviewing the delta");
lines.push('lesson: |');
lines.push("  # Write 1 generalizable takeaway here after reviewing the delta.");
lines.push("  # Example: \"Adding CI hook moved hooks dimension 4 -> 9; keep that template default.\"");

writeFileSync(outPath, lines.join("\n") + "\n");

console.log(`Impact audit written: ${outPath}`);
console.log(`  project: ${projectPath}`);
if (priorScore !== null) {
  console.log(`  score: ${priorScore} -> ${currentScore} (delta ${delta!.toFixed(1)})`);
} else {
  console.log(`  score: ${currentScore} (no prior reflection to compare)`);
}
