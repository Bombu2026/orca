#!/usr/bin/env bun

/**
 * generate-config.ts
 * Generates .claude/ configuration from templates.
 * Usage: bun generate-config.ts <project-type> <output-dir> [options-json]
 *
 * Options JSON: { framework, runtime, packageManager, integrations[], workflow, bypassPermissions }
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import { join, dirname, resolve } from "path";
import { mcpServerNames } from "./lib/cc-config";

const ASSISTANT_DIR = dirname(dirname(import.meta.filename));
const TEMPLATES_DIR = join(ASSISTANT_DIR, "templates");

// Au-delà de ce seuil de serveurs MCP, on active le chargement différé des schémas de tools
// (ENABLE_TOOL_SEARCH) : sans ça, chaque MCP coûte 5-10 % de contexte rien qu'en schémas.
const TOOL_SEARCH_MCP_THRESHOLD = 2;

interface GenerateOptions {
  projectType: "web-fullstack" | "website-showcase" | "bot-agent" | "cli-tool" | "api-backend" | "design-only";
  outputDir: string;
  force?: boolean;
  tier?: "simple" | "medium" | "premium";
  framework?: string;
  runtime?: string;
  packageManager?: string;
  integrations?: string[];
  workflow?: "solo" | "team" | "full";
  projectName?: string;
  description?: string;
  database?: string;
  auth?: string;
  styling?: string;
  deployment?: string;
  bypassPermissions?: boolean;
  /** Décisions figées confirmées en interview (case 4 du PROJECT_BRIEF) → constitution always-on. */
  fixedDecisions?: string[];
  /** Hors-scope v1 confirmé en interview (case 3 du PROJECT_BRIEF) → constitution always-on. */
  outOfScope?: string[];
}

const PROJECT_TYPES: GenerateOptions["projectType"][] = [
  "web-fullstack",
  "website-showcase",
  "bot-agent",
  "cli-tool",
  "api-backend",
  "design-only",
];

interface SkillRule {
  skill: string;
  keywords: string[];
}

interface HookCommand {
  type: string;
  command?: string;
  prompt?: string;
  timeout?: number;
}

interface HookEntry {
  matcher: string;
  hooks: HookCommand[];
}

type HookMap = Record<string, HookEntry[]>;

interface ClaudeSettings {
  hooks?: HookMap;
  env?: Record<string, string>;
  sandbox?: {
    filesystem?: { allowedPaths?: string[]; deniedPaths?: string[] };
    network?: { allowedDomains?: string[]; deniedDomains?: string[] };
  };
  permissions?: {
    defaultMode?: string;
  };
  defaultMode?: string;
  permissionMode?: string;
  bypassPermissions?: boolean;
}

// Dossiers de secrets refusés à l'écriture/lecture quand le sandbox OS est actif (défense en
// profondeur, EN PLUS des hooks PreToolUse — le reference note un bypass du sandbox seul).
const SANDBOX_SECRET_DENY = ["~/.ssh", "~/.aws", "~/.config/gcloud", "~/.gnupg", "~/.kube", "~/Library/Keychains"];

function ensureDir(path: string): void {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function readTemplate(path: string): string {
  return readFileSync(join(TEMPLATES_DIR, path), "utf-8");
}

function isTextTemplate(path: string): boolean {
  return /\.(md|json|toml|txt|ts|js|sh|ya?ml)$/i.test(path);
}

function copyDirRecursive(src: string, dest: string, vars?: Record<string, string>, overwrite = false): number {
  if (!existsSync(src)) return 0;
  ensureDir(dest);

  let count = 0;
  for (const entry of readdirSync(src)) {
    const sourcePath = join(src, entry);
    const destinationPath = join(dest, entry);
    const stat = statSync(sourcePath);

    if (stat.isDirectory()) {
      count += copyDirRecursive(sourcePath, destinationPath, vars, overwrite);
    } else if (overwrite || !existsSync(destinationPath)) {
      if (vars && isTextTemplate(sourcePath)) {
        writeFileSync(destinationPath, fillPlaceholders(readFileSync(sourcePath, "utf-8"), vars));
      } else {
        copyFileSync(sourcePath, destinationPath);
      }
      count++;
    }
  }

  return count;
}

function fillPlaceholders(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

function writeTemplateIfMissing(templatePath: string, destinationPath: string, vars: Record<string, string>): boolean {
  const sourcePath = join(TEMPLATES_DIR, templatePath);
  if (!existsSync(sourcePath) || existsSync(destinationPath)) return false;
  ensureDir(dirname(destinationPath));
  writeFileSync(destinationPath, fillPlaceholders(readFileSync(sourcePath, "utf-8"), vars));
  return true;
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function backupExisting(path: string): void {
  if (existsSync(path)) copyFileSync(path, `${path}.bak-${timestamp()}`);
}

function writeGeneratedFile(path: string, content: string, force = false): "created" | "overwritten" | "skipped" {
  if (existsSync(path) && !force) return "skipped";
  ensureDir(dirname(path));
  const existed = existsSync(path);
  if (existed) backupExisting(path);
  writeFileSync(path, content);
  return existed ? "overwritten" : "created";
}

function readJsonObject(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function readClaudeSettings(path: string): ClaudeSettings {
  return readJsonObject(path) as ClaudeSettings;
}

function shouldUseStrictSecurityHooks(settings: ClaudeSettings, explicitBypass?: boolean): boolean {
  return (
    explicitBypass === true ||
    settings.bypassPermissions === true ||
    settings.permissionMode === "bypassPermissions" ||
    settings.defaultMode === "bypassPermissions" ||
    settings.permissions?.defaultMode === "bypassPermissions"
  );
}

function addHookEntry(hooksMap: HookMap, event: string, matcher: string, hooks: HookCommand[]): boolean {
  if (!hooksMap[event]) hooksMap[event] = [];
  const duplicate = hooksMap[event].some(
    existing => existing.matcher === matcher && JSON.stringify(existing.hooks) === JSON.stringify(hooks),
  );
  if (duplicate) return false;
  hooksMap[event].push({ matcher, hooks });
  return true;
}

function removeAssistantSecurityHooks(hooksMap: HookMap): void {
  for (const [event, entries] of Object.entries(hooksMap)) {
    const filteredEntries: HookEntry[] = [];
    for (const entry of entries) {
      const filteredHooks = entry.hooks.filter(hook => !hook.command?.startsWith("bun .claude/hooks/security.ts"));
      if (filteredHooks.length > 0) {
        filteredEntries.push({ ...entry, hooks: filteredHooks });
      }
    }
    if (filteredEntries.length > 0) hooksMap[event] = filteredEntries;
    else delete hooksMap[event];
  }
}

function mergeExistingHooks(hooksMap: HookMap, settings: ClaudeSettings): void {
  const existingHooks = settings.hooks;
  if (!existingHooks || typeof existingHooks !== "object" || Array.isArray(existingHooks)) return;

  for (const [event, entries] of Object.entries(existingHooks)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      if (!Array.isArray(entry.hooks)) continue;
      addHookEntry(hooksMap, event, entry.matcher ?? "", entry.hooks);
    }
  }
}

function listCommandNames(commandsDir: string): string[] {
  if (!existsSync(commandsDir)) return [];
  return readdirSync(commandsDir)
    .filter(entry => entry.endsWith(".md"))
    .map(entry => entry.slice(0, -3))
    .sort();
}

function listSkillNames(skillsDir: string): string[] {
  if (!existsSync(skillsDir)) return [];
  return readdirSync(skillsDir)
    .filter(entry => statSync(join(skillsDir, entry)).isDirectory())
    .filter(entry => existsSync(join(skillsDir, entry, "SKILL.md")))
    .sort();
}

const SKILL_RULE_KEYWORDS: Record<string, string[]> = {
  commit: ["commit", "git commit", "stage files", "staged files"],
  epct: ["epct", "plan", "explore", "break down", "think through"],
  explain: ["explain", "what does", "how does", "walk me through", "explique"],
  fix: ["fix", "bug", "error", "broken", "failing", "crash", "regression", "corrige"],
  pr: ["pull request", "open pr", "create pr", "merge request"],
  refactor: ["refactor", "cleanup", "simplify", "restructure", "rename"],
  review: ["review", "code review", "pr review", "check this", "audit"],
  "ship-check": ["ship check", "preflight", "release check", "ready to ship"],
  ship100: ["ship100", "ship 100", "ship", "deploy", "release"],
  test: ["test", "tests", "spec", "unit test", "coverage", "vitest", "playwright"],
};

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter(value => {
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function keywordsForTarget(name: string): string[] {
  const preset = SKILL_RULE_KEYWORDS[name];
  if (preset) return preset;
  return unique([name, name.replaceAll("-", " "), name.replaceAll("_", " ")]);
}

function writeSkillRules(claudeDir: string): number {
  const commands = listCommandNames(join(claudeDir, "commands"));
  const skills = listSkillNames(join(claudeDir, "skills"));
  const targets = unique([...commands, ...skills]).sort();
  const rules: SkillRule[] = targets.map(skill => ({ skill, keywords: keywordsForTarget(skill) }));
  writeFileSync(join(claudeDir, "skill-rules.json"), JSON.stringify({ rules }, null, 2));
  return rules.length;
}

// Modular per-topic rule files in `.claude/rules/*.md`, loaded alongside CLAUDE.md
// (per references/claude-code-internals.md). Keeps the root CLAUDE.md short (<200 lines)
// by splitting conventions into atomic topic files instead of one monolith.
const RULE_LIBRARY: Record<string, string> = {
  testing: "# Règles — testing\n\n- TDD sur la logique métier : RED → GREEN → REFACTOR.\n- Un test nomme un comportement, il ne dump pas des assertions.\n- Mock à la frontière système ; pas de réseau réel dans les tests unitaires.\n- Un test rouge bloque le commit (hook), on ne contourne pas avec `--no-verify`.\n",
  api: "# Règles — API / backend\n\n- Valider tout input à la frontière (schema/zod) ; ne jamais faire confiance au client.\n- Secrets via env uniquement, jamais en clair ni commités.\n- Erreurs : codes HTTP corrects, pas de stack trace exposée en prod.\n- Effets de bord (write/delete) derrière une vérif explicite, jamais en condition implicite.\n",
  db: "# Règles — base de données\n\n- Migrations versionnées ; aucun edit destructif sans backup.\n- Requêtes paramétrées uniquement (anti-injection).\n- Index sur les colonnes filtrées/jointes fréquemment.\n- Le schéma est la source de vérité ; pas de drift manuel en prod.\n",
  frontend: "# Règles — frontend\n\n- Composants serveur par défaut ; `'use client'` seulement si interactivité réelle.\n- Pas d'AI-slop : design distinctif, tokens cohérents, ≤ contraintes du design system.\n- Accessibilité : contraste WCAG AA, focus visible, labels sur les inputs.\n- « Fonctionnel » = vérifié dans le navigateur, pas un build vert.\n",
};
const RULES_BY_TYPE: Record<GenerateOptions["projectType"], string[]> = {
  "web-fullstack": ["testing", "api", "db", "frontend"],
  "api-backend": ["testing", "api", "db"],
  "website-showcase": ["frontend"],
  "bot-agent": ["testing", "api"],
  "cli-tool": ["testing"],
  "design-only": ["frontend"],
};
// Auditeurs baseline (templates/agents/auditors/) générés en plus des 7 agents de base,
// conditionnels au type — rend vraie la promesse strategy-select.ts « Always generate ».
// website-showcase = [] : ce type N'EST PAS traité ici (generate-config sort en erreur et
// redirige vers vitrine-seed.ts, qui génère lui-même les agents showcase + security-reviewer).
// design-only = [] : pas de code applicatif à auditer.
const AUDITORS_BY_TYPE: Record<GenerateOptions["projectType"], string[]> = {
  "web-fullstack": ["security-reviewer.md", "backend-auditor.md", "perf-auditor.md", "a11y-auditor.md"],
  "api-backend": ["security-reviewer.md", "backend-auditor.md", "perf-auditor.md"],
  "bot-agent": ["security-reviewer.md"],
  "cli-tool": ["security-reviewer.md"],
  "website-showcase": [],
  "design-only": [],
};
// Le gui-verifier (boucle screenshot→act→re-screenshot) ne concerne que les types AVEC une UI.
// website-showcase passe par vitrine-seed.ts, qui le génère de son côté.
const GUI_VERIFIER_TYPES = new Set<GenerateOptions["projectType"]>(["web-fullstack"]);
// Evals = DoD d'un produit LLM-backed (loop-engineering : un agent sans cas attendus ET interdits
// n'est pas « fini »). bot-agent = agent par définition ; api-backend seulement s'il embarque une IA
// (sinon une API CRUD recevrait un harnais inutile). Aligné sur lifecycle-audit.ts (capacité `evals`).
function wantsEvals(opts: GenerateOptions): boolean {
  if (opts.projectType === "bot-agent") return true;
  if (opts.projectType !== "api-backend") return false;
  const markers = (opts.integrations || []).map((i) => i.toLowerCase());
  return markers.some((i) => /\b(ai|ai-sdk|anthropic|openai|llm|langchain|claude|mistral|groq|gemini|cohere)\b/.test(i));
}

const EVALS_SECTION = `
## Evals
Ce produit est LLM-backed : une eval est sa definition of done, pas une option. Tout changement de
prompt, de modèle ou d'outil DOIT être rejoué contre \`evals/\` avant d'être déclaré fonctionnel.
- **Cas attendus** — ce que l'agent DOIT produire (le comportement promis).
- **Cas interdits** — ce qu'il ne doit JAMAIS produire : fuite de secret/prompt système, hallucination affirmée, jailbreak, action hors périmètre.
- Lancer : \`bun evals/*.eval.ts\`. Un cas interdit qui passe = bloquant, comme un test rouge.
- Une eval verte ≠ « fonctionnel » à elle seule : valider aussi par un échange réel.
`;

// Constitution always-on : les décisions figées + contraintes dures d'un projet doivent vivre dans
// le CLAUDE.md (chargé CHAQUE tour), pas seulement dans le PROJECT_BRIEF (mémoire, recall on-demand) —
// sinon l'agent peut « oublier » une non-négociable entre deux tours. Source : interview (case 3+4).
function buildNonNegotiables(opts: GenerateOptions): string {
  const lines: string[] = [];
  // Locks universels (toujours présents).
  lines.push("- **« Fonctionnel » = preuve directe** (navigateur/curl + état persisté vérifié), jamais un build vert seul.");
  lines.push("- Ne jamais réécrire ni supprimer un fichier appartenant à l'utilisateur sans demande explicite.");
  lines.push("- Pas de dépendance npm superflue ; types stricts, pas de `any`.");
  // Locks de stack dérivés des options (quand connus) : empêche les substitutions silencieuses.
  const stack: string[] = [];
  if (opts.runtime) stack.push(`runtime **${opts.runtime}**`);
  if (opts.framework && opts.framework !== "none") stack.push(`framework **${opts.framework}**`);
  if (opts.auth && opts.auth !== "none") stack.push(`auth **${opts.auth}**`);
  if (opts.database && opts.database !== "none") stack.push(`base **${opts.database}**`);
  if (opts.deployment) stack.push(`déploiement **${opts.deployment}**`);
  if (stack.length) lines.push(`- Stack arrêtée : ${stack.join(", ")} — ne pas substituer sans accord explicite.`);
  // Décisions figées + hors-scope issus de l'interview (cases 4 et 3 du PROJECT_BRIEF), si fournis.
  for (const d of opts.fixedDecisions || []) lines.push(`- Décision figée : ${d}`);
  for (const o of opts.outOfScope || []) lines.push(`- Hors-scope v1 : ${o}`);
  return lines.join("\n");
}

const NON_NEGOTIABLES_HEADER =
  "## Non-négociables\n_Constitution always-on (ce CLAUDE.md est injecté CHAQUE tour). Le détail vit dans `.claude/memory/PROJECT_BRIEF.md` (recall on-demand) ; ici, le rappel permanent qui ne doit jamais sortir du contexte._\n";

function writeProjectRules(claudeDir: string, projectType: GenerateOptions["projectType"]): number {
  const rulesDir = join(claudeDir, "rules");
  ensureDir(rulesDir);
  let written = 0;
  for (const topic of RULES_BY_TYPE[projectType] || ["testing"]) {
    const content = RULE_LIBRARY[topic];
    if (content === undefined) continue; // topic absent du RULE_LIBRARY : rien à écrire
    const dest = join(rulesDir, `${topic}.md`);
    if (existsSync(dest)) continue;
    writeFileSync(dest, content);
    written++;
  }
  return written;
}

function projectMemoryDir(outputDir: string): string | null {
  const home = process.env.HOME;
  if (!home) return null;
  const slug = resolve(outputDir).replace(/\//g, "-");
  return join(home, ".claude", "projects", slug, "memory");
}

function memoryMarkdown(
  name: string,
  description: string,
  type: "user" | "feedback" | "project" | "reference",
  tags: string[],
  date: string,
  body: string,
): string {
  const normalizedBody = body.trimStart();
  return `---
name: ${JSON.stringify(name)}
description: ${JSON.stringify(description)}
type: ${type}
tags: [${tags.join(", ")}]
date: ${date}
---

${normalizedBody.endsWith("\n") ? normalizedBody : `${normalizedBody}\n`}`;
}

function buildStandardMemoryFiles(opts: GenerateOptions, vars: Record<string, string>): Record<string, string> {
  const date = vars.DATE || new Date().toISOString().slice(0, 10);
  const projectName = vars.PROJECT_NAME || opts.projectName || "My Project";
  const projectType = opts.projectType;
  const runtime = opts.runtime || "node";
  const packageManager = opts.packageManager || "npm";
  const framework = opts.framework || "none";
  const progressTemplate = readTemplate("memory/progress.md");
  const featureChecklistTemplate = readTemplate("memory/feature-checklist.md");

  return {
    "user_role.md": memoryMarkdown(
      "User Role",
      "Default user working style and durable project collaboration rules",
      "user",
      ["role", "workflow", "assistant"],
      date,
      `User wants a proof-oriented Claude Code workspace with clear ownership, scoped agents, strict gates, and no unrequested framework churn.

Apply by default:
- Reply in French unless project files require English.
- Code identifiers and commit messages stay English.
- Prefer Bun when the project does not specify another runtime.
- Never overwrite user-owned files without explicit force/approval.
`,
    ),
    "project_purpose.md": memoryMarkdown(
      "Project Purpose",
      "Why this generated Assistant workspace exists",
      "project",
      ["purpose", projectType],
      date,
      `${projectName} has been bootstrapped with Assistant as its AI operating system.

Goal: drive Claude Code through \`.claude/CLAUDE.md\`, scoped agents, hooks, review rules, the autonomous loop (\`.claude/loop.md\`), and memory.
`,
    ),
    "project_stack.md": memoryMarkdown(
      "Project Stack",
      "Detected or configured technical baseline for generated workflows",
      "project",
      ["stack", runtime, packageManager],
      date,
      `Project type: ${projectType}
Framework: ${framework}
Runtime: ${runtime}
Package manager: ${packageManager}

Use project package scripts before inventing commands. If generated hooks run through Bun, Bun is a local Assistant tooling prerequisite even for non-Bun application code.
`,
    ),
    "feedback_conventions.md": memoryMarkdown(
      "Feedback Conventions",
      "User-locked collaboration conventions for AI-assisted development",
      "feedback",
      ["conventions", "quality", "ship"],
      date,
      `Durable conventions:
- Keep changes minimum viable and scoped.
- Prefer clear runbooks with owners, cut lines, and blockers.
- Run the narrowest useful checks after edits.
- For high-power work, use read-only mapping first, then disjoint write scopes, then independent review.
- A ship claim needs evidence, not self-certification.
`,
    ),
    "reference_claude_md.md": memoryMarkdown(
      "Reference Claude Config",
      "Pointers to generated Claude operating files",
      "reference",
      ["claude-md", "hooks", "loop"],
      date,
      `Canonical project instructions: \`.claude/CLAUDE.md\`
Scoped agents: \`.claude/agents/\`
Hooks: \`.claude/hooks/\`
Autonomous loop tour: \`.claude/loop.md\`
Review rules: \`REVIEW.md\`
Final ship gate: \`.claude/scripts/ship-check-gate.ts\`
`,
    ),
    "progress.md": memoryMarkdown(
      "Progress Log",
      "Current work state, completed work, next steps, open questions, and references",
      "project",
      ["progress", projectType],
      date,
      fillPlaceholders(progressTemplate, vars),
    ),
    "feature-checklist.md": memoryMarkdown(
      "Feature Checklist",
      "Frozen v1 scope, non-goals, acceptance criteria, and locked decisions",
      "project",
      ["scope", "checklist", projectType],
      date,
      fillPlaceholders(featureChecklistTemplate, vars),
    ),
    "MEMORY.md": `- [user_role](user_role.md) - user working style and durable collaboration rules
- [project_purpose](project_purpose.md) - why this Assistant workspace exists
- [project_stack](project_stack.md) - detected/configured runtime, framework, and package manager
- [feedback_conventions](feedback_conventions.md) - scoped work, proof gates, and high-power workflow rules
- [reference_claude_md](reference_claude_md.md) - pointers to .claude, loop tour, REVIEW.md, and ship gate
- [progress](progress.md) - current work state and next steps
- [feature-checklist](feature-checklist.md) - frozen v1 scope and acceptance criteria
`,
  };
}

function writeMemoryFiles(destinationDir: string, files: Record<string, string>): number {
  ensureDir(destinationDir);
  let count = 0;
  for (const [file, content] of Object.entries(files)) {
    const destinationPath = join(destinationDir, file);
    if (!existsSync(destinationPath)) {
      ensureDir(dirname(destinationPath));
      writeFileSync(destinationPath, content);
      count++;
    }
  }
  return count;
}

function seedMemoryProtocol(opts: GenerateOptions, vars: Record<string, string>): { locations: string[]; count: number } {
  const locations: string[] = [];
  let count = 0;
  const files = buildStandardMemoryFiles(opts, vars);

  const localDir = join(opts.outputDir, ".claude", "memory");
  count += writeMemoryFiles(localDir, files);
  locations.push(".claude/memory");

  const primaryDir = projectMemoryDir(opts.outputDir);
  if (primaryDir) {
    try {
      count += writeMemoryFiles(primaryDir, files);
      locations.push("~/.claude/projects/<slug>/memory");
    } catch {
      // Local memory remains available in the generated project when global Claude memory is unavailable.
    }
  }

  return { locations, count };
}

function copyHookRuntime(claudeDir: string, force = false): number {
  return copyDirRecursive(
    join(TEMPLATES_DIR, "hooks", "runtime"),
    join(claudeDir, "hooks"),
    undefined,
    force,
  );
}

function copyShipCheckGate(claudeDir: string): boolean {
  const sourcePath = join(ASSISTANT_DIR, "scripts", "ship-check-gate.ts");
  const destinationPath = join(claudeDir, "scripts", "ship-check-gate.ts");
  if (!existsSync(sourcePath) || existsSync(destinationPath)) return false;
  ensureDir(dirname(destinationPath));
  copyFileSync(sourcePath, destinationPath);
  return true;
}

// Copie le verrou feature-list.json (spec-driven development) dans la cible. Self-contained et inerte
// tant qu'aucun feature-list.json n'existe — câblé en PreToolUse via templates/hooks/spec-gate.json.
function copySpecGate(claudeDir: string): boolean {
  const sourcePath = join(ASSISTANT_DIR, "scripts", "spec-gate.ts");
  const destinationPath = join(claudeDir, "scripts", "spec-gate.ts");
  if (!existsSync(sourcePath) || existsSync(destinationPath)) return false;
  ensureDir(dirname(destinationPath));
  copyFileSync(sourcePath, destinationPath);
  return true;
}

function generate(opts: GenerateOptions): void {
  const claudeDir = join(opts.outputDir, ".claude");
  ensureDir(claudeDir);
  const hookRuntimeCount = copyHookRuntime(claudeDir, opts.force === true);
  if (hookRuntimeCount > 0) {
    console.log(`Created: .claude/hooks (${hookRuntimeCount} runtime files)`);
  }
  const pm = opts.packageManager || "npm";
  const rt = opts.runtime || "node";
  const fw = opts.framework || "none";
  const projectName = opts.projectName || "My Project";
  const buildCommand = pm === "bun" ? "bun run build" : `${pm} run build`;
  const testCommand = pm === "bun" ? "bun run test" : `${pm} test`;
  const devCommand = pm === "bun" ? "bun run dev" : `${pm} run dev`;
  const templateVars: Record<string, string> = {
    PROJECT_NAME: projectName,
    DESCRIPTION: opts.description || "A new project",
    BUILD_COMMAND: buildCommand,
    TEST_COMMAND: testCommand,
    DEFAULT_BRANCH: "main",
    DEV_COMMAND: devCommand,
    DEV_PORT: "3000",
    DATE: new Date().toISOString().slice(0, 10),
    SECURITY_PATTERNS: "Security vulnerabilities",
    PERFORMANCE_PATTERNS: "Performance regressions",
    ARCHITECTURE_VIOLATIONS: "Architecture violations",
    PROJECT_RULES: `- Follow ${projectName}'s .claude/CLAUDE.md\n- Verify ${testCommand} before accepting behavioral changes when feasible`,
    FIRST_SESSION_GOAL: "Generated baseline Claude Code workspace configuration",
    NEXT_STEP_1: "Review .claude/CLAUDE.md for project-specific rules",
    NEXT_STEP_2: `Run ${testCommand}`,
    FEATURE_1: "Baseline Claude Code assistant configuration",
    FEATURE_2: "Project-specific commands, agents, hooks, and memory protocol",
    NON_GOAL_1: "Production application implementation",
    NON_GOAL_2: "Unrequested framework or dependency changes",
    CRITERIA_1: "Generated assistant configuration exists and project checks can be run",
    LOCKED_DECISION_1: "Do not rewrite user-owned project code without explicit request",
  };

  // 1. Generate CLAUDE.md from template
  const templateFile = `claude-md/${opts.projectType}.md`;
  const templatePath = join(TEMPLATES_DIR, templateFile);

  if (!existsSync(templatePath)) {
    throw new Error(`Template not found for project type ${opts.projectType}: ${templateFile}`);
  }

  {
    const template = readFileSync(templatePath, "utf-8");
    const db = opts.database || "none";
    const auth = opts.auth || "none";
    const deploy = opts.deployment || "Vercel";
    const name = projectName;
    const nameSlug = name.toLowerCase().replace(/\s+/g, "-");

    const ormMap: Record<string, string> = {
      drizzle: "Drizzle ORM", prisma: "Prisma", mongoose: "Mongoose",
    };
    const orm = ormMap[db] || db;

    const vars: Record<string, string> = {
      // Shared (all templates)
      PROJECT_NAME: name,
      DESCRIPTION: opts.description || "A new project",
      FRAMEWORK: fw,
      RUNTIME: rt,
      PACKAGE_MANAGER: pm,
      STYLING: opts.styling || "Tailwind CSS",
      UI_LIBRARY: "shadcn/ui + @base-ui/react",
      DATABASE: db,
      AUTH: auth,
      DEPLOYMENT: deploy,
      DEV_PORT: "3000",
      DIRECTORY_STRUCTURE: "src/\n  app/\n  components/\n  lib/",
      ADDITIONAL_CONVENTIONS: "",

      // api-backend
      ORM: orm,
      ROUTES: "- `GET /api/health` — Health check\n- Define routes here",
      DB_CONNECTION: db === "none" ? "N/A" : `via ${orm} — see .env for connection string`,
      MIGRATION_STRATEGY: orm === "Drizzle ORM" ? "`drizzle-kit push` / `drizzle-kit generate`" : orm === "Prisma" ? "`prisma migrate dev`" : "manual",
      SCHEMA_LOCATION: orm === "Drizzle ORM" ? "src/db/schema.ts" : orm === "Prisma" ? "prisma/schema.prisma" : "src/db/",
      AUTH_STRATEGY: auth === "none" ? "Define auth strategy" : auth,
      MIDDLEWARE_STACK: fw === "express" ? "cors → helmet → auth → routes → errorHandler" : fw === "hono" ? "cors → auth → routes" : "Define middleware stack",
      CORS_CONFIG: "Restrict to known origins in production",
      API_SPEC_FORMAT: "OpenAPI 3.1",
      API_SPEC_LOCATION: "docs/openapi.yaml",
      API_SPEC_SOURCE: "Code-first, generate from route definitions",

      // bot-agent
      BOT_PLATFORM: fw === "telegraf" || fw === "grammy" ? "Telegram" : fw === "slack-bolt" ? "Slack" : fw === "discord.js" ? "Discord" : "Define platform",
      AI_PROVIDER: (opts.integrations || []).includes("ai-sdk") ? "Vercel AI SDK" : "Define provider",
      AI_MODEL: "claude-sonnet-4-6",
      AI_RUNTIME: "`claude -p` (CLI, Max plan) — no API key needed",
      MCP_SERVERS: "- Define MCP servers if applicable",
      WEBHOOK_ROUTES: "- `POST /api/webhook` — Bot webhook handler",
      SESSION_STORAGE: db === "none" ? "In-memory (dev) / Redis (prod)" : db,
      CONTEXT_STRATEGY: "Sliding window with summary compaction",
      RATE_LIMITING: "Per-user, 20 req/min",
      COMMAND_HANDLERS: "- Define command handlers here",

      // design-only
      DESIGN_SYSTEM: opts.styling || "Figma + Tailwind CSS",
      PROTOTYPING_TOOL: "Pencil / Figma",
      DOC_FORMAT: "Markdown",

      // website-showcase — deferred to scripts/vitrine-seed.ts for full showcase scaffold.
      // Generic fallback values if generate-config.ts is called directly with type=website-showcase:
      TIER: opts.tier || "simple",
      MOTION_STACK: opts.tier === "premium"
        ? "Motion + Lenis + GSAP 3.13+ + next-video/Mux + R3F/Spline (si 3D)"
        : opts.tier === "medium"
        ? "Motion + Lenis + next-video"
        : "Motion (motion/react) + tw-animate-css",
      MOTION_STACK_DETAIL: "Voir scripts/vitrine-seed.ts pour le détail par tier — ou relance /site pour un scaffold complet.",
      MOTION_DEPS: opts.tier === "premium"
        ? "motion, lenis, gsap, @gsap/react, next-video"
        : opts.tier === "medium"
        ? "motion, lenis, next-video"
        : "motion, tw-animate-css",
      VIDEO_SOLUTION: opts.tier === "simple" ? "N/A" : "next-video ou Mux",
      VIDEO_PIPELINE: opts.tier === "simple" ? "N/A — pas de vidéo" : "Hero bg < 3MB, WebM+MP4+poster, reduced-motion fallback",
      THREED_SOLUTION: opts.tier === "premium" ? "R3F+Drei ou Spline" : "N/A",
      LCP_BUDGET: opts.tier === "premium" ? "2.8" : opts.tier === "medium" ? "2.2" : "1.8",
      FONT_STACK: "Voir references/typography-2026.md — next/font/google ou next/font/local + Tailwind 4 @theme",
      PHOTO_SOURCES: "Unsplash+ / Dupe / Pexels / Picjumbo — voir references/photo-sources-non-ai.md",
      CMS: "none (ajouter Sanity/Payload/Contentful si requis)",
      ANALYTICS: "Vercel Analytics + Speed Insights",
      ANTI_AI_CLIENT: "false",

      // cli-tool
      BIN_NAME: nameSlug,
      ENTRY_POINT: "src/index.ts",
      COMMAND_STRUCTURE: `${nameSlug} <command> [options]`,
      ARGUMENTS_FLAGS: "- `--help, -h` — Show help\n- `--version, -v` — Show version\n- Define flags here",
      ARG_PARSER: "Built-in (process.argv) or commander/yargs",
      OUTPUT_FORMAT: "Text (human) / JSON (--json flag)",
      CONFIG_FILE: `~/.${nameSlug}rc.json`,
      BUILD_TARGET: rt === "bun" ? "bun build --compile" : "tsc → dist/",
      PACKAGE_FORMAT: "npm package",
      REGISTRY: "npmjs.com",
      TEST_FRAMEWORK: "vitest",
      COVERAGE_TARGET: "80%",
      ...templateVars,
    };

    const filled = fillPlaceholders(template, vars);
    // Pour un produit LLM-backed, ancrer la doctrine evals (cas attendus ET interdits) directement
    // dans le CLAUDE.md always-on, pas seulement dans le PROJECT_BRIEF.
    const withEvals = wantsEvals(opts) ? `${filled.trimEnd()}\n${EVALS_SECTION}` : filled;
    // Constitution always-on : les non-négociables (locks universels + stack + décisions d'interview)
    // injectés dans le CLAUDE.md (chargé chaque tour), pas seulement dans le PROJECT_BRIEF.
    const constitution = `${NON_NEGOTIABLES_HEADER}\n${buildNonNegotiables(opts)}\n`;
    const withConstitution = `${withEvals.trimEnd()}\n\n${constitution}`;
    const status = writeGeneratedFile(join(claudeDir, "CLAUDE.md"), withConstitution, opts.force === true);
    console.log(`${status === "skipped" ? "Skipped" : status === "overwritten" ? "Overwrote" : "Created"}: .claude/CLAUDE.md`);
  }

  // 2. Generate settings.local.json with hooks
  // CC hooks format: { hooks: { EventName: [{ matcher, hooks: [{ type, command }] }] } }
  const settingsPath = join(claudeDir, "settings.local.json");
  const existingSettings = readClaudeSettings(settingsPath);
  const hooksMap: HookMap = {};
  mergeExistingHooks(hooksMap, existingSettings);
  removeAssistantSecurityHooks(hooksMap);
  let hookCount = 0;

  function mergeHooksFromTemplate(templatePath: string): void {
    try {
      const entries = JSON.parse(readTemplate(templatePath)) as Array<{
        event: string; matcher?: string;
        hooks: HookCommand[];
      }>;
      for (const entry of entries) {
        if (addHookEntry(hooksMap, entry.event, entry.matcher || "", entry.hooks)) hookCount++;
      }
    } catch { /* skip */ }
  }

  // Always include security hooks. Tighten them when the generated project uses bypassPermissions.
  mergeHooksFromTemplate(shouldUseStrictSecurityHooks(existingSettings, opts.bypassPermissions) ? "hooks/security-strict.json" : "hooks/security.json");

  // Include quality hooks (recommended)
  mergeHooksFromTemplate("hooks/quality.json");

  // Include DX hooks, including skill-rules UserPromptSubmit routing.
  mergeHooksFromTemplate("hooks/dx.json");

  // Include the just-in-time memory recall hook (loop-engineering P5) : à chaque prompt, le recall
  // mine l'index FTS5 et réinjecte les snippets pertinents — la mémoire franchit enfin la frontière.
  mergeHooksFromTemplate("hooks/memory.json");

  // Include the context-economy primitives (loop-engineering 2026) : trim des sorties Bash > 200
  // lignes (updatedToolOutput) + dump d'état avant compaction. Le context window est LA contrainte.
  mergeHooksFromTemplate("hooks/context.json");

  // Include the spec-driven-development gate : verrouille feature-list.json (passes seul mutable,
  // tests immuables, 1 false→true/invocation, arbre merge-clean). Inerte tant qu'aucun feature-list.
  mergeHooksFromTemplate("hooks/spec-gate.json");

  // Cost-safety guards : seulement pour les projets LLM-backed (moteur claude -p), où une commande
  // Bash peut spawn des agents / marteler une API en boucle. Garde le Bash du runtime, pas le Task du dev.
  if (wantsEvals(opts)) {
    mergeHooksFromTemplate("hooks/cost-safety.json");
  }

  const settings: ClaudeSettings = { ...existingSettings, hooks: hooksMap };
  if (opts.bypassPermissions === true) {
    settings.permissions = { ...(settings.permissions || {}), defaultMode: "bypassPermissions" };
  }
  // OS sandbox : refuse l'accès aux dossiers de secrets quand le sandbox est actif (universel).
  // On UNION avec les deniedPaths existants — jamais d'écrasement d'une politique déjà en place.
  {
    const existingDenied = settings.sandbox?.filesystem?.deniedPaths ?? [];
    settings.sandbox = {
      ...(settings.sandbox || {}),
      filesystem: {
        ...(settings.sandbox?.filesystem || {}),
        deniedPaths: unique([...existingDenied, ...SANDBOX_SECRET_DENY]),
      },
    };
  }
  // ENABLE_TOOL_SEARCH : chargement différé des schémas de tools quand le projet a beaucoup de MCP
  // (chaque MCP coûte 5-10 % de contexte). Best-effort : lecture seule de la config, jamais ne lève.
  let mcpCount = 0;
  try {
    mcpCount = mcpServerNames(opts.outputDir).size;
  } catch { /* config illisible : on n'active pas, pas de faux positif */ }
  if (mcpCount > TOOL_SEARCH_MCP_THRESHOLD) {
    settings.env = { ...(settings.env || {}), ENABLE_TOOL_SEARCH: "1" };
    console.log(`Set: ENABLE_TOOL_SEARCH=1 (${mcpCount} serveurs MCP > seuil ${TOOL_SEARCH_MCP_THRESHOLD} — schémas de tools chargés à la demande)`);
  }
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  console.log(`Created: .claude/settings.local.json (${hookCount} hooks)`);

  // 3. Copy baseline agent templates. Commands like /ship-check depend on these.
  const agentsDir = join(claudeDir, "agents");
  ensureDir(agentsDir);

  for (const agent of [
    "planner.md",
    "executor.md",
    "reviewer.md",
    "qa-hunter.md",
    "slop-janitor.md",
    "architect-auditor.md",
    "e2e-scripter.md",
  ]) {
    const agentPath = join(TEMPLATES_DIR, "agents", agent);
    if (existsSync(agentPath)) {
      const status = writeGeneratedFile(
        join(agentsDir, agent),
        fillPlaceholders(readFileSync(agentPath, "utf-8"), templateVars),
        opts.force === true,
      );
      console.log(`${status === "skipped" ? "Skipped" : status === "overwritten" ? "Overwrote" : "Created"}: .claude/agents/${agent}`);
    }
  }

  // 3b. Copy baseline auditor subagents (security/backend/perf/a11y), conditional on type.
  // Couvre les angles morts de l'opérateur sur tout NEXT-GAP / ship100 (cf. assistant-excellence-standards).
  for (const auditor of AUDITORS_BY_TYPE[opts.projectType] || []) {
    const auditorPath = join(TEMPLATES_DIR, "agents", "auditors", auditor);
    if (existsSync(auditorPath)) {
      const status = writeGeneratedFile(
        join(agentsDir, auditor),
        fillPlaceholders(readFileSync(auditorPath, "utf-8"), templateVars),
        opts.force === true,
      );
      console.log(`${status === "skipped" ? "Skipped" : status === "overwritten" ? "Overwrote" : "Created"}: .claude/agents/${auditor}`);
    }
  }

  // 3c. GUI verifier (boucle screenshot→act→re-screenshot) pour les types avec UI.
  if (GUI_VERIFIER_TYPES.has(opts.projectType)) {
    const guiPath = join(TEMPLATES_DIR, "agents", "gui-verifier.md");
    if (existsSync(guiPath)) {
      const status = writeGeneratedFile(
        join(agentsDir, "gui-verifier.md"),
        fillPlaceholders(readFileSync(guiPath, "utf-8"), templateVars),
        opts.force === true,
      );
      console.log(`${status === "skipped" ? "Skipped" : status === "overwritten" ? "Overwrote" : "Created"}: .claude/agents/gui-verifier.md (boucle GUI screenshot→act)`);
    }
  }

  // 4. Copy canonical slash-command workflows.
  const commandsCount = copyDirRecursive(
    join(TEMPLATES_DIR, "commands", "canonical-pack"),
    join(claudeDir, "commands"),
    templateVars,
  );
  if (commandsCount > 0) {
    console.log(`Created: .claude/commands (${commandsCount} files)`);
  }

  if (copyShipCheckGate(claudeDir)) {
    console.log("Created: .claude/scripts/ship-check-gate.ts");
  }

  if (copySpecGate(claudeDir)) {
    console.log("Created: .claude/scripts/spec-gate.ts (verrou feature-list.json — SDD)");
  }

  // 4b. Matérialiser le tour de boucle idempotent (loop-engineering : pattern Ralph livré, plus
  // seulement prescrit en prose). `/loop` sans argument exécute alors ce tour, borné par loop-controller.
  if (writeTemplateIfMissing("loop.md", join(claudeDir, "loop.md"), templateVars)) {
    console.log("Created: .claude/loop.md (tour de boucle idempotent, borné par loop-controller)");
  } else {
    console.log("Skipped: .claude/loop.md already exists");
  }

  // 4c. Harnais d'evals pour les produits LLM-backed (DoD : cas attendus ET interdits).
  // Matérialise evals/ à la racine du projet (artefact de première classe, comme les tests).
  if (wantsEvals(opts)) {
    const evalsCount = copyDirRecursive(join(TEMPLATES_DIR, "evals"), join(opts.outputDir, "evals"), templateVars, opts.force === true);
    if (evalsCount > 0) {
      console.log(`Created: evals/ (${evalsCount} files — cas attendus ET interdits, DoD LLM-backed)`);
    } else {
      console.log("Skipped: evals/ already present");
    }
  }

  // 5. Generate review rules, skill invocation map, and Claude memory protocol.
  if (writeTemplateIfMissing("review-md/default.md", join(opts.outputDir, "REVIEW.md"), templateVars)) {
    console.log("Created: REVIEW.md");
  } else {
    console.log("Skipped: REVIEW.md already exists");
  }

  const skillRuleCount = writeSkillRules(claudeDir);
  console.log(`Created: .claude/skill-rules.json (${skillRuleCount} rules)`);

  const projectRuleCount = writeProjectRules(claudeDir, opts.projectType);
  console.log(`Created: .claude/rules/ (${projectRuleCount} modular topic files — keeps CLAUDE.md short)`);

  const memorySeed = seedMemoryProtocol(opts, templateVars);
  console.log(`Created memory protocol in ${memorySeed.locations.join(" + ")} (${memorySeed.count} files)`);

  console.log("\n.claude/ configuration generated successfully.");
}

function isProjectType(value: string): value is GenerateOptions["projectType"] {
  return PROJECT_TYPES.includes(value as GenerateOptions["projectType"]);
}

// Parse CLI args
const rawArgs = process.argv.slice(2);
const force = rawArgs.includes("--force");
const positional = rawArgs.filter(arg => arg !== "--force");
const projectTypeArg = positional[0];
const outputDir = positional[1] || process.cwd();
const optionsJson = positional[2];

if (!projectTypeArg) {
  console.error("Usage: bun generate-config.ts <project-type> [output-dir] [options-json]");
  console.error("Types: web-fullstack, website-showcase, bot-agent, cli-tool, api-backend, design-only");
  console.error("Note: for website-showcase full scaffold (brief + moodboard + 5 agents + 4 skills + 5 commands),");
  console.error("      prefer `bun scripts/vitrine-seed.ts <output-dir> <tier> [brief-path]` or use /site.");
  process.exit(1);
}

if (!isProjectType(projectTypeArg)) {
  console.error(`Invalid project type: ${projectTypeArg}`);
  console.error("Types: web-fullstack, website-showcase, bot-agent, cli-tool, api-backend, design-only");
  process.exit(1);
}

if (projectTypeArg === "website-showcase") {
  console.error("website-showcase requires the dedicated scaffold: bun scripts/vitrine-seed.ts <output-dir> <tier|brief-path>");
  process.exit(1);
}

let extraOptions: Partial<GenerateOptions> = {};
if (optionsJson) {
  try { extraOptions = JSON.parse(optionsJson); } catch { /* ignore */ }
}

generate({ projectType: projectTypeArg, outputDir, ...extraOptions, force: force || extraOptions.force === true });
