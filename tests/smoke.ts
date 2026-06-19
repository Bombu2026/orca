#!/usr/bin/env bun

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "fs";
import { join } from "path";

const ROOT = import.meta.dir.slice(0, import.meta.dir.lastIndexOf("/")); // repo root, portable
const TMP = "/tmp/assistant-smoke";
const generatedTextPattern = /\.(md|json|toml)$/;
const claudeAgents = [
  "planner.md",
  "executor.md",
  "reviewer.md",
  "qa-hunter.md",
  "slop-janitor.md",
  "architect-auditor.md",
  "e2e-scripter.md",
];
const webAuditors = ["security-reviewer.md", "backend-auditor.md", "perf-auditor.md", "a11y-auditor.md"];
const shipCommands = ["ship-check.md", "ship100.md"];
const memoryProtocolFiles = [
  "MEMORY.md",
  "feedback_conventions.md",
  "feature-checklist.md",
  "progress.md",
  "project_purpose.md",
  "project_stack.md",
  "reference_claude_md.md",
  "user_role.md",
];
const hookRuntimeFiles = ["security.ts", "quality.ts", "dx.ts", "showcase.ts", "context.ts", "cost-safety.ts"];

function assert(condition: unknown, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

function run(args: string[]): void {
  const result = Bun.spawnSync(args, { cwd: ROOT });
  if (result.exitCode !== 0) {
    console.error(result.stdout.toString());
    console.error(result.stderr.toString());
    process.exit(result.exitCode);
  }
}

function walkFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) files.push(...walkFiles(path));
    else files.push(path);
  }
  return files;
}

function assertFile(path: string, message: string): void {
  assert(existsSync(path), message);
}

function assertFiles(baseDir: string, relativeDir: string, files: string[], label: string): void {
  for (const file of files) {
    assertFile(join(baseDir, relativeDir, file), `generated ${label}: ${relativeDir}/${file}`);
  }
}

function relativePath(baseDir: string, path: string): string {
  const prefix = `${baseDir}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

function assertNoUnresolvedPlaceholders(projectDir: string): void {
  const unresolved = walkFiles(projectDir)
    .filter(path => generatedTextPattern.test(path))
    .flatMap(path => {
      const matches = readFileSync(path, "utf-8").match(/\{\{[A-Z0-9_]+\}\}/g) ?? [];
      return [...new Set(matches)].map(match => `${relativePath(projectDir, path)}: ${match}`);
    });

  assert(unresolved.length === 0, `no unresolved placeholders\n${unresolved.join("\n")}`);
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf-8")) as unknown;
}

function hookCommands(projectDir: string): string[] {
  const settings = readJson(join(projectDir, ".claude", "settings.local.json"));
  const hooks = settings && typeof settings === "object" && "hooks" in settings
    ? (settings as { hooks?: unknown }).hooks
    : {};
  const commands: string[] = [];
  if (!hooks || typeof hooks !== "object" || Array.isArray(hooks)) return commands;

  for (const entries of Object.values(hooks)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry) || !("hooks" in entry)) continue;
      const nestedHooks = (entry as { hooks?: unknown }).hooks;
      if (!Array.isArray(nestedHooks)) continue;
      for (const hook of nestedHooks) {
        if (hook && typeof hook === "object" && "command" in hook && typeof (hook as { command?: unknown }).command === "string") {
          commands.push((hook as { command: string }).command);
        }
      }
    }
  }
  return commands;
}

function assertHookRuntimeIntegrity(projectDir: string): void {
  assertFiles(projectDir, ".claude/hooks", hookRuntimeFiles, "hook runtime");
  for (const command of hookCommands(projectDir)) {
    const match = command.match(/^bun \.claude\/hooks\/([a-z-]+\.ts)\b/);
    if (!match) continue;
    assertFile(join(projectDir, ".claude", "hooks", match[1]), `hook runtime exists for ${command}`);
  }
}

function assertSecurityHookVariant(projectDir: string, expected: "standard" | "strict"): void {
  const commands = hookCommands(projectDir).filter(command => command.includes(".claude/hooks/security.ts"));
  assert(commands.some(command => command.includes(` ${expected}`) || (expected === "strict" && command.includes("destructive-git"))), `security hooks include ${expected}`);
  const forbidden = expected === "strict" ? " standard" : " strict";
  assert(!commands.some(command => command.includes(forbidden)), `security hooks do not include${forbidden}`);
}

function assertMemorySeed(projectDir: string): void {
  const memoryDir = join(projectDir, ".claude", "memory");
  const index = readFileSync(join(memoryDir, "MEMORY.md"), "utf-8");
  assert(index.startsWith("- ["), "MEMORY.md is a short markdown index without frontmatter");

  for (const file of memoryProtocolFiles.filter(file => file !== "MEMORY.md")) {
    const content = readFileSync(join(memoryDir, file), "utf-8");
    assert(index.includes(file), `MEMORY.md references ${file}`);
    assert(content.startsWith("---\n"), `${file} has frontmatter`);
    assert(/^type: (user|feedback|project|reference)$/m.test(content), `${file} has valid memory type`);
  }

  const reference = readFileSync(join(memoryDir, "reference_claude_md.md"), "utf-8");
  assert(reference.includes(".claude/CLAUDE.md"), "reference_claude_md points to Claude instructions");

  const stack = readFileSync(join(memoryDir, "project_stack.md"), "utf-8");
  assert(stack.includes("bun") && stack.includes("next.js"), "project_stack contains configured smoke runtime/framework");
}

function generateProject(name: string, options: Record<string, string>): string {
  const projectDir = join(TMP, name);
  mkdirSync(projectDir, { recursive: true });

  run([
    "bun",
    "scripts/generate-config.ts",
    "web-fullstack",
    projectDir,
    JSON.stringify({
      projectName: `Assistant Smoke ${name}`,
      framework: "next.js",
      runtime: "bun",
      packageManager: "bun",
      ...options,
    }),
  ]);

  return projectDir;
}

function assertBaseProject(projectDir: string): void {
  assertFile(join(projectDir, ".claude", "CLAUDE.md"), "generated .claude/CLAUDE.md");
  assertFile(join(projectDir, ".claude", "settings.local.json"), "generated settings.local.json");
}

function assertShipWorkflow(projectDir: string): void {
  assertFiles(projectDir, ".claude/commands", shipCommands, "ship command");

  const hasShipCommand = shipCommands.some(command => existsSync(join(projectDir, ".claude", "commands", command)));
  if (hasShipCommand) {
    assertFiles(projectDir, ".claude/agents", claudeAgents, "Claude agent required by ship workflow");
  }

  assertFiles(projectDir, ".claude/memory", memoryProtocolFiles, "memory protocol");
  assertMemorySeed(projectDir);
  assertFile(join(projectDir, ".claude", "scripts", "ship-check-gate.ts"), "generated ship-check gate");
  assertFile(join(projectDir, "REVIEW.md"), "generated REVIEW.md");
}

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

for (const projectDir of [
  generateProject("default", {}),
  generateProject("team", { workflow: "team" }),
]) {
  assertBaseProject(projectDir);
  assertFile(join(projectDir, ".claude", "loop.md"), "generated .claude/loop.md (autonomous loop tour)");
  assert(readFileSync(join(projectDir, ".claude", "loop.md"), "utf-8").includes("loop-controller.ts tick"), "loop.md invokes the bounded loop controller");
  assertShipWorkflow(projectDir);
  assertFiles(projectDir, ".claude/agents", webAuditors, "web-fullstack baseline auditor");
  assertFile(join(projectDir, ".claude", "agents", "gui-verifier.md"), "web-fullstack gui-verifier (screenshot→act loop)");
  assertHookRuntimeIntegrity(projectDir);
  assertSecurityHookVariant(projectDir, "standard");
  // Primitives context-engineering 2026 : trim des sorties Bash + dump d'état avant compaction.
  const ctxCommands = hookCommands(projectDir);
  assert(ctxCommands.some(c => c.includes("context.ts tool-output-trim")), "context: PostToolUse tool-output-trim wired");
  assert(ctxCommands.some(c => c.includes("context.ts precompact-dump")), "context: PreCompact precompact-dump wired");
  // Spec-driven gate : verrou feature-list.json copié + câblé en PreToolUse.
  assertFile(join(projectDir, ".claude", "scripts", "spec-gate.ts"), "generated spec-gate (feature-list lock)");
  assert(ctxCommands.some(c => c.includes("scripts/spec-gate.ts")), "spec-gate: PreToolUse Write|Edit|MultiEdit wired");
  // Constitution always-on : non-négociables dans le CLAUDE.md (injecté chaque tour).
  const claudeMd = readFileSync(join(projectDir, ".claude", "CLAUDE.md"), "utf-8");
  assert(claudeMd.includes("## Non-négociables"), "CLAUDE.md carries the always-on Non-négociables section");
  assert(claudeMd.includes("preuve directe"), "Non-négociables includes the proof-not-build-green lock");
  // OS sandbox : dossiers de secrets refusés (universel, défense en profondeur).
  const settingsObj = readJson(join(projectDir, ".claude", "settings.local.json")) as {
    sandbox?: { filesystem?: { deniedPaths?: string[] } };
  };
  const sandboxDenied = settingsObj.sandbox?.filesystem?.deniedPaths ?? [];
  assert(sandboxDenied.includes("~/.ssh") && sandboxDenied.includes("~/.aws"), "sandbox denies secret dirs (~/.ssh, ~/.aws)");
  assert(readFileSync(join(projectDir, ".claude", "commands", "test.md"), "utf-8").includes("bun run test"), "generated /test uses package test script");
  assertNoUnresolvedPlaceholders(projectDir);
}

// ENABLE_TOOL_SEARCH : posé seulement quand le projet voit > 2 serveurs MCP. Test isolé via
// ASSISTANT_HOME (home vide) pour ne pas dépendre de la config MCP réelle du poste.
function envOf(projectDir: string): Record<string, unknown> {
  const settings = readJson(join(projectDir, ".claude", "settings.local.json"));
  return settings && typeof settings === "object" && "env" in settings
    ? ((settings as { env?: Record<string, unknown> }).env ?? {})
    : {};
}
function generateIsolated(name: string, mcpServers: string[], home: string): string {
  const projectDir = join(TMP, name);
  mkdirSync(projectDir, { recursive: true });
  if (mcpServers.length) {
    const servers: Record<string, unknown> = {};
    for (const s of mcpServers) servers[s] = {};
    writeFileSync(join(projectDir, ".mcp.json"), JSON.stringify({ mcpServers: servers }));
  }
  const result = Bun.spawnSync(
    ["bun", "scripts/generate-config.ts", "cli-tool", projectDir, JSON.stringify({ runtime: "bun", packageManager: "bun" })],
    { cwd: ROOT, env: { ...process.env, ASSISTANT_HOME: home } },
  );
  assert(result.exitCode === 0, `isolated generate ${name} exit 0`);
  return projectDir;
}
{
  const isoHome = join(TMP, "iso-home");
  mkdirSync(isoHome, { recursive: true });
  writeFileSync(join(isoHome, ".claude.json"), "{}"); // global MCP vide → seul .mcp.json compte
  const many = generateIsolated("mcp-many", ["a", "b", "c"], isoHome);
  assert(envOf(many).ENABLE_TOOL_SEARCH === "1", "ENABLE_TOOL_SEARCH=1 when >2 MCP servers visible");
  const few = generateIsolated("mcp-few", ["a", "b"], isoHome);
  assert(!("ENABLE_TOOL_SEARCH" in envOf(few)), "no ENABLE_TOOL_SEARCH at threshold (2 MCP)");
  const none = generateIsolated("mcp-none", [], isoHome);
  assert(!("ENABLE_TOOL_SEARCH" in envOf(none)), "no ENABLE_TOOL_SEARCH with 0 MCP");
}

// Constitution always-on : les décisions figées + hors-scope confirmés en interview atterrissent
// dans le ## Non-négociables du CLAUDE.md généré (injecté chaque tour), pas seulement le BRIEF.
{
  const constDir = join(TMP, "constitution");
  mkdirSync(constDir, { recursive: true });
  run([
    "bun",
    "scripts/generate-config.ts",
    "web-fullstack",
    constDir,
    JSON.stringify({
      runtime: "bun",
      packageManager: "bun",
      auth: "Better-auth",
      fixedDecisions: ["UE hosting imposed"],
      outOfScope: ["no payments v1"],
    }),
  ]);
  const constMd = readFileSync(join(constDir, ".claude", "CLAUDE.md"), "utf-8");
  assert(constMd.includes("## Non-négociables"), "constitution section present");
  assert(constMd.includes("UE hosting imposed"), "interview fixed-decisions reach the always-on constitution");
  assert(constMd.includes("no payments v1"), "interview out-of-scope reach the always-on constitution");
  assert(constMd.includes("Better-auth"), "stack lock surfaces the chosen auth");
}

// Cost-safety hooks : générés pour les projets LLM-backed (claude -p), absents sinon.
{
  const botDir = join(TMP, "cost-bot");
  mkdirSync(botDir, { recursive: true });
  run(["bun", "scripts/generate-config.ts", "bot-agent", botDir, JSON.stringify({ runtime: "bun", packageManager: "bun" })]);
  const botHooks = hookCommands(botDir);
  assert(botHooks.some(c => c.includes("cost-safety.ts bulk-api-guard")), "bot-agent wires bulk-api-guard");
  assert(botHooks.some(c => c.includes("cost-safety.ts agent-spawn-guard")), "bot-agent wires agent-spawn-guard");

  const cliDir = join(TMP, "cost-cli");
  mkdirSync(cliDir, { recursive: true });
  run(["bun", "scripts/generate-config.ts", "cli-tool", cliDir, JSON.stringify({ runtime: "bun", packageManager: "bun" })]);
  assert(!hookCommands(cliDir).some(c => c.includes("cost-safety.ts")), "cli-tool (not LLM-backed) has no cost-safety hooks");
  assert(!existsSync(join(cliDir, ".claude", "agents", "gui-verifier.md")), "cli-tool (no UI) has no gui-verifier");
}

const noOverwriteDir = generateProject("no-overwrite", {});
writeFileSync(join(noOverwriteDir, ".claude", "CLAUDE.md"), "USER CUSTOM CLAUDE\n");
writeFileSync(join(noOverwriteDir, ".claude", "agents", "planner.md"), "USER CUSTOM PLANNER\n");
writeFileSync(join(noOverwriteDir, ".claude", "hooks", "security.ts"), "USER CUSTOM SECURITY HOOK\n");
run([
  "bun",
  "scripts/generate-config.ts",
  "web-fullstack",
  noOverwriteDir,
  JSON.stringify({ projectName: "No Overwrite", runtime: "bun", packageManager: "bun", bypassPermissions: true }),
]);
assert(readFileSync(join(noOverwriteDir, ".claude", "CLAUDE.md"), "utf-8") === "USER CUSTOM CLAUDE\n", "generate-config preserves existing CLAUDE.md without --force");
assert(readFileSync(join(noOverwriteDir, ".claude", "agents", "planner.md"), "utf-8") === "USER CUSTOM PLANNER\n", "generate-config preserves existing agents without --force");
assert(readFileSync(join(noOverwriteDir, ".claude", "hooks", "security.ts"), "utf-8") === "USER CUSTOM SECURITY HOOK\n", "generate-config preserves existing hook runtimes without --force");
assertSecurityHookVariant(noOverwriteDir, "strict");

const invalidResult = Bun.spawnSync(["bun", "scripts/generate-config.ts", "web-fullstak", join(TMP, "invalid-type")], { cwd: ROOT });
assert(invalidResult.exitCode !== 0, "generate-config rejects invalid project type");

const vitrineDir = join(TMP, "vitrine");
run(["bun", "scripts/vitrine-seed.ts", vitrineDir, "simple"]);
assertBaseProject(vitrineDir);
assertFile(join(vitrineDir, ".claude", "agents", "security-reviewer.md"), "showcase baseline security-reviewer (doctrine: sécurité sur chaque projet)");
assertFile(join(vitrineDir, ".claude", "agents", "gui-verifier.md"), "showcase gui-verifier (screenshot→act loop)");
assertFile(join(vitrineDir, "REVIEW.md"), "generated showcase REVIEW.md");
assertFile(join(vitrineDir, ".claude", "scripts", "ship-check-gate.ts"), "generated showcase ship-check gate");
assert(readFileSync(join(vitrineDir, ".claude", "commands", "ship-vitrine.md"), "utf-8").includes("ship-check-gate.ts"), "showcase ship command runs deterministic gate");
assertHookRuntimeIntegrity(vitrineDir);
assertNoUnresolvedPlaceholders(vitrineDir);

writeFileSync(join(vitrineDir, ".claude", "CLAUDE.md"), "USER CUSTOM SHOWCASE CLAUDE\n");
writeFileSync(join(vitrineDir, ".claude", "hooks", "security.ts"), "USER CUSTOM SHOWCASE SECURITY HOOK\n");
run(["bun", "scripts/vitrine-seed.ts", vitrineDir, "simple"]);
assert(readFileSync(join(vitrineDir, ".claude", "CLAUDE.md"), "utf-8") === "USER CUSTOM SHOWCASE CLAUDE\n", "vitrine-seed preserves existing CLAUDE.md without --force");
assert(readFileSync(join(vitrineDir, ".claude", "hooks", "security.ts"), "utf-8") === "USER CUSTOM SHOWCASE SECURITY HOOK\n", "vitrine-seed preserves existing hook runtimes without --force");

const autoBrief = join(ROOT, "templates", "showcase", "BRIEF.template.md");
const autoVitrineDir = join(TMP, "vitrine-auto");
run(["bun", "scripts/vitrine-seed.ts", autoVitrineDir, autoBrief]);
assertFile(join(autoVitrineDir, "docs", "BRIEF.md"), "auto-tier generated BRIEF.md");

console.log("smoke: ok");
