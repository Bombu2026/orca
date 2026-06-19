#!/usr/bin/env bun

/**
 * vitrine-seed.ts
 * Scaffold un projet vitrine : .claude/ complet (CLAUDE.md showcase, agents, skills,
 * commands, hooks merges security + quality + showcase) + REVIEW.md + docs/BRIEF.md
 * + docs/MOODBOARD.md + seed memory cross-session.
 *
 * Usage: bun vitrine-seed.ts <output-dir> <tier> [brief-path]
 *   tier = simple | medium | premium
 *   si tier omis : auto-detect depuis brief-path (necessite brief-path)
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "fs";
import { dirname, join, resolve } from "path";
import { detectComplexity } from "./detect-complexity.ts";

type Tier = "simple" | "medium" | "premium";

interface TierConfig {
  MOTION_STACK: string;
  MOTION_STACK_DETAIL: string;
  MOTION_DEPS: string;
  VIDEO_SOLUTION: string;
  VIDEO_PIPELINE: string;
  THREED_SOLUTION: string;
  LCP_BUDGET: string;
  FONT_STACK: string;
  PHOTO_SOURCES: string;
}

interface HookCommand {
  type: string;
  command?: string;
  prompt?: string;
}

interface HookEntry {
  matcher: string;
  hooks: HookCommand[];
}

type HookMap = Record<string, HookEntry[]>;

interface ClaudeSettings {
  hooks?: HookMap;
  permissions?: {
    defaultMode?: string;
  };
  defaultMode?: string;
  permissionMode?: string;
  bypassPermissions?: boolean;
}

interface HookMergeResult {
  events: number;
  strictSecurity: boolean;
}

interface CopyDirOptions {
  overwrite?: boolean;
}

const ASSISTANT_DIR = dirname(dirname(import.meta.filename));
const TEMPLATES_DIR = join(ASSISTANT_DIR, "templates");

const TIER_CONFIG: Record<Tier, TierConfig> = {
  simple: {
    MOTION_STACK: "Motion (motion/react) + tw-animate-css",
    MOTION_STACK_DETAIL:
      "Animations React legeres : whileInView pour reveals, AnimatePresence pour transitions. tw-animate-css pour keyframes CSS courantes (fade-in, slide-up). Pas de smooth scroll — scroll natif.",
    MOTION_DEPS: "motion, tw-animate-css",
    VIDEO_SOLUTION: "Assets statiques (poster images only, pas de video hero)",
    VIDEO_PIPELINE: "N/A — pas de video dans ce tier",
    THREED_SOLUTION: "N/A",
    LCP_BUDGET: "1.8",
    FONT_STACK:
      "2 families max — 1 display (Fraunces ou General Sans via next/font/google) + stack systeme en body",
    PHOTO_SOURCES:
      "Unsplash / Pexels curates, optimisation sharp -> WebP/AVIF + blur",
  },
  medium: {
    MOTION_STACK: "Motion + Lenis (smooth scroll) + next-video",
    MOTION_STACK_DETAIL:
      "Motion pour micro-interactions et reveals. Lenis pour smooth scroll fluide (integration Next.js via 'use client' wrapper en app/layout). next-video pour video hero optimisee (Mux ou self-hosted). Pas de GSAP complexe ni de 3D.",
    MOTION_DEPS: "motion, lenis, next-video",
    VIDEO_SOLUTION: "next-video (Mux ou self-hosted WebM+MP4)",
    VIDEO_PIPELINE:
      "1 video hero background (< 3MB, muted/loop/autoplay/playsinline) + poster WebP fallback pour reduced-motion",
    THREED_SOLUTION: "N/A",
    LCP_BUDGET: "2.2",
    FONT_STACK:
      "2-3 families : 1 display (PP Editorial New ou Fraunces) + 1 body (PP Neue Montreal ou General Sans). Variable font preferee pour hero.",
    PHOTO_SOURCES:
      "Unsplash+ / Dupe / Picjumbo curates, optimisation sharp multi-taille",
  },
  premium: {
    MOTION_STACK:
      "Motion + Lenis + GSAP 3.13+ (ScrollTrigger/SplitText/MorphSVG) + next-video ou Mux + R3F/Spline (si 3D)",
    MOTION_STACK_DETAIL:
      "Stack Awwwards-grade. GSAP pour scroll-driven scenes lourdes, timelines, pinned sections. SplitText pour kinetic typography. Lenis synchronise au ticker GSAP (autoRaf: false). R3F/Drei si scene 3D custom, Spline si integration rapide d'une scene designer. Videos multiples possibles (Mux recommande). Custom cursor possible.",
    MOTION_DEPS:
      "motion, lenis, gsap, @gsap/react, next-video, @react-three/fiber (si 3D), @react-three/drei (si 3D)",
    VIDEO_SOLUTION: "Mux (HLS adaptatif) ou next-video",
    VIDEO_PIPELINE:
      "Videos multiples optimisees (hero bg + sections). Mux pour adaptive bitrate. Posters WebP pour reduced-motion. Preload metadata only.",
    THREED_SOLUTION: "R3F + Drei (custom scenes) ou Spline (designer-authored)",
    LCP_BUDGET: "2.8",
    FONT_STACK:
      "3 families : display kinetic (Migra, Editorial New), body (PP Neue Montreal, Satoshi), mono optionnel. Variable fonts + font-variation-settings pour effets subtils.",
    PHOTO_SOURCES:
      "Stocksy / Unsplash+ / Death to Stock premium. Curation editoriale stricte, potentiellement shooting custom.",
  },
};

function ensureDir(path: string): void {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function isTextTemplate(path: string): boolean {
  return /\.(md|json|toml|txt|ts|js|sh|ya?ml)$/i.test(path);
}

function copyDirRecursive(
  src: string,
  dest: string,
  vars?: Record<string, string>,
  options: CopyDirOptions = {},
): number {
  if (!existsSync(src)) return 0;
  ensureDir(dest);
  const overwrite = options.overwrite ?? true;
  let count = 0;
  const entries = readdirSync(src);
  for (const entry of entries) {
    const s = join(src, entry);
    const d = join(dest, entry);
    const st = statSync(s);
    if (st.isDirectory()) {
      count += copyDirRecursive(s, d, vars, options);
    } else {
      if (!overwrite && existsSync(d)) continue;
      if (vars && isTextTemplate(s)) {
        writeFileSync(d, fillPlaceholders(readFileSync(s, "utf-8"), vars));
      } else {
        copyFileSync(s, d);
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

interface SeedOptions {
  outputDir: string;
  tier: Tier;
  force?: boolean;
  briefPath?: string | null;
  clientName?: string;
  projectName?: string;
  briefWhy?: string;
  strictHooks?: boolean;
}

interface SeedReport {
  tier: Tier;
  briefPath: string;
  moodboardPath: string;
  claudeMdPath: string;
  reviewMdPath: string;
  agentsCount: number;
  skillsFilesCount: number;
  commandsCount: number;
  hookEvents: number;
  strictSecurityHooks: boolean;
  memoryFilesCount: number;
}

function readIfExists(path: string): string | null {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

function readClaudeSettings(settingsPath: string): ClaudeSettings {
  const raw = readIfExists(settingsPath);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as ClaudeSettings;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

function shouldUseStrictSecurityHooks(settings: ClaudeSettings, strictHooks?: boolean): boolean {
  if (typeof strictHooks === "boolean") return strictHooks;
  return (
    settings.bypassPermissions === true ||
    settings.permissionMode === "bypassPermissions" ||
    settings.defaultMode === "bypassPermissions" ||
    settings.permissions?.defaultMode === "bypassPermissions"
  );
}

function addHookEntry(hooksMap: HookMap, event: string, matcher: string, hooks: HookCommand[]): void {
  if (!hooksMap[event]) hooksMap[event] = [];
  const duplicate = hooksMap[event].some(
    ex =>
      ex.matcher === matcher &&
      JSON.stringify(ex.hooks) === JSON.stringify(hooks),
  );
  if (duplicate) return;
  hooksMap[event].push({ matcher, hooks });
}

function removeAssistantSecurityHooks(hooksMap: HookMap): void {
  for (const [event, entries] of Object.entries(hooksMap)) {
    const filteredEntries: HookEntry[] = [];
    for (const entry of entries) {
      const filteredHooks = entry.hooks.filter(hook => !hook.command?.startsWith("bun .claude/hooks/security.ts"));
      if (filteredHooks.length > 0) filteredEntries.push({ ...entry, hooks: filteredHooks });
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

function copyHookRuntime(outputClaudeDir: string, force = false): number {
  return copyDirRecursive(
    join(TEMPLATES_DIR, "hooks", "runtime"),
    join(outputClaudeDir, "hooks"),
    undefined,
    { overwrite: force },
  );
}

function mergeHooks(outputClaudeDir: string, strictHooks?: boolean, force = false): HookMergeResult {
  const settingsPath = join(outputClaudeDir, "settings.local.json");
  copyHookRuntime(outputClaudeDir, force);
  const existingSettings = readClaudeSettings(settingsPath);
  const strictSecurity = shouldUseStrictSecurityHooks(existingSettings, strictHooks);
  const hooksMap: HookMap = {};
  mergeExistingHooks(hooksMap, existingSettings);
  removeAssistantSecurityHooks(hooksMap);

  const templates = [
    strictSecurity ? "hooks/security-strict.json" : "hooks/security.json",
    "hooks/quality.json",
    "hooks/dx.json",
    "hooks/showcase.json",
  ];

  for (const tpl of templates) {
    const full = join(TEMPLATES_DIR, tpl);
    const raw = readIfExists(full);
    if (!raw) continue;
    let entries: Array<{
      event: string;
      matcher?: string;
      hooks: HookCommand[];
    }>;
    try {
      entries = JSON.parse(raw);
    } catch {
      continue;
    }
    for (const entry of entries) {
      addHookEntry(hooksMap, entry.event, entry.matcher ?? "", entry.hooks);
    }
  }

  writeFileSync(settingsPath, JSON.stringify({ ...existingSettings, hooks: hooksMap }, null, 2));
  return { events: Object.keys(hooksMap).length, strictSecurity };
}

function writeReviewMd(outputDir: string, tier: Tier): string {
  const outputPath = join(outputDir, "REVIEW.md");
  if (existsSync(outputPath)) return outputPath;

  const template = readIfExists(join(TEMPLATES_DIR, "review-md/default.md"));
  if (!template) {
    throw new Error("Template review-md/default.md introuvable");
  }

  writeFileSync(outputPath, fillPlaceholders(template, {
    SECURITY_PATTERNS: "XSS, unsafe HTML, command injection, hardcoded secrets, and exposed tokens",
    PERFORMANCE_PATTERNS: "LCP regressions, unoptimized images/videos, unnecessary client components, and oversized motion bundles",
    ARCHITECTURE_VIOLATIONS: "RSC/client boundary drift, motion logic outside isolated client wrappers, and scope drift from docs/BRIEF.md",
    PROJECT_RULES: [
      `- Showcase tier is ${tier}; flag dependencies or motion patterns beyond that tier unless justified in docs/BRIEF.md.`,
      "- Review against docs/BRIEF.md and docs/MOODBOARD.md before judging design or content changes.",
      "- Flag missing reduced-motion fallbacks, image optimization, alt text, and focus-visible states.",
      "- Skip subjective visual taste unless it contradicts the brief, accessibility, performance, or conversion goal.",
    ].join("\n"),
  }));

  return outputPath;
}

function copyShipCheckGate(outputDir: string): boolean {
  const sourcePath = join(ASSISTANT_DIR, "scripts", "ship-check-gate.ts");
  const destinationPath = join(outputDir, ".claude", "scripts", "ship-check-gate.ts");
  if (!existsSync(sourcePath) || existsSync(destinationPath)) return false;
  ensureDir(dirname(destinationPath));
  copyFileSync(sourcePath, destinationPath);
  return true;
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

function buildMemoryFiles(tier: Tier, projectName: string, clientName: string, briefWhy: string): Record<string, string> {
  const cfg = TIER_CONFIG[tier];
  const date = new Date().toISOString().slice(0, 10);
  const progressTemplate = readIfExists(join(TEMPLATES_DIR, "memory/progress.md")) ?? "";
  const featureChecklistTemplate = readIfExists(join(TEMPLATES_DIR, "memory/feature-checklist.md")) ?? "";

  return {
    "user_role.md": memoryMarkdown(
      "User Role",
      "Default role and working style for showcase website projects",
      "user",
      ["role", "freelance", "showcase"],
      date,
      `**Role :** freelance/agence developpement web specialise sites vitrine clients. Deep conversation chaque projet. Stack Next.js 16 + Turbopack + Tailwind 4 + shadcn base-nova.
`,
    ),
    "project_purpose.md": memoryMarkdown(
      "Project Purpose",
      "Why this showcase website exists and how decisions should stay aligned",
      "project",
      ["purpose", "showcase", tier],
      date,
      `Site vitrine pour ${clientName}. Tier: ${tier}.

**Why:** ${briefWhy}

**How to apply:** decisions design/motion/content referencent BRIEF.md + MOODBOARD.md. Toute derive doit etre documentee et justifiee.
`,
    ),
    "project_stack.md": memoryMarkdown(
      "Project Stack",
      "Default technical stack and deployment baseline for the showcase project",
      "project",
      ["stack", "nextjs", "tailwind", "shadcn"],
      date,
      `Next.js 16 App Router + Turbopack. Tailwind 4. shadcn base-nova (@base-ui/react).
Motion stack: ${cfg.MOTION_STACK}.
Deploiement: Vercel region cdg1. Runtime Bun.
`,
    ),
    "feedback_conventions.md": memoryMarkdown(
      "Feedback Conventions",
      "User-locked implementation conventions for showcase projects",
      "feedback",
      ["conventions", "showcase", "rsc", "motion"],
      date,
      `Conventions projet showcase :
- Server Components par defaut, 'use client' uniquement pour motion / interactivite
- Motion wrappers en client component isole autour d'un children RSC
- Animer uniquement transform + opacity (compositor-only)
- Respect strict de prefers-reduced-motion: reduce (fallback sans animation)
- Cleanup : useGSAP() pour GSAP, AnimatePresence pour Motion unmounts
- Zero npm deps superflus
- Pas de console.log en commit (verifie par hook quality)
`,
    ),
    "reference_claude_md.md": memoryMarkdown(
      "Reference Claude Config",
      "Where the generated Claude project instructions live",
      "reference",
      ["claude-md", "project-config"],
      date,
      `Config principale: \`.claude/CLAUDE.md\` (variant website-showcase, tier ${tier}).
Layout:
- \`.claude/agents/\` : site-director, design-critic, motion-engineer, asset-curator, perf-auditor, security-reviewer (tous Opus)
- \`.claude/skills/\` : brief-questionnaire, moodboard-capture, motion-audit, asset-pipeline
- \`.claude/commands/\` : /brief, /moodboard, /motion, /section, /ship-vitrine
- \`.claude/settings.local.json\` : hooks security + quality + showcase
- \`.claude/showcase.json\` : marker tier pour /audit
- \`REVIEW.md\` : regles de review separees de CLAUDE.md
`,
    ),
    "reference_showcase_refs.md": memoryMarkdown(
      "Reference Showcase Inspiration",
      "Where to find curated showcase references and client moodboard inputs",
      "reference",
      ["showcase", "references", "awwwards"],
      date,
      `Pour l'inspiration et la curation motion/design :
- Consulter \`${ASSISTANT_DIR}/references/showcase-sites-references.md\` (skill Assistant)
- BRIEF section 4 (Mood visuel) + section 5 (Motion) : URLs references "oui comme ca" / "a eviter"
- MOODBOARD.md : motion signature + palette + typographie inferee
`,
    ),
    "progress.md": memoryMarkdown(
      "Progress Log",
      "Session bootstrap with completed work, next steps, open questions, and reference links",
      "project",
      ["progress", "showcase", tier],
      date,
      fillPlaceholders(progressTemplate, {
        PROJECT_NAME: projectName,
        DATE: date,
        FIRST_SESSION_GOAL: `Scaffold showcase project for ${clientName} (${tier})`,
        NEXT_STEP_1: "Complete docs/BRIEF.md",
        NEXT_STEP_2: "Complete docs/MOODBOARD.md",
      }),
    ),
    "feature-checklist.md": memoryMarkdown(
      "Feature Checklist",
      "Frozen v1 scope, non-goals, acceptance criteria, and locked decisions",
      "project",
      ["scope", "checklist", "showcase", tier],
      date,
      fillPlaceholders(featureChecklistTemplate, {
        PROJECT_NAME: projectName,
        FEATURE_1: "Publish a focused showcase website aligned with docs/BRIEF.md",
        FEATURE_2: "Ship responsive sections with accessible motion and optimized assets",
        NON_GOAL_1: "Build product-app features outside the client showcase scope",
        NON_GOAL_2: "Add motion libraries or heavy media outside the selected tier",
        CRITERIA_1: "BRIEF.md, MOODBOARD.md, REVIEW.md, and acceptance checks stay aligned before ship",
        LOCKED_DECISION_1: `Tier ${tier}: ${cfg.MOTION_STACK}`,
      }),
    ),
    "reflections/README.md": memoryMarkdown(
      "Reflections",
      "Directory contract for audit and impact reflection YAML files",
      "reference",
      ["reflections", "audit", "showcase"],
      date,
      `# Reflections

One file per significant audit, init, or verification session.

Expected naming:
- \`audit-YYYY-MM-DD.yaml\` for \`bun scripts/verify-impact.ts <project-path>\`
- \`init-YYYY-MM-DD.yaml\` for manual post-init reflections

Keep durable lessons here. Current task state belongs in \`progress.md\`.
`,
    ),
    "MEMORY.md": `- [user_role](user_role.md) — freelance/agence sites clients, stack Next.js 16 + Tailwind 4
- [project_purpose](project_purpose.md) — Site vitrine ${clientName}, tier ${tier}
- [project_stack](project_stack.md) — Next.js 16 + Turbopack + Tailwind 4 + shadcn base-nova + ${cfg.MOTION_STACK}
- [feedback_conventions](feedback_conventions.md) — RSC default, motion wrappers client, compositor-only, reduced-motion
- [reference_claude_md](reference_claude_md.md) — pointer vers .claude/CLAUDE.md
- [reference_showcase_refs](reference_showcase_refs.md) — references showcase dans skill Assistant
- [progress](progress.md) — session bootstrap, done / next / open questions
- [feature-checklist](feature-checklist.md) — scope v1 fige, non-goals, acceptance criteria
- [reflections](reflections/README.md) — contrat du dossier Reflexion pour audits et verification impact
`,
  };
}

function writeMemoryFiles(memoryDir: string, files: Record<string, string>, force = false): number {
  ensureDir(memoryDir);

  let count = 0;
  for (const [name, content] of Object.entries(files)) {
    const outputPath = join(memoryDir, name);
    if (writeGeneratedFile(outputPath, content, force) !== "skipped") count++;
  }
  return count;
}

function seedMemory(outputDir: string, tier: Tier, projectName: string, clientName: string, briefWhy: string, force = false): number {
  const absOut = resolve(outputDir);
  const files = buildMemoryFiles(tier, projectName, clientName, briefWhy);
  let count = writeMemoryFiles(join(absOut, ".claude", "memory"), files, force);

  const home = process.env.HOME;
  if (home) {
    const slug = absOut.replace(/\//g, "-");
    try {
      count += writeMemoryFiles(join(home, ".claude", "projects", slug, "memory"), files, force);
    } catch {
      // The generated project still carries a portable .claude/memory seed when global Claude memory is unavailable.
    }
  }

  return count;
}

export function vitrineSeed(opts: SeedOptions): SeedReport {
  const outputDir = resolve(opts.outputDir);
  const claudeDir = join(outputDir, ".claude");
  const agentsDir = join(claudeDir, "agents");
  const skillsDir = join(claudeDir, "skills");
  const commandsDir = join(claudeDir, "commands");
  const hooksDir = join(claudeDir, "hooks");
  const claudeScriptsDir = join(claudeDir, "scripts");
  const docsDir = join(outputDir, "docs");

  for (const d of [claudeDir, agentsDir, skillsDir, commandsDir, hooksDir, claudeScriptsDir, docsDir]) {
    ensureDir(d);
  }

  const cfg = TIER_CONFIG[opts.tier];
  const projectName = opts.projectName ?? "Site Vitrine";
  const clientName = opts.clientName ?? "Client";
  const briefWhy =
    opts.briefWhy ?? "definir la proposition de valeur et convertir les visiteurs sur l'action primaire du brief";

  // 1. CLAUDE.md
  const tplClaudeMd = readIfExists(join(TEMPLATES_DIR, "claude-md/website-showcase.md"));
  if (!tplClaudeMd) {
    throw new Error("Template website-showcase.md introuvable");
  }
  const vars: Record<string, string> = {
    PROJECT_NAME: projectName,
    DESCRIPTION: `Site vitrine pour ${clientName}. Tier ${opts.tier}.`,
    TIER: opts.tier,
    PACKAGE_MANAGER: "bun",
    RUNTIME: "bun",
    DEV_PORT: "3000",
    MOTION_STACK: cfg.MOTION_STACK,
    MOTION_STACK_DETAIL: cfg.MOTION_STACK_DETAIL,
    MOTION_DEPS: cfg.MOTION_DEPS,
    VIDEO_SOLUTION: cfg.VIDEO_SOLUTION,
    VIDEO_PIPELINE: cfg.VIDEO_PIPELINE,
    THREED_SOLUTION: cfg.THREED_SOLUTION,
    LCP_BUDGET: cfg.LCP_BUDGET,
    FONT_STACK: cfg.FONT_STACK,
    PHOTO_SOURCES: cfg.PHOTO_SOURCES,
    CMS: "TBD (Sanity / Payload / aucun)",
    ANALYTICS: "Vercel Analytics + Web Vitals",
    ANTI_AI_CLIENT: "false",
    TIER_JUSTIFICATION: "A renseigner apres /brief",
    BUILD_COMMAND: "bun run build",
    TEST_COMMAND: "bun run test",
    DEV_COMMAND: "bun run dev",
    DATE: new Date().toISOString().slice(0, 10),
  };
  const claudeMdPath = join(claudeDir, "CLAUDE.md");
  writeGeneratedFile(claudeMdPath, fillPlaceholders(tplClaudeMd, vars), opts.force === true);

  const reviewMdPath = writeReviewMd(outputDir, opts.tier);
  copyShipCheckGate(outputDir);

  // 2. Agents showcase (5)
  const agentsSrc = join(TEMPLATES_DIR, "agents/showcase");
  let agentsCount = copyDirRecursive(agentsSrc, agentsDir, vars, { overwrite: opts.force === true });

  // 2b. Auditeur sécurité baseline — doctrine : sécurité non négociable sur CHAQUE projet,
  // y compris une vitrine (clés Resend/analytics + formulaire de contact = surface d'attaque).
  const securityAuditorSrc = join(TEMPLATES_DIR, "agents/auditors/security-reviewer.md");
  const securityAuditorDest = join(agentsDir, "security-reviewer.md");
  if (existsSync(securityAuditorSrc) && (opts.force === true || !existsSync(securityAuditorDest))) {
    writeFileSync(securityAuditorDest, fillPlaceholders(readFileSync(securityAuditorSrc, "utf-8"), vars));
    agentsCount++;
  }

  // 2c. GUI verifier (boucle screenshot→act→re-screenshot) — une vitrine se juge à l'écran, pas au code.
  const guiVerifierSrc = join(TEMPLATES_DIR, "agents/gui-verifier.md");
  const guiVerifierDest = join(agentsDir, "gui-verifier.md");
  if (existsSync(guiVerifierSrc) && (opts.force === true || !existsSync(guiVerifierDest))) {
    writeFileSync(guiVerifierDest, fillPlaceholders(readFileSync(guiVerifierSrc, "utf-8"), vars));
    agentsCount++;
  }

  // 3. Skills showcase (4 sous-dossiers)
  const skillsSrc = join(TEMPLATES_DIR, "skills/showcase");
  const skillsFilesCount = copyDirRecursive(skillsSrc, skillsDir, vars, { overwrite: opts.force === true });

  // 4. Commands showcase (5 fichiers)
  const commandsSrc = join(TEMPLATES_DIR, "commands/showcase");
  const commandsCount = copyDirRecursive(commandsSrc, commandsDir, vars, { overwrite: opts.force === true });

  // 5. Hooks merges -> settings.local.json
  const hookMerge = mergeHooks(claudeDir, opts.strictHooks, opts.force === true);

  // 6. Marker showcase.json
  const marker = {
    tier: opts.tier,
    scaffoldedAt: new Date().toISOString(),
    briefPath: opts.briefPath ?? null,
  };
  writeFileSync(join(claudeDir, "showcase.json"), JSON.stringify(marker, null, 2));

  // 7. BRIEF.md / MOODBOARD.md
  const briefTpl = readIfExists(join(TEMPLATES_DIR, "showcase/BRIEF.template.md")) ?? "";
  const moodTpl = readIfExists(join(TEMPLATES_DIR, "showcase/MOODBOARD.template.md")) ?? "";

  // Si brief fourni, on ne l'ecrase pas — on copie vers docs/ seulement s'il n'existe pas deja
  const briefOut = join(docsDir, "BRIEF.md");
  const moodOut = join(docsDir, "MOODBOARD.md");

  if (opts.briefPath && existsSync(opts.briefPath) && resolve(opts.briefPath) !== resolve(briefOut) && !existsSync(briefOut)) {
    // Le brief source existe ailleurs -> on le copie tel quel
    copyFileSync(opts.briefPath, briefOut);
  } else if (!existsSync(briefOut)) {
    const filledBrief = fillPlaceholders(briefTpl, {
      PROJECT_NAME: projectName,
      CLIENT_NAME: clientName,
      DATE: new Date().toISOString().slice(0, 10),
      CONTACT: "TBD",
      TIER: opts.tier,
      TIER_JUSTIFICATION: "A renseigner apres /brief",
      MOTION_STACK_SUMMARY: cfg.MOTION_STACK,
      FREE_NOTES: "",
      Q_1_1: "", Q_1_2: "", Q_1_3: "", Q_1_4: "",
      Q_2_1: "", Q_2_2: "", Q_2_3: "",
      Q_3_1: "", Q_3_2: "", Q_3_3: "", Q_3_4: "",
      Q_4_1: "", Q_4_2: "", Q_4_3: "", Q_4_4: "",
      Q_5_1: "", Q_5_2: "", Q_5_3: "", Q_5_4: "",
      Q_6_1: "", Q_6_2: "", Q_6_3: "", Q_6_4: "",
      Q_7_1: "", Q_7_2: "", Q_7_3: "",
      Q_8_1: "", Q_8_2: "", Q_8_3: "",
      Q_9_1: "", Q_9_2: "", Q_9_3: "",
    });
    writeFileSync(briefOut, filledBrief);
  }

  if (!existsSync(moodOut)) {
    const filledMood = fillPlaceholders(moodTpl, {
      PROJECT_NAME: projectName,
      DATE: new Date().toISOString().slice(0, 10),
      REF_POSITIVE_LIST: "(a remplir via /moodboard)",
      REF_NEGATIVE_LIST: "(a remplir via /moodboard)",
      REF_NAME: "",
      REF_URL: "",
      REF_NOTES: "",
      REF_TAKE: "",
      REF_AVOID: "",
      REF_TAGS: "",
      PALETTE_PRIMARY: "TBD",
      PALETTE_SURFACE: "TBD",
      PALETTE_ACCENT: "TBD",
      PALETTE_TEXT: "TBD",
      MOTION_SIGNATURE: "(a inferer apres curation)",
      MOTION_KEYWORDS: "",
      MOTION_PATTERNS: "",
      FONT_DISPLAY: "TBD",
      FONT_BODY: "TBD",
      IMAGERY_STYLE: "",
      IMAGERY_SOURCES: cfg.PHOTO_SOURCES,
      IMAGERY_KEYWORDS: "",
      HOME_STRUCTURE: "1. Hero\n2. Features / Sections cles\n3. Proof / Social\n4. CTA\n5. Footer",
    });
    writeFileSync(moodOut, filledMood);
  }

  // 8. Seed memory
  const memoryFilesCount = seedMemory(outputDir, opts.tier, projectName, clientName, briefWhy, opts.force === true);

  return {
    tier: opts.tier,
    briefPath: briefOut,
    moodboardPath: moodOut,
    claudeMdPath,
    reviewMdPath,
    agentsCount,
    skillsFilesCount,
    commandsCount,
    hookEvents: hookMerge.events,
    strictSecurityHooks: hookMerge.strictSecurity,
    memoryFilesCount,
  };
}

// --- CLI ---
function main(): void {
  const rawArgs = process.argv.slice(2);
  const force = rawArgs.includes("--force");
  const positional = rawArgs.filter(arg => arg !== "--force");
  const outputDir = positional[0];
  const arg3 = positional[1];
  const arg4 = positional[2];

  if (!outputDir) {
    console.error("Usage: bun vitrine-seed.ts <output-dir> <tier> [brief-path]");
    console.error("  tier = simple | medium | premium");
    process.exit(1);
  }

  let tier: Tier;
  let briefPath: string | undefined;
  if (arg3 && ["simple", "medium", "premium"].includes(arg3)) {
    tier = arg3 as Tier;
    briefPath = arg4;
  } else if (arg3 && existsSync(arg3)) {
    briefPath = arg3;
    console.log(`[vitrine-seed] tier non fourni -> auto-detect depuis ${briefPath}`);
    const brief = readFileSync(briefPath, "utf-8");
    const detected = detectComplexity(brief, null);
    tier = detected.tier;
    console.log(`[vitrine-seed] tier detecte : ${tier}`);
  } else {
    console.error("tier requis (simple | medium | premium) ou brief-path valide pour auto-detection");
    process.exit(1);
  }

  const report = vitrineSeed({ outputDir, tier, briefPath, force });

  console.log("");
  console.log("--- Vitrine seed terminee ---");
  console.log(`Tier              : ${report.tier}`);
  console.log(`CLAUDE.md         : ${report.claudeMdPath}`);
  console.log(`REVIEW.md         : ${report.reviewMdPath}`);
  console.log(`Agents            : ${report.agentsCount} fichiers`);
  console.log(`Skills            : ${report.skillsFilesCount} fichiers`);
  console.log(`Commands          : ${report.commandsCount} fichiers`);
  console.log(`Hook events       : ${report.hookEvents}`);
  console.log(`Strict hooks      : ${report.strictSecurityHooks ? "oui" : "non"}`);
  console.log(`Memory seed       : ${report.memoryFilesCount} fichiers`);
  console.log(`Brief             : ${report.briefPath}`);
  console.log(`Moodboard         : ${report.moodboardPath}`);
}

if (import.meta.main) {
  main();
}
