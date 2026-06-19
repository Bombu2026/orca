#!/usr/bin/env bun

/**
 * vitrine-init.ts
 * Coordinateur CLI du flux /site : brief -> moodboard -> detect complexite ->
 * scaffold .claude/ + docs/ + memory. Ne conduit PAS le questionnaire interactif
 * (c'est l'agent site-director via skill brief-questionnaire qui le fait).
 *
 * Usage: bun vitrine-init.ts <output-dir>
 * Exit codes:
 *   0 = success
 *   1 = erreur
 *   2 = missing prerequisite (brief ou moodboard)
 */

import { existsSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { detectComplexity } from "./detect-complexity.ts";
import { vitrineSeed } from "./vitrine-seed.ts";

const ASSISTANT_DIR = dirname(dirname(import.meta.filename));

type Tier = "simple" | "medium" | "premium";

function log(msg: string): void {
  console.log(msg);
}

function warn(msg: string): void {
  console.log(`[warn] ${msg}`);
}

function err(msg: string): void {
  console.error(`[error] ${msg}`);
}

function hasNextJsProject(dir: string): boolean {
  const pkgPath = join(dir, "package.json");
  if (!existsSync(pkgPath)) return false;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    return Boolean(deps.next);
  } catch {
    return false;
  }
}

function briefSummary(briefPath: string): string {
  const text = readFileSync(briefPath, "utf-8");
  const lines = text.split("\n");
  // Extrait client + 3 premieres sections remplies
  const client = lines.find(l => /\*\*Client\*\*/i.test(l)) ?? "";
  const firstSections: string[] = [];
  for (const l of lines) {
    const m = l.match(/^##\s+(\d\.\s+.+)$/);
    // m[1] : groupe capturant non optionnel, present des que m est non null
    const section = m?.[1];
    if (section !== undefined) firstSections.push(section);
    if (firstSections.length >= 4) break;
  }
  return `${client.trim()}\n   Sections : ${firstSections.join(" | ")}`;
}

async function askYesNo(question: string, defaultYes = true): Promise<boolean> {
  // Bun stdin simple
  const suffix = defaultYes ? " [Y/n] " : " [y/N] ";
  process.stdout.write(question + suffix);
  const decoder = new TextDecoder();
  for await (const chunk of Bun.stdin.stream()) {
    const s = decoder.decode(chunk).trim().toLowerCase();
    if (s === "") return defaultYes;
    if (s === "y" || s === "o" || s === "yes" || s === "oui") return true;
    if (s === "n" || s === "no" || s === "non") return false;
    return defaultYes;
  }
  return defaultYes;
}

async function main(): Promise<void> {
  const outputDirArg = process.argv[2];
  if (!outputDirArg) {
    err("Usage: bun vitrine-init.ts <output-dir>");
    process.exit(1);
  }

  const outputDir = resolve(outputDirArg);
  const docsDir = join(outputDir, "docs");
  const briefPath = join(docsDir, "BRIEF.md");
  const moodboardPath = join(docsDir, "MOODBOARD.md");

  // --- Phase 0 : garde-fou Next.js deja present ---
  if (hasNextJsProject(outputDir)) {
    err(`${outputDir} contient deja un projet Next.js (package.json + dep 'next').`);
    err("Pour eviter toute perte, abandon. Relance sur un repertoire vide ou sans Next.js.");
    process.exit(1);
  }

  // --- Intro ---
  log("=== Flux site vitrine ===");
  log("3 etapes : brief (questionnaire) -> moodboard (refs visuelles) -> scaffold (.claude/ + Next.js init)");
  log(`Cible : ${outputDir}`);
  log("");

  // --- Phase 1 : brief ---
  log("[1/6] Phase brief");
  if (existsSync(briefPath)) {
    log(`  Brief trouve : ${briefPath}`);
    try {
      log(`  Resume : ${briefSummary(briefPath)}`);
    } catch {
      warn("  Impossible de resumer le brief (format inattendu), on continue.");
    }
  } else {
    err(`  Brief manquant : ${briefPath}`);
    err("  -> Demande a Claude de lancer la skill 'brief-questionnaire' (ou commande /brief).");
    err("  Le questionnaire est conduit par l'agent site-director via AskUserQuestion.");
    process.exit(2);
  }

  // --- Phase 2 : moodboard ---
  log("");
  log("[2/6] Phase moodboard");
  if (existsSync(moodboardPath)) {
    log(`  Moodboard trouve : ${moodboardPath}`);
  } else {
    err(`  Moodboard manquant : ${moodboardPath}`);
    err("  -> Demande a Claude de lancer la skill 'moodboard-capture' (ou commande /moodboard).");
    process.exit(2);
  }

  // --- Phase 3 : detection complexite ---
  log("");
  log("[3/6] Phase detection complexite");
  const briefText = readFileSync(briefPath, "utf-8");
  const moodText = readFileSync(moodboardPath, "utf-8");
  const detected = detectComplexity(briefText, moodText);

  log(`  Tier detecte : ${detected.tier}`);
  log(`  Score        : simple=${detected.score.simple} / medium=${detected.score.medium} / premium=${detected.score.premium}`);
  log(`  Signaux      : ${detected.signals.join(", ") || "aucun"}`);
  log(`  Justification: ${detected.justification}`);
  log(`  Stack motion : ${detected.stack.motion_deps.join(", ")}`);
  if (detected.stack.video) log(`  Video        : ${detected.stack.video}`);
  if (detected.stack.threed) log(`  3D           : ${detected.stack.threed}`);

  // --- Phase 4 : confirmation tier ---
  log("");
  log("[4/6] Confirmation tier");
  let tier: Tier = detected.tier;
  const confirmed = await askYesNo(`  Accepter tier detecte (${tier}) ?`, true);
  if (!confirmed) {
    warn("  Tier non accepte. Override manuel non supporte par ce script.");
    warn("  -> Relance avec : bun scripts/vitrine-seed.ts <output-dir> <tier> <brief-path>");
    warn("  Tiers disponibles : simple | medium | premium");
    process.exit(2);
  }

  // --- Phase 5 : scaffold .claude/ + docs ---
  log("");
  log("[5/6] Scaffold vitrine (.claude/ + docs + memory)");

  // Extrait nom client si possible pour enrichir le seed
  const clientMatch = briefText.match(/\*\*Client\*\*\s*:\s*(.+)/i);
  const nameMatch = briefText.match(/^#\s*Brief\s*—\s*(.+)$/m);
  const clientName = clientMatch?.[1]?.trim() ?? "Client";
  const projectName = nameMatch?.[1]?.trim() ?? `Site vitrine ${clientName}`;

  const report = vitrineSeed({
    outputDir,
    tier,
    briefPath,
    clientName,
    projectName,
  });

  log(`  CLAUDE.md         : ${report.claudeMdPath}`);
  log(`  Agents copies     : ${report.agentsCount}`);
  log(`  Skills copies     : ${report.skillsFilesCount}`);
  log(`  Commands copies   : ${report.commandsCount}`);
  log(`  Hook events       : ${report.hookEvents}`);
  log(`  Memory seed       : ${report.memoryFilesCount} fichiers dans ~/.claude/projects/<slug>/memory/`);

  // --- Phase 6 : Next.js scaffold (proposition, pas execution) ---
  log("");
  log("[6/6] Next.js scaffold");
  log("  Commande a lancer (par toi ou Claude) :");
  log("    cd " + outputDir);
  log("    bun create next-app@latest . --typescript --tailwind --app --turbopack --no-src-dir --import-alias \"@/*\"");
  log("");
  log("  Assets pipeline (apres Next.js init) :");
  log("    bun add -D sharp @types/sharp");
  log("");

  // --- Resume final ---
  log("=== Resume ===");
  log(`Tier             : ${tier}`);
  log(`Output           : ${outputDir}`);
  log(`Brief            : ${report.briefPath}`);
  log(`Moodboard        : ${report.moodboardPath}`);
  log(`Skill ref        : ${ASSISTANT_DIR}/references/showcase-sites-references.md`);
  log("");
  log("Prochaines etapes :");
  log("  /brief           -> relancer ou mettre a jour le brief");
  log("  /moodboard       -> ajouter des URLs references");
  log("  /section hero    -> scaffold premiere section");
  log("  /motion hero     -> design + impl motion");
  log("  /ship-vitrine    -> lint + build + Lighthouse + motion-audit + a11y + Vercel preview");

  process.exit(0);
}

if (import.meta.main) {
  void main();
}
