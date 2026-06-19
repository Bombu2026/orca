#!/usr/bin/env bun

import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";

type Mode = "templates" | "generated" | "ecosystem" | "runtime" | "ship" | "all";
type Status = "ok" | "warn" | "fail";

interface Check {
  name: string;
  status: Status;
  detail?: string;
}

interface CliOptions {
  mode: Mode;
  root: string;
  project: string;
}

const TEXT_PATTERN = /\.(md|json|toml|txt|ts|js|sh|ya?ml)$/i;
const BAD_SHELL_PATTERN = /\b(jq|npx|bash -c)\b/;

function parseArgs(args: string[]): CliOptions {
  const mode = (args.find(arg => !arg.startsWith("--")) || "all") as Mode;
  if (!["templates", "generated", "ecosystem", "runtime", "ship", "all"].includes(mode)) {
    throw new Error(`Unknown mode: ${mode}`);
  }
  const root = resolve(args.find(arg => arg.startsWith("--root="))?.slice("--root=".length) || process.cwd());
  const project = resolve(args.find(arg => arg.startsWith("--project="))?.slice("--project=".length) || root);
  return { mode, root, project };
}

function check(name: string, passed: boolean, detail = ""): Check {
  return { name, status: passed ? "ok" : "fail", detail };
}

function warn(name: string, detail: string): Check {
  return { name, status: "warn", detail };
}

function read(path: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) files.push(...listFiles(path));
    else files.push(path);
  }
  return files;
}

function tomlNumber(content: string, key: string): number | null {
  const match = content.match(new RegExp(`^\\s*${key}\\s*=\\s*(\\d+)\\s*$`, "m"));
  return match ? Number(match[1]) : null;
}

function validateNoPlaceholders(project: string): Check[] {
  const unresolved = listFiles(project)
    .filter(file => TEXT_PATTERN.test(file))
    .flatMap(file => {
      const matches = read(file).match(/\{\{[A-Z0-9_]+\}\}/g) || [];
      return [...new Set(matches)].map(match => `${file.slice(project.length + 1)}: ${match}`);
    });
  return [check("generated: no unresolved placeholders", unresolved.length === 0, unresolved.slice(0, 8).join("; "))];
}

function validateTemplates(root: string): Check[] {
  const hookJson = listFiles(join(root, "templates", "hooks"))
    .filter(file => file.endsWith(".json"))
    .map(file => read(file))
    .join("\n");
  const claudeMdTemplates = listFiles(join(root, "templates", "claude-md"))
    .filter(file => file.endsWith(".md"));
  const claudeMdMissingRigor = claudeMdTemplates
    .filter(file => !read(file).includes("Accuracy over approval"))
    .map(file => file.slice(root.length + 1));
  return [
    check("templates: hook JSON avoids jq/npx/bash -c", !BAD_SHELL_PATTERN.test(hookJson)),
    check("templates: CLAUDE.md templates enforce response rigor", claudeMdMissingRigor.length === 0, claudeMdMissingRigor.join("; ")),
  ];
}

function validateGenerated(project: string): Check[] {
  if (!existsSync(project)) return [check("generated: project exists", false, project)];
  return [
    ...validateNoPlaceholders(project),
    check("generated: .claude/CLAUDE.md exists", existsSync(join(project, ".claude", "CLAUDE.md"))),
  ];
}

function validateEcosystem(root: string): Check[] {
  const skillLines = read(join(root, "SKILL.md")).split(/\r?\n/).length;
  return [
    skillLines <= 500
      ? check("ecosystem: SKILL.md line budget", true, `${skillLines} lines`)
      : warn("ecosystem: SKILL.md line budget", `${skillLines} lines; target is under 500`),
    check("ecosystem: memory-corrections exists", existsSync(join(root, "scripts", "memory-corrections.ts"))),
    check("ecosystem: loop-controller exists", existsSync(join(root, "scripts", "loop-controller.ts"))),
    check("ecosystem: rule-of-two exists", existsSync(join(root, "scripts", "lib", "rule-of-two.ts"))),
    check("ecosystem: Assistant CLAUDE.md enforces response rigor", read(join(root, ".claude", "CLAUDE.md")).includes("accuracy over approval")),
  ];
}

function validateRuntime(root: string): Check[] {
  const settings = read(join(root, ".claude", "settings.json")) || read(join(root, ".claude", "settings.local.json"));
  return [
    check("runtime: local hooks avoid stale shell deps", !BAD_SHELL_PATTERN.test(settings) && !settings.includes("session-digest.sh")),
    check("runtime: local hooks capture corrections via Bun", settings.includes("memory-corrections.ts capture")),
    check("runtime: local hooks run just-in-time recall", settings.includes("recall-auto.ts")),
  ];
}

function validateShip(project: string): Check[] {
  const proofPath = join(project, "SHIP_PROOF.json");
  if (!existsSync(proofPath)) return [warn("ship: SHIP_PROOF.json absent", "skip unless this is a ship gate")];
  try {
    const parsed = JSON.parse(read(proofPath)) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return [check("ship: SHIP_PROOF.json object", false)];
    }
    const object = parsed as Record<string, unknown>;
    const commands = Array.isArray(object.commands) ? object.commands : [];
    const commandIssues = commands.filter(item => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return true;
      const command = (item as Record<string, unknown>).command;
      const exitCode = (item as Record<string, unknown>).exitCode;
      return typeof command !== "string" || typeof exitCode !== "number" || exitCode !== 0;
    });
    return [
      check("ship: command proof exists", commands.length > 0),
      check("ship: all command proofs have exitCode 0", commandIssues.length === 0, `${commandIssues.length} issue(s)`),
    ];
  } catch (error) {
    return [check("ship: SHIP_PROOF.json parses", false, error instanceof Error ? error.message : String(error))];
  }
}

function collect(options: CliOptions): Check[] {
  if (options.mode === "templates") return validateTemplates(options.root);
  if (options.mode === "generated") return validateGenerated(options.project);
  if (options.mode === "ecosystem") return validateEcosystem(options.root);
  if (options.mode === "runtime") return validateRuntime(options.root);
  if (options.mode === "ship") return validateShip(options.project);
  return [
    ...validateTemplates(options.root),
    ...validateEcosystem(options.root),
    ...validateRuntime(options.root),
    ...validateShip(options.project),
  ];
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const checks = collect(options);
  const failed = checks.filter(item => item.status === "fail");
  const warned = checks.filter(item => item.status === "warn");
  console.log(JSON.stringify({
    ok: failed.length === 0,
    mode: options.mode,
    passed: checks.filter(item => item.status === "ok").length,
    warnings: warned.length,
    failed: failed.length,
    checks,
  }, null, 2));
  process.exit(failed.length === 0 ? 0 : 1);
}

main();
