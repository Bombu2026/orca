#!/usr/bin/env bun

/**
 * tests/scan-memories.ts — détection des faits périmés (validité temporelle de la mémoire).
 * Test PUR de detectSupersededFacts : (1) superseded_by explicite, (2) même thème + dates
 * différentes → l'ancien flaggé contredit par le plus récent ; (3) dates égales → aucun flag.
 */

import { detectSupersededFacts } from "../scripts/scan-memories";

let passed = 0;
function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
  passed++;
}

type MF = Parameters<typeof detectSupersededFacts>[0][number];
const mk = (over: Partial<MF>): MF => ({
  path: "/tmp/x.md", project: "proj", name: "fact", type: "project",
  description: "", content: "contenu", date: "", mtime: 0, supersededBy: "",
  ...over,
});

// G6.d : même thème, dates différentes → l'ancien est signalé.
const out1 = detectSupersededFacts([
  mk({ name: "deploy-region", project: "project-x", date: "2026-01-10", content: "vercel cdg1" }),
  mk({ name: "deploy-region", project: "project-x", date: "2026-06-10", content: "fly.io cdg" }),
]);
const themeFinding = out1.find((f) => f.category === "superseded_fact" && f.name === "deploy region");
assert(themeFinding != null, "même thème + dates différentes → finding superseded_fact");
assert(themeFinding!.evidence.some((e) => /vercel cdg1/.test(e)), "l'évidence cite la version ANCIENNE (vercel cdg1)");
assert(!themeFinding!.evidence.some((e) => /fly\.io/.test(e)), "la version récente n'est pas marquée périmée");

// superseded_by explicite → flag direct.
const out2 = detectSupersededFacts([
  mk({ name: "old-auth", supersededBy: "auth-v2", content: "ancien choix d'auth" }),
]);
assert(out2.some((f) => f.category === "superseded_fact" && /superseded_by: auth-v2/.test(f.description)),
  "superseded_by explicite → finding");

// Dates égales → pas de contradiction temporelle.
const out3 = detectSupersededFacts([
  mk({ name: "same", date: "2026-03-01" }),
  mk({ name: "same", date: "2026-03-01" }),
]);
assert(!out3.some((f) => f.name === "same"), "thème à dates égales → aucun flag temporel");

// Fait isolé (un seul du thème, sans superseded_by) → pas de flag.
const out4 = detectSupersededFacts([mk({ name: "solo", date: "2026-01-01" })]);
assert(out4.length === 0, "fait isolé → aucun flag");

// Repli sur mtime quand date absente.
const out5 = detectSupersededFacts([
  mk({ name: "by-mtime", mtime: 1000, content: "vieux" }),
  mk({ name: "by-mtime", mtime: 9000, content: "neuf" }),
]);
assert(out5.some((f) => f.name === "by mtime" && f.evidence.some((e) => /vieux/.test(e))),
  "repli mtime : l'ancien (mtime bas) flaggé");

console.log(`scan-memories: ${passed}/${passed} passed`);
console.log("scan-memories: ok");
