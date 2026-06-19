#!/usr/bin/env bun

// index-memories.ts
// Walks project memory directories + Obsidian vault, indexes into SQLite FTS5.
// Zero npm deps, uses bun:sqlite built-in.

import { Database } from "bun:sqlite";
import { mkdirSync, readFileSync, readdirSync, statSync, type Stats } from "fs";
import { dirname, join, relative } from "path";
import { homedir } from "os";

const HOME = process.env.ASSISTANT_HOME ?? homedir();
const DB_PATH = process.env.ASSISTANT_INDEX_DB ?? join(HOME, ".claude", "assistant-index.db");
const PROJECTS_ROOT = process.env.ASSISTANT_PROJECTS_ROOT ?? join(HOME, ".claude", "projects");
const VAULT_ROOT = process.env.SECONDARY_VAULT ?? join(homedir(), "Documents", "Notes");
const MASTER_VAULT_ROOT = process.env.OBSIDIAN_VAULT ?? join(homedir(), "Desktop", "Obsidian");
const CORPUS_ROOT = process.env.ASSISTANT_CORPUS_ROOT ?? join(HOME, ".claude", "corpus");

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.exec("PRAGMA journal_mode = WAL");
db.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
    source,     -- "auto-memory" | "vault" | "master-vault" | "corpus"
    project,    -- project slug (for auto-memory) or agent folder (for vault)
    path,       -- relative path from source root
    title,      -- first # heading or filename
    content,
    tokenize='porter unicode61'
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS memory_meta (
    path TEXT PRIMARY KEY,
    mtime INTEGER NOT NULL,
    bytes INTEGER NOT NULL
  )
`);

// statSync(path) à un seul argument renvoie toujours Stats ; ReturnType prend la
// dernière surcharge (Stats | BigIntStats | undefined) et pollue le typage.
type FileStat = Stats;
type IndexStats = { added: number; skipped: number };
type MarkdownProjectSlug = (absPath: string, content: string, relPath: string) => string;
type MetaRow = { mtime: number; bytes: number };

function extractTitle(md: string, fallback: string): string {
  const m = md.match(/^#\s+(.+)$/m);
  return m?.[1]?.trim() ?? fallback;
}

function walkMarkdown(root: string, cb: (absPath: string, stat: FileStat) => void) {
  try {
    for (const entry of readdirSync(root)) {
      if (entry.startsWith(".") && entry !== ".obsidian") continue;
      const p = join(root, entry);
      let s: FileStat;
      try { s = statSync(p); } catch { continue; }
      if (s.isDirectory()) walkMarkdown(p, cb);
      else if (entry.endsWith(".md")) cb(p, s);
    }
  } catch {}
}

function redact(content: string): string {
  return content
    .replace(/(?:Authorization|authorization):\s*Bearer\s+[^\s"']+/g, "Authorization: Bearer [REDACTED]")
    .replace(/"(?:Authorization|authorization)"\s*:\s*"Bearer\s+[^"]+"/g, "\"Authorization\":\"Bearer [REDACTED]\"")
    .replace(/"((?:api[_-]?key|token|secret|password|passwd|pwd|access[_-]?token|refresh[_-]?token))"\s*:\s*"[^"]{8,}"/gi, "\"$1\":\"[REDACTED]\"")
    .replace(/\b((?:api[_-]?key|token|secret|password|passwd|pwd|access[_-]?token|refresh[_-]?token)\s*[:=]\s*)["']?[^\s"',;]{8,}["']?/gi, "$1[REDACTED]")
    .replace(/\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g, "[REDACTED_JWT]")
    .replace(/\bsk-ant-[a-zA-Z0-9_-]{16,}\b/g, "[REDACTED_TOKEN]")
    .replace(/\bsk-[a-zA-Z0-9_-]{16,}\b/g, "[REDACTED_TOKEN]")
    .replace(/\b(?:sk|pk|rk|ghp|gho|ghu|ghs|ghr|github_pat)_[a-zA-Z0-9_=-]{16,}\b/g, "[REDACTED_TOKEN]");
}

const insertStmt = db.prepare(`INSERT INTO memory_fts (source, project, path, title, content) VALUES (?, ?, ?, ?, ?)`);
const deleteByPathStmt = db.prepare(`DELETE FROM memory_fts WHERE path = ?`);
const upsertMetaStmt = db.prepare(`INSERT INTO memory_meta (path, mtime, bytes) VALUES (?, ?, ?) ON CONFLICT(path) DO UPDATE SET mtime=excluded.mtime, bytes=excluded.bytes`);
const getMetaStmt = db.prepare(`SELECT mtime, bytes FROM memory_meta WHERE path = ?`);

function shouldSkip(abs: string, s: FileStat): boolean {
  const existing = getMetaStmt.get(abs) as MetaRow | undefined;
  const mtime = Math.floor(s.mtime.getTime() / 1000);
  return Boolean(existing && existing.mtime === mtime && existing.bytes === s.size);
}

function writeEntry(source: string, project: string, abs: string, title: string, content: string, s: FileStat): void {
  const mtime = Math.floor(s.mtime.getTime() / 1000);
  deleteByPathStmt.run(abs);
  insertStmt.run(source, project, abs, title, content);
  upsertMetaStmt.run(abs, mtime, s.size);
}

function index(source: string, projectRoot: string, projectSlug: MarkdownProjectSlug): IndexStats {
  let added = 0, skipped = 0;
  walkMarkdown(projectRoot, (abs, s) => {
    if (shouldSkip(abs, s)) { skipped++; return; }
    let content = "";
    try { content = readFileSync(abs, "utf-8"); } catch { return; }
    const rel = relative(projectRoot, abs);
    const proj = projectSlug(abs, content, rel);
    const title = extractTitle(content, rel.split("/").pop() || rel);
    writeEntry(source, proj, abs, title, content, s);
    added++;
  });
  return { added, skipped };
}

console.log(`Indexing memories into ${DB_PATH}...`);

const a = index("auto-memory", PROJECTS_ROOT, (abs) => {
  const rel = relative(PROJECTS_ROOT, abs);
  return rel.split("/")[0] || "unknown";
});
console.log(`  Auto-memory: +${a.added} new, ${a.skipped} unchanged`);

const b = index("vault", VAULT_ROOT, (abs) => {
  const rel = relative(VAULT_ROOT, abs);
  return rel.split("/")[0] || "unknown";
});
console.log(`  Vault: +${b.added} new, ${b.skipped} unchanged`);

// Optional master Obsidian vault (default ~/Desktop/Obsidian, override via OBSIDIAN_VAULT).
// Indexed in addition to the secondary vault so recall.ts sees both (no split-brain).
const bMaster = index("master-vault", MASTER_VAULT_ROOT, (abs) => {
  const rel = relative(MASTER_VAULT_ROOT, abs);
  return rel.split("/")[0] || "unknown";
});
console.log(`  Master vault: +${bMaster.added} new, ${bMaster.skipped} unchanged`);

const c = index("corpus", CORPUS_ROOT, (abs) => {
  const rel = relative(CORPUS_ROOT, abs);
  return rel.split("/")[0] || "unknown";
});
console.log(`  Corpus: +${c.added} new, ${c.skipped} unchanged`);

const total = db.prepare("SELECT count(*) as c FROM memory_fts").get() as { c: number };
console.log(`\nTotal indexed: ${total.c} memory entries`);

db.close();
