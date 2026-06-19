#!/usr/bin/env bun

import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";

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

function maybeWarn(filePath: string, pattern: RegExp, message: string): void {
  if (pattern.test(filePath)) console.log(message);
}

function projectDir(): string {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

function hasNewerSectionFile(dir: string, briefMtimeMs: number): boolean {
  if (!existsSync(dir)) return false;

  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory() && hasNewerSectionFile(path, briefMtimeMs)) return true;
    if (stat.isFile() && path.endsWith(".tsx") && stat.mtimeMs > briefMtimeMs) return true;
  }

  return false;
}

function briefDriftCheck(): void {
  const brief = join(projectDir(), "docs", "BRIEF.md");
  const sections = join(projectDir(), "components", "sections");
  if (!existsSync(brief) || !existsSync(sections)) return;

  if (hasNewerSectionFile(sections, statSync(brief).mtimeMs)) {
    console.log(
      "[showcase] brief-drift-check : une section a été modifiée après BRIEF.md -> relisez BRIEF.md section 3 (ton) + section 4 (mood) avant commit pour éviter les dérives",
    );
  }
}

const filePath = toolFile(await readHookInput());

if (action === "motion-audit") {
  maybeWarn(
    filePath,
    /components\/motion\/.*\.tsx$|hooks\/use-.*-scroll\.ts$|lib\/motion\.ts$/,
    "[showcase] fichier motion modifié -> lancez la skill motion-audit pour vérifier reduced-motion + cleanup + perf avant commit",
  );
} else if (action === "page-performance") {
  maybeWarn(
    filePath,
    /app\/.*\/page\.tsx$/,
    "[showcase] page modifiée -> rappel : Server Component par défaut, priority sur hero image, dynamic import pour heavy motion below-the-fold",
  );
} else if (action === "section-a11y") {
  maybeWarn(
    filePath,
    /components\/sections\/.*\.tsx$/,
    "[showcase] section modifiée -> checklist a11y : contrast AA (AAA hero), keyboard nav, focus-visible, alt images, semantic landmarks",
  );
} else if (action === "brief-drift-check") {
  briefDriftCheck();
}
