#!/usr/bin/env bun

import { existsSync, readFileSync } from "fs";
import { dirname, isAbsolute, join, resolve } from "path";

interface HookInput {
  tool_input?: {
    file_path?: unknown;
    path?: unknown;
  };
}

const action = process.argv[2] ?? "";

async function readHookInput(): Promise<HookInput> {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  if (!raw.trim()) return {};

  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? parsed as HookInput : {};
  } catch {
    return {};
  }
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toolFile(input: HookInput): string {
  return stringValue(input.tool_input?.file_path) || stringValue(input.tool_input?.path);
}

function findUp(startDir: string, relativePath: string): string | null {
  let dir = resolve(startDir);
  while (true) {
    const candidate = join(dir, relativePath);
    if (existsSync(candidate)) return candidate;

    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function firstLines(text: string, maxLines: number): string {
  return text.split(/\r?\n/).filter(Boolean).slice(0, maxLines).join("\n");
}

function runTypecheck(filePath: string): void {
  if (!/\.(ts|tsx)$/.test(filePath)) return;

  const absoluteFile = isAbsolute(filePath) ? filePath : resolve(projectDir(), filePath);
  const compiler = findUp(dirname(absoluteFile), "node_modules/.bin/tsc");
  if (!compiler) return;

  const packageRoot = dirname(dirname(dirname(compiler)));
  const result = Bun.spawnSync([compiler, "--noEmit", "--pretty", "false", absoluteFile], {
    cwd: packageRoot,
  });
  const output = `${result.stdout.toString()}\n${result.stderr.toString()}`.trim();
  if (output) console.log(firstLines(output, 5));
}

function projectDir(): string {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

function modifiedFiles(): string[] {
  const result = Bun.spawnSync(["git", "diff", "--name-only"], {
    cwd: projectDir(),
    stderr: "ignore",
  });
  if (result.exitCode !== 0) return [];

  return result.stdout.toString().split(/\r?\n/).filter(Boolean);
}

function checkConsoleLogs(): void {
  const files = modifiedFiles().filter(file => /\.(ts|tsx|js|jsx)$/.test(file));
  const matches = files.filter(file => {
    const path = isAbsolute(file) ? file : join(projectDir(), file);
    if (!existsSync(path)) return false;
    return readFileSync(path, "utf-8").includes("console.log");
  });

  if (matches.length > 0) {
    console.error(`console.log found in: ${matches.join(" ")}`);
  }
}

const input = await readHookInput();

if (action === "typecheck-file") {
  runTypecheck(toolFile(input));
} else if (action === "console-log-check") {
  checkConsoleLogs();
}
