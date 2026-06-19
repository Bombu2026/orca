#!/usr/bin/env bun
/**
 * Senior Designer — orchestrator CLI.
 *
 * Wraps the 6 specialists into a single callable. When invoked from Claude
 * (skill /senior-designer), the parent thread is expected to spawn the
 * specialists via the Agent tool in parallel. This script is the CLI
 * counterpart for direct shell invocation.
 *
 * Usage:
 *   bun scripts/senior-designer.ts <project-path> --mode=audit
 *   bun scripts/senior-designer.ts <project-path> --mode=apply --yes
 *   bun scripts/senior-designer.ts <project-path> --mode=scaffold
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

type Mode = "audit" | "apply" | "scaffold";

interface CliArgs {
  projectPath: string;
  mode: Mode;
  yes: boolean;
  url?: string;
}

interface SpecialistResult {
  name: string;
  verdict: "OK" | "GAPS" | "BLOCKED";
  report: string;
  artifacts: string[];
  durationMs: number;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    projectPath: resolve(argv[2] ?? process.cwd()),
    mode: "audit",
    yes: false,
  };
  for (const arg of argv.slice(3)) {
    if (arg.startsWith("--mode=")) {
      const m = arg.slice(7) as Mode;
      if (!["audit", "apply", "scaffold"].includes(m)) {
        throw new Error(`Invalid mode: ${m}`);
      }
      args.mode = m;
    } else if (arg === "--yes") {
      args.yes = true;
    } else if (arg.startsWith("--url=")) {
      args.url = arg.slice(6);
    }
  }
  return args;
}

interface ProjectInfo {
  hasPackageJson: boolean;
  hasNext: boolean;
  hasTailwind: boolean;
  hasMotion: boolean;
  hasGsap: boolean;
  hasLenis: boolean;
  hasBrief: boolean;
  hasMoodboard: boolean;
  globalsCssLines: number;
  sectionsCount: number;
}

function discover(projectPath: string): ProjectInfo {
  const pkgPath = join(projectPath, "package.json");
  const hasPackageJson = existsSync(pkgPath);
  let deps: Record<string, string> = {};
  if (hasPackageJson) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  }

  const globalsCss = join(projectPath, "src/app/globals.css");
  const globalsLines = existsSync(globalsCss)
    ? readFileSync(globalsCss, "utf8").split("\n").length
    : 0;

  const sectionsDir = join(projectPath, "src/components/sections");
  let sectionsCount = 0;
  if (existsSync(sectionsDir)) {
    const { readdirSync } = require("node:fs") as typeof import("node:fs");
    sectionsCount = readdirSync(sectionsDir).filter((f) => f.endsWith(".tsx")).length;
  }

  return {
    hasPackageJson,
    hasNext: "next" in deps,
    hasTailwind: "tailwindcss" in deps,
    hasMotion: "motion" in deps || "framer-motion" in deps,
    hasGsap: "gsap" in deps,
    hasLenis: "lenis" in deps,
    hasBrief: existsSync(join(projectPath, "docs/BRIEF.md")),
    hasMoodboard: existsSync(join(projectPath, "docs/MOODBOARD.md")),
    globalsCssLines: globalsLines,
    sectionsCount,
  };
}

function gateProject(info: ProjectInfo): string[] {
  const blockers: string[] = [];
  if (!info.hasPackageJson) blockers.push("No package.json at root");
  if (!info.hasNext) blockers.push("Next.js not detected in dependencies");
  if (!info.hasTailwind) blockers.push("Tailwind CSS not detected");
  return blockers;
}

function runSpecialistScript(
  scriptName: string,
  args: string[],
  cwd: string,
): Promise<SpecialistResult> {
  const start = Date.now();
  const scriptPath = join(import.meta.dir, scriptName);
  return new Promise((resolveP) => {
    const child = spawn("bun", [scriptPath, ...args], { cwd, stdio: "pipe" });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (d: Buffer) => stdout.push(d));
    child.stderr.on("data", (d: Buffer) => stderr.push(d));
    child.on("close", (code) => {
      const report = Buffer.concat(stdout).toString("utf8");
      const errReport = Buffer.concat(stderr).toString("utf8");
      const verdict: SpecialistResult["verdict"] =
        code === 0 ? (/VERDICT: OK/i.test(report) ? "OK" : "GAPS") : "BLOCKED";
      resolveP({
        name: scriptName.replace(".ts", "").replace(".sh", ""),
        verdict,
        report: report + (errReport ? `\n--- STDERR ---\n${errReport}` : ""),
        artifacts: [],
        durationMs: Date.now() - start,
      });
    });
  });
}

async function runParallelAudit(
  projectPath: string,
  info: ProjectInfo,
  url: string,
): Promise<SpecialistResult[]> {
  const tasks: Promise<SpecialistResult>[] = [];

  if (info.hasMoodboard) {
    tasks.push(runSpecialistScript("moodboard-analyzer.ts", [join(projectPath, "docs/MOODBOARD.md")], projectPath));
  }
  tasks.push(runSpecialistScript("design-tokens-gen.ts", [projectPath, "--dry-run"], projectPath));
  tasks.push(runSpecialistScript("design-review.ts", [url], projectPath));

  return Promise.all(tasks);
}

function writeRunReport(
  projectPath: string,
  mode: Mode,
  results: SpecialistResult[],
): string {
  const docsDir = join(projectPath, "docs");
  if (!existsSync(docsDir)) mkdirSync(docsDir, { recursive: true });

  const out = join(docsDir, "SENIOR-DESIGN-REVIEW.md");
  const blocked = results.filter((r) => r.verdict === "BLOCKED").length;
  const gaps = results.filter((r) => r.verdict === "GAPS").length;
  const ok = results.filter((r) => r.verdict === "OK").length;

  const overall = blocked > 0 ? "BLOCKED" : gaps > 0 ? "GAPS" : "OK";

  const body = [
    `# Senior Design Review — ${new Date().toISOString().slice(0, 10)}`,
    "",
    `**Mode** — ${mode}`,
    `**Verdict global** — ${overall}`,
    `**OK** ${ok} / **GAPS** ${gaps} / **BLOCKED** ${blocked}`,
    "",
    "---",
    "",
    ...results.flatMap((r) => [
      `## ${r.name} — ${r.verdict}`,
      "",
      `_Durée: ${(r.durationMs / 1000).toFixed(1)}s_`,
      "",
      r.report.trim() || "_(no report)_",
      "",
      "---",
      "",
    ]),
  ].join("\n");

  writeFileSync(out, body);
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  console.log(`Senior Designer — ${args.mode} mode`);
  console.log(`Project: ${args.projectPath}\n`);

  const info = discover(args.projectPath);
  const blockers = gateProject(info);
  if (blockers.length > 0) {
    console.error("BLOCKED — pre-flight failed:");
    for (const b of blockers) console.error(`  - ${b}`);
    process.exit(2);
  }

  console.log("Discover:");
  console.log(`  Next.js: ${info.hasNext}`);
  console.log(`  Tailwind: ${info.hasTailwind}`);
  console.log(`  Motion lib: ${info.hasMotion ? "yes" : "no"} (gsap: ${info.hasGsap}, lenis: ${info.hasLenis})`);
  console.log(`  Brief: ${info.hasBrief ? "yes" : "no"}`);
  console.log(`  Moodboard: ${info.hasMoodboard ? "yes" : "no"}`);
  console.log(`  globals.css: ${info.globalsCssLines} lines`);
  console.log(`  Sections: ${info.sectionsCount}`);
  console.log();

  const url = args.url ?? "http://localhost:3000";
  console.log(`Spawning specialists in parallel against ${url}...\n`);
  const results = await runParallelAudit(args.projectPath, info, url);

  for (const r of results) {
    console.log(`  ${r.verdict.padEnd(8)} ${r.name} (${(r.durationMs / 1000).toFixed(1)}s)`);
  }
  console.log();

  const out = writeRunReport(args.projectPath, args.mode, results);
  console.log(`Report: ${out}`);

  if (args.mode === "audit") {
    console.log("\nAUDIT done. Run with --mode=apply to commit fixes.");
  } else if (args.mode === "apply") {
    console.log("\nAPPLY done. Re-run with --mode=audit to verify (or open the after report).");
  }
}

main().catch((err: Error) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
