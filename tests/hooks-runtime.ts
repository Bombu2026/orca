#!/usr/bin/env bun

import { existsSync, mkdirSync, readFileSync, rmSync } from "fs";
import { join } from "path";

const ROOT = import.meta.dir.slice(0, import.meta.dir.lastIndexOf("/")); // repo root, portable

interface HookCase {
  name: string;
  args: string[];
  input: unknown;
  exitCode: number;
}

function assert(condition: unknown, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

async function runSecurity(testCase: HookCase): Promise<void> {
  const proc = Bun.spawn(["bun", "templates/hooks/runtime/security.ts", ...testCase.args], {
    cwd: ROOT,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });

  proc.stdin.write(JSON.stringify(testCase.input));
  proc.stdin.end();

  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const output = `${stdout}\n${stderr}`;
  assert(
    exitCode === testCase.exitCode,
    `${testCase.name} expected exit ${testCase.exitCode}, got ${exitCode}\n${output}`,
  );
}

const cases: HookCase[] = [
  {
    name: "strict blocks git push short force",
    args: ["command", "strict"],
    input: { tool_input: { command: "git push -f origin main" } },
    exitCode: 2,
  },
  {
    name: "strict blocks rm -fr",
    args: ["command", "strict"],
    input: { tool_input: { command: "rm -fr build" } },
    exitCode: 2,
  },
  {
    name: "strict blocks expanded env file edits",
    args: ["env-file", "strict"],
    input: { tool_input: { file_path: ".env.development" } },
    exitCode: 2,
  },
  {
    name: "lint config blocks eslint flat config",
    args: ["lint-config"],
    input: { tool_input: { file_path: "eslint.config.js" } },
    exitCode: 2,
  },
  {
    name: "lint config blocks tsconfig",
    args: ["lint-config"],
    input: { tool_input: { file_path: "tsconfig.json" } },
    exitCode: 2,
  },
  {
    name: "strict secret reads MultiEdit edits",
    args: ["secret", "strict"],
    input: { tool_input: { edits: [{ old_string: "x", new_string: "password = 'secret123'" }] } },
    exitCode: 2,
  },
  {
    name: "standard secret warns but does not block",
    args: ["secret", "standard"],
    input: { tool_input: { content: "password = 'secret123'" } },
    exitCode: 0,
  },
];

for (const testCase of cases) {
  await runSecurity(testCase);
}

// ── context.ts — primitives d'économie du context window ─────────────────────
async function runContext(
  args: string[],
  input: unknown,
  env?: Record<string, string>,
): Promise<{ exitCode: number; stdout: string }> {
  const proc = Bun.spawn(["bun", "templates/hooks/runtime/context.ts", ...args], {
    cwd: ROOT,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: env ? { ...process.env, ...env } : process.env,
  });
  proc.stdin.write(JSON.stringify(input));
  proc.stdin.end();
  const [exitCode, stdout] = await Promise.all([proc.exited, new Response(proc.stdout).text()]);
  return { exitCode, stdout };
}

// G2.a : sortie Bash > 200 lignes → updatedToolOutput avec marqueur de troncature (head+tail).
{
  const big = Array.from({ length: 300 }, (_, i) => `line${i}`).join("\n");
  const { exitCode, stdout } = await runContext(["tool-output-trim"], { tool_response: { stdout: big } });
  assert(exitCode === 0, `tool-output-trim exit 0 (got ${exitCode})`);
  const parsed = JSON.parse(stdout) as { hookSpecificOutput?: { updatedToolOutput?: string } };
  const updated = parsed.hookSpecificOutput?.updatedToolOutput ?? "";
  assert(updated.includes("tronquées"), "trim emits updatedToolOutput with truncation marker for >200 lines");
  assert(updated.split("\n").length < 300, "trimmed output is shorter than the original");
}

// G2.a : petite sortie → {} (jamais de troncature inutile).
{
  const small = Array.from({ length: 10 }, (_, i) => `l${i}`).join("\n");
  const { stdout } = await runContext(["tool-output-trim"], { tool_response: { stdout: small } });
  assert(JSON.stringify(JSON.parse(stdout)) === "{}", "trim leaves small output intact ({})");
}

// G2.b : PreCompact → dump de l'état sur disque (savedAt + branch).
{
  const dumpDir = "/tmp/assistant-ctx-dump";
  rmSync(dumpDir, { recursive: true, force: true });
  mkdirSync(dumpDir, { recursive: true });
  await runContext(["precompact-dump"], {}, { CLAUDE_PROJECT_DIR: dumpDir });
  const statePath = join(dumpDir, ".claude", "local", "session-state.json");
  assert(existsSync(statePath), "precompact-dump writes .claude/local/session-state.json");
  const state = JSON.parse(readFileSync(statePath, "utf-8")) as Record<string, unknown>;
  assert(typeof state.savedAt === "string" && "branch" in state, "session-state.json carries savedAt + branch");
  rmSync(dumpDir, { recursive: true, force: true });
}

// ── cost-safety.ts — gardes anti-coût-runaway (Bash du runtime projet) ───────
async function runCost(args: string[], command: string): Promise<number> {
  const proc = Bun.spawn(["bun", "templates/hooks/runtime/cost-safety.ts", ...args], {
    cwd: ROOT,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  proc.stdin.write(JSON.stringify({ tool_input: { command } }));
  proc.stdin.end();
  return await proc.exited;
}

// G5.b : > 10 appels API → exit 2 ; ≤ 10 → exit 0.
assert((await runCost(["bulk-api-guard"], Array.from({ length: 12 }, () => "curl http://x").join(" && "))) === 2,
  "bulk-api-guard blocks > 10 API calls");
assert((await runCost(["bulk-api-guard"], "curl a && curl b && curl c")) === 0,
  "bulk-api-guard allows 3 API calls");
// G5.c : > 5 spawns claude -p → exit 2 ; parallélisme élevé sans claude -p → exit 0.
assert((await runCost(["agent-spawn-guard"], "echo t | xargs -P 8 -I{} claude -p '{}'")) === 2,
  "agent-spawn-guard blocks xargs -P 8 claude -p");
assert((await runCost(["agent-spawn-guard"], "echo t | xargs -P 3 claude -p")) === 0,
  "agent-spawn-guard allows xargs -P 3 claude -p");
assert((await runCost(["agent-spawn-guard"], "echo t | xargs -P 20 gzip")) === 0,
  "agent-spawn-guard ignores high parallelism without claude -p");

console.log("hooks-runtime tests: ok");
