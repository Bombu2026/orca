#!/usr/bin/env bun

/**
 * conseil-skill-match.ts
 * Pass 3 of the /conseil mode: surface the best skills for a given project so the
 * advisor agent isn't blind to the 12k-skill library.
 *
 * It does NOT decide ROI (that's LLM synthesis against the diagnostic findings) — it
 * lists what's already installed and ranks library candidates by keyword relevance.
 *
 * Usage:
 *   bun scripts/conseil-skill-match.ts <project-path> --keywords="crm,email,rls,pdf" \
 *     [--top=25] [--json]
 *
 * Library resolution mirrors strategy-select.ts (SKILL_LIBRARY_DIR, then probes).
 */

import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { basename, join } from "path";

interface InstalledSkill {
  name: string;
  scope: "global" | "project";
  description: string;
}

interface LibraryHit {
  name: string;
  repo: string;
  path: string;
  description: string;
  score: number;
  matched: string[];
}

function parseArgs() {
  const [, , projectPath, ...rest] = process.argv;
  if (!projectPath) {
    console.error("usage: conseil-skill-match.ts <project-path> --keywords=\"a,b,c\" [--top=N] [--json]");
    process.exit(1);
  }
  let keywords: string[] = [];
  let top = 25;
  let json = false;
  for (const a of rest) {
    if (a.startsWith("--keywords=")) {
      keywords = a
        .slice("--keywords=".length)
        .replace(/^["']|["']$/g, "")
        .split(",")
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean);
    } else if (a.startsWith("--top=")) {
      top = Math.max(1, parseInt(a.slice("--top=".length), 10) || 25);
    } else if (a === "--json") {
      json = true;
    }
  }
  return { projectPath, keywords, top, json };
}

function isValidLibrary(candidate: string): boolean {
  try {
    return (
      existsSync(candidate) &&
      statSync(candidate).isDirectory() &&
      existsSync(join(candidate, "skills"))
    );
  } catch {
    return false;
  }
}

function resolveLibraryDir(): string | null {
  const env = process.env.SKILL_LIBRARY_DIR?.trim();
  if (env && isValidLibrary(env)) return env;
  const home = process.env.HOME || "";
  const probes = [
    join(home, "Desktop/skill/library"),
  ];
  for (const c of probes) if (isValidLibrary(c)) return c;
  return null;
}

function readDescription(skillMd: string): string {
  try {
    const raw = readFileSync(skillMd, "utf8");
    const fm = raw.match(/^---\n([\s\S]*?)\n---/);
    const body = fm?.[1] ?? raw.slice(0, 600);
    const m = body.match(/description:\s*(?:>-?\s*)?([\s\S]*?)(?:\n[a-z_-]+:|$)/i);
    return (m?.[1] ?? "")
      .replace(/\s+/g, " ")
      .replace(/^["']|["']$/g, "")
      .trim()
      .slice(0, 240);
  } catch {
    return "";
  }
}

function listInstalledSkills(projectPath: string): InstalledSkill[] {
  const out: InstalledSkill[] = [];
  const roots: Array<[string, "global" | "project"]> = [
    [join(process.env.HOME || "", ".claude/skills"), "global"],
    [join(projectPath, ".claude/skills"), "project"],
  ];
  for (const [root, scope] of roots) {
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root)) {
      const skillMd = join(root, entry, "SKILL.md");
      if (existsSync(skillMd)) {
        out.push({ name: entry, scope, description: readDescription(skillMd) });
      }
    }
  }
  return out;
}

function rankLibrary(libDir: string, keywords: string[], top: number): LibraryHit[] {
  const skillsDir = join(libDir, "skills");
  const hits: LibraryHit[] = [];
  for (const entry of readdirSync(skillsDir)) {
    const skillMd = join(skillsDir, entry, "SKILL.md");
    if (!existsSync(skillMd)) continue;
    const description = readDescription(skillMd);
    const haystackName = entry.toLowerCase().replace(/--/g, " ");
    const haystackDesc = description.toLowerCase();
    const matched: string[] = [];
    let score = 0;
    for (const kw of keywords) {
      if (!kw) continue;
      let hit = false;
      if (haystackName.includes(kw)) {
        score += 3; // name match is strong signal
        hit = true;
      }
      if (haystackDesc.includes(kw)) {
        score += 1;
        hit = true;
      }
      if (hit) matched.push(kw);
    }
    if (score > 0) {
      const parts = entry.split("--");
      const name = parts[parts.length - 1] || entry;
      const repo = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : "";
      hits.push({ name, repo, path: skillMd, description, score, matched });
    }
  }
  hits.sort((a, b) => b.score - a.score || b.matched.length - a.matched.length);
  return hits.slice(0, top);
}

function main() {
  const { projectPath, keywords, top, json } = parseArgs();
  const installed = listInstalledSkills(projectPath);
  const libDir = resolveLibraryDir();
  const library = libDir && keywords.length ? rankLibrary(libDir, keywords, top) : [];

  if (json) {
    console.log(
      JSON.stringify(
        { projectPath, keywords, libraryDir: libDir, installed, library },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`# Skill matchmaking — ${basename(projectPath)}`);
  console.log(`\nLibrary: ${libDir ?? "NON TROUVÉE"}  |  mots-clés: ${keywords.join(", ") || "(aucun)"}`);
  console.log(`\n## Skills installés (${installed.length})`);
  for (const s of installed) console.log(`- [${s.scope}] ${s.name} — ${s.description}`);
  console.log(`\n## Candidats library (top ${library.length})`);
  for (const h of library) {
    console.log(`- ${h.name} (${h.repo}) [score ${h.score}, ${h.matched.join("/")}] — ${h.description}`);
  }
  if (!libDir) {
    console.log("\n[warn] Library introuvable — set SKILL_LIBRARY_DIR. Skills installés listés quand même.");
  }
}

main();
