#!/usr/bin/env bun

/**
 * install-toolkit.ts
 * Materializes the TOOLKIT_PLAN into a target project:
 *   - Copies skills from the library into <project>/.claude/skills/<name>/
 *   - Copies subagents into <project>/.claude/agents/<name>.md
 *
 * This is the missing bridge between strategy-select.ts (selection) and the
 * actual deployment of skills/agents into a project. Without it, the TOOLKIT_PLAN
 * remained an inert markdown file and Claude had to copy by hand.
 *
 * Usage:
 *   bun scripts/install-toolkit.ts <project-path> [--keywords="..."] [--type=<type>]
 *     [--skills=top:N|name1,name2] [--agents=top:N|name1,name2]
 *     [--dry-run] [--force]
 */

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import { basename, dirname, join, resolve } from "path";
import { spawnSync } from "child_process";

interface Args {
  projectPath: string;
  keywords: string;
  type: string;
  skillsSpec: string;
  agentsSpec: string;
  dryRun: boolean;
  force: boolean;
  limit: number;
}

interface Candidate {
  category: string;
  name: string;
  repo: string;
  path: string;
  description: string;
  score: number;
  reasons: string[];
}

interface AgentEntry {
  name: string;
  path: string;
  description: string;
  source: string;
  score: number;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes("--help")) {
    console.error("Usage: bun scripts/install-toolkit.ts <project-path> [options]");
    console.error("");
    console.error("Options:");
    console.error("  --keywords=\"...\"      Search keywords (defaults to project basename + type)");
    console.error("  --type=<type>          Project type: web-fullstack|api-backend|bot-agent|cli-tool|website-showcase|design-only");
    console.error("  --skills=top:N         Install top-N skills (default: top:8)");
    console.error("  --skills=a,b,c         Install named skills");
    console.error("  --agents=top:N         Install top-N subagents (default: top:6)");
    console.error("  --agents=a,b,c         Install named agents");
    console.error("  --dry-run              Print actions without writing");
    console.error("  --force                Overwrite existing skill/agent files");
    process.exit(1);
  }

  const positional = argv.filter(a => !a.startsWith("--"));
  const rawProjectPath = positional[0];
  if (rawProjectPath === undefined) {
    console.error("[install-toolkit] missing <project-path>");
    process.exit(1);
  }

  const flag = (key: string): string | undefined => {
    const match = argv.find(a => a === `--${key}` || a.startsWith(`--${key}=`));
    if (!match) return undefined;
    return match.includes("=") ? match.split("=").slice(1).join("=") : "true";
  };

  return {
    projectPath: resolve(rawProjectPath),
    keywords: flag("keywords") || "",
    type: flag("type") || "",
    skillsSpec: flag("skills") || "top:8",
    agentsSpec: flag("agents") || "top:6",
    dryRun: flag("dry-run") === "true",
    force: flag("force") === "true",
    limit: 20,
  };
}

function inferKeywords(projectPath: string, type: string): string {
  const name = basename(projectPath).replace(/[-_]/g, " ");
  const readmePath = join(projectPath, "README.md");
  const packagePath = join(projectPath, "package.json");
  let extra = "";
  try {
    if (existsSync(readmePath)) {
      const head = readFileSync(readmePath, "utf-8").slice(0, 1200);
      extra += " " + head;
    }
  } catch {}
  try {
    if (existsSync(packagePath)) {
      const pkg = JSON.parse(readFileSync(packagePath, "utf-8"));
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      extra += " " + Object.keys(deps).join(" ");
    }
  } catch {}
  return `${name} ${type} ${extra}`.replace(/\s+/g, " ").trim();
}

function runStrategySelect(keywords: string, type: string, limit: number): {
  skills: Candidate[];
  subagents: Candidate[];
  hooks: Candidate[];
  plugins: Candidate[];
} {
  const scriptPath = join(dirname(import.meta.filename), "strategy-select.ts");
  const args = [scriptPath, keywords, `--limit=${limit}`, "--json"];
  if (type) args.push(`--type=${type}`);
  const result = spawnSync("bun", args, { encoding: "utf-8" });
  if (result.status !== 0) {
    console.error("[install-toolkit] strategy-select failed:");
    console.error(result.stderr);
    process.exit(2);
  }
  try {
    const parsed = JSON.parse(result.stdout);
    return {
      skills: parsed.grouped?.skills || [],
      subagents: parsed.grouped?.subagents || [],
      hooks: parsed.grouped?.hooks || [],
      plugins: parsed.grouped?.plugins || [],
    };
  } catch (err) {
    console.error("[install-toolkit] failed to parse strategy-select JSON");
    console.error(result.stdout.slice(0, 500));
    process.exit(2);
  }
}

function pickByspec<T extends { name: string }>(
  candidates: T[],
  spec: string,
  label: string,
): T[] {
  if (spec.startsWith("top:")) {
    const n = parseInt(spec.slice(4), 10);
    return candidates.slice(0, isNaN(n) ? 5 : n);
  }
  const wanted = spec.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  const picked = candidates.filter(c => wanted.includes(c.name.toLowerCase()));
  const missing = wanted.filter(w => !candidates.some(c => c.name.toLowerCase() === w));
  if (missing.length > 0) {
    console.warn(`[install-toolkit] WARNING: requested ${label} not found in ranking: ${missing.join(", ")}`);
    console.warn(`[install-toolkit]   (try widening --keywords or higher --limit; ranked names: ${candidates.slice(0, 5).map(c => c.name).join(", ")}…)`);
  }
  return picked;
}

function isValidLibrary(candidate: string): boolean {
  try {
    if (!existsSync(candidate) || !statSync(candidate).isDirectory()) return false;
    return existsSync(join(candidate, "skills"));
  } catch {
    return false;
  }
}

function resolveLibraryDir(): string {
  const envOverride = process.env.SKILL_LIBRARY_DIR?.trim();
  if (envOverride && envOverride.length > 0) {
    return isValidLibrary(envOverride) ? envOverride : "";
  }
  const probes = [
    join(process.env.HOME || "", "Desktop/skill/library"),
  ];
  for (const candidate of probes) {
    if (isValidLibrary(candidate)) return candidate;
  }
  return "";
}

function discoverAgents(subagentCollections: Candidate[], keywords: string, limit: number): AgentEntry[] {
  const tokens = keywords
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .filter(t => t.length > 2);

  // Scan ALL collections in the library, not just ranked ones — that way
  // wshobson/agents (112 agents) and affaan-m (28 agents) etc. are visible
  // even when their repo name doesn't match the keywords.
  const libraryDir = resolveLibraryDir();
  const subagentsRoot = libraryDir ? join(libraryDir, "subagents") : "";
  const allCollections = new Map<string, { path: string; score: number; repo: string }>();
  for (const c of subagentCollections) {
    allCollections.set(c.path, { path: c.path, score: c.score, repo: c.repo });
  }
  if (subagentsRoot && existsSync(subagentsRoot)) {
    try {
      for (const entry of readdirSync(subagentsRoot)) {
        const entryPath = join(subagentsRoot, entry);
        try {
          if (!statSync(entryPath).isDirectory()) continue;
        } catch { continue; }
        if (!allCollections.has(entryPath)) {
          const repo = entry.split("--").slice(0, 2).join("/");
          allCollections.set(entryPath, { path: entryPath, score: 0, repo });
        }
      }
    } catch {}
  }

  const entries: AgentEntry[] = [];
  for (const collection of allCollections.values()) {
    // Probe both <collection>/agents/ and <collection>/ for *.md
    const probeDirs = [join(collection.path, "agents"), collection.path];
    for (const probeDir of probeDirs) {
      if (!existsSync(probeDir)) continue;
      let files: string[] = [];
      try {
        files = readdirSync(probeDir).filter(f => f.endsWith(".md") && f.toLowerCase() !== "readme.md");
      } catch { continue; }
      for (const file of files) {
        const filePath = join(probeDir, file);
        let raw = "";
        try { raw = readFileSync(filePath, "utf-8").slice(0, 4000); } catch { continue; }
        if (!/^---\s*$/m.test(raw)) continue; // require frontmatter (real subagent definition)
        const nameMatch = raw.match(/^name:\s*(.+)$/mi);
        const descMatch = raw.match(/^description:\s*(.+?)$/mi);
        const agentName = (nameMatch?.[1] || basename(file, ".md")).trim().replace(/["']/g, "");
        const desc = (descMatch?.[1] || "").trim();

        let semanticScore = 0;
        let nameMatched = false;
        const hay = (`${agentName} ${desc}`).toLowerCase();
        for (const token of tokens) {
          if (agentName.toLowerCase().includes(token)) {
            semanticScore += 8;
            nameMatched = true;
          } else if (hay.includes(token)) {
            semanticScore += 4;
          }
        }
        // A language-specific agent (python-reviewer, java-reviewer, …) should
        // only survive if the *name* contains a project token. Description-only
        // matches are false positives (every reviewer mentions "security").
        const langPattern = /(python|java|rust|kotlin|swift|\bcpp\b|c\+\+|golang|\bgo\b|ruby|\bphp\b|elixir|scala|haskell|dotnet|csharp|flutter|dart|android|ios|terraform|kubernetes|\bk8s\b|aws|gcp|azure)/i;
        const isLangSpecific = langPattern.test(agentName);
        if (isLangSpecific && !nameMatched) continue;
        let score = collection.score * 0.4 + semanticScore;
        // Boost canonical role names that map to "frontend, designer, security" intent
        if (/(frontend|designer|design|security|reviewer|architect|qa|e2e|performance|backend|api|database|devops|tester|writer|accessibility|seo|copy)/i.test(agentName)) {
          score += 3;
        }
        if (score <= 0) continue;
        entries.push({
          name: agentName,
          path: filePath,
          description: desc.slice(0, 240),
          source: collection.repo,
          score,
        });
      }
      if (files.length > 0) break; // prefer the agents/ subfolder if it had matches
    }
  }

  entries.sort((a, b) => b.score - a.score);

  // Deduplicate by name, keep the best score
  const bestByName = new Map<string, AgentEntry>();
  for (const e of entries) {
    const existing = bestByName.get(e.name.toLowerCase());
    if (!existing || e.score > existing.score) bestByName.set(e.name.toLowerCase(), e);
  }
  return Array.from(bestByName.values()).slice(0, limit);
}

function installSkill(skill: Candidate, projectPath: string, args: Args): { action: string; target: string } {
  const targetDir = join(projectPath, ".claude/skills", skill.name);
  const targetSkillMd = join(targetDir, "SKILL.md");
  const exists = existsSync(targetSkillMd);

  if (exists && !args.force) {
    return { action: "skip-exists", target: targetSkillMd };
  }

  if (args.dryRun) {
    return { action: exists ? "would-overwrite" : "would-install", target: targetSkillMd };
  }

  mkdirSync(targetDir, { recursive: true });
  // Copy the SKILL.md (and any references/ subfolder if present).
  const sourceSkillMd = join(skill.path, "SKILL.md");
  if (existsSync(sourceSkillMd)) {
    cpSync(sourceSkillMd, targetSkillMd);
  } else {
    // Fallback: try a README.md
    const sourceReadme = join(skill.path, "README.md");
    if (existsSync(sourceReadme)) cpSync(sourceReadme, targetSkillMd);
    else return { action: "error-no-source", target: targetSkillMd };
  }
  // Copy any references/ if present, to keep progressive disclosure intact.
  const sourceReferences = join(skill.path, "references");
  if (existsSync(sourceReferences) && statSync(sourceReferences).isDirectory()) {
    cpSync(sourceReferences, join(targetDir, "references"), { recursive: true });
  }
  return { action: exists ? "overwrote" : "installed", target: targetSkillMd };
}

function installAgent(agent: AgentEntry, projectPath: string, args: Args): { action: string; target: string } {
  const targetPath = join(projectPath, ".claude/agents", `${agent.name}.md`);
  const exists = existsSync(targetPath);

  if (exists && !args.force) {
    return { action: "skip-exists", target: targetPath };
  }

  if (args.dryRun) {
    return { action: exists ? "would-overwrite" : "would-install", target: targetPath };
  }

  mkdirSync(dirname(targetPath), { recursive: true });
  let raw = "";
  try { raw = readFileSync(agent.path, "utf-8"); } catch { return { action: "error-no-source", target: targetPath }; }
  // Force opus model per global preference.
  if (/^model:\s*.+$/m.test(raw)) {
    raw = raw.replace(/^model:\s*.+$/m, "model: claude-opus-4-8");
  } else if (/^---\s*\n/.test(raw)) {
    raw = raw.replace(/^---\s*\n/, "---\nmodel: claude-opus-4-8\n");
  }
  writeFileSync(targetPath, raw);
  return { action: exists ? "overwrote" : "installed", target: targetPath };
}

function writeReceipt(projectPath: string, installed: { skills: Record<string, unknown>[]; agents: Record<string, unknown>[] }, args: Args) {
  if (args.dryRun) return;
  const receiptDir = join(projectPath, ".claude");
  mkdirSync(receiptDir, { recursive: true });
  const receipt = {
    generatedAt: new Date().toISOString(),
    keywords: args.keywords,
    type: args.type,
    installed,
  };
  writeFileSync(join(receiptDir, "TOOLKIT_INSTALLED.json"), JSON.stringify(receipt, null, 2));
}

function main() {
  const args = parseArgs();
  if (!existsSync(args.projectPath)) {
    console.error(`[install-toolkit] project path not found: ${args.projectPath}`);
    process.exit(1);
  }

  const keywords = args.keywords || inferKeywords(args.projectPath, args.type);
  console.log(`[install-toolkit] project=${args.projectPath}`);
  console.log(`[install-toolkit] keywords="${keywords.slice(0, 200)}"`);
  console.log(`[install-toolkit] type=${args.type || "(auto)"}`);
  console.log(`[install-toolkit] dry-run=${args.dryRun} force=${args.force}`);

  const grouped = runStrategySelect(keywords, args.type, args.limit);
  console.log(`[install-toolkit] ranked: skills=${grouped.skills.length} subagent-collections=${grouped.subagents.length}`);

  const skillsToInstall = pickByspec(grouped.skills, args.skillsSpec, "skills");
  const agentsAll = discoverAgents(grouped.subagents, keywords, 30);
  const agentsToInstall = pickByspec(agentsAll, args.agentsSpec, "agents");

  console.log(`\n[install-toolkit] picking ${skillsToInstall.length} skills`);
  const skillResults: Record<string, unknown>[] = [];
  for (const skill of skillsToInstall) {
    const result = installSkill(skill, args.projectPath, args);
    console.log(`  - ${result.action.padEnd(18)} ${skill.name}  (score=${skill.score})`);
    skillResults.push({ name: skill.name, score: skill.score, repo: skill.repo, source: skill.path, ...result });
  }

  console.log(`\n[install-toolkit] picking ${agentsToInstall.length} subagents`);
  const agentResults: Record<string, unknown>[] = [];
  for (const agent of agentsToInstall) {
    const result = installAgent(agent, args.projectPath, args);
    console.log(`  - ${result.action.padEnd(18)} ${agent.name}  (score=${agent.score.toFixed(1)})`);
    agentResults.push({ name: agent.name, score: agent.score, source: agent.path, repo: agent.source, ...result });
  }

  writeReceipt(args.projectPath, { skills: skillResults, agents: agentResults }, args);

  console.log(`\n[install-toolkit] done. ${args.dryRun ? "(dry-run, nothing written)" : `wrote ${join(args.projectPath, ".claude/TOOLKIT_INSTALLED.json")}`}`);
}

main();
