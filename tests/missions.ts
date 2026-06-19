#!/usr/bin/env bun

/**
 * tests/missions.ts — couverture COMPORTEMENTALE du système de missions + scope-fence.
 *
 * On ne teste pas « le fichier existe » : on EXÉCUTE le hook avec de vrais payloads stdin
 * et on vérifie qu'il bloque (exit 2) hors-scope et laisse passer (exit 0) en-scope. C'est
 * la définition « fonctionnel » : le mécanisme tourne réellement, pas un typecheck vert.
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  canonical,
  computeScope,
  denyReason,
  ASSISTANT_DIR,
  arm,
  disarm,
  readActiveScope,
  type ActiveScope,
} from "../scripts/lib/scope";
import { loadMissions, validate, validateAll } from "../scripts/missions/registry";
import type { MissionManifest } from "../scripts/missions/types";

const ROOT = import.meta.dir.slice(0, import.meta.dir.lastIndexOf("/"));
const FENCE = join(ROOT, "scripts", "missions", "scope-fence.ts");

let passed = 0;
const failures: string[] = [];
function assert(cond: boolean, name: string, detail = ""): void {
  if (cond) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

/** Lance le hook avec un payload JSON sur stdin ; retourne le code de sortie. */
function runFence(payload: object): number {
  const p = Bun.spawnSync(["bun", FENCE], {
    stdin: Buffer.from(JSON.stringify(payload)),
    stdout: "pipe",
    stderr: "pipe",
  });
  return p.exitCode ?? -1;
}

// ---------------------------------------------------------------------------
// 1. Registre + validation
// ---------------------------------------------------------------------------
const missions = await loadMissions();
assert(missions.length >= 1, "registre charge au moins une mission", `${missions.length}`);
assert(
  missions.some((m) => m.id === "dev-organizer"),
  "dev-organizer est enregistrée",
);
const { ok, errors } = await validateAll();
assert(ok, "tous les manifestes sont valides", errors.join("; "));

// Un manifeste avec un fence ouvert doit être REJETÉ par validate().
const badManifest = {
  id: "bad",
  intent: "x",
  triggers: [/x/],
  scopeKind: "project",
  needsArg: true,
  isolation: "inline",
  allowedWrites: ["**"],
  deniedWrites: [],
  recallScope: null,
  handler: "x",
  removable: true,
  restore: "x",
} as MissionManifest;
assert(validate(badManifest).some((e) => e.includes("trop large")), "validate rejette un fence ouvert (**)");

// ---------------------------------------------------------------------------
// 2. computeScope + denyReason (la décision pure)
// ---------------------------------------------------------------------------
const projectDir = mkdtempSync(join(canonical(tmpdir()), "mission-proj-"));
const otherDir = mkdtempSync(join(canonical(tmpdir()), "mission-other-"));
const devOrganizer = missions.find((m) => m.id === "dev-organizer")!;
const scope = computeScope(devOrganizer, projectDir, "test-session");

assert(scope.target === canonical(projectDir), "computeScope canonicalise la cible");
assert(
  scope.deniedWrites.some((d) => d.includes("ASSISTANT_DIR")),
  "computeScope injecte ${ASSISTANT_DIR} dans deniedWrites (dogfood)",
);
assert(
  denyReason(join(projectDir, "QUALITY_SCORE.md"), scope) === null,
  "écriture DANS la cible : autorisée",
);
assert(
  denyReason(join(otherDir, "leak.md"), scope) !== null,
  "écriture dans un AUTRE projet : refusée (non-contamination)",
);
assert(
  denyReason(join(ASSISTANT_DIR, "scripts", "hack.ts"), scope) !== null,
  "écriture dans l'arbre d'Assistant : refusée (dogfood enforcé)",
);

// ---------------------------------------------------------------------------
// 2b. Denylist NOYAU — une mission self-maintenance (allowSelf) ne lève PAS la serrure.
//     C'est l'invariant qui rend l'auto-merge défendable : le signal (données/docs inertes)
//     franchit la frontière, le code/fence/manifestes/tests JAMAIS — même en self-improve.
// ---------------------------------------------------------------------------
const selfImprove: MissionManifest = {
  id: "self-improve-probe",
  intent: "sonde de test — mission self-maintenance qui tente de s'octroyer trop large",
  triggers: [/self-improve-probe/],
  scopeKind: "project",
  needsArg: false,
  isolation: "inline",
  allowedWrites: [
    join(ASSISTANT_DIR, "references", "workflows-benchmark.jsonl"), // donnée inerte — légitime
    join(ASSISTANT_DIR, "references", "workflow-playbooks") + "/**", // playbooks markdown — légitime
    join(ASSISTANT_DIR, "scripts") + "/**", // TENTATIVE d'élévation — doit être neutralisée
  ],
  deniedWrites: [],
  allowSelf: true, // lève l'interdit GLOBAL ${ASSISTANT_DIR}/**, mais PAS la denylist noyau
  recallScope: null,
  handler: "x",
  removable: true,
  restore: "x",
};
const selfScope = computeScope(selfImprove, projectDir, "test-session");
for (const sentinel of [
  join(ASSISTANT_DIR, "scripts", "lib", "scope.ts"),
  join(ASSISTANT_DIR, "scripts", "missions", "scope-fence.ts"),
  join(ASSISTANT_DIR, "scripts", "missions", "self-improve-probe.mission.ts"),
  join(ASSISTANT_DIR, "scripts", "workflow-bench.ts"),
  join(ASSISTANT_DIR, "tests", "missions.ts"),
  join(ASSISTANT_DIR, "SKILL.md"),
  join(ASSISTANT_DIR, "package.json"),
  join(ASSISTANT_DIR, ".claude", "settings.local.json"),
]) {
  assert(
    denyReason(sentinel, selfScope) !== null,
    "denylist noyau: allowSelf NE lève PAS l'interdit sur la serrure",
    sentinel.replace(ASSISTANT_DIR, "<root>"),
  );
}
// ... mais les données/docs inertes RESTENT écrivables sous allowSelf (sinon l'auto-merge n'a rien à promouvoir).
assert(
  denyReason(join(ASSISTANT_DIR, "references", "workflows-benchmark.jsonl"), selfScope) === null,
  "denylist noyau: une donnée inerte (references/*.jsonl) reste écrivable en self-maintenance",
);
assert(
  denyReason(join(ASSISTANT_DIR, "references", "workflow-playbooks", "LEADERBOARD.md"), selfScope) === null,
  "denylist noyau: les playbooks markdown restent écrivables en self-maintenance",
);
// validate() doit REFUSER ce manifeste : son allowedWrites atteint la zone noyau (scripts/**).
assert(
  validate(selfImprove).some((e) => e.includes("noyau")),
  "validate rejette un manifeste dont allowedWrites atteint la denylist noyau (même allowSelf)",
);

// ---------------------------------------------------------------------------
// 3. Le HOOK end-to-end (payloads stdin réels)
// ---------------------------------------------------------------------------

// 3a. Aucun scope armé → legacy → exit 0 (rétro-compat)
disarm("hooktest");
assert(
  runFence({ session_id: "hooktest", tool_name: "Write", tool_input: { file_path: join(otherDir, "x.md") } }) === 0,
  "hook sans scope armé : laisse passer (legacy)",
);

// 3b. On arme un scope sur projectDir pour la session "hooktest"
arm(computeScope(devOrganizer, projectDir, "hooktest"));
assert(readActiveScope("hooktest") !== null, "scope armé et relu");

// Write DANS la cible → exit 0
assert(
  runFence({ session_id: "hooktest", tool_name: "Write", tool_input: { file_path: join(projectDir, "ok.md") } }) === 0,
  "hook : Write dans la cible → autorisé",
);
// Write dans l'arbre Assistant → exit 2
assert(
  runFence({ session_id: "hooktest", tool_name: "Write", tool_input: { file_path: join(ASSISTANT_DIR, "SKILL.md") } }) === 2,
  "hook : Write dans l'arbre Assistant → BLOQUÉ",
);
// Write dans un autre projet → exit 2
assert(
  runFence({ session_id: "hooktest", tool_name: "Write", tool_input: { file_path: join(otherDir, "leak.md") } }) === 2,
  "hook : Write dans un autre projet → BLOQUÉ",
);
// Bash redirection hors-scope → exit 2
assert(
  runFence({ session_id: "hooktest", tool_name: "Bash", tool_input: { command: `echo pwned > ${join(otherDir, "leak.txt")}` } }) === 2,
  "hook : redirection Bash hors-scope → BLOQUÉE",
);
// Bash redirection in-scope → exit 0
assert(
  runFence({ session_id: "hooktest", tool_name: "Bash", tool_input: { command: `echo ok > ${join(projectDir, "ok.txt")}` } }) === 0,
  "hook : redirection Bash dans la cible → autorisée",
);
// Bash cp vers l'arbre Assistant → exit 2
assert(
  runFence({ session_id: "hooktest", tool_name: "Bash", tool_input: { command: `cp /tmp/x ${join(ASSISTANT_DIR, "x")}` } }) === 2,
  "hook : cp vers l'arbre Assistant → BLOQUÉ",
);
// Bash lecture pure (pas d'écriture) → exit 0
assert(
  runFence({ session_id: "hooktest", tool_name: "Bash", tool_input: { command: `cat ${join(otherDir, "x")}` } }) === 0,
  "hook : commande Bash sans écriture → laissée passer",
);

// 3c. Isolation par session : une autre session reste non-armée
assert(
  runFence({ session_id: "autre-session", tool_name: "Write", tool_input: { file_path: join(otherDir, "y.md") } }) === 0,
  "hook : scope d'une session ne fuit pas vers une autre session",
);

// ---------------------------------------------------------------------------
// 3d. NON-RÉGRESSION : les bypass trouvés par la red-team sont FERMÉS
// ---------------------------------------------------------------------------
const fenceBash = (command: string) =>
  runFence({ session_id: "hooktest", tool_name: "Bash", tool_input: { command } });

// Redirection clobber `>|` hors-scope → BLOQUÉE (regex élargie)
assert(fenceBash(`echo x >| ${join(otherDir, "clob.txt")}`) === 2, "redteam: redirection >| hors-scope bloquée");
// `&>` fusion stdout/stderr hors-scope → BLOQUÉE
assert(fenceBash(`cmd &> ${join(otherDir, "amp.txt")}`) === 2, "redteam: redirection &> hors-scope bloquée");
// Chemin via variable shell `> $X` → indécidable → BLOQUÉ (fail-closed)
assert(fenceBash(`X=${join(otherDir, "v.txt")}; echo x > $X`) === 2, "redteam: > $VAR (métacaractère) bloqué");
// Interpréteur python3 -c → BLOQUÉ (fail-closed)
assert(fenceBash(`python3 -c "open('${join(otherDir, "h.txt")}','w').write('x')"`) === 2, "redteam: python3 -c bloqué");
// Interpréteur node -e → BLOQUÉ
assert(fenceBash(`node -e "require('fs').writeFileSync('${join(otherDir, "n.txt")}','x')"`) === 2, "redteam: node -e bloqué");
// sed -i en place → BLOQUÉ
assert(fenceBash(`sed -i '' s/a/b/ ${join(ASSISTANT_DIR, "SKILL.md")}`) === 2, "redteam: sed -i bloqué");
// Écrivains implicites en position de commande → BLOQUÉS
assert(fenceBash(`touch ${join(otherDir, "t.txt")}`) === 2, "redteam: touch (command word) bloqué");
assert(fenceBash(`install /etc/hosts ${join(otherDir, "i.txt")}`) === 2, "redteam: install bloqué");
assert(fenceBash(`ln -s /etc/hosts ${join(otherDir, "l.txt")}`) === 2, "redteam: ln bloqué");
assert(fenceBash(`echo ${join(otherDir, "x")} | xargs -I{} cp /etc/hosts {}`) === 2, "redteam: xargs bloqué");
// cp -t (inversion source/cible) → BLOQUÉ
assert(fenceBash(`cp -t ${otherDir}/ ${join(projectDir, "src.txt")}`) === 2, "redteam: cp -t bloqué");
// here-doc / eval → BLOQUÉS
assert(fenceBash(`cat <<EOF > ${join(otherDir, "hd.txt")}\nx\nEOF`) === 2, "redteam: here-doc bloqué");
assert(fenceBash(`eval "echo x > ${join(otherDir, "e.txt")}"`) === 2, "redteam: eval bloqué");

// FAUX POSITIFS À NE PAS BLOQUER : commandes légitimes fréquentes en mission armée
assert(fenceBash(`npm install`) === 0, "non-régression: `npm install` non bloqué (install = sous-commande)");
assert(fenceBash(`bun install`) === 0, "non-régression: `bun install` non bloqué");
assert(fenceBash(`git status && cat ${join(projectDir, "x")}`) === 0, "non-régression: lecture pure non bloquée");
assert(fenceBash(`echo ok > ${join(projectDir, "ok2.txt")}`) === 0, "non-régression: redirection IN-scope autorisée");
assert(fenceBash(`python3 ${join(projectDir, "script.py")}`) === 0, "non-régression: python3 script.py (sans -c) non bloqué");

// Symlink DANGLING in-scope → écriture « à travers » qui s'échappe → BLOQUÉE (canonical corrigé)
const door = join(projectDir, "door");
symlinkSync(join(otherDir, "loot"), door); // cible inexistante (dangling), pointe hors-scope
assert(
  runFence({ session_id: "hooktest", tool_name: "Write", tool_input: { file_path: join(door, "leak.md") } }) === 2,
  "redteam: écriture à travers un symlink dangling in-scope → bloquée (canonical résout le lien)",
);

// NotebookEdit hors-scope → BLOQUÉ ; in-scope → autorisé (matcher + extraction ajoutés)
assert(
  runFence({ session_id: "hooktest", tool_name: "NotebookEdit", tool_input: { notebook_path: join(otherDir, "x.ipynb") } }) === 2,
  "redteam: NotebookEdit hors-scope bloqué",
);
assert(
  runFence({ session_id: "hooktest", tool_name: "NotebookEdit", tool_input: { notebook_path: join(projectDir, "ok.ipynb") } }) === 0,
  "redteam: NotebookEdit in-scope autorisé",
);

// ---------------------------------------------------------------------------
// 3e. Trou MCP-write FERMÉ : pendant une mission armée, tout écrivain MCP (vault/Drive/Gmail)
//     est refusé (fail-closed) ; les LECTURES MCP passent. Prérequis de la mission persona.
// ---------------------------------------------------------------------------
assert(
  runFence({ session_id: "hooktest", tool_name: "mcp__mcpvault__write_note", tool_input: { path: "01 - Projects/x.md" } }) === 2,
  "MCP: write_note pendant mission armée → BLOQUÉ (fail-closed)",
);
assert(
  runFence({ session_id: "hooktest", tool_name: "mcp__mcpvault__patch_note", tool_input: { path: "Memory.md" } }) === 2,
  "MCP: patch_note pendant mission armée → BLOQUÉ",
);
assert(
  runFence({ session_id: "hooktest", tool_name: "mcp__claude_ai_Google_Drive__create_file", tool_input: { name: "leak" } }) === 2,
  "MCP: Drive create_file pendant mission armée → BLOQUÉ",
);
assert(
  runFence({ session_id: "hooktest", tool_name: "mcp__mcpvault__delete_note", tool_input: { path: "x.md" } }) === 2,
  "MCP: delete_note pendant mission armée → BLOQUÉ",
);
// Les LECTURES MCP ne sont PAS bloquées (pas de verbe mutant dans le nom).
assert(
  runFence({ session_id: "hooktest", tool_name: "mcp__mcpvault__read_note", tool_input: { path: "Memory.md" } }) === 0,
  "MCP: read_note (lecture) → autorisé même en mission armée",
);
assert(
  runFence({ session_id: "hooktest", tool_name: "mcp__mcpvault__search_notes", tool_input: { query: "x" } }) === 0,
  "MCP: search_notes (lecture) → autorisé",
);
// Hors mission armée, un écrivain MCP passe (rétro-compat dev libre).
assert(
  runFence({ session_id: "autre-session", tool_name: "mcp__mcpvault__write_note", tool_input: { path: "x.md" } }) === 0,
  "MCP: write_note sans scope armé → autorisé (legacy, dev libre)",
);

disarm("hooktest");

// ---------------------------------------------------------------------------
// 4. resolveTarget (garde côté script) via organise.ts en sous-processus
// ---------------------------------------------------------------------------

// organise sur l'arbre Assistant SANS --self → refus (exit 2)
const selfRun = Bun.spawnSync(["bun", join(ROOT, "scripts", "organise.ts"), ROOT, "--no-write"], {
  stdout: "pipe",
  stderr: "pipe",
});
assert(selfRun.exitCode === 2, "organise refuse d'écrire dans son propre arbre sans --self", `exit ${selfRun.exitCode}`);
assert(
  new TextDecoder().decode(selfRun.stderr).includes("Refus d'écrire dans l'arbre d'Assistant"),
  "organise affiche le message de refus dogfood",
);

// organise sur un projet temp → pas de refus (s'exécute, exit 0)
const okProject = mkdtempSync(join(canonical(tmpdir()), "mission-run-"));
mkdirSync(join(okProject, "src"), { recursive: true });
writeFileSync(join(okProject, "package.json"), JSON.stringify({ name: "tmp" }));
const okRun = Bun.spawnSync(["bun", join(ROOT, "scripts", "organise.ts"), okProject, "--no-write"], {
  stdout: "pipe",
  stderr: "pipe",
});
assert(okRun.exitCode === 0, "organise s'exécute normalement sur un projet tiers", `exit ${okRun.exitCode}`);

// ---------------------------------------------------------------------------
// nettoyage
// ---------------------------------------------------------------------------
for (const d of [projectDir, otherDir, okProject]) rmSync(d, { recursive: true, force: true });

// ---------------------------------------------------------------------------
// rapport
// ---------------------------------------------------------------------------
const total = passed + failures.length;
console.log(`\nmissions: ${passed}/${total} passed`);
if (failures.length) {
  console.log("Failures:");
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log("missions: ok");
