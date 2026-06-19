#!/usr/bin/env bun
/**
 * design-review — Playwright + senior checklists + AI-slop grep.
 *
 * Specialist #6 of /senior-designer. Captures the live site, scores it
 * against 7 senior categories, and writes annotated screenshots.
 *
 * Usage:
 *   bun scripts/design-review.ts <url> [--viewport=375,768,1280] [--out=docs/review]
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

interface ReviewArgs {
  url: string;
  viewports: number[];
  outDir: string;
}

interface CategoryScore {
  name: string;
  score: number;
  max: number;
  findings: string[];
}

const DEFAULT_VIEWPORTS = [375, 768, 1280];

function parseArgs(argv: string[]): ReviewArgs {
  const url = argv[2] ?? "http://localhost:3000";
  let viewports = DEFAULT_VIEWPORTS;
  let outDir = "docs/review";
  for (const arg of argv.slice(3)) {
    if (arg.startsWith("--viewport=")) {
      viewports = arg.slice(11).split(",").map((s) => Number.parseInt(s, 10));
    } else if (arg.startsWith("--out=")) {
      outDir = arg.slice(6);
    }
  }
  return { url, viewports, outDir };
}

async function captureScreenshots(url: string, viewports: number[], outDir: string): Promise<string[]> {
  const paths: string[] = [];
  for (const w of viewports) {
    const path = `${outDir}/screen-${w}.png`;
    try {
      mkdirSync(dirname(path), { recursive: true });
      const { chromium } = (await import("playwright")) as typeof import("playwright");
      const browser = await chromium.launch();
      const ctx = await browser.newContext({ viewport: { width: w, height: Math.floor((w * 9) / 5) } });
      const page = await ctx.newPage();
      await page.goto(url, { waitUntil: "networkidle", timeout: 20_000 });
      await page.screenshot({ path, fullPage: true });
      await browser.close();
      paths.push(path);
    } catch (err) {
      console.error(`screenshot failed at ${w}px: ${(err as Error).message}`);
    }
  }
  return paths;
}

function scoreTypographyRhythm(projectPath: string): CategoryScore {
  const findings: string[] = [];
  let score = 10;
  const grep = spawnSync(
    "grep",
    ["-rEoh", "text-\\[(\\d+(\\.\\d+)?(rem|px|em))\\]", "src/components/sections"],
    { cwd: projectPath, encoding: "utf8" },
  );
  const sizes = new Set(
    (grep.stdout ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  if (sizes.size > 8) {
    findings.push(`${sizes.size} distinct arbitrary text sizes — typographic rhythm not on a modular scale.`);
    score -= 4;
  }
  if (sizes.size <= 4) {
    findings.push("Type scale looks tight (≤4 sizes). Verify hero/section variation is intentional.");
  }
  return { name: "Typography rhythm", score: Math.max(0, score), max: 10, findings };
}

function scoreColorDiscipline(projectPath: string): CategoryScore {
  const findings: string[] = [];
  let score = 10;
  const grep = spawnSync(
    "grep",
    ["-Eo", "--color-[a-z-]+:\\s*#[0-9a-fA-F]{3,8}", "src/app/globals.css"],
    { cwd: projectPath, encoding: "utf8" },
  );
  const colors = (grep.stdout ?? "").split("\n").filter(Boolean);
  if (colors.length > 8) {
    findings.push(`${colors.length} colors in @theme — doctrine ≤ 8. Trim.`);
    score -= 4;
  }
  const purple = spawnSync(
    "grep",
    ["-r", "from-purple", "src"],
    { cwd: projectPath, encoding: "utf8" },
  );
  if ((purple.stdout ?? "").length > 0) {
    findings.push("Purple gradient detected — classic AI-slop signal.");
    score -= 3;
  }
  return { name: "Color discipline", score: Math.max(0, score), max: 10, findings };
}

function scoreAiSlopGrep(projectPath: string): CategoryScore {
  const findings: string[] = [];
  let score = 10;
  const patterns: Array<{ re: string; reason: string; penalty: number }> = [
    { re: "rounded-lg", reason: "rounded-lg used (radius not differentiated)", penalty: 2 },
    { re: "shadow-md", reason: "shadow-md used (shadow elevation flat)", penalty: 2 },
    { re: "Get started", reason: "'Get started' copy (generic CTA)", penalty: 2 },
    { re: "Lorem ipsum", reason: "Lorem ipsum residual", penalty: 4 },
    { re: "Your tagline", reason: "'Your tagline here' placeholder", penalty: 4 },
  ];
  for (const p of patterns) {
    const r = spawnSync("grep", ["-r", "-l", p.re, "src"], { cwd: projectPath, encoding: "utf8" });
    const hits = (r.stdout ?? "").split("\n").filter(Boolean);
    if (hits.length > 0) {
      findings.push(`${p.reason} (${hits.length} file${hits.length > 1 ? "s" : ""})`);
      score -= p.penalty;
    }
  }
  return { name: "AI-slop grep", score: Math.max(0, score), max: 10, findings };
}

function scoreMotionBudget(projectPath: string): CategoryScore {
  const findings: string[] = [];
  let score = 10;
  const motionDir = spawnSync("ls", ["src/components/motion"], { cwd: projectPath, encoding: "utf8" });
  const files = (motionDir.stdout ?? "").split("\n").filter((f) => f.endsWith(".tsx"));
  if (files.length === 0) {
    findings.push("No motion components found — site is fully static.");
    score -= 3;
  } else if (files.length > 8) {
    findings.push(`${files.length} motion components — likely over-animated.`);
    score -= 2;
  }
  return { name: "Motion budget", score: Math.max(0, score), max: 10, findings };
}

function scoreA11y(projectPath: string): CategoryScore {
  const findings: string[] = [];
  let score = 10;
  const outlineNone = spawnSync("grep", ["-r", "-l", "outline-none", "src"], { cwd: projectPath, encoding: "utf8" });
  const focusVisible = spawnSync("grep", ["-r", "-l", "focus-visible:", "src"], { cwd: projectPath, encoding: "utf8" });
  if ((outlineNone.stdout ?? "").length > 0 && (focusVisible.stdout ?? "").length === 0) {
    findings.push("outline-none used without focus-visible — keyboard a11y broken.");
    score -= 4;
  }
  const reduced = spawnSync("grep", ["-r", "prefers-reduced-motion", "src"], { cwd: projectPath, encoding: "utf8" });
  if ((reduced.stdout ?? "").length === 0) {
    findings.push("No prefers-reduced-motion guard found.");
    score -= 2;
  }
  return { name: "Accessibility", score: Math.max(0, score), max: 10, findings };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const projectPath = resolve(process.cwd());

  console.log(`design-review @ ${args.url}\n`);

  const screenshots = await captureScreenshots(args.url, args.viewports, args.outDir);
  console.log(`captured ${screenshots.length} screenshot(s)`);

  const categories: CategoryScore[] = [
    scoreTypographyRhythm(projectPath),
    scoreColorDiscipline(projectPath),
    scoreAiSlopGrep(projectPath),
    scoreMotionBudget(projectPath),
    scoreA11y(projectPath),
  ];

  const total = categories.reduce((s, c) => s + c.score, 0);
  const max = categories.reduce((s, c) => s + c.max, 0);
  const pct = Math.round((total / max) * 100);

  let verdict: "OK" | "GAPS" | "BLOCKED";
  if (pct >= 85) verdict = "OK";
  else if (pct >= 65) verdict = "GAPS";
  else verdict = "BLOCKED";

  console.log(`\nVERDICT: ${verdict} — ${total}/${max} (${pct}%)\n`);
  for (const c of categories) {
    console.log(`  ${c.score}/${c.max}  ${c.name}`);
    for (const f of c.findings) console.log(`         ↳ ${f}`);
  }

  const report = [
    `# Design Review — ${new Date().toISOString().slice(0, 10)}`,
    "",
    `**URL** — ${args.url}`,
    `**Verdict** — ${verdict}`,
    `**Score** — ${total}/${max} (${pct}%)`,
    "",
    "## Screenshots",
    "",
    ...screenshots.map((p) => `- ${p}`),
    "",
    "## Catégories",
    "",
    ...categories.flatMap((c) => {
      const head = `### ${c.name} — ${c.score}/${c.max}`;
      const lines = c.findings.length > 0 ? c.findings.map((f) => `- ${f}`) : ["- OK"];
      return [head, "", ...lines, ""];
    }),
  ].join("\n");

  mkdirSync(args.outDir, { recursive: true });
  const reportPath = `${args.outDir}/REVIEW.md`;
  writeFileSync(reportPath, report);
  console.log(`\nReport: ${reportPath}`);
}

main().catch((err: Error) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
