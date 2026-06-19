#!/usr/bin/env bun

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join, resolve } from "path";

const ROOT = import.meta.dir.slice(0, import.meta.dir.lastIndexOf("/")); // repo root, portable
const TMP = "/tmp/assistant-memory-corrections-tests";
const HOME = join(TMP, "home");
const PROJECT = join(TMP, "project");
const SLUG = resolve(PROJECT).replaceAll("/", "-");
const MEMORY_DIR = join(HOME, ".claude", "projects", SLUG, "memory");
const JSONL_PATH = join(MEMORY_DIR, "corrections-queue.jsonl");
const MD_PATH = join(MEMORY_DIR, "corrections-queue.md");

function assert(condition: unknown, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

function runCorrections(command: string, input?: object, extraArgs: string[] = []): { exitCode: number; stdout: string; stderr: string } {
  const inputPath = join(TMP, `${command}-${Date.now()}-${Math.random()}.json`);
  if (input) writeFileSync(inputPath, JSON.stringify(input));
  const result = Bun.spawnSync(
    ["bun", "scripts/memory-corrections.ts", command, `--home=${HOME}`, `--project=${PROJECT}`, ...extraArgs],
    input ? { cwd: ROOT, stdin: Bun.file(inputPath) } : { cwd: ROOT },
  );
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

rmSync(TMP, { recursive: true, force: true });
mkdirSync(PROJECT, { recursive: true });

const ignored = runCorrections("capture", { prompt: "Peux-tu lancer les tests ?" });
assert(ignored.exitCode === 0, `neutral prompt should pass\n${ignored.stdout}\n${ignored.stderr}`);
assert(JSON.parse(ignored.stdout).captured === false, "neutral prompt is ignored");

const captured = runCorrections("capture", {
  prompt: "Non c'est pas ça, utilise Bun au lieu de npm pour ce projet.",
});
assert(captured.exitCode === 0, `correction prompt should pass\n${captured.stdout}\n${captured.stderr}`);
const capturedJson = JSON.parse(captured.stdout) as { captured: boolean; id: string };
assert(capturedJson.captured === true, "correction prompt is captured");
assert(typeof capturedJson.id === "string" && capturedJson.id.length === 16, "capture returns stable id");
assert(existsSync(JSONL_PATH), "jsonl queue created");
assert(existsSync(MD_PATH), "markdown queue created");

const duplicate = runCorrections("capture", {
  prompt: "Non c'est pas ça, utilise Bun au lieu de npm pour ce projet.",
});
assert(duplicate.exitCode === 0, `duplicate prompt should pass\n${duplicate.stdout}\n${duplicate.stderr}`);
assert(JSON.parse(duplicate.stdout).duplicate === true, "duplicate is detected");
assert(readFileSync(JSONL_PATH, "utf-8").trim().split(/\r?\n/).length === 1, "duplicate is not appended");

const listed = runCorrections("list");
assert(listed.exitCode === 0, `list should pass\n${listed.stdout}\n${listed.stderr}`);
const listedJson = JSON.parse(listed.stdout) as { total: number; counts: { pending: number } };
assert(listedJson.total === 1 && listedJson.counts.pending === 1, "list reports one pending correction");

const graduated = runCorrections("graduate", undefined, [`--id=${capturedJson.id}`, "--note=promoted"]);
assert(graduated.exitCode === 0, `graduate should pass\n${graduated.stdout}\n${graduated.stderr}`);
const md = readFileSync(MD_PATH, "utf-8");
assert(md.includes("type: project"), "markdown has memory frontmatter");
assert(md.includes("## Graduated"), "markdown has graduated section");
assert(md.includes("[x]"), "graduated item is checked");
assert(md.includes("promoted"), "graduate note is persisted");

const second = runCorrections("capture", { user_prompt: "Don't add new dependencies unless requested." });
assert(second.exitCode === 0 && JSON.parse(second.stdout).captured === true, "english correction is captured");

const pruned = runCorrections("prune", undefined, ["--max=1"]);
assert(pruned.exitCode === 0, `prune should pass\n${pruned.stdout}\n${pruned.stderr}`);
assert(readFileSync(JSONL_PATH, "utf-8").trim().split(/\r?\n/).length === 1, "prune keeps max entries");

console.log("memory-corrections tests: ok");
