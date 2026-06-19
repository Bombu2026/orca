#!/usr/bin/env bun

/**
 * self-check.ts
 * Verify that Assistant's documentation claims match the actual code/files.
 * Exits with code 1 if any claim is broken.
 */

import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const ROOT = import.meta.dir.slice(0, import.meta.dir.lastIndexOf("/")); // repo root, portable

type Check = { name: string; passed: boolean; detail: string };
const checks: Check[] = [];

function check(name: string, passed: boolean, detail = "") {
  checks.push({ name, passed, detail });
}

function readRoot(p: string) {
  try { return readFileSync(join(ROOT, p), "utf-8"); } catch { return null; }
}

function safeJson(s: string | null): unknown {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

function listTomlFiles(relativeDir: string): string[] {
  try {
    return readdirSync(join(ROOT, relativeDir))
      .filter(f => f.endsWith(".toml"))
      .sort();
  } catch {
    return [];
  }
}

function checkReviewMdGeneration(scriptName: string, content: string): void {
  const implemented = /REVIEW\.md|review-md/.test(content);
  if (!implemented) {
    check(`${scriptName}: REVIEW.md generation not implemented`, true, "conditional check skipped");
    return;
  }

  check(`${scriptName}: REVIEW.md generation writes REVIEW.md`, /REVIEW\.md/.test(content));
  check(`${scriptName}: REVIEW.md generation uses review-md template`, /review-md/.test(content));
}

const skill = readRoot("SKILL.md") || "";
const claude = readRoot(".claude/CLAUDE.md") || "";
const generateConfig = readRoot("scripts/generate-config.ts") || "";
const vitrineSeed = readRoot("scripts/vitrine-seed.ts") || "";

// 1. SKILL.md claims — scripts exist
const scriptsClaimed = ["audit-project.ts", "detect-project.ts", "generate-config.ts", "token-audit.ts", "scan-memories.ts"];
for (const s of scriptsClaimed) {
  check(`Script exists: ${s}`, existsSync(join(ROOT, "scripts", s)));
}

// 2. references claimed in CLAUDE.md
const refsClaimed = ["claude-code-internals.md", "best-practices.md", "claude-code-features-checklist.md", "hooks-catalog.md", "agents-patterns.md", "memory-systems.md"];
for (const r of refsClaimed) {
  check(`Reference exists: ${r}`, existsSync(join(ROOT, "references", r)));
}

// 2b. Memory tool templates present (Anthropic Memory Tool pattern)
const memTemplates = ["progress.md", "feature-checklist.md", "reflection.yaml", "README.md", "feedback_audit.md"];
for (const t of memTemplates) {
  check(`Memory template exists: templates/memory/${t}`, existsSync(join(ROOT, "templates", "memory", t)));
}

// 2c. Recall/index scripts present
const newScripts = ["recall.ts", "index-memories.ts", "status.ts", "self-check.ts", "save-audit-feedback.ts", "fetch-corpus.ts", "verify-impact.ts", "strategy-select.ts", "mcp-hygiene.ts", "plugin-hygiene.ts", "quality-gate.ts", "memory-corrections.ts", "validation-layer.ts", "assistant-proof.ts", "organise.ts", "lifecycle-audit.ts", "loop-controller.ts", "recall-auto.ts"];
for (const s of newScripts) {
  check(`Script exists: ${s}`, existsSync(join(ROOT, "scripts", s)));
}

// 2d. SKILL.md has AUDIT Phase 4 (Feedback Collection)
const skillContent = readRoot("SKILL.md") || "";
check(`SKILL.md AUDIT Phase 4 (Feedback) present`, /Phase 4 — Feedback Collection/.test(skillContent));

// 3. Templates claimed
const templateDirs = ["agents", "claude-md", "hooks", "commands"];
for (const d of templateDirs) {
  const items = (() => { try { return readdirSync(join(ROOT, "templates", d)); } catch { return []; }})();
  check(`Template dir: templates/${d}`, items.length > 0, `${items.length} items`);
}
const claudeMdTemplates = (() => { try { return readdirSync(join(ROOT, "templates", "claude-md")).filter(f => f.endsWith(".md")).sort(); } catch { return []; }})();
check(
  `CLAUDE.md templates enforce response rigor`,
  claudeMdTemplates.length > 0 && claudeMdTemplates.every(file => (readRoot(`templates/claude-md/${file}`) || "").includes("Accuracy over approval")),
  `${claudeMdTemplates.length} templates`,
);
check(`ship100 command exists`, existsSync(join(ROOT, "templates", "commands", "canonical-pack", "ship100.md")));
check(`ship-check command runs deterministic gate`, (readRoot("templates/commands/canonical-pack/ship-check.md") || "").includes("ship-check-gate.ts"));
check(`ship100 command runs deterministic gate`, (readRoot("templates/commands/canonical-pack/ship100.md") || "").includes("ship-check-gate.ts"));
check(`Showcase ship command runs deterministic gate`, (readRoot("templates/commands/showcase/ship-vitrine.md") || "").includes("ship-check-gate.ts"));
check(
  `ship-check-gate script exists`,
  ["ship-check-gate.ts", "ship-check-gate.js", "ship-check-gate.sh"].some(s => existsSync(join(ROOT, "scripts", s))),
  "expected scripts/ship-check-gate.{ts,js,sh}",
);
const hookJson = ["security.json", "security-strict.json", "quality.json", "dx.json", "showcase.json"]
  .map(file => readRoot(`templates/hooks/${file}`) || "")
  .join("\n");
check(`Hook JSON templates do not depend on jq/npx/bash -c`, !/\b(jq|npx|bash -c)\b/.test(hookJson));
check(`Hook JSON templates include MultiEdit`, /MultiEdit/.test(hookJson));
check(`Hook runtime scripts exist`, ["security.ts", "quality.ts", "dx.ts", "showcase.ts"].every(file => existsSync(join(ROOT, "templates", "hooks", "runtime", file))));
check(`Security hook runtime handles MultiEdit edits`, (readRoot("templates/hooks/runtime/security.ts") || "").includes("edits"));
const assistantSettingsText = readRoot(".claude/settings.json") || readRoot(".claude/settings.local.json") || "{}";
const assistantSettings = safeJson(assistantSettingsText);
const assistantHooks = assistantSettings && typeof assistantSettings === "object" && "hooks" in assistantSettings
  ? (assistantSettings as { hooks?: unknown }).hooks
  : {};
const assistantHooksStr = JSON.stringify(assistantHooks || {});
const expectedAssistantHookCommands = [
  "bun .claude/hooks/security.ts command standard",
  "bun .claude/hooks/security.ts lint-config",
  "bun .claude/hooks/security.ts secret standard",
  "bun .claude/hooks/quality.ts typecheck-file",
  "bun .claude/hooks/quality.ts console-log-check",
  "bun .claude/hooks/dx.ts skill-suggest",
  "bun .claude/hooks/dx.ts session-digest",
  "bun .claude/hooks/dx.ts notify-waiting",
  "bun .claude/hooks/dx.ts notify-compact",
  "bun .claude/hooks/dx.ts git-push-reminder",
];
check(`Assistant local hook runtimes installed`, ["security.ts", "quality.ts", "dx.ts", "showcase.ts"].every(file => existsSync(join(ROOT, ".claude", "hooks", file))));
check(`Assistant local settings use Bun hook runtime templates`, expectedAssistantHookCommands.every(command => assistantHooksStr.includes(command)));
check(`Assistant local hooks cover MultiEdit`, assistantHooksStr.includes("Write|Edit|MultiEdit") && assistantHooksStr.includes("Edit|Write|MultiEdit"));
check(`Assistant local hooks have no stale inline shell commands`, !/\b(bash -c|jq|npx)\b|session-digest\.sh/.test(assistantHooksStr));
check(`Assistant local hooks use Bun memory corrections`, assistantHooksStr.includes("memory-corrections.ts capture"));
check(`Assistant local hooks preserve Assistant session memory`, assistantHooksStr.includes("auto-memory.sh"));

// 5. audit-project.ts covers the documented audit dimensions.
const audit = readRoot("scripts/audit-project.ts") || "";
const dimensionsInCode = (audit.match(/scores\[["'][\w-]+["']\]\s*=/g) || []).length;
check(`audit-project.ts has >= 14 dimensions`, dimensionsInCode >= 14, `found ${dimensionsInCode}`);

// 6. SKILL.md doesn't claim stale "110 pages"
check(`SKILL.md not stating '110 pages'`, !skill.includes("110 pages"));

// 7. All agent templates have opus + effort max
const agentTemplates = ["planner.md", "executor.md", "reviewer.md"];
for (const a of agentTemplates) {
  const content = readRoot(`templates/agents/${a}`) || "";
  check(`Template ${a}: model opus/claude-opus`, /^model:\s*(opus|claude-opus)/m.test(content));
  check(`Template ${a}: effort max`, /^effort:\s*max\s*$/m.test(content));
  check(`Template ${a}: has when_to_use`, /^when_to_use:/m.test(content));
}

// 8. CLAUDE.md explicitly says model: opus
check(`CLAUDE.md: 'model: opus' rule present`, /model.*opus/i.test(claude));

check(`generate-config.ts writes modular .claude/rules`, /writeProjectRules/.test(generateConfig) && /RULES_BY_TYPE/.test(generateConfig));
// Workflow benchmark (living scoring of agentic workflows)
check(`workflow-bench script exists`, existsSync(join(ROOT, "scripts", "workflow-bench.ts")));
check(`workflow rubric + 3 playbooks exist`, existsSync(join(ROOT, "references", "workflow-playbooks", "RUBRIC.md")) && ["01-epct-verify", "02-spec-driven", "03-orchestrator-workers"].every(p => existsSync(join(ROOT, "references", "workflow-playbooks", `${p}.md`))));
check(`workflow benchmark jsonl present`, existsSync(join(ROOT, "references", "workflows-benchmark.jsonl")));
check(`package.json exposes workflow bench commands`, ["workflow:bench", "workflow:select"].every(s => (readRoot("package.json") || "").includes(s)));
check(`SKILL.md references the workflow benchmark`, /workflow:select|workflow-playbooks/.test(skill));
checkReviewMdGeneration("generate-config.ts", generateConfig);
checkReviewMdGeneration("vitrine-seed.ts", vitrineSeed);
check(`generate-config.ts copies ship-check gate`, /copyShipCheckGate/.test(generateConfig));
check(`vitrine-seed.ts copies ship-check gate`, /copyShipCheckGate/.test(vitrineSeed));
check(`generate-config.ts merges existing hooks`, /mergeExistingHooks/.test(generateConfig));
check(`generate-config.ts detects bypassPermissions from existing settings`, /shouldUseStrictSecurityHooks/.test(generateConfig));
check(`generate-config.ts removes old Assistant security hooks`, /removeAssistantSecurityHooks/.test(generateConfig));
check(`generate-config.ts writes canonical commands`, /canonical-pack/.test(generateConfig));
check(`generate-config.ts writes pre-prod QA agents`, /qa-hunter\.md/.test(generateConfig));
for (const memoryFile of ["user_role.md", "project_purpose.md", "project_stack.md", "feedback_conventions.md", "reference_claude_md.md", "MEMORY.md"]) {
  check(`generate-config.ts seeds ${memoryFile}`, generateConfig.includes(memoryFile));
}
check(`package.json exposes memory corrections`, (readRoot("package.json") || "").includes("memory:corrections"));
check(`package.json exposes validation layer`, ["validate:templates", "validate:ecosystem", "validate:all"].every(script => (readRoot("package.json") || "").includes(script)));
check(`memory-corrections writes JSONL queue`, (readRoot("scripts/memory-corrections.ts") || "").includes("corrections-queue.jsonl"));

// 10. Memory index DB integrity (Gap 4 — DB integrity test)
const dbPath = join(homedir(), ".claude", "assistant-index.db");
if (existsSync(dbPath)) {
  try {
    const { Database } = require("bun:sqlite");
    const db = new Database(dbPath, { readonly: true });
    const r = db.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
    const count = db.prepare("SELECT count(*) as c FROM memory_fts").get() as { c: number };
    db.close();
    check(`Memory index integrity OK`, r.integrity_check === "ok", r.integrity_check);
    check(`Memory index has content`, count.c > 0, `${count.c} rows`);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    check(`Memory index readable`, false, detail);
  }
} else {
  check(`Memory index exists`, false, "run: bun scripts/index-memories.ts");
}

// 12. Corpus fetched and manifest exists
const corpusPath = join(homedir(), ".claude", "corpus");
const corpusManifestPath = join(corpusPath, "manifest.json");
if (existsSync(corpusManifestPath)) {
  const corpus = JSON.parse(readFileSync(corpusManifestPath, "utf-8"));
  check(`Corpus has cookbooks`, !!corpus.sources?.cookbooks, corpus.sources?.cookbooks?.path);
  check(`Corpus has repos index`, !!corpus.sources?.repos, `${corpus.sources?.repos?.count || 0} repos`);
  check(`Corpus has cc-docs sitemap`, !!corpus.sources?.ccDocs, `${corpus.sources?.ccDocs?.sitemapCount || 0} urls`);
  check(`Corpus has papers`, !!corpus.sources?.papers, `${corpus.sources?.papers?.count || 0} papers`);
} else {
  check(`Corpus manifest exists`, false, "run: bun scripts/fetch-corpus.ts");
}

// 14. Shared memory / proof / status infra
// (The memory bridge + proof certificate are standalone, independent of any continuous-improvement subsystem.)
check(`assistant-proof produces proof certificate`, (readRoot("scripts/assistant-proof.ts") || "").includes("ORCA_PROOF.json") && (readRoot("scripts/assistant-proof.ts") || "").includes("gitRequired: false"));
check(`status exposes machine-readable SLA JSON`, (readRoot("scripts/status.ts") || "").includes("--json") && (readRoot("scripts/status.ts") || "").includes("recommendedCommands"));

// 15. Lifecycle Conductor — cycle de vie produit A→Z (DoD par type + auditeurs + câblage runtime)
const lifecycleSrc = readRoot("scripts/lifecycle-audit.ts") || "";
const organise = readRoot("scripts/organise.ts") || "";
const strategySelect = readRoot("scripts/strategy-select.ts") || "";
const pkgJson = readRoot("package.json") || "";
const lifecycleTypes = ["web-fullstack", "api-backend", "bot-agent", "cli-tool", "website-showcase", "design-only"];
check(`Lifecycle DoD per type exist (6 real types, no unknown.md)`, lifecycleTypes.every(t => existsSync(join(ROOT, "references", "lifecycle", `${t}.md`))), `${lifecycleTypes.length} types`);
check(`Lifecycle catalogue + excellence standards exist`, existsSync(join(ROOT, "references", "assistant-tech-lifecycle.md")) && existsSync(join(ROOT, "references", "assistant-excellence-standards.md")));
const auditorAgents = ["security-reviewer", "backend-auditor", "perf-auditor", "a11y-auditor"];
check(`Baseline auditors exist with model claude-opus-4-8`, auditorAgents.every(a => /^model:\s*claude-opus-4-8/m.test(readRoot(`templates/agents/auditors/${a}.md`) || "")), `${auditorAgents.length} auditors`);
check(`strategy-select lists baseline auditors in "Always generate"`, auditorAgents.every(a => strategySelect.includes(a)));
check(`generate-config wires auditors via AUDITORS_BY_TYPE`, /AUDITORS_BY_TYPE/.test(generateConfig) && /"agents",\s*"auditors"/.test(generateConfig));
check(`vitrine-seed generates baseline security-reviewer (showcase path)`, /agents\/auditors\/security-reviewer/.test(vitrineSeed));
check(`lifecycle-audit MATRIX scores a11y + perf (DoD vitrine non-négociable)`, /id:\s*"a11y"/.test(lifecycleSrc) && /id:\s*"perf"/.test(lifecycleSrc));
check(`SKILL.md has Lifecycle Conductor section referencing lifecycle-audit.ts`, /Lifecycle Conductor/.test(skill) && /lifecycle-audit\.ts/.test(skill));
check(`organise.ts wires lifecycle-audit (SKILL câblage NEXT-GAP tenu)`, /lifecycle-audit/.test(organise));
check(`package.json exposes lifecycle script + test`, /"lifecycle":/.test(pkgJson) && pkgJson.includes("tests/lifecycle-audit.ts"));
check(`tests/lifecycle-audit.ts exists`, existsSync(join(ROOT, "tests", "lifecycle-audit.ts")));
const memLifecycle = (readRoot(".claude/memory/MEMORY.md") || "") + (readRoot(".claude/memory/project_lifecycle_conductor.md") || "");
check(`Memory points to valid lifecycle catalogue path`, !/references\/lifecycle\/assistant-tech-lifecycle/.test(memLifecycle), "must be references/assistant-tech-lifecycle.md");

// 15g. Evals (loop-engineering) — DoD de première classe pour les produits LLM-backed.
// Un agent sans cas attendus ET interdits n'est pas « fini » : capacité bloquante + harnais installé.
const evalReadme = readRoot("templates/evals/README.md") || "";
const evalExample = readRoot("templates/evals/example.eval.ts") || "";
check(`lifecycle-audit.ts has the evals capability (blocker, conditioned by appliesWhen)`,
  /id:\s*"evals"/.test(lifecycleSrc) && /appliesWhen/.test(lifecycleSrc) && /isLlmBacked/.test(lifecycleSrc));
check(`templates/evals/ exists with expected AND forbidden cases (runnable example)`,
  existsSync(join(ROOT, "templates", "evals", "example.eval.ts")) &&
    /expected/.test(evalExample) && /forbidden/.test(evalExample) &&
    /Cas attendus/.test(evalReadme) && /Cas interdits/.test(evalReadme));
check(`generate-config injects ## Evals + copies evals/ for LLM-backed types`,
  /wantsEvals/.test(generateConfig) && /## Evals/.test(generateConfig) && /TEMPLATES_DIR,\s*"evals"/.test(generateConfig));

// 15h. Primitives context-engineering 2026 (loop-engineering) — le context window est LA contrainte.
const contextRuntime = readRoot("templates/hooks/runtime/context.ts") || "";
const contextJson = readRoot("templates/hooks/context.json") || "";
check(`templates/hooks/runtime/context.ts exists (context-economy primitives)`,
  existsSync(join(ROOT, "templates", "hooks", "runtime", "context.ts")));
check(`context.ts implements tool-output-trim (updatedToolOutput) + precompact-dump`,
  /tool-output-trim/.test(contextRuntime) && /updatedToolOutput/.test(contextRuntime) && /precompact-dump/.test(contextRuntime));
check(`templates/hooks/context.json wires PostToolUse Bash trim + PreCompact dump (no jq/bash -c)`,
  /PostToolUse/.test(contextJson) && /PreCompact/.test(contextJson) && /tool-output-trim/.test(contextJson) &&
    /precompact-dump/.test(contextJson) && !/\b(jq|npx|bash -c)\b/.test(contextJson));
check(`generate-config merges context.json + sets ENABLE_TOOL_SEARCH above the MCP threshold`,
  /hooks\/context\.json/.test(generateConfig) && /ENABLE_TOOL_SEARCH/.test(generateConfig) &&
    /mcpServerNames/.test(generateConfig) && /TOOL_SEARCH_MCP_THRESHOLD/.test(generateConfig));

// 15i. Constitution always-on (loop-engineering) — décisions figées + hors-scope d'interview dans le
// CLAUDE.md généré (injecté chaque tour), pas seulement dans le PROJECT_BRIEF (recall on-demand).
check(`generate-config injects an always-on ## Non-négociables constitution (interview fixed-decisions + out-of-scope)`,
  /buildNonNegotiables/.test(generateConfig) && /## Non-négociables/.test(generateConfig) &&
    /fixedDecisions/.test(generateConfig) && /outOfScope/.test(generateConfig));

// 15j. Spec-gate (loop-engineering) — verrou feature-list.json (SDD : passes seul mutable, tests
// immuables, 1 false→true/invocation, arbre merge-clean), copié + câblé en PreToolUse dans la cible.
const specGateSrc = readRoot("scripts/spec-gate.ts") || "";
const specGateJson = readRoot("templates/hooks/spec-gate.json") || "";
check(`scripts/spec-gate.ts exists (feature-list.json lock, pure evaluateSpecGate exported)`,
  existsSync(join(ROOT, "scripts", "spec-gate.ts")) && /export function evaluateSpecGate/.test(specGateSrc));
check(`spec-gate enforces the 4 invariants (passes-only mutable, tests immuables, 1 flip, merge-clean)`,
  /immuable/.test(specGateSrc) && /treeCleanExceptSelf/.test(specGateSrc) && /newlyPassing/.test(specGateSrc) &&
    /une seule autorisée par invocation/.test(specGateSrc));
check(`templates/hooks/spec-gate.json wires PreToolUse Write|Edit|MultiEdit (no jq/bash -c)`,
  /PreToolUse/.test(specGateJson) && /Write\|Edit\|MultiEdit/.test(specGateJson) &&
    /spec-gate\.ts/.test(specGateJson) && !/\b(jq|npx|bash -c)\b/.test(specGateJson));
check(`generate-config copies spec-gate + merges its hook`,
  /copySpecGate/.test(generateConfig) && /hooks\/spec-gate\.json/.test(generateConfig));
check(`package.json runs tests/spec-gate.ts in test chain`, pkgJson.includes("tests/spec-gate.ts"));
check(`tests/spec-gate.ts exists`, existsSync(join(ROOT, "tests", "spec-gate.ts")));

// 15k. Sandbox OS + cost-safety (loop-engineering) — défense en profondeur + garde anti-coût runaway.
const costSafetySrc = readRoot("templates/hooks/runtime/cost-safety.ts") || "";
const costSafetyJson = readRoot("templates/hooks/cost-safety.json") || "";
check(`generate-config writes sandbox.filesystem.deniedPaths covering secret dirs`,
  /SANDBOX_SECRET_DENY/.test(generateConfig) && /deniedPaths/.test(generateConfig) &&
    /~\/\.ssh/.test(generateConfig) && /~\/\.aws/.test(generateConfig) && /Keychains/.test(generateConfig));
check(`templates/hooks/runtime/cost-safety.ts implements bulk-api-guard + agent-spawn-guard`,
  existsSync(join(ROOT, "templates", "hooks", "runtime", "cost-safety.ts")) &&
    /bulk-api-guard/.test(costSafetySrc) && /agent-spawn-guard/.test(costSafetySrc) &&
    /API_LIMIT/.test(costSafetySrc) && /SPAWN_LIMIT/.test(costSafetySrc));
check(`cost-safety.json wires both guards on PreToolUse Bash (no jq/bash -c)`,
  /PreToolUse/.test(costSafetyJson) && /bulk-api-guard/.test(costSafetyJson) &&
    /agent-spawn-guard/.test(costSafetyJson) && !/\b(jq|npx|bash -c)\b/.test(costSafetyJson));
check(`generate-config merges cost-safety hooks (gated for LLM-backed projects)`,
  /hooks\/cost-safety\.json/.test(generateConfig) && /wantsEvals/.test(generateConfig));

// 15l. Validité temporelle de la mémoire (loop-engineering) — récence + superseded_by/valid_from.
const recallAutoTemporal = readRoot("scripts/recall-auto.ts") || "";
const scanMemSrc = readRoot("scripts/scan-memories.ts") || "";
const memSystemsDoc = readRoot("references/memory-systems.md") || "";
check(`recall-auto ranks by recency (memory_meta mtime) and shows age`,
  /memory_meta/.test(recallAutoTemporal) && /ageLabel/.test(recallAutoTemporal) && /mtime/.test(recallAutoTemporal));
check(`recall-auto excludes superseded_by + future valid_from facts`,
  /superseded_by/.test(recallAutoTemporal) && /valid_from/.test(recallAutoTemporal) && /temporalMarkers/.test(recallAutoTemporal));
check(`recall-auto scopes to the current project (cwd slug boost, not a hard filter)`,
  /export function cwdSlug/.test(recallAutoTemporal) && /isLocal/.test(recallAutoTemporal) && /a\.local !== b\.local/.test(recallAutoTemporal));
check(`scan-memories exports detectSupersededFacts (superseded_fact finding)`,
  /export function detectSupersededFacts/.test(scanMemSrc) && /superseded_fact/.test(scanMemSrc) &&
    /import\.meta\.main/.test(scanMemSrc));
check(`memory-systems doc documents valid_from/superseded_by temporal validity`,
  /Validité temporelle/.test(memSystemsDoc) && /superseded_by/.test(memSystemsDoc) && /valid_from/.test(memSystemsDoc));
check(`package.json runs tests/scan-memories.ts in test chain`, pkgJson.includes("tests/scan-memories.ts"));
check(`tests/scan-memories.ts exists`, existsSync(join(ROOT, "tests", "scan-memories.ts")));

// 15m. Orchestration enforced (loop-engineering) — audit SCORE le split read/write + context:fork ;
// organise émet un spawnPlan exécutable (scopes disjoints) que SKILL.md ordonne de spawn maintenant.
const auditSrc = readRoot("scripts/audit-project.ts") || "";
check(`audit-project scores agent read/write split + context:fork/summary`,
  /agentTools/.test(auditSrc) && /read-only/.test(auditSrc) && /context:fork\/summary|context:\s*\(fork\|summary\)/.test(auditSrc) && /WRITER_TOOLS/.test(auditSrc));
check(`organise emits an executable spawnPlan (agent + prompt + disjoint read/write scope)`,
  /spawnPlan/.test(organise) && /writeScope/.test(organise) && /readScope/.test(organise) && /read-only/.test(organise));
check(`review/audit agent templates declare context: fork (anti-anchoring)`,
  ["reviewer", "qa-hunter", "architect-auditor"].every((a) => /^context:\s*fork/m.test(readRoot(`templates/agents/${a}.md`) || "")) &&
  ["security-reviewer", "backend-auditor", "perf-auditor", "a11y-auditor"].every((a) => /^context:\s*fork/m.test(readRoot(`templates/agents/auditors/${a}.md`) || "")));
check(`SKILL.md documents orchestration enforced (spawnPlan + read/write split)`,
  /spawnPlan/.test(skill) && /Orchestration enforced/.test(skill));
check(`package.json runs tests/orchestration.ts in test chain`, pkgJson.includes("tests/orchestration.ts"));
check(`tests/orchestration.ts exists`, existsSync(join(ROOT, "tests", "orchestration.ts")));

// 15n. Boucle GUI (loop-engineering) — agent gui-verifier screenshot→act→re-screenshot, généré
// pour les types AVEC UI (web-fullstack via generate-config, website-showcase via vitrine-seed).
const guiVerifier = readRoot("templates/agents/gui-verifier.md") || "";
check(`templates/agents/gui-verifier.md exists (Opus, context:fork, screenshot→act loop)`,
  existsSync(join(ROOT, "templates", "agents", "gui-verifier.md")) &&
    /^model:\s*claude-opus-4-8/m.test(guiVerifier) && /^context:\s*fork/m.test(guiVerifier) &&
    /screenshot/i.test(guiVerifier) && /re-screenshot/i.test(guiVerifier) && /click|fill/i.test(guiVerifier));
check(`generate-config generates gui-verifier for UI types (GUI_VERIFIER_TYPES)`,
  /GUI_VERIFIER_TYPES/.test(generateConfig) && /gui-verifier\.md/.test(generateConfig));
check(`vitrine-seed generates gui-verifier for showcase`, /gui-verifier\.md/.test(vitrineSeed));

// 15b. Autonomy Card — les 6 leviers pour run Opus en continu, émis à chaque cold-start.
const autonomySrc = readRoot("scripts/lib/autonomy.ts") || "";
check(`scripts/lib/autonomy.ts exists`, existsSync(join(ROOT, "scripts", "lib", "autonomy.ts")));
check(`autonomy.ts covers the 6 lever ids (dont rule-of-two)`, ["permissions", "workflows", "loop-goal", "cloud", "self-verify", "rule-of-two"].every(id => autonomySrc.includes(`"${id}"`)));
// Rule of Two (loop-engineering P8) : module pur + branché sur l'Autonomy Card + testé.
check(`scripts/lib/rule-of-two.ts exists (garde-fou lethal trifecta)`, existsSync(join(ROOT, "scripts", "lib", "rule-of-two.ts")));
check(`autonomy.ts importe rule-of-two (trifecta → levier bloquant)`, /from "\.\/rule-of-two"/.test(autonomySrc) && /detectTrifecta/.test(autonomySrc));
check(`package.json runs tests/rule-of-two.ts in test chain`, pkgJson.includes("tests/rule-of-two.ts"));
check(`tests/rule-of-two.ts exists`, existsSync(join(ROOT, "tests", "rule-of-two.ts")));
// 15c. Loop controller (loop-engineering P2) : bornes dures + matérialisation .claude/loop.md.
const loopCtl = readRoot("scripts/loop-controller.ts") || "";
const loopTpl = readRoot("templates/loop.md") || "";
const genCfgSrc = readRoot("scripts/generate-config.ts") || "";
check(`scripts/loop-controller.ts exists (bornes dures de boucle)`, existsSync(join(ROOT, "scripts", "loop-controller.ts")));
check(`loop-controller couvre les 4 arrêts durs (DONE/MAX_TURNS/DEADLINE/NO_PROGRESS)`,
  ["DONE", "MAX_TURNS", "DEADLINE", "NO_PROGRESS"].every((r) => loopCtl.includes(r)));
check(`templates/loop.md invoque loop-controller en tête de tour (borne dure honorée)`,
  /loop-controller\.ts tick/.test(loopTpl) && /STOP/.test(loopTpl));
check(`loop-controller expose calibrate (max-turns auto-calibré depuis organise --json)`,
  /export function calibrateMaxTurns/.test(loopCtl) && /cmd === "calibrate"/.test(loopCtl) &&
    /missingCapabilities/.test(loopCtl) && /Math\.max\(5/.test(loopCtl));
check(`templates/loop.md calibre le plafond via organise --json | loop-controller calibrate`,
  /calibrate/.test(loopTpl) && /--max-turns/.test(loopTpl));
check(`generate-config matérialise .claude/loop.md dans la cible (pattern Ralph livré)`,
  /"loop\.md"/.test(genCfgSrc) && /loop\.md/.test(genCfgSrc));
check(`package.json runs tests/loop-controller.ts in test chain`, pkgJson.includes("tests/loop-controller.ts"));
check(`tests/loop-controller.ts exists`, existsSync(join(ROOT, "tests", "loop-controller.ts")));
// 15e. Recall just-in-time (loop-engineering P5) : la mémoire franchit la frontière vers le contexte.
const recallAutoSrc = readRoot("scripts/recall-auto.ts") || "";
const localSettingsStr = readRoot(".claude/settings.json") || readRoot(".claude/settings.local.json") || "";
check(`scripts/recall-auto.ts exists (recall just-in-time en hook)`, existsSync(join(ROOT, "scripts", "recall-auto.ts")));
check(`recall-auto émet additionalContext (UserPromptSubmit) et reste silencieux si rien`,
  /additionalContext/.test(recallAutoSrc) && /hookSpecificOutput/.test(recallAutoSrc));
check(`recall-auto câblé dans les settings d'Assistant (UserPromptSubmit)`, localSettingsStr.includes("recall-auto.ts"));
check(`templates/hooks/memory.json existe (recall installé dans les projets générés)`,
  existsSync(join(ROOT, "templates", "hooks", "memory.json")));
check(`generate-config merge le hook mémoire (recall installé chez la cible)`, /hooks\/memory\.json/.test(genCfgSrc));
check(`package.json runs tests/recall-auto.ts in test chain`, pkgJson.includes("tests/recall-auto.ts"));
check(`tests/recall-auto.ts exists`, existsSync(join(ROOT, "tests", "recall-auto.ts")));
// 15f. Intégrité du gate (loop-engineering P3) : test null-agent + corroboration anti-fabrication.
const shipGateSrc = readRoot("scripts/ship-check-gate.ts") || "";
check(`ship-check-gate corrobore les tests revendiqués (anti-fabrication null-agent)`,
  /hasTestInfra/.test(shipGateSrc) && /fabrication/.test(shipGateSrc));
check(`tests/null-agent.ts exists (un agent qui ne fait rien ne passe pas le gate)`,
  existsSync(join(ROOT, "tests", "null-agent.ts")));
check(`package.json runs tests/null-agent.ts in test chain`, pkgJson.includes("tests/null-agent.ts"));
check(`organise.ts wires autonomyCard (carte émise dans le verdict)`, /autonomyCard/.test(organise));
check(`SKILL.md documents the Autonomy Card referencing autonomy.ts`, /Autonomy Card/.test(skill) && /autonomy\.ts/.test(skill));
check(`package.json runs tests/autonomy.ts in test chain`, pkgJson.includes("tests/autonomy.ts"));
check(`tests/autonomy.ts exists`, existsSync(join(ROOT, "tests", "autonomy.ts")));

// 15c. Production Reality — couches infra dans la DoD (caching/CDN/scaling/deploy/sécu/backend),
// profil mock opt-out explicite jamais silencieux, auditeurs câblés au cold-start, /goal gated.
check(`lifecycle-audit.ts covers the 6 production-reality capability ids`,
  ["caching", "cdn-edge", "scaling", "deploy-target", "security-audit", "backend-completeness"].every(id => lifecycleSrc.includes(`"${id}"`)));
check(`lifecycle-audit.ts has prodOnly + --mock profile (opt-out, jamais silencieux)`,
  /prodOnly/.test(lifecycleSrc) && /--mock/.test(lifecycleSrc) && /excludedByProfile/.test(lifecycleSrc));
check(`lifecycle-audit.ts delegates CDN/scaling/compute to detected PaaS`, /paasOf/.test(lifecycleSrc));
check(`organise.ts prescribes the 4 auditors when their report is missing`,
  /auditorsToRun/.test(organise) && auditorAgents.every(a => organise.includes(a)));
check(`organise.ts propagates --mock to lifecycle-audit`, /--mock/.test(organise));
check(`autonomy.ts gates /goal by CC version (jamais un faux armed)`, autonomySrc.includes("2.1.139") && /cmpVersion/.test(autonomySrc));
check(`SKILL.md documents Production Reality default + mock opt-out`, /Production Reality/.test(skill) && /--mock/.test(skill));
check(`SKILL.md documents the /goal transcript-proof rule`, /transcript/.test(skill));
check(`templates/loop.md exists (tour de maintenance idempotent pour /loop)`, existsSync(join(ROOT, "templates", "loop.md")));
check(`references/assistant-autonomy-loops.md exists (détail déporté hors SKILL.md)`, existsSync(join(ROOT, "references", "assistant-autonomy-loops.md")));

// 15d. Onboarding Card — interroger d'abord (nouveau projet), /goal·/loop prescrits, check au re-run.
const onboardingSrc = readRoot("scripts/lib/onboarding.ts") || "";
check(`scripts/lib/onboarding.ts exists`, existsSync(join(ROOT, "scripts", "lib", "onboarding.ts")));
check(`onboarding.ts derives interview vs health-check mode`, /"interview"/.test(onboardingSrc) && /"health-check"/.test(onboardingSrc));
check(`onboarding.ts gates /goal by reusing the autonomy loop-goal lever`, /loop-goal/.test(onboardingSrc) && /supported/.test(onboardingSrc));
check(`organise.ts wires onboardingPlan (interview/check émis dans le verdict)`, /onboardingPlan/.test(organise));
check(`SKILL.md documents the Onboarding interview referencing onboarding.ts`, /Onboarding/.test(skill) && /onboarding\.ts/.test(skill));
check(`references/assistant-onboarding-interview.md exists`, existsSync(join(ROOT, "references", "assistant-onboarding-interview.md")));
check(`package.json runs tests/onboarding.ts in test chain`, pkgJson.includes("tests/onboarding.ts"));
check(`tests/onboarding.ts exists`, existsSync(join(ROOT, "tests", "onboarding.ts")));
check(`SKILL.md stays under the always-on line budget (<= 500)`, (skill.split(/\r?\n/).length) <= 500, `${skill.split(/\r?\n/).length} lines`);

// 15e. Round-2 hardening (findings de la review adversariale du 2026-06-16).
const ccConfigSrc = readRoot("scripts/lib/cc-config.ts") || "";
const onboardingRef = readRoot("references/assistant-onboarding-interview.md") || "";
const initWf = readRoot("references/assistant-init-workflow.md") || "";
check(`scripts/lib/cc-config.ts exists (lecture config partagée)`, existsSync(join(ROOT, "scripts", "lib", "cc-config.ts")));
check(`cc-config lit le scope-projet MCP (~/.claude.json → projects[abs]) — plus de faux missing`,
  /projects/.test(ccConfigSrc) && /mcpServerNames/.test(ccConfigSrc) && /realpath/.test(ccConfigSrc));
check(`cc-config matche les tokens de façon bornée (anti substring sauvage)`, /setIncludesToken/.test(ccConfigSrc) && /startsWith/.test(ccConfigSrc));
check(`autonomy.ts + onboarding.ts importent cc-config (zéro divergence de lecture)`,
  /from "\.\/cc-config"/.test(autonomySrc) && /from "\.\/cc-config"/.test(onboardingSrc));
check(`onboarding.ts neutralise DIRTY-FIRST (mode dirty, ni interview ni boucle)`, /DIRTY-FIRST/.test(onboardingSrc) && /"dirty"/.test(onboardingSrc));
check(`onboarding.ts réifie la découverte d'outils (strategy-select + install-toolkit)`,
  /strategy-select/.test(onboardingSrc) && /install-toolkit/.test(onboardingSrc) && /discovery/.test(onboardingSrc));
check(`onboarding.ts matche les hooks par commande, pas par présence globale`, /configuredHookCommands/.test(onboardingSrc) && /hookTokens/.test(onboardingSrc));
check(`onboarding doctrine ancre le croisement mémoire Obsidian comme étape LLM mcpvault`,
  /mcpvault/.test(onboardingRef) && /(contradiction|cohérence)/.test(onboardingRef) && /(étape LLM|non exécutée)/.test(onboardingRef));
check(`onboarding doctrine marque la persistance PROJECT_BRIEF.md comme étape LLM (pas automatique)`,
  /PROJECT_BRIEF\.md/.test(onboardingRef) && /(obligatoire|pas automatique)/.test(onboardingRef));
// 15d-bis. Phase CLARIFY (loop-engineering P1) : 2 cases omises, gap-driven réel, paraphrase/stop-rule, template 6 cases.
check(`onboarding.ts émet out-of-scope + fixed-decisions (les 2 cases les plus omises de l'état de l'art)`,
  /"out-of-scope"/.test(onboardingSrc) && /"fixed-decisions"/.test(onboardingSrc));
check(`onboarding.ts dégrade une détection en confirmation binaire (gap-driven réel, kind:"confirm")`,
  /kind:\s*"confirm"/.test(onboardingSrc) && /authKnown/.test(onboardingSrc) && /deployKnown/.test(onboardingSrc));
check(`onboarding.ts réifie la phase CLARIFY (paraphrase-confirm + règle d'arrêt + gate)`,
  /clarify/.test(onboardingSrc) && /paraphrase/.test(onboardingSrc) && /stopRule/.test(onboardingSrc));
check(`onboarding doctrine documente la phase CLARIFY + les 6 sujets universels`,
  /CLARIFY/.test(onboardingRef) && /6 sujets universels/.test(onboardingRef));
check(`templates/memory/PROJECT_BRIEF.template.md existe (artefact 6 cases, pas prose libre)`,
  existsSync(join(ROOT, "templates", "memory", "PROJECT_BRIEF.template.md")));
check(`init-workflow référence l'Onboarding Interview + n'utilise plus le type fantôme 'hybrid'`,
  /onboarding-interview/.test(initWf) && !/\bhybrid\b/.test(initWf));

// 16. Portabilité — aucun script/test ne doit hardcoder le chemin absolu du repo (sinon CI / autre poste cassent).
// On compare au ROOT dérivé à l'exécution : un fichier qui CONTIENT ce chemin l'a codé en dur.
const portabilityFiles = [
  ...readdirSync(join(ROOT, "scripts")).filter(f => f.endsWith(".ts") || f.endsWith(".sh")).map(f => `scripts/${f}`),
  ...(() => { try { return readdirSync(join(ROOT, "tests")).filter(f => f.endsWith(".ts")).map(f => `tests/${f}`); } catch { return []; } })(),
];
const hardcoders = portabilityFiles.filter(f => (readRoot(f) || "").includes(ROOT));
check(`No script/test hardcodes the absolute repo root (portable ROOT)`, hardcoders.length === 0, hardcoders.length ? hardcoders.join(", ") : `${portabilityFiles.length} files clean`);

// 17. Mission system — réification des missions + scope-fence (comprehension/isolation/non-contamination)
// Le sous-système est auto-contenu (scripts/missions/ + scripts/lib/scope.ts) et couplé au cœur
// uniquement par le hook (settings) et le garde resolveTarget (organise.ts). Ces assertions ITÈRENT
// le registre quand c'est possible : retirer une mission retire sa couverture (découplage par construction).
const missionFiles = ["scripts/lib/scope.ts", "scripts/missions/types.ts", "scripts/missions/registry.ts", "scripts/missions/scope-fence.ts"];
for (const f of missionFiles) check(`Mission infra exists: ${f}`, existsSync(join(ROOT, f)));
const missionManifests = (() => { try { return readdirSync(join(ROOT, "scripts", "missions")).filter(f => f.endsWith(".mission.ts")); } catch { return []; } })();
check(`At least one mission manifest (*.mission.ts)`, missionManifests.length >= 1, `${missionManifests.length} manifest(s)`);
check(`dev-organizer mission manifest exists`, existsSync(join(ROOT, "scripts", "missions", "dev-organizer.mission.ts")));
const missionsValidate = Bun.spawnSync(["bun", join(ROOT, "scripts", "missions", "registry.ts"), "validate"]);
check(`Mission registry validates all manifests (no open fence, restore present)`, missionsValidate.exitCode === 0, new TextDecoder().decode(missionsValidate.stderr || missionsValidate.stdout));
// scope-fence wired in settings on BOTH the LLM write tools and Bash (le volet Bash anti-contournement).
check(`scope-fence hook wired in local settings`, assistantHooksStr.includes("missions/scope-fence.ts"));
check(`scope-fence covers Write|Edit|MultiEdit and Bash`, assistantHooksStr.includes("Write|Edit|MultiEdit") && assistantHooksStr.includes("Bash"));
// Trou MCP-write fermé : matcher MCP câblé en settings ET le fence détecte les écrivains MCP (fail-closed).
const fenceSrc = readRoot("scripts/missions/scope-fence.ts") || "";
check(`scope-fence covers MCP write tools (trou MCP-write fermé)`,
  assistantHooksStr.includes("mcp__mcpvault__") && /MCP_WRITE_TOOLS/.test(fenceSrc));
// organise.ts enforce le dogfood via resolveTarget (refus d'écrire dans son propre arbre sauf --self).
check(`organise.ts uses resolveTarget dogfood guard`, /resolveTarget/.test(organise) && /allowSelf/.test(organise));
// package.json expose les commandes + le test comportemental dans la chaîne.
check(`package.json exposes mission + scope commands`, ["\"missions\":", "\"missions:validate\":", "\"scope\":"].every(s => pkgJson.includes(s)));
check(`package.json runs tests/missions.ts in test chain`, pkgJson.includes("tests/missions.ts"));
check(`tests/missions.ts exists`, existsSync(join(ROOT, "tests", "missions.ts")));
// CLAUDE.md documente la vision multi-mission (always-on, source de vérité du cap).
check(`CLAUDE.md documents the multi-mission architecture`, /multi-?mission|Missions? & isolation|scope-fence/i.test(claude));

// 17b. Denylist NOYAU — la serrure que même une mission self-maintenance (allowSelf) ne peut
// modifier. Prérequis non négociable de la gouvernance auto-merge (Phase 0 self-improvement).
const scopeSrc = readRoot("scripts/lib/scope.ts") || "";
const registrySrc = readRoot("scripts/missions/registry.ts") || "";
const benchSrc2 = readRoot("scripts/workflow-bench.ts") || "";
check(`scope.ts exporte CORE_DENYLIST (la serrure codée)`, /export const CORE_DENYLIST/.test(scopeSrc));
check(`scope.ts exporte coreDenylistSentinels()`, /export function coreDenylistSentinels/.test(scopeSrc));
check(
  `computeScope injecte CORE_DENYLIST AVANT le test allowSelf (jamais levée par allowSelf)`,
  /denied\.push\(\.\.\.CORE_DENYLIST\)/.test(scopeSrc) &&
    scopeSrc.indexOf("denied.push(...CORE_DENYLIST)") < scopeSrc.indexOf("if (!m.allowSelf)"),
);
check(
  `CORE_DENYLIST couvre code/hooks/skill/manifeste-npm/tests`,
  ["scripts/**", "settings*.json", "SKILL.md", "package.json", "tests/**"].every(z => scopeSrc.includes(z)),
);
check(
  `registry.validate refuse un allowedWrites atteignant la denylist noyau`,
  /coreDenylistSentinels/.test(registrySrc) && /matchAny/.test(registrySrc),
);
// Forge du leaderboard fermée : standings RECALCULE weighted() à la lecture, ne fait pas
// confiance au scorePondere stocké (une ligne JSONL forgée ne peut plus truquer le classement).
check(
  `workflow-bench standings() recalcule weighted() à la lecture (forge fermée)`,
  /num \+= weighted\(r\.scores, r\) \* w/.test(benchSrc2),
);

// =============================
// REPORT
// =============================
const passed = checks.filter(c => c.passed).length;
const failed = checks.filter(c => !c.passed);
console.log(`\n\x1b[1mself-check: ${passed}/${checks.length} passed\x1b[0m\n`);
if (failed.length === 0) {
  console.log("\x1b[32m✓ All documentation claims match code.\x1b[0m");
  process.exit(0);
} else {
  console.log("\x1b[31mFailures:\x1b[0m");
  for (const c of failed) {
    console.log(`  \x1b[31m✗\x1b[0m ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
  }
  process.exit(1);
}
