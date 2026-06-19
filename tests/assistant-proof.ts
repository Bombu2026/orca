#!/usr/bin/env bun

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

const ROOT = import.meta.dir.slice(0, import.meta.dir.lastIndexOf("/")); // repo root, portable
const TMP = "/tmp/assistant-proof-tests";

interface ProofJson {
  project?: { exists?: boolean; gitRequired?: boolean };
  assistantFiles?: { claudeInstructions?: { status?: string } };
  hooks?: { claude?: Array<{ events?: string[] }> };
  agents?: { claude?: { count?: number } };
  checks?: { detected?: Array<{ command?: string }>; missing?: string[] };
  risks?: Array<{ severity?: string; area?: string; message?: string }>;
  summary?: { ok?: boolean; highestRisk?: string | null };
  writtenTo?: string;
}

function assert(condition: unknown, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

function runProof(args: string[]): { exitCode: number; json: ProofJson; output: string } {
  const result = Bun.spawnSync(["bun", "scripts/assistant-proof.ts", ...args], { cwd: ROOT });
  const stdout = result.stdout.toString();
  const output = `${stdout}\n${result.stderr.toString()}`;
  let json: ProofJson = {};
  try {
    json = JSON.parse(stdout) as ProofJson;
  } catch {}
  return { exitCode: result.exitCode, json, output };
}

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

const goodProject = join(TMP, "good-project");
mkdirSync(join(goodProject, ".claude", "agents"), { recursive: true });
mkdirSync(join(goodProject, ".claude", "memory"), { recursive: true });
writeFileSync(join(goodProject, ".claude", "CLAUDE.md"), "# Project\n\n## Commands\nbun run check\n");
writeFileSync(join(goodProject, ".claude", "settings.local.json"), JSON.stringify({ hooks: { PreToolUse: [] } }));
writeFileSync(join(goodProject, ".claude", "agents", "reviewer.md"), "---\nmodel: claude-opus-4-8\n---\n");
writeFileSync(join(goodProject, ".claude", "memory", "seed.md"), "Decision log\n");
writeFileSync(join(goodProject, "package.json"), JSON.stringify({
  scripts: {
    check: "bun scripts/check.ts",
    test: "bun test",
    build: "bun build",
    typecheck: "tsc --noEmit",
  },
}));

const stdoutProof = runProof([goodProject]);
assert(stdoutProof.exitCode === 0, `good project should pass\n${stdoutProof.output}`);
assert(stdoutProof.json.project?.gitRequired === false, "proof records that git is not required");
assert(stdoutProof.json.assistantFiles?.claudeInstructions?.status === "present", "CLAUDE.md detected");
assert(stdoutProof.json.hooks?.claude?.[0]?.events?.includes("PreToolUse"), "Claude hook event detected");
assert(stdoutProof.json.agents?.claude?.count === 1, "Claude agent detected");
assert(stdoutProof.json.checks?.detected?.some(item => item.command === "bun run test"), "test command detected");
assert(stdoutProof.json.summary?.ok === true, "good project summary is ok");

const writeProof = runProof([goodProject, "--write"]);
const proofPath = join(goodProject, "ORCA_PROOF.json");
assert(writeProof.exitCode === 0, `write mode should pass\n${writeProof.output}`);
assert(existsSync(proofPath), "write mode creates ORCA_PROOF.json");
assert(writeProof.json.writtenTo?.endsWith("ORCA_PROOF.json"), "write mode reports output path");
const writtenJson = JSON.parse(readFileSync(proofPath, "utf-8")) as ProofJson;
assert(writtenJson.project?.exists === true, "written proof has project metadata");

const weakProject = join(TMP, "weak-project");
mkdirSync(weakProject, { recursive: true });
writeFileSync(join(weakProject, ".gitignore"), "node_modules\n");
writeFileSync(join(weakProject, "package.json"), JSON.stringify({ scripts: { dev: "bun dev" } }));
const weakProof = runProof([`--project=${weakProject}`]);
assert(weakProof.exitCode === 1, "weak project exits with failed proof");
assert(weakProof.json.project?.exists === true, "weak project exists without being a git repo");
assert(weakProof.json.risks?.some(item => item.area === "instructions" && item.severity === "critical"), "missing instructions risk detected");
assert(weakProof.json.summary?.highestRisk === "critical", "highest risk is critical");

const invalidProject = join(TMP, "invalid-project");
mkdirSync(join(invalidProject, ".claude"), { recursive: true });
writeFileSync(join(invalidProject, ".claude", "CLAUDE.md"), "# Invalid settings\n");
writeFileSync(join(invalidProject, "AGENTS.md"), "Read .claude/CLAUDE.md\n");
writeFileSync(join(invalidProject, ".claude", "settings.local.json"), "{ invalid");
const invalidProof = runProof([invalidProject]);
assert(invalidProof.exitCode === 1, "invalid settings project exits with failed proof");
assert(invalidProof.json.risks?.some(item => item.message?.includes("settings.local.json is invalid")), "invalid settings risk detected");

console.log("assistant-proof tests: ok");
