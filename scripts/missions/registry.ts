#!/usr/bin/env bun

/**
 * registry.ts — agrège les missions par glob, sans fichier central à éditer.
 *
 * Déposer un `*.mission.ts` dans ce dossier suffit à l'enregistrer. Aucune liste
 * codée en dur → ajouter la mission N+1 ne touche jamais les missions 1..N (et en
 * retirer une = supprimer son fichier). Le découplage est garanti par construction.
 *
 * CLI :  bun scripts/missions/registry.ts list
 *        bun scripts/missions/registry.ts validate
 */

import { readdirSync } from "fs";
import { join } from "path";
import { matchAny, coreDenylistSentinels } from "../lib/scope";
import type { MissionManifest } from "./types";

const MISSIONS_DIR = import.meta.dir;

export async function loadMissions(): Promise<MissionManifest[]> {
  const files = readdirSync(MISSIONS_DIR)
    .filter((f) => f.endsWith(".mission.ts"))
    .sort();
  const out: MissionManifest[] = [];
  for (const f of files) {
    const mod = (await import(join(MISSIONS_DIR, f))) as Record<string, unknown>;
    const candidate =
      mod.default ?? Object.values(mod).find((v) => v && typeof v === "object" && "id" in (v as object));
    if (candidate) out.push(candidate as MissionManifest);
  }
  return out;
}

/** Invariants durs d'un manifeste. Retourne la liste des violations (vide = sain). */
export function validate(m: MissionManifest): string[] {
  const errs: string[] = [];
  if (!m.id || !/^[a-z][a-z0-9-]*$/.test(m.id)) errs.push(`${m.id || "?"}: id manquant ou non kebab-case`);
  if (!m.intent?.trim()) errs.push(`${m.id}: intent manquant (alimente la Mission Card)`);
  if (!m.triggers?.length) errs.push(`${m.id}: triggers vide (aucun signal de routage)`);
  if (!m.allowedWrites?.length) errs.push(`${m.id}: allowedWrites vide — une mission DOIT déclarer où elle écrit`);
  // Refus d'un fence en "**" ou "*" nu (écrit partout) — la faille que le fence existe pour fermer.
  for (const w of m.allowedWrites ?? []) {
    const trimmed = w.trim();
    if (trimmed === "**" || trimmed === "*" || trimmed === "/**" || trimmed === "~/**") {
      errs.push(`${m.id}: allowedWrites trop large ("${w}") — un fence ouvert n'est pas un fence`);
    }
  }
  // Anti élévation de privilège : refuser tout manifeste dont allowedWrites ATTEINT la
  // denylist noyau (code, fence, manifestes, hooks, skill, tests) — interdit même sous
  // allowSelf. La serrure ne se laisse pas réécrire par une mission qui se déclare large.
  const reached = coreDenylistSentinels().find((s) => matchAny(s, m.allowedWrites ?? []));
  if (reached) {
    errs.push(`${m.id}: allowedWrites atteint la zone noyau protégée (ex. ${reached}) — interdite même en self-maintenance`);
  }
  if (!m.handler?.trim()) errs.push(`${m.id}: handler manquant`);
  if (!m.restore?.trim()) errs.push(`${m.id}: restore manquant (procédure inverse obligatoire dès la création)`);
  if (m.needsArg === undefined) errs.push(`${m.id}: needsArg non déclaré`);
  return errs;
}

export async function validateAll(): Promise<{ ok: boolean; errors: string[] }> {
  const missions = await loadMissions();
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const m of missions) {
    if (seen.has(m.id)) errors.push(`doublon d'id: ${m.id}`);
    seen.add(m.id);
    errors.push(...validate(m));
  }
  return { ok: errors.length === 0, errors };
}

if (import.meta.main) {
  const cmd = process.argv[2] ?? "list";
  const missions = await loadMissions();
  if (cmd === "list") {
    console.log(`${missions.length} mission(s) enregistrée(s) :\n`);
    for (const m of missions) {
      console.log(`  ${m.id}  [${m.scopeKind}/${m.isolation}]`);
      console.log(`    ${m.intent}`);
      console.log(`    écrit: ${m.allowedWrites.join(", ")}`);
      console.log("");
    }
  } else if (cmd === "validate") {
    const { ok, errors } = await validateAll();
    if (ok) {
      console.log(`\x1b[32m✓ ${missions.length} manifeste(s) valide(s)\x1b[0m`);
      process.exit(0);
    } else {
      console.log("\x1b[31mViolations :\x1b[0m");
      for (const e of errors) console.log(`  \x1b[31m✗\x1b[0m ${e}`);
      process.exit(1);
    }
  } else {
    console.error("commandes: list | validate");
    process.exit(1);
  }
}
