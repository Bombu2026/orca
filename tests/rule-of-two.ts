#!/usr/bin/env bun

/**
 * tests/rule-of-two.ts — couverture des fonctions PURES de scripts/lib/rule-of-two.ts.
 *
 * Garde anti-régression : la lethal trifecta (A+B+C) sans humain est REQUIRE-HUMAN ; ≤2 propriétés
 * ou un human-in-the-loop = ALLOW ; la détection deps→A/B/C reconnaît auth/LLM/paiement et traite
 * un bot-agent comme ingéreur+acteur par nature.
 */

import { detectTrifecta, ruleOfTwo } from "../scripts/lib/rule-of-two";

let passed = 0;
const failures: string[] = [];
function assert(cond: boolean, name: string): void {
  if (cond) passed++;
  else failures.push(name);
}

// 1. ruleOfTwo — la décision pure.
assert(ruleOfTwo({ A: true, B: true, C: true }).verdict === "REQUIRE-HUMAN", "A+B+C sans humain → REQUIRE-HUMAN");
assert(ruleOfTwo({ A: true, B: true, C: true }).count === 3, "A+B+C → count 3");
assert(ruleOfTwo({ A: true, B: true, C: true }, true).verdict === "ALLOW", "A+B+C avec human-in-the-loop → ALLOW (mitigation)");
assert(ruleOfTwo({ A: true, B: true, C: false }).verdict === "ALLOW", "≤2 propriétés → ALLOW");
assert(ruleOfTwo({ A: false, B: false, C: false }).verdict === "ALLOW", "0 propriété → ALLOW");
assert(/trifecta/i.test(ruleOfTwo({ A: true, B: true, C: true }).reason), "la raison nomme la trifecta");

// 2. detectTrifecta — deps + type → A/B/C.
const full = detectTrifecta(["better-auth", "@ai-sdk/anthropic", "stripe"], "bot-agent");
assert(full.A && full.B && full.C, "auth + LLM + paiement (+ bot-agent) → trifecta complète");
assert(ruleOfTwo(full).verdict === "REQUIRE-HUMAN", "trifecta détectée → REQUIRE-HUMAN");

const webNext = detectTrifecta(["next", "react"], "web-fullstack");
assert(!webNext.A && !webNext.B && !webNext.C, "web {next,react} → aucune branche (pas de trifecta)");

const agentOnly = detectTrifecta([], "bot-agent");
assert(!agentOnly.A && agentOnly.B && agentOnly.C, "bot-agent nu → ingère (B) + agit (C) mais pas A");
assert(ruleOfTwo(agentOnly).verdict === "ALLOW", "bot-agent sans données privées → ALLOW (≤2)");

const authOnly = detectTrifecta(["drizzle-orm"], "web-fullstack");
assert(authOnly.A && !authOnly.B && !authOnly.C, "drizzle seul → A uniquement");

const total = passed + failures.length;
console.log(`\nrule-of-two: ${passed}/${total} passed`);
if (failures.length) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log("rule-of-two: ok");
