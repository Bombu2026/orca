#!/usr/bin/env bun

/**
 * recall-auto.ts — recall mémoire JUST-IN-TIME en hook UserPromptSubmit (loop-engineering P5).
 *
 * Tout l'investissement mémoire (index FTS5+BM25, redaction, corrections) ne servait à rien tant
 * qu'il ne FRANCHISSAIT pas la frontière vers le contexte : `recall.ts` était un CLI manuel jamais
 * déclenché. Ce wrapper rend la mémoire VIVANTE : à chaque prompt, il dérive 2-5 tokens-clé, requête
 * l'index, et réinjecte les top-3 snippets via `additionalContext` (mécanisme du hook UserPromptSubmit).
 *
 * Invariants : NE LÈVE JAMAIS (toujours exit 0), borné (LIMIT 3, lecture seule), silencieux si rien
 * (index absent / aucun match / prompt vide → aucune sortie). Câblé pour Assistant lui-même
 * (.claude/settings.local.json) ET installable dans les projets générés (templates/hooks/memory.json).
 *
 * Entrée : payload JSON du hook sur stdin ({ prompt, cwd, session_id }). Sortie : JSON
 * { hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext } } ou rien.
 */

import { Database } from "bun:sqlite";
import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const HOME = process.env.ASSISTANT_HOME ?? homedir();
const DB_PATH = process.env.ASSISTANT_INDEX_DB ?? join(HOME, ".claude", "assistant-index.db");
const LIMIT = 3;
const MAX_TOKENS = 5;
const CANDIDATE_FACTOR = 3; // on récupère 3×LIMIT candidats avant le re-tri temporel

// Mots vides (FR + EN) : trop fréquents pour discriminer — on les écarte des tokens de recherche.
const STOP = new Set([
  "avec", "pour", "dans", "mais", "cette", "être", "fais", "faire", "quoi", "comment", "quand",
  "veux", "tout", "tous", "plus", "bien", "leur", "sont", "elle", "nous", "vous", "alors", "donc",
  "the", "and", "that", "this", "with", "from", "your", "what", "when", "make", "please", "should",
  "could", "would", "about", "into", "have", "want", "need", "just", "like", "then", "than",
]);

/** Tokens significatifs du prompt : mots ≥4 lettres, hors stopwords, dédupliqués, plafonnés. */
export function keyTokens(prompt: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of prompt.toLowerCase().split(/[^a-z0-9àâäéèêëïîôöùûüç_]+/i)) {
    const t = raw.trim();
    if (t.length < 4 || STOP.has(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= MAX_TOKENS) break;
  }
  return out;
}

interface Row { source: string; project: string; title: string; snippet: string; mtime?: number | null }

/** mtime (epoch s) du fichier via memory_meta ; null si table/row absente (fixture, index ancien). */
function lookupMtime(db: Database, path: string): number | null {
  try {
    const r = db.prepare("SELECT mtime FROM memory_meta WHERE path = ?").get(path) as { mtime?: number } | undefined;
    return typeof r?.mtime === "number" ? r.mtime : null;
  } catch {
    return null;
  }
}

/** Marqueurs de validité temporelle lus dans le frontmatter du fichier (best-effort, borné). */
export function temporalMarkers(path: string): { supersededBy: string; validFrom: string } {
  try {
    const head = readFileSync(path, "utf-8").slice(0, 1200);
    const m = head.match(/^---\n([\s\S]*?)\n---/);
    const fm = m?.[1] ?? "";
    const grab = (k: string): string => {
      const mm = fm.match(new RegExp(`^${k}\\s*:\\s*(.+)$`, "m"));
      return mm?.[1]?.trim().replace(/^["']|["']$/g, "") ?? "";
    };
    return { supersededBy: grab("superseded_by"), validFrom: grab("valid_from") };
  } catch {
    return { supersededBy: "", validFrom: "" };
  }
}

/**
 * Requête bornée, lecture seule. Renvoie [] sur toute erreur (jamais ne lève). En plus de la
 * pertinence BM25, ordonne par RÉCENCE à pertinence proche (un fait récent l'emporte) et EXCLUT
 * les faits périmés (`superseded_by`) ou pas-encore-valides (`valid_from` dans le futur).
 */
/** Slug projet encodé depuis un cwd (`/a/b` → `-a-b`), comme les dossiers de ~/.claude/projects. */
export function cwdSlug(cwd: string): string {
  return cwd ? cwd.replace(/\/+$/, "").replaceAll("/", "-") : "";
}

export function recall(dbPath: string, tokens: string[], nowMs: number = Date.now(), cwd: string = ""): Row[] {
  if (!tokens.length) return [];
  let db: Database;
  try {
    db = new Database(dbPath, { readonly: true });
  } catch {
    return [];
  }
  try {
    const slug = cwdSlug(cwd);
    const isLocal = (project: string): boolean =>
      !!slug && !!project && (project === slug || slug.startsWith(project + "-"));
    const match = tokens.map((t) => `"${t}"`).join(" OR ");
    const candidates = db
      .prepare(
        `SELECT source, project, path, title, snippet(memory_fts, 4, '[', ']', '...', 12) AS snippet, bm25(memory_fts) AS score
         FROM memory_fts WHERE memory_fts MATCH ? ORDER BY score LIMIT ?`,
      )
      .all(match, LIMIT * CANDIDATE_FACTOR) as Array<Row & { path: string; score: number }>;

    const kept: Array<Row & { score: number; local: boolean }> = [];
    for (const c of candidates) {
      const { supersededBy, validFrom } = temporalMarkers(c.path);
      if (supersededBy) continue; // fait explicitement périmé → jamais réinjecté
      if (validFrom) {
        const vf = Date.parse(validFrom);
        if (!Number.isNaN(vf) && vf > nowMs) continue; // pas encore valide
      }
      kept.push({
        source: c.source, project: c.project, title: c.title, snippet: c.snippet,
        mtime: lookupMtime(db, c.path), score: c.score, local: isLocal(c.project),
      });
    }
    // Re-tri : pertinence par BUCKETS (bm25 arrondi), puis PROJET COURANT d'abord (scope « quand
    // pertinent » : on BOOSTE le local sans exclure le global), puis RÉCENCE (mtime desc).
    kept.sort((a, b) => {
      const ra = Math.round(a.score), rb = Math.round(b.score);
      if (ra !== rb) return ra - rb;
      if (a.local !== b.local) return a.local ? -1 : 1;
      return (b.mtime ?? 0) - (a.mtime ?? 0);
    });
    return kept.slice(0, LIMIT).map(({ score, local, ...row }) => { void score; void local; return row; });
  } catch {
    return [];
  } finally {
    try {
      db.close();
    } catch {
      /* noop */
    }
  }
}

/** Âge lisible à partir de l'mtime (epoch s) : "" si inconnu. */
export function ageLabel(mtime: number | null | undefined, nowMs: number = Date.now()): string {
  if (!mtime) return "";
  const days = Math.floor((nowMs - mtime * 1000) / 86_400_000);
  if (days <= 0) return " (aujourd'hui)";
  if (days === 1) return " (il y a 1j)";
  return ` (il y a ${days}j)`;
}

/** Formate les lignes en bloc additionalContext (ou "" si rien), avec l'âge de chaque fait. */
export function formatContext(rows: Row[], nowMs: number = Date.now()): string {
  if (!rows.length) return "";
  const lines = rows.map(
    (r) => `- [${r.source}:${r.project}] ${r.title}${ageLabel(r.mtime, nowMs)} : ${String(r.snippet).replace(/\s+/g, " ").slice(0, 160)}`,
  );
  return `Mémoire pertinente (recall auto, top ${rows.length}) — vérifie qu'elle est toujours vraie avant de t'en servir :\n${lines.join("\n")}`;
}

if (import.meta.main) {
  (async () => {
    let raw = "";
    try {
      for await (const chunk of process.stdin) raw += chunk;
    } catch {
      return;
    }
    let payload: { prompt?: unknown; cwd?: unknown } = {};
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    const prompt = typeof payload.prompt === "string" ? payload.prompt : "";
    if (!prompt) return;
    const cwd = typeof payload.cwd === "string" ? payload.cwd : "";
    const rows = recall(DB_PATH, keyTokens(prompt), Date.now(), cwd);
    const additionalContext = formatContext(rows);
    if (!additionalContext) return;
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext } }));
  })().catch(() => {
    /* jamais ne lève : un hook qui plante bloquerait chaque prompt */
  });
}
