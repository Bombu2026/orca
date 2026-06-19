#!/usr/bin/env bun

/**
 * rule-of-two.ts — garde-fou sécurité agentique (Agents Rule of Two, Meta 2025).
 *
 * La « lethal trifecta » (Simon Willison) : un agent devient une arme d'exfiltration dès qu'il
 * réunit les TROIS — A) accès à des données privées, B) exposition à du contenu NON FIABLE,
 * C) capacité d'ACTION SORTANTE. Règle de Meta : un agent autonome détient AU PLUS 2 des 3 sans
 * humain ; les trois réunis → human-in-the-loop OU sessions à contexte frais (≤2 propriétés chacune).
 *
 * Pourquoi ici : /assistant promeut l'autonomie longue (/loop, /goal) ET configure des bot-agents
 * qui lisent du contenu externe (B) + accèdent à des secrets/DB (A) + envoient des actions (C). Sans
 * ce garde-fou, l'autonomie vendue est dangereuse. Le verdict devient le 6e levier de l'Autonomy Card.
 *
 * Fonctions PURES (testables sans filesystem). autonomy.ts les nourrit avec les deps lues du
 * package.json + le type détecté.
 *
 * CLI :  bun scripts/lib/rule-of-two.ts --A --B --C [--hitl]
 *        bun scripts/lib/rule-of-two.ts --deps="@ai-sdk/anthropic,better-auth,stripe" --type=bot-agent
 */

export interface Trifecta {
  A: boolean;
  B: boolean;
  C: boolean;
  reasons: { A: string; B: string; C: string };
}
export type RuleOfTwoVerdict = "ALLOW" | "REQUIRE-HUMAN";

// Signatures de deps par branche de la trifecta (best-effort, sur les NOMS de paquets).
const A_DATA = /better-auth|next-auth|@auth\/|lucia|clerk|@supabase|drizzle-orm|prisma|mongoose|^pg$|mysql2?|ioredis|^redis$|@aws-sdk|stripe|keytar/i;
const B_UNTRUSTED = /@ai-sdk|@anthropic-ai|^openai$|langchain|llamaindex|puppeteer|playwright|cheerio|rss-parser|mailparser|imapflow|discord\.js|telegraf|node-telegram|@slack\/|whatsapp/i;
const C_OUTBOUND = /stripe|nodemailer|resend|@sendgrid|twilio|^axios$|^got$|node-fetch|undici|octokit|@octokit|discord\.js|telegraf|@slack\/|webhook/i;

/** Best-effort : déduit A/B/C des deps + du type. Un bot-agent ingère (B) et agit (C) par nature. */
export function detectTrifecta(deps: string[], type: string | null): Trifecta {
  const has = (re: RegExp) => deps.some((d) => re.test(d));
  const isAgent = type === "bot-agent";
  const A = has(A_DATA);
  const B = isAgent || has(B_UNTRUSTED);
  const C = isAgent || has(C_OUTBOUND);
  return {
    A,
    B,
    C,
    reasons: {
      A: A ? "deps auth/DB/secrets/paiement détectées" : "aucun accès à des données privées détecté",
      B: B
        ? isAgent
          ? "agent : ingère du contenu externe/non fiable"
          : "deps LLM/scraping/messaging détectées"
        : "pas d'ingestion de contenu non fiable détectée",
      C: C
        ? isAgent
          ? "agent : peut agir/communiquer vers l'extérieur"
          : "deps email/HTTP/paiement/webhook détectées"
        : "pas d'action sortante détectée",
    },
  };
}

/** Le verdict Rule of Two. Trois propriétés sans humain = refus de l'autonomie non surveillée. */
export function ruleOfTwo(
  t: { A: boolean; B: boolean; C: boolean },
  humanInLoop = false,
): { verdict: RuleOfTwoVerdict; count: number; reason: string } {
  const count = (t.A ? 1 : 0) + (t.B ? 1 : 0) + (t.C ? 1 : 0);
  const triplet = `A=${t.A ? 1 : 0} B=${t.B ? 1 : 0} C=${t.C ? 1 : 0}`;
  if (count < 3) return { verdict: "ALLOW", count, reason: `≤2 des 3 propriétés (${triplet}) — autonomie longue acceptable.` };
  if (humanInLoop) return { verdict: "ALLOW", count, reason: `lethal trifecta (${triplet}) mais human-in-the-loop = mitigation.` };
  return {
    verdict: "REQUIRE-HUMAN",
    count,
    reason: `lethal trifecta (${triplet}) sans humain : refuse l'autonomie non surveillée — ajoute un human-in-the-loop, casse une branche (retire A/B/C), ou découpe en sessions fraîches ≤2 propriétés.`,
  };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const flag = (k: string): string | null => {
    const a = args.find((x) => x.startsWith(`--${k}=`));
    return a ? a.slice(k.length + 3) : null;
  };
  let t: { A: boolean; B: boolean; C: boolean };
  const depsArg = flag("deps");
  if (depsArg !== null || flag("type")) {
    const deps = (depsArg ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    t = detectTrifecta(deps, flag("type"));
  } else {
    t = { A: args.includes("--A"), B: args.includes("--B"), C: args.includes("--C") };
  }
  const v = ruleOfTwo(t, args.includes("--hitl"));
  console.log(JSON.stringify({ trifecta: t, ...v }, null, 2));
}
