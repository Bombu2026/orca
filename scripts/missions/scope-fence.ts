#!/usr/bin/env bun

/**
 * scope-fence.ts — hook PreToolUse (COUCHE A du fence : intercepte le LLM).
 *
 * Lit le payload du hook sur stdin, retrouve le scope armé pour CETTE session
 * (~/.assistant/scopes/active-<sessionId>.json), et REFUSE (exit 2 = deny, comme
 * security.ts) toute écriture hors de la zone autorisée de la mission.
 *
 * Surfaces couvertes : Write / Edit / MultiEdit / NotebookEdit (file_path|notebook_path) + Bash.
 *
 * VOLET BASH = FAIL-CLOSED (leçon de la red-team : une allowlist de regns est structurellement
 * contournable — interpréteur `python3 -c`, `sed -i`, `install`, `ln`, `touch`, `> $VAR`,
 * `xargs {}`, `cp -t`…). Donc : pendant une mission ARMÉE, toute commande Bash dont on ne peut
 * PROUVER que l'écriture reste in-scope est REFUSÉE, avec un message qui oriente vers l'outil
 * Write (lui fencé). C'est tolérable car le fence ne s'arme que sur une mission BORNÉE — le dev
 * libre (aucun scope armé) n'est jamais gêné (exit 0). On préfère refuser que mentir.
 *
 * COUVERT (trou fermé) : les outils MCP d'écriture (mcp__mcpvault__*, Google Drive, Gmail…) sont
 * désormais matchés. Politique FAIL-CLOSED : pendant une mission armée, tout ÉCRIVAIN MCP est REFUSÉ
 * — la zone autorisée d'une mission est le FILESYSTEM (allowedWrites en globs de chemins) ; un store
 * externe (vault, Drive) en sort par construction. Les LECTURES MCP passent (non matchées par le verbe).
 * La future mission persona (persona-twin) ajoutera un périmètre MCP explicite (champ de manifeste)
 * pour autoriser des écritures vault ciblées — d'ici là, on refuse plutôt que de mentir.
 *
 * Câblé dans settings.local.json : matchers "Write|Edit|MultiEdit|NotebookEdit", "Bash",
 * et les écrivains MCP "mcp__mcpvault__.*|mcp__claude_ai_Google_Drive__.*|mcp__claude_ai_Gmail__.*".
 */

import { isAbsolute, join } from "path";
import { canonical, readActiveScope, denyReason, type ActiveScope } from "../lib/scope";

interface HookInput {
  session_id?: unknown;
  cwd?: unknown;
  tool_name?: unknown;
  tool_input?: {
    file_path?: unknown;
    path?: unknown;
    notebook_path?: unknown;
    command?: unknown;
    edits?: unknown;
  };
}

async function readHookInput(): Promise<HookInput> {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as HookInput) : {};
  } catch {
    return {};
  }
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function block(scope: ActiveScope, detail: string): never {
  console.error(
    `[SCOPE-FENCE] mission « ${scope.missionId} » : écriture refusée.\n` +
      `  ${detail}\n` +
      `  Zone autorisée : ${scope.allowedWrites.join(", ")}`,
  );
  process.exit(2);
}

// Cibles d'écriture PROUVABLES d'une commande Bash (redirections, tee, dd of=, cp/mv simples).
function extractBashWriteTargets(cmd: string): string[] {
  const targets: string[] = [];
  const pick = (m: RegExpMatchArray): string | undefined => m[2] ?? m[3] ?? m[4];

  // redirections : [fd|&]> ou >>, clobber `>|` / zsh `>!`, fusion `&>` — suivi d'un chemin
  for (const m of cmd.matchAll(/(?:\d|&)?>>?[|!]?\s*("([^"]+)"|'([^']+)'|([^\s;|&>]+))/g)) {
    const p = pick(m);
    if (p && !p.startsWith("/dev/")) targets.push(p);
  }
  // tee [-a] FILE
  for (const m of cmd.matchAll(/\btee\b\s+(?:-a\s+)?("([^"]+)"|'([^']+)'|([^\s;|&]+))/g)) {
    const p = pick(m);
    if (p) targets.push(p);
  }
  // dd of=FILE
  for (const m of cmd.matchAll(/\bof=("([^"]+)"|'([^']+)'|([^\s;|&]+))/g)) {
    const p = pick(m);
    if (p) targets.push(p);
  }
  // cp / mv SRC... DST → dernière cible (best-effort ; le cas -t est traité en fail-closed)
  for (const m of cmd.matchAll(/\b(?:cp|mv)\b\s+([^;|&]+)/g)) {
    const parts = str(m[1])
      .trim()
      .split(/\s+/)
      .filter((a) => a && !a.startsWith("-"));
    if (parts.length >= 2) {
      const last = parts[parts.length - 1];
      if (last) targets.push(last.replace(/^["']|["']$/g, ""));
    }
  }
  return targets;
}

// Constructs SYNTAXIQUES dont on NE PEUT PAS prouver la zone d'écriture → fail-closed.
const UNPROVABLE: Array<[RegExp, string]> = [
  [/<<-?\s*['"]?[A-Za-z_]/, "here-doc"],
  [/\b(?:bun|node|deno|python3?|perl|ruby|php|osascript)\b[^|;&]*\s-(?:e|c|p)\b/, "interpréteur -e/-c/-p"],
  [/\b(?:python3?|ruby|perl)\b[^|;&]*<</, "interpréteur + heredoc"],
  [/\bsed\b[^|;&]*\s-i/, "sed -i (réécriture en place)"],
  [/\bfind\b[^|;&]*-exec/, "find -exec (commande arbitraire)"],
  [/\b(?:cp|mv)\b[^|;&]*(?:\s-t\b|--target-directory)/, "cp/mv -t (source/cible inversées)"],
];

// Binaires écrivains à détecter UNIQUEMENT en position de commande (1er token d'un segment) :
// évite de bloquer `npm install` / `bun install` (« install » sous-commande, sans risque cross-projet).
const WRITER_COMMANDS = new Set(["install", "truncate", "ln", "touch", "rsync", "eval", "exec", "source", "xargs"]);

// Outils MCP d'ÉCRITURE : nom mcp__ + un verbe mutant. Les lectures (read/get/list/search/
// download/export/snapshot) ne matchent pas → laissées passer. Fail-closed : tout écrivain MCP
// pendant une mission armée est refusé (la zone d'une mission est le filesystem, pas un store externe).
const MCP_WRITE_TOOLS = /^mcp__.+(?:write|patch|update|create|delete|remove|move|copy|set_|append|insert|upload|rename|manage|label|put)/i;

/** 1er token de chaque segment de commande (séparé par ; | & && ||). */
function commandWords(cmd: string): string[] {
  return cmd
    .split(/\|\||&&|[;&|]/)
    .map((seg) => seg.trim().split(/\s+/)[0] ?? "")
    .map((w) => w.replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

/** Analyse une commande Bash : soit des cibles prouvables, soit une raison de fail-closed. */
function analyzeBash(cmd: string): { targets: string[]; unprovable: string | null } {
  for (const [re, name] of UNPROVABLE) if (re.test(cmd)) return { targets: [], unprovable: name };
  for (const w of commandWords(cmd)) {
    if (WRITER_COMMANDS.has(w)) return { targets: [], unprovable: `écrivain implicite en position de commande (${w})` };
  }
  const targets = extractBashWriteTargets(cmd);
  // métacaractère d'expansion non résolu dans une cible (> $X, dd of=${V}, …) → indécidable
  for (const t of targets) {
    if (/[$`{}]/.test(t)) return { targets: [], unprovable: `chemin non résolu à l'analyse (${t})` };
  }
  return { targets, unprovable: null };
}

const input = await readHookInput();
const sessionId = str(input.session_id);
const scope = readActiveScope(sessionId);

// Aucune mission armée pour cette session → fence au repos (rétro-compat, zéro friction en dev libre).
if (!scope) process.exit(0);

const tool = str(input.tool_name);
const base = str(input.cwd) || process.cwd();
const rel = (p: string) => (isAbsolute(p) ? p : join(base, p));

const targets: string[] = [];
if (tool === "Write" || tool === "Edit" || tool === "MultiEdit") {
  const fp = str(input.tool_input?.file_path) || str(input.tool_input?.path);
  if (fp) targets.push(fp);
} else if (tool === "NotebookEdit") {
  const nb = str(input.tool_input?.notebook_path) || str(input.tool_input?.file_path);
  if (nb) targets.push(nb);
} else if (tool === "Bash") {
  const analysis = analyzeBash(str(input.tool_input?.command));
  if (analysis.unprovable) {
    block(
      scope,
      `Commande Bash non prouvable (${analysis.unprovable}) pendant une mission armée. ` +
        `Passe par l'outil Write (fencé) ou exécute-la hors mission.`,
    );
  }
  targets.push(...analysis.targets);
} else if (tool.startsWith("mcp__") && MCP_WRITE_TOOLS.test(tool)) {
  // Écrivain MCP (vault, Drive, Gmail…) pendant une mission armée → fail-closed. La zone d'une
  // mission est le filesystem ; un store externe en sort par construction. La mission persona
  // ajoutera un périmètre MCP explicite ; d'ici là on refuse plutôt que de laisser fuir.
  block(
    scope,
    `Écriture MCP « ${tool} » pendant la mission armée : hors périmètre (la zone autorisée est le ` +
      `filesystem, pas un store externe type vault/Drive). Exécute-la hors mission, ou attends le ` +
      `périmètre MCP explicite (mission persona).`,
  );
}

for (const t of targets) {
  const abs = rel(t);
  const reason = denyReason(abs, scope);
  if (reason) block(scope, `Cible interdite : ${canonical(abs)} — ${reason}.`);
}

process.exit(0);
