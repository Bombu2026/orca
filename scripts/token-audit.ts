#!/usr/bin/env bun

/**
 * token-audit.ts
 * Diagnose Claude Code token consumption — global + per-project.
 * Output: structured report identifying context overhead offenders + usage spikes.
 *
 * Usage:
 *   bun scripts/token-audit.ts               # global audit (home + all Desktop projects)
 *   bun scripts/token-audit.ts <project>     # audit single project + global
 */

import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { execSync } from "child_process";

const HOME = homedir();
const CLAUDE_HOME = join(HOME, ".claude");
const DESKTOP = join(HOME, "Desktop");

// Approximation: 1 token ~ 4 bytes of English text (reasonable for markdown/code)
const TOKENS_PER_BYTE = 0.25;

function toTokens(bytes: number): number {
  return Math.round(bytes * TOKENS_PER_BYTE);
}

function size(path: string): number {
  try { return statSync(path).size; } catch { return 0; }
}

function readJson<T = any>(path: string): T | null {
  try { return JSON.parse(readFileSync(path, "utf-8")); } catch { return null; }
}

function listDir(path: string): string[] {
  try { return readdirSync(path); } catch { return []; }
}

interface Offender {
  kind: "claude-md" | "mcp" | "plugin" | "skill" | "settings" | "secret";
  path: string;
  bytes: number;
  tokens: number;
  severity: "critical" | "high" | "medium" | "low";
  note?: string;
}

const offenders: Offender[] = [];

// =============================================================================
// 1. Global context overhead
// =============================================================================

function auditGlobal() {
  const globalClaudeMd = join(CLAUDE_HOME, "CLAUDE.md");
  if (existsSync(globalClaudeMd)) {
    const b = size(globalClaudeMd);
    offenders.push({
      kind: "claude-md",
      path: "~/.claude/CLAUDE.md",
      bytes: b,
      tokens: toTokens(b),
      severity: b > 8000 ? "high" : b > 4000 ? "medium" : "low",
      note: "loaded in EVERY session, every project",
    });
  }

  // MCP globaux via ~/.claude.json
  const claudeConfig = readJson(join(HOME, ".claude.json"));
  if (claudeConfig?.mcpServers) {
    const mcps = Object.keys(claudeConfig.mcpServers);
    const count = mcps.length;
    offenders.push({
      kind: "mcp",
      path: "~/.claude.json mcpServers",
      bytes: 0,
      tokens: count * 2000, // each MCP ~1500-3000 tokens of tool defs
      severity: count > 2 ? "critical" : count === 2 ? "medium" : "low",
      note: `${count} MCP globaux: ${mcps.join(", ")} — Melvynx rule: max 2`,
    });

    const secretPattern = /(authorization|bearer\s+[a-z0-9._-]+|api[_-]?key|secret|token|ghp_[a-z0-9_]+|ctx7sk-[a-z0-9-]+)/i;
    const inlineSecrets = Object.entries(claudeConfig.mcpServers)
      .filter(([, cfg]) => secretPattern.test(JSON.stringify(cfg)))
      .map(([name]) => name);
    if (inlineSecrets.length > 0) {
      offenders.push({
        kind: "secret",
        path: "~/.claude.json mcpServers",
        bytes: 0,
        tokens: 1,
        severity: "critical",
        note: `Inline credentials detected for MCP(s): ${inlineSecrets.join(", ")}. Values redacted; rotate them and move to env/keychain.`,
      });
    }
  }

  // Plugins installés
  const pluginsFile = join(CLAUDE_HOME, "plugins", "installed_plugins.json");
  const plugins = readJson(pluginsFile);
  if (plugins?.plugins) {
    const names = Object.keys(plugins.plugins);
    offenders.push({
      kind: "plugin",
      path: "~/.claude/plugins",
      bytes: 0,
      tokens: names.length * 1000, // rough: plugin skills+commands loaded at startup
      severity: names.length > 4 ? "high" : names.length > 2 ? "medium" : "low",
      note: `${names.length} plugins: ${names.join(", ")}`,
    });
  }

  // Skills globaux
  const skills = listDir(join(CLAUDE_HOME, "skills"));
  if (skills.length) {
    let totalBytes = 0;
    for (const s of skills) {
      const skillMd = join(CLAUDE_HOME, "skills", s, "SKILL.md");
      totalBytes += size(skillMd);
    }
    offenders.push({
      kind: "skill",
      path: "~/.claude/skills",
      bytes: totalBytes,
      tokens: toTokens(totalBytes),
      severity: skills.length > 15 ? "high" : "low",
      note: `${skills.length} skills (only frontmatter loaded upfront, bodies on-demand)`,
    });
  }
}

// =============================================================================
// 2. Per-project CLAUDE.md audit (Desktop projects)
// =============================================================================

function auditProjects() {
  const projects = listDir(DESKTOP).filter(p => {
    const full = join(DESKTOP, p);
    try { return statSync(full).isDirectory(); } catch { return false; }
  });

  for (const p of projects) {
    const full = join(DESKTOP, p);
    // Check both locations
    const locations = [
      join(full, "CLAUDE.md"),
      join(full, ".claude", "CLAUDE.md"),
    ];
    for (const loc of locations) {
      const b = size(loc);
      if (b < 100) continue; // skip empty/placeholder
      const rel = loc.replace(HOME, "~");
      offenders.push({
        kind: "claude-md",
        path: rel,
        bytes: b,
        tokens: toTokens(b),
        severity: b > 15000 ? "critical" : b > 8000 ? "high" : b > 4000 ? "medium" : "low",
        note: b > 15000 ? "reloaded EVERY turn — split into .claude/rules/*.md" : undefined,
      });
    }

    // Project MCP
    const projectMcp = readJson(join(full, ".mcp.json"));
    if (projectMcp?.mcpServers) {
      const count = Object.keys(projectMcp.mcpServers).length;
      offenders.push({
        kind: "mcp",
        path: `~/Desktop/${p}/.mcp.json`,
        bytes: 0,
        tokens: count * 2000,
        severity: count > 2 ? "high" : "low",
        note: `${count} project MCP: ${Object.keys(projectMcp.mcpServers).join(", ")}`,
      });
    }
  }
}

// =============================================================================
// 3. Usage spike detection via ccusage
// =============================================================================

interface UsageDay {
  date: string;
  tokens: number;
  cost: number;
}

function getUsage(): UsageDay[] {
  try {
    const out = execSync("bunx ccusage daily --json 2>&1", { encoding: "utf-8", timeout: 60000 });
    // ccusage JSON format: { daily: [ { date, totalTokens, totalCost, ... } ] }
    const json = JSON.parse(out);
    const days = json.daily || json || [];
    return days.slice(-7).map((d: any) => ({
      date: d.date || d.day || "?",
      tokens: d.totalTokens || d.total_tokens || 0,
      cost: d.totalCost || d.total_cost || 0,
    }));
  } catch {
    return [];
  }
}

// =============================================================================
// 4. Report
// =============================================================================

function report() {
  auditGlobal();
  auditProjects();

  const usage = getUsage();

  // Sort offenders by tokens desc
  offenders.sort((a, b) => b.tokens - a.tokens);

  const totalOverhead = offenders.reduce((s, o) => s + o.tokens, 0);
  const critical = offenders.filter(o => o.severity === "critical");
  const high = offenders.filter(o => o.severity === "high");

  console.log("=".repeat(70));
  console.log("TOKEN AUDIT — Claude Code context overhead + usage");
  console.log("=".repeat(70));

  if (usage.length) {
    console.log("\n## Usage (last 7 days via ccusage)\n");
    let totalCost = 0;
    let totalTok = 0;
    for (const d of usage) {
      totalCost += d.cost;
      totalTok += d.tokens;
      const bar = "#".repeat(Math.min(50, Math.round(d.cost / 10)));
      console.log(`  ${d.date}  $${d.cost.toFixed(2).padStart(8)}  ${(d.tokens / 1e6).toFixed(1)}M tok  ${bar}`);
    }
    console.log(`\n  TOTAL 7d: $${totalCost.toFixed(2)} / ${(totalTok / 1e9).toFixed(2)}B tokens`);
    console.log(`  Average: $${(totalCost / 7).toFixed(2)} / day`);
  } else {
    console.log("\n## Usage: ccusage unavailable (install: bunx ccusage)");
  }

  console.log(`\n## Context overhead (tokens loaded BEFORE your first message)\n`);
  console.log(`  Estimated total: ~${totalOverhead.toLocaleString()} tokens per session`);
  console.log(`  Critical issues: ${critical.length}`);
  console.log(`  High issues:     ${high.length}`);

  console.log("\n## Top offenders (by token weight)\n");
  for (const o of offenders.slice(0, 15)) {
    const badge = {
      critical: "[CRIT]",
      high: "[HIGH]",
      medium: "[MED ]",
      low: "[LOW ]",
    }[o.severity];
    const tok = o.tokens.toLocaleString().padStart(8);
    console.log(`  ${badge}  ${tok} tok  ${o.path}`);
    if (o.note) console.log(`          └─ ${o.note}`);
  }

  const secretFindings = offenders.filter(o => o.kind === "secret");
  if (secretFindings.length > 0) {
    console.log("\n## Security warnings\n");
    for (const o of secretFindings) {
      console.log(`  [CRIT] ${o.path}`);
      if (o.note) console.log(`         ${o.note}`);
    }
  }

  console.log("\n## Reduction plan\n");
  const plan: string[] = [];

  for (const o of critical) {
    if (o.kind === "claude-md") {
      plan.push(`Split ${o.path} into .claude/rules/*.md modulaire (save ~${Math.round(o.tokens * 0.7)} tok/turn)`);
    }
    if (o.kind === "mcp") {
      plan.push(`Reduce ${o.path} to max 2 MCP (save ~${Math.round(o.tokens * 0.4)} tok/session)`);
    }
  }
  for (const o of high) {
    if (o.kind === "claude-md") {
      plan.push(`Trim ${o.path} — aim for <4KB (save ~${Math.round(o.tokens * 0.5)} tok/turn)`);
    }
    if (o.kind === "plugin") {
      plan.push(`Review ${o.path} — remove unused plugins via 'claude plugin remove <name>'`);
    }
  }

  if (plan.length === 0) {
    console.log("  No critical issues detected — token hygiene OK.");
  } else {
    plan.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
  }

  console.log("\n## General recommendations\n");
  console.log("  - Use 'opusplan' mode: Opus plans, Sonnet executes (~60% save on complex tasks)");
  console.log("  - Run 'bunx ccusage blocks --live' to monitor real-time consumption");
  console.log("  - Prefer CLI over MCP when both exist (gh > github-mcp, neon CLI > neon-mcp)");
  console.log("  - Disable auto-compact on long sessions (it re-summarizes = expensive)");
  console.log("  - Use Explore agent (Haiku) for code search instead of main-thread Grep");
  console.log("  - Add PostToolUse hook with duration_ms to profile slow tools (v2.1.119+):");
  console.log(`    ${JSON.stringify({
    event: "PostToolUse",
    async: true,
    config: {
      type: "command",
      command: "jq -r '[.tool_name,.duration_ms] | @tsv' >> ~/.claude/tool-latency.log",
    },
  })}`);

  console.log("\n" + "=".repeat(70));
}

report();
