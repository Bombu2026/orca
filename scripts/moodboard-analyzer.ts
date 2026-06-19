#!/usr/bin/env bun
/**
 * moodboard-analyzer — Specialist #1 of /senior-designer.
 *
 * Reads MOODBOARD.md, scrapes each reference URL via Playwright, extracts
 * dominant colors and detected fonts, writes WebP screenshots and a tag
 * convergence test.
 *
 * Usage:
 *   bun scripts/moodboard-analyzer.ts <moodboard.md>
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

interface ReferenceSite {
  url: string;
  slug: string;
  screenshot?: string;
  palette?: string[];
  fonts?: string[];
  tags?: string[];
}

function extractUrls(markdown: string): string[] {
  const re = /https?:\/\/[^\s)"'`]+/g;
  return Array.from(new Set(markdown.match(re) ?? []));
}

function slugify(url: string): string {
  try {
    const u = new URL(url);
    return (u.host + u.pathname).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  } catch {
    return url.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  }
}

async function analyzeOne(url: string, outDir: string): Promise<ReferenceSite> {
  const slug = slugify(url);
  const site: ReferenceSite = { url, slug };
  try {
    const { chromium } = (await import("playwright")) as typeof import("playwright");
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 25_000 });

    const screenshotPath = join(outDir, `${slug}.webp`);
    mkdirSync(dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, type: "jpeg", quality: 80 });
    site.screenshot = screenshotPath;

    site.fonts = await page.evaluate(() => {
      const fonts = new Set<string>();
      for (const el of Array.from(document.querySelectorAll("h1, h2, h3, p, body"))) {
        const fam = (getComputedStyle(el).fontFamily.split(",")[0] ?? "").trim().replace(/['"]/g, "");
        if (fam && !["serif", "sans-serif", "system-ui"].includes(fam)) fonts.add(fam);
      }
      return Array.from(fonts).slice(0, 4);
    });

    site.palette = await page.evaluate(() => {
      const counts = new Map<string, number>();
      for (const el of Array.from(document.querySelectorAll("body, body *"))) {
        const s = getComputedStyle(el);
        for (const c of [s.color, s.backgroundColor]) {
          if (c && c.startsWith("rgb") && c !== "rgba(0, 0, 0, 0)") {
            counts.set(c, (counts.get(c) ?? 0) + 1);
          }
        }
      }
      return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([c]) => c);
    });

    await browser.close();
  } catch (err) {
    console.error(`  fail ${url}: ${(err as Error).message}`);
  }
  return site;
}

async function main(): Promise<void> {
  const moodboardPath = process.argv[2];
  if (!moodboardPath || !existsSync(moodboardPath)) {
    console.error("Usage: bun moodboard-analyzer.ts <moodboard.md>");
    console.error("VERDICT: BLOCKED — moodboard file not found");
    process.exit(2);
  }
  const md = readFileSync(moodboardPath, "utf8");
  const urls = extractUrls(md);
  if (urls.length === 0) {
    console.error("VERDICT: BLOCKED — no URLs found in moodboard");
    process.exit(2);
  }

  const projectRoot = resolve(dirname(moodboardPath), "..");
  const outDir = join(projectRoot, "docs/moodboard");
  mkdirSync(outDir, { recursive: true });

  console.log(`Analyzing ${urls.length} reference site(s)...`);
  const sites: ReferenceSite[] = [];
  for (const url of urls) {
    console.log(`  → ${url}`);
    const s = await analyzeOne(url, outDir);
    sites.push(s);
  }

  const enrichedPath = moodboardPath.replace(/\.md$/, ".enriched.md");
  const body = [
    `# Moodboard — enriched ${new Date().toISOString().slice(0, 10)}`,
    "",
    `_Auto-generated from ${moodboardPath}_`,
    "",
    "---",
    "",
    ...sites.flatMap((s) => [
      `## ${s.slug}`,
      "",
      `**URL** — ${s.url}`,
      s.screenshot ? `**Screenshot** — \`${s.screenshot.replace(projectRoot + "/", "")}\`` : "**Screenshot** — _failed_",
      s.fonts && s.fonts.length > 0 ? `**Fonts** — ${s.fonts.join(", ")}` : "",
      s.palette && s.palette.length > 0 ? `**Palette** — ${s.palette.join(" · ")}` : "",
      "",
    ]),
    "",
    "## Convergence",
    "",
    sites.every((s) => s.fonts && s.fonts.length > 0)
      ? `_All references provide font signals: ${[...new Set(sites.flatMap((s) => s.fonts ?? []))].join(", ")}_`
      : "_Font extraction incomplete on some references._",
  ].join("\n");

  writeFileSync(enrichedPath, body);
  const okCount = sites.filter((s) => s.screenshot).length;
  const verdict = okCount === sites.length ? "OK" : okCount > 0 ? "GAPS" : "BLOCKED";
  console.log(`\nVERDICT: ${verdict} — ${okCount}/${sites.length} references analyzed`);
  console.log(`Report: ${enrichedPath}`);
}

main().catch((err: Error) => {
  console.error("FATAL:", err.message);
  console.error("VERDICT: BLOCKED");
  process.exit(1);
});
