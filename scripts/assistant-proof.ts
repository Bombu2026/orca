#!/usr/bin/env bun

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import { basename, join, relative, resolve } from "path";

type Status = "present" | "missing" | "invalid";
type RiskSeverity = "critical" | "high" | "medium" | "low";

interface CliOptions {
  projectDir: string;
  write: boolean;
}

interface FileProbe {
  path: string;
  status: Status;
  sizeBytes?: number;
  lines?: number;
}

interface DirectoryProbe {
  path: string;
  status: Status;
  count: number;
  entries: string[];
}

interface HookProbe {
  source: string;
  status: Status;
  events: string[];
  issue?: string;
}

interface CheckProbe {
  command: string;
  source: string;
  confidence: "high" | "medium";
}

interface Risk {
  severity: RiskSeverity;
  area: string;
  message: string;
}

interface AssistantProof {
  schemaVersion: 1;
  generatedAt: string;
  project: {
    path: string;
    name: string;
    exists: boolean;
    gitRequired: false;
  };
  assistantFiles: {
    claudeInstructions: FileProbe;
    rootClaudeInstructions: FileProbe;
    reviewRules: FileProbe;
    settings: FileProbe[];
  };
  hooks: {
    claude: HookProbe[];
  };
  memory: {
    directories: DirectoryProbe[];
    files: FileProbe[];
  };
  agents: {
    claude: DirectoryProbe;
  };
  checks: {
    detected: CheckProbe[];
    missing: string[];
  };
  risks: Risk[];
  summary: {
    ok: boolean;
    presentFiles: number;
    missingFiles: number;
    riskCount: number;
    highestRisk: RiskSeverity | null;
  };
}

const EXPECTED_CHECK_NAMES = ["lint", "typecheck", "test", "build"];
const RISK_ORDER: Record<RiskSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function parseArgs(args: string[]): CliOptions {
  let write = false;
  let target: string | null = null;

  for (const arg of args) {
    if (arg === "--write") {
      write = true;
      continue;
    }

    if (arg.startsWith("--project=")) {
      target = arg.slice("--project=".length);
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`unknown option: ${arg}`);
    }

    if (target) {
      throw new Error(`unexpected argument: ${arg}`);
    }
    target = arg;
  }

  return {
    projectDir: resolve(target ?? process.cwd()),
    write,
  };
}

function readText(path: string): string | null {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

function fileProbe(projectDir: string, path: string): FileProbe {
  const fullPath = join(projectDir, path);
  if (!existsSync(fullPath)) return { path, status: "missing" };
  try {
    const stat = statSync(fullPath);
    if (!stat.isFile()) return { path, status: "invalid" };
    const text = readText(fullPath);
    return {
      path,
      status: "present",
      sizeBytes: stat.size,
      lines: text ? text.split(/\r?\n/).length : undefined,
    };
  } catch {
    return { path, status: "invalid" };
  }
}

function directoryProbe(projectDir: string, path: string, pattern?: RegExp): DirectoryProbe {
  const fullPath = join(projectDir, path);
  if (!existsSync(fullPath)) return { path, status: "missing", count: 0, entries: [] };
  try {
    const stat = statSync(fullPath);
    if (!stat.isDirectory()) return { path, status: "invalid", count: 0, entries: [] };
    const entries = readdirSync(fullPath)
      .filter(entry => !entry.startsWith("."))
      .filter(entry => !pattern || pattern.test(entry))
      .sort();
    return { path, status: "present", count: entries.length, entries };
  } catch {
    return { path, status: "invalid", count: 0, entries: [] };
  }
}

function parseJsonObject(path: string): Record<string, unknown> | null {
  const text = readText(path);
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function detectClaudeHooks(projectDir: string): HookProbe[] {
  return [".claude/settings.local.json", ".claude/settings.json"].map(path => {
    const fullPath = join(projectDir, path);
    if (!existsSync(fullPath)) return { source: path, status: "missing", events: [] };
    const parsed = parseJsonObject(fullPath);
    if (!parsed) return { source: path, status: "invalid", events: [], issue: "settings JSON does not parse as object" };
    const hooks = asObject(parsed.hooks);
    const events = Object.keys(hooks).sort();
    return { source: path, status: "present", events };
  });
}

function detectPackageChecks(projectDir: string): CheckProbe[] {
  const pkg = parseJsonObject(join(projectDir, "package.json"));
  const scripts = asObject(pkg?.scripts);
  return Object.entries(scripts)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .filter(([name]) => EXPECTED_CHECK_NAMES.some(expected => name.includes(expected)) || ["check", "quality"].includes(name))
    .map(([name, command]) => ({
      command: `bun run ${name}`,
      source: `package.json:scripts.${name}=${command}`,
      confidence: "high",
    }));
}

function detectFileChecks(projectDir: string): CheckProbe[] {
  const probes: CheckProbe[] = [];
  if (existsSync(join(projectDir, "bun.lock")) || existsSync(join(projectDir, "bun.lockb"))) {
    probes.push({ command: "bun install --frozen-lockfile", source: "bun lockfile", confidence: "medium" });
  }
  if (existsSync(join(projectDir, "vitest.config.ts")) || existsSync(join(projectDir, "vitest.config.mts"))) {
    probes.push({ command: "bunx vitest", source: "vitest config", confidence: "medium" });
  }
  if (existsSync(join(projectDir, "playwright.config.ts"))) {
    probes.push({ command: "bunx playwright test", source: "playwright config", confidence: "medium" });
  }
  return probes;
}

function detectChecks(projectDir: string): { detected: CheckProbe[]; missing: string[] } {
  const detected = [...detectPackageChecks(projectDir), ...detectFileChecks(projectDir)];
  const haystack = detected.map(item => `${item.command} ${item.source}`.toLowerCase()).join("\n");
  const missing = EXPECTED_CHECK_NAMES.filter(name => !haystack.includes(name));
  return { detected, missing };
}

function addRisk(risks: Risk[], severity: RiskSeverity, area: string, message: string): void {
  risks.push({ severity, area, message });
}

function collectRisks(proof: Omit<AssistantProof, "risks" | "summary">): Risk[] {
  const risks: Risk[] = [];

  if (!proof.project.exists) {
    addRisk(risks, "critical", "project", "Target project path does not exist");
    return risks;
  }

  if (proof.assistantFiles.claudeInstructions.status !== "present" && proof.assistantFiles.rootClaudeInstructions.status !== "present") {
    addRisk(risks, "critical", "instructions", "No CLAUDE.md instructions found");
  }

  const invalidSettings = proof.hooks.claude.filter(item => item.status === "invalid");
  for (const item of invalidSettings) {
    addRisk(risks, "high", "hooks", `${item.source} is invalid`);
  }

  const hasClaudeHooks = proof.hooks.claude.some(item => item.status === "present" && item.events.length > 0);
  if (!hasClaudeHooks) addRisk(risks, "medium", "hooks", "No Claude hooks detected");

  if (proof.agents.claude.count === 0) {
    addRisk(risks, "medium", "agents", "No project agents detected");
  }

  const hasMemory = proof.memory.directories.some(item => item.count > 0) || proof.memory.files.some(item => item.status === "present");
  if (!hasMemory) addRisk(risks, "low", "memory", "No project memory assets detected");

  if (proof.checks.detected.length === 0) {
    addRisk(risks, "high", "checks", "No runnable checks detected");
  } else if (proof.checks.missing.includes("test")) {
    addRisk(risks, "medium", "checks", "No test command detected");
  }

  return risks.sort((left, right) => RISK_ORDER[right.severity] - RISK_ORDER[left.severity]);
}

function countFiles(groups: FileProbe[][]): { presentFiles: number; missingFiles: number } {
  const files = groups.flat();
  return {
    presentFiles: files.filter(item => item.status === "present").length,
    missingFiles: files.filter(item => item.status === "missing").length,
  };
}

function highestRisk(risks: Risk[]): RiskSeverity | null {
  let highest: RiskSeverity | null = null;
  for (const risk of risks) {
    if (!highest || RISK_ORDER[risk.severity] > RISK_ORDER[highest]) highest = risk.severity;
  }
  return highest;
}

function collectProof(projectDir: string): AssistantProof {
  const exists = existsSync(projectDir);
  const base = {
    schemaVersion: 1 as const,
    generatedAt: new Date().toISOString(),
    project: {
      path: projectDir,
      name: basename(projectDir),
      exists,
      gitRequired: false as const,
    },
    assistantFiles: {
      claudeInstructions: fileProbe(projectDir, ".claude/CLAUDE.md"),
      rootClaudeInstructions: fileProbe(projectDir, "CLAUDE.md"),
      reviewRules: fileProbe(projectDir, "REVIEW.md"),
      settings: [
        fileProbe(projectDir, ".claude/settings.local.json"),
        fileProbe(projectDir, ".claude/settings.json"),
      ],
    },
    hooks: {
      claude: detectClaudeHooks(projectDir),
    },
    memory: {
      directories: [
        directoryProbe(projectDir, ".claude/memory"),
        directoryProbe(projectDir, "memory"),
      ],
      files: [
        fileProbe(projectDir, "MEMORY.md"),
        fileProbe(projectDir, ".claude/MEMORY.md"),
      ],
    },
    agents: {
      claude: directoryProbe(projectDir, ".claude/agents", /\.md$/),
    },
    checks: detectChecks(projectDir),
  };
  const risks = collectRisks(base);
  const fileCounts = countFiles([
    [
      base.assistantFiles.claudeInstructions,
      base.assistantFiles.rootClaudeInstructions,
      base.assistantFiles.reviewRules,
    ],
    base.assistantFiles.settings,
    base.memory.files,
  ]);

  return {
    ...base,
    risks,
    summary: {
      ok: !risks.some(risk => risk.severity === "critical" || risk.severity === "high"),
      presentFiles: fileCounts.presentFiles,
      missingFiles: fileCounts.missingFiles,
      riskCount: risks.length,
      highestRisk: highestRisk(risks),
    },
  };
}

function writeProof(projectDir: string, proof: AssistantProof): string {
  const outputPath = join(projectDir, "ORCA_PROOF.json");
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(proof, null, 2)}\n`);
  return outputPath;
}

function main(): void {
  try {
    const options = parseArgs(process.argv.slice(2));
    const proof = collectProof(options.projectDir);
    const outputPath = options.write ? writeProof(options.projectDir, proof) : null;
    const payload = outputPath ? { ...proof, writtenTo: relative(process.cwd(), outputPath) || outputPath } : proof;
    console.log(JSON.stringify(payload, null, 2));
    process.exit(proof.summary.ok ? 0 : 1);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
}

main();
