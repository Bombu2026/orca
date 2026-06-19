#!/usr/bin/env bun

import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join, resolve } from "path";

type Command = "capture" | "list" | "graduate" | "prune";
type Status = "pending" | "graduated" | "rejected";

interface CorrectionEntry {
  id: string;
  ts: string;
  updatedAt?: string;
  projectDir: string;
  pattern: string;
  snippet: string;
  status: Status;
  note?: string;
}

interface CliOptions {
  command: Command;
  projectDir: string;
  homeDir: string;
  id?: string;
  note?: string;
  max: number;
}

const CORRECTION_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "fr-tu-te-trompes", pattern: /\btu te trompes\b/i },
  { name: "fr-c-est-faux", pattern: /\bc['’]est faux\b/i },
  { name: "fr-non-c-est-pas", pattern: /\bnon[,\s]+c['’]est pas\b/i },
  { name: "fr-ne-fais-pas", pattern: /\bne fai[st] pas\b/i },
  { name: "fr-au-lieu-de", pattern: /\bau lieu de\b/i },
  { name: "fr-fais-plutot", pattern: /\bfai[st] plut[oô]t\b/i },
  { name: "en-dont", pattern: /\bdon['’]?t\b/i },
  { name: "en-stop", pattern: /\bstop\b/i },
  { name: "en-instead-of", pattern: /\binstead of\b/i },
  { name: "en-no-correction", pattern: /(^|[\s,.;:!?])no[\s,.;:!?]/i },
];

function parseArgs(args: string[]): CliOptions {
  const command = (args.find(arg => !arg.startsWith("--")) || "capture") as Command;
  if (!["capture", "list", "graduate", "prune"].includes(command)) {
    throw new Error(`Unknown command: ${command}`);
  }

  const projectDir = args.find(arg => arg.startsWith("--project="))?.slice("--project=".length)
    || process.env.CLAUDE_PROJECT_DIR
    || process.cwd();
  const homeDir = args.find(arg => arg.startsWith("--home="))?.slice("--home=".length)
    || process.env.ASSISTANT_MEMORY_HOME
    || homedir();
  const id = args.find(arg => arg.startsWith("--id="))?.slice("--id=".length);
  const note = args.find(arg => arg.startsWith("--note="))?.slice("--note=".length);
  const rawMax = Number(args.find(arg => arg.startsWith("--max="))?.slice("--max=".length) || 200);

  return {
    command,
    projectDir: resolve(projectDir),
    homeDir: resolve(homeDir),
    id,
    note,
    max: Number.isFinite(rawMax) && rawMax > 0 ? Math.floor(rawMax) : 200,
  };
}

async function readStdin(): Promise<string> {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  return raw;
}

function promptFromInput(raw: string): string {
  if (!raw.trim()) return "";
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const object = parsed as Record<string, unknown>;
      for (const key of ["prompt", "user_prompt", "message", "text"]) {
        const value = object[key];
        if (typeof value === "string") return value;
      }
    }
  } catch {}
  return raw;
}

function detectedPattern(prompt: string): string | null {
  for (const item of CORRECTION_PATTERNS) {
    if (item.pattern.test(prompt)) return item.name;
  }
  return null;
}

function projectSlug(projectDir: string): string {
  const slug = resolve(projectDir).replaceAll("/", "-");
  if (!slug || slug.includes("..") || slug.includes("/")) {
    throw new Error("Unsafe project slug");
  }
  return slug;
}

function queueDir(options: CliOptions): string {
  return join(options.homeDir, ".claude", "projects", projectSlug(options.projectDir), "memory");
}

function jsonlPath(options: CliOptions): string {
  return join(queueDir(options), "corrections-queue.jsonl");
}

function markdownPath(options: CliOptions): string {
  return join(queueDir(options), "corrections-queue.md");
}

function normalizePrompt(prompt: string): string {
  return prompt.replace(/\s+/g, " ").trim();
}

function snippet(prompt: string): string {
  const normalized = normalizePrompt(prompt);
  return normalized.length > 240 ? `${normalized.slice(0, 237)}...` : normalized;
}

function entryId(projectDir: string, prompt: string): string {
  return createHash("sha256")
    .update(`${projectDir}\n${normalizePrompt(prompt).toLowerCase()}`)
    .digest("hex")
    .slice(0, 16);
}

function readEntries(options: CliOptions): CorrectionEntry[] {
  const path = jsonlPath(options);
  if (!existsSync(path)) return [];
  const entries: CorrectionEntry[] = [];
  for (const line of readFileSync(path, "utf-8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as CorrectionEntry;
      if (parsed.id && parsed.snippet && parsed.status) entries.push(parsed);
    } catch {}
  }
  return entries;
}

function writeEntries(options: CliOptions, entries: CorrectionEntry[]): void {
  mkdirSync(queueDir(options), { recursive: true });
  const lines = entries.map(entry => JSON.stringify(entry)).join("\n");
  writeFileSync(jsonlPath(options), lines.length > 0 ? `${lines}\n` : "");
  writeMarkdown(options, entries);
}

function markdownSection(title: string, entries: CorrectionEntry[]): string[] {
  const lines = [`## ${title}`, ""];
  if (entries.length === 0) {
    lines.push("_None._", "");
    return lines;
  }
  for (const entry of entries) {
    const checked = entry.status === "graduated" ? "x" : " ";
    const note = entry.note ? ` — ${entry.note}` : "";
    lines.push(`- [${checked}] **${entry.ts}** \`${entry.id}\` — ${entry.snippet}${note}`);
  }
  lines.push("");
  return lines;
}

function writeMarkdown(options: CliOptions, entries: CorrectionEntry[]): void {
  mkdirSync(queueDir(options), { recursive: true });
  const pending = entries.filter(entry => entry.status === "pending");
  const graduated = entries.filter(entry => entry.status === "graduated");
  const rejected = entries.filter(entry => entry.status === "rejected");
  const lines = [
    "---",
    "name: Corrections queue",
    "description: Detected user corrections awaiting review before graduation to feedback memories.",
    "type: project",
    "---",
    "",
    "# Corrections Queue",
    "",
    "Machine source: `corrections-queue.jsonl`.",
    "",
    ...markdownSection("Pending", pending),
    ...markdownSection("Graduated", graduated),
    ...markdownSection("Rejected", rejected),
  ];
  writeFileSync(markdownPath(options), lines.join("\n"));
}

async function capture(options: CliOptions): Promise<void> {
  const prompt = promptFromInput(await readStdin());
  const pattern = detectedPattern(prompt);
  if (!pattern) {
    console.log(JSON.stringify({ ok: true, captured: false, reason: "no correction pattern" }));
    return;
  }

  const entries = readEntries(options);
  const id = entryId(options.projectDir, prompt);
  if (entries.some(entry => entry.id === id)) {
    writeMarkdown(options, entries);
    console.log(JSON.stringify({ ok: true, captured: false, duplicate: true, id, artifact: markdownPath(options) }));
    return;
  }

  const entry: CorrectionEntry = {
    id,
    ts: new Date().toISOString(),
    projectDir: options.projectDir,
    pattern,
    snippet: snippet(prompt),
    status: "pending",
  };
  entries.push(entry);
  writeEntries(options, entries);
  console.log(JSON.stringify({ ok: true, captured: true, id, artifact: markdownPath(options) }));
}

function list(options: CliOptions): void {
  const entries = readEntries(options);
  writeMarkdown(options, entries);
  const counts = entries.reduce<Record<Status, number>>((acc, entry) => {
    acc[entry.status] += 1;
    return acc;
  }, { pending: 0, graduated: 0, rejected: 0 });
  console.log(JSON.stringify({ ok: true, total: entries.length, counts, artifact: markdownPath(options) }, null, 2));
}

function graduate(options: CliOptions): void {
  if (!options.id) throw new Error("graduate requires --id=<entry-id>");
  const entries = readEntries(options);
  let updated = false;
  const next = entries.map(entry => {
    if (entry.id !== options.id) return entry;
    updated = true;
    return {
      ...entry,
      status: "graduated" as Status,
      updatedAt: new Date().toISOString(),
      note: options.note || entry.note,
    };
  });
  if (!updated) throw new Error(`Correction not found: ${options.id}`);
  writeEntries(options, next);
  console.log(JSON.stringify({ ok: true, graduated: options.id, artifact: markdownPath(options) }));
}

function prune(options: CliOptions): void {
  const entries = readEntries(options)
    .filter(entry => entry.status !== "rejected")
    .slice(-options.max);
  writeEntries(options, entries);
  console.log(JSON.stringify({ ok: true, kept: entries.length, artifact: markdownPath(options) }));
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === "capture") {
    await capture(options);
    return;
  }
  if (options.command === "list") {
    list(options);
    return;
  }
  if (options.command === "graduate") {
    graduate(options);
    return;
  }
  prune(options);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
