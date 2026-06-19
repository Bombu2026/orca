#!/usr/bin/env bun

/**
 * organise.ts — le cold-start déterministe de /assistant.
 *
 * Tu tapes /assistant dans un projet → ~5s plus tard : un VERDICT CHIFFRÉ (/10),
 * les 3 gaps qui bloquent, UNE action à valider, et la prescription stack→outils.
 * Zéro « quel mode ? » : le mode est une DÉDUCTION, pas un choix.
 *
 * Réutilise detect-project.ts + audit-project.ts (aucune logique dupliquée).
 * Écrit QUALITY_SCORE.md dans le projet cible → boucle de feedback (dérive visible).
 *
 * Usage:
 *   bun scripts/organise.ts [path] [--json] [--no-write]
 */

import { existsSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { join, basename } from "path";
import { resolveTarget } from "./lib/scope";
import { autonomyCard } from "./lib/autonomy";
import { onboardingPlan } from "./lib/onboarding";

const SELF_DIR = import.meta.dir;

// ---------- args ----------
const rawArgs = process.argv.slice(2);
const flags = new Set(rawArgs.filter((a) => a.startsWith("--")));
// Garde dogfood (couche B) : resolveTarget refuse d'écrire QUALITY_SCORE.md dans l'arbre
// d'Assistant (un auditeur ne travaille pas sur son propre repo) — sauf --self explicite.
const target = resolveTarget(rawArgs.find((a) => !a.startsWith("--")), { allowSelf: flags.has("--self") });
const asJson = flags.has("--json");
const noWrite = flags.has("--no-write");
// Profil : production par défaut (les 14 couches « production reality » exigées).
// --mock = prototype assumé : couches prod exclues de la DoD, auditeurs non prescrits.
const mock = flags.has("--mock");

// ---------- helpers ----------
function run(cmd: string[], cwd?: string): { ok: boolean; out: string } {
  const p = Bun.spawnSync(cmd, cwd ? { cwd } : {});
  return { ok: p.exitCode === 0, out: new TextDecoder().decode(p.stdout).trim() };
}
function tryJson<T>(s: string): T | null {
  try { return JSON.parse(s) as T; } catch { return null; }
}
function has(rel: string): boolean { return existsSync(join(target, rel)); }
function dirHasFiles(rel: string): boolean {
  try { return readdirSync(join(target, rel)).length > 0; } catch { return false; }
}

// ---------- 1. détection (réutilise les scripts existants) ----------
type ProjectInfo = {
  type: string; framework: string | null; runtime: string; language: string;
  styling: string | null; database: string | null; auth: string | null;
  testing: string | null; deployment: string | null;
  hasClaudeConfig: boolean; hasCICD: boolean; detectedIntegrations: string[];
};
type AuditResult = {
  scores: Record<string, { score: number; weight: number; findings: string[] }>;
  overall: number;
  recommendations: Array<{ severity: "critical" | "high" | "medium" | "low"; dimension: string; message: string }>;
  metadata: { ccVersion: string | null; auditedAt: string; project: string };
};

const detect = tryJson<ProjectInfo>(run(["bun", join(SELF_DIR, "detect-project.ts"), target]).out);

const isGit = run(["git", "-C", target, "rev-parse", "--is-inside-work-tree"]).out === "true";
const uncommitted = isGit
  ? run(["git", "-C", target, "status", "--short"]).out.split("\n").filter(Boolean).length
  : 0;

// is the directory "empty" (no real project)?
const sourceMarkers = ["package.json", "pyproject.toml", "go.mod", "Cargo.toml", "requirements.txt"];
const hasSource = sourceMarkers.some(has) || dirHasFiles("src") || dirHasFiles("app");
const hasConfig = has(".claude/CLAUDE.md") || has("CLAUDE.md");

// run the full audit only when there is something to audit
const audit = hasSource || hasConfig
  ? tryJson<AuditResult>(run(["bun", join(SELF_DIR, "audit-project.ts"), target]).out)
  : null;

// ---------- 2. routage déterministe ----------
type Branch = "SEED" | "DIRTY-FIRST" | "BOOTSTRAP" | "NEXT-GAP";
let branch: Branch;
if (!hasSource && !hasConfig) branch = "SEED";
else if (uncommitted > 30) branch = "DIRTY-FIRST";
else if (!hasConfig) branch = "BOOTSTRAP";
else branch = "NEXT-GAP";

// ---------- 2b. lifecycle produit (DoD du type) — la moitié « produit » du verdict ----------
// /assistant ne pilote pas que le harness : il conduit le cycle de vie produit (auth, RBAC,
// RGPD, CI/CD, monitoring…). On réutilise le type déjà détecté (oracle unique, aucune
// re-détection divergente) et lifecycle-audit écrit LIFECYCLE.md dans la cible (sauf --no-write).
type LifecycleResult = {
  type: string; completion: number | null; isFinished: boolean;
  profile: "production" | "mock"; excludedByProfile: string[];
  nextStep: { id: string; label: string; phase: string; severity: string; pedago: string } | null;
  missingCapabilities: Array<{ id: string; label: string; severity: string }>;
};
const lifecycle = (branch === "NEXT-GAP" || branch === "BOOTSTRAP") && hasSource && detect
  ? tryJson<LifecycleResult>(
      run(["bun", join(SELF_DIR, "lifecycle-audit.ts"), target, `--type=${detect.type}`, "--json", ...(mock ? ["--mock"] : []), ...(noWrite ? ["--no-write"] : [])]).out,
    )
  : null;

// ---------- 3. Repo Readiness Score (sous-ensemble pondéré vers l'hygiène de contexte) ----------
// 5 dimensions max, pondérées vers ce qui fait shipper avec des agents. Audit complet = --deep.
const READINESS_DIMS: Array<[string, number, string]> = [
  ["claude-md", 2.0, "instructions agent (CLAUDE.md court, always-on)"],
  ["hooks", 2.0, "enforcement déterministe (lint/typecheck/secrets)"],
  ["buildability", 1.5, "commande de self-validation (CC peut se vérifier)"],
  ["mcp-hygiene", 1.5, "coût contexte des MCP (≤2)"],
  ["skills", 1.0, "skills installés (les bons, pas tous)"],
];
function readiness(): { score: number; lines: string[] } {
  if (!audit) return { score: 0, lines: [] };
  let ts = 0, tw = 0;
  const lines: string[] = [];
  for (const [dim, w, label] of READINESS_DIMS) {
    const s = audit.scores[dim];
    if (!s) continue;
    ts += s.score * w; tw += w;
    const mark = s.score >= 7 ? "OK" : s.score >= 4 ? "~ " : "X ";
    lines.push(`  [${mark}] ${s.score}/10  ${label}`);
  }
  return { score: tw ? Math.round((ts / tw) * 10) / 10 : 0, lines };
}
const ready = readiness();

// blocking gaps = recommandations critical/high (top 3)
const blockers = (audit?.recommendations || [])
  .filter((r) => r.severity === "critical" || r.severity === "high")
  .slice(0, 3);
const gap1 = blockers[0] || (audit?.recommendations || [])[0] || null;

// ---------- 4. prescription stack→trio (plafond 5-8 outils nommés, jamais un top-25) ----------
type Tool = { name: string; kind: "MCP" | "skill" | "discipline" | "hook" | "plugin"; why: string };
const PRESETS: Record<string, Tool[]> = {
  "web-fullstack": [
    { name: "Playwright", kind: "MCP", why: "tester l'UI réelle en headless avant de dire 'fonctionnel'" },
    { name: "Context7", kind: "MCP", why: "docs à jour des libs directement dans le contexte" },
    { name: "frontend-design", kind: "skill", why: "UI distinctive, anti AI-slop" },
    { name: "code-review", kind: "skill", why: "review du diff avant de lander" },
    { name: "qa", kind: "skill", why: "QA E2E systématique + fix" },
  ],
  "website-showcase": [
    { name: "Playwright", kind: "MCP", why: "design review headless + screenshots" },
    { name: "senior-designer", kind: "skill", why: "élève le site au niveau Awwwards (6 spécialistes //)" },
    { name: "frontend-design", kind: "skill", why: "tokens + motion calibrés" },
  ],
  "api-backend": [
    { name: "Context7", kind: "MCP", why: "docs framework à jour dans le contexte" },
    { name: "code-review", kind: "skill", why: "review du diff (SQL safety, trust boundaries)" },
    { name: "qa", kind: "skill", why: "tests API + fix" },
    { name: "investigate", kind: "skill", why: "root-cause debugging discipliné" },
  ],
  "bot-agent": [
    { name: "Context7", kind: "MCP", why: "docs SDK à jour" },
    { name: "claude-api", kind: "skill", why: "build/tune l'app Claude API + prompt caching" },
    { name: "code-review", kind: "skill", why: "review du diff" },
  ],
  "cli-tool": [
    { name: "code-review", kind: "skill", why: "review du diff" },
    { name: "qa", kind: "skill", why: "tests CLI + fix" },
  ],
  "design-only": [
    { name: "frontend-design", kind: "skill", why: "design production-grade" },
  ],
  unknown: [
    { name: "code-review", kind: "skill", why: "review du diff" },
  ],
};
// socle de discipline (toujours) + add-ons par intégration
function prescribe(): Tool[] {
  const base = PRESETS[detect?.type || "unknown"] ?? PRESETS.unknown ?? [];
  const tools: Tool[] = [...base];
  tools.push({ name: "superpowers", kind: "discipline", why: "socle : brainstorm→plan écrit→branche→TDD→double review" });

  const ints = detect?.detectedIntegrations || [];
  const db = detect?.database;
  if (db && ["drizzle", "prisma", "neon", "supabase"].includes(db))
    tools.push({ name: `${db} DB`, kind: "MCP", why: "requêter/migrer la base depuis le contexte" });
  if (ints.includes("stripe"))
    tools.push({ name: "Stripe", kind: "plugin", why: "tester paiements + webhooks en local" });
  if (ints.includes("ci-cd"))
    tools.push({ name: "ship", kind: "skill", why: "gate de livraison (tests→review→PR)" });

  // hook d'enforcement adapté
  const hook: Tool = detect?.testing
    ? { name: "test-before-commit", kind: "hook", why: "PreToolUse git commit → lance les tests" }
    : { name: "typecheck-before-commit", kind: "hook", why: "PreToolUse git commit → typecheck, refuse si rouge" };
  tools.push(hook);

  // plafond 8, dédupliqué par nom
  const seen = new Set<string>();
  return tools.filter((t) => (seen.has(t.name) ? false : (seen.add(t.name), true))).slice(0, 8);
}
const prescription = prescribe();

// ---------- 4b. Autonomy Card (run Opus en continu) — 6 leviers, jamais oublié un ----------
// Les 4 premiers leviers sont des réglages de SESSION (permissions, workflows, /loop, cloud) :
// détectés au mieux puis rappelés. Le 5e (self-verify E2E) et le 6e (Rule of Two — sécurité
// agentique) sont auditables côté PROJET et BLOQUANTS : self-verify absent (« trois preuves
// indirectes ≠ une preuve directe ») ou lethal trifecta sans humain (autonomie dangereuse).
const autonomy = autonomyCard({ target, projectType: detect?.type ?? null, ccVersion: audit?.metadata.ccVersion ?? null });

// ---------- 4c. Auditeurs production (preuve par rapport, pas par intention) ----------
// Les 4 pass d'audit applicatif (templates/agents/auditors/) sont prescrits dès que leur
// rapport manque dans la cible. SKILL.md ordonne de les lancer EN PARALLÈLE (agents Opus)
// immédiatement après le cold-start — chaque rapport écrit rend sa capacité lifecycle verte
// au passage suivant : c'est ce qui fait converger /loop /assistant. Skip en profil mock.
type Auditor = { agent: string; report: string; types: string[] };
const AUDITORS: Auditor[] = [
  { agent: "security-reviewer", report: "SECURITY_AUDIT.md", types: ["web-fullstack", "api-backend"] },
  { agent: "backend-auditor", report: "BACKEND_AUDIT.md", types: ["web-fullstack", "api-backend"] },
  { agent: "a11y-auditor", report: "A11Y_REPORT.md", types: ["web-fullstack", "website-showcase"] },
  { agent: "perf-auditor", report: "PERF_REPORT.md", types: ["web-fullstack", "website-showcase"] },
];
const auditorsToRun = !mock && (branch === "NEXT-GAP" || branch === "BOOTSTRAP") && detect
  ? AUDITORS.filter((a) => a.types.includes(detect.type) && !has(a.report) && !has(join("docs", a.report)))
  : [];

// SPAWN PLAN — réifie « à lancer » en directive EXÉCUTABLE par l'orchestrateur. Un script déterministe
// ne peut pas spawn un sous-agent LLM (honnêteté de capacité) ; il produit le plan exact que SKILL.md
// ordonne d'exécuter IMMÉDIATEMENT : agent + prompt concret + scope read/write DISJOINT (chaque auditeur
// lit en read-only et n'écrit QUE son rapport → écritures parallèles sans conflit, doctrine d'orchestration).
const AUDITOR_PURPOSE: Record<string, string> = {
  "security-reviewer": "OWASP, injections, secrets, authZ/RLS, RGPD, dep-scan",
  "backend-auditor": "idempotence, pagination, N+1, transactions, cohérence des données",
  "a11y-auditor": "WCAG AA : contraste, navigation clavier, lecteurs d'écran",
  "perf-auditor": "web-vitals/Lighthouse, budgets de perf, requêtes lentes",
};
const spawnPlan = auditorsToRun.map((a) => ({
  agent: a.agent,
  report: a.report,
  readScope: `${target} (read-only)`,
  writeScope: a.report, // disjoint : un rapport distinct par auditeur → écritures parallèles sans conflit
  prompt:
    `Audit read-only de ${target} — ${AUDITOR_PURPOSE[a.agent] ?? a.agent}. ` +
    `N'écris QUE dans ${a.report} (ne modifie aucun autre fichier). Verdict + findings priorisés + preuves.`,
}));

// ---------- 4d. Onboarding Card — interroger d'abord (nouveau projet), prescrire /goal·/loop ----------
// La déduction du MODE reste déterministe (le harness se déduit, jamais un choix). Mais le PRODUIT
// ne se devine pas : sur seed/bootstrap (ou un next-gap encore sans brief), /assistant doit
// INTERROGER avant d'agir. onboardingPlan réifie ça : mode, plan de questions gap-driven, /goal·/loop
// concrets et gatés CC, et l'état d'installation des outils prescrits (« tout est bien installé ? »).
const onboarding = onboardingPlan({
  target,
  branch,
  projectType: detect?.type ?? null,
  detect: detect
    ? { auth: detect.auth, database: detect.database, deployment: detect.deployment, detectedIntegrations: detect.detectedIntegrations }
    : null,
  lifecycle: lifecycle ? { completion: lifecycle.completion, isFinished: lifecycle.isFinished } : null,
  auditorsMissing: auditorsToRun.length,
  prescription,
  autonomy,
  readiness: ready.score,
});

// ---------- 5. verdict & sortie ----------
const BRANCH_VERDICT: Record<Branch, string> = {
  SEED: "Dossier vierge → je bootstrap la config agent (/init).",
  "DIRTY-FIRST": `STOP — ${uncommitted} fichiers non commités. Commit d'abord, sinon zéro rollback et l'audit ment.`,
  BOOTSTRAP: "Code sans config Claude → je bootstrap .claude/ (CLAUDE.md + hooks + skills).",
  "NEXT-GAP": `Repo prêt à ${ready.score}/10 pour shipper avec des agents.`,
};

// drift vs QUALITY_SCORE.md précédent
function priorScore(): number | null {
  try {
    const m = readFileSync(join(target, "QUALITY_SCORE.md"), "utf-8").match(/Score:\s*([\d.]+)\/10/);
    return m?.[1] ? parseFloat(m[1]) : null;
  } catch { return null; }
}
const prev = priorScore();
const drift = prev != null && ready.score ? (ready.score > prev ? `↑ +${(ready.score - prev).toFixed(1)}` : ready.score < prev ? `↓ ${(ready.score - prev).toFixed(1)}` : "→ stable") : null;

if (asJson) {
  console.log(JSON.stringify({ target, branch, detect, readiness: ready.score, blockers, lifecycle, onboarding, prescription, autonomy, auditors: auditorsToRun, spawnPlan, profile: mock ? "mock" : "production", uncommitted, drift }, null, 2));
} else {
  const L: string[] = [];
  L.push(`\n  ${BRANCH_VERDICT[branch]}${drift ? `   (${drift} depuis le dernier passage)` : ""}`);
  L.push(`  ${detect?.type ?? "?"}${detect?.framework ? ` · ${detect.framework}` : ""}${detect?.language ? ` · ${detect.language}` : ""}${isGit ? ` · git(${uncommitted} pending)` : " · no-git"}\n`);
  // Onboarding EN TÊTE : interroger d'abord (nouveau projet) ; check + /goal·/loop (re-run) ;
  // sur arbre sale, l'Onboarding Card est neutralisée (mode dirty) → on n'affiche QUE le STOP.
  if (branch === "DIRTY-FIRST") {
    L.push("  → Assainis l'arbre (commit/stash) d'abord. Rien d'autre tant que `git status` n'est pas propre.\n");
  } else {
    L.push(onboarding.mode === "interview" ? "  Onboarding — INTERROGER avant d'agir :" : "  Onboarding — check organisation + boucles :");
    L.push(...onboarding.lines, "");
    if (branch === "NEXT-GAP" && ready.lines.length) {
      L.push("  Readiness (hygiène de contexte) :");
      L.push(...ready.lines, "");
    }
    if (blockers.length) {
      L.push("  Gaps qui bloquent :");
      blockers.forEach((b, i) => L.push(`   ${i + 1}. [${b.severity}] ${b.message}`));
      L.push("");
    }
    if (gap1) L.push(`  → Action #1 : ${gap1.message}\n    Je la règle maintenant ? [Entrée=oui]\n`);
    if (lifecycle?.nextStep) {
      L.push(`  → Prochaine étape produit (DoD ${lifecycle.type}${lifecycle.completion != null ? `, ${lifecycle.completion}%` : ""}) : ${lifecycle.nextStep.label} [${lifecycle.nextStep.severity}]`);
      L.push(`    ${lifecycle.nextStep.pedago}\n`);
    } else if (lifecycle?.isFinished) {
      L.push(`  → DoD produit (${lifecycle.type}) : automatisée verte — valide les preuves directes (navigateur/curl) avant de dire « fini ».\n`);
    }
    if (mock && lifecycle?.excludedByProfile?.length) {
      L.push(`  Profil MOCK assumé — couches production exclues : ${lifecycle.excludedByProfile.join(", ")}.`);
      L.push("");
    }
    if (spawnPlan.length) {
      L.push("  Auditeurs à SPAWN MAINTENANT (en parallèle, Opus, context:fork — scopes d'écriture disjoints) :");
      spawnPlan.forEach((s) => L.push(`   • ${s.agent} → read-only + écrit UNIQUEMENT ${s.writeScope}`));
      L.push("");
    }
    L.push("  Prescription (stack → outils, plafonné) :");
    prescription.forEach((t) => L.push(`   • ${t.name} (${t.kind}) — ${t.why}`));
    L.push("");
    L.push("  Autonomie (faire tourner Opus en continu, 6 leviers) :");
    L.push(...autonomy.lines);
    if (autonomy.blockers) {
      const blk = autonomy.levers.filter((l) => l.blocking).map((l) => l.label).join(", ");
      L.push(`    ${autonomy.blockers} levier bloquant (${blk}) — autonomie non garantie tant que non réglé.`);
    }
    L.push("");
  }
  console.log(L.join("\n"));
}

// ---------- 6. QUALITY_SCORE.md (boucle de feedback dans le projet cible) ----------
if (!noWrite && (branch === "NEXT-GAP" || branch === "BOOTSTRAP") && audit) {
  const date = new Date().toISOString().slice(0, 10);
  const md = [
    `# QUALITY_SCORE — ${basename(target)}`,
    "",
    `> Auto-maintenu par \`/assistant\` (organise.ts). Relu au prochain passage pour montrer la dérive.`,
    "",
    `**Score: ${ready.score}/10** · ${date}${prev != null ? ` (précédent: ${prev}/10)` : ""}`,
    "",
    `## Onboarding (${onboarding.mode} · /goal · /loop · installation)`,
    onboarding.mode === "interview"
      ? "> Nouveau projet : INTERROGER d'abord (brief → questions ci-dessous), PUIS agir. /goal·/loop prescrits ensuite."
      : "> Re-run : check que l'organisation est complète + boucles autonomes à (re)lancer.",
    "",
    ...onboarding.md,
    "",
    "## Readiness (hygiène de contexte)",
    ...ready.lines.map((l) => l.replace(/^\s+/, "- ")),
    "",
    "## Gaps qui bloquent",
    ...(blockers.length ? blockers.map((b, i) => `${i + 1}. **[${b.severity}]** ${b.message}`) : ["_aucun gap bloquant_"]),
    "",
    ...(lifecycle
      ? [
          `## Prochaine étape produit (DoD ${lifecycle.type}${lifecycle.completion != null ? `, ${lifecycle.completion}%` : ""})`,
          lifecycle.nextStep
            ? `**${lifecycle.nextStep.label}** _[${lifecycle.nextStep.severity}]_ — ${lifecycle.nextStep.pedago}`
            : lifecycle.isFinished
              ? "_DoD automatisée verte — valide les preuves directes (navigateur/curl) avant « fini »._"
              : "_DoD produit indéterminée pour ce type._",
          ...(lifecycle.missingCapabilities.length
            ? ["", `_Reste ${lifecycle.missingCapabilities.length} capacité(s) : ${lifecycle.missingCapabilities.map((m) => m.label).join(", ")}. Détail : LIFECYCLE.md._`]
            : []),
          "",
        ]
      : []),
    ...(spawnPlan.length
      ? [
          "## Auditeurs à spawn maintenant (production reality)",
          "> Un rapport manquant = une couche non prouvée. SPAWN EN PARALLÈLE (Opus, `context: fork`), scopes d'écriture DISJOINTS — chaque auditeur lit en read-only et n'écrit QUE son rapport.",
          "",
          ...spawnPlan.map((s) => `- **${s.agent}** — read-only · écrit \`${s.writeScope}\` · prompt : ${s.prompt}`),
          "",
        ]
      : []),
    "## Prescription",
    ...prescription.map((t) => `- **${t.name}** (${t.kind}) — ${t.why}`),
    "",
    "## Autonomie (run Opus en continu)",
    "> 6 leviers pour faire tourner Opus des heures/jours. Réglages de session (1-4) + capacité projet (5 self-verify) + sécurité (6 Rule of Two).",
    "",
    ...autonomy.md,
    ...(autonomy.blockers ? ["", `_${autonomy.blockers} levier(s) bloquant(s) : ${autonomy.levers.filter((l) => l.blocking).map((l) => l.label).join(", ")} — autonomie non garantie tant que non réglé._`] : []),
    "",
    `_Audit complet : \`bun scripts/audit-project.ts "${target}"\` · CC ${audit.metadata.ccVersion ?? "?"}_`,
    "",
  ].join("\n");
  writeFileSync(join(target, "QUALITY_SCORE.md"), md);
  if (!asJson) console.log(`  (QUALITY_SCORE.md écrit dans ${basename(target)})\n`);
}
