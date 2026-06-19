#!/usr/bin/env bun

/**
 * audit-project.ts
 * Comprehensive audit of a project's Claude Code configuration.
 * Scores 18 dimensions matching references/claude-code-features-checklist.md.
 * Output: JSON score report to stdout.
 */

import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "fs";
import { join, resolve } from "path";
import { homedir } from "os";

type Severity = "critical" | "high" | "medium" | "low";

interface AuditResult {
  scores: Record<string, { score: number; weight: number; findings: string[] }>;
  overall: number;
  recommendations: Array<{ severity: Severity; dimension: string; message: string }>;
  metadata: { ccVersion: string | null; auditedAt: string; project: string };
}

const cwdInput = process.argv[2] || process.cwd();
const cwd = (() => {
  try { return realpathSync(cwdInput); }
  catch { return resolve(cwdInput); }
})();

function fileExists(path: string): boolean { return existsSync(join(cwd, path)); }
function readFile(path: string): string | null {
  try { return readFileSync(join(cwd, path), "utf-8"); } catch { return null; }
}
function dirContents(path: string): string[] {
  try { return readdirSync(join(cwd, path)); } catch { return []; }
}
function dirContentsAbs(abs: string): string[] {
  try { return readdirSync(abs); } catch { return []; }
}
function safeJson<T = any>(s: string | null): T | null {
  if (!s) return null;
  try { return JSON.parse(s) as T; } catch { return null; }
}

/** Outils déclarés dans le frontmatter `tools:` d'un agent (liste YAML multi-ligne OU inline). */
function agentTools(content: string): string[] {
  const fm = content.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  const out: string[] = [];
  let inTools = false;
  for (const line of fm.split("\n")) {
    const head = line.match(/^tools:\s*(.*)$/i);
    if (head) {
      const inline = (head[1] ?? "").trim();
      if (inline) {
        for (const t of inline.replace(/[[\]]/g, "").split(/[,\s]+/)) if (t) out.push(t);
        inTools = false;
      } else {
        inTools = true;
      }
      continue;
    }
    if (inTools) {
      const item = line.match(/^\s*-\s*(\w+)/);
      if (item?.[1]) { out.push(item[1]); continue; }
      if (/^\S/.test(line)) inTools = false; // clé top-level suivante → fin du bloc tools
    }
  }
  return out;
}
const WRITER_TOOLS = /^(Edit|Write|MultiEdit|NotebookEdit)$/;

function getCCVersion(): string | null {
  try {
    const result = Bun.spawnSync(["claude", "--version"]);
    const output = result.stdout.toString().trim();
    const match = output.match(/(\d+\.\d+\.\d+)/);
    return match?.[1] ?? null;
  } catch { return null; }
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0, nb = pb[i] ?? 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

function loadSettings() {
  const local = safeJson<any>(readFile(".claude/settings.local.json"));
  const project = safeJson<any>(readFile(".claude/settings.json"));
  const globalSettings = safeJson<any>((() => {
    try { return readFileSync(join(homedir(), ".claude", "settings.json"), "utf-8"); } catch { return null; }
  })());
  return { local, project, global: globalSettings };
}

function audit(): AuditResult {
  const scores: AuditResult["scores"] = {};
  const recs: AuditResult["recommendations"] = [];
  const add = (sev: Severity, dim: string, msg: string) => recs.push({ severity: sev, dimension: dim, message: msg });
  const settings = loadSettings();
  const anySettings = settings.local || settings.project || {};
  const ccVersion = getCCVersion();
  const pkg = safeJson<any>(readFile("package.json"));
  const isNode = !!pkg;
  const projectName = pkg?.name || cwd.split("/").pop() || "unknown";

  // =====================================================================
  // 0. CC VERSION (weight 2x — security prerequisite)
  // =====================================================================
  {
    const findings: string[] = [];
    let score = 10;
    if (!ccVersion) {
      score = 5;
      findings.push("Could not determine Claude Code version");
      add("medium", "cc-version", "Ensure claude CLI is installed and accessible in PATH");
    } else {
      findings.push(`Claude Code version: ${ccVersion}`);
      if (compareVersions(ccVersion, "2.1.90") < 0) {
        score = 0;
        findings.push("CRITICAL: version < v2.1.90 — CVE deny rules bypass (credential exfiltration)");
        add("critical", "cc-version", `Upgrade immediately: npm i -g @anthropic-ai/claude-code@latest (current v${ccVersion}, min safe v2.1.90)`);
      } else if (compareVersions(ccVersion, "2.1.111") < 0) {
        score = 7;
        findings.push(`Outdated (v${ccVersion}) — latest features (Fast Mode, /ultrareview, xhigh effort) missing`);
        add("medium", "cc-version", "Upgrade to latest CC (recent releases add push notifications, fast mode, agent SDK improvements)");
      } else if (compareVersions(ccVersion, "2.1.119") < 0) {
        score = 8;
        findings.push(`Slightly outdated (v${ccVersion}) — v2.1.119 adds PostToolBatch hook, duration_ms in PostToolUse, --from-pr multi-platform, prUrlTemplate, skill pre-compaction fix`);
        add("medium", "cc-version", `Upgrade to v2.1.119+ (current v${ccVersion}): npm i -g @anthropic-ai/claude-code@latest`);
      }
    }
    scores["cc-version"] = { score, weight: 2, findings };
  }

  // =====================================================================
  // 1. CLAUDE.md (weight 1.5x)
  // =====================================================================
  {
    const findings: string[] = [];
    let score = 0;
    const claudeMd = readFile(".claude/CLAUDE.md") || readFile("CLAUDE.md");
    const path = fileExists(".claude/CLAUDE.md") ? ".claude/CLAUDE.md" : (fileExists("CLAUDE.md") ? "CLAUDE.md" : null);

    if (!claudeMd) {
      findings.push("No CLAUDE.md found");
      add("critical", "claude-md", "Create .claude/CLAUDE.md (project overview, build commands, architecture, conventions)");
    } else {
      score = 10;
      findings.push(`CLAUDE.md at ${path} (${claudeMd.length} chars, ${claudeMd.split("\n").length} lines)`);
      const sections: Array<{ name: string; keywords: string[] }> = [
        { name: "overview/what", keywords: ["overview", "what this project", "## what"] },
        { name: "commands", keywords: ["command", "bash", "npm run", "bun run"] },
        { name: "architecture", keywords: ["architecture", "structure"] },
        { name: "conventions", keywords: ["convention", "style", "rule"] },
      ];
      for (const sec of sections) {
        if (!sec.keywords.some(k => claudeMd.toLowerCase().includes(k))) {
          score -= 2;
          findings.push(`Missing section: ${sec.name}`);
          add("high", "claude-md", `Add '${sec.name}' section to CLAUDE.md`);
        }
      }
      if (claudeMd.length < 200) {
        score -= 2;
        findings.push("CLAUDE.md is too short (< 200 chars)");
      }
      const lineCount = claudeMd.split("\n").length;
      if (lineCount > 200) {
        score -= 1;
        findings.push(`CLAUDE.md is ${lineCount} lines — consider splitting with .claude/rules/*.md`);
        add("medium", "claude-md", "Split CLAUDE.md: move rules to .claude/rules/*.md for modularity");
      }
      if (!fileExists("REVIEW.md")) {
        findings.push("No REVIEW.md (review-specific rules)");
      }
      if (dirContents(".claude/rules").length > 0) {
        findings.push(`${dirContents(".claude/rules").length} modular rules in .claude/rules/`);
      }
    }
    scores["claude-md"] = { score: Math.max(0, score), weight: 1.5, findings };
  }

  // =====================================================================
  // 2. RESPONSE DISCIPLINE
  // =====================================================================
  {
    const findings: string[] = [];
    let score = 10;
    const instructionFiles = [
      ".claude/CLAUDE.md",
      "CLAUDE.md",
      ...dirContents(".claude/agents").filter(file => file.endsWith(".md")).map(file => `.claude/agents/${file}`),
    ];
    const combined = instructionFiles
      .map(file => readFile(file) || "")
      .join("\n")
      .toLowerCase();
    const hasAccuracyOverApproval = /accuracy.{0,40}approval|approval.{0,40}accuracy|précision.{0,40}approbation|approbation.{0,40}précision/.test(combined);
    const hasUnknownRule = /\bunknown\b/.test(combined);
    const hasConfidenceLabels = /confidence|confiance|high\s*\/\s*medium\s*\/\s*low\s*\/\s*unknown/.test(combined);
    const hasNoFlattery = /flattery|flatterie|flatter/.test(combined);

    if (!hasAccuracyOverApproval) {
      score -= 4;
      findings.push("Missing accuracy-over-approval rule");
      add("medium", "response-discipline", "Add an evidence-first rule: accuracy over approval, correct weak premises directly.");
    } else findings.push("Accuracy-over-approval rule present");

    if (!hasUnknownRule) {
      score -= 2;
      findings.push("Missing explicit unknown-if-evidence-missing rule");
      add("medium", "response-discipline", "Tell agents to write `unknown` when evidence is missing instead of filling gaps.");
    } else findings.push("Unknown-if-evidence-missing rule present");

    if (!hasConfidenceLabels) {
      score -= 2;
      findings.push("Missing confidence labels for uncertain judgments");
      add("low", "response-discipline", "Require confidence labels (`high` / `medium` / `low` / `unknown`) for uncertain judgments.");
    } else findings.push("Confidence labels rule present");

    if (!hasNoFlattery) {
      score -= 1;
      findings.push("Missing no-flattery / anti-sycophancy rule");
      add("low", "response-discipline", "Add a no-flattery rule for analysis, review, and ship decisions.");
    } else findings.push("No-flattery rule present");

    scores["response-discipline"] = { score: Math.max(0, score), weight: 0.5, findings };
  }

  // =====================================================================
  // 3. SKILLS
  // =====================================================================
  {
    const findings: string[] = [];
    let score = 10;
    const globalSkills = dirContentsAbs(join(homedir(), ".claude", "skills"));
    const gstack = ["browse", "careful", "investigate", "qa", "review", "ship"];
    const installedGstack = gstack.filter(s => globalSkills.includes(s));
    const hasAssistant = globalSkills.includes("assistant");
    if (installedGstack.length < 3) {
      score -= 4;
      findings.push(`gstack skills incomplete: ${installedGstack.length}/6 (${installedGstack.join(", ") || "none"})`);
      add("high", "skills", "Install gstack skills (browse, careful, investigate, qa, review, ship)");
    } else {
      findings.push(`gstack skills: ${installedGstack.length}/6 (${installedGstack.join(", ")})`);
    }
    if (hasAssistant) findings.push("assistant skill installed");
    const projectSkills = dirContents(".claude/skills");
    if (projectSkills.length > 0) findings.push(`${projectSkills.length} project-level skills`);
    if (globalSkills.length < 5) { score -= 2; findings.push(`Only ${globalSkills.length} global skills`); }
    scores["skills"] = { score: Math.max(0, score), weight: 1, findings };
  }

  // =====================================================================
  // 3. AGENTS
  // =====================================================================
  {
    const findings: string[] = [];
    let score = 10;
    const agents = dirContents(".claude/agents");
    if (agents.length === 0) {
      score = 4;
      findings.push("No project-specific agents");
      add("medium", "agents", "Consider adding planner/executor/reviewer agents for complex tasks");
    } else {
      findings.push(`${agents.length} agent(s): ${agents.join(", ")}`);
      let withOpus = 0, withEffort = 0, readOnly = 0, writers = 0, withContext = 0, withTools = 0;
      for (const a of agents) {
        const content = readFile(`.claude/agents/${a}`);
        if (!content) continue;
        if (/^model:\s*(opus|claude-opus)/mi.test(content)) withOpus++;
        if (/^effort:\s*(high|xhigh|max)/mi.test(content)) withEffort++;
        // Split read/write : un agent dont les tools incluent un écrivain (Edit/Write/…) est un WRITER ;
        // sinon, tools déclarés mais aucun écrivain = READ-ONLY (least-privilege, mapping/review).
        const tools = agentTools(content);
        if (tools.length) {
          withTools++;
          if (tools.some((t) => WRITER_TOOLS.test(t))) writers++; else readOnly++;
        }
        if (/^context:\s*(fork|summary)/mi.test(content)) withContext++;
      }
      findings.push(`${withOpus}/${agents.length} use Opus, ${withEffort}/${agents.length} use effort high+`);
      findings.push(`orchestration: ${readOnly} read-only, ${writers} writer(s), ${withTools} declare tools; ${withContext}/${agents.length} declare context:fork/summary`);
      if (withOpus < agents.length) {
        score -= 2;
        add("medium", "agents", "Check model selection per agent (Opus for architecture/critical, Haiku for simple tasks)");
      }
      // Orchestration doctrine : read-only mapping → écritures en scopes disjoints → review indépendante.
      // Si des tools sont déclarés mais AUCUN agent read-only, le least-privilege read/write n'est pas tenu.
      if (withTools > 0 && readOnly === 0) {
        score -= 1;
        add("medium", "agents", "No read-only agent: orchestrate read-only mapping first, then writes in disjoint scopes (least-privilege tools per agent).");
      }
      // Isolation de contexte : un set d'agents qui ne déclare jamais context:fork/summary ne protège
      // pas la fenêtre principale (le context window est LA contrainte).
      if (agents.length >= 3 && withContext === 0) {
        score -= 1;
        add("low", "agents", "No agent declares context:fork/summary — subagents should fork/summarize context to protect the main window.");
      }
    }
    scores["agents"] = { score: Math.max(0, score), weight: 1, findings };
  }

  // =====================================================================
  // 4. HOOKS (weight 1.5x — security critical)
  // =====================================================================
  {
    const findings: string[] = [];
    let score = 0;
    const hooks = anySettings.hooks;
    if (!hooks || typeof hooks !== "object") {
      findings.push("No hooks configured");
      add("critical", "hooks", "Create .claude/settings.local.json with security hooks (--no-verify block, secret detection, config protection)");
    } else {
      score = 10;
      const hookEvents = Object.keys(hooks);
      findings.push(`${hookEvents.length} hook event(s): ${hookEvents.join(", ")}`);
      const hooksJson = JSON.stringify(hooks);
      // Hooks usually delegate logic to local scripts (.claude/hooks/*.ts|sh). Read those
      // referenced scripts so guards implemented IN the script (e.g. a --no-verify block)
      // are detected, not just literal strings in settings.json.
      const referencedScripts = new Set<string>();
      for (const m of hooksJson.matchAll(/[\w./-]*\.claude\/hooks\/[\w.-]+\.(?:ts|js|mjs|sh)/g)) {
        referencedScripts.add(m[0].replace(/^.*?\.claude\//, ".claude/"));
      }
      let referencedContent = "";
      for (const rel of referencedScripts) referencedContent += "\n" + (readFile(rel) || "");
      const hooksStr = hooksJson + referencedContent;
      const checks: Array<{ name: string; pattern: RegExp; weight: number; sev: Severity; msg: string }> = [
        { name: "block --no-verify", pattern: /no-verify|no_verify/i, weight: 3, sev: "high", msg: "Add hook to block --no-verify flag (git hook bypass)" },
        { name: "config protection", pattern: /biome|eslintrc|prettierrc|config-protection|tsconfig/i, weight: 2, sev: "medium", msg: "Add hook to protect linter/formatter/build configs" },
        { name: "secret detection", pattern: /secret|AKIA|sk-|api[_-]?key/i, weight: 2, sev: "high", msg: "Add hook to detect hardcoded secrets" },
        { name: "SessionStart", pattern: /SessionStart/i, weight: 1, sev: "low", msg: "Consider SessionStart hook for context loading" },
        { name: "Stop/PostToolUse", pattern: /Stop|PostToolUse/i, weight: 1, sev: "low", msg: "Consider Stop/PostToolUse hooks for quality gates" },
      ];
      for (const c of checks) {
        if (!c.pattern.test(hooksStr)) {
          score -= c.weight;
          findings.push(`Missing: ${c.name}`);
          add(c.sev, "hooks", c.msg);
        }
      }
    }
    scores["hooks"] = { score: Math.max(0, score), weight: 1.5, findings };
  }

  // =====================================================================
  // 5. TOOLS & DISPATCHING (hints from CLAUDE.md)
  // =====================================================================
  {
    const findings: string[] = [];
    let score = 10;
    const claudeMd = (readFile(".claude/CLAUDE.md") || readFile("CLAUDE.md") || "").toLowerCase();
    const goodHints = ["glob", "grep", "parallel", "todowrite", "plan mode", "agent tool"];
    const found = goodHints.filter(h => claudeMd.includes(h));
    findings.push(`Tool hints in CLAUDE.md: ${found.length}/6 (${found.join(", ") || "none"})`);
    if (found.length < 2) {
      score = 6;
      add("low", "tools", "Document tool preferences in CLAUDE.md (Glob > find, Grep > grep, Read > cat, parallel tool calls)");
    }
    scores["tools"] = { score, weight: 0.5, findings };
  }

  // =====================================================================
  // 6. MCP (Max 2 rule — weight 1x)
  // =====================================================================
  {
    const findings: string[] = [];
    let score = 10;
    const projectMcp = safeJson<any>(readFile(".mcp.json"))?.mcpServers || anySettings?.mcpServers || {};
    const globalMcpPath = join(homedir(), ".claude.json");
    const globalCc = safeJson<any>((() => { try { return readFileSync(globalMcpPath, "utf-8"); } catch { return null; } })());
    const globalMcp = globalCc?.mcpServers || {};
    const projectCount = Object.keys(projectMcp).length;
    const globalCount = Object.keys(globalMcp).length;
    findings.push(`Project MCPs: ${projectCount} (${Object.keys(projectMcp).join(", ") || "none"})`);
    findings.push(`Global MCPs: ${globalCount} (${Object.keys(globalMcp).join(", ") || "none"})`);
    const secretPattern = /(authorization|bearer\s+[a-z0-9._-]+|api[_-]?key|secret|token|ghp_[a-z0-9_]+|ctx7sk-[a-z0-9-]+)/i;
    const globalMcpInlineSecrets = Object.entries(globalMcp)
      .filter(([, cfg]) => secretPattern.test(JSON.stringify(cfg)))
      .map(([name]) => name);
    if (globalMcpInlineSecrets.length > 0) {
      score -= 3;
      findings.push(`Global MCP configs contain inline secrets: ${globalMcpInlineSecrets.join(", ")} (values redacted)`);
      add("critical", "mcp", "Rotate inline MCP secrets, then move credentials from ~/.claude.json into env vars or a credential store");
    }
    if (projectCount > 2) {
      score -= 3;
      findings.push(`Project has ${projectCount} MCPs (max 2 recommended — each costs 5-10% context)`);
      add("high", "mcp", `Reduce project MCPs to max 2 (currently ${projectCount}). Prefer CLI: gh > github-mcp, vercel > vercel-mcp`);
    }
    if (globalCount > 2) {
      score -= 2;
      findings.push(`Global has ${globalCount} MCPs — shared across all sessions`);
      add("medium", "mcp", `Reduce global MCPs to max 2 (currently ${globalCount}) — each MCP reduces context for every project`);
    }
    scores["mcp"] = { score: Math.max(0, score), weight: 1, findings };
  }

  // =====================================================================
  // 7. MEMORY & PERSISTENCE
  // =====================================================================
  {
    const findings: string[] = [];
    let score = 10;
    const projectKey = cwd.replace(/\//g, "-");
    const memoryDir = join(homedir(), ".claude", "projects", projectKey, "memory");
    const memFiles = dirContentsAbs(memoryDir);
    if (memFiles.length === 0) {
      score = 5;
      findings.push("No auto-memory for this project");
      add("low", "memory", "Let Claude build auto-memory organically (it asks to save preferences/corrections)");
    } else {
      const hasIndex = memFiles.includes("MEMORY.md");
      findings.push(`${memFiles.length - (hasIndex ? 1 : 0)} memory file(s)${hasIndex ? " + MEMORY.md index" : ""}`);
      if (!hasIndex) { score -= 3; findings.push("MEMORY.md index missing"); }
    }
    scores["memory"] = { score: Math.max(0, score), weight: 0.5, findings };
  }

  // =====================================================================
  // 8. PERMISSIONS & SECURITY (weight 1.5x)
  // =====================================================================
  {
    const findings: string[] = [];
    let score = 10;
    const perms = anySettings.permissions || {};
    const allow = perms.allow?.length || 0;
    const deny = perms.deny?.length || 0;
    findings.push(`Permissions: ${allow} allow rule(s), ${deny} deny rule(s)`);
    if (allow === 0 && deny === 0) {
      score -= 4;
      findings.push("No allow/deny rules — users get frequent permission prompts");
      add("medium", "permissions", "Add permissions.allow for safe commands (e.g. 'Bash(git status)', 'Bash(bun run:*)') to reduce prompts");
    }
    if (!fileExists(".gitignore")) {
      score -= 2;
      findings.push("No .gitignore");
      add("high", "permissions", "Add .gitignore with .env*.local, credentials, secrets");
    } else {
      const gitignore = readFile(".gitignore") || "";
      const sensitive = [".env", ".env.local", "credentials", "secrets"];
      const missing = sensitive.filter(p => !gitignore.includes(p));
      if (missing.length > 0) {
        score -= 1;
        findings.push(`.gitignore missing: ${missing.join(", ")}`);
      }
    }
    scores["permissions"] = { score: Math.max(0, score), weight: 1.5, findings };
  }

  // =====================================================================
  // 9. PLUGINS & CHANNELS
  // =====================================================================
  {
    const findings: string[] = [];
    let score = 10;
    const installedPath = join(homedir(), ".claude", "plugins", "installed_plugins.json");
    const installed = safeJson<any>((() => { try { return readFileSync(installedPath, "utf-8"); } catch { return null; } })()) || {};
    const pluginsMap = installed.plugins || installed;
    const globalPlugins = Object.keys(pluginsMap || {}).map(k => k.split("@")[0] ?? k);
    findings.push(`${globalPlugins.length} global plugin(s): ${globalPlugins.slice(0, 5).join(", ")}${globalPlugins.length > 5 ? "..." : ""}`);
    if (globalPlugins.length > 10) {
      score -= 2;
      findings.push(`${globalPlugins.length} plugins is heavy (~1k tok each on session start)`);
      add("medium", "plugins", `Review plugins: remove unused via 'claude plugin remove <name>'. Currently ${globalPlugins.length} plugins.`);
    }
    const recommended: Array<{ name: string; signal: (p: any) => boolean; msg: string }> = [
      { name: "vercel", signal: () => fileExists("vercel.json") || fileExists("vercel.ts"), msg: "Install vercel plugin for projects deployed on Vercel" },
      { name: "playwright", signal: (p) => !!p?.devDependencies?.["@playwright/test"] || !!p?.dependencies?.["@playwright/test"], msg: "Install playwright plugin for browser testing projects" },
      { name: "context7", signal: () => true, msg: "Install context7 plugin for up-to-date library docs" },
    ];
    for (const r of recommended) {
      if (r.signal(pkg) && !globalPlugins.some(p => p.toLowerCase().includes(r.name))) {
        score -= 1;
        findings.push(`Missing recommended plugin: ${r.name}`);
        add("low", "plugins", r.msg);
      }
    }
    scores["plugins"] = { score: Math.max(0, score), weight: 0.5, findings };
  }

  // =====================================================================
  // 10. CI/CD & DEPLOYMENT
  // =====================================================================
  {
    const findings: string[] = [];
    let score = 10;
    const hasActions = fileExists(".github/workflows");
    const hasGitlab = fileExists(".gitlab-ci.yml");
    const hasVercelConfig = fileExists("vercel.json") || fileExists("vercel.ts");
    if (hasActions) findings.push(`GitHub Actions: ${dirContents(".github/workflows").length} workflow(s)`);
    if (hasGitlab) findings.push("GitLab CI configured");
    if (hasVercelConfig) findings.push(`Vercel config: ${fileExists("vercel.ts") ? "vercel.ts (modern)" : "vercel.json"}`);
    const hasGitRemote = ((): boolean => {
      try {
        const r = Bun.spawnSync(["git", "remote"], { cwd });
        return r.stdout.toString().trim().length > 0;
      } catch { return false; }
    })();
    if (!hasActions && !hasGitlab && isNode) {
      if (!hasGitRemote) {
        findings.push("No CI/CD pipeline (no git remote — N/A for local-only projects)");
      } else {
        score -= 3;
        findings.push("No CI/CD pipeline");
        add("medium", "cicd", "Add .github/workflows/ or .gitlab-ci.yml for automated checks");
      }
    }
    if (hasVercelConfig && fileExists("vercel.json") && !fileExists("vercel.ts")) {
      score -= 1;
      findings.push("Using legacy vercel.json (vercel.ts is modern)");
      add("low", "cicd", "Migrate vercel.json to vercel.ts for type safety");
    }
    scores["cicd"] = { score: Math.max(0, score), weight: 0.5, findings };
  }

  // =====================================================================
  // 11. WORKFLOW COMMANDS (custom slash commands)
  // =====================================================================
  {
    const findings: string[] = [];
    let score = 10;
    const projectCmds = dirContents(".claude/commands");
    const globalCmds = dirContentsAbs(join(homedir(), ".claude", "commands"));
    findings.push(`Commands: ${projectCmds.length} project, ${globalCmds.length} global`);
    if (projectCmds.length === 0) {
      score -= 2;
      findings.push("No project commands (.claude/commands/*.md)");
      add("low", "commands", "Consider creating /commit, /fix, /test project commands for common workflows");
    }
    scores["commands"] = { score: Math.max(0, score), weight: 0.5, findings };
  }

  // =====================================================================
  // 12. AGENT SDK / PROGRAMMATIC USAGE
  // =====================================================================
  {
    const findings: string[] = [];
    let score = 10;
    const usesSdk = pkg?.dependencies?.["@anthropic-ai/claude-agent-sdk"] || pkg?.devDependencies?.["@anthropic-ai/claude-agent-sdk"] || pkg?.dependencies?.["claude-agent-sdk"];
    const usesClaudeP = ((): boolean => {
      try {
        const workflows = dirContents(".github/workflows");
        return workflows.some(wf => {
          const c = readFile(`.github/workflows/${wf}`);
          return c && /claude\s+-p|claude-code\s+-p/.test(c);
        });
      } catch { return false; }
    })();
    if (usesSdk) findings.push(`Uses Agent SDK: ${usesSdk}`);
    if (usesClaudeP) findings.push("Uses `claude -p` in CI (cost-safety hook recommended)");
    if (!usesSdk && !usesClaudeP) {
      findings.push("No programmatic Claude usage detected");
      score = 10; // N/A = full score
    } else {
      const hooksStr = JSON.stringify(anySettings.hooks || {});
      if (usesClaudeP && !hooksStr.includes("bulk") && !hooksStr.includes("cost")) {
        score -= 3;
        findings.push("claude -p used without cost-safety hooks");
        add("high", "agent-sdk", "Add cost-safety hooks for projects using claude -p in CI (bulk call guard >10, agent spawn >5)");
      }
    }
    scores["agent-sdk"] = { score: Math.max(0, score), weight: 0.5, findings };
  }

  // =====================================================================
  // 13. OPTIMIZATIONS (prompt cache, context hygiene)
  // =====================================================================
  {
    const findings: string[] = [];
    let score = 10;
    const env = anySettings.env || {};
    if (env.ENABLE_PROMPT_CACHING_1H) findings.push("ENABLE_PROMPT_CACHING_1H enabled");
    else {
      findings.push("ENABLE_PROMPT_CACHING_1H not set (5-min cache by default)");
      add("low", "optimizations", "Consider ENABLE_PROMPT_CACHING_1H=1 for long sessions (up to 10x cheaper)");
    }
    const claudeMd = readFile(".claude/CLAUDE.md") || readFile("CLAUDE.md") || "";
    if (claudeMd.length > 15000) {
      score -= 2;
      findings.push(`CLAUDE.md is large (${claudeMd.length} chars) — hurts cache + every turn cost`);
      add("medium", "optimizations", "Trim CLAUDE.md below 10k chars; move non-critical content to .claude/rules/*.md");
    }
    scores["optimizations"] = { score: Math.max(0, score), weight: 0.5, findings };
  }

  // =====================================================================
  // 14. CODE QUALITY (linter, typecheck, tests)
  // =====================================================================
  {
    const findings: string[] = [];
    let score = 10;
    if (isNode) {
      if (!fileExists("tsconfig.json") && !fileExists("jsconfig.json")) {
        score -= 3;
        findings.push("No tsconfig.json");
        add("high", "code-quality", "Add tsconfig.json with strict mode");
      } else if (fileExists("tsconfig.json")) {
        const ts = readFile("tsconfig.json") || "";
        if (!/"strict"\s*:\s*true/.test(ts)) {
          score -= 2;
          findings.push("TypeScript strict mode not enabled");
          add("medium", "code-quality", "Enable strict: true in tsconfig.json");
        } else findings.push("TypeScript strict mode enabled");
      }
      const linters = ["biome.json", "biome.jsonc", ".eslintrc.json", ".eslintrc.js", "eslint.config.js", "eslint.config.ts"];
      const hasLinter = linters.some(f => fileExists(f));
      if (!hasLinter) {
        score -= 2;
        findings.push("No linter configured");
        add("medium", "code-quality", "Add Biome (recommended) or ESLint for consistency");
      } else findings.push(`Linter: ${linters.find(f => fileExists(f))}`);
      const testDirs = ["test", "tests", "__tests__", "spec"];
      const hasTests = testDirs.some(d => fileExists(d)) || (pkg?.devDependencies?.vitest) || (pkg?.devDependencies?.jest);
      if (!hasTests) {
        score -= 2;
        findings.push("No test setup detected");
        add("medium", "code-quality", "Add Vitest (fast, modern) for unit/integration tests");
      } else findings.push("Test setup detected");
    }
    if (!fileExists(".gitignore")) {
      score -= 1;
      findings.push("No .gitignore");
    }
    scores["code-quality"] = { score: Math.max(0, score), weight: 1, findings };
  }

  // =====================================================================
  // 15. BUILDABILITY (weight 1.5x — Codelynx strategy #3)
  // CLAUDE.md must contain a build/check command CC can run to validate its output.
  // =====================================================================
  {
    const findings: string[] = [];
    let score = 0;
    const claudeMd = readFile(".claude/CLAUDE.md") || readFile("CLAUDE.md");
    const buildPatterns = [
      /bun run (check|build|typecheck|lint|test)/i,
      /npm run (check|build|typecheck|lint|test)/i,
      /pnpm (check|build|typecheck|lint|test)/i,
      /tsc --noEmit/i,
      /biome check/i,
      /eslint/i,
      /cargo (build|check|test)/i,
      /go build/i,
      /make (build|check|test)/i,
    ];
    if (!claudeMd) {
      findings.push("No CLAUDE.md — cannot determine build command");
      add("critical", "buildability", "Create CLAUDE.md with a build/typecheck command so CC can validate its output");
    } else {
      const hasBuildCmd = buildPatterns.some(p => p.test(claudeMd));
      if (hasBuildCmd) {
        score = 10;
        const match = buildPatterns.find(p => p.test(claudeMd));
        const found = claudeMd.match(match!)?.[ 0] ?? "build command";
        findings.push(`Build/check command found: "${found}"`);
      } else {
        score = 3;
        findings.push("No explicit build/typecheck command in CLAUDE.md — CC cannot self-validate");
        add("high", "buildability", "Add a build/check command to CLAUDE.md (e.g. `bun run check` or `bun run typecheck`). Without it CC cannot validate its own output.");
        if (pkg) {
          const scripts = Object.keys(pkg.scripts || {});
          const buildScripts = scripts.filter(s => /check|build|typecheck|lint/.test(s));
          if (buildScripts.length > 0) {
            findings.push(`Available scripts: ${buildScripts.map(s => `bun run ${s}`).join(", ")}`);
            add("medium", "buildability", `Add to CLAUDE.md: \`${buildScripts[0]}\` (detected in package.json)`);
          }
        }
      }
    }
    scores["buildability"] = { score, weight: 1.5, findings };
  }

  // =====================================================================
  // 16. MCP HYGIENE (weight 1x — Codelynx strategy #4)
  // Each MCP costs 5-10% context. CLI tools exist for common MCPs.
  // =====================================================================
  {
    const findings: string[] = [];
    let score = 10;
    // MCPs can live in ~/.claude.json (primary) OR ~/.claude/settings.json — check both
    const globalClaudeJson = safeJson<any>((() => {
      try { return readFileSync(join(homedir(), ".claude.json"), "utf-8"); } catch { return null; }
    })());
    const globalSettings = settings.global || {};
    const projectSettings = settings.project || settings.local || {};
    const globalMcpsFromJson = Object.keys(globalClaudeJson?.mcpServers || {});
    const globalMcpsFromSettings = Object.keys(globalSettings.mcpServers || {});
    const globalMcps = [...new Set([...globalMcpsFromJson, ...globalMcpsFromSettings])];
    const projectMcps = Object.keys(projectSettings.mcpServers || {});
    const totalMcps = new Set([...globalMcps, ...projectMcps]).size;

    findings.push(`Total active MCPs: ${totalMcps} (global: ${globalMcps.length}, project: ${projectMcps.length})`);

    if (totalMcps > 5) {
      score = 2;
      add("critical", "mcp-hygiene", `${totalMcps} MCPs active — each costs 5-10% context. Reduce to ≤2 aggressively.`);
    } else if (totalMcps > 3) {
      score = 5;
      add("high", "mcp-hygiene", `${totalMcps} MCPs active — each costs 5-10% context. Target: ≤2.`);
    } else if (totalMcps > 2) {
      score = 7;
      add("medium", "mcp-hygiene", "Reduce global MCPs to max 2 — each MCP costs 5-10% context for every project");
    }

    // Check for MCPs with CLI alternatives
    const cliAlternatives: Record<string, string> = {
      github: "`gh` CLI replaces github-mcp (faster, no context cost)",
      "github-mcp": "`gh` CLI replaces github-mcp",
      vercel: "`vercel` CLI replaces vercel-mcp",
      "vercel-mcp": "`vercel` CLI replaces vercel-mcp",
      neon: "`neon` CLI replaces neon-mcp",
      "neon-mcp": "`neon` CLI replaces neon-mcp",
      supabase: "`supabase` CLI replaces supabase-mcp",
      "supabase-mcp": "`supabase` CLI replaces supabase-mcp",
      postgres: "Direct DB tool or `psql` replaces postgres-mcp",
      filesystem: "Native CC tools (Read/Write/Edit/Glob) replace filesystem-mcp",
    };
    const allMcpNames = [...globalMcps, ...projectMcps].map(n => n.toLowerCase());
    for (const [name, alt] of Object.entries(cliAlternatives)) {
      if (allMcpNames.some(n => n.includes(name))) {
        score = Math.max(0, score - 1);
        findings.push(`CLI alternative available for ${name}: ${alt}`);
        add("medium", "mcp-hygiene", `Consider removing ${name} MCP — ${alt}`);
      }
    }

    scores["mcp-hygiene"] = { score: Math.max(0, score), weight: 1, findings };
  }

  // =====================================================================
  // OVERALL (weighted)
  // =====================================================================
  let totalScore = 0, totalWeight = 0;
  for (const [, v] of Object.entries(scores)) {
    totalScore += v.score * v.weight;
    totalWeight += v.weight;
  }
  const overall = Math.round((totalScore / totalWeight) * 10) / 10;

  const severityOrder: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  recs.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return {
    scores,
    overall,
    recommendations: recs,
    metadata: { ccVersion, auditedAt: new Date().toISOString(), project: projectName },
  };
}

const result = audit();
console.log(JSON.stringify(result, null, 2));
