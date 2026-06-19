// save-audit-feedback.ts
// Persists user feedback on an `/assistant audit` session.
// Invoked at the end of AUDIT Phase 4 (feedback).
//
// Usage:
//   bun scripts/save-audit-feedback.ts <project_path> <score_1_to_5> [note...]
//
// Writes: ~/.claude/projects/<slug>/memory/feedback_audit_YYYY-MM-DD.md
// Cross-linked to the latest reflections/audit-YYYY-MM-DD.yaml if present.

import { writeFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { homedir } from "os";

const [projectArg, scoreArg, ...noteParts] = process.argv.slice(2);
if (!projectArg || !scoreArg) {
  console.error("Usage: bun scripts/save-audit-feedback.ts <project_path> <score_1_to_5> [note...]");
  process.exit(1);
}

const score = parseInt(scoreArg, 10);
if (isNaN(score) || score < 1 || score > 5) {
  console.error("Score must be integer 1-5, got:", scoreArg);
  process.exit(1);
}

const note = noteParts.join(" ").trim();
const projectPath = resolve(projectArg);
const slug = projectPath.replace(/\//g, "-").replace(/^-/, "");
const memDir = join(homedir(), ".claude", "projects", slug, "memory");
const today = new Date().toISOString().split("T")[0];
const outPath = join(memDir, `feedback_audit_${today}.md`);

mkdirSync(memDir, { recursive: true });

// Look up latest reflection for context
let reflectionRef: string | null = null;
let auditScore: number | null = null;
try {
  const reflDir = join(memDir, "reflections");
  const reflFiles = readdirSync(reflDir).filter(f => f.startsWith("audit-") && f.endsWith(".yaml")).sort().reverse();
  const latest = reflFiles[0];
  if (latest) {
    reflectionRef = `reflections/${latest}`;
    const content = readFileSync(join(reflDir, latest), "utf-8");
    const m = content.match(/score_after:\s*([\d.]+)/);
    if (m && m[1]) auditScore = parseFloat(m[1]);
  }
} catch {}

// Severity category for tagging
const categories: Record<number, string> = { 1: "unhelpful", 2: "weak", 3: "ok", 4: "good", 5: "excellent" };
const category = categories[score];

const content = `---
name: Audit feedback ${today}
description: User rating ${score}/5 (${category}) on /assistant audit session for ${projectPath.split("/").pop()}${note ? ". Note: " + note.substring(0, 80) : ""}
type: feedback
---

# Audit feedback — ${today}

**Project:** \`${projectPath}\`
**User rating:** ${score}/5 (${category})
**Audit score (before/after):** ${auditScore !== null ? auditScore : "unknown"}
**Reflection:** ${reflectionRef ? `[${reflectionRef}](${reflectionRef})` : "none"}

${note ? `## User note\n\n> ${note}\n` : ""}
## How to apply

${
  score <= 2
    ? `The user found this audit unhelpful. The audit feedback loop: flag the dimensions that were over-weighted and the recommendations that missed the mark; consider lowering the default weights or adding a signal-filter in Phase 2.`
    : score === 3
    ? `Mixed value. The audit feedback loop: check if the gap is a missing pattern (add to references/) or over-recommendation fatigue (tighten scoring).`
    : score >= 4
    ? `User found this useful. The audit feedback loop: extract which recommendations the user applied and promote those as defaults; keep the patterns that led to this audit as high-priority.`
    : ""
}
`;

writeFileSync(outPath, content);

console.log(`Audit feedback saved: ${outPath}`);
console.log(`  project: ${projectPath}`);
console.log(`  rating: ${score}/5 (${category})`);
if (auditScore !== null) console.log(`  audit score: ${auditScore}`);
if (note) console.log(`  note: ${note.substring(0, 60)}${note.length > 60 ? "..." : ""}`);
