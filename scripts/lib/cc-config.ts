#!/usr/bin/env bun

/**
 * cc-config.ts — lecture best-effort de la config Claude Code (global + projet), PARTAGÉE par
 * `autonomy.ts` (Autonomy Card) et `onboarding.ts` (Onboarding Card). Factorisé exprès : un seul
 * correctif de format settings.json vaut alors pour les deux Cards — sinon un MCP pourrait
 * ressortir « armed » côté autonomie et « missing » côté onboarding sur le même projet.
 *
 * Lecture seule, jamais ne lève. Zéro dépendance npm (built-ins fs/os/path).
 */

import { readFileSync, realpathSync } from "fs";
import { homedir } from "os";
import { join, resolve } from "path";

/** HOME testable : ASSISTANT_HOME prime sur le vrai ~ (détection déterministe en test). */
export const HOME = process.env.ASSISTANT_HOME ?? homedir();

export function readJson(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Chemin absolu canonicalisé — la clé de `~/.claude.json → projects[...]` est un chemin absolu. */
function canonical(target: string): string {
  try {
    return realpathSync(resolve(target));
  } catch {
    return resolve(target);
  }
}

/**
 * Noms de serveurs MCP visibles pour `target`, tous scopes confondus (minuscule) :
 *  - global : `~/.claude.json` (top-level) + `~/.claude/settings.json`,
 *  - projet : `.mcp.json`, `.claude/settings.json`, `.claude/settings.local.json`,
 *  - **scope local** : `~/.claude.json → projects[<chemin absolu du target>].mcpServers` — c'est le
 *    scope par DÉFAUT de `claude mcp add <serveur>` (sans `-s user`), le plus courant ; l'ignorer
 *    produit un faux « missing » (et, côté Autonomy Card, un faux gap bloquant self-verify).
 */
export function mcpServerNames(target: string): Set<string> {
  const names = new Set<string>();
  const collect = (cfg: Record<string, unknown> | null) => {
    if (!cfg) return;
    const servers = cfg["mcpServers"];
    if (servers && typeof servers === "object")
      for (const k of Object.keys(servers as Record<string, unknown>)) names.add(k.toLowerCase());
    const enabled = cfg["enabledMcpjsonServers"];
    if (Array.isArray(enabled)) for (const k of enabled) if (typeof k === "string") names.add(k.toLowerCase());
  };
  const home = readJson(join(HOME, ".claude.json"));
  collect(home);
  collect(readJson(join(HOME, ".claude", "settings.json")));
  collect(readJson(join(target, ".mcp.json")));
  collect(readJson(join(target, ".claude", "settings.json")));
  collect(readJson(join(target, ".claude", "settings.local.json")));
  // Bloc local-scope du projet dans ~/.claude.json (clé = chemin absolu ; on tente plusieurs formes).
  const projects = home?.["projects"];
  if (projects && typeof projects === "object") {
    const seen = new Set<string>();
    for (const key of [canonical(target), resolve(target), target]) {
      if (seen.has(key)) continue;
      seen.add(key);
      const entry = (projects as Record<string, unknown>)[key];
      if (entry && typeof entry === "object") collect(entry as Record<string, unknown>);
    }
  }
  return names;
}

/**
 * Match BORNÉ d'un token contre un set de noms (jamais un substring sauvage) : égalité, préfixe
 * `token-` / `token@`, ou variantes `mcp-token` / `token-mcp`. Évite qu'un serveur sans rapport
 * (ex. `my-drizzle-studio`) valide à tort un outil prescrit (`drizzle`).
 */
export function setIncludesToken(names: Set<string>, token: string): boolean {
  for (const n of names) {
    if (n === token) return true;
    if (n.startsWith(token + "-") || n.startsWith(token + "@")) return true;
    if (n === "mcp-" + token || n === token + "-mcp") return true;
  }
  return false;
}
