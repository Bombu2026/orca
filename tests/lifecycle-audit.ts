#!/usr/bin/env bun

/**
 * tests/lifecycle-audit.ts — couverture comportementale de scripts/lifecycle-audit.ts.
 * Garde anti-régression sur : détection de type (dont parité Python avec detect-project.ts),
 * DoD CONTEXTUELLE au type, completion null pour les types sans DoD, tri blocker-first,
 * --no-write vs écriture de LIFECYCLE.md, et zéro-dépendance (node:* uniquement).
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

const ROOT = import.meta.dir.slice(0, import.meta.dir.lastIndexOf("/")); // repo root, portable
const SCRIPT = join(ROOT, "scripts", "lifecycle-audit.ts");
const TMP = "/tmp/assistant-lifecycle-test";

type LC = {
  type: string;
  framework: string | null;
  language: string;
  profile: "production" | "mock";
  excludedByProfile: string[];
  completion: number | null;
  covered: number;
  total: number;
  isFinished: boolean;
  coveredCapabilities: string[];
  missingCapabilities: Array<{ id: string; label: string; severity: string }>;
  nextStep: { id: string; label: string; phase: string; severity: string; pedago: string } | null;
};

function assert(condition: unknown, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

function runJson(dir: string, extra: string[] = []): LC {
  const p = Bun.spawnSync(["bun", SCRIPT, dir, "--json", "--no-write", ...extra], { cwd: ROOT });
  assert(p.exitCode === 0, `exit 0 for ${dir} ${extra.join(" ")} — got ${p.exitCode}\n${p.stderr.toString()}`);
  const out = new TextDecoder().decode(p.stdout).trim();
  try {
    return JSON.parse(out) as LC;
  } catch {
    console.error(out);
    assert(false, "valid JSON output");
    throw new Error("unreachable");
  }
}

function applicableIds(r: LC): Set<string> {
  return new Set([...r.coveredCapabilities, ...r.missingCapabilities.map((m) => m.id)]);
}

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

// 0. Zéro-dépendance : seulement des imports node:* (convention dure du repo).
const src = readFileSync(SCRIPT, "utf-8");
const importLines = src.split("\n").filter((l) => /^\s*import\b/.test(l));
assert(importLines.length > 0, "lifecycle-audit has imports");
for (const l of importLines) {
  assert(/from\s+"node:(fs|path)"/.test(l), `lifecycle-audit zéro-dep — import non node: « ${l.trim()} »`);
}

// 1. web-fullstack : détection + DoD complète (a11y/perf/seo/e2e applicables).
const web = join(TMP, "web");
mkdirSync(web, { recursive: true });
writeFileSync(join(web, "package.json"), JSON.stringify({ dependencies: { next: "15", "drizzle-orm": "1", "better-auth": "1" } }));
writeFileSync(join(web, "tsconfig.json"), "{}");
const rWeb = runJson(web);
assert(rWeb.type === "web-fullstack", `web type → ${rWeb.type}`);
const webIds = applicableIds(rWeb);
for (const id of ["auth", "data-model", "tests", "ci", "a11y", "perf", "seo", "e2e", "secrets-hygiene", "env-config"]) {
  assert(webIds.has(id), `web-fullstack DoD inclut ${id}`);
}
assert(rWeb.coveredCapabilities.includes("data-model"), "web: drizzle → data-model couvert");
assert(rWeb.coveredCapabilities.includes("auth"), "web: better-auth → auth couvert");
assert(!rWeb.isFinished, "web (squelette) n'est pas fini");

// 2. api-backend : DoD contextuelle — PAS de a11y/seo/perf/e2e ; OUI auth/data-model/tests.
const rApi = runJson(web, ["--type=api-backend"]);
assert(rApi.type === "api-backend", `api type override → ${rApi.type}`);
const apiIds = applicableIds(rApi);
for (const id of ["a11y", "seo", "perf", "e2e", "rgpd", "onboarding"]) {
  assert(!apiIds.has(id), `api-backend EXCLUT ${id} (DoD contextuelle)`);
}
for (const id of ["auth", "data-model", "tests", "ci", "validation", "rate-limit", "error-handling"]) {
  assert(apiIds.has(id), `api-backend INCLUT ${id}`);
}

// 3. website-showcase : pas d'auth/payments/data-model/tests ; oui a11y/perf/seo/rgpd + secrets/env/ci/e2e.
const rShow = runJson(web, ["--type=website-showcase"]);
const showIds = applicableIds(rShow);
for (const id of ["auth", "payments", "data-model", "tests"]) {
  assert(!showIds.has(id), `website-showcase EXCLUT ${id}`);
}
for (const id of ["a11y", "perf", "seo", "rgpd", "secrets-hygiene", "env-config", "ci", "e2e"]) {
  assert(showIds.has(id), `website-showcase INCLUT ${id}`);
}

// 4. Python FastAPI → api-backend (garde anti-régression detectType vs detect-project.ts).
const py = join(TMP, "py");
mkdirSync(py, { recursive: true });
writeFileSync(join(py, "pyproject.toml"), "[project]\nname = 'x'\ndependencies = ['fastapi']\n");
const rPy = runJson(py);
assert(rPy.type === "api-backend", `Python fastapi → api-backend (got ${rPy.type})`);
assert(rPy.total > 0, "Python api-backend a une DoD applicable (jamais 0 / faux 100%)");

// 5. nextStep = blocker d'abord (tri par sévérité puis phase).
assert(rWeb.nextStep != null, "web a une prochaine étape");
assert(rWeb.nextStep?.severity === "blocker", `nextStep web = blocker (got ${rWeb.nextStep?.severity})`);

// 6. unknown : pas de DoD → completion null, total 0, jamais isFinished.
const unk = join(TMP, "unk");
mkdirSync(unk, { recursive: true });
writeFileSync(join(unk, "README.md"), "# rien");
const rUnk = runJson(unk);
assert(rUnk.type === "unknown", `vide → unknown (got ${rUnk.type})`);
assert(rUnk.total === 0 && rUnk.completion === null, "unknown: total 0 + completion null (jamais 100%)");
assert(rUnk.isFinished === false, "unknown jamais isFinished");

// 7. --no-write n'écrit pas LIFECYCLE.md ; le défaut l'écrit avec le type.
assert(!existsSync(join(web, "LIFECYCLE.md")), "--no-write n'écrit pas LIFECYCLE.md");
const w2 = join(TMP, "web-write");
mkdirSync(w2, { recursive: true });
writeFileSync(join(w2, "package.json"), JSON.stringify({ dependencies: { next: "15" } }));
writeFileSync(join(w2, "tsconfig.json"), "{}");
const pw = Bun.spawnSync(["bun", SCRIPT, w2, "--type=web-fullstack"], { cwd: ROOT });
assert(pw.exitCode === 0, "write run exit 0");
assert(existsSync(join(w2, "LIFECYCLE.md")), "défaut écrit LIFECYCLE.md");
assert(readFileSync(join(w2, "LIFECYCLE.md"), "utf-8").includes("web-fullstack"), "LIFECYCLE.md mentionne le type");


// 8. PRODUCTION REALITY (profil défaut) : les 6 couches prod sont dans la DoD web/api.
const PROD_IDS = ["caching", "cdn-edge", "scaling", "deploy-target", "security-audit", "backend-completeness"];
const rProd = runJson(web);
assert(rProd.profile === "production", `profil défaut = production (got ${rProd.profile})`);
const prodIds = applicableIds(rProd);
for (const id of PROD_IDS) {
  assert(prodIds.has(id), `profil production INCLUT ${id}`);
}

// 9. --mock : couches prod EXCLUES de la DoD, mais listées (jamais en silence).
const rMock = runJson(web, ["--mock"]);
assert(rMock.profile === "mock", "profil --mock = mock");
const mockIds = applicableIds(rMock);
for (const id of PROD_IDS) {
  assert(!mockIds.has(id), `profil mock EXCLUT ${id}`);
  assert(rMock.excludedByProfile.includes(id), `profil mock LISTE l'exclusion ${id}`);
}
assert(rMock.total < rProd.total, "mock a une DoD plus courte que production");

// 10. Délégation PaaS : vercel.json → cdn-edge/scaling/deploy-target couverts par la plateforme.
const paas = join(TMP, "paas");
mkdirSync(paas, { recursive: true });
writeFileSync(join(paas, "package.json"), JSON.stringify({ dependencies: { next: "15" } }));
writeFileSync(join(paas, "tsconfig.json"), "{}");
writeFileSync(join(paas, "vercel.json"), "{}");
const rPaas = runJson(paas);
for (const id of ["cdn-edge", "scaling", "deploy-target"]) {
  assert(rPaas.coveredCapabilities.includes(id), `PaaS (vercel.json) couvre ${id}`);
}

// 11. Preuve par rapport : SECURITY_AUDIT.md / BACKEND_AUDIT.md rendent leurs capacités vertes.
writeFileSync(join(paas, "SECURITY_AUDIT.md"), "# audit");
writeFileSync(join(paas, "BACKEND_AUDIT.md"), "# audit");
const rReports = runJson(paas);
assert(rReports.coveredCapabilities.includes("security-audit"), "SECURITY_AUDIT.md → security-audit couvert");
assert(rReports.coveredCapabilities.includes("backend-completeness"), "BACKEND_AUDIT.md → backend-completeness couvert");

// 12. EVALS (DoD LLM-backed) : bloquant pour bot-agent ; api-backend seulement si LLM-backed
// (jamais de faux gap sur une API CRUD) ; couvert dès qu'un dossier evals/ existe.
const botBare = join(TMP, "bot-bare");
mkdirSync(botBare, { recursive: true });
writeFileSync(join(botBare, "package.json"), JSON.stringify({ dependencies: { "@anthropic-ai/sdk": "1" } }));
const rBot = runJson(botBare, ["--type=bot-agent"]);
const botMissingEvals = rBot.missingCapabilities.find((m) => m.id === "evals");
assert(botMissingEvals != null, "bot-agent sans evals → evals manquante");
assert(botMissingEvals?.severity === "blocker", `evals bot-agent = blocker (got ${botMissingEvals?.severity})`);

// api-backend CRUD (pas de SDK IA) : evals NON applicable (ni covered, ni missing).
const apiCrud = join(TMP, "api-crud");
mkdirSync(apiCrud, { recursive: true });
writeFileSync(join(apiCrud, "package.json"), JSON.stringify({ dependencies: { express: "4", "drizzle-orm": "1" } }));
const rApiCrud = runJson(apiCrud, ["--type=api-backend"]);
assert(!applicableIds(rApiCrud).has("evals"), "api-backend CRUD (sans IA) N'A PAS de gap evals (pas de faux bloquant)");

// api-backend AVEC SDK IA : evals applicable + blocker.
const apiLlm = join(TMP, "api-llm");
mkdirSync(apiLlm, { recursive: true });
writeFileSync(join(apiLlm, "package.json"), JSON.stringify({ dependencies: { hono: "4", openai: "4" } }));
const rApiLlm = runJson(apiLlm, ["--type=api-backend"]);
assert(applicableIds(rApiLlm).has("evals"), "api-backend LLM-backed (openai) → evals applicable");
assert(rApiLlm.missingCapabilities.some((m) => m.id === "evals" && m.severity === "blocker"), "api-backend LLM → evals blocker");

// bot-agent avec dossier evals/ peuplé : capacité couverte.
const botEvals = join(TMP, "bot-evals");
mkdirSync(join(botEvals, "evals"), { recursive: true });
writeFileSync(join(botEvals, "package.json"), JSON.stringify({ dependencies: { "@anthropic-ai/sdk": "1" } }));
writeFileSync(join(botEvals, "evals", "x.eval.ts"), "export const cases = [];\n");
const rBotEvals = runJson(botEvals, ["--type=bot-agent"]);
assert(rBotEvals.coveredCapabilities.includes("evals"), "bot-agent avec evals/ → evals couverte");
assert(!rBotEvals.missingCapabilities.some((m) => m.id === "evals"), "bot-agent avec evals/ → evals plus dans missing");

// web-fullstack n'a JAMAIS de gap evals (la DoD evals ne s'applique qu'aux produits LLM-backed).
assert(!applicableIds(rWeb).has("evals"), "web-fullstack n'a pas de capacité evals");

rmSync(TMP, { recursive: true, force: true });
console.log("lifecycle-audit: ok");
