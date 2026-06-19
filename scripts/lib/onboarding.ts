#!/usr/bin/env bun

/**
 * onboarding.ts — l'Onboarding Card de /assistant.
 *
 * La doctrine historique de /assistant était « détecter, pas questionner ». C'est juste
 * pour le HARNESS (le mode se déduit : seed/bootstrap/audit/next-gap, jamais un choix user).
 * Mais le PRODUIT — à quoi il sert, pour qui, ce que « fini à 100% » veut dire, la cible de
 * déploiement, le niveau de design — ne se devine PAS depuis le filesystem. Sur un nouveau
 * projet, /assistant doit donc INTERROGER d'abord (brief → questions ciblées), PUIS agir.
 *
 * Ce module réifie cette bascule en données, pour que /assistant ne l'oublie jamais :
 *
 *   1. mode          — interview (nouveau projet / brief absent) ou health-check (re-run).
 *   2. questions      — le plan d'interrogation GAP-DRIVEN : seulement ce que la détection ne
 *                       sait pas (jamais redemander le framework déjà détecté). Claude le
 *                       transforme en appels AskUserQuestion batchés.
 *   3. goal · loop    — la prescription CONCRÈTE et copiable de /goal et /loop, dérivée de
 *                       l'état réel (score, DoD, auditeurs manquants) et gatée par la version CC
 *                       (jamais un faux /goal si l'évaluateur n'existe pas — cohérent autonomy.ts).
 *   4. installation   — « tout est-il bien installé ? » : pour chaque outil prescrit, présent ou
 *                       manquant dans la cible (skills/.claude, MCP, hooks). Répond au check de re-run.
 *
 * Lecture seule : aucune écriture → hors périmètre du scope-fence. Consommé par organise.ts.
 * Zéro dépendance npm (built-ins fs/os/path + import local de autonomy.ts).
 *
 * CLI (debug) :  bun scripts/lib/onboarding.ts <target> --branch=<b> --type=<t> [--cc=] [--json]
 */

import { existsSync } from "fs";
import { join } from "path";
import { autonomyCard, type AutonomyReport } from "./autonomy";
import { HOME, readJson, mcpServerNames, setIncludesToken } from "./cc-config";

export type OnboardingMode = "interview" | "health-check" | "dirty";
export type Branch = "SEED" | "DIRTY-FIRST" | "BOOTSTRAP" | "NEXT-GAP";
export type InstallStatus = "installed" | "missing" | "n/a";

export interface OnboardingQuestion {
  id: string;
  topic: string;
  /** "question" = sujet ouvert à élucider ; "confirm" = la détection a tranché, on ne demande
   * plus qu'une confirmation binaire (gap-driven réel : on ne redemande pas ce que le filesystem sait). */
  kind?: "question" | "confirm";
  /** La question à poser, prête pour AskUserQuestion (français, non-tech). */
  ask: string;
  why: string;
  /** Ce que la réponse alimente : "/goal", "DoD", "stack", "permissions"… */
  feeds: string;
}

export interface OnboardingTool {
  name: string;
  kind: string; // "MCP" | "skill" | "discipline" | "hook" | "plugin"
  why?: string;
}

export interface OnboardingInput {
  target: string;
  branch: Branch;
  projectType: string | null;
  detect:
    | { auth?: string | null; database?: string | null; deployment?: string | null; detectedIntegrations?: string[] }
    | null;
  lifecycle: { completion: number | null; isFinished: boolean } | null;
  /** Nombre de rapports d'auditeur encore manquants (sécurité/backend/a11y/perf). */
  auditorsMissing: number;
  prescription: OnboardingTool[];
  autonomy: AutonomyReport;
  /** Repo Readiness courant (sert de cible chiffrée au /goal). */
  readiness: number;
}

export interface OnboardingPlan {
  mode: OnboardingMode;
  briefPresent: boolean;
  questions: OnboardingQuestion[];
  /** Phase CLARIFY (interview seulement) : protocole d'élicitation réifié — paraphrase-and-confirm,
   * règle d'arrêt (interprétation unique + vérifiabilité), gate (artefact 6 cases + critique formelle). */
  clarify: { paraphrase: string; stopRule: string; gate: string } | null;
  /** Commandes de découverte d'outils (library 7876+) — réifie l'exigence « va chercher TOUS les outils ». */
  discovery: { strategySelect: string; installToolkit: string; note: string } | null;
  goal: { command: string; supported: boolean; note: string };
  loop: { command: string; note: string };
  installation: Array<{ tool: string; kind: string; status: InstallStatus }>;
  installSummary: { installed: number; missing: number; na: number };
  lines: string[];
  md: string[];
}

// HOME, readJson, mcpServerNames, setIncludesToken : importés de ./cc-config (partagé avec autonomy.ts).

// ---------------------------------------------------------------------------
// Lecture best-effort de la config (jamais ne lève)
// ---------------------------------------------------------------------------

/** Noms de plugins activés (best-effort), en minuscule. */
function pluginNames(target: string): Set<string> {
  const names = new Set<string>();
  const collect = (cfg: Record<string, unknown> | null) => {
    if (!cfg) return;
    const enabled = cfg["enabledPlugins"];
    if (Array.isArray(enabled)) {
      for (const k of enabled) if (typeof k === "string") names.add(k.toLowerCase());
    } else if (enabled && typeof enabled === "object") {
      for (const k of Object.keys(enabled)) names.add(k.toLowerCase());
    }
  };
  collect(readJson(join(HOME, ".claude.json")));
  collect(readJson(join(HOME, ".claude", "settings.json")));
  collect(readJson(join(target, ".claude", "settings.json")));
  collect(readJson(join(target, ".claude", "settings.local.json")));
  return names;
}

/** Commandes (en minuscule) de TOUS les hooks configurés dans la cible — pour matcher par identité, pas par présence. */
function configuredHookCommands(target: string): string[] {
  const cmds: string[] = [];
  for (const p of [join(target, ".claude", "settings.json"), join(target, ".claude", "settings.local.json")]) {
    const cfg = readJson(p);
    const hooks = cfg?.["hooks"];
    if (!hooks || typeof hooks !== "object") continue;
    for (const phase of Object.values(hooks as Record<string, unknown>)) {
      if (!Array.isArray(phase)) continue;
      for (const matcher of phase) {
        const hs = (matcher as Record<string, unknown> | null)?.["hooks"];
        if (!Array.isArray(hs)) continue;
        for (const h of hs) {
          const c = (h as Record<string, unknown> | null)?.["command"];
          if (typeof c === "string") cmds.push(c.toLowerCase());
        }
      }
    }
  }
  return cmds;
}

/** Mots-clés attendus dans la commande d'un hook prescrit (synonymes inclus). */
function hookTokens(name: string): string[] {
  const action = name.toLowerCase().split("-")[0] ?? "";
  if (action === "typecheck") return ["typecheck", "tsc"];
  if (action === "test") return ["test", "vitest", "jest"];
  if (action === "lint") return ["lint", "eslint", "biome"];
  return action ? [action] : [];
}

/** Token présent comme MOT dans la commande (borné) — « test » ne matche pas « attestation ». */
function cmdHasToken(cmd: string, token: string): boolean {
  const t = token.replace(/[^a-z0-9]/g, "");
  return t.length > 0 && new RegExp(`(^|[^a-z0-9])${t}([^a-z0-9]|$)`).test(cmd);
}

function skillInstalled(target: string, slug: string): boolean {
  return (
    existsSync(join(target, ".claude", "skills", slug)) ||
    existsSync(join(HOME, ".claude", "skills", slug))
  );
}

// ---------------------------------------------------------------------------
// Banque de questions GAP-DRIVEN — on ne demande QUE ce que la détection ignore,
// et quand la détection a tranché, on DÉGRADE en confirmation binaire (kind:"confirm")
// au lieu de reposer la question ouverte. C'est le gap-driven réel de l'état de l'art
// spec-driven : ne jamais redemander à blanc ce que le filesystem prouve déjà.
// ---------------------------------------------------------------------------

const WEB = new Set(["web-fullstack", "website-showcase"]);
const WEB_API = new Set(["web-fullstack", "api-backend"]);
const HAS_UI = new Set(["web-fullstack", "website-showcase", "design-only"]);
const NEEDS_SCALE = new Set(["web-fullstack", "api-backend", "website-showcase", "bot-agent"]);

function buildQuestions(type: string, detect: OnboardingInput["detect"]): OnboardingQuestion[] {
  const q: OnboardingQuestion[] = [];
  const deployKnown = !!detect?.deployment;
  const authKnown = !!detect?.auth;

  // Toujours : ce qu'aucune détection ne peut savoir.
  q.push({
    id: "purpose",
    topic: "Raison d'être",
    ask: "À quoi sert ce produit, et pour qui ? (le problème résolu + l'utilisateur cible en une phrase)",
    why: "le code dit le COMMENT, jamais le POURQUOI — sans ça la prescription tire à l'aveugle.",
    feeds: "compréhension · DoD",
  });
  q.push({
    id: "definition-of-done",
    topic: "Définition de « fini à 100% »",
    ask: "Qu'est-ce qui doit marcher pour que tu dises « c'est fini » ? (les 1-3 parcours utilisateur non négociables)",
    why: "c'est la condition de sortie réelle — elle devient le cœur de ton /goal et de la DoD.",
    feeds: "/goal · DoD",
  });
  // Les 2 cases les plus omises de l'état de l'art spec-driven (et les plus rentables) : la
  // frontière négative et les choix déjà arrêtés. UNIVERSELLES : elles bornent l'agent autonome
  // (anti gold-plating sur N tours) et coupent le re-débat de décisions actées. Voir LOOP_SYSTEM_SPEC.md.
  q.push({
    id: "out-of-scope",
    topic: "Hors-scope explicite",
    ask: "Qu'est-ce que ce projet ne doit explicitement PAS faire / quelles features sont hors v1 ?",
    why: "sans frontière négative, l'agent autonome élargit le scope (gold-plating) sans garde-fou.",
    feeds: "scope-fence · DoD",
  });
  q.push({
    id: "fixed-decisions",
    topic: "Décisions déjà figées",
    ask: "Quelles décisions sont déjà arrêtées et non à rediscuter (stack imposée, design system, plateformes cibles, modèle éco) ?",
    why: "verrouille la prescription pour ne pas re-proposer l'acté, et alimente la constitution always-on.",
    feeds: "prescription · constitution",
  });

  if (NEEDS_SCALE.has(type))
    q.push(
      deployKnown
        ? {
            id: "scale-deploy",
            topic: "Échelle & déploiement",
            kind: "confirm",
            ask: `Déploiement détecté : ${detect?.deployment}. Confirme la charge attendue (combien d'utilisateurs visés) — OK pour dimensionner caching/CDN/scaling là-dessus ?`,
            why: "la cible de déploiement est connue ; reste à confirmer la charge pour la DoD production.",
            feeds: "DoD production",
          }
        : {
            id: "scale-deploy",
            topic: "Échelle & déploiement",
            ask: "Combien d'utilisateurs visés et où ça tourne en prod ? (hébergeur + charge attendue)",
            why: "détermine caching/CDN/scaling de la DoD production-reality — invisible dans le code.",
            feeds: "DoD production",
          },
    );

  if (WEB_API.has(type))
    q.push(
      authKnown
        ? {
            id: "data-sensitivity",
            topic: "Données & conformité",
            kind: "confirm",
            ask: `Auth détectée : ${detect?.auth}. Périmètre RGPD/sensibilité standard (comptes + données perso) — OK, ou il y a des paiements / données de santé / autre à protéger ?`,
            why: "l'auth est en place ; reste à confirmer le périmètre exact à protéger.",
            feeds: "DoD sécurité",
          }
        : {
            id: "data-sensitivity",
            topic: "Données & conformité",
            ask: "Données sensibles, comptes, paiements, RGPD ? (ce qui doit être protégé, qui accède à quoi)",
            why: "fixe le niveau auth/RBAC/RGPD/sécurité exigé — une intention, pas un fichier.",
            feeds: "DoD sécurité",
          },
    );

  if (HAS_UI.has(type))
    q.push({
      id: "design-bar",
      topic: "Niveau de design",
      ask: "Niveau de design visé : fonctionnel suffisant, ou vitrine soignée / Awwwards ?",
      why: "décide d'enrôler senior-designer et de durcir la DoD a11y/perf, ou non.",
      feeds: "prescription design",
    });

  q.push({
    id: "constraints",
    topic: "Contraintes",
    ask: "Contraintes dures : délai, techno imposée ou interdite, systèmes/API existants à brancher ?",
    why: "borne la stack et écarte les outils incompatibles avant de prescrire.",
    feeds: "stack · prescription",
  });
  q.push({
    id: "autonomy-bound",
    topic: "Autonomie souhaitée",
    ask: "Tu veux que je tourne combien de temps en autonomie, et avec quel niveau de validation (auto-accept ou je te demande) ?",
    why: "fixe la borne « stop after N turns » du /goal et le mode permissions de la session.",
    feeds: "/goal · permissions",
  });

  return q;
}

// ---------------------------------------------------------------------------
// /goal · /loop — prescription concrète, gatée par la version CC (via autonomy)
// ---------------------------------------------------------------------------

function buildGoalLoop(input: OnboardingInput): { goal: OnboardingPlan["goal"]; loop: OnboardingPlan["loop"] } {
  const type = input.projectType ?? "projet";
  const loopGoalLever = input.autonomy.levers.find((l) => l.id === "loop-goal");
  const goalSupported = loopGoalLever?.state === "armed";

  // Condition de sortie : on n'empile que ce qui s'applique réellement.
  const parts: string[] = ["Repo Readiness ≥ 9/10"];
  if (input.lifecycle && !input.lifecycle.isFinished) {
    const pct = input.lifecycle.completion != null ? ` (actuellement ${input.lifecycle.completion}%)` : "";
    parts.push(`DoD ${type} verte${pct}`);
  } else if (input.lifecycle?.isFinished) {
    parts.push(`DoD ${type} maintenue verte`);
  }
  if (input.auditorsMissing > 0) parts.push(`${input.auditorsMissing} rapport(s) d'auditeur écrit(s)`);

  // Pas de backticks dans la condition : elle est elle-même rendue en code inline (md) — des
  // backticks internes casseraient le span. Le scan reste citable tel quel.
  const condition = `${parts.join(" ET ")}, prouvés dans le transcript par l'output de organise.ts (bun ~/.claude/skills/assistant/scripts/organise.ts .) — or stop after 20 turns`;
  const command = `/goal "${condition}"`;

  const goalNote = goalSupported
    ? "l'évaluateur /goal ne lit QUE le transcript : chaque tour doit FAIRE APPARAÎTRE l'output du scan, pas juste écrire un fichier."
    : loopGoalLever?.detail ?? "/goal exige CC ≥ 2.1.139 — en attendant, pilote la boucle avec /loop ci-dessous.";

  const loop = {
    command: "/loop 30m /assistant",
    note:
      "chaque tour relit QUALITY_SCORE.md / LIFECYCLE.md (l'état persistant), traite UN gap, re-scanne. " +
      "Au bootstrap, copie `templates/loop.md` → `.claude/loop.md` de la cible : `/loop` sans argument lance alors le tour de maintenance idempotent.",
  };

  return { goal: { command, supported: !!goalSupported, note: goalNote }, loop };
}

// ---------------------------------------------------------------------------
// Découverte d'outils — réifie « va chercher TOUS les skills/subagents/hooks/MCP nécessaires ».
// La prescription PRESET d'organise.ts n'est qu'un socle ; la VRAIE équipe se mine dans la library
// (7876+ skills/agents) par strategy-select + install-toolkit. On émet les commandes pré-remplies
// (type + cible) pour que la directive soit portée par les DONNÉES, pas seulement par la prose.
// ---------------------------------------------------------------------------

function buildDiscovery(type: string, target: string): { strategySelect: string; installToolkit: string; note: string } {
  const t = type || "unknown";
  return {
    strategySelect: `bun ~/.claude/skills/assistant/scripts/strategy-select.ts "<brief + réponses interview>" --type=${t} --write=${target}`,
    installToolkit: `bun ~/.claude/skills/assistant/scripts/install-toolkit.ts ${target} --keywords="<brief>" --type=${t} --skills=top:8 --agents=top:6`,
    note: "mine la library par intention (skills + subagents + hooks) ; la Prescription ci-dessous n'est qu'un socle. Matérialise l'équipe découverte, puis re-scanne.",
  };
}

// ---------------------------------------------------------------------------
// Plan d'onboarding
// ---------------------------------------------------------------------------

export function onboardingPlan(input: OnboardingInput): OnboardingPlan {
  const { target, branch } = input;
  const type = input.projectType ?? "unknown";

  const briefPresent = existsSync(join(target, "PROJECT_BRIEF.md")) || existsSync(join(target, "docs", "BRIEF.md"));

  // DIRTY-FIRST : ni interview ni health-check (doctrine dogfood « un auditeur ne travaille pas
  // sur un arbre sale »). Plan NEUTRALISÉ — aucune boucle prescrite, une seule directive : commit.
  if (branch === "DIRTY-FIRST") {
    const line = "arbre sale → commit/stash d'abord ; aucun onboarding tant que `git status` n'est pas propre.";
    return {
      mode: "dirty",
      briefPresent,
      questions: [],
      clarify: null,
      discovery: null,
      goal: { command: "", supported: false, note: "arbre sale : assainis avant toute boucle autonome." },
      loop: { command: "", note: "suspendu tant que l'arbre n'est pas propre." },
      installation: [],
      installSummary: { installed: 0, missing: 0, na: 0 },
      lines: [`   ${line}`],
      md: [`- **Mode** : dirty — ${line}`],
    };
  }

  // Interview sur tout NOUVEAU projet (seed/bootstrap) ET sur un next-gap encore SANS brief
  // (jamais interviewé). Health-check sinon (re-run d'un projet déjà cadré).
  const mode: OnboardingMode =
    branch === "SEED" || branch === "BOOTSTRAP" || (branch === "NEXT-GAP" && !briefPresent)
      ? "interview"
      : "health-check";

  const questions = mode === "interview" ? buildQuestions(type, input.detect) : [];
  // Phase CLARIFY (protocole d'élicitation réifié) : paraphrase-and-confirm AVANT toute écriture,
  // règle d'arrêt (interprétation unique + vérifiabilité), gate (artefact 6 cases + critique formelle).
  const clarify =
    mode === "interview"
      ? {
          paraphrase:
            "Reformule en 2-3 phrases ta compréhension de l'intention (raison d'être + définition de « fini » + hors-scope) et fais-la CONFIRMER ; ne code rien tant que ce n'est pas validé.",
          stopRule:
            "arrête de questionner quand chaque sujet a une interprétation unique (toi et l'user convergez) ET que « fini » est vérifiable (parcours testable Given/When/Then) — puis STOP, ne sur-spécifie pas.",
          gate:
            "écris les réponses dans PROJECT_BRIEF.md (6 cases, pas de prose libre) puis relis-le en self-review adversarial (cohérence / faisabilité / vérifiabilité) AVANT le code, pas seulement au ship.",
        }
      : null;
  const discovery = mode === "interview" ? buildDiscovery(type, target) : null;
  const { goal, loop } = buildGoalLoop(input);

  // Installation : pour chaque outil prescrit, présent dans la cible (ou en global) ?
  const mcp = mcpServerNames(target);
  const plugins = pluginNames(target);
  const hookCmds = configuredHookCommands(target);
  const installation = input.prescription.map((t) => {
    let status: InstallStatus = "missing";
    const token = t.name.toLowerCase().split(/\s+/)[0] ?? t.name.toLowerCase();
    if (t.kind === "discipline") status = "n/a"; // une pratique, pas un fichier installable
    else if (t.kind === "skill") status = skillInstalled(target, t.name.toLowerCase().replace(/\s+/g, "-")) ? "installed" : "missing";
    else if (t.kind === "MCP") status = setIncludesToken(mcp, token) ? "installed" : "missing";
    else if (t.kind === "plugin") status = setIncludesToken(plugins, token) ? "installed" : "missing";
    else if (t.kind === "hook") {
      const want = hookTokens(t.name);
      status = hookCmds.some((c) => want.some((w) => cmdHasToken(c, w))) ? "installed" : "missing";
    }
    return { tool: t.name, kind: t.kind, status };
  });
  const installSummary = {
    installed: installation.filter((i) => i.status === "installed").length,
    missing: installation.filter((i) => i.status === "missing").length,
    na: installation.filter((i) => i.status === "n/a").length,
  };

  // ---- rendu terminal ----
  const lines: string[] = [];
  lines.push(`   mode : ${mode}${briefPresent ? " (brief présent)" : " (pas de brief — j'interroge)"}`);
  if (mode === "interview") {
    lines.push(`   Interroger AVANT d'agir — ${questions.length} sujets (AskUserQuestion, batché ≤4) :`);
    questions.forEach((q) => lines.push(`     • ${q.topic}${q.kind === "confirm" ? " [confirm]" : ""} → ${q.ask}`));
  }
  if (clarify) {
    lines.push("   CLARIFY (avant toute écriture de code) :");
    lines.push(`     • paraphrase-confirm : ${clarify.paraphrase}`);
    lines.push(`     • règle d'arrêt : ${clarify.stopRule}`);
    lines.push(`     • gate : ${clarify.gate}`);
  }
  if (discovery) {
    lines.push("   Découvrir les outils (miner la library, pas juste le socle) :");
    lines.push(`     ${discovery.strategySelect}`);
    lines.push(`     ${discovery.installToolkit}`);
  }
  lines.push(`   /goal : ${goal.command || "(suspendu — arbre sale)"}`);
  if (goal.command && !goal.supported) lines.push(`     (${goal.note})`);
  lines.push(`   /loop : ${loop.command || "(suspendu — arbre sale)"}`);
  if (input.prescription.length) {
    const miss = installation.filter((i) => i.status === "missing").map((i) => i.tool);
    lines.push(`   installé : ${installSummary.installed}/${installSummary.installed + installSummary.missing}${miss.length ? ` — manquants : ${miss.join(", ")}` : " — complet"}`);
  }

  // ---- rendu Markdown (QUALITY_SCORE.md) ----
  const md: string[] = [];
  md.push(`- **Mode** : ${mode}${briefPresent ? " (brief présent)" : " (brief absent — interview requise)"}`);
  if (mode === "interview") {
    md.push("- **Interview (à poser AVANT d'agir, AskUserQuestion batché)** :");
    questions.forEach((q) => md.push(`  - _${q.topic}_${q.kind === "confirm" ? " (confirmation)" : ""} — ${q.ask} → alimente ${q.feeds}`));
  }
  if (clarify) {
    md.push("- **CLARIFY (avant toute écriture de code)** :");
    md.push(`  - paraphrase-confirm — ${clarify.paraphrase}`);
    md.push(`  - règle d'arrêt — ${clarify.stopRule}`);
    md.push(`  - gate — ${clarify.gate}`);
  }
  if (discovery) {
    md.push(`- **Découverte d'outils** (${discovery.note}) :`);
    md.push(`  - \`${discovery.strategySelect}\``);
    md.push(`  - \`${discovery.installToolkit}\``);
  }
  md.push(`- **/goal** : \`${goal.command}\``);
  md.push(`  - ${goal.note}`);
  md.push(`- **/loop** : \`${loop.command}\` — ${loop.note}`);
  if (input.prescription.length) {
    md.push(`- **Installation** : ${installSummary.installed} installé(s), ${installSummary.missing} manquant(s), ${installSummary.na} n/a`);
    installation
      .filter((i) => i.status !== "n/a")
      .forEach((i) => md.push(`  - [${i.status === "installed" ? "x" : " "}] ${i.tool} (${i.kind})`));
  }

  return { mode, briefPresent, questions, clarify, discovery, goal, loop, installation, installSummary, lines, md };
}

// ---------------------------------------------------------------------------
// CLI (debug / tests) — reconstruit un input minimal depuis les flags
// ---------------------------------------------------------------------------

if (import.meta.main) {
  const args = process.argv.slice(2);
  const target = args.find((a) => !a.startsWith("--")) ?? process.cwd();
  const flag = (k: string): string | null => {
    const a = args.find((x) => x.startsWith(`--${k}=`));
    return a ? a.slice(k.length + 3) : null;
  };
  const type = flag("type");
  const branch = (flag("branch") as Branch) ?? "NEXT-GAP";
  const cc = flag("cc");
  const completion = flag("completion");
  const auditorsMissing = parseInt(flag("auditors-missing") ?? "0", 10) || 0;
  const readiness = parseFloat(flag("readiness") ?? "0") || 0;
  // --prescribe=name:kind|name:kind  (kind ∈ MCP|skill|discipline|hook|plugin)
  const prescription: OnboardingTool[] = (flag("prescribe") ?? "")
    .split("|")
    .filter(Boolean)
    .map((p) => {
      const [name, kind] = p.split(":");
      return { name: name ?? "", kind: kind ?? "skill" };
    });
  const lifecycle =
    completion != null || args.includes("--finished")
      ? { completion: completion != null ? parseInt(completion, 10) : null, isFinished: args.includes("--finished") }
      : null;

  // --auth=/--deploy=/--db= permettent de tester la dégradation gap-driven (détecté → confirm).
  const auth = flag("auth");
  const deploy = flag("deploy");
  const db = flag("db");
  const detect =
    auth || deploy || db ? { auth, database: db, deployment: deploy, detectedIntegrations: [] } : null;

  const autonomy = autonomyCard({ target, projectType: type, ccVersion: cc });
  const plan = onboardingPlan({
    target,
    branch,
    projectType: type,
    detect,
    lifecycle,
    auditorsMissing,
    prescription,
    autonomy,
    readiness,
  });

  if (args.includes("--json")) {
    console.log(JSON.stringify(plan, null, 2));
  } else {
    console.log("\n  Onboarding (/assistant — interroger d'abord, prescrire /goal·/loop) :");
    console.log(plan.lines.join("\n"));
    console.log("");
  }
}
