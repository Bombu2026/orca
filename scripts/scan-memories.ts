#!/usr/bin/env bun
// Cross-project Claude Code memory scanner.
// Scans all project memory directories for feedback patterns, conventions, and errors.
// Used by the cross-project memory pattern scan.
// Usage: bun scripts/scan-memories.ts [--known-patterns path/to/known.json]

import { Glob } from "bun";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

interface MemoryFile {
  path: string;
  project: string;
  name: string;
  type: string;
  description: string;
  content: string;
  /** `date:` du frontmatter (ISO si présent). */
  date: string;
  /** mtime du fichier (epoch ms) — repli quand `date` est absent. */
  mtime: number;
  /** `superseded_by:` du frontmatter (non vide = fait explicitement périmé). */
  supersededBy: string;
}

interface Finding {
  category: "recurring_error" | "convention" | "anti_pattern" | "stack_evolution" | "workflow_insight" | "superseded_fact";
  name: string;
  description: string;
  projects: string[];
  evidence: string[];
  frequency: number;
}

interface ScanResult {
  timestamp: string;
  projectsScanned: number;
  filesRead: number;
  findings: Finding[];
}

function parseFrontmatter(content: string): { meta: Record<string, string>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };

  const meta: Record<string, string> = {};
  // match[1] (frontmatter) et match[2] (body) sont garantis par le regex quand match existe.
  const frontmatter = match[1] ?? "";
  const body = match[2] ?? "";
  for (const line of frontmatter.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    meta[key] = value;
  }
  return { meta, body };
}

function extractProjectName(memoryDir: string): string {
  // ~/.claude/projects/-Users-you-Desktop-MyProject/memory/file.md
  // -> -Users-you-Desktop-MyProject -> MyProject
  // For hyphenated: -Users-you-Desktop-my-cool-project -> my-cool-project
  const projectDir = basename(dirname(memoryDir));
  // The encoding replaces "/" with "-", so path segments map to known prefixes.
  // Find the last known path segment (Desktop, Documents, etc.) and take everything after it.
  const knownSegments = ["Desktop", "Documents", "Projects", "repos", "src", "code", "dev", "work", "Home"];
  for (const seg of knownSegments) {
    const idx = projectDir.indexOf(`-${seg}-`);
    if (idx !== -1) {
      const after = projectDir.slice(idx + seg.length + 2); // skip "-Segment-"
      return after || projectDir;
    }
  }
  // Fallback: take the last segment after the last uppercase-starting word
  const match = projectDir.match(/-([A-Z][a-zA-Z0-9-]*)$/);
  if (match && match[1]) return match[1];
  // Last resort: last dash-separated segment
  const parts = projectDir.split("-").filter(Boolean);
  return parts[parts.length - 1] || projectDir;
}

async function scanMemoryDirs(): Promise<MemoryFile[]> {
  const claudeDir = process.env.ASSISTANT_PROJECTS_ROOT ?? join(homedir(), ".claude", "projects");
  const files: MemoryFile[] = [];

  let projectDirs: string[];
  try {
    projectDirs = await readdir(claudeDir);
  } catch {
    console.error(`Cannot read ${claudeDir}`);
    return files;
  }

  for (const projectDir of projectDirs) {
    const memoryPath = join(claudeDir, projectDir, "memory");
    try {
      await stat(memoryPath);
    } catch {
      continue;
    }

    const glob = new Glob("*.md");
    for await (const file of glob.scan(memoryPath)) {
      const filePath = join(memoryPath, file);
      try {
        const content = await readFile(filePath, "utf-8");
        if (!content.trim()) continue;

        const { meta, body } = parseFrontmatter(content);
        let mtime = 0;
        try { mtime = (await stat(filePath)).mtimeMs; } catch { /* mtime 0 si stat échoue */ }
        files.push({
          path: filePath,
          project: extractProjectName(memoryPath),
          name: meta.name || basename(file, ".md"),
          type: meta.type || "unknown",
          description: meta.description || "",
          content: body.trim(),
          date: meta.date || "",
          mtime,
          supersededBy: meta.superseded_by || "",
        });
      } catch {
        continue;
      }
    }
  }

  return files;
}

function groupByTheme(files: MemoryFile[]): Finding[] {
  const findings: Finding[] = [];

  // Group feedback files by normalized name
  const feedbackFiles = files.filter((f) => f.type === "feedback");
  const feedbackGroups = new Map<string, MemoryFile[]>();

  for (const file of feedbackFiles) {
    const normalizedName = file.name
      .toLowerCase()
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const existing = feedbackGroups.get(normalizedName) || [];
    existing.push(file);
    feedbackGroups.set(normalizedName, existing);
  }

  // Recurring feedback = same theme in 2+ projects
  for (const [theme, group] of feedbackGroups) {
    const head = group[0];
    if (!head) continue; // un groupe est toujours non vide (push), garde pour le typeur
    const projects = [...new Set(group.map((f) => f.project))];
    if (projects.length >= 2) {
      findings.push({
        category: "recurring_error",
        name: theme,
        description: head.description || head.content.slice(0, 200),
        projects,
        evidence: group.map((f) => `[${f.project}] ${f.content.slice(0, 150)}`),
        frequency: group.length,
      });
    }
  }

  // Single-project but strong feedback (long content or specific patterns)
  for (const [theme, group] of feedbackGroups) {
    const head = group[0];
    if (!head) continue; // un groupe est toujours non vide (push), garde pour le typeur
    const projects = [...new Set(group.map((f) => f.project))];
    if (projects.length === 1 && group.some((f) => f.content.length > 100)) {
      findings.push({
        category: "anti_pattern",
        name: theme,
        description: head.description || head.content.slice(0, 200),
        projects,
        evidence: group.map((f) => `[${f.project}] ${f.content.slice(0, 150)}`),
        frequency: group.length,
      });
    }
  }

  // User preferences across projects
  const userFiles = files.filter((f) => f.type === "user");
  const userGroups = new Map<string, MemoryFile[]>();

  for (const file of userFiles) {
    const normalizedName = file.name
      .toLowerCase()
      .replace(/[-_]+/g, " ")
      .trim();
    const existing = userGroups.get(normalizedName) || [];
    existing.push(file);
    userGroups.set(normalizedName, existing);
  }

  for (const [theme, group] of userGroups) {
    const head = group[0];
    if (!head) continue; // un groupe est toujours non vide (push), garde pour le typeur
    const projects = [...new Set(group.map((f) => f.project))];
    if (projects.length >= 2) {
      findings.push({
        category: "convention",
        name: theme,
        description: head.description || head.content.slice(0, 200),
        projects,
        evidence: group.map((f) => `[${f.project}] ${f.content.slice(0, 150)}`),
        frequency: group.length,
      });
    }
  }

  // Project memories for stack/tool evolution
  const projectFiles = files.filter((f) => f.type === "project");
  for (const file of projectFiles) {
    const stackKeywords = ["migrat", "switch", "replac", "upgrad", "deprecat", "new stack", "moved to"];
    if (stackKeywords.some((kw) => file.content.toLowerCase().includes(kw))) {
      findings.push({
        category: "stack_evolution",
        name: file.name,
        description: file.description || file.content.slice(0, 200),
        projects: [file.project],
        evidence: [`[${file.project}] ${file.content.slice(0, 150)}`],
        frequency: 1,
      });
    }
  }

  return findings;
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Clé de récence : `date:` du frontmatter si parseable, sinon mtime. */
function recencyKey(f: MemoryFile): number {
  const d = Date.parse(f.date);
  return Number.isNaN(d) ? f.mtime : d;
}

/**
 * Détecte les faits périmés : (1) `superseded_by:` explicite ; (2) même thème (nom normalisé) avec
 * des dates différentes → l'ancien est potentiellement contredit par le plus récent. Signal advisory
 * (revue humaine), jamais une mutation automatique. Exporté pour test pur.
 */
export function detectSupersededFacts(files: MemoryFile[]): Finding[] {
  const findings: Finding[] = [];

  // 1. superseded_by explicite — le signal le plus fort.
  for (const f of files) {
    if (!f.supersededBy) continue;
    findings.push({
      category: "superseded_fact",
      name: normalizeName(f.name),
      description: `« ${f.name} » se déclare périmé (superseded_by: ${f.supersededBy}) — ne plus s'en servir.`,
      projects: [f.project],
      evidence: [`[${f.project}] ${f.content.slice(0, 150)}`],
      frequency: 1,
    });
  }

  // 2. même thème, dates différentes → l'ancien est contredit par le plus récent.
  const groups = new Map<string, MemoryFile[]>();
  for (const f of files) {
    const k = normalizeName(f.name);
    const g = groups.get(k);
    if (g) g.push(f);
    else groups.set(k, [f]);
  }
  for (const [theme, group] of groups) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => recencyKey(b) - recencyKey(a));
    const newest = sorted[0]!;
    const older = sorted.slice(1).filter((f) => recencyKey(f) < recencyKey(newest));
    if (!older.length) continue; // toutes la même date → pas de contradiction temporelle
    findings.push({
      category: "superseded_fact",
      name: theme,
      description: `${older.length} version(s) plus ancienne(s) de « ${theme} » potentiellement contredite(s) par la plus récente (${newest.project}).`,
      projects: [...new Set(group.map((f) => f.project))],
      evidence: older.map((f) => `[${f.project}] (ancien) ${f.content.slice(0, 120)}`),
      frequency: group.length,
    });
  }

  return findings;
}

async function loadKnownPatterns(path?: string): Promise<Set<string>> {
  if (!path) return new Set();
  try {
    const content = await readFile(path, "utf-8");
    const patterns = JSON.parse(content) as string[];
    return new Set(patterns);
  } catch {
    return new Set();
  }
}

async function main() {
  const knownPatternsPath = process.argv.includes("--known-patterns")
    ? process.argv[process.argv.indexOf("--known-patterns") + 1]
    : undefined;

  const knownPatterns = await loadKnownPatterns(knownPatternsPath);
  const files = await scanMemoryDirs();
  const allFindings = [...groupByTheme(files), ...detectSupersededFacts(files)];

  // Filter out already-known patterns
  const newFindings = allFindings.filter((f) => !knownPatterns.has(f.name));

  const result: ScanResult = {
    timestamp: new Date().toISOString(),
    projectsScanned: new Set(files.map((f) => f.project)).size,
    filesRead: files.length,
    findings: newFindings,
  };

  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.main) {
  main();
}
