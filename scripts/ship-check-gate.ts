#!/usr/bin/env bun

import { existsSync, readFileSync, statSync } from "fs";
import { join, resolve } from "path";

const REPORT_NAMES = ["BUGS.md", "SLOP.md", "ARCH.md", "CODE_PATH_COVERAGE.md", "E2E_REPORT.md", "SHIP_CHECK.md", "SHIP_PROOF.json"] as const;

type ReportName = (typeof REPORT_NAMES)[number];
type Rule =
  | "missing-report"
  | "empty-report"
  | "critical-high-blocker"
  | "architecture-boundary"
  | "e2e-proof"
  | "ship-proof"
  | "ship-decision";
type ShipDecision = "SHIP" | "SHIP WITH CAVEATS" | "DON'T SHIP" | "SHIP UNCERTAIN";

interface CliOptions {
  targetDir: string;
  json: boolean;
  help: boolean;
}

interface Report {
  name: ReportName;
  path: string;
  exists: boolean;
  content: string;
}

interface GateIssue {
  report: ReportName;
  rule: Rule;
  evidence: string;
}

interface GateResult {
  ok: boolean;
  targetDir: string;
  decision: ShipDecision | null;
  reports: Array<{ name: ReportName; exists: boolean; bytes: number }>;
  issues: GateIssue[];
}

interface MarkdownSection {
  heading: string;
  level: number;
  body: string;
  lineNumber: number;
}

interface ShipProof {
  decision?: unknown;
  commands?: unknown;
  reviewers?: unknown;
  blockers?: unknown;
}

function usage(): string {
  return [
    "Usage: bun scripts/ship-check-gate.ts [target-dir] [--json]",
    "",
    "Reads BUGS.md, SLOP.md, ARCH.md, CODE_PATH_COVERAGE.md, E2E_REPORT.md, SHIP_CHECK.md, and SHIP_PROOF.json.",
    "Fails on critical/high blockers, dependency cycles, boundary violations,",
    "missing E2E/headful proof, or DON'T SHIP / SHIP UNCERTAIN decisions.",
  ].join("\n");
}

function parseArgs(args: string[]): CliOptions {
  let targetDir: string | null = null;
  let json = false;
  let help = false;

  for (const arg of args) {
    if (arg === "--json") {
      json = true;
    } else if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg.startsWith("--target=")) {
      targetDir = arg.slice("--target=".length);
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (targetDir === null) {
      targetDir = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  return {
    targetDir: resolve(targetDir || process.cwd()),
    json,
    help,
  };
}

function readReport(targetDir: string, name: ReportName): Report {
  const path = join(targetDir, name);
  if (!existsSync(path)) return { name, path, exists: false, content: "" };

  const stat = statSync(path);
  if (!stat.isFile()) return { name, path, exists: false, content: "" };

  return {
    name,
    path,
    exists: true,
    content: readFileSync(path, "utf-8"),
  };
}

function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function plain(text: string): string {
  return fold(text)
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function evidence(text: string): string {
  return text.trim().replace(/\s+/g, " ").slice(0, 220);
}

function isNoFindingText(text: string): boolean {
  const normalized = plain(text);
  if (normalized.length === 0) return true;
  if (/^(aucun|aucune|none|na|n a|ras|rien|zero|0|nothing)\b/.test(normalized)) return true;
  if (/^(no|pas de|pas d)\b/.test(normalized)) return true;
  if (/\b(aucun|aucune|none|zero|0)\s+(critical|critique|high|blocker|bloqueur|bug|finding|issue|cycle|violation)/.test(normalized)) return true;
  return /\b(no|pas de|pas d)\s+(critical|critique|high|blocker|bloqueur|bug|finding|issue|cycle|violation)/.test(normalized);
}

function hasSubstantiveFinding(text: string): boolean {
  const meaningful = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .filter(line => !/^`{3,}/.test(line))
    .filter(line => plain(line).replace(/\./g, "").length > 0);

  if (meaningful.length === 0) return false;
  return !isNoFindingText(meaningful.join(" "));
}

function parseSections(content: string): MarkdownSection[] {
  const lines = content.split(/\r?\n/);
  const sections: MarkdownSection[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index]?.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    // groupes 1 (#) et 2 (titre) garantis présents quand le regex matche
    const hashes = match?.[1];
    const heading = match?.[2];
    if (hashes === undefined || heading === undefined) continue;

    const level = hashes.length;
    const bodyStart = index + 1;
    let bodyEnd = lines.length;

    for (let next = bodyStart; next < lines.length; next += 1) {
      const nextMatch = lines[next]?.match(/^(#{1,6})\s+/);
      const nextHashes = nextMatch?.[1];
      if (nextHashes !== undefined && nextHashes.length <= level) {
        bodyEnd = next;
        break;
      }
    }

    sections.push({
      heading,
      level,
      body: lines.slice(bodyStart, bodyEnd).join("\n"),
      lineNumber: index + 1,
    });
  }

  return sections;
}

function severityHeading(heading: string): "critical" | "high" | null {
  const normalized = plain(heading);
  if (/^(severity|severite|priority|priorite)\s+(critical|critique|critiques)\b/.test(normalized)) return "critical";
  if (/^(severity|severite|priority|priorite)\s+(high|haute|haut|eleve|elevee|eleves|elevees)\b/.test(normalized)) return "high";
  if (/^(p[0-9]\s+)?(critical|critique|critiques)(\s+(issues|findings|blockers|bugs|risks|risques|bloqueurs|bloquants|problemes))?$/.test(normalized)) return "critical";
  if (/^(p[0-9]\s+)?(high|haute|haut|eleve|elevee|eleves|elevees)(\s+(issues|findings|blockers|bugs|risks|risques|bloqueurs|bloquants|problemes))?$/.test(normalized)) return "high";
  return null;
}

function firstEvidence(text: string): string {
  const line = text
    .split(/\r?\n/)
    .map(item => item.trim())
    .find(item => item.length > 0 && !/^`{3,}/.test(item));
  return evidence(line || text);
}

function parseSeverityCounts(line: string): Array<{ severity: "critical" | "high"; count: number }> {
  const normalized = plain(line);
  const counts: Array<{ severity: "critical" | "high"; count: number }> = [];

  for (const match of normalized.matchAll(/\b(critical|critique|critiques)\b[^0-9]{0,24}([0-9]+)/g)) {
    counts.push({ severity: "critical", count: Number(match[2]) });
  }

  for (const match of normalized.matchAll(/\b(high|haute|haut|eleve|elevee|eleves|elevees)\b[^0-9]{0,24}([0-9]+)/g)) {
    counts.push({ severity: "high", count: Number(match[2]) });
  }

  for (const match of normalized.matchAll(/\b([0-9]+)\s+(critical|critique|critiques|high|haute|haut|eleve|elevee|eleves|elevees)\b/g)) {
    const severity = /critical|critique/.test(match[2] ?? "") ? "critical" : "high";
    counts.push({ severity, count: Number(match[1]) });
  }

  return counts;
}

function isSeverityEvidenceLine(line: string): boolean {
  const normalized = plain(line);
  if (isNoFindingText(line)) return false;
  const severity = /\b(critical|critique|critiques|high|haute|haut|eleve|elevee|eleves|elevees)\b/;
  return (
    /\b(severity|severite|risk|risque|priority|priorite|bloqueur|bloquant|blocker)\b/.test(normalized) &&
    severity.test(normalized)
  );
}

function findCriticalHighBlockers(report: Report): GateIssue[] {
  const issues: GateIssue[] = [];

  for (const section of parseSections(report.content)) {
    const severity = severityHeading(section.heading);
    if (severity && hasSubstantiveFinding(section.body)) {
      issues.push({
        report: report.name,
        rule: "critical-high-blocker",
        evidence: `line ${section.lineNumber}: ${section.heading} -> ${firstEvidence(section.body)}`,
      });
    }
  }

  for (const rawLine of report.content.split(/\r?\n/)) {
    const counts = parseSeverityCounts(rawLine);
    if (counts.some(count => count.count > 0)) {
      issues.push({
        report: report.name,
        rule: "critical-high-blocker",
        evidence: evidence(rawLine),
      });
    } else if (isSeverityEvidenceLine(rawLine)) {
      issues.push({
        report: report.name,
        rule: "critical-high-blocker",
        evidence: evidence(rawLine),
      });
    }
  }

  return issues;
}

function countAfterLabel(line: string, labelPattern: RegExp): number | null {
  const normalized = plain(line);
  const label = normalized.match(labelPattern);
  if (!label) return null;

  const afterLabel = normalized.slice(label.index === undefined ? 0 : label.index + label[0].length);
  const count = afterLabel.match(/[=: -]+([0-9]+)/);
  return count ? Number(count[1]) : null;
}

function lineClearsArchitectureIssue(line: string): boolean {
  const normalized = plain(line);
  if (/\b(cycle|cycles|violation|violations|boundary)\b[^0-9]{0,24}\b0\b/.test(normalized)) return true;
  if (/\b(no|aucun|aucune|zero|pas de|pas d)\b.*\b(cycle|cycles|violation|violations|boundary)\b/.test(normalized)) return true;
  return /\b(cycle|cycles|violation|violations|boundary)\b.*\b(no|aucun|aucune|zero|pas de|pas d)\b/.test(normalized);
}

function findArchitectureIssues(report: Report): GateIssue[] {
  const issues: GateIssue[] = [];

  for (const rawLine of report.content.split(/\r?\n/)) {
    const normalized = plain(rawLine);
    if (!normalized) continue;

    const cycleCount =
      countAfterLabel(rawLine, /\bcycles?(?:\s+(?:de\s+dependance|dependencies|deps))?\b/) ??
      countAfterLabel(rawLine, /\bdependency\s+cycles?\b/);
    if (cycleCount !== null && cycleCount > 0) {
      issues.push({
        report: report.name,
        rule: "architecture-boundary",
        evidence: evidence(rawLine),
      });
      continue;
    }

    const boundaryCount =
      countAfterLabel(rawLine, /\bboundary\s+violations?\b/) ??
      countAfterLabel(rawLine, /\bviolations?(?:\s+de)?\s+boundary\b/);
    if (boundaryCount !== null && boundaryCount > 0) {
      issues.push({
        report: report.name,
        rule: "architecture-boundary",
        evidence: evidence(rawLine),
      });
      continue;
    }

    if (cycleCount !== null || boundaryCount !== null || lineClearsArchitectureIssue(rawLine)) {
      continue;
    }

    if (/\bcycles?\b/.test(normalized) || /\bboundary\s+violations?\b/.test(normalized) || /\bviolations?\s+de\s+boundary\b/.test(normalized)) {
      issues.push({
        report: report.name,
        rule: "architecture-boundary",
        evidence: evidence(rawLine),
      });
    }
  }

  return issues;
}

function hasExplicitNoE2E(content: string): boolean {
  return content.split(/\r?\n/).some(rawLine => {
    const line = plain(rawLine);
    return (
      /\b(e2e|playwright|tests?)\b.*\b(non execute|non executes|not run|not executed|missing|absent|aucun|aucune|none|pas de|pas d)\b/.test(line) ||
      /\b(non execute|non executes|not run|not executed|missing|absent|aucun|aucune|none|pas de|pas d)\b.*\b(e2e|playwright|tests?)\b/.test(line)
    );
  });
}

function hasE2ERunProof(content: string): boolean {
  const normalized = plain(content);
  if (hasExplicitNoE2E(content)) return false;

  const hasPositiveTestCount = content.split(/\r?\n/).some(rawLine => {
    const line = plain(rawLine);
    const total = line.match(/\b(total|tests?|test cases?)\b[^0-9]{0,24}([1-9][0-9]*)/);
    const passants = line.match(/\b(passants|passed|passing|passes)\b[^0-9]{0,24}([1-9][0-9]*)/);
    return Boolean(total || passants);
  });

  const hasCommandEvidence = /\b(playwright|e2e\/|\.spec\.(ts|tsx|js|jsx)|bunx|npx|pnpm|npm|bun)\b/.test(normalized) && /\b(passants|passed|passing|tests?)\b/.test(normalized);
  const hasExitZero = /\b(exit code|code sortie|exit)\b[^0-9]{0,12}0\b/.test(normalized);

  return hasPositiveTestCount || hasCommandEvidence || hasExitZero;
}

function hasHeadfulProof(content: string): boolean {
  const headfulLines = content
    .split(/\r?\n/)
    .map(line => plain(line))
    .filter(line => /\b(headful|visuel|visual)\b/.test(line));

  return headfulLines.some(line => {
    if (/\b(non|no|none|aucun|aucune|false|missing|absent|pas|uncertain|non verifie|not verified|not run|not executed|non execute|non executes|jamais|sans)\b/.test(line)) return false;
    return /\b(oui|yes|true|ok|pass|passed|verifie|verified|screenshot|trace|video|visuel|visual)\b/.test(line) || /[12][0-9]{3}-[0-9]{2}-[0-9]{2}/.test(line);
  });
}

function findE2EIssues(report: Report): GateIssue[] {
  const issues: GateIssue[] = [];

  if (!hasE2ERunProof(report.content)) {
    issues.push({
      report: report.name,
      rule: "e2e-proof",
      evidence: "Missing E2E run evidence with test counts, command output, or exit code.",
    });
  }

  if (!hasHeadfulProof(report.content)) {
    issues.push({
      report: report.name,
      rule: "e2e-proof",
      evidence: "Missing headful/visual verification evidence.",
    });
  }

  for (const rawLine of report.content.split(/\r?\n/)) {
    const line = plain(rawLine);
    const failed = line.match(/\b(failed|failures|echoues|echecs)\b[^0-9]{0,24}([1-9][0-9]*)/);
    const failedReversed = line.match(/\b([1-9][0-9]*)\s+(failed|failures|echoues|echecs)\b/);
    const fixmeCount = countAfterLabel(rawLine, /\b(fixme|todo|skipped|skip|flaky)\b/);
    const partialOrBlocked =
      !isNoFindingText(rawLine) &&
      /\b(partiel|partielle|partial|bloque|bloquee|blocked|blocking|bloquant|bloquante|not covered|non couvert|non couverte|missing coverage|coverage missing)\b/.test(line);
    if ((fixmeCount !== null && fixmeCount > 0) || failed || failedReversed || partialOrBlocked) {
      issues.push({
        report: report.name,
        rule: "e2e-proof",
        evidence: evidence(rawLine),
      });
    }
  }

  return issues;
}

// Le gate ne peut pas prouver qu'un travail a eu lieu à partir d'un texte, mais il peut attraper la
// signature null-agent la plus simple : un SHIP_PROOF qui CLAME des tests alors que la cible n'a
// AUCUNE infrastructure de test (config / dossier / script). Un projet qui a réellement tourné ses
// tests en porte la trace. Cross-check d'artefacts > confiance au JSON (anti reward-hacking, P3).
function hasTestInfra(targetDir: string): boolean {
  const configs = [
    "playwright.config.ts", "playwright.config.js", "playwright.config.mjs",
    "vitest.config.ts", "vitest.config.js", "vitest.config.mjs",
    "jest.config.ts", "jest.config.js", "jest.config.json",
    "cypress.config.ts", "cypress.config.js",
  ];
  if (configs.some(c => existsSync(join(targetDir, c)))) return true;
  for (const d of ["tests", "test", "e2e", "__tests__", "spec", "cypress"]) {
    try { if (statSync(join(targetDir, d)).isDirectory()) return true; } catch { /* absent */ }
  }
  try {
    const pkg = JSON.parse(readFileSync(join(targetDir, "package.json"), "utf-8")) as { scripts?: Record<string, unknown> };
    const t = pkg?.scripts?.test;
    if (typeof t === "string" && t.trim() && !/no test specified|exit 1/i.test(t)) return true;
  } catch { /* pas de package.json lisible */ }
  return false;
}

function commandClaimsTests(commands: unknown[]): boolean {
  return commands.some((c) => {
    if (!c || typeof c !== "object") return false;
    const cmd = (c as { command?: unknown }).command;
    return typeof cmd === "string" && (/\b(playwright|vitest|jest|cypress)\b/i.test(cmd) || /\b(bun|npm|pnpm|yarn|npx|bunx)\b[^|;&]*\btest\b/i.test(cmd) || /(^|\s)test(\s|$)/i.test(cmd));
  });
}

function findShipProofIssues(report: Report, targetDir: string): GateIssue[] {
  const issues: GateIssue[] = [];
  let proof: ShipProof;

  try {
    const parsed = JSON.parse(report.content) as unknown;
    proof = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as ShipProof : {};
  } catch {
    return [{
      report: report.name,
      rule: "ship-proof",
      evidence: "SHIP_PROOF.json is not valid JSON",
    }];
  }

  const commands = Array.isArray(proof.commands) ? proof.commands : [];
  if (commands.length === 0) {
    issues.push({
      report: report.name,
      rule: "ship-proof",
      evidence: "SHIP_PROOF.json must include commands with exit codes",
    });
  }

  // Anti-fabrication (null-agent) : des tests revendiqués sans aucune infra de test dans la cible.
  if (commandClaimsTests(commands) && !hasTestInfra(targetDir)) {
    issues.push({
      report: report.name,
      rule: "ship-proof",
      evidence: "SHIP_PROOF claims test execution but the target has no test infrastructure (config/dir/script) — null-agent / fabrication signal",
    });
  }

  for (const command of commands) {
    if (!command || typeof command !== "object" || Array.isArray(command)) {
      issues.push({
        report: report.name,
        rule: "ship-proof",
        evidence: "Each SHIP_PROOF command must be an object with command and exitCode",
      });
      continue;
    }
    const exitCode = (command as { exitCode?: unknown }).exitCode;
    const commandText = (command as { command?: unknown }).command;
    if (typeof commandText !== "string" || commandText.trim().length === 0 || typeof exitCode !== "number") {
      issues.push({
        report: report.name,
        rule: "ship-proof",
        evidence: "Each SHIP_PROOF command must include command and numeric exitCode",
      });
    } else if (exitCode !== 0) {
      issues.push({
        report: report.name,
        rule: "ship-proof",
        evidence: `Command exitCode is ${exitCode}`,
      });
    }
  }

  const reviewers = Array.isArray(proof.reviewers) ? proof.reviewers : [];
  if (reviewers.length === 0) {
    issues.push({
      report: report.name,
      rule: "ship-proof",
      evidence: "SHIP_PROOF.json must include at least one independent reviewer",
    });
  }

  const decision = typeof proof.decision === "string" ? parseDecisionLine(proof.decision) : null;
  if (!decision) {
    issues.push({
      report: report.name,
      rule: "ship-proof",
      evidence: "SHIP_PROOF.json decision is missing or invalid",
    });
  } else if (decision === "DON'T SHIP" || decision === "SHIP UNCERTAIN") {
    issues.push({
      report: report.name,
      rule: "ship-proof",
      evidence: `SHIP_PROOF.json decision is ${decision}`,
    });
  }

  const blockers = Array.isArray(proof.blockers) ? proof.blockers : [];
  if (blockers.some(blocker => blocker && typeof blocker === "object" && /critical|high|critique|haute/i.test(String((blocker as { severity?: unknown }).severity ?? "")))) {
    issues.push({
      report: report.name,
      rule: "ship-proof",
      evidence: "SHIP_PROOF.json contains critical/high blockers",
    });
  }

  return issues;
}

function findCodePathCoverageIssues(report: Report): GateIssue[] {
  const issues: GateIssue[] = [];

  for (const rawLine of report.content.split(/\r?\n/)) {
    const line = plain(rawLine);
    if (!line || isNoFindingText(rawLine)) continue;
    if (/\b(coverage\s+)?gaps?\b.*\b(none|aucun|aucune|zero|0|no|pas de|pas d)\b/.test(line)) continue;
    if (/\b(not covered|non couvert|non couverte|uncovered|missing coverage|coverage missing|coverage gap|gaps?|trou|trous)\b/.test(line)) {
      issues.push({
        report: report.name,
        rule: "e2e-proof",
        evidence: evidence(rawLine),
      });
    }
  }

  return issues;
}

function parseDecisionLine(line: string): ShipDecision | null {
  const normalized = plain(line);
  const matches: ShipDecision[] = [];

  if (/\bdont\s+ship\b/.test(normalized)) matches.push("DON'T SHIP");
  if (/\bship\s+uncertain\b/.test(normalized)) matches.push("SHIP UNCERTAIN");
  if (/\bship\s+with\s+caveats\b/.test(normalized)) matches.push("SHIP WITH CAVEATS");
  if (/(^|\b)ship($|\b)/.test(normalized) && matches.length === 0) matches.push("SHIP");

  return matches.length === 1 ? matches[0] ?? null : null;
}

function extractDecision(content: string): ShipDecision | null {
  const lines = content.split(/\r?\n/);
  const candidates = lines.filter(rawLine => {
    const line = plain(rawLine);
    if (!line) return false;
    if (/\b(must be|one of|allowed|options|doit etre|exactement)\b/.test(line)) return false;
    if (/^(ship|ship with caveats|dont ship|ship uncertain)$/.test(line)) return true;
    return /\b(decision|statut|status|verdict|finale|final)\b/.test(line);
  });

  const finalCandidates = candidates.filter(candidate => /\b(finale?|verdict)\b/.test(plain(candidate))).reverse();
  const orderedCandidates = finalCandidates.length > 0 ? finalCandidates : candidates.reverse();

  for (const candidate of orderedCandidates) {
    const decision = parseDecisionLine(candidate);
    if (decision) return decision;
  }

  return null;
}

function uniqueIssues(issues: GateIssue[]): GateIssue[] {
  const seen = new Set<string>();
  const unique: GateIssue[] = [];

  for (const issue of issues) {
    const key = `${issue.report}\0${issue.rule}\0${issue.evidence}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(issue);
  }

  return unique;
}

function evaluate(targetDir: string): GateResult {
  const reports = REPORT_NAMES.map(name => readReport(targetDir, name));
  const issues: GateIssue[] = [];

  for (const report of reports) {
    if (!report.exists) {
      issues.push({ report: report.name, rule: "missing-report", evidence: `${report.name} not found` });
    } else if (report.content.trim().length === 0) {
      issues.push({ report: report.name, rule: "empty-report", evidence: `${report.name} is empty` });
    }
  }

  for (const report of reports.filter(report => report.exists && report.content.trim().length > 0)) {
    issues.push(...findCriticalHighBlockers(report));
  }

  const archReport = reports.find(report => report.name === "ARCH.md");
  if (archReport && archReport.exists && archReport.content.trim().length > 0) {
    issues.push(...findArchitectureIssues(archReport));
  }

  const shipCheckReport = reports.find(report => report.name === "SHIP_CHECK.md");
  if (shipCheckReport && shipCheckReport.exists && shipCheckReport.content.trim().length > 0) {
    issues.push(...findArchitectureIssues(shipCheckReport));
  }

  const e2eReport = reports.find(report => report.name === "E2E_REPORT.md");
  if (e2eReport && e2eReport.exists && e2eReport.content.trim().length > 0) {
    issues.push(...findE2EIssues(e2eReport));
  }

  const coverageReport = reports.find(report => report.name === "CODE_PATH_COVERAGE.md");
  if (coverageReport && coverageReport.exists && coverageReport.content.trim().length > 0) {
    issues.push(...findCodePathCoverageIssues(coverageReport));
  }

  const shipProof = reports.find(report => report.name === "SHIP_PROOF.json");
  if (shipProof && shipProof.exists && shipProof.content.trim().length > 0) {
    issues.push(...findShipProofIssues(shipProof, targetDir));
  }

  const decision = shipCheckReport && shipCheckReport.exists ? extractDecision(shipCheckReport.content) : null;
  if (shipCheckReport && shipCheckReport.exists && shipCheckReport.content.trim().length > 0) {
    if (decision === "DON'T SHIP" || decision === "SHIP UNCERTAIN") {
      issues.push({
        report: "SHIP_CHECK.md",
        rule: "ship-decision",
        evidence: `Decision is ${decision}`,
      });
    } else if (decision === null) {
      issues.push({
        report: "SHIP_CHECK.md",
        rule: "ship-decision",
        evidence: "Final decision is missing or ambiguous",
      });
    }
  }

  const unique = uniqueIssues(issues);

  return {
    ok: unique.length === 0,
    targetDir,
    decision,
    reports: reports.map(report => ({ name: report.name, exists: report.exists, bytes: report.content.length })),
    issues: unique,
  };
}

function printHuman(result: GateResult): void {
  const log = result.ok ? console.log : console.error;
  log(`ship-check-gate: ${result.ok ? "PASS" : "FAIL"}`);
  log(`Target: ${result.targetDir}`);
  log(`Decision: ${result.decision || "missing"}`);
  log("Reports:");
  for (const report of result.reports) {
    log(`- ${report.exists ? "OK" : "MISSING"} ${report.name}${report.exists ? ` (${report.bytes} bytes)` : ""}`);
  }

  if (result.issues.length === 0) return;

  log("Blockers:");
  for (const issue of result.issues) {
    log(`- [${issue.report}] ${issue.rule}: ${issue.evidence}`);
  }
}

function ensureDirectory(path: string): void {
  if (!existsSync(path)) throw new Error(`Target directory does not exist: ${path}`);
  if (!statSync(path).isDirectory()) throw new Error(`Target path is not a directory: ${path}`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    process.exit(0);
  }

  ensureDirectory(options.targetDir);
  const result = evaluate(options.targetDir);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHuman(result);
  }

  process.exit(result.ok ? 0 : 1);
} catch (error: unknown) {
  console.error(`ship-check-gate failed: ${errorMessage(error)}`);
  console.error(usage());
  process.exit(2);
}
