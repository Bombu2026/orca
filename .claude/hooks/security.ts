#!/usr/bin/env bun

interface HookInput {
  tool_name?: unknown;
	  tool_input?: {
	    command?: unknown;
	    file_path?: unknown;
	    path?: unknown;
	    new_string?: unknown;
	    content?: unknown;
	    edits?: unknown;
	  };
}

type Mode = "standard" | "strict";
type HookAction = "command" | "destructive-git" | "lint-config" | "secret" | "env-file";

const action = process.argv[2] ?? "";
const mode: Mode = process.argv[3] === "strict" ? "strict" : "standard";
const knownActions: HookAction[] = ["command", "destructive-git", "lint-config", "secret", "env-file"];

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

function value(input: unknown): string {
  return typeof input === "string" ? input : "";
}

function toolCommand(input: HookInput): string {
  return value(input.tool_input?.command);
}

function toolFile(input: HookInput): string {
  return value(input.tool_input?.file_path) || value(input.tool_input?.path);
}

function toolContent(input: HookInput): string {
  const directContent = [input.tool_input?.new_string, input.tool_input?.content]
    .map(value)
    .filter(Boolean);
  const edits = Array.isArray(input.tool_input?.edits)
    ? input.tool_input.edits
      .map(edit => edit && typeof edit === "object" && "new_string" in edit ? value((edit as { new_string?: unknown }).new_string) : "")
      .filter(Boolean)
    : [];
  return [...directContent, ...edits].join("\n");
}

function block(message: string): never {
  console.error(message);
  process.exit(2);
}

function warn(message: string): void {
  console.error(message);
}

function isEnvPath(filePath: string): boolean {
  const normalized = filePath.replaceAll("\\", "/");
  const basename = normalized.split("/").at(-1) ?? normalized;
  return /^\.env(\..+)?$/.test(basename);
}

function isProtectedConfigPath(filePath: string): boolean {
  const normalized = filePath.replaceAll("\\", "/");
  const basename = normalized.split("/").at(-1) ?? normalized;
  return (
    /^\.(eslint|prettier|biome|editorconfig)rc(\..+)?$/.test(basename) ||
    /^eslint\.config\./.test(basename) ||
    /^prettier\.config\./.test(basename) ||
    /^biome\.jsonc?$/.test(basename) ||
    /^tsconfig(?:\..*)?\.json$/.test(basename) ||
    /^next\.config\./.test(basename) ||
    /^tailwind\.config\./.test(basename) ||
    /^vite\.config\./.test(basename)
  );
}

function isDangerousCommand(command: string): boolean {
  if (mode === "strict") {
    return (
      /--no-verify/.test(command) ||
      /--force(?:-with-lease)?\b/.test(command) ||
      /\bgit\s+push\b.*\s-f(\s|$)/.test(command) ||
      /\brm\b(?=[^\n]*(?:-[A-Za-z]*r|--recursive))(?=[^\n]*(?:-[A-Za-z]*f|--force))/.test(command) ||
      /\bDROP\s+TABLE\b|\bTRUNCATE\s+TABLE\b/i.test(command) ||
      /\bsudo\s+|\beval\s+|\bchmod\s+-?[Rr]?\s*777\b/.test(command)
    );
  }

  return (
    /--no-verify/.test(command) ||
    /\bgit\s+push\b.*--force-with-lease\b.*\bmain\b/.test(command) ||
    /\brm\b(?=[^\n]*(?:-[A-Za-z]*r|--recursive))(?=[^\n]*(?:-[A-Za-z]*f|--force))(?=[^\n]*\s\/(?:\s|$))/.test(command) ||
    /\bDROP\s+TABLE\b|\bTRUNCATE\s+TABLE\b/i.test(command)
  );
}

const input = await readHookInput();

if (!knownActions.includes(action as HookAction)) {
  process.exit(0);
}

if (action === "command") {
  const command = toolCommand(input);

  if (isDangerousCommand(command)) {
    block(
      mode === "strict"
        ? "BLOCKED (strict mode): Dangerous command detected in bypassPermissions context"
        : "BLOCKED: Dangerous command detected",
    );
  }
}

if (action === "destructive-git") {
  const command = toolCommand(input);
  if (/\bgit\s+push\b.*(--force(?:-with-lease)?\b|\s-f(\s|$))|\bgit\s+reset\s+--hard\b|\bgit\s+clean\b.*-[A-Za-z]*f/.test(command)) {
    block("BLOCKED (strict mode): Destructive git command blocked - bypassPermissions active");
  }
}

if (action === "lint-config") {
  const filePath = toolFile(input);
  if (isProtectedConfigPath(filePath)) {
    block("BLOCKED: Do not modify linter/formatter configs - fix the code instead");
  }
}

if (action === "secret") {
  const content = toolContent(input);
  if (/(AKIA[0-9A-Z]{16}|sk-[a-zA-Z0-9]{20,}|password\s*=\s*['"][^'"]+['"])/i.test(content)) {
    if (mode === "strict") {
      block("BLOCKED (strict mode): Hardcoded secret detected - bypassPermissions active, secrets forbidden");
    }
    warn("WARNING: Possible hardcoded secret detected");
  }
}

if (action === "env-file") {
  const filePath = toolFile(input);
  if (isEnvPath(filePath)) {
    block("BLOCKED (strict mode): Direct write to .env blocked in bypassPermissions mode - use env var management tools");
  }
}
