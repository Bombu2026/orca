#!/usr/bin/env bun

/**
 * tests/null-agent.ts — intégrité du gate de livraison (loop-engineering P3).
 *
 * Le « null-agent test » de l'état de l'art : un agent qui ne fait RIEN ne doit pas pouvoir passer
 * le gate. On vérifie deux signatures de non-travail / fabrication :
 *   1. cible vide (aucun rapport) → FAIL (jamais SHIP) ;
 *   2. jeu de rapports complet, bien formé, plausible MAIS l'agent n'a aucune infra de test —
 *      le SHIP_PROOF clame des tests qui n'ont pas pu tourner → FAIL (signal fabrication).
 *      Le même proof avec une vraie infra ne déclenche PAS ce signal (pas de faux positif).
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const ROOT = import.meta.dir.slice(0, import.meta.dir.lastIndexOf("/"));
const GATE = join(ROOT, "scripts", "ship-check-gate.ts");

let passed = 0;
const failures: string[] = [];
function assert(cond: boolean, name: string): void {
  if (cond) passed++;
  else failures.push(name);
}

function runGate(dir: string): { code: number; result: { ok: boolean; decision: string | null; issues: Array<{ rule: string; evidence: string }> } } {
  const p = Bun.spawnSync(["bun", GATE, dir, "--json"], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  let result = { ok: true, decision: null as string | null, issues: [] as Array<{ rule: string; evidence: string }> };
  try { result = JSON.parse(new TextDecoder().decode(p.stdout)); } catch { /* laissera échouer */ }
  return { code: p.exitCode ?? -1, result };
}

// Un jeu de rapports COMPLET, bien formé, qui clame le succès (fabrication plausible).
const FABRICATED: Record<string, string> = {
  "BUGS.md": "Critical: 0, High: 0\n",
  "SLOP.md": "Critical: 0, High: 0\n",
  "ARCH.md": "Cycles: 0\nBoundary violations: 0\n## Architecture\nNotes.\n",
  "CODE_PATH_COVERAGE.md": "Critical: 0, High: 0\nFlows: all\nCoverage gaps: none\n",
  "E2E_REPORT.md": ["Command: bunx playwright test", "Total tests: 10", "10 passed", "Headful visual verification: verified with screenshot trace", ""].join("\n"),
  "SHIP_CHECK.md": "Final decision: SHIP\n",
  "SHIP_PROOF.json": JSON.stringify({
    decision: "SHIP",
    commands: [{ command: "bunx playwright test", exitCode: 0 }],
    reviewers: [{ agent: "reviewer", report: "BUGS.md" }],
    blockers: [],
  }, null, 2),
};

function writeReports(dir: string, extra: Record<string, string> = {}): void {
  mkdirSync(dir, { recursive: true });
  for (const [f, c] of Object.entries({ ...FABRICATED, ...extra })) writeFileSync(join(dir, f), c);
}

const TMP = mkdtempSync(join(tmpdir(), "null-agent-"));

// 1. Cible VIDE (l'agent n'a rien produit) → FAIL, jamais SHIP.
const empty = join(TMP, "empty");
mkdirSync(empty, { recursive: true });
const r1 = runGate(empty);
assert(r1.code === 1, "cible vide → exit 1 (FAIL)");
assert(r1.result.ok === false, "cible vide → ok=false");
assert(r1.result.issues.some((i) => i.rule === "missing-report"), "cible vide → missing-report");

// 2. Rapports fabriqués SANS infra de test → FAIL avec signal de fabrication.
const fab = join(TMP, "fabricated");
writeReports(fab); // pas de package.json/config/dossier de test
const r2 = runGate(fab);
assert(r2.code === 1, "fabriqué sans infra → exit 1 (FAIL) : un proof bien formé ne suffit pas");
assert(
  r2.result.issues.some((i) => i.rule === "ship-proof" && /fabrication|infrastructure/i.test(i.evidence)),
  "fabriqué sans infra → signal null-agent/fabrication levé",
);

// 3. Mêmes rapports MAIS avec une vraie infra de test → le signal de fabrication ne se déclenche PAS.
const real = join(TMP, "real-infra");
writeReports(real, { "package.json": JSON.stringify({ name: "x", scripts: { test: "playwright test" } }) });
const r3 = runGate(real);
assert(
  !r3.result.issues.some((i) => /fabrication|no test infrastructure/i.test(i.evidence)),
  "infra de test présente → pas de faux positif de fabrication",
);

rmSync(TMP, { recursive: true, force: true });

const total = passed + failures.length;
console.log(`\nnull-agent: ${passed}/${total} passed`);
if (failures.length) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log("null-agent: ok");
