#!/usr/bin/env bun

/**
 * strategy-select.ts
 * Ranks local community skills/hooks/subagents/plugins for a project profile.
 *
 * Source corpus: resolved via SKILL_LIBRARY_DIR env var, then probed candidates.
 * Output: a pragmatic TOOLKIT_PLAN draft for /init.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import { basename, join, resolve } from "path";

type Category = "skills" | "hooks" | "subagents" | "plugins" | "orchestration" | "security";

interface Candidate {
  category: Category;
  name: string;
  repo: string;
  path: string;
  description: string;
  score: number;
  reasons: string[];
}

function isValidLibrary(candidate: string): boolean {
  try {
    if (!existsSync(candidate) || !statSync(candidate).isDirectory()) return false;
    return existsSync(join(candidate, "skills"));
  } catch {
    return false;
  }
}

function resolveLibraryDir(): string {
  const envOverride = process.env.SKILL_LIBRARY_DIR?.trim();
  // When SKILL_LIBRARY_DIR is set, trust it strictly — fail loud on typo
  // rather than fallback silently to a stale path.
  if (envOverride && envOverride.length > 0) {
    if (isValidLibrary(envOverride)) return envOverride;
    console.error(`[strategy-select] FATAL: SKILL_LIBRARY_DIR="${envOverride}" is not a valid library`);
    console.error("Expected a directory containing skills/, hooks/, subagents/, plugins/.");
    process.exit(2);
  }
  const probes = [
    join(process.env.HOME || "", "Desktop/skill/library"),
  ];
  for (const candidate of probes) {
    if (isValidLibrary(candidate)) return candidate;
  }
  console.error("[strategy-select] FATAL: skill library not found. Tried:");
  for (const candidate of probes) console.error(`  - ${candidate}`);
  console.error("Set SKILL_LIBRARY_DIR to the directory containing skills/hooks/subagents/plugins/.");
  process.exit(2);
}

const LIBRARY_DIR = resolveLibraryDir();
const categories: Category[] = ["skills", "subagents", "hooks", "plugins", "orchestration", "security"];
const args = process.argv.slice(2);
const json = args.includes("--json");
const limit = Number(args.find(arg => arg.startsWith("--limit="))?.slice("--limit=".length) || 10);
const typeArg = args.find(arg => arg.startsWith("--type="))?.slice("--type=".length) || "";
const writeArg = args.find(arg => arg.startsWith("--write="))?.slice("--write=".length);
const queryParts = args.filter(arg => !arg.startsWith("--") && arg !== "--json");

const stopwords = new Set([
  "the", "and", "for", "with", "from", "this", "that", "dans", "pour", "avec", "sur", "les", "des",
  "une", "mon", "mes", "project", "projet", "app", "application", "tool", "outil", "site",
]);

const typeExpansions: Record<string, string[]> = {
  "web-fullstack": ["next", "react", "typescript", "tailwind", "auth", "database", "testing", "e2e", "review", "performance"],
  "website-showcase": ["design", "frontend", "motion", "animation", "lighthouse", "web-vitals", "performance", "accessibility", "copywriting"],
  "api-backend": ["api", "backend", "database", "postgres", "security", "openapi", "auth", "testing", "observability"],
  "bot-agent": ["agent", "llm", "mcp", "memory", "workflow", "orchestration", "evaluation", "guardrails"],
  "cli-tool": ["cli", "terminal", "typescript", "testing", "release", "documentation", "config"],
  "design-only": ["design", "frontend", "accessibility", "figma", "tokens", "component", "review"],
};

const trustedRepoBoosts: Array<[RegExp, number, string]> = [
  [/anthropics--skills/i, 12, "official Anthropic skills spec (2026 dominant)"],
  [/obra--superpowers/i, 12, "superpowers — TDD/discipline socle (most-starred 2026)"],
  [/garrytan--gstack/i, 12, "gstack high-signal workflow"],
  [/trailofbits--skills/i, 8, "security-grade source"],
  [/anthropics--claude-plugins-official/i, 7, "official Claude source"],
  [/hesreallyhim--awesome-claude-code/i, 6, "curated community index (2026)"],
  [/wshobson--agents|ruvnet--ruflo/i, 5, "multi-agent source"],
  [/SuperClaude-Org--SuperClaude_Framework/i, 4, "framework/persona source"],
  [/davila7--claude-code-templates/i, 3, "template/config source"],
];

function usage(): never {
  console.error("Usage: bun scripts/strategy-select.ts <project keywords> [--type=web-fullstack] [--limit=10] [--write=/path] [--json]");
  process.exit(1);
}

if (args.includes("--help") || (queryParts.length === 0 && !typeArg)) usage();

function tokenize(input: string): string[] {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .map(t => t.trim())
    .filter(t => t.length > 2 && !stopwords.has(t));
}

function parseProfile(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) return raw;
  try {
    const parsed = JSON.parse(trimmed);
    return Object.values(parsed)
      .flatMap(value => Array.isArray(value) ? value : [value])
      .filter(value => typeof value === "string")
      .join(" ");
  } catch {
    return raw;
  }
}

function readFirstExisting(paths: string[]): string {
  for (const path of paths) {
    try {
      return readFileSync(path, "utf-8").slice(0, 6000);
    } catch {}
  }
  return "";
}

function frontmatterValue(raw: string, key: string): string | null {
  const match = raw.match(new RegExp(`^${key}:\\s*(.+)$`, "mi"));
  return match?.[1]?.replace(/^["']|["']$/g, "").trim() || null;
}

function repoFromEntry(entry: string): string {
  const parts = entry.split("--");
  return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : entry;
}

function skillNameFromEntry(entry: string): string {
  const parts = entry.split("--");
  return parts.length >= 3 ? parts.slice(2).join("--") : entry;
}

function scoreCandidate(candidate: Candidate, terms: Set<string>): Candidate {
  const hayName = tokenize(candidate.name).join(" ");
  const hayRepo = tokenize(candidate.repo).join(" ");
  const hayDescription = tokenize(candidate.description).join(" ");

  for (const term of terms) {
    if (hayName.includes(term)) {
      candidate.score += 8;
      candidate.reasons.push(`name:${term}`);
    }
    if (hayDescription.includes(term)) {
      candidate.score += 4;
      candidate.reasons.push(`desc:${term}`);
    }
    if (hayRepo.includes(term)) {
      candidate.score += 2;
      candidate.reasons.push(`repo:${term}`);
    }
  }

  for (const [pattern, boost, reason] of trustedRepoBoosts) {
    if (pattern.test(candidate.path)) {
      candidate.score += boost;
      candidate.reasons.push(reason);
      break;
    }
  }

  if (["review", "qa", "careful", "browse", "ship", "investigate"].includes(candidate.name.toLowerCase())) {
    candidate.score += 15;
    candidate.reasons.push("baseline senior-dev workflow");
  }

  return candidate;
}

function collectCandidates(): Candidate[] {
  const candidates: Candidate[] = [];

  for (const category of categories) {
    const dir = join(LIBRARY_DIR, category);
    if (!existsSync(dir)) continue;

    for (const entry of readdirSync(dir)) {
      const entryPath = join(dir, entry);
      try {
        if (!statSync(entryPath).isDirectory()) continue;
      } catch {
        continue;
      }

      const raw = category === "skills"
        ? readFirstExisting([join(entryPath, "SKILL.md"), join(entryPath, "README.md")])
        : readFirstExisting([join(entryPath, "README.md"), join(entryPath, "CLAUDE.md")]);

      const name = frontmatterValue(raw, "name") || skillNameFromEntry(entry);
      const description = frontmatterValue(raw, "description") || raw.split("\n").find(line => line.trim().length > 40) || "";

      candidates.push({
        category,
        name,
        repo: repoFromEntry(entry),
        path: entryPath,
        description: description.replace(/\s+/g, " ").slice(0, 240),
        score: 0,
        reasons: [],
      });
    }
  }

  return candidates;
}

function groupTop(candidates: Candidate[], perCategoryLimit: number): Record<Category, Candidate[]> {
  const grouped = {} as Record<Category, Candidate[]>;
  for (const category of categories) {
    const bestByName = new Map<string, Candidate>();
    for (const candidate of candidates.filter(candidate => candidate.category === category && candidate.score > 0)) {
      const key = candidate.name.toLowerCase();
      const existing = bestByName.get(key);
      if (!existing || candidate.score > existing.score) {
        bestByName.set(key, candidate);
      }
    }

    grouped[category] = Array.from(bestByName.values())
      .filter(candidate => candidate.category === category && candidate.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, perCategoryLimit);
  }
  return grouped;
}

function renderMarkdown(grouped: Record<Category, Candidate[]>, terms: string[]): string {
  const lines: string[] = [];
  lines.push("# TOOLKIT_PLAN");
  lines.push("");
  lines.push(`Query terms: ${terms.join(", ")}`);
  lines.push("");
  lines.push("## Baseline");
  lines.push("");
  lines.push("- Always install/use: browse, careful, investigate, qa, review, ship");
  lines.push("- Always generate: planner, executor, reviewer, qa-hunter, slop-janitor, architect-auditor, e2e-scripter, security-reviewer, backend-auditor, perf-auditor, a11y-auditor");
  lines.push("- Always configure: security hooks, quality hooks, SessionStart digest, just-in-time memory recall, autonomous loop tour");
  lines.push("");

  for (const category of categories) {
    const items = grouped[category];
    if (items.length === 0) continue;
    lines.push(`## ${category}`);
    lines.push("");
    for (const item of items) {
      lines.push(`- **${item.name}** (${item.score}) — ${item.repo}`);
      lines.push(`  - Path: \`${item.path}\``);
      if (item.description) lines.push(`  - Why: ${item.description}`);
      lines.push(`  - Match: ${item.reasons.slice(0, 5).join(", ")}`);
    }
    lines.push("");
  }

  lines.push("## Cut line");
  lines.push("");
  lines.push("Keep only matches that map to a concrete workflow, quality gate, domain rule, or integration. Do not install broad libraries just because they scored well.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

const query = parseProfile(queryParts.join(" "));
const terms = Array.from(new Set([
  ...tokenize(query),
  ...tokenize(typeArg),
  ...(typeExpansions[typeArg] || []),
]));

const candidates = collectCandidates().map(candidate => scoreCandidate(candidate, new Set(terms)));
const grouped = groupTop(candidates, Math.max(3, limit));

if (json) {
  console.log(JSON.stringify({ terms, grouped }, null, 2));
} else {
  const markdown = renderMarkdown(grouped, terms);
  console.log(markdown);
  if (writeArg) {
    const outputDir = resolve(writeArg);
    const claudeDir = join(outputDir, ".claude");
    mkdirSync(claudeDir, { recursive: true });
    const outputPath = join(claudeDir, "TOOLKIT_PLAN.md");
    writeFileSync(outputPath, markdown);
    console.error(`Wrote ${outputPath}`);
  }
}
