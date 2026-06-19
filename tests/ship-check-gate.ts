#!/usr/bin/env bun

import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

const ROOT = import.meta.dir.slice(0, import.meta.dir.lastIndexOf("/")); // repo root, portable
const TMP = "/tmp/assistant-ship-gate-tests";

const BASE_REPORTS: Record<string, string> = {
  "BUGS.md": "Critical: 0, High: 0\n",
  "SLOP.md": "Critical: 0, High: 0\n",
  "ARCH.md": "Cycles: 0\nBoundary violations: 0\n## High-level architecture\nLayered architecture notes.\n",
  "CODE_PATH_COVERAGE.md": "Critical: 0, High: 0\nUser flows mapped: checkout, auth, dashboard\nCoverage gaps: none\n",
  "E2E_REPORT.md": [
    "Command: bunx playwright test",
    "Total tests: 12",
    "12 passed",
    "Headful visual verification: verified with screenshot trace",
    "",
  ].join("\n"),
  "SHIP_CHECK.md": "Final decision: SHIP\n",
  "SHIP_PROOF.json": JSON.stringify({
    decision: "SHIP",
    commands: [{ command: "bun run test", exitCode: 0 }],
    reviewers: [{ agent: "reviewer", report: "BUGS.md" }],
    blockers: [],
  }, null, 2),
  // Infra de test réelle : un SHIP légitime en porte la trace (sinon la règle anti-fabrication
  // null-agent refuserait des tests revendiqués sans aucune infrastructure dans la cible).
  "package.json": JSON.stringify({ name: "fixture", scripts: { test: "vitest run" } }, null, 2),
};

function assert(condition: unknown, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

function writeCase(name: string, overrides: Partial<Record<string, string>>): string {
  const dir = join(TMP, name);
  mkdirSync(dir, { recursive: true });
  for (const [file, content] of Object.entries({ ...BASE_REPORTS, ...overrides })) {
    writeFileSync(join(dir, file), content);
  }
  return dir;
}

function runGate(dir: string): { exitCode: number; output: string } {
  const result = Bun.spawnSync(["bun", "scripts/ship-check-gate.ts", dir], { cwd: ROOT });
  return {
    exitCode: result.exitCode,
    output: `${result.stdout.toString()}\n${result.stderr.toString()}`,
  };
}

function expectPass(name: string, overrides: Partial<Record<string, string>> = {}): void {
  const result = runGate(writeCase(name, overrides));
  assert(result.exitCode === 0, `${name} should pass\n${result.output}`);
}

function expectFail(name: string, overrides: Partial<Record<string, string>>, expected: string): void {
  const result = runGate(writeCase(name, overrides));
  assert(result.exitCode === 1, `${name} should fail\n${result.output}`);
  assert(result.output.includes(expected), `${name} should mention ${expected}\n${result.output}`);
}

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

expectPass("valid");

expectFail("mixed-severity-counts", {
  "BUGS.md": "Critical: 0, High: 1\n",
}, "critical-high-blocker");

expectFail("mixed-architecture-counts", {
  "ARCH.md": "Cycles: 0, boundary violations: 3\n",
}, "architecture-boundary");

expectFail("reversed-e2e-failures", {
  "E2E_REPORT.md": [
    "Command: bunx playwright test",
    "Total tests: 13",
    "1 failed, 12 passed",
    "Headful visual verification: verified with screenshot trace",
    "",
  ].join("\n"),
}, "e2e-proof");

expectFail("explicit-no-headful", {
  "E2E_REPORT.md": [
    "Command: bunx playwright test",
    "Total tests: 12",
    "12 passed",
    "Aucun test visuel exécuté",
    "",
  ].join("\n"),
}, "Missing headful/visual verification evidence");

expectFail("final-decision-wins", {
  "SHIP_CHECK.md": "Previous decision: SHIP\nDécision finale: DON'T SHIP\n",
}, "Decision is DON'T SHIP");

expectFail("partial-critical-flow", {
  "E2E_REPORT.md": [
    "Command: bunx playwright test",
    "Total: 13",
    "Passants: 12",
    "Fixme: 1",
    "Checkout: partiel (B-001 bloque)",
    "Headful vérifié: oui",
    "",
  ].join("\n"),
}, "e2e-proof");

expectFail("missing-independent-reviewer-proof", {
  "SHIP_PROOF.json": JSON.stringify({
    decision: "SHIP",
    commands: [{ command: "bun run test", exitCode: 0 }],
    reviewers: [],
    blockers: [],
  }, null, 2),
}, "ship-proof");

expectFail("missing-command-exit-code-proof", {
  "SHIP_PROOF.json": JSON.stringify({
    decision: "SHIP",
    commands: [{ command: "bun run test" }],
    reviewers: [{ agent: "reviewer", report: "BUGS.md" }],
    blockers: [],
  }, null, 2),
}, "numeric exitCode");

expectFail("code-path-not-covered", {
  "CODE_PATH_COVERAGE.md": "Critical: 0, High: 0\nCheckout flow: not covered by tests\n",
}, "Checkout flow");

console.log("ship-check-gate tests: ok");
