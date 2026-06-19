#!/usr/bin/env bun

/**
 * tests/recall-auto.ts — recall mémoire just-in-time en hook (loop-engineering P5).
 *
 * On construit une base FTS5 fixture (même schéma qu'index-memories.ts), puis on EXÉCUTE le hook
 * avec un vrai payload stdin et on vérifie qu'il réinjecte les snippets pertinents via
 * additionalContext — et qu'il reste SILENCIEUX et exit 0 quand il n'y a rien (prompt vide / index
 * absent / aucun match), invariant non négociable d'un hook (sinon il bloquerait chaque prompt).
 */

import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { keyTokens, recall, formatContext, temporalMarkers, ageLabel, cwdSlug } from "../scripts/recall-auto";

const ROOT = import.meta.dir.slice(0, import.meta.dir.lastIndexOf("/"));
const SCRIPT = join(ROOT, "scripts", "recall-auto.ts");
const TMP = mkdtempSync(join(tmpdir(), "recall-auto-"));
const DB = join(TMP, "index.db");

let passed = 0;
const failures: string[] = [];
function assert(cond: boolean, name: string): void {
  if (cond) passed++;
  else failures.push(name);
}

// Fixture : même schéma que scripts/index-memories.ts (source, project, path, title, content).
const db = new Database(DB);
db.run("CREATE VIRTUAL TABLE memory_fts USING fts5(source, project, path, title, content)");
db.prepare("INSERT INTO memory_fts (source, project, path, title, content) VALUES (?,?,?,?,?)").run(
  "auto-memory", "assistant", "memory/db.md", "Choix de base de donnees",
  "Le projet utilise Drizzle ORM avec Postgres heberge sur Neon pour la persistance.",
);
db.prepare("INSERT INTO memory_fts (source, project, path, title, content) VALUES (?,?,?,?,?)").run(
  "vault", "project-x", "notes/auth.md", "Strategie auth",
  "Authentification via Better-auth, sessions en base, RBAC a deux roles.",
);
db.close();

// 1. keyTokens : écarte stopwords + mots courts, déduplique.
const toks = keyTokens("Comment configurer Drizzle avec Postgres pour la base ?");
assert(toks.includes("drizzle") && toks.includes("postgres") && toks.includes("configurer"), "keyTokens garde les mots signifiants");
assert(!toks.includes("avec") && !toks.includes("pour") && !toks.includes("la"), "keyTokens écarte les stopwords/mots courts");
assert(new Set(toks).size === toks.length, "keyTokens déduplique");

// 2. recall : matche sur la fixture ; [] si index absent.
const rows = recall(DB, ["drizzle", "postgres"]);
assert(rows.length >= 1 && /base de donnees/i.test(rows[0]!.title), "recall trouve la note Drizzle");
assert(recall(join(TMP, "nope.db"), ["drizzle"]).length === 0, "recall sur index absent → [] (jamais ne lève)");
assert(recall(DB, []).length === 0, "recall sans token → []");

// 3. formatContext : bloc lisible, vide si rien.
assert(formatContext(rows).includes("base de donnees".replace("donnees", "donnees")) && /recall auto/i.test(formatContext(rows)), "formatContext produit un bloc additionalContext");
assert(formatContext([]) === "", "formatContext([]) === '' (silencieux)");

// 4. CLI end-to-end : payload stdin → JSON additionalContext.
function runHook(payload: object, dbPath = DB): { code: number; out: string } {
  const p = Bun.spawnSync(["bun", SCRIPT], {
    stdin: Buffer.from(JSON.stringify(payload)),
    env: { ...process.env, ASSISTANT_INDEX_DB: dbPath },
    stdout: "pipe",
    stderr: "pipe",
  });
  return { code: p.exitCode ?? -1, out: new TextDecoder().decode(p.stdout).trim() };
}

const hit = runHook({ prompt: "aide-moi sur Drizzle et Postgres", cwd: ROOT, session_id: "t" });
assert(hit.code === 0, "CLI exit 0 sur match");
let parsed: { hookSpecificOutput?: { hookEventName?: string; additionalContext?: string } } = {};
try { parsed = JSON.parse(hit.out); } catch { /* laissera l'assert échouer */ }
assert(parsed.hookSpecificOutput?.hookEventName === "UserPromptSubmit", "CLI émet hookSpecificOutput UserPromptSubmit");
assert(/Drizzle|base de donnees/i.test(parsed.hookSpecificOutput?.additionalContext ?? ""), "additionalContext contient le snippet pertinent");

// 5. Invariants de silence : prompt vide / aucun match / index absent → AUCUNE sortie, exit 0.
const empty = runHook({ prompt: "", cwd: ROOT });
assert(empty.code === 0 && empty.out === "", "prompt vide → silencieux, exit 0");
const noMatch = runHook({ prompt: "xyzzy quux blorple zzzz", cwd: ROOT });
assert(noMatch.code === 0 && noMatch.out === "", "aucun match → silencieux, exit 0");
const noDb = runHook({ prompt: "drizzle postgres", cwd: ROOT }, join(TMP, "absent.db"));
assert(noDb.code === 0 && noDb.out === "", "index absent → silencieux, exit 0");
const badStdin = Bun.spawnSync(["bun", SCRIPT], { stdin: Buffer.from("not json"), env: { ...process.env, ASSISTANT_INDEX_DB: DB }, stdout: "pipe", stderr: "pipe" });
assert((badStdin.exitCode ?? -1) === 0 && new TextDecoder().decode(badStdin.stdout).trim() === "", "stdin non-JSON → silencieux, exit 0");

// ── Validité temporelle (G6) : récence, superseded_by, valid_from, âge ────────
const NOW = 1_700_000_000_000; // ms fixe → âges déterministes
const dayS = 86_400;
const nowS = Math.floor(NOW / 1000);

const TDB = join(TMP, "temporal.db");
const tdb = new Database(TDB);
tdb.run("CREATE VIRTUAL TABLE memory_fts USING fts5(source, project, path, title, content)");
tdb.run("CREATE TABLE memory_meta (path TEXT PRIMARY KEY, mtime INTEGER NOT NULL, bytes INTEGER NOT NULL)");

function addDoc(name: string, content: string, mtimeS: number, frontmatter = ""): string {
  const p = join(TMP, name);
  const fm = frontmatter ? `---\n${frontmatter}\n---\n` : "";
  writeFileSync(p, `${fm}# ${name}\n\n${content}\n`);
  tdb.prepare("INSERT INTO memory_fts (source, project, path, title, content) VALUES (?,?,?,?,?)")
    .run("auto-memory", "proj", p, name, content);
  tdb.prepare("INSERT INTO memory_meta (path, mtime, bytes) VALUES (?,?,?)").run(p, mtimeS, 100);
  return p;
}

// G6.a : deux docs équi-pertinents, mtime différents → le récent en tête + âge affiché.
const sharedContent = "deployment uses vercel cdg1 region for france hosting";
addDoc("old.md", sharedContent, nowS - 30 * dayS);
const recentPath = addDoc("recent.md", sharedContent, nowS - 1 * dayS);
const ranked = recall(TDB, ["deployment", "vercel", "france"], NOW);
assert(ranked.length >= 2 && ranked[0]!.title === "recent.md", "recall: doc récent en tête à pertinence égale");
assert(/il y a 1j/.test(formatContext(ranked, NOW)), "formatContext affiche l'âge (il y a 1j)");

// G6.b : superseded_by → exclu du recall.
addDoc("stale.md", "stripe billing integration monthly subscription", nowS - 2 * dayS, 'superseded_by: "billing-v2"');
const r2 = recall(TDB, ["stripe", "billing", "subscription"], NOW);
assert(!r2.some((r) => r.title === "stale.md"), "recall exclut un fait superseded_by");

// G6.c : valid_from dans le futur → exclu.
addDoc("future.md", "kubernetes cluster autoscaling rollout plan", nowS - 1 * dayS, 'valid_from: "2099-01-01"');
const r3 = recall(TDB, ["kubernetes", "cluster", "autoscaling"], NOW);
assert(!r3.some((r) => r.title === "future.md"), "recall exclut un fait valid_from futur");

// Unitaires temporalMarkers / ageLabel.
assert(temporalMarkers(recentPath).supersededBy === "", "temporalMarkers: pas de superseded sur doc normal");
assert(ageLabel(nowS - 3 * dayS, NOW) === " (il y a 3j)", "ageLabel calcule l'âge en jours");
assert(ageLabel(null, NOW) === "", "ageLabel('') si mtime inconnu");

// ── Scope projet (G10) : à pertinence égale, le projet du cwd passe devant ───
function addDocP(name: string, content: string, mtimeS: number, project: string): void {
  const p = join(TMP, name);
  writeFileSync(p, `# ${name}\n\n${content}\n`);
  tdb.prepare("INSERT INTO memory_fts (source, project, path, title, content) VALUES (?,?,?,?,?)")
    .run("auto-memory", project, p, name, content);
  tdb.prepare("INSERT INTO memory_meta (path, mtime, bytes) VALUES (?,?,?)").run(p, mtimeS, 100);
}
const scopeContent = "caching strategy redis lru invalidation ttl edge";
const cwdPath = "/Users/x/Desktop/MyProject";
const localSlug = cwdSlug(cwdPath);
assert(localSlug === "-Users-x-Desktop-MyProject", "cwdSlug encode le cwd comme un slug projet");
addDocP("other-proj.md", scopeContent, nowS - 1 * dayS, "-some-other-project"); // récent, AUTRE projet
addDocP("local-proj.md", scopeContent, nowS - 30 * dayS, localSlug);            // ancien, projet COURANT
const scoped = recall(TDB, ["caching", "redis", "invalidation"], NOW, cwdPath);
assert(scoped[0]!.title === "local-proj.md", "recall: projet du cwd passe devant à pertinence égale (même plus ancien)");
const unscoped = recall(TDB, ["caching", "redis", "invalidation"], NOW, "");
assert(unscoped[0]!.title === "other-proj.md", "recall sans cwd : la récence décide (autre projet récent en tête)");
tdb.close();

rmSync(TMP, { recursive: true, force: true });

const total = passed + failures.length;
console.log(`\nrecall-auto: ${passed}/${total} passed`);
if (failures.length) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log("recall-auto: ok");
