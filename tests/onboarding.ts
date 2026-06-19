#!/usr/bin/env bun

/**
 * tests/onboarding.ts — couverture comportementale de scripts/lib/onboarding.ts (Onboarding Card).
 *
 * Garde anti-régression :
 *  - dérivation du MODE : seed/bootstrap → interview ; next-gap sans brief → interview ;
 *    next-gap AVEC brief (PROJECT_BRIEF.md) → health-check (zéro question).
 *  - interview GAP-DRIVEN : web pose design/échelle/données ; cli ne pose NI design NI données NI échelle.
 *  - /goal gaté par version CC (jamais un faux « supported »), preuve par transcript + borne « stop after ».
 *  - /goal reflète l'état réel : auditeurs manquants + % DoD apparaissent dans la condition.
 *  - /loop = polling reconvergent.
 *  - installation : skill global détecté = installed ; MCP absent = missing ; discipline = n/a ; compteurs cohérents.
 *  - détection via ASSISTANT_HOME pour un test déterministe ; zéro dépendance npm.
 */

import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

const ROOT = import.meta.dir.slice(0, import.meta.dir.lastIndexOf("/")); // repo root, portable
const SCRIPT = join(ROOT, "scripts", "lib", "onboarding.ts");
const TMP = "/tmp/assistant-onboarding-test";

type Question = { id: string; topic: string; kind?: string; ask: string; why: string; feeds: string };
type Plan = {
  mode: string;
  briefPresent: boolean;
  questions: Question[];
  clarify: { paraphrase: string; stopRule: string; gate: string } | null;
  discovery: { strategySelect: string; installToolkit: string; note: string } | null;
  goal: { command: string; supported: boolean; note: string };
  loop: { command: string; note: string };
  installation: Array<{ tool: string; kind: string; status: string }>;
  installSummary: { installed: number; missing: number; na: number };
  lines: string[];
  md: string[];
};

function assert(condition: unknown, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

function runJson(
  dir: string,
  opts: { branch: string; type?: string; cc?: string; completion?: number; auditorsMissing?: number; prescribe?: string; finished?: boolean; auth?: string; deploy?: string },
  fakeHome: string,
): Plan {
  const args = [SCRIPT, dir, `--branch=${opts.branch}`, "--json"];
  if (opts.type) args.push(`--type=${opts.type}`);
  if (opts.auth) args.push(`--auth=${opts.auth}`);
  if (opts.deploy) args.push(`--deploy=${opts.deploy}`);
  if (opts.cc) args.push(`--cc=${opts.cc}`);
  if (opts.completion != null) args.push(`--completion=${opts.completion}`);
  if (opts.auditorsMissing != null) args.push(`--auditors-missing=${opts.auditorsMissing}`);
  if (opts.prescribe) args.push(`--prescribe=${opts.prescribe}`);
  if (opts.finished) args.push("--finished");
  const p = Bun.spawnSync(["bun", ...args], { cwd: ROOT, env: { ...process.env, ASSISTANT_HOME: fakeHome, HOME: fakeHome } });
  assert(p.exitCode === 0, `exit 0 for ${dir} (${opts.branch}) — got ${p.exitCode}\n${p.stderr.toString()}`);
  const out = new TextDecoder().decode(p.stdout).trim();
  try {
    return JSON.parse(out) as Plan;
  } catch {
    console.error(out);
    assert(false, "valid JSON output");
    throw new Error("unreachable");
  }
}

const ids = (p: Plan) => p.questions.map((q) => q.id);

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

// HOME factice AVEC le skill global `qa` (pour tester installation: installed).
const home = join(TMP, "home");
mkdirSync(join(home, ".claude", "skills", "qa"), { recursive: true });

// Cibles : une vierge (pas de brief), une avec PROJECT_BRIEF.md.
const bare = join(TMP, "bare");
mkdirSync(bare, { recursive: true });
const withBrief = join(TMP, "with-brief");
mkdirSync(withBrief, { recursive: true });
writeFileSync(join(withBrief, "PROJECT_BRIEF.md"), "# Brief\nApp de test.\n");

// 0. Zéro dépendance npm : imports built-in (fs/os/path/node:*) ou relatifs locaux uniquement.
const src = readFileSync(SCRIPT, "utf-8");
const importLines = src.split("\n").filter((l) => /^\s*import\b/.test(l));
assert(importLines.length > 0, "onboarding.ts a des imports");
for (const l of importLines) {
  const ok = /from\s+"(node:)?(fs|os|path)"/.test(l) || /from\s+"\.\.?\//.test(l);
  assert(ok, `onboarding.ts zéro-dep — import non built-in/local « ${l.trim()} »`);
}

// 1. Dérivation du MODE.
assert(runJson(bare, { branch: "SEED", type: "web-fullstack" }, home).mode === "interview", "SEED → interview");
assert(runJson(bare, { branch: "BOOTSTRAP", type: "web-fullstack" }, home).mode === "interview", "BOOTSTRAP → interview");
const nextNoBrief = runJson(bare, { branch: "NEXT-GAP", type: "web-fullstack" }, home);
assert(nextNoBrief.mode === "interview", "NEXT-GAP sans brief → interview (jamais cadré)");
assert(nextNoBrief.briefPresent === false, "bare → briefPresent false");
const nextBrief = runJson(withBrief, { branch: "NEXT-GAP", type: "web-fullstack" }, home);
assert(nextBrief.mode === "health-check", "NEXT-GAP AVEC brief → health-check");
assert(nextBrief.briefPresent === true, "with-brief → briefPresent true");
assert(nextBrief.questions.length === 0, "health-check → zéro question");
assert(nextBrief.clarify === null, "health-check → pas de phase CLARIFY (déjà cadré)");

// 2. Interview GAP-DRIVEN : web pose tout ; cli ne pose ni design ni données ni échelle.
const web = runJson(bare, { branch: "BOOTSTRAP", type: "web-fullstack" }, home);
assert(["purpose", "definition-of-done", "out-of-scope", "fixed-decisions", "scale-deploy", "data-sensitivity", "design-bar", "constraints", "autonomy-bound"].every((id) => ids(web).includes(id)), "web pose les 9 sujets (dont out-of-scope + fixed-decisions)");
const cli = runJson(bare, { branch: "BOOTSTRAP", type: "cli-tool" }, home);
assert(["purpose", "definition-of-done", "out-of-scope", "fixed-decisions", "constraints", "autonomy-bound"].every((id) => ids(cli).includes(id)), "cli garde les sujets universels (dont out-of-scope + fixed-decisions)");
assert(!ids(cli).includes("design-bar"), "cli ne pose PAS le niveau de design");
assert(!ids(cli).includes("data-sensitivity"), "cli ne pose PAS données & conformité");
assert(!ids(cli).includes("scale-deploy"), "cli ne pose PAS échelle & déploiement");
const api = runJson(bare, { branch: "BOOTSTRAP", type: "api-backend" }, home);
assert(ids(api).includes("scale-deploy") && ids(api).includes("data-sensitivity"), "api pose échelle + données");
assert(!ids(api).includes("design-bar"), "api ne pose PAS le design");

// 2b. Les 2 cases les plus omises de l'état de l'art sont UNIVERSELLES (présentes sur tout type).
assert(ids(web).includes("out-of-scope") && ids(cli).includes("out-of-scope") && ids(api).includes("out-of-scope"), "out-of-scope universel (frontière négative)");
assert(ids(web).includes("fixed-decisions") && ids(cli).includes("fixed-decisions"), "fixed-decisions universel (décisions actées)");

// 2c. GAP-DRIVEN RÉEL : une détection (auth/déploiement) DÉGRADE la question en confirmation binaire.
const q = (p: Plan, id: string) => p.questions.find((x) => x.id === id);
const webBlind = runJson(bare, { branch: "BOOTSTRAP", type: "web-fullstack" }, home);
assert(q(webBlind, "data-sensitivity")?.kind !== "confirm", "sans détection : data-sensitivity reste une question ouverte");
assert(q(webBlind, "scale-deploy")?.kind !== "confirm", "sans détection : scale-deploy reste une question ouverte");
const webKnown = runJson(bare, { branch: "BOOTSTRAP", type: "web-fullstack", auth: "Better-auth", deploy: "Vercel" }, home);
assert(q(webKnown, "data-sensitivity")?.kind === "confirm", "auth détectée → data-sensitivity dégradée en confirmation (gap-driven réel)");
assert(q(webKnown, "scale-deploy")?.kind === "confirm", "déploiement détecté → scale-deploy dégradée en confirmation");
assert(/Better-auth/.test(q(webKnown, "data-sensitivity")!.ask), "la confirmation cite la valeur détectée (Better-auth)");

// 2d. Phase CLARIFY réifiée (paraphrase-confirm + règle d'arrêt + gate) en interview, null sinon.
assert(web.clarify !== null && !!web.clarify.paraphrase && !!web.clarify.stopRule && !!web.clarify.gate, "interview → clarify porte paraphrase + stopRule + gate");
assert(/PROJECT_BRIEF\.md/.test(web.clarify!.gate), "clarify.gate pointe vers PROJECT_BRIEF.md (artefact structuré)");

// 3. /goal gaté par version CC (jamais un faux « supported »).
assert(runJson(bare, { branch: "BOOTSTRAP", type: "web-fullstack", cc: "2.1.152" }, home).goal.supported === true, "CC 2.1.152 → /goal supported");
assert(runJson(bare, { branch: "BOOTSTRAP", type: "web-fullstack", cc: "2.1.76" }, home).goal.supported === false, "CC 2.1.76 → /goal non supported (loop only)");
assert(runJson(bare, { branch: "BOOTSTRAP", type: "web-fullstack" }, home).goal.supported === false, "CC inconnue → /goal non supported");

// 4. /goal reflète l'état réel : preuve transcript + borne + auditeurs manquants + % DoD.
const goalRich = runJson(bare, { branch: "BOOTSTRAP", type: "web-fullstack", cc: "2.1.152", completion: 50, auditorsMissing: 3 }, home).goal.command;
assert(/transcript/.test(goalRich), "/goal exige la preuve par transcript");
assert(/stop after \d+ turns/.test(goalRich), "/goal porte une borne « stop after N turns »");
assert(/3 rapport/.test(goalRich), "/goal compte les auditeurs manquants");
assert(/50%/.test(goalRich), "/goal mentionne le % DoD courant");
assert(!goalRich.includes("`"), "/goal sans backtick interne (rendu inline md sûr)");

// 5. /loop = polling reconvergent.
assert(runJson(bare, { branch: "BOOTSTRAP", type: "web-fullstack" }, home).loop.command === "/loop 30m /assistant", "/loop = /loop 30m /assistant");

// 6. Installation : skill global détecté = installed ; MCP absent = missing ; discipline = n/a.
const inst = runJson(bare, { branch: "NEXT-GAP", type: "web-fullstack", prescribe: "qa:skill|Playwright:MCP|superpowers:discipline" }, home);
const byTool = (t: string) => inst.installation.find((i) => i.tool === t);
assert(byTool("qa")?.status === "installed", "skill global qa → installed");
assert(byTool("Playwright")?.status === "missing", "MCP Playwright absent → missing");
assert(byTool("superpowers")?.status === "n/a", "discipline superpowers → n/a");
assert(inst.installSummary.installed === 1 && inst.installSummary.missing === 1 && inst.installSummary.na === 1, "compteurs installation cohérents");

// 7. Rendu non vide + md présent.
assert(web.lines.length > 0 && web.md.length > 0, "lignes terminal + md non vides");
assert(web.md.some((m) => /\/goal/.test(m)) && web.md.some((m) => /\/loop/.test(m)), "md contient /goal et /loop");

// 8. DIRTY-FIRST : ni interview ni health-check, aucune boucle prescrite (doctrine dogfood).
const dirty = runJson(bare, { branch: "DIRTY-FIRST", type: "web-fullstack", cc: "2.1.152" }, home);
assert(dirty.mode === "dirty", "DIRTY-FIRST → mode dirty (ni interview ni health-check)");
assert(dirty.questions.length === 0 && dirty.discovery === null && dirty.clarify === null, "dirty → zéro question, zéro découverte, zéro clarify");
assert(dirty.goal.command === "" && dirty.loop.command === "", "dirty → aucune boucle /goal·/loop prescrite");
assert(!dirty.lines.join("\n").includes("Repo Readiness"), "dirty → pas de /goal « Repo Readiness » poussé");

// 9. Découverte d'outils (exigence « va chercher TOUS les outils ») réifiée en mode interview.
assert(web.discovery !== null, "interview → discovery émis");
assert(/strategy-select\.ts/.test(web.discovery!.strategySelect) && /--type=web-fullstack/.test(web.discovery!.strategySelect), "discovery porte strategy-select pré-rempli (type)");
assert(/install-toolkit\.ts/.test(web.discovery!.installToolkit), "discovery porte install-toolkit pré-rempli");
assert(nextBrief.discovery === null, "health-check → pas de discovery (déjà cadré)");

// 10. MCP scope-projet (~/.claude.json → projects[abs].mcpServers) détecté + match borné (anti faux positif).
const homeMcp = join(TMP, "home-mcp");
mkdirSync(join(homeMcp, ".claude"), { recursive: true });
const mcpTarget = join(TMP, "mcp-target");
mkdirSync(mcpTarget, { recursive: true });
const mcpKey = realpathSync(mcpTarget); // clé canonicalisée comme le fait cc-config
writeFileSync(
  join(homeMcp, ".claude.json"),
  JSON.stringify({
    mcpServers: { "my-drizzle-studio": {} }, // serveur SANS rapport — ne doit PAS valider « drizzle »
    enabledPlugins: { stripe: true }, // objet (et non array) — prouve le fix dangling-else de pluginNames
    projects: { [mcpKey]: { mcpServers: { playwright: {} } } }, // scope LOCAL (défaut de `claude mcp add`)
  }),
);
const rMcp = runJson(mcpTarget, { branch: "NEXT-GAP", type: "web-fullstack", prescribe: "Playwright:MCP|drizzle DB:MCP|Stripe:plugin" }, homeMcp);
const st = (t: string) => rMcp.installation.find((i) => i.tool === t)?.status;
assert(st("Playwright") === "installed", "MCP scope-projet (projects[abs]) → installed (plus de faux missing)");
assert(st("drizzle DB") === "missing", "match borné : my-drizzle-studio ne valide PAS « drizzle » (anti substring sauvage)");
assert(st("Stripe") === "installed", "plugin déclaré en OBJET bien collecté (dangling-else corrigé)");

// 11. Hook matché par COMMANDE, pas par présence d'un hook quelconque.
const hookForeign = join(TMP, "hook-foreign");
mkdirSync(join(hookForeign, ".claude"), { recursive: true });
writeFileSync(
  join(hookForeign, ".claude", "settings.json"),
  JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo unrelated" }] }] } }),
);
assert(runJson(hookForeign, { branch: "NEXT-GAP", type: "web-fullstack", prescribe: "typecheck-before-commit:hook" }, home).installation[0]?.status === "missing", "hook étranger (echo) ne marque PAS typecheck-before-commit installé");
const hookReal = join(TMP, "hook-real");
mkdirSync(join(hookReal, ".claude"), { recursive: true });
writeFileSync(
  join(hookReal, ".claude", "settings.json"),
  JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "bun run typecheck" }] }] } }),
);
assert(runJson(hookReal, { branch: "NEXT-GAP", type: "web-fullstack", prescribe: "typecheck-before-commit:hook" }, home).installation[0]?.status === "installed", "hook dont la commande contient « typecheck » → installed");
// Borne le token : « test » ne doit PAS matcher « attestation » (substring sauvage évité).
const hookSubstr = join(TMP, "hook-substr");
mkdirSync(join(hookSubstr, ".claude"), { recursive: true });
writeFileSync(
  join(hookSubstr, ".claude", "settings.json"),
  JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo running attestation" }] }] } }),
);
assert(runJson(hookSubstr, { branch: "NEXT-GAP", type: "web-fullstack", prescribe: "test-before-commit:hook" }, home).installation[0]?.status === "missing", "« attestation » ne valide PAS test-before-commit (token borné au mot)");

rmSync(TMP, { recursive: true, force: true });
console.log("onboarding: ok");
