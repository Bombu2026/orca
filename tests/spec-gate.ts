#!/usr/bin/env bun

/**
 * tests/spec-gate.ts — couverture comportementale du verrou feature-list.json.
 * Cœur pur `evaluateSpecGate` (les 4 invariants) + bout-en-bout via le hook PreToolUse
 * (stdin payload réel + arbre git sale/propre).
 */

import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { evaluateSpecGate } from "../scripts/spec-gate";

const ROOT = import.meta.dir.slice(0, import.meta.dir.lastIndexOf("/"));
const SCRIPT = join(ROOT, "scripts", "spec-gate.ts");
const TMP = "/tmp/assistant-spec-gate-test";

let passed = 0;
function assert(condition: unknown, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  passed++;
}

const feat = (id: string, passes: boolean, tests: string[] = [`${id} works`], description = id) =>
  ({ id, description, tests, passes });
const list = (...features: object[]) => JSON.stringify({ features });

// ── Cœur pur : les 4 invariants (treeClean injecté) ──────────────────────────

// 1. passes seul change (false→true), arbre propre → ALLOW
assert(
  evaluateSpecGate(list(feat("a", false)), list(feat("a", true)), true).decision === "allow",
  "flip false→true seul, arbre propre → allow",
);

// 1b. tests modifiés → BLOCK (immuables)
assert(
  evaluateSpecGate(list(feat("a", false)), list(feat("a", true, ["a CHEATED"])), true).decision === "block",
  "tests modifiés → block (immuables)",
);

// 1c. description modifiée → BLOCK
assert(
  evaluateSpecGate(list(feat("a", false)), list(feat("a", false, ["a works"], "other")), true).decision === "block",
  "description modifiée → block (immuable)",
);

// 1d. feature retirée → BLOCK
assert(
  evaluateSpecGate(list(feat("a", false), feat("b", false)), list(feat("a", false)), true).decision === "block",
  "feature retirée → block",
);

// 2. deux false→true en une fois → BLOCK
assert(
  evaluateSpecGate(list(feat("a", false), feat("b", false)), list(feat("a", true), feat("b", true)), true).decision === "block",
  "2 flips false→true → block (un seul autorisé)",
);
// 2b. un seul des deux → ALLOW
assert(
  evaluateSpecGate(list(feat("a", false), feat("b", false)), list(feat("a", true), feat("b", false)), true).decision === "allow",
  "1 flip false→true → allow",
);
// 2c. nouvelle feature ajoutée à true compte dans le budget : a→true + new(true) = 2 → BLOCK
assert(
  evaluateSpecGate(list(feat("a", false)), list(feat("a", true), feat("b", true)), true).decision === "block",
  "flip + nouvelle feature déjà true = 2 passages → block",
);

// 3. flip false→true mais arbre SALE → BLOCK
assert(
  evaluateSpecGate(list(feat("a", false)), list(feat("a", true)), false).decision === "block",
  "flip false→true sur arbre sale → block",
);
// 3b. true→false sur arbre sale → ALLOW (un un-pass ne nécessite pas un arbre propre)
assert(
  evaluateSpecGate(list(feat("a", true)), list(feat("a", false)), false).decision === "allow",
  "un-pass (true→false) sur arbre sale → allow",
);

// 4. JSON invalide → BLOCK ; pas de tableau features → BLOCK
assert(evaluateSpecGate(list(feat("a", false)), "{ not json", true).decision === "block", "JSON invalide → block");
assert(evaluateSpecGate(list(feat("a", false)), JSON.stringify({ x: 1 }), true).decision === "block", "pas de tableau features → block");

// ── Bout-en-bout via le hook PreToolUse (stdin réel + git) ───────────────────
async function runHook(payload: unknown, cwd: string): Promise<number> {
  const proc = Bun.spawn(["bun", SCRIPT], { cwd, stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  proc.stdin.write(JSON.stringify(payload));
  proc.stdin.end();
  return await proc.exited;
}

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
// dépôt git propre avec un feature-list committé
Bun.spawnSync(["git", "init", "-q"], { cwd: TMP });
Bun.spawnSync(["git", "config", "user.email", "t@t.t"], { cwd: TMP });
Bun.spawnSync(["git", "config", "user.name", "t"], { cwd: TMP });
const flPath = join(TMP, "feature-list.json");
writeFileSync(flPath, list(feat("a", false)));
Bun.spawnSync(["git", "add", "-A"], { cwd: TMP });
Bun.spawnSync(["git", "commit", "-qm", "init"], { cwd: TMP });

// arbre propre → flip autorisé (exit 0)
const editFlip = {
  tool_name: "Edit",
  cwd: TMP,
  tool_input: { file_path: flPath, old_string: '"passes":false', new_string: '"passes":true' },
};
// note : JSON.stringify produit "passes":false sans espace
assert((await runHook(editFlip, TMP)) === 0, "hook: flip sur arbre propre → exit 0");

// arbre SALE (fichier non committé ailleurs) → flip refusé (exit 2)
writeFileSync(join(TMP, "dirt.txt"), "uncommitted");
assert((await runHook(editFlip, TMP)) === 2, "hook: flip sur arbre sale → exit 2");

// fichier ≠ feature-list.json → inerte (exit 0) même arbre sale
const otherEdit = { tool_name: "Edit", cwd: TMP, tool_input: { file_path: join(TMP, "README.md"), old_string: "x", new_string: "y" } };
assert((await runHook(otherEdit, TMP)) === 0, "hook: autre fichier → exit 0 (inerte)");

rmSync(TMP, { recursive: true, force: true });
console.log(`spec-gate: ${passed}/${passed} passed`);
console.log("spec-gate: ok");
