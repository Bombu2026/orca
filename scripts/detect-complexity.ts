#!/usr/bin/env bun

/**
 * detect-complexity.ts
 * Analyse BRIEF.md + MOODBOARD.md et retourne un tier simple | medium | premium.
 * Usage: bun detect-complexity.ts <brief-path> [moodboard-path]
 * Output: JSON sur stdout
 * Exit: 0 success, 1 si brief absent/illisible
 */

import { existsSync, readFileSync } from "fs";

type Tier = "simple" | "medium" | "premium";

interface ComplexityResult {
  tier: Tier;
  score: Record<Tier, number>;
  signals: string[];
  justification: string;
  stack: {
    motion_deps: string[];
    video: string | null;
    threed: string | null;
  };
}

interface Section {
  title: string;
  body: string;
}

function parseSections(md: string): Section[] {
  const lines = md.split("\n");
  const sections: Section[] = [];
  let current: Section | null = null;

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2 && h2[1] !== undefined) {
      if (current) sections.push(current);
      current = { title: h2[1].trim(), body: "" };
    } else if (current) {
      current.body += line + "\n";
    }
  }
  if (current) sections.push(current);
  return sections;
}

function findSection(sections: Section[], needle: string): string {
  const n = needle.toLowerCase();
  const match = sections.find(s => s.title.toLowerCase().includes(n));
  return match?.body ?? "";
}

function extractAmbitionScore(motionSection: string): number | null {
  // Cherche un score 1-5 apres "ambition motion ... :" en ignorant le "(1->5)" ou "(1/5)" ou "(1-5)"
  // Ligne type : "- Ambition motion (1->5) : 4"
  // Strategie : isoler la ligne, retirer toute parenthese, puis extraire le dernier chiffre 1-5
  const lines = motionSection.split("\n");
  for (const rawLine of lines) {
    if (!/ambition/i.test(rawLine)) continue;
    const stripped = rawLine.replace(/\([^)]*\)/g, "").replace(/→|->|\/5|\/\s*5/g, "");
    const afterColon = stripped.split(":").slice(1).join(":");
    const nums = afterColon.match(/\d+/g);
    if (nums) {
      for (const raw of nums) {
        const n = parseInt(raw, 10);
        if (n >= 1 && n <= 5) return n;
      }
    }
  }
  return null;
}

function countPagesFromVolume(contentSection: string): number | null {
  const m = contentSection.match(/volume[^0-9]*(\d+)/i);
  if (m && m[1] !== undefined) return parseInt(m[1], 10);
  const m2 = contentSection.match(/(\d+)\s*pages?/i);
  if (m2 && m2[1] !== undefined) return parseInt(m2[1], 10);
  return null;
}

export function detectComplexity(
  briefText: string,
  moodboardText: string | null,
): ComplexityResult {
  const briefSections = parseSections(briefText);
  const moodSections = moodboardText ? parseSections(moodboardText) : [];

  const motionSec = findSection(briefSections, "motion");
  const assetsSec = findSection(briefSections, "assets");
  const contentSec = findSection(briefSections, "contenu");
  const moodSec = findSection(briefSections, "mood");
  const moodSignature = findSection(moodSections, "motion signature");

  const motionLower = motionSec.toLowerCase();
  const assetsLower = assetsSec.toLowerCase();
  const moodLower = moodSec.toLowerCase();
  const moodSigLower = moodSignature.toLowerCase();

  const score: Record<Tier, number> = { simple: 0, medium: 0, premium: 0 };
  const signals: string[] = [];

  // --- Ambition motion ---
  const ambition = extractAmbitionScore(motionSec);
  if (ambition !== null) {
    signals.push(`ambition motion = ${ambition}`);
    if (ambition >= 4) score.premium += 3;
    else if (ambition === 3) score.medium += 2;
    else score.simple += 2;
  }

  // --- 3D / WebGL / R3F -> premium ---
  // On regarde la ligne qui mentionne 3D/WebGL/R3F/Spline : si elle contient
  // "non", "aucun", "pas de", "n/a" ou "0", on ignore. Sinon on active le signal.
  const threedRe = /3d|webgl|r3f|three\.js|three-fiber|@react-three|spline/i;
  const motionLines = motionSec.split("\n").filter(l => threedRe.test(l));
  const moodLines = moodSignature.split("\n").filter(l => threedRe.test(l));
  const has3DStrong =
    motionLines.some(l => !/non|aucun|pas\s+de|n\/a|:\s*0/i.test(l)) ||
    moodLines.some(l => !/non|aucun|pas\s+de|n\/a/i.test(l));
  if (has3DStrong) {
    signals.push("3D / WebGL demande");
    score.premium += 4;
  }
  const has3D = has3DStrong;

  // --- Parallax / scroll narratif / custom cursor -> medium minimum ---
  // On verifie la ligne qui contient le mot-cle et on filtre si la ligne dit "aucun", "non", "pas", "n/a".
  const lineNegates = (line: string): boolean =>
    /:\s*(non|no|aucun|n\/a|pas)\b/i.test(line) || /\b(aucun|pas\s+de)\b/i.test(line);

  const parallaxLines = motionSec.split("\n").filter(l => /parallax/i.test(l));
  if (parallaxLines.some(l => !lineNegates(l))) {
    signals.push("parallax demande");
    score.medium += 2;
  }

  const narrativeLines = (motionSec + "\n" + moodSignature)
    .split("\n")
    .filter(l => /scroll\s+narratif|storytelling\s+scroll|scroll[- ]driven/i.test(l));
  if (narrativeLines.some(l => !lineNegates(l))) {
    signals.push("scroll narratif demande");
    score.medium += 2;
    score.premium += 1;
  }

  const cursorLines = motionSec.split("\n").filter(l => /custom\s+cursor|curseur\s+custom/i.test(l));
  if (cursorLines.some(l => !lineNegates(l))) {
    signals.push("custom cursor demande");
    score.medium += 1;
    score.premium += 1;
  }

  // --- Smooth scroll ---
  // Check ligne par ligne pour eviter les faux positifs avec "Smooth scroll : non"
  const smoothLines = motionSec.split("\n").filter(l => /smooth\s+scroll|lenis/i.test(l));
  const hasSmooth = smoothLines.some(l => !/:\s*(non|no|aucun|n\/a|pas)\b/i.test(l));
  if (hasSmooth) {
    signals.push("smooth scroll demande");
    score.medium += 1;
  }

  // --- GSAP / ScrollTrigger / SplitText ---
  if (/gsap|scrolltrigger|splittext|morphsvg/i.test(motionLower + " " + moodSigLower)) {
    signals.push("GSAP / ScrollTrigger mentionne");
    score.premium += 3;
  }

  // --- Kinetic type ---
  if (/kinetic/i.test(motionLower + " " + moodSigLower)) {
    signals.push("kinetic typography demandee");
    score.premium += 3;
  }

  // --- Awwwards reference ---
  if (/awwwards|fwa|site\s*of\s*the\s*day/i.test(moodSigLower + " " + moodLower)) {
    signals.push("reference Awwwards / FWA");
    score.premium += 2;
  }

  // --- Video hero / bg ---
  const videoRe = /video\s+hero|vid[eé]o\s+hero|video\s+bg|vid[eé]o\s+bg|hero\s+video|background\s+video/i;
  const videoLines = (assetsSec + "\n" + motionSec).split("\n").filter(l => videoRe.test(l));
  const hasVideo = videoLines.some(l => !/:\s*(non|no|aucun|n\/a|pas|0)\b/i.test(l) && !/\b(aucun|pas\s+de)\b/i.test(l));
  if (hasVideo) {
    signals.push("video bg / hero");
    score.medium += 2;
  }

  // --- Video count ---
  const videoCount = assetsSec.match(/(\d+)\s*(?:vid[eé]os?|videos?)/i);
  if (videoCount && videoCount[1] !== undefined) {
    const n = parseInt(videoCount[1], 10);
    if (n >= 3) {
      signals.push(`${n} videos demandees`);
      score.premium += 1;
    } else if (n >= 1) {
      score.medium += 1;
    }
  }

  // --- Pages count ---
  const pages = countPagesFromVolume(contentSec);
  if (pages !== null) {
    signals.push(`${pages} pages`);
    if (pages > 10) score.medium += 1;
    if (pages <= 5) score.simple += 1;
  }

  // --- Fallback : rien detecte -> simple ---
  if (score.simple === 0 && score.medium === 0 && score.premium === 0) {
    signals.push("aucun signal fort -> tier simple par defaut");
    score.simple += 1;
  }

  // --- Resolution du tier ---
  let tier: Tier;
  if (score.premium >= 3) tier = "premium";
  else if (score.medium >= 2 || score.premium > 0) tier = "medium";
  else tier = "simple";

  // --- Borderline -> remonte ---
  const premiumSignals = score.premium > 0;
  const mediumSignals = score.medium > 0;
  if (tier === "simple" && mediumSignals) tier = "medium";
  if (tier === "medium" && premiumSignals && score.premium >= 2) tier = "premium";

  // --- Stack associee ---
  const stack: ComplexityResult["stack"] = {
    motion_deps: [],
    video: null,
    threed: null,
  };

  if (tier === "simple") {
    stack.motion_deps = ["motion", "tw-animate-css"];
    stack.video = null;
    stack.threed = null;
  } else if (tier === "medium") {
    stack.motion_deps = ["motion", "lenis"];
    stack.video = "next-video ou poster + webm/mp4 manuel";
    stack.threed = null;
  } else {
    stack.motion_deps = ["motion", "lenis", "gsap", "@gsap/react"];
    stack.video = "Mux (HLS adaptatif) ou next-video";
    stack.threed = has3D ? "R3F + Drei (ou Spline)" : null;
    if (has3D) {
      stack.motion_deps.push("@react-three/fiber", "@react-three/drei");
    }
    if (hasVideo) stack.motion_deps.push("next-video");
  }

  // --- Justification textuelle ---
  const justification = buildJustification(tier, signals, score);

  return { tier, score, signals, justification, stack };
}

function buildJustification(tier: Tier, signals: string[], score: Record<Tier, number>): string {
  const signalStr = signals.length > 0 ? signals.join(", ") : "aucun signal";
  if (tier === "premium") {
    return `Signaux premium forts (${signalStr}). Score : simple=${score.simple} / medium=${score.medium} / premium=${score.premium}. Stack Awwwards-grade requise.`;
  }
  if (tier === "medium") {
    return `Signaux medium presents (${signalStr}). Score : simple=${score.simple} / medium=${score.medium} / premium=${score.premium}. Pas de 3D ni kinetic type, donc simple ne suffit pas mais premium serait surdimensionne.`;
  }
  return `Aucun signal medium ou premium fort (${signalStr}). Score : simple=${score.simple} / medium=${score.medium} / premium=${score.premium}. Tier simple suffit : stack legere Motion + Tailwind animate.`;
}

// --- CLI ---
function main(): void {
  const briefPath = process.argv[2];
  const moodboardPath = process.argv[3];

  if (!briefPath) {
    console.error("Usage: bun detect-complexity.ts <brief-path> [moodboard-path]");
    process.exit(1);
  }

  if (!existsSync(briefPath)) {
    console.error(`Brief introuvable : ${briefPath}`);
    process.exit(1);
  }

  let briefText: string;
  try {
    briefText = readFileSync(briefPath, "utf-8");
  } catch (err) {
    console.error(`Impossible de lire le brief : ${(err as Error).message}`);
    process.exit(1);
  }

  let moodboardText: string | null = null;
  if (moodboardPath && existsSync(moodboardPath)) {
    try {
      moodboardText = readFileSync(moodboardPath, "utf-8");
    } catch {
      moodboardText = null;
    }
  }

  const result = detectComplexity(briefText, moodboardText);
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.main) {
  main();
}
