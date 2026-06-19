#!/usr/bin/env bun

/**
 * cost-safety.ts — gardes PreToolUse anti-coût-runaway pour les projets dont le moteur IA est
 * `claude -p` (ou qui martèlent des API externes). Le pire scénario : une commande qui boucle
 * 10 000 fois sur une API ou lance 200 agents en parallèle avant que quiconque s'en aperçoive.
 *
 *   - bulk-api-guard   : une commande Bash prouvant > 10 appels API externes (curl/wget/gh api/http)
 *                        → REFUS (exit 2). Une boucle non bornée autour d'un appel API → AVERTISSEMENT.
 *   - agent-spawn-guard: une commande prouvant > 5 spawns d'agent `claude -p` (occurrences littérales,
 *                        ou parallélisme `xargs -P N` / `-j N` / `seq N` autour de `claude -p`) → REFUS.
 *
 * NB : ces gardes visent les commandes Bash du RUNTIME du projet, jamais l'outil Task du développeur
 * (la parallélisation d'agents en interactif reste libre). Zéro dépendance npm.
 */

const action = process.argv[2] ?? "";

interface HookInput {
  tool_input?: { command?: unknown };
}

async function readHookInput(): Promise<HookInput> {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as HookInput) : {};
  } catch {
    return {};
  }
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

const API_LIMIT = 10;
const SPAWN_LIMIT = 5;

const API_CALL = /\b(?:curl|wget|gh\s+api|https?-request|fetch)\b/gi;
const LOOP = /\b(?:for|while|xargs|seq|parallel)\b/i;
const AGENT_SPAWN = /\bclaude\s+(?:-p|--print)\b/gi;

function count(cmd: string, re: RegExp): number {
  return (cmd.match(re) ?? []).length;
}

/** Plus grand entier suivant l'un des flags de parallélisme/itération (xargs -P, -j, seq N). */
function maxParallelism(cmd: string): number {
  let max = 0;
  for (const m of cmd.matchAll(/-P\s*(\d+)|-j\s*(\d+)|\bseq\s+(?:\d+\s+)?(\d+)/gi)) {
    const n = Number(m[1] ?? m[2] ?? m[3] ?? 0);
    if (n > max) max = n;
  }
  return max;
}

function deny(message: string): never {
  console.error(`[COST-SAFETY] ${message}`);
  process.exit(2);
}

function bulkApiGuard(cmd: string): void {
  const apiCount = count(cmd, API_CALL);
  if (apiCount > API_LIMIT) {
    deny(
      `commande prouvant ${apiCount} appels API externes (> ${API_LIMIT}) — risque de coût/abus runaway. ` +
        `Borne la boucle, batch, ou exécute par lots explicites.`,
    );
  }
  if (apiCount >= 1 && LOOP.test(cmd)) {
    // Boucle non bornée autour d'un appel API : on ne peut pas prouver ≤ 10 → avertit (n'empêche pas).
    console.log(JSON.stringify({
      systemMessage: `cost-safety: boucle autour d'un appel API détectée — vérifie qu'elle est bornée (≤ ${API_LIMIT} appels).`,
    }));
  }
}

function agentSpawnGuard(cmd: string): void {
  const spawns = count(cmd, AGENT_SPAWN);
  const parallel = maxParallelism(cmd);
  // Un parallélisme élevé ne compte que s'il enveloppe un spawn d'agent `claude -p`.
  const effective = spawns >= 1 ? Math.max(spawns, parallel) : 0;
  if (effective > SPAWN_LIMIT) {
    deny(
      `commande prouvant ${effective} spawns d'agent \`claude -p\` (> ${SPAWN_LIMIT}) — risque de coût runaway. ` +
        `Réduis le parallélisme ou borne explicitement.`,
    );
  }
}

const input = await readHookInput();
const cmd = str(input.tool_input?.command);

if (action === "bulk-api-guard") {
  bulkApiGuard(cmd);
} else if (action === "agent-spawn-guard") {
  agentSpawnGuard(cmd);
}
process.exit(0);
