#!/usr/bin/env bun

import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

const ROOT = import.meta.dir.slice(0, import.meta.dir.lastIndexOf("/")); // repo root, portable
const TMP = "/tmp/assistant-validation-layer-tests";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

function runValidation(mode: string, args: string[] = []): { exitCode: number; json: { ok?: boolean; failed?: number; warnings?: number }; output: string } {
  const result = Bun.spawnSync(["bun", "scripts/validation-layer.ts", mode, ...args], { cwd: ROOT });
  const output = `${result.stdout.toString()}\n${result.stderr.toString()}`;
  let json: { ok?: boolean; failed?: number; warnings?: number } = {};
  try {
    json = JSON.parse(result.stdout.toString()) as { ok?: boolean; failed?: number; warnings?: number };
  } catch {}
  return { exitCode: result.exitCode, json, output };
}

rmSync(TMP, { recursive: true, force: true });
mkdirSync(join(TMP, ".claude"), { recursive: true });

const templates = runValidation("templates");
assert(templates.exitCode === 0, `templates validation should pass\n${templates.output}`);
assert(templates.json.ok === true, "templates validation ok");

const runtime = runValidation("runtime");
assert(runtime.exitCode === 0, `runtime validation should pass\n${runtime.output}`);

// Projet généré INVALIDE : placeholder non résolu → échec.
writeFileSync(join(TMP, "README.md"), "Hello {{PROJECT_NAME}}\n");
const badGenerated = runValidation("generated", [`--project=${TMP}`]);
assert(badGenerated.exitCode === 1, "generated validation fails bad project");
assert(badGenerated.output.includes("unresolved placeholders"), "generated validation reports placeholders");

// Projet généré VALIDE : placeholder résolu + .claude/CLAUDE.md présent → succès.
writeFileSync(join(TMP, "README.md"), "Hello Project\n");
writeFileSync(join(TMP, ".claude", "CLAUDE.md"), "# Project\n");
const goodGenerated = runValidation("generated", [`--project=${TMP}`]);
assert(goodGenerated.exitCode === 0, `generated validation should pass clean project\n${goodGenerated.output}`);

const all = runValidation("all");
assert(all.exitCode === 0, `all validation should pass\n${all.output}`);
assert(all.json.ok === true, "all validation ok");

console.log("validation-layer tests: ok");
