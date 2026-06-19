#!/usr/bin/env bun

import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

interface HookInput {
  prompt?: unknown;
  user_prompt?: unknown;
  tool_input?: {
    command?: unknown;
  };
}

interface ClaudeDigest {
  isOutdated?: unknown;
  localVersion?: unknown;
  latestVersion?: unknown;
}

interface Recommendation {
  id?: unknown;
  title?: unknown;
  action?: unknown;
}

interface ProactiveDigest {
  recommendations?: unknown;
}

interface SkillRule {
  skill?: unknown;
  keywords?: unknown;
}

interface SkillRulesFile {
  rules?: unknown;
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

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
}

function projectDir(): string {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

function projectSlug(path: string): string {
  return path.replaceAll("/", "-").replace(/^-/, "");
}

function sessionDigest(): void {
  const lines: string[] = [];
  const ccDigest = readJson<ClaudeDigest>(join(homedir(), ".claude", "corpus", "cc-updates", "digest.json"));

  if (ccDigest?.isOutdated === true) {
    const local = stringValue(ccDigest.localVersion);
    const latest = stringValue(ccDigest.latestVersion);
    if (local && latest) {
      lines.push(`Claude Code ${local} -> ${latest} disponible (npm i -g @anthropic-ai/claude-code@latest)`);
    }
  }

  const proactive = readJson<ProactiveDigest>(
    join(homedir(), ".claude", "corpus", "proactive", `${projectSlug(projectDir())}.json`),
  );
  const recommendations = Array.isArray(proactive?.recommendations)
    ? proactive.recommendations as Recommendation[]
    : [];
  const top = recommendations.find(item => item.id !== "cc-outdated");
  const title = stringValue(top?.title);
  const recommendedAction = stringValue(top?.action);
  if (title && recommendedAction) {
    lines.push(`${title} - ${recommendedAction}`);
  }

  if (!existsSync(join(projectDir(), ".claude"))) {
    lines.push("Pas de .claude/ dans ce projet - /assistant init pour le bootstrapper");
  }

  if (lines.length === 0) return;
  console.log("--- ORCA digest ---");
  for (const line of lines) console.log(line);
  console.log("------------------------");
}

function findTerminalNotifier(): string | null {
  const candidates = [
    "/opt/homebrew/bin/terminal-notifier",
    "/usr/local/bin/terminal-notifier",
  ];
  return candidates.find(path => existsSync(path)) ?? null;
}

function notify(message: string, sound: string): void {
  const notifier = findTerminalNotifier();
  if (!notifier) return;
  Bun.spawnSync([notifier, "-title", "Claude Code", "-message", message, "-sound", sound], {
    stdout: "ignore",
    stderr: "ignore",
  });
}

function gitPushReminder(input: HookInput): void {
  const command = stringValue(input.tool_input?.command);
  if (/^git push/.test(command)) {
    console.log(JSON.stringify({
      systemMessage: "Rappel: vérifiez la branche et le remote avant de push",
    }));
  }
}

function promptText(input: HookInput): string {
  return stringValue(input.prompt) || stringValue(input.user_prompt);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function skillSuggestion(input: HookInput): void {
  const prompt = promptText(input);
  if (!prompt) return;

  const rulesFile = readJson<SkillRulesFile>(join(projectDir(), ".claude", "skill-rules.json"));
  const rules = Array.isArray(rulesFile?.rules) ? rulesFile.rules as SkillRule[] : [];

  for (const rule of rules) {
    const skill = stringValue(rule.skill);
    const keywords = Array.isArray(rule.keywords) ? rule.keywords.map(stringValue).filter(Boolean) : [];
    if (!skill || keywords.length === 0) continue;

    const matched = keywords.some(keyword => new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i").test(prompt));
    if (!matched) continue;

    console.log(JSON.stringify({
      systemMessage: `Skill suggestion: consider running /${skill} for this task`,
    }));
    return;
  }
}

const input = await readHookInput();

if (action === "session-digest") {
  sessionDigest();
} else if (action === "notify-waiting") {
  notify("Claude attend votre réponse", "Glass");
} else if (action === "notify-compact") {
  notify("Context auto-compaction starting", "Submarine");
} else if (action === "git-push-reminder") {
  gitPushReminder(input);
} else if (action === "skill-suggest") {
  skillSuggestion(input);
}
