#!/usr/bin/env bun

/**
 * clean.ts
 * Diagnose + clean background processes that weigh on the system:
 *  - heavy user processes (CC sessions, MCP, bun/node) sorted by RSS
 *  - orphan MCP servers (parent CC session dead)
 *  - orphan task locks in ~/.claude/tasks/
 *  - non-system launchd agents currently loaded
 *
 * Default: dry-run (report only). Pass `--kill` to act.
 * Pass `--yes` to skip per-category confirmation when running with --kill.
 *
 * Usage:
 *   bun scripts/clean.ts                    # diagnose
 *   bun scripts/clean.ts --kill             # interactive clean
 *   bun scripts/clean.ts --kill --yes       # non-interactive (CI/scripts)
 *   bun scripts/clean.ts --kill --skip-launchd  # don't touch launchd agents
 */

import { execSync } from "child_process";
import { existsSync, readdirSync, statSync, unlinkSync } from "fs";
import { homedir } from "os";
import { join, dirname, basename } from "path";
import { createInterface } from "readline";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GRAY = "\x1b[90m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

const DO_KILL = process.argv.includes("--kill");
const AUTO_YES = process.argv.includes("--yes");
const SKIP_LAUNCHD = process.argv.includes("--skip-launchd");

function sh(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
}

function section(title: string) {
  console.log(`\n${BOLD}${title}${RESET}`);
}

async function confirm(prompt: string): Promise<boolean> {
  if (AUTO_YES) return true;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${prompt} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

// ---------- Processes ----------

type Proc = {
  pid: number;
  ppid: number;
  cpu: number;
  rssMB: number;
  etime: string;
  command: string;
};

function listProcs(): Proc[] {
  // ps output: pid ppid %cpu rss etime command (rss in KB on macOS)
  // macOS ps: %cpu uses locale decimal separator — accept , or .
  const raw = sh("ps -axo pid=,ppid=,%cpu=,rss=,etime=,command=");
  return raw
    .trim()
    .split("\n")
    .map((line) => {
      const m = line.trim().match(/^(\d+)\s+(\d+)\s+([\d.,]+)\s+(\d+)\s+(\S+)\s+(.+)$/);
      // 6 groupes capturants : si m existe, m[1..6] sont garantis présents.
      const [, pid, ppid, cpu, rss, etime, command] = m ?? [];
      if (
        pid === undefined ||
        ppid === undefined ||
        cpu === undefined ||
        rss === undefined ||
        etime === undefined ||
        command === undefined
      ) {
        return null;
      }
      return {
        pid: Number(pid),
        ppid: Number(ppid),
        cpu: Number(cpu.replace(",", ".")),
        rssMB: Number(rss) / 1024,
        etime,
        command,
      } as Proc;
    })
    .filter((p): p is Proc => p !== null);
}

function isClaudeSession(cmd: string): string | null {
  const m = cmd.match(/claude --session-id ([0-9a-f-]+)/);
  return m?.[1] ?? null;
}

function shortCmd(cmd: string, width = 90): string {
  // strip huge --settings JSON + PATH env dumps that pollute process lines
  const stripped = cmd
    .replace(/--settings\s+\{.*?\}(\s|$)/, "--settings {...} ")
    .replace(/\sHOME=.*$/, "")
    .replace(/\sPATH=.*$/, "")
    .trim();
  return stripped.length > width ? stripped.slice(0, width - 1) + "…" : stripped;
}

// ---------- Diagnostic sections ----------

function reportHeavyProcs(procs: Proc[]) {
  section("Heavy processes (RSS > 300 MB)");
  const heavy = procs
    .filter((p) => p.rssMB > 300 && p.command !== "")
    .sort((a, b) => b.rssMB - a.rssMB)
    .slice(0, 15);
  if (heavy.length === 0) {
    console.log(`  ${GREEN}none${RESET}`);
    return;
  }
  console.log(`  ${GRAY}PID     RSS(MB)  CPU%   ETIME     COMMAND${RESET}`);
  for (const p of heavy) {
    const color = p.rssMB > 1000 ? RED : p.rssMB > 500 ? YELLOW : RESET;
    console.log(
      `  ${String(p.pid).padEnd(7)} ${color}${p.rssMB.toFixed(0).padStart(6)}${RESET}  ${p.cpu.toFixed(1).padStart(4)}  ${p.etime.padEnd(9)} ${shortCmd(p.command)}`,
    );
  }
}

function findOrphanMcps(procs: Proc[]): Proc[] {
  const aliveSessions = new Set(
    procs.map((p) => isClaudeSession(p.command)).filter((s): s is string => s !== null),
  );
  const mcpProcs = procs.filter(
    (p) =>
      /mcp(-server)?[^a-z]?|@upstash\/context7|@playwright\/mcp|@21st-dev\/magic|pencil\/mcp/i.test(
        p.command,
      ) && p.command !== "",
  );
  // Orphan = ppid's claude session no longer alive, or ppid is init (1) without any claude parent chain
  const orphans: Proc[] = [];
  const procByPid = new Map(procs.map((p) => [p.pid, p]));
  for (const mcp of mcpProcs) {
    let current = procByPid.get(mcp.ppid);
    let foundClaude = false;
    let depth = 0;
    while (current && depth < 10) {
      const sid = isClaudeSession(current.command);
      if (sid && aliveSessions.has(sid)) {
        foundClaude = true;
        break;
      }
      current = procByPid.get(current.ppid);
      depth++;
    }
    if (!foundClaude) orphans.push(mcp);
  }
  return orphans;
}

function reportOrphanMcps(procs: Proc[]): Proc[] {
  section("Orphan MCP servers (no live CC parent)");
  const orphans = findOrphanMcps(procs);
  if (orphans.length === 0) {
    console.log(`  ${GREEN}none${RESET}`);
    return [];
  }
  console.log(`  ${GRAY}PID     PPID    RSS(MB)  COMMAND${RESET}`);
  for (const o of orphans) {
    console.log(
      `  ${String(o.pid).padEnd(7)} ${String(o.ppid).padEnd(7)} ${o.rssMB.toFixed(0).padStart(6)}   ${shortCmd(o.command, 80)}`,
    );
  }
  return orphans;
}

function reportTaskLocks(procs: Proc[]): string[] {
  section("Orphan task locks in ~/.claude/tasks/");
  const tasksDir = join(homedir(), ".claude", "tasks");
  if (!existsSync(tasksDir)) {
    console.log(`  ${GRAY}dir missing${RESET}`);
    return [];
  }
  const aliveSessions = new Set(
    procs.map((p) => isClaudeSession(p.command)).filter((s): s is string => s !== null),
  );
  const orphans: string[] = [];
  let kept = 0;
  for (const entry of readdirSync(tasksDir)) {
    const lock = join(tasksDir, entry, ".lock");
    if (!existsSync(lock)) continue;
    if (aliveSessions.has(entry)) {
      kept++;
    } else {
      orphans.push(lock);
    }
  }
  console.log(`  orphans: ${orphans.length > 0 ? `${RED}${orphans.length}${RESET}` : `${GREEN}0${RESET}`}  |  active: ${GREEN}${kept}${RESET}`);
  return orphans;
}

function reportLaunchdAgents(): string[] {
  section("Non-system launchd agents currently loaded");
  const list = sh("launchctl list");
  const entries = list
    .split("\n")
    .slice(1) // skip header
    .map((l) => l.trim().split(/\s+/))
    .filter((parts) => parts.length >= 3)
    .map((parts) => ({ pid: parts[0] ?? "", status: parts[1] ?? "", label: parts[2] ?? "" }))
    .filter(
      (j) =>
        !j.label.startsWith("com.apple.") &&
        !j.label.startsWith("application.com.apple.") &&
        !j.label.startsWith("0x") &&
        j.label.length > 0,
    );
  if (entries.length === 0) {
    console.log(`  ${GREEN}none${RESET}`);
    return [];
  }
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const e of entries) {
    if (seen.has(e.label)) continue;
    seen.add(e.label);
    labels.push(e.label);
    const running = e.pid !== "-";
    const flag = running ? `${GREEN}running${RESET}` : `${GRAY}idle${RESET}`;
    console.log(`  ${flag}  ${e.label}`);
  }
  return labels;
}

function reportMemory() {
  section("Memory + swap");
  const vm = sh("vm_stat");
  const pageSize = 16384;
  const free = Number(vm.match(/Pages free:\s+(\d+)/)?.[1] ?? 0) * pageSize;
  const active = Number(vm.match(/Pages active:\s+(\d+)/)?.[1] ?? 0) * pageSize;
  const inactive = Number(vm.match(/Pages inactive:\s+(\d+)/)?.[1] ?? 0) * pageSize;
  const wired = Number(vm.match(/Pages wired down:\s+(\d+)/)?.[1] ?? 0) * pageSize;
  const mb = (b: number) => (b / 1024 / 1024).toFixed(0);
  console.log(`  ${GRAY}free:${RESET} ${mb(free)} MB   ${GRAY}active:${RESET} ${mb(active)} MB   ${GRAY}inactive:${RESET} ${mb(inactive)} MB   ${GRAY}wired:${RESET} ${mb(wired)} MB`);
  const swap = sh("sysctl -n vm.swapusage").trim();
  console.log(`  ${GRAY}swap :${RESET} ${swap}`);
}

// ---------- Actions ----------

function killPids(pids: number[]): number {
  let killed = 0;
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
      killed++;
    } catch {
      // already dead
    }
  }
  return killed;
}

function unlinkFiles(files: string[]): number {
  let removed = 0;
  for (const f of files) {
    try {
      unlinkSync(f);
      removed++;
    } catch {
      // already gone
    }
  }
  return removed;
}

// ---------- Main ----------

async function main() {
  console.log(`${BOLD}ORCA clean${RESET}  ${GRAY}(${DO_KILL ? "kill mode" : "dry-run"})${RESET}`);

  const procs = listProcs();

  reportHeavyProcs(procs);
  const orphanMcps = reportOrphanMcps(procs);
  const orphanLocks = reportTaskLocks(procs);
  const launchdLabels = SKIP_LAUNCHD ? [] : reportLaunchdAgents();
  reportMemory();

  if (!DO_KILL) {
    console.log(`\n${GRAY}Dry-run. Re-run with ${BOLD}--kill${RESET}${GRAY} to act.${RESET}`);
    return;
  }

  console.log(`\n${BOLD}Actions${RESET}`);

  if (orphanMcps.length > 0 && (await confirm(`Kill ${orphanMcps.length} orphan MCP processes?`))) {
    const killed = killPids(orphanMcps.map((o) => o.pid));
    console.log(`  ${GREEN}killed ${killed}/${orphanMcps.length} MCP processes${RESET}`);
  }

  if (orphanLocks.length > 0 && (await confirm(`Remove ${orphanLocks.length} orphan task locks?`))) {
    const removed = unlinkFiles(orphanLocks);
    console.log(`  ${GREEN}removed ${removed}/${orphanLocks.length} locks${RESET}`);
  }

  if (launchdLabels.length > 0) {
    console.log(`\n  ${YELLOW}Launchd agents are reviewed but NOT auto-unloaded.${RESET}`);
    console.log(`  ${GRAY}Unload manually: launchctl unload ~/Library/LaunchAgents/<label>.plist${RESET}`);
  }

  console.log(`\n${GREEN}done${RESET}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
