#!/usr/bin/env bun

/**
 * tests/orchestration.ts — « orchestration enforced » (loop-engineering).
 * (1) audit-project SCORE le split read/write des agents + context:fork/summary ;
 * (2) organise émet un spawnPlan EXÉCUTABLE (agent + prompt + scopes read/write disjoints).
 */

import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

const ROOT = import.meta.dir.slice(0, import.meta.dir.lastIndexOf("/"));
const TMP = "/tmp/assistant-orchestration-test";

let passed = 0;
function assert(cond: unknown, msg: string): void {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exit(1); }
  passed++;
}

function agentMd(name: string, tools: string[], context?: string): string {
  return `---\nname: ${name}\ntools:\n${tools.map((t) => `  - ${t}`).join("\n")}\nmodel: claude-opus-4-8\neffort: max\n${context ? `context: ${context}\n` : ""}---\n# ${name}\n`;
}

function makeProject(name: string, agents: Record<string, string>): string {
  const dir = join(TMP, name);
  mkdirSync(join(dir, ".claude", "agents"), { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: { next: "15" } }));
  for (const [file, content] of Object.entries(agents)) writeFileSync(join(dir, ".claude", "agents", file), content);
  return dir;
}

function audit(dir: string): { score: number; findings: string[]; recs: string[] } {
  const p = Bun.spawnSync(["bun", "scripts/audit-project.ts", dir], { cwd: ROOT });
  const d = JSON.parse(new TextDecoder().decode(p.stdout)) as {
    scores: { agents: { score: number; findings: string[] } };
    recommendations: Array<{ dimension: string; message: string }>;
  };
  return {
    score: d.scores.agents.score,
    findings: d.scores.agents.findings,
    recs: d.recommendations.filter((r) => r.dimension === "agents").map((r) => r.message),
  };
}

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

// G7.a : agents tous write-capable, aucun read-only → pénalité + reco.
const allWriters = makeProject("all-writers", {
  "a.md": agentMd("a", ["Read", "Write", "Edit"]),
  "b.md": agentMd("b", ["Write"]),
});
const rW = audit(allWriters);
assert(rW.recs.some((m) => /read-only/i.test(m)), "audit: agents tous writers → reco 'No read-only agent'");
assert(rW.findings.some((f) => /0 read-only/.test(f)), "audit: finding 'orchestration: 0 read-only'");

// mix read-only + writer + context:fork → pas de pénalité read/write ni context.
const mixed = makeProject("mixed", {
  "mapper.md": agentMd("mapper", ["Read", "Grep", "Glob"], "fork"),
  "writer.md": agentMd("writer", ["Read", "Write", "Edit"]),
  "review.md": agentMd("review", ["Read", "Grep"], "fork"),
});
const rM = audit(mixed);
assert(!rM.recs.some((m) => /read-only/i.test(m)), "audit: mix read/write → pas de reco read-only");
assert(!rM.recs.some((m) => /context:fork/i.test(m)), "audit: contexte déclaré → pas de reco context");
assert(rM.score >= rW.score, "audit: projet bien orchestré score >= projet tout-writers");

// G7.b : ≥3 agents, aucun context:fork/summary → reco context.
const noContext = makeProject("no-context", {
  "a.md": agentMd("a", ["Read", "Grep"]),
  "b.md": agentMd("b", ["Read", "Write"]),
  "c.md": agentMd("c", ["Read"]),
});
const rN = audit(noContext);
assert(rN.recs.some((m) => /context:fork|context:summary|fork\/summary/i.test(m)), "audit: ≥3 agents sans context → reco context:fork");

// G7.c : organise émet un spawnPlan exécutable avec scopes disjoints.
const orgDir = join(TMP, "org");
mkdirSync(orgDir, { recursive: true });
writeFileSync(join(orgDir, "package.json"), JSON.stringify({ dependencies: { next: "15", "drizzle-orm": "1" } }));
writeFileSync(join(orgDir, "tsconfig.json"), "{}");
const op = Bun.spawnSync(["bun", "scripts/organise.ts", orgDir, "--json"], { cwd: ROOT });
const od = JSON.parse(new TextDecoder().decode(op.stdout)) as {
  spawnPlan: Array<{ agent: string; report: string; readScope: string; writeScope: string; prompt: string }>;
};
assert(Array.isArray(od.spawnPlan) && od.spawnPlan.length >= 1, "organise: spawnPlan non vide pour web-fullstack sans rapports");
const ws = od.spawnPlan.map((s) => s.writeScope);
assert(new Set(ws).size === ws.length, "organise: scopes d'écriture DISJOINTS (un rapport par auditeur)");
assert(od.spawnPlan.every((s) => /read-only/i.test(s.readScope)), "organise: chaque auditeur est read-only");
assert(od.spawnPlan.every((s) => s.prompt.includes(s.writeScope)), "organise: le prompt contraint l'écriture au seul rapport");

rmSync(TMP, { recursive: true, force: true });
console.log(`orchestration: ${passed}/${passed} passed`);
console.log("orchestration: ok");
