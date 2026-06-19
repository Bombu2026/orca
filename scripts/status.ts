#!/usr/bin/env bun

/**
 * status.ts
 * Self-health dashboard for ORCA: the memory-bridge index, indexed project
 * memories, recent CHANGELOG, and GitHub auth (used by the library scanners).
 * `--json` emits a machine-readable signal with recommendedCommands.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const args = process.argv.slice(2);
const jsonMode = args.includes("--json");

const HOME = process.env.ASSISTANT_HOME ?? homedir();
const ROOT = process.env.ASSISTANT_ROOT ?? import.meta.dir.slice(0, import.meta.dir.lastIndexOf("/"));
const MEMORY_INDEX_PATH = process.env.ASSISTANT_INDEX_DB ?? join(HOME, ".claude", "assistant-index.db");
const PROJECTS_DIR = process.env.ASSISTANT_PROJECTS_ROOT ?? join(HOME, ".claude", "projects");

const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const GRAY = "\x1b[90m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

type SlaSignal = {
  generatedAt: string;
  ok: boolean;
  issues: Array<{ code: string; severity: "warn" | "critical"; detail: string }>;
  recommendedCommands: string[];
  metrics: {
    memoryIndexFiles: number;
    memoryIndexLastIndexedAt: string | null;
    memoryIndexAgeHours: number | null;
    memoryIndexSizeMB: number;
    totalMemoryFiles: number;
    githubAuth: string;
  };
};

function fmt(label: string, value: string, color = RESET) {
  console.log(`  ${GRAY}${label.padEnd(22)}${RESET}${color}${value}${RESET}`);
}
function section(title: string) {
  console.log(`\n${BOLD}${title}${RESET}`);
}
function hoursSince(iso: string | null | undefined): string {
  if (!iso) return "never";
  const h = (Date.now() - new Date(iso).getTime()) / 1000 / 60 / 60;
  if (h < 1) return `${Math.round(h * 60)}m ago`;
  if (h < 24) return `${h.toFixed(1)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function checkMemoryIndex(): { files: number; lastIndexAt: Date | null; sizeMB: number } {
  const path = MEMORY_INDEX_PATH;
  try {
    const s = statSync(path);
    const walPath = `${path}-wal`;
    const walMtime = existsSync(walPath) ? statSync(walPath).mtime : null;
    const lastIndexAt = walMtime && walMtime > s.mtime ? walMtime : s.mtime;
    const Database = require("bun:sqlite").Database;
    const db = new Database(path, { readonly: true });
    const { c } = db.prepare("SELECT count(*) as c FROM memory_fts").get() as { c: number };
    db.close();
    return { files: c, lastIndexAt, sizeMB: s.size / 1024 / 1024 };
  } catch { return { files: 0, lastIndexAt: null, sizeMB: 0 }; }
}

function countMemories(): number {
  try {
    let count = 0;
    for (const p of readdirSync(PROJECTS_DIR)) {
      try {
        const mem = readdirSync(join(PROJECTS_DIR, p, "memory"));
        count += mem.filter(f => f.endsWith(".md") && f !== "MEMORY.md").length;
      } catch {}
    }
    return count;
  } catch { return 0; }
}

function checkGithubAuth(): { status: string; color: string; detail: string } {
  const r = Bun.spawnSync(["env", "-u", "GITHUB_TOKEN", "-u", "GH_TOKEN", "gh", "auth", "status"], { stdout: "pipe", stderr: "pipe" });
  if (r.exitCode === 0) return { status: "OK", color: GREEN, detail: "authenticated via gh" };
  return {
    status: "DEGRADED",
    color: YELLOW,
    detail: "invalid/unavailable; scanners fall back to public API rate limit",
  };
}

function tailChangelog(n = 3): string[] {
  try {
    const content = readFileSync(join(ROOT, "CHANGELOG.md"), "utf-8");
    return [...content.matchAll(/^##\s+(.+)$/gm)].slice(0, n).map(m => m[1] ?? "");
  } catch { return []; }
}

function buildSlaSignal(): SlaSignal {
  const idx = checkMemoryIndex();
  const memoryIndexAgeHours = idx.lastIndexAt ? (Date.now() - idx.lastIndexAt.getTime()) / 1000 / 3600 : null;
  const issues: SlaSignal["issues"] = [];
  const recommendedCommands = new Set<string>();
  const gh = checkGithubAuth();

  if (!idx.lastIndexAt) {
    issues.push({ code: "memory_index_missing", severity: "warn", detail: "assistant-index.db is missing" });
    recommendedCommands.add("bun scripts/index-memories.ts");
  } else if (memoryIndexAgeHours !== null && memoryIndexAgeHours > 48) {
    issues.push({ code: "memory_index_stale", severity: "warn", detail: `last index ${hoursSince(idx.lastIndexAt.toISOString())}` });
    recommendedCommands.add("bun scripts/index-memories.ts");
  }
  if (gh.status !== "OK") {
    issues.push({ code: "github_auth_degraded", severity: "warn", detail: gh.detail });
    recommendedCommands.add("gh auth login");
  }

  return {
    generatedAt: new Date().toISOString(),
    ok: issues.every((issue) => issue.severity !== "critical"),
    issues,
    recommendedCommands: [...recommendedCommands],
    metrics: {
      memoryIndexFiles: idx.files,
      memoryIndexLastIndexedAt: idx.lastIndexAt ? idx.lastIndexAt.toISOString() : null,
      memoryIndexAgeHours,
      memoryIndexSizeMB: idx.sizeMB,
      totalMemoryFiles: countMemories(),
      githubAuth: gh.status,
    },
  };
}

function main() {
  if (jsonMode) {
    console.log(JSON.stringify(buildSlaSignal(), null, 2));
    return;
  }

  console.log(`${BOLD}${BLUE}━━━ ORCA Status ━━━${RESET}  ${GRAY}${new Date().toISOString()}${RESET}`);

  section("GitHub auth");
  const gh = checkGithubAuth();
  fmt("gh", `${gh.status} — ${gh.detail}`, gh.color);

  section("User Project Memories");
  fmt("Total memory files", `${countMemories()} across all projects`, GRAY);

  section("Memory Index (SQLite FTS5)");
  const idx = checkMemoryIndex();
  if (idx.lastIndexAt) {
    fmt("Indexed files", `${idx.files}`, GREEN);
    fmt("DB size", `${idx.sizeMB.toFixed(1)} MB`, GRAY);
    fmt("Last index", hoursSince(idx.lastIndexAt.toISOString()), GRAY);
  } else {
    fmt("Index", "missing — run bun scripts/index-memories.ts", YELLOW);
  }

  section("Recent CHANGELOG");
  const entries = tailChangelog(3);
  for (const e of entries) {
    console.log(`  ${GRAY}${e.substring(0, 70)}${RESET}`);
  }

  console.log();
}

main();
