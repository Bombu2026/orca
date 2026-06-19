#!/usr/bin/env bun

/**
 * plugin-hygiene.ts
 * Prunes low-value global Claude plugins while preserving plugin data.
 */

import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const installedPath = join(homedir(), ".claude", "plugins", "installed_plugins.json");

const defaultRemove = [
  "example-skills@anthropic-agent-skills",
  "frontend-design@claude-plugins-official",
  "github@claude-plugins-official",
  "rust-analyzer-lsp@claude-plugins-official",
  "telegram@claude-plugins-official",
];

const keep = [
  "context7@claude-plugins-official",
  "frontend-design@claude-code-plugins",
  "playwright@claude-plugins-official",
  "security-guidance@claude-plugins-official",
  "supabase@claude-plugins-official",
  "vercel@claude-plugins-official",
];

if (args.includes("--help")) {
  console.error("Usage: bun scripts/plugin-hygiene.ts [--apply]");
  process.exit(1);
}

if (!existsSync(installedPath)) {
  console.log("No Claude plugin registry found.");
  process.exit(0);
}

const installed = JSON.parse(readFileSync(installedPath, "utf-8"));
const plugins = installed.plugins || installed;
const installedNames = Object.keys(plugins || {});
const toRemove = defaultRemove.filter(name => installedNames.includes(name));

console.log("Plugin hygiene plan");
console.log(`- Installed : ${installedNames.length ? installedNames.join(", ") : "none"}`);
console.log(`- Keep      : ${keep.filter(name => installedNames.includes(name)).join(", ") || "none"}`);
console.log(`- Remove    : ${toRemove.join(", ") || "none"}`);

if (!apply) {
  console.log("\nDry run only. Re-run with --apply to uninstall removable plugins with --keep-data.");
  process.exit(0);
}

for (const plugin of toRemove) {
  const result = Bun.spawnSync([
    "claude",
    "plugin",
    "remove",
    plugin,
    "--scope",
    "user",
    "--keep-data",
    "-y",
  ]);

  if (result.exitCode !== 0) {
    console.error(result.stdout.toString());
    console.error(result.stderr.toString());
    process.exit(result.exitCode);
  }
  console.log(`Removed: ${plugin}`);
}
