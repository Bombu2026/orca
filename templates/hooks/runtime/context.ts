#!/usr/bin/env bun

/**
 * context.ts — primitives d'économie du context window (loop-engineering 2026).
 *
 * Le context window est LA contrainte ; ces hooks la défendent par construction :
 *   - tool-output-trim (PostToolUse Bash) : tronque une sortie > 200 lignes AVANT que Claude la
 *     voie, via `hookSpecificOutput.updatedToolOutput` (CC v2.1.121+) — head 50 + tail 20 conservés.
 *   - precompact-dump (PreCompact) : écrit l'état courant (cwd, branche, fichiers modifiés) sur
 *     disque avant la compaction, pour qu'aucune info clé ne soit perdue.
 *
 * Lecture stdin = payload JSON du hook. N'échoue jamais (best-effort) : un hook qui jette ne doit
 * pas casser le tour. Zéro dépendance npm (built-ins fs/path + Bun.spawnSync).
 */

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

interface HookInput {
  tool_response?: unknown;
  tool_result?: unknown;
}

const action = process.argv[2] ?? "";

const TRIM_LIMIT = 200; // au-delà : on tronque
const TRIM_HEAD = 50;
const TRIM_TAIL = 20;

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

function projectDir(): string {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

/** Extrait le texte de sortie d'un tool, quel que soit le format du `tool_response`. */
function toolOutputText(input: HookInput): string {
  const r = input.tool_response ?? input.tool_result;
  if (typeof r === "string") return r;
  if (r && typeof r === "object") {
    const o = r as Record<string, unknown>;
    for (const k of ["stdout", "output", "content", "result", "text"]) {
      if (typeof o[k] === "string") return o[k] as string;
    }
    const parts: string[] = [];
    for (const k of ["stdout", "stderr"]) if (typeof o[k] === "string") parts.push(o[k] as string);
    if (parts.length) return parts.join("\n");
  }
  return "";
}

function toolOutputTrim(input: HookInput): void {
  const text = toolOutputText(input);
  const lines = text.split(/\r?\n/);
  if (lines.length <= TRIM_LIMIT) {
    console.log("{}"); // rien à tronquer : on laisse la sortie intacte
    return;
  }
  const head = lines.slice(0, TRIM_HEAD).join("\n");
  const tail = lines.slice(-TRIM_TAIL).join("\n");
  const omitted = lines.length - TRIM_HEAD - TRIM_TAIL;
  const trimmed = `${head}\n...[${omitted} lignes tronquées par tool-output-trim — relance avec head/grep/tail ciblé pour le détail]...\n${tail}`;
  console.log(JSON.stringify({ hookSpecificOutput: { updatedToolOutput: trimmed } }));
}

function gitOut(args: string[]): string {
  try {
    const r = Bun.spawnSync(["git", ...args], { cwd: projectDir(), stderr: "ignore" });
    return r.exitCode === 0 ? r.stdout.toString().trim() : "";
  } catch {
    return "";
  }
}

function precompactDump(): void {
  try {
    const dir = join(projectDir(), ".claude", "local");
    mkdirSync(dir, { recursive: true });
    const state = {
      savedAt: new Date().toISOString(),
      workingDir: projectDir(),
      branch: gitOut(["branch", "--show-current"]) || "none",
      modifiedFiles: gitOut(["diff", "--name-only"]).split(/\r?\n/).filter(Boolean),
    };
    writeFileSync(join(dir, "session-state.json"), JSON.stringify(state, null, 2));
  } catch {
    /* best-effort : ne bloque jamais la compaction */
  }
  console.log("{}");
}

const input = await readHookInput();

if (action === "tool-output-trim") {
  toolOutputTrim(input);
} else if (action === "precompact-dump") {
  precompactDump();
} else {
  console.log("{}");
}
