#!/usr/bin/env bun

/**
 * lifecycle-audit.ts — la mémoire A→Z du cycle de vie produit, exécutée.
 *
 * /assistant doit piloter n'importe quel projet comme une équipe produit de classe
 * mondiale : connaître TOUT ce qu'on fait (auth, RBAC, paiements, CRM, email, RGPD,
 * sécurité, tests, evals d'agent, observabilité, CI/CD, perf, a11y, backups…), détecter où en est le
 * projet, dire L'ÉTAPE SUIVANTE concrète (une seule, pédagogique non-tech), et dire
 * quand le produit est VRAIMENT FINI (= toute la Definition of Done APPLICABLE est verte,
 * pas « build vert »).
 *
 * Ce script encode en détection exécutée la doctrine déjà écrite dans
 * references/assistant-excellence-standards.md + le catalogue lifecycle A→Z.
 * La DoD est CONTEXTUELLE au type de projet : un website-showcase n'exige pas d'auth/
 * paiements ; un api-backend n'exige pas a11y/SEO ; un web-fullstack = matrice complète.
 *
 * SELF-CONTAINED : aucune dépendance externe, seulement node:fs / node:path
 * (même style que detect-project.ts). N'invoque aucun autre script.
 *
 * Usage:
 *   bun scripts/lifecycle-audit.ts <chemin-projet> [--json] [--no-write]
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve, basename } from "node:path";

// ---------- args ----------
const rawArgs = process.argv.slice(2);
const flags = new Set(rawArgs.filter((a) => a.startsWith("--")));
const target = resolve(rawArgs.find((a) => !a.startsWith("--")) || process.cwd());
const asJson = flags.has("--json");
const noWrite = flags.has("--no-write");
// Profil : production (défaut, les 14 couches « production reality ») ou mock (prototype
// assumé : les capacités prodOnly sont exclues de la DoD — jamais en silence, toujours listées).
const mock = flags.has("--mock");

// ---------- types ----------
// Dupliqué localement (comme ProjectInfo l'est dans organise.ts) : les 7 types réels
// émis par detect-project.ts L13. Self-contained = pas d'import croisé.
type ProjectType =
  | "web-fullstack"
  | "website-showcase"
  | "bot-agent"
  | "cli-tool"
  | "api-backend"
  | "design-only"
  | "unknown";

type Severity = "blocker" | "important" | "nice";

type Capability = {
  id: string;            // identifiant court
  phase: string;         // phase du cycle de vie (P0..P9)
  label: string;         // nom métier de la capacité
  pedago: string;        // explication non-tech (1 ligne pour un fondateur)
  appliesTo: ProjectType[]; // types pour lesquels la DoD exige cette capacité
  severity: Severity;
  /** Couche « production reality » : exclue de la DoD en profil --mock (prototype assumé). */
  prodOnly?: boolean;
  /**
   * Garde d'applicabilité CONTEXTUELLE (au-delà du type) : la capacité ne s'applique que si ce
   * prédicat passe aussi. Ex. les evals ne concernent un api-backend que s'il est LLM-backed —
   * sans ça on créerait un faux gap bloquant sur une API CRUD. Absent = appliquée à tout le type.
   */
  appliesWhen?: (ctx: Ctx, type: ProjectType) => boolean;
  detect: (ctx: Ctx) => boolean; // vrai si la capacité est présente (DoD "fait" probable)
};

// ---------- contexte de scan (frontières fs, try/catch) ----------
type Ctx = {
  deps: Record<string, string>;
  scripts: Record<string, string>;
  schemaText: string;   // contenu concaténé des schémas Drizzle/Prisma (pour grep role)
  has: (rel: string) => boolean;
  hasAny: (...rels: string[]) => boolean;
  dirHasFiles: (rel: string) => boolean;
  globHasTest: boolean; // présence d'au moins un *.test.* / *.spec.* / dossier de tests
  dep: (...names: string[]) => boolean;
};

function safeReadJson(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function safeRead(path: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}

function safeReadDir(path: string): string[] {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

function buildCtx(root: string): Ctx {
  const pkg = (safeReadJson(join(root, "package.json")) ?? {}) as Record<string, Record<string, string>>;
  const deps: Record<string, string> = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const scripts: Record<string, string> = { ...(pkg.scripts ?? {}) };

  const has = (rel: string): boolean => existsSync(join(root, rel));
  const hasAny = (...rels: string[]): boolean => rels.some(has);
  const dirHasFiles = (rel: string): boolean => safeReadDir(join(root, rel)).length > 0;

  // Concatène les schémas plausibles pour grep d'une colonne `role` (RBAC).
  const schemaCandidates = [
    "src/db/schema.ts",
    "src/schema.ts",
    "db/schema.ts",
    "drizzle/schema.ts",
    "app/db/schema.ts",
    "lib/db/schema.ts",
    "prisma/schema.prisma",
    "schema.prisma",
  ];
  let schemaText = "";
  for (const rel of schemaCandidates) {
    if (has(rel)) schemaText += "\n" + safeRead(join(root, rel));
  }
  // Plus : scanne les dossiers schema/ si présents (frontière fs sûre, 1 niveau).
  for (const dir of ["src/db", "db", "drizzle", "lib/db"]) {
    for (const f of safeReadDir(join(root, dir))) {
      if (/schema/i.test(f) && f.endsWith(".ts")) schemaText += "\n" + safeRead(join(root, dir, f));
    }
  }

  // Détection légère de fichiers de tests sans walk récursif coûteux :
  // dossiers conventionnels + fichiers *.test.* / *.spec.* à la racine et dans src/.
  const testDirs = ["test", "tests", "__tests__", "e2e", "src/__tests__"];
  let globHasTest = testDirs.some((d) => dirHasFiles(d));
  if (!globHasTest) {
    const scanForTest = (dir: string): boolean =>
      safeReadDir(join(root, dir)).some((f) => /\.(test|spec)\.[tj]sx?$/.test(f));
    globHasTest = scanForTest(".") || scanForTest("src") || scanForTest("app") || scanForTest("tests");
  }

  const dep = (...names: string[]): boolean => names.some((n) => Object.prototype.hasOwnProperty.call(deps, n));

  return { deps, scripts, schemaText, has, hasAny, dirHasFiles, globHasTest, dep };
}

// ---------- détection du type (mini, self-contained) ----------
// Réplique la logique-clé de detect-project.ts pour rester sans dépendance.
// argv peut surcharger via --type=<x> si besoin de forcer.
function detectType(ctx: Ctx): { type: ProjectType; framework: string | null; language: string } {
  const forced = rawArgs.find((a) => a.startsWith("--type="));
  if (forced) {
    const t = forced.slice("--type=".length) as ProjectType;
    return { type: t, framework: null, language: "unknown" };
  }
  const { deps, has, dep } = ctx;
  const language = has("tsconfig.json")
    ? "typescript"
    : has("pyproject.toml") || has("requirements.txt")
      ? "python"
      : has("go.mod")
        ? "go"
        : has("Cargo.toml")
          ? "rust"
          : has("package.json")
            ? "javascript"
            : "unknown";

  let type: ProjectType = "unknown";
  let framework: string | null = null;

  if (dep("next")) { framework = "next.js"; type = "web-fullstack"; }
  else if (dep("nuxt")) { framework = "nuxt"; type = "web-fullstack"; }
  else if (dep("svelte", "@sveltejs/kit")) { framework = "sveltekit"; type = "web-fullstack"; }
  else if (dep("astro")) { framework = "astro"; type = "web-fullstack"; }
  else if (dep("react")) { framework = "react"; type = "web-fullstack"; }
  else if (dep("vue")) { framework = "vue"; type = "web-fullstack"; }
  else if (dep("express", "fastify", "hono", "@nestjs/core")) {
    framework = dep("express") ? "express" : dep("fastify") ? "fastify" : dep("hono") ? "hono" : "nestjs";
    type = "api-backend";
  } else if (dep("telegraf", "node-telegram-bot-api", "grammy", "@slack/bolt", "discord.js", "chat")) {
    type = "bot-agent";
  } else if (safeReadJson(join(target, "package.json"))?.bin) {
    type = "cli-tool";
  } else if (language === "python") {
    // Parité avec detect-project.ts L99-107 : sans ce bloc, tout projet Python tombait
    // en `unknown` → 0 capacité applicable → faux « 100% / pas de DoD ».
    const py = safeRead(join(target, "pyproject.toml")) + "\n" + safeRead(join(target, "requirements.txt"));
    if (/fastapi/i.test(py)) { framework = "fastapi"; type = "api-backend"; }
    else if (/django/i.test(py)) { framework = "django"; type = "web-fullstack"; }
    else if (/flask/i.test(py)) { framework = "flask"; type = "api-backend"; }
    else if (/\b(click|typer)\b/i.test(py)) { type = "cli-tool"; }
    else if (/\b(openai|anthropic|langchain)\b/i.test(py)) { type = "bot-agent"; }
  } else if (language === "go") {
    const gomod = safeRead(join(target, "go.mod"));
    if (/gin-gonic|labstack\/echo|gofiber\/fiber|go-chi\/chi/.test(gomod)) { framework = "go-web"; type = "api-backend"; }
    else { type = "cli-tool"; }
  } else if (language === "rust") {
    const cargo = safeRead(join(target, "Cargo.toml"));
    if (/\b(axum|actix-web|rocket|warp)\b/.test(cargo)) { framework = "rust-web"; type = "api-backend"; }
    else { type = "cli-tool"; }
  }

  // Showcase override : marqueur explicite, ou motion sans backend, ou docs/BRIEF.
  const showcaseMarker = has(".claude/showcase.json");
  const hasMotion = dep("framer-motion", "motion", "gsap", "lenis", "@react-three/fiber", "@splinetool/react-spline");
  const hasBackendDeps = dep("prisma", "@prisma/client", "drizzle-orm", "express", "fastify", "hono", "mongoose");
  const hasBrief = has("docs/BRIEF.md") || has("docs/MOODBOARD.md");
  if (showcaseMarker || (type === "web-fullstack" && (hasBrief || (hasMotion && !hasBackendDeps)))) {
    type = "website-showcase";
  }

  // AI/agent : si toujours unknown et SDK IA présent.
  if (type === "unknown" && dep("ai", "@ai-sdk/react", "@anthropic-ai/sdk", "openai", "langchain")) {
    type = "bot-agent";
  }

  // Design-only : présence de fichiers .pen et rien d'autre.
  if (type === "unknown" && safeReadDir(target).some((f) => f.endsWith(".pen"))) {
    type = "design-only";
  }

  // Static showcase : site HTML/CSS sans manifest (parité detect-project.ts)
  if (type === "unknown" && !has("package.json") && safeReadDir(target).some((f) => f.toLowerCase().endsWith(".html"))) {
    type = "website-showcase";
  }

  void deps;
  return { type, framework, language };
}

// ---------- LIFECYCLE_MATRIX (doctrine encodée) ----------
// Encodage TS de references/assistant-excellence-standards.md + catalogue A→Z.
// La « prochaine étape produit » = la capacité manquante triée par (sévérité, puis
// numéro de phase P0→P9, puis ordre du tableau) — voir orderedMissing plus bas. Le
// champ `phase` (et NON la position dans ce tableau) porte l'ordre du cycle de vie.
const ALL: ProjectType[] = ["web-fullstack", "api-backend", "bot-agent", "cli-tool", "website-showcase", "design-only", "unknown"];
const WEB: ProjectType[] = ["web-fullstack"];
const WEB_API: ProjectType[] = ["web-fullstack", "api-backend"];
const WEB_API_BOT: ProjectType[] = ["web-fullstack", "api-backend", "bot-agent"];
const PUBLIC_WEB: ProjectType[] = ["web-fullstack", "website-showcase"];
const CODE: ProjectType[] = ["web-fullstack", "api-backend", "bot-agent", "cli-tool"];
// « Tout sauf design-only » : doctrine tech-lifecycle P0.4 (env-config) et P6.2 (secrets).
// Une vitrine a aussi des clés (Resend, analytics) et un .env → secrets/env s'y appliquent.
const ALL_BUT_DESIGN: ProjectType[] = ["web-fullstack", "api-backend", "bot-agent", "cli-tool", "website-showcase"];
const DEPLOYABLE: ProjectType[] = ["web-fullstack", "api-backend", "bot-agent", "website-showcase"];
void ALL;

// PaaS détecté = CDN/scaling/compute DÉLÉGUÉS à la plateforme (Vercel, Netlify, Cloudflare,
// Fly, Render, Railway). Tant que le projet reste dessus, ces couches sont couvertes par
// construction — le jour où il en sort, elles redeviennent des gaps visibles.
function paasOf(c: Ctx): string | null {
  if (c.hasAny("vercel.json", ".vercel/project.json") || c.dep("@vercel/analytics", "@vercel/speed-insights", "@vercel/kv", "@vercel/blob")) return "Vercel";
  if (c.has("netlify.toml")) return "Netlify";
  if (c.has("wrangler.toml") || c.dep("wrangler", "@cloudflare/workers-types")) return "Cloudflare";
  if (c.has("fly.toml")) return "Fly.io";
  if (c.has("render.yaml")) return "Render";
  if (c.hasAny("railway.json", "railway.toml")) return "Railway";
  return null;
}

// LLM-backed = au moins un SDK de modèle. Sert à conditionner la DoD « evals » : un bot-agent l'est
// par définition de la taxonomie ; un api-backend ne l'est que s'il embarque un SDK IA.
const LLM_DEPS = [
  "ai", "@ai-sdk/react", "@ai-sdk/anthropic", "@ai-sdk/openai", "@anthropic-ai/sdk",
  "openai", "langchain", "@langchain/core", "llamaindex", "@google/generative-ai",
  "cohere-ai", "groq-sdk", "@mistralai/mistralai", "ollama",
];
function isLlmBacked(c: Ctx): boolean {
  return c.dep(...LLM_DEPS);
}

// Présence d'evals : dossier dédié, dep d'eval connue, script npm `eval*`, ou fichiers *.eval.*.
function hasEvals(c: Ctx): boolean {
  if (["evals", "eval", "test/evals", "tests/evals", "src/evals"].some((d) => c.dirHasFiles(d))) return true;
  if (Object.keys(c.scripts).some((k) => /^eval/i.test(k))) return true;
  if (c.dep("promptfoo", "autoevals", "braintrust", "evalite", "@anthropic-ai/evals", "langsmith", "deepeval")) return true;
  const scanEval = (dir: string): boolean => safeReadDir(join(target, dir)).some((f) => /\.eval\.[tj]sx?$/.test(f));
  return scanEval(".") || scanEval("src") || scanEval("tests");
}

const LIFECYCLE_MATRIX: Capability[] = [
  // PHASE 0 — Fondations
  {
    id: "env-config",
    phase: "P0",
    label: "Environnements & config (12-factor)",
    pedago: "séparer dev/prod et ne jamais coder un réglage en dur : un fichier .env.example liste les clés attendues.",
    appliesTo: ALL_BUT_DESIGN,
    severity: "blocker",
    detect: (c) => c.hasAny(".env.example", ".env.sample", ".env.template"),
  },
  {
    id: "data-model",
    phase: "P0",
    label: "Modélisation des données (schéma)",
    pedago: "le plan des « tiroirs » où vivent les données (users, commandes…), versionné et migrable.",
    appliesTo: WEB_API,
    severity: "blocker",
    detect: (c) => c.dep("drizzle-orm", "drizzle", "@prisma/client", "prisma") || c.schemaText.trim().length > 0,
  },
  {
    id: "migrations",
    phase: "P0",
    label: "Migrations de base de données",
    pedago: "faire évoluer la structure de la base sans perdre de données ni casser la prod.",
    appliesTo: WEB_API,
    severity: "important",
    detect: (c) => c.dirHasFiles("drizzle") || c.dirHasFiles("migrations") || c.dirHasFiles("prisma/migrations") || c.dirHasFiles("src/db/migrations"),
  },
  // PHASE 1 — Identité & accès
  {
    id: "auth",
    phase: "P1",
    label: "Authentification",
    pedago: "le login : prouver qui est l'utilisateur (signup/login/logout, reset, vérif email).",
    appliesTo: WEB_API,
    severity: "blocker",
    detect: (c) => c.dep("better-auth", "next-auth", "@auth/core", "@clerk/nextjs", "@clerk/clerk-sdk-node", "lucia"),
  },
  {
    id: "rbac",
    phase: "P1",
    label: "RBAC / permissions",
    pedago: "qui a le droit de voir/faire quoi (admin vs client), vérifié côté serveur.",
    appliesTo: WEB_API,
    severity: "important",
    detect: (c) => /\brole\b/i.test(c.schemaText) || c.has("middleware.ts") || c.has("src/middleware.ts"),
  },
  {
    id: "onboarding",
    phase: "P1",
    label: "Onboarding utilisateur",
    pedago: "les premières minutes qui font rester ou partir l'utilisateur (parcours « zero-to-value »).",
    appliesTo: WEB,
    severity: "nice",
    detect: (c) => c.hasAny("app/onboarding", "app/welcome", "src/app/onboarding", "src/app/welcome", "pages/onboarding"),
  },
  // PHASE 2 — Cœur métier
  {
    id: "admin",
    phase: "P2",
    label: "CRM / back-office / admin",
    pedago: "le tableau de bord interne pour gérer clients, contenus et commandes.",
    appliesTo: WEB,
    severity: "nice",
    detect: (c) => c.hasAny("app/admin", "src/app/admin", "pages/admin") || c.dep("react-admin", "@refinedev/core"),
  },
  // PHASE 4 — Communication
  {
    id: "email",
    phase: "P4",
    label: "Email transactionnel",
    pedago: "les emails déclenchés par une action (reset de mot de passe, reçu, alerte).",
    appliesTo: WEB_API,
    severity: "important",
    detect: (c) => c.dep("resend", "nodemailer", "@sendgrid/mail", "postmark", "@react-email/components"),
  },
  // PHASE 3 — Monétisation
  {
    id: "payments",
    phase: "P3",
    label: "Paiements / billing",
    pedago: "encaisser (one-shot ou abonnement) avec tous les états testés : succès, échec, remboursement, changement de plan.",
    appliesTo: WEB_API,
    severity: "important",
    detect: (c) => c.dep("stripe", "@stripe/stripe-js", "@lemonsqueezy/lemonsqueezy.js", "@paddle/paddle-node-sdk"),
  },
  // PHASE 6 — Sécurité & conformité
  {
    id: "validation",
    phase: "P5",
    label: "Validation des entrées",
    pedago: "ne jamais faire confiance à ce qui arrive de l'extérieur : tout ce qui entre est validé.",
    appliesTo: WEB_API_BOT,
    severity: "important",
    detect: (c) => c.dep("zod", "valibot", "@sinclair/typebox", "yup", "joi"),
  },
  {
    id: "error-handling",
    phase: "P5",
    label: "Gestion d'erreurs structurée",
    pedago: "quand ça casse, savoir quoi et où sans planter l'utilisateur ni exposer de détails techniques.",
    appliesTo: WEB_API, // api-backend.md exige des réponses d'erreur normalisées, pas seulement le front Next.
    severity: "important",
    detect: (c) =>
      c.hasAny(
        "app/error.tsx", "app/global-error.tsx", "src/app/error.tsx", "src/app/global-error.tsx",
        "src/middleware/error.ts", "src/middleware/errorHandler.ts", "src/middlewares/error.ts",
        "src/errors.ts", "src/lib/errors.ts", "middleware/error.ts",
      ) || c.dep("http-errors", "@hapi/boom"),
  },
  {
    id: "rgpd",
    phase: "P6",
    label: "RGPD / pages légales & privacy",
    pedago: "respecter la loi sur les données : politique de confidentialité, mentions légales, consentement cookies.",
    appliesTo: PUBLIC_WEB,
    severity: "important",
    detect: (c) =>
      c.hasAny(
        "app/privacy", "app/(legal)", "app/legal", "app/mentions-legales", "app/cookies", "app/confidentialite",
        "src/app/privacy", "src/app/legal", "pages/privacy", "pages/legal",
      ) || c.dep("vanilla-cookieconsent", "react-cookie-consent", "@cookieconsent/core"),
  },
  {
    id: "rate-limit",
    phase: "P5",
    label: "Rate-limiting / anti-abus",
    pedago: "empêcher qu'on abuse ou attaque le service (limites par IP/clé, réponse 429 propre).",
    appliesTo: WEB_API,
    severity: "important",
    detect: (c) => c.dep("@upstash/ratelimit", "express-rate-limit", "rate-limiter-flexible", "@upstash/redis"),
  },
  {
    id: "secrets-hygiene",
    phase: "P6",
    label: "Hygiène des secrets",
    pedago: "ne jamais laisser traîner les clés/mots de passe : .gitignore couvre les .env.",
    appliesTo: ALL_BUT_DESIGN,
    severity: "blocker",
    detect: (c) => {
      const gi = safeRead(join(target, ".gitignore"));
      return /\.env/.test(gi);
    },
  },
  // PHASE 7 — Qualité & tests
  {
    id: "lint",
    phase: "P7",
    label: "Lint / formatage",
    pedago: "un correcteur automatique qui garde le code propre et cohérent.",
    appliesTo: CODE,
    severity: "important",
    detect: (c) =>
      c.dep("@biomejs/biome", "eslint", "prettier") ||
      c.hasAny("biome.json", "biome.jsonc", ".eslintrc", ".eslintrc.json", ".eslintrc.cjs", "eslint.config.js", "eslint.config.mjs"),
  },
  {
    id: "tests",
    phase: "P7",
    label: "Tests automatisés",
    pedago: "vérifier automatiquement que chaque brique marche, à chaque changement.",
    appliesTo: CODE,
    severity: "blocker",
    detect: (c) => c.dep("vitest", "jest", "@jest/core", "mocha", "ava", "node:test") || c.globHasTest,
  },
  {
    id: "e2e",
    phase: "P7",
    label: "Tests E2E (vrai navigateur)",
    pedago: "simuler un vrai utilisateur dans un vrai navigateur — la preuve que le parcours promis marche, pas « build vert ».",
    appliesTo: PUBLIC_WEB,
    severity: "important",
    detect: (c) => c.dep("playwright", "@playwright/test", "cypress", "@cypress/react"),
  },
  {
    id: "evals",
    phase: "P7",
    label: "Evals d'agent (cas attendus ET interdits)",
    pedago: "la preuve qu'un produit IA fait ce qu'on promet ET refuse ce qu'il doit refuser : un jeu d'exemples « doit produire » ET « ne doit jamais produire » (fuite de secret, hallucination, jailbreak), rejoué à chaque changement de prompt/modèle.",
    appliesTo: WEB_API_BOT.filter((t) => t === "bot-agent" || t === "api-backend"),
    // bot-agent = agent par définition (toujours) ; api-backend seulement s'il est LLM-backed
    // (sinon une API CRUD écoperait d'un faux gap bloquant).
    appliesWhen: (c, t) => t === "bot-agent" || isLlmBacked(c),
    severity: "blocker",
    detect: (c) => hasEvals(c),
  },
  {
    id: "a11y",
    phase: "P7",
    label: "Accessibilité (a11y / WCAG)",
    pedago: "utilisable par tous : contraste suffisant, navigation clavier, lecteurs d'écran (WCAG AA).",
    appliesTo: PUBLIC_WEB, // critère central d'une vitrine ; couvert hors vitrine par l'agent a11y-auditor.
    severity: "important",
    detect: (c) =>
      c.dep("@axe-core/playwright", "axe-core", "@axe-core/react", "eslint-plugin-jsx-a11y", "pa11y") ||
      c.hasAny("A11Y_REPORT.md", ".claude/hooks/showcase.ts", "src/.claude/hooks/showcase.ts"),
  },
  // PHASE 9 — Livraison
  {
    id: "ci",
    phase: "P9",
    label: "CI/CD",
    pedago: "la chaîne qui teste et déploie automatiquement à chaque changement, et bloque si c'est rouge.",
    appliesTo: ALL_BUT_DESIGN, // website-showcase.md Phase 9 exige aussi le pipeline CI/CD.
    severity: "blocker",
    detect: (c) => c.dirHasFiles(".github/workflows") || c.hasAny(".gitlab-ci.yml", "Jenkinsfile", ".circleci/config.yml"),
  },
  // PHASE 5 — Observabilité
  {
    id: "observability",
    phase: "P5",
    label: "Observabilité / monitoring",
    pedago: "voir en temps réel si le produit va bien et être prévenu AVANT le client (erreurs, latence, alertes).",
    appliesTo: WEB_API_BOT,
    severity: "important",
    detect: (c) => c.dep("@sentry/nextjs", "@sentry/node", "@sentry/react", "pino", "winston", "@opentelemetry/api", "posthog-node"),
  },
  // PHASE 8 — Croissance
  {
    id: "seo",
    phase: "P8",
    label: "SEO (sitemap / robots)",
    pedago: "être trouvé sur Google : plan du site, balises, données structurées.",
    appliesTo: PUBLIC_WEB,
    severity: "nice",
    detect: (c) =>
      c.hasAny("app/sitemap.ts", "app/robots.ts", "src/app/sitemap.ts", "src/app/robots.ts", "public/sitemap.xml", "public/robots.txt") ||
      c.dep("next-sitemap"),
  },
  {
    id: "analytics",
    phase: "P8",
    label: "Analytics produit",
    pedago: "comprendre ce que font les utilisateurs (events clés, conforme RGPD).",
    appliesTo: PUBLIC_WEB,
    severity: "nice",
    detect: (c) => c.dep("@vercel/analytics", "posthog-js", "plausible-tracker", "@plausible/tracker", "mixpanel-browser"),
  },
  {
    id: "perf",
    phase: "P8",
    label: "Budget de performance (web-vitals / Lighthouse)",
    pedago: "le site/app charge vite et reste fluide : web-vitals / Lighthouse au vert.",
    appliesTo: PUBLIC_WEB, // critère central d'une vitrine ; couvert hors vitrine par l'agent perf-auditor.
    severity: "important",
    detect: (c) =>
      c.dep("lighthouse", "@unlighthouse/core", "unlighthouse", "web-vitals", "@vercel/speed-insights", "next-pagespeed") ||
      c.hasAny("LIGHTHOUSE_REPORT.md", "PERF_REPORT.md", ".claude/hooks/showcase.ts", "src/.claude/hooks/showcase.ts"),
  },
  // PHASE 6 — Sauvegardes
  {
    id: "backups",
    phase: "P6",
    label: "Backups & restauration",
    pedago: "pouvoir tout récupérer après une catastrophe — un backup non restauré ne compte pas.",
    appliesTo: WEB_API,
    severity: "nice",
    detect: (c) =>
      Object.keys(c.scripts).some((k) => /backup|restore/i.test(k)) ||
      c.dep("@neondatabase/serverless", "@supabase/supabase-js"), // managées = backups inclus, à noter
  },
  // PRODUCTION REALITY — les couches que le meme « vibe coders vs full-stack » reproche
  // d'oublier. Toutes prodOnly : exclues de la DoD en profil --mock, exigées sinon.
  {
    id: "caching",
    phase: "P5",
    label: "Caching applicatif",
    pedago: "ne pas recalculer ni re-payer ce qui n'a pas changé : Redis/KV/LRU ou ISR — vitesse et facture maîtrisées.",
    appliesTo: WEB_API,
    severity: "nice",
    prodOnly: true,
    detect: (c) => c.dep("@upstash/redis", "ioredis", "redis", "lru-cache", "@vercel/kv", "keyv", "memcached", "node-cache"),
  },
  {
    id: "cdn-edge",
    phase: "P9",
    label: "CDN / edge delivery",
    pedago: "servir le site près de l'utilisateur ; inclus si la plateforme est Vercel/Netlify/Cloudflare — délégué, rien à faire tant qu'on y reste.",
    appliesTo: PUBLIC_WEB,
    severity: "nice",
    prodOnly: true,
    detect: (c) => paasOf(c) !== null || c.dep("@aws-sdk/client-cloudfront") || c.has("public/_headers"),
  },
  {
    id: "scaling",
    phase: "P9",
    label: "Scaling / load balancing",
    pedago: "tenir la charge quand ça décolle ; serverless (Vercel/Fly/Render) = délégué à la plateforme, sinon réplication/LB à prévoir soi-même.",
    appliesTo: WEB_API,
    severity: "nice",
    prodOnly: true,
    detect: (c) => paasOf(c) !== null || c.hasAny("docker-compose.yml", "docker-compose.yaml", "k8s", "kubernetes", "deploy/k8s"),
  },
  {
    id: "deploy-target",
    phase: "P9",
    label: "Cible de déploiement (hosting versionné)",
    pedago: "où vit la prod, écrit dans le repo : config Vercel/Netlify/Fly/Dockerfile — pas un déploiement artisanal irreproductible.",
    appliesTo: DEPLOYABLE,
    severity: "important",
    prodOnly: true,
    detect: (c) => paasOf(c) !== null || c.hasAny("Dockerfile", "Procfile", "app.yaml"),
  },
  {
    id: "security-audit",
    phase: "P6",
    label: "Audit sécurité applicative (OWASP/RLS)",
    pedago: "preuve qu'un pass dédié a cherché injections, IDOR, fuites de permissions : rapport SECURITY_AUDIT.md dans le repo — une intention ne compte pas.",
    appliesTo: WEB_API,
    severity: "important",
    prodOnly: true,
    detect: (c) => c.hasAny("SECURITY_AUDIT.md", "docs/SECURITY_AUDIT.md", "reports/SECURITY_AUDIT.md"),
  },
  {
    id: "backend-completeness",
    phase: "P5",
    label: "Complétude backend auditée",
    pedago: "idempotence, pagination, N+1, transactions : audités par un pass dédié — rapport BACKEND_AUDIT.md dans le repo.",
    appliesTo: WEB_API,
    severity: "nice",
    prodOnly: true,
    detect: (c) => c.hasAny("BACKEND_AUDIT.md", "docs/BACKEND_AUDIT.md", "reports/BACKEND_AUDIT.md"),
  },
];

// ---------- évaluation ----------
const ctx = buildCtx(target);
const { type, framework, language } = detectType(ctx);

// En profil mock, les couches prodOnly sortent de la DoD — mais JAMAIS en silence :
// elles sont listées dans excludedByProfile (JSON + LIFECYCLE.md).
const applicable = LIFECYCLE_MATRIX.filter(
  (cap) =>
    cap.appliesTo.includes(type) &&
    (!mock || !cap.prodOnly) &&
    (!cap.appliesWhen || cap.appliesWhen(ctx, type)),
);
const excludedByProfile = mock
  ? LIFECYCLE_MATRIX.filter((cap) => cap.appliesTo.includes(type) && cap.prodOnly).map((c) => c.id)
  : [];
const covered = applicable.filter((cap) => {
  try {
    return cap.detect(ctx);
  } catch {
    return false; // frontière fs : une détection qui jette = capacité absente, jamais un crash
  }
});
const coveredIds = new Set(covered.map((c) => c.id));
const missing = applicable.filter((cap) => !coveredIds.has(cap.id));

// La prochaine étape = la capacité manquante la plus bloquante ; à sévérité égale,
// l'ordre du cycle de vie (numéro de phase P0→P9) départage, puis l'ordre du tableau.
const SEV_RANK: Record<Severity, number> = { blocker: 0, important: 1, nice: 2 };
const phaseNum = (p: string): number => { const m = /P(\d+)/.exec(p); return m ? Number(m[1]) : 99; };
const orderedMissing = missing
  .map((cap, i) => ({ cap, i }))
  .sort((a, b) =>
    SEV_RANK[a.cap.severity] - SEV_RANK[b.cap.severity] ||
    phaseNum(a.cap.phase) - phaseNum(b.cap.phase) ||
    a.i - b.i,
  )
  .map((x) => x.cap);
const nextStep: Capability | undefined = orderedMissing[0]; // | undefined sous noUncheckedIndexedAccess

// completion n'a de sens que si une DoD produit s'applique (total > 0). Pour unknown/
// design-only (aucune DoD), on renvoie null plutôt qu'un trompeur « 100% ».
const completion = applicable.length ? Math.round((covered.length / applicable.length) * 100) : null;
// FINI = aucune capacité applicable manquante (DoD verte). Pour les types sans matrice
// produit (design-only/unknown sans applicable), on ne déclare jamais un faux « fini ».
const isFinished = applicable.length > 0 && missing.length === 0;

// ---------- rendu ----------
function mark(present: boolean): string {
  return present ? "[OK]" : "[ ]";
}
function sev(s: Severity): string {
  return s === "blocker" ? "bloquant" : s === "important" ? "important" : "optionnel";
}

const projectName = basename(target);

if (asJson) {
  console.log(
    JSON.stringify(
      {
        target,
        type,
        framework,
        language,
        profile: mock ? "mock" : "production",
        excludedByProfile,
        completion,
        covered: covered.length,
        total: applicable.length,
        isFinished,
        coveredCapabilities: covered.map((c) => c.id),
        missingCapabilities: missing.map((m) => ({ id: m.id, label: m.label, severity: m.severity })),
        nextStep: nextStep
          ? { id: nextStep.id, label: nextStep.label, phase: nextStep.phase, severity: nextStep.severity, pedago: nextStep.pedago }
          : null,
      },
      null,
      2,
    ),
  );
} else {
  const L: string[] = [];
  L.push("");
  if (applicable.length === 0) {
    L.push(`  Cycle de vie produit — ${projectName}`);
    L.push(`  Type détecté : ${type}${framework ? ` · ${framework}` : ""} — aucune Definition of Done produit applicable.`);
    L.push(`  (les capacités lifecycle s'appliquent aux produits avec code/serveur, pas à ce type)`);
  } else {
    const verdict = isFinished
      ? `Definition of Done AUTOMATISÉE : VERTE pour un ${type} — valide les preuves directes avant de dire « fini ».`
      : `Position cycle de vie : ${covered.length}/${applicable.length} capacités (${completion}%).`;
    L.push(`  ${verdict}`);
    L.push(`  Type : ${type}${framework ? ` · ${framework}` : ""}${language !== "unknown" ? ` · ${language}` : ""} · profil ${mock ? "MOCK (couches production exclues : " + excludedByProfile.join(", ") + ")" : "production"}`);
    L.push("");
    L.push("  Couverture (Definition of Done contextuelle au type) :");
    for (const cap of applicable) {
      const present = coveredIds.has(cap.id);
      L.push(`   ${mark(present)} ${cap.phase} ${cap.label}  (${sev(cap.severity)})`);
    }
    L.push("");
    if (nextStep) {
      L.push(`  → PROCHAINE ETAPE : ${nextStep.label} (${sev(nextStep.severity)})`);
      L.push(`    ${nextStep.pedago}`);
    } else {
      L.push("  → Toutes les étapes applicables sont couvertes. Vérifie chaque DoD par preuve directe (navigateur/curl), pas « build vert ».");
    }
    L.push("");
    L.push(`  Verdict produit fini : ${isFinished ? "OUI (DoD automatisée verte)" : "NON — il reste " + missing.length + " étape(s)"}`);
    L.push("");
    L.push(`  Note : ce verdict couvre la DoD AUTOMATISABLE. Les items « (à construire) » de`);
    L.push(`  references/lifecycle/${type}.md (cœur métier P2, OWASP applicatif, backups testés…)`);
    L.push(`  se vérifient à la main + via les 4 auditeurs (security/backend/perf/a11y).`);
  }
  L.push("");
  console.log(L.join("\n"));
}

// ---------- LIFECYCLE.md (boucle de feedback dans le projet cible) ----------
if (!noWrite) {
  const date = new Date().toISOString().slice(0, 10);
  const md = [
    `# LIFECYCLE — ${projectName}`,
    "",
    `> Auto-maintenu par \`/assistant\` (lifecycle-audit.ts). La Definition of Done est CONTEXTUELLE au type de projet détecté.`,
    "",
    `**Type : ${type}${framework ? ` · ${framework}` : ""}** · ${date} · **Profil : ${mock ? "MOCK" : "production"}**`,
    "",
    ...(mock && excludedByProfile.length
      ? [`> Profil MOCK assumé : couches production exclues de la DoD — ${excludedByProfile.join(", ")}. Repasser sans \`--mock\` avant toute mise en prod.`, ""]
      : []),
    applicable.length
      ? `**Complétude produit : ${completion}%** (${covered.length}/${applicable.length} capacités applicables)`
      : `_Aucune Definition of Done produit applicable à ce type._`,
    "",
    `**Produit fini : ${isFinished ? "OUI" : "NON"}**${isFinished ? " — DoD AUTOMATISÉE verte ; valide les preuves directes + items « (à construire) » avant de livrer." : " — preuve directe requise (navigateur/curl), pas un build vert."}`,
    "",
  ];

  if (applicable.length) {
    md.push("## Cycle de vie produit", "");
    for (const cap of applicable) {
      const present = coveredIds.has(cap.id);
      md.push(`- ${present ? "[x]" : "[ ]"} **${cap.phase} ${cap.label}** _(${sev(cap.severity)})_ — ${cap.pedago}`);
    }
    md.push("");

    if (nextStep) {
      md.push("## Prochaine étape", "");
      md.push(`**${nextStep.label}** _(${sev(nextStep.severity)})_`, "");
      md.push(nextStep.pedago, "");
    } else {
      md.push("## Prochaine étape", "");
      md.push("Toutes les capacités applicables sont couvertes. Valide chaque DoD par preuve directe (navigateur/curl/restauration testée).", "");
    }
  }

  md.push(`_Re-scan : \`bun scripts/lifecycle-audit.ts "${target}"\`_`, "");

  try {
    writeFileSync(join(target, "LIFECYCLE.md"), md.join("\n"));
    if (!asJson) console.log(`  (LIFECYCLE.md écrit dans ${projectName})\n`);
  } catch {
    if (!asJson) console.log(`  (impossible d'écrire LIFECYCLE.md dans ${projectName} — droits ?)\n`);
  }
}

// En mode --json, stdout doit rester du JSON pur (consommé par organise.ts / tests).
if (!asJson) console.log("OK lifecycle-audit");
