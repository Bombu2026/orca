#!/usr/bin/env bun

// recall.ts
// Full-text search over indexed memories.
// Usage: bun scripts/recall.ts [--source vault] [--project <slug>] [--limit N] <query>

import { Database } from "bun:sqlite";
import { join } from "path";
import { homedir } from "os";

const HOME = process.env.ASSISTANT_HOME ?? homedir();
const DB_PATH = process.env.ASSISTANT_INDEX_DB ?? join(HOME, ".claude", "assistant-index.db");
const VALID_SOURCES = new Set(["auto-memory", "vault", "master-vault", "corpus"]);

const args = process.argv.slice(2);
let source: string | null = null;
let project: string | null = null;
let limit = 10;
const queryParts: string[] = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  // a est garanti défini : i < args.length (boucle), mais noUncheckedIndexedAccess l'élargit en string | undefined.
  if (a === undefined) continue;
  if (a === "--source") { source = args[++i] ?? null; continue; }
  if (a === "--project") { project = args[++i] ?? null; continue; }
  if (a === "--limit") { limit = parseInt(args[++i] ?? "", 10); continue; }
  queryParts.push(a);
}
const query = queryParts.join(" ").trim();

if (!query) {
  console.error("Usage: bun scripts/recall.ts [--source <auto-memory|vault|master-vault|corpus>] [--project <slug>] [--limit N] <query>");
  process.exit(1);
}
if (source && !VALID_SOURCES.has(source)) {
  console.error(`Unknown source "${source}". Expected one of: ${Array.from(VALID_SOURCES).join(", ")}`);
  process.exit(1);
}
if (!Number.isInteger(limit) || limit < 1) {
  console.error("--limit must be a positive integer");
  process.exit(1);
}

let db: Database;
try { db = new Database(DB_PATH, { readonly: true }); }
catch {
  console.error(`Index not found at ${DB_PATH}. Run: bun scripts/index-memories.ts`);
  process.exit(1);
}

// FTS5 tokenizer strips punctuation (`.`, `:`, `-`) but the query parser
// doesn't — so we sanitize the query: split on whitespace, drop special
// chars, quote any remaining token with non-alphanumerics, rejoin with AND.
function sanitizeFts5(q: string): string {
  const tokens = q.split(/\s+/).filter(Boolean).map(t => {
    if (/^[a-zA-Z0-9_*]+$/.test(t)) return t;
    const cleaned = t.replace(/[^a-zA-Z0-9_*\- ]/g, " ").trim();
    return cleaned ? `"${cleaned}"` : "";
  }).filter(Boolean);
  return tokens.join(" AND ");
}

const clauses: string[] = ["memory_fts MATCH ?"];
const params: Array<string | number> = [sanitizeFts5(query)];
if (source) { clauses.push("source = ?"); params.push(source); }
if (project) { clauses.push("project = ?"); params.push(project); }
params.push(limit);

const sql = `
  SELECT source, project, path, title,
         snippet(memory_fts, 4, '[', ']', '...', 12) AS snippet,
         bm25(memory_fts) AS score
  FROM memory_fts
  WHERE ${clauses.join(" AND ")}
  ORDER BY score
  LIMIT ?
`;

type SearchRow = {
  source: string;
  project: string;
  path: string;
  title: string;
  snippet: string;
  score: number;
};

let rows: SearchRow[] = [];
try { rows = db.prepare(sql).all(...params) as SearchRow[]; }
catch (e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  console.error("Query error:", message);
  console.error("Tip: FTS5 syntax — use AND/OR, quote phrases, prefix* for prefix search");
  process.exit(1);
}

if (rows.length === 0) {
  console.log(`No matches for "${query}"${source ? ` in ${source}` : ""}${project ? ` in ${project}` : ""}`);
  process.exit(0);
}

const GRAY = "\x1b[90m", BOLD = "\x1b[1m", BLUE = "\x1b[34m", RESET = "\x1b[0m";
for (const r of rows) {
  console.log(`\n${BOLD}${BLUE}${r.title}${RESET}  ${GRAY}${r.source}:${r.project}${RESET}`);
  console.log(`  ${r.snippet.replace(/\n/g, " ").substring(0, 200)}`);
  console.log(`  ${GRAY}${r.path}${RESET}`);
}
console.log(`\n${rows.length} result(s)`);

db.close();
