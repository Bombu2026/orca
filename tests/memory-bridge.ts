#!/usr/bin/env bun

import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join, resolve } from "path";

const ROOT = import.meta.dir.slice(0, import.meta.dir.lastIndexOf("/")); // repo root, portable
const TMP = "/tmp/assistant-memory-bridge-tests";
const HOME = join(TMP, "home");
const VAULT = join(TMP, "vault");
const MASTER = join(TMP, "master");
const PROJECT = join(TMP, "project-alpha");
const PROJECT_SLUG = resolve(PROJECT).replaceAll("/", "-");
const DB_PATH = join(TMP, "assistant-index.db");

type RunResult = { exitCode: number; stdout: string; stderr: string };
type CountRow = { source: string; c: number };

function assert(condition: unknown, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

function env(): Record<string, string> {
  const base: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) base[key] = value;
  }
  return {
    ...base,
    ASSISTANT_HOME: HOME,
    ASSISTANT_INDEX_DB: DB_PATH,
    SECONDARY_VAULT: VAULT,
    OBSIDIAN_VAULT: MASTER, // déterministe : ne pas indexer le vrai ~/Desktop/Obsidian
  };
}

function run(args: string[]): RunResult {
  const result = Bun.spawnSync(args, { cwd: ROOT, env: env() });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

rmSync(TMP, { recursive: true, force: true });

mkdirSync(join(HOME, ".claude", "projects", PROJECT_SLUG, "memory"), { recursive: true });
mkdirSync(join(HOME, ".claude", "corpus", "assistant"), { recursive: true });
mkdirSync(join(VAULT, "Notes"), { recursive: true });
mkdirSync(join(MASTER, "01 - Projects"), { recursive: true });

writeFileSync(join(HOME, ".claude", "projects", PROJECT_SLUG, "memory", "note.md"), "# Auto Note\n\nlegacy auto bridge token");
writeFileSync(join(VAULT, "Notes", "daily.md"), "# Vault Note\n\nvault bridge token");
writeFileSync(join(HOME, ".claude", "corpus", "assistant", "corpus.md"), "# Corpus Note\n\ncorpus bridge token");
writeFileSync(join(MASTER, "01 - Projects", "index.md"), "# Master Note\n\nmaster bridge token");

const indexed = run(["bun", "scripts/index-memories.ts"]);
assert(indexed.exitCode === 0, `index should pass\n${indexed.stdout}\n${indexed.stderr}`);
assert(existsSync(DB_PATH), "test index database created");

const db = new Database(DB_PATH, { readonly: true });
const counts = db.prepare("SELECT source, count(*) as c FROM memory_fts GROUP BY source").all() as CountRow[];
const bySource = new Map(counts.map((row) => [row.source, row.c]));
assert(bySource.get("auto-memory") === 1, "auto-memory source preserved");
assert(bySource.get("vault") === 1, "vault source preserved");
assert(bySource.get("corpus") === 1, "corpus source preserved");
assert(bySource.get("master-vault") === 1, "master-vault source indexed");
// Aucune source Codex ne doit plus exister (purge totale).
assert(!bySource.has("codex-memory") && !bySource.has("codex-session"), "no Codex sources after purge");
db.close();

const legacy = run(["bun", "scripts/recall.ts", "--source", "auto-memory", "legacy", "auto"]);
assert(legacy.exitCode === 0 && legacy.stdout.includes("auto-memory"), "auto-memory source filter works");

const vaultRecall = run(["bun", "scripts/recall.ts", "--source", "vault", "vault", "bridge"]);
assert(vaultRecall.exitCode === 0 && vaultRecall.stdout.includes("vault"), "vault source filter works");

// Une source Codex doit être REFUSÉE comme invalide (purge).
const rejected = run(["bun", "scripts/recall.ts", "--source", "codex-session", "anything"]);
assert(rejected.exitCode !== 0, "codex-session is rejected as an unknown source after purge");

console.log("memory-bridge tests: ok");
