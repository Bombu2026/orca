#!/usr/bin/env bun

/**
 * tests/install-toolkit.ts — smoke for strategy-select + install-toolkit.
 *
 * Verifies the broken-library-path regression cannot return: strategy-select
 * must find real skills, install-toolkit must materialize SKILL.md and agent
 * files in the target project's .claude/ folder.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "fs";
import { join } from "path";

const ROOT = import.meta.dir.slice(0, import.meta.dir.lastIndexOf("/")); // repo root, portable
const TMP = "/tmp/assistant-install-toolkit-smoke";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

function run(args: string[]): { stdout: string; stderr: string; status: number } {
  const result = Bun.spawnSync(args, { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  return {
    stdout: new TextDecoder().decode(result.stdout),
    stderr: new TextDecoder().decode(result.stderr),
    status: result.exitCode ?? 1,
  };
}

// 1. strategy-select must return >0 skill candidates for a typical project.
const strategyOut = run([
  "bun", "scripts/strategy-select.ts",
  "nextjs react design frontend security tailwind",
  "--type=web-fullstack",
  "--limit=10",
  "--json",
]);
assert(strategyOut.status === 0, `strategy-select failed: ${strategyOut.stderr.slice(0, 500)}`);
const parsed = JSON.parse(strategyOut.stdout);
assert(parsed.grouped?.skills?.length > 0, "strategy-select returned 0 skills — library path likely broken");
console.log(`OK strategy-select returned ${parsed.grouped.skills.length} skills`);

// 2. install-toolkit must materialize skills + agents in the target project.
if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

const installOut = run([
  "bun", "scripts/install-toolkit.ts", TMP,
  "--keywords=nextjs react design frontend security tailwind",
  "--type=web-fullstack",
  "--skills=top:3",
  "--agents=top:3",
]);
assert(installOut.status === 0, `install-toolkit failed: ${installOut.stderr.slice(0, 500)}`);

const receipt = join(TMP, ".claude/TOOLKIT_INSTALLED.json");
assert(existsSync(receipt), `receipt missing: ${receipt}`);
const receiptData = JSON.parse(readFileSync(receipt, "utf-8"));
assert(receiptData.installed.skills.length >= 3, `expected >=3 skills installed, got ${receiptData.installed.skills.length}`);
assert(receiptData.installed.agents.length >= 1, `expected >=1 agents installed, got ${receiptData.installed.agents.length}`);

// 3. Each installed skill must have a real SKILL.md file.
for (const skill of receiptData.installed.skills) {
  const skillMd = skill.target;
  assert(existsSync(skillMd), `installed skill missing on disk: ${skillMd}`);
  const content = readFileSync(skillMd, "utf-8");
  assert(content.length > 100, `installed SKILL.md is suspiciously empty: ${skillMd}`);
}
console.log(`OK ${receiptData.installed.skills.length} skills installed with real SKILL.md content`);

// 4. Each installed agent must contain `model: claude-opus-4-8` (forced).
for (const agent of receiptData.installed.agents) {
  const agentPath = agent.target;
  assert(existsSync(agentPath), `installed agent missing on disk: ${agentPath}`);
  const content = readFileSync(agentPath, "utf-8");
  assert(/model:\s*claude-opus-4-8/.test(content), `agent missing forced opus model: ${agentPath}`);
}
console.log(`OK ${receiptData.installed.agents.length} agents installed with forced opus model`);

// Cleanup
rmSync(TMP, { recursive: true, force: true });

console.log("PASS install-toolkit smoke");
