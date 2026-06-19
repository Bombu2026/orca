#!/usr/bin/env bun

/**
 * tests/autonomy.ts — couverture comportementale de scripts/lib/autonomy.ts (Autonomy Card).
 *
 * Garde anti-régression sur les 6 leviers : les 6 toujours présents et ordonnés ; capacités
 * harness (workflows, /loop·/goal) toujours « armed » ; permissions « armed » seulement si un
 * defaultMode auto est configuré, sinon « reminder » ; self-verify CONTEXTUEL au type (web sans
 * navigateur = missing bloquant ; api sans serveur = missing bloquant ; cli avec bin = armed) ;
 * détection via ASSISTANT_HOME pour un test déterministe (indépendant du ~/.claude réel) ;
 * compteur blockers cohérent ; zéro dépendance npm.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

const ROOT = import.meta.dir.slice(0, import.meta.dir.lastIndexOf("/")); // repo root, portable
const SCRIPT = join(ROOT, "scripts", "lib", "autonomy.ts");
const TMP = "/tmp/assistant-autonomy-test";

type Lever = { id: string; label: string; state: string; detail: string; blocking?: boolean };
type Report = { levers: Lever[]; lines: string[]; md: string[]; blockers: number };

function assert(condition: unknown, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

/** Lance le CLI avec un HOME factice (ASSISTANT_HOME) → détection MCP/skills déterministe. */
function runJson(dir: string, type: string, fakeHome: string, extra: string[] = []): Report {
  const p = Bun.spawnSync(["bun", SCRIPT, dir, `--type=${type}`, "--json", ...extra], {
    cwd: ROOT,
    env: { ...process.env, ASSISTANT_HOME: fakeHome, HOME: fakeHome },
  });
  assert(p.exitCode === 0, `exit 0 for ${dir} (${type}) — got ${p.exitCode}\n${p.stderr.toString()}`);
  const out = new TextDecoder().decode(p.stdout).trim();
  try {
    return JSON.parse(out) as Report;
  } catch {
    console.error(out);
    assert(false, "valid JSON output");
    throw new Error("unreachable");
  }
}

function lever(r: Report, id: string): Lever {
  const l = r.levers.find((x) => x.id === id);
  assert(l, `lever ${id} present`);
  return l as Lever;
}

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

// Deux HOME factices : l'un SANS skill browse (navigateur indisponible), l'autre AVEC.
const homeBare = join(TMP, "home-bare");
mkdirSync(homeBare, { recursive: true });
const homeBrowse = join(TMP, "home-browse");
mkdirSync(join(homeBrowse, ".claude", "skills", "browse"), { recursive: true });

// 0. Zéro dépendance npm : imports built-in (fs/os/path/node:*) ou relatifs locaux uniquement.
const src = readFileSync(SCRIPT, "utf-8");
const importLines = src.split("\n").filter((l) => /^\s*import\b/.test(l));
assert(importLines.length > 0, "autonomy.ts a des imports");
for (const l of importLines) {
  const ok = /from\s+"(node:)?(fs|os|path)"/.test(l) || /from\s+"\.\.?\//.test(l);
  assert(ok, `autonomy.ts zéro-dep — import non built-in/local « ${l.trim()} »`);
}

// 1. Web sans navigateur (home bare, pas de .mcp.json) → self-verify MISSING + bloquant.
const web = join(TMP, "web");
mkdirSync(web, { recursive: true });
writeFileSync(join(web, "package.json"), JSON.stringify({ scripts: { dev: "next dev" }, dependencies: { next: "15" } }));
const rWebNoVerify = runJson(web, "web-fullstack", homeBare);
assert(rWebNoVerify.levers.length === 6, `6 leviers exactement (got ${rWebNoVerify.levers.length})`);
assert(
  rWebNoVerify.levers.map((l) => l.id).join(",") === "permissions,workflows,loop-goal,cloud,self-verify,rule-of-two",
  "ordre des leviers stable",
);
assert(lever(rWebNoVerify, "self-verify").state === "missing", "web sans navigateur → self-verify missing");
assert(lever(rWebNoVerify, "self-verify").blocking === true, "web sans navigateur → bloquant");
assert(rWebNoVerify.blockers === 1, `blockers=1 (got ${rWebNoVerify.blockers})`);

// 2. Même web MAIS home avec skill browse → self-verify ARMED, plus de blocage.
const rWebBrowse = runJson(web, "web-fullstack", homeBrowse);
assert(lever(rWebBrowse, "self-verify").state === "armed", "web + browse → self-verify armed");
assert(rWebBrowse.blockers === 0, "web + browse → 0 bloquant");

// 3. Web avec Playwright MCP projet (.mcp.json) → armed même sans browse global.
const webMcp = join(TMP, "web-mcp");
mkdirSync(webMcp, { recursive: true });
writeFileSync(join(webMcp, "package.json"), JSON.stringify({ scripts: { dev: "next dev" }, dependencies: { next: "15" } }));
writeFileSync(join(webMcp, ".mcp.json"), JSON.stringify({ mcpServers: { playwright: { command: "npx" } } }));
assert(lever(runJson(webMcp, "web-fullstack", homeBare), "self-verify").state === "armed", "web + Playwright MCP → armed");

// 4. Capacités harness : workflows TOUJOURS armed ; /loop·/goal GATED par la version CC
//    (jamais un faux « armed » : sans version connue → reminder).
for (const r of [rWebNoVerify, rWebBrowse]) {
  assert(lever(r, "workflows").state === "armed", "workflows toujours armed");
  assert(lever(r, "loop-goal").state === "reminder", "/loop·/goal sans version CC → reminder");
  assert(lever(r, "cloud").state === "reminder", "cloud = reminder (non détectable)");
}

// 4b. Gating /goal par version : ≥2.1.139 armed · ≥2.1.72 partial (loop only) · sinon missing.
assert(lever(runJson(web, "web-fullstack", homeBare, ["--cc=2.1.152"]), "loop-goal").state === "armed", "CC 2.1.152 → /goal armed");
const partial = lever(runJson(web, "web-fullstack", homeBare, ["--cc=2.1.76"]), "loop-goal");
assert(partial.state === "partial" && partial.detail.includes("/loop"), "CC 2.1.76 → partial, fallback /loop proposé");
assert(lever(runJson(web, "web-fullstack", homeBare, ["--cc=2.0.0"]), "loop-goal").state === "missing", "CC 2.0.0 → missing (ni /loop ni /goal)");
assert(runJson(web, "web-fullstack", homeBrowse, ["--cc=2.1.152"]).blockers === 0, "loop-goal partial/missing ne bloque jamais (réglage session, pas projet)");

// 5. Permissions : reminder par défaut, armed si defaultMode auto configuré.
assert(lever(rWebNoVerify, "permissions").state === "reminder", "permissions reminder sans config");
const webPerm = join(TMP, "web-perm");
mkdirSync(join(webPerm, ".claude"), { recursive: true });
writeFileSync(join(webPerm, "package.json"), JSON.stringify({ scripts: { dev: "next dev" } }));
writeFileSync(join(webPerm, ".claude", "settings.local.json"), JSON.stringify({ permissions: { defaultMode: "acceptEdits" } }));
assert(lever(runJson(webPerm, "web-fullstack", homeBare), "permissions").state === "armed", "permissions armed si defaultMode=acceptEdits");

// 6. api-backend : sans serveur → missing bloquant ; avec dev → armed.
const api = join(TMP, "api");
mkdirSync(api, { recursive: true });
writeFileSync(join(api, "package.json"), JSON.stringify({ scripts: { build: "tsc" }, dependencies: { fastify: "4" } }));
const rApi = runJson(api, "api-backend", homeBare);
assert(lever(rApi, "self-verify").state === "missing" && lever(rApi, "self-verify").blocking, "api sans serveur → missing bloquant");
const apiRun = join(TMP, "api-run");
mkdirSync(apiRun, { recursive: true });
writeFileSync(join(apiRun, "package.json"), JSON.stringify({ scripts: { dev: "tsx watch" }, dependencies: { fastify: "4" } }));
assert(lever(runJson(apiRun, "api-backend", homeBare), "self-verify").state === "armed", "api + dev → armed");

// 7. cli-tool avec bin → armed (navigateur non requis).
const cli = join(TMP, "cli");
mkdirSync(cli, { recursive: true });
writeFileSync(join(cli, "package.json"), JSON.stringify({ bin: { mycli: "./dist/i.js" }, scripts: { build: "tsc" } }));
assert(lever(runJson(cli, "cli-tool", homeBare), "self-verify").state === "armed", "cli avec bin → armed");

// 8. Cohérence de rendu : 6 lignes terminal + 6 lignes md, md marque le bloquant.
assert(rWebNoVerify.lines.length === 6 && rWebNoVerify.md.length === 6, "6 lignes terminal + 6 md");
assert(rWebNoVerify.md.some((m) => m.includes("gap bloquant")), "md signale le gap bloquant");

// 9. Rule of Two (6e levier) — lethal trifecta.
// 9a. web {next} : ni A ni B ni C → rule-of-two armed (n'ajoute pas de blocage).
assert(lever(rWebNoVerify, "rule-of-two").state === "armed", "web simple → rule-of-two armed (pas de trifecta)");
// 9b. bot-agent avec données privées (auth) + LLM (ingestion) + paiement (sortie) → trifecta → BLOQUANT.
const botTri = join(TMP, "bot-trifecta");
mkdirSync(botTri, { recursive: true });
writeFileSync(join(botTri, "package.json"), JSON.stringify({ scripts: { dev: "tsx watch" }, dependencies: { "@ai-sdk/anthropic": "1", "better-auth": "1", stripe: "17" } }));
const rBotTri = runJson(botTri, "bot-agent", homeBare);
assert(lever(rBotTri, "rule-of-two").state === "missing" && lever(rBotTri, "rule-of-two").blocking === true, "bot-agent en lethal trifecta → rule-of-two missing + bloquant");
assert(rBotTri.blockers >= 1, "trifecta → au moins un levier bloquant");
assert(rBotTri.md.some((m) => /trifecta/i.test(m)), "md explique la lethal trifecta");
// 9c. bot-agent SANS données privées (que LLM) → B+C seulement (≤2) → armed.
const botSafe = join(TMP, "bot-safe");
mkdirSync(botSafe, { recursive: true });
writeFileSync(join(botSafe, "package.json"), JSON.stringify({ scripts: { dev: "tsx watch" }, dependencies: { "@ai-sdk/anthropic": "1" } }));
assert(lever(runJson(botSafe, "bot-agent", homeBare), "rule-of-two").state === "armed", "bot-agent sans données privées (≤2 propriétés) → rule-of-two armed");

rmSync(TMP, { recursive: true, force: true });
console.log("autonomy: ok");
