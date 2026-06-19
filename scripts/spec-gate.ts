#!/usr/bin/env bun

/**
 * spec-gate.ts — hook PreToolUse qui VERROUILLE `feature-list.json` (spec-driven development).
 *
 * Un feature-list est le contrat d'une feature : une liste de capacités, chacune avec ses `tests`
 * et un drapeau `passes`. Sans garde, l'agent peut « finir » en trichant : éditer le test pour qu'il
 * passe, tout basculer à `passes:true` d'un coup, ou cocher une feature sur un arbre non committé.
 * Ce gate impose 4 invariants — REFUS (exit 2) si l'un est violé :
 *
 *   1. SEUL `passes` est mutable. `id` / `description` / `tests` sont IMMUABLES (on ne change pas le
 *      test pour faire passer la feature). Retirer une feature de la liste est interdit.
 *   2. Au plus UN false→true par invocation (interdit le batch-flip « tout est fini »).
 *   3. Un flip vers `passes:true` exige un arbre git MERGE-CLEAN (hors le feature-list lui-même) :
 *      un spec vert doit refléter du travail COMMITTÉ, pas un working tree sale.
 *   4. Le JSON proposé doit rester valide + porter un tableau `features` avec des `id`.
 *
 * exit 0 = autorisé (y compris pour tout fichier ≠ feature-list.json : le gate est inerte ailleurs).
 * exit 2 = refusé (message sur stderr, comme security.ts / scope-fence.ts).
 *
 * SELF-CONTAINED (copié tel quel dans `.claude/scripts/` des projets générés) : zéro dépendance,
 * built-ins fs/path + git via Bun.spawnSync. Cœur PUR `evaluateSpecGate` exporté + testé.
 */

import { existsSync, readFileSync } from "fs";
import { basename, dirname, isAbsolute, join } from "path";

export interface Feature {
  id?: unknown;
  description?: unknown;
  tests?: unknown;
  passes?: unknown;
}
export interface SpecGateResult {
  decision: "allow" | "block";
  reason: string;
}

const allow = (reason = "ok"): SpecGateResult => ({ decision: "allow", reason });
const block = (reason: string): SpecGateResult => ({ decision: "block", reason });

function featuresOf(parsed: unknown): Feature[] | null {
  if (!parsed || typeof parsed !== "object") return null;
  const f = (parsed as Record<string, unknown>)["features"];
  return Array.isArray(f) ? (f as Feature[]) : null;
}

/**
 * Cœur pur (testable sans git ni fs) : décide à partir de l'ancien et du nouveau texte du fichier,
 * plus un booléen disant si l'arbre est merge-clean (en ignorant le feature-list lui-même).
 */
export function evaluateSpecGate(oldText: string, newText: string, treeCleanExceptSelf: boolean): SpecGateResult {
  let newParsed: unknown;
  try {
    newParsed = JSON.parse(newText);
  } catch {
    return block("feature-list.json doit rester un JSON valide (modification refusée).");
  }
  const newFeatures = featuresOf(newParsed);
  if (!newFeatures) return block("feature-list.json doit contenir un tableau `features`.");

  // Ancien état : si illisible/absent, on ne fait respecter que les invariants sur le NOUVEAU.
  let oldFeatures: Feature[] | null = null;
  try {
    oldFeatures = featuresOf(JSON.parse(oldText));
  } catch {
    oldFeatures = null;
  }

  const idOf = (f: Feature): string => (typeof f.id === "string" ? f.id : "");
  const oldMap = new Map<string, Feature>();
  if (oldFeatures) for (const f of oldFeatures) if (idOf(f)) oldMap.set(idOf(f), f);

  const newMap = new Map<string, Feature>();
  for (const f of newFeatures) {
    const id = idOf(f);
    if (!id) return block("chaque feature doit porter un `id` (string).");
    newMap.set(id, f);
  }

  // Invariant 1b : aucune feature retirée (on ne supprime pas un item de spec pour « finir »).
  if (oldFeatures) {
    for (const id of oldMap.keys()) {
      if (!newMap.has(id)) return block(`feature « ${id} » retirée — une feature de spec ne se supprime pas.`);
    }
  }

  let newlyPassing = 0;
  for (const [id, nf] of newMap) {
    const of = oldMap.get(id);
    if (of) {
      // Invariant 1 : description + tests immuables.
      if (String(of.description ?? "") !== String(nf.description ?? "")) {
        return block(`description de « ${id} » modifiée — immuable (seul `+"`passes`"+` change).`);
      }
      if (JSON.stringify(of.tests ?? null) !== JSON.stringify(nf.tests ?? null)) {
        return block(`tests de « ${id} » modifiés — immuables (on ne change pas le test pour faire passer la feature).`);
      }
      if (of.passes !== true && nf.passes === true) newlyPassing++;
    } else {
      // Nouvelle feature : autorisée, mais si déjà à true, elle compte dans le budget false→true.
      if (nf.passes === true) newlyPassing++;
    }
  }

  // Invariant 2 : au plus un passage à true par invocation.
  if (newlyPassing > 1) {
    return block(`${newlyPassing} features passées à `+"`passes:true`"+` en une fois — une seule autorisée par invocation (pas de batch « tout est fini »).`);
  }
  // Invariant 3 : un flip vers true exige un arbre merge-clean.
  if (newlyPassing >= 1 && !treeCleanExceptSelf) {
    return block("arbre git non merge-clean — committe le travail avant de marquer une feature `passes:true` (un spec vert reflète du committé, pas un working tree sale).");
  }
  return allow();
}

// ---------- hook PreToolUse ----------
interface HookInput {
  cwd?: unknown;
  tool_name?: unknown;
  tool_input?: {
    file_path?: unknown;
    path?: unknown;
    content?: unknown;
    old_string?: unknown;
    new_string?: unknown;
    replace_all?: unknown;
    edits?: unknown;
  };
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
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

function applyEdit(content: string, oldString: string, newString: string, replaceAll: boolean): string {
  if (!oldString) return content;
  if (replaceAll) return content.split(oldString).join(newString);
  const i = content.indexOf(oldString);
  return i === -1 ? content : content.slice(0, i) + newString + content.slice(i + oldString.length);
}

/** Texte proposé après application de l'outil (Write/Edit/MultiEdit) sur le contenu courant. */
function proposedText(tool: string, input: HookInput, current: string): string {
  const ti = input.tool_input ?? {};
  if (tool === "Write") return str(ti.content);
  if (tool === "Edit") return applyEdit(current, str(ti.old_string), str(ti.new_string), ti.replace_all === true);
  if (tool === "MultiEdit") {
    let text = current;
    const edits = Array.isArray(ti.edits) ? ti.edits : [];
    for (const e of edits) {
      if (e && typeof e === "object") {
        const o = e as Record<string, unknown>;
        text = applyEdit(text, str(o.old_string), str(o.new_string), o.replace_all === true);
      }
    }
    return text;
  }
  return current;
}

/** Arbre merge-clean en ignorant le feature-list lui-même (qu'on est justement en train d'éditer). */
function treeCleanExceptSelf(dir: string, selfPath: string): boolean {
  try {
    const r = Bun.spawnSync(["git", "status", "--porcelain"], { cwd: dir, stderr: "ignore" });
    if (r.exitCode !== 0) return true; // hors dépôt git : pas de contrainte d'arbre (best-effort)
    const lines = r.stdout.toString().split(/\r?\n/).filter(Boolean);
    const selfBase = basename(selfPath);
    const others = lines.filter((l) => !l.slice(3).trim().endsWith(selfBase));
    return others.length === 0;
  } catch {
    return true;
  }
}

if (import.meta.main) {
  const input = await readHookInput();
  const tool = str(input.tool_name);
  if (tool !== "Write" && tool !== "Edit" && tool !== "MultiEdit") process.exit(0);

  const fp = str(input.tool_input?.file_path) || str(input.tool_input?.path);
  if (!fp || basename(fp) !== "feature-list.json") process.exit(0); // inerte hors feature-list

  const base = str(input.cwd) || process.cwd();
  const abs = isAbsolute(fp) ? fp : join(base, fp);
  const current = existsSync(abs) ? readFileSync(abs, "utf-8") : "{}";
  const next = proposedText(tool, input, current);
  const clean = treeCleanExceptSelf(dirname(abs), abs);

  const verdict = evaluateSpecGate(current, next, clean);
  if (verdict.decision === "block") {
    console.error(`[SPEC-GATE] feature-list.json verrouillé : modification refusée.\n  ${verdict.reason}`);
    process.exit(2);
  }
  process.exit(0);
}
