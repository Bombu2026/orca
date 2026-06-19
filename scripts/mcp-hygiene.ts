#!/usr/bin/env bun

/**
 * mcp-hygiene.ts
 * Safely audits or prunes global Claude MCP servers from ~/.claude.json.
 *
 * Each global MCP costs ~5-10% of context on EVERY session, so only the memory
 * backbone belongs global. Default policy keeps `mcpvault` (the Obsidian memory
 * system, loaded at every session start per the user's protocol). Domain MCPs
 * (design, legal, open-data, etc.) should be re-added project-by-project via a
 * project-level `.mcp.json` when a project genuinely needs them.
 *
 * `mcpvault` is force-protected: it can never be auto-removed, even if omitted
 * from --keep, because losing it breaks the persistent memory protocol.
 */

import { copyFileSync, existsSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

type ClaudeConfig = {
  mcpServers?: Record<string, unknown>;
  [key: string]: unknown;
};

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const keepArg = args.find(arg => arg.startsWith("--keep="));
// Core MCPs that belong global and must NEVER be auto-removed (memory backbone).
const CORE_PROTECTED = ["mcpvault"];
const keep = new Set([
  ...CORE_PROTECTED,
  ...(keepArg?.slice("--keep=".length) || "")
    .split(",")
    .map(name => name.trim())
    .filter(Boolean),
]);
const configPath = join(homedir(), ".claude.json");

function usage(): never {
  console.error("Usage: bun scripts/mcp-hygiene.ts [--apply] [--keep=pencil,context7]");
  process.exit(1);
}

if (args.includes("--help")) usage();

if (!existsSync(configPath)) {
  console.log("No ~/.claude.json found.");
  process.exit(0);
}

let config: ClaudeConfig;
try {
  config = JSON.parse(readFileSync(configPath, "utf-8"));
} catch (error: any) {
  console.error(`Could not parse ~/.claude.json: ${error.message}`);
  process.exit(1);
}

const mcpServers = config.mcpServers || {};
const names = Object.keys(mcpServers);
const secretPattern = /(authorization|bearer\s+[a-z0-9._-]+|api[_-]?key|secret|token|ghp_[a-z0-9_]+|ctx7sk-[a-z0-9-]+)/i;
const secretBearing = names.filter(name => secretPattern.test(JSON.stringify(mcpServers[name])));
const kept = names.filter(name => keep.has(name));
const removed = names.filter(name => !keep.has(name));

console.log("MCP hygiene plan");
console.log(`- Active MCPs : ${names.length ? names.join(", ") : "none"}`);
console.log(`- Keep        : ${kept.length ? kept.join(", ") : "none"}  (protected: ${CORE_PROTECTED.join(", ")})`);
console.log(`- Remove      : ${removed.length ? removed.join(", ") : "none"}  (→ re-add project-scoped via .mcp.json when needed)`);
if (secretBearing.length > 0) {
  console.log(`- Inline credentials detected: ${secretBearing.join(", ")} (values redacted)`);
}

if (!apply) {
  console.log("\nDry run only. Re-run with --apply to write ~/.claude.json after backup.");
  process.exit(0);
}

const nextServers: Record<string, unknown> = {};
for (const name of kept) {
  nextServers[name] = mcpServers[name];
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = `${configPath}.backup-${timestamp}`;
copyFileSync(configPath, backupPath);

const nextConfig = { ...config, mcpServers: nextServers };
writeFileSync(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`);

console.log(`\nApplied. Backup written: ${backupPath}`);
console.log(`Global MCPs now: ${Object.keys(nextServers).join(", ") || "none"}`);
if (secretBearing.some(name => keep.has(name))) {
  console.log("Warning: at least one kept MCP still contains inline credentials. Rotate and move to env/keychain.");
}
