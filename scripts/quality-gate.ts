#!/usr/bin/env bun

/**
 * quality-gate.ts
 * One command for ORCA's verification loop.
 */

interface StepResult {
  name: string;
  ok: boolean;
  required: boolean;
  detail: string;
}

const minAudit = Number(process.argv.find(arg => arg.startsWith("--min-audit="))?.slice("--min-audit=".length) || 9);
const ROOT = import.meta.dir.slice(0, import.meta.dir.lastIndexOf("/")); // repo root, portable
const steps: StepResult[] = [];

function run(name: string, args: string[], required = true): string {
  const result = Bun.spawnSync(args, { cwd: ROOT });
  const stdout = result.stdout.toString();
  const stderr = result.stderr.toString();
  const ok = result.exitCode === 0;
  steps.push({
    name,
    ok,
    required,
    detail: (stdout || stderr).trim().split("\n").slice(-4).join("\n"),
  });
  if (!ok && required) {
    console.error(stdout);
    console.error(stderr);
    throw new Error(`${name} failed`);
  }
  return stdout;
}

try {
  run("self-check", ["bun", "run", "check"]);
  run("smoke", ["bun", "run", "test"]);

  const auditRaw = run("audit", ["bun", "scripts/audit-project.ts", "."]);
  const audit = JSON.parse(auditRaw) as { overall: number; recommendations?: Array<{ severity: string; message: string }> };
  const auditOk = audit.overall >= minAudit;
  steps.push({
    name: `audit-threshold-${minAudit}`,
    ok: auditOk,
    required: true,
    detail: `overall=${audit.overall}`,
  });
  if (!auditOk) throw new Error(`audit score ${audit.overall} below ${minAudit}`);

  run("token-audit", ["bun", "scripts/token-audit.ts", "."], false);

  console.log("\nQuality gate summary");
  for (const step of steps) {
    console.log(`- ${step.ok ? "OK" : "FAIL"} ${step.name}${step.required ? "" : " (advisory)"}`);
    if (step.detail) console.log(`  ${step.detail.replace(/\n/g, "\n  ")}`);
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nquality-gate failed: ${message}`);
  process.exit(1);
}
