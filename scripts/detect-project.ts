#!/usr/bin/env bun

/**
 * detect-project.ts
 * Detects project type, framework, runtime, and key integrations from cwd.
 * Output: JSON to stdout
 */

import { existsSync, readFileSync, readdirSync } from "fs";
import { join, basename } from "path";

interface ProjectInfo {
  type: "web-fullstack" | "website-showcase" | "bot-agent" | "cli-tool" | "api-backend" | "design-only" | "unknown";
  framework: string | null;
  runtime: string;
  packageManager: "bun" | "pnpm" | "yarn" | "npm";
  language: "typescript" | "javascript" | "python" | "go" | "rust" | "unknown";
  styling: string | null;
  database: string | null;
  auth: string | null;
  testing: string | null;
  deployment: string | null;
  hasClaudeConfig: boolean;
  hasCICD: boolean;
  detectedIntegrations: string[];
}

const cwd = process.argv[2] || process.cwd();

function fileExists(path: string): boolean {
  return existsSync(join(cwd, path));
}

function readJSON(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(join(cwd, path), "utf-8"));
  } catch {
    return null;
  }
}

function dirExists(path: string): boolean {
  try {
    return readdirSync(join(cwd, path)).length > 0;
  } catch {
    return false;
  }
}

function detect(): ProjectInfo {
  const pkg = readJSON("package.json") as Record<string, Record<string, string>> | null;
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies } as Record<string, string>;
  const integrations: string[] = [];

  // Package manager
  let packageManager: ProjectInfo["packageManager"] = "npm";
  if (fileExists("bun.lock") || fileExists("bun.lockb")) packageManager = "bun";
  else if (fileExists("pnpm-lock.yaml")) packageManager = "pnpm";
  else if (fileExists("yarn.lock")) packageManager = "yarn";

  // Language
  let language: ProjectInfo["language"] = "unknown";
  if (fileExists("tsconfig.json")) language = "typescript";
  else if (fileExists("pyproject.toml") || fileExists("requirements.txt")) language = "python";
  else if (fileExists("go.mod")) language = "go";
  else if (fileExists("Cargo.toml")) language = "rust";
  else if (pkg) language = "javascript";

  // Framework detection
  let framework: string | null = null;
  let type: ProjectInfo["type"] = "unknown";

  if (deps?.next) {
    framework = "next.js";
    type = "web-fullstack";
  } else if (deps?.nuxt) {
    framework = "nuxt";
    type = "web-fullstack";
  } else if (deps?.svelte || deps?.["@sveltejs/kit"]) {
    framework = "sveltekit";
    type = "web-fullstack";
  } else if (deps?.astro) {
    framework = "astro";
    type = "web-fullstack";
  } else if (deps?.["@remix-run/react"] || deps?.["@remix-run/node"] || deps?.["@react-router/dev"]) {
    framework = "remix";
    type = "web-fullstack";
  } else if (deps?.["@solidjs/start"]) {
    framework = "solid-start";
    type = "web-fullstack";
  } else if (deps?.react && !deps?.next) {
    framework = "react";
    type = "web-fullstack";
  } else if (deps?.vue && !deps?.nuxt) {
    framework = "vue";
    type = "web-fullstack";
  } else if (deps?.express || deps?.fastify || deps?.hono || deps?.["@nestjs/core"]) {
    framework = deps?.express ? "express" : deps?.fastify ? "fastify" : deps?.hono ? "hono" : "nestjs";
    type = "api-backend";
  } else if (deps?.telegraf || deps?.["node-telegram-bot-api"] || deps?.grammy || deps?.["@slack/bolt"] || deps?.["discord.js"] || deps?.chat) {
    framework = deps?.telegraf ? "telegraf" : deps?.grammy ? "grammy" : deps?.["@slack/bolt"] ? "slack-bolt" : deps?.["discord.js"] ? "discord.js" : "bot";
    type = "bot-agent";
  } else if (pkg?.bin) {
    type = "cli-tool";
  } else if (language === "python") {
    // Parité avec lifecycle-audit.ts : lire pyproject.toml ET requirements.txt
    const py =
      (fileExists("pyproject.toml") ? readFileSync(join(cwd, "pyproject.toml"), "utf-8") : "") +
      "\n" +
      (fileExists("requirements.txt") ? readFileSync(join(cwd, "requirements.txt"), "utf-8") : "");
    if (/fastapi/i.test(py)) { framework = "fastapi"; type = "api-backend"; }
    else if (/django/i.test(py)) { framework = "django"; type = "web-fullstack"; }
    else if (/flask/i.test(py)) { framework = "flask"; type = "api-backend"; }
    else if (/\b(click|typer)\b/i.test(py)) { type = "cli-tool"; }
    else if (/\b(openai|anthropic|langchain)\b/i.test(py)) { type = "bot-agent"; }
  } else if (language === "go") {
    const gomod = fileExists("go.mod") ? readFileSync(join(cwd, "go.mod"), "utf-8") : "";
    if (/gin-gonic|labstack\/echo|gofiber\/fiber|go-chi\/chi/.test(gomod)) { framework = "go-web"; type = "api-backend"; }
    else { type = "cli-tool"; }
  } else if (language === "rust") {
    const cargo = fileExists("Cargo.toml") ? readFileSync(join(cwd, "Cargo.toml"), "utf-8") : "";
    if (/\b(axum|actix-web|rocket|warp)\b/.test(cargo)) { framework = "rust-web"; type = "api-backend"; }
    else { type = "cli-tool"; }
  }

  // AI/Agent detection (overrides to bot-agent if strong signal)
  if (deps?.ai || deps?.["@ai-sdk/react"] || deps?.["@anthropic-ai/sdk"] || deps?.openai || deps?.langchain) {
    integrations.push("ai-sdk");
    if (type === "unknown") type = "bot-agent";
  }

  // Runtime
  let runtime = "node";
  const devScript = (pkg as { scripts?: Record<string, unknown> } | null)?.scripts?.dev;
  if (packageManager === "bun" || (typeof devScript === "string" && devScript.includes("bun"))) runtime = "bun";
  if (language === "python") runtime = "python";
  if (language === "go") runtime = "go";
  if (language === "rust") runtime = "rust";

  // Styling
  let styling: string | null = null;
  if (deps?.tailwindcss || fileExists("tailwind.config.ts") || fileExists("tailwind.config.js")) {
    styling = "tailwind";
    if (deps?.["@shadcn/ui"] || dirExists("components/ui")) styling = "tailwind + shadcn/ui";
  } else if (deps?.["styled-components"]) styling = "styled-components";
  else if (deps?.["@emotion/react"]) styling = "emotion";

  // Database
  let database: string | null = null;
  if (deps?.prisma || deps?.["@prisma/client"]) { database = "prisma"; integrations.push("prisma"); }
  else if (deps?.drizzle || deps?.["drizzle-orm"]) { database = "drizzle"; integrations.push("drizzle"); }
  else if (deps?.["@neondatabase/serverless"]) { database = "neon"; integrations.push("neon"); }
  else if (deps?.["@supabase/supabase-js"]) { database = "supabase"; integrations.push("supabase"); }
  else if (deps?.mongoose) { database = "mongodb"; integrations.push("mongodb"); }

  // Auth
  let auth: string | null = null;
  if (deps?.["@clerk/nextjs"] || deps?.["@clerk/clerk-sdk-node"]) { auth = "clerk"; integrations.push("clerk"); }
  else if (deps?.["next-auth"] || deps?.["@auth/core"]) { auth = "next-auth"; integrations.push("next-auth"); }
  else if (deps?.["better-auth"]) { auth = "better-auth"; integrations.push("better-auth"); }

  // Testing
  let testing: string | null = null;
  if (deps?.vitest) testing = "vitest";
  else if (deps?.jest) testing = "jest";
  else if (deps?.playwright || deps?.["@playwright/test"]) testing = "playwright";
  else if (fileExists("test/") || fileExists("__tests__/") || fileExists("tests/")) testing = "detected";

  // Deployment
  let deployment: string | null = null;
  if (fileExists("vercel.json") || fileExists("vercel.ts") || fileExists(".vercel/")) { deployment = "vercel"; integrations.push("vercel"); }
  if (fileExists("Dockerfile")) { deployment = deployment ? `${deployment} + docker` : "docker"; integrations.push("docker"); }

  // CI/CD
  const hasCICD = fileExists(".github/workflows/") || fileExists(".gitlab-ci.yml") || fileExists("Jenkinsfile");
  if (hasCICD) integrations.push("ci-cd");

  // Claude config — detect at root OR in .claude/ (some projects put CLAUDE.md at root)
  const hasClaudeConfig = fileExists(".claude/CLAUDE.md") || fileExists("CLAUDE.md");

  // Showcase override — explicit marker takes precedence
  if (fileExists(".claude/showcase.json")) {
    type = "website-showcase";
    integrations.push("showcase");
  } else if (type === "web-fullstack") {
    // Heuristic: motion libs + no backend deps + no API routes = showcase
    const hasMotion = Boolean(deps?.["framer-motion"] || deps?.motion || deps?.gsap || deps?.lenis || deps?.["@react-three/fiber"] || deps?.["@splinetool/react-spline"]);
    const hasBackendDeps = Boolean(deps?.prisma || deps?.["@prisma/client"] || deps?.["drizzle-orm"] || deps?.express || deps?.fastify || deps?.hono || deps?.mongoose);
    const hasDocsBrief = fileExists("docs/BRIEF.md") || fileExists("docs/MOODBOARD.md");
    if (hasDocsBrief || (hasMotion && !hasBackendDeps)) {
      type = "website-showcase";
      integrations.push("showcase");
      if (deps?.gsap) integrations.push("gsap");
      if (deps?.motion || deps?.["framer-motion"]) integrations.push("motion");
      if (deps?.lenis) integrations.push("lenis");
      if (deps?.["@react-three/fiber"]) integrations.push("r3f");
      if (deps?.["@splinetool/react-spline"]) integrations.push("spline");
      if (deps?.["next-video"] || deps?.["@mux/mux-player-react"]) integrations.push("video-optimized");
    }
  }

  // Design-only detection (override if strong signal)
  const hasPenFiles = (() => { try { return readdirSync(cwd).some(f => f.endsWith(".pen")); } catch { return false; } })();
  if (hasPenFiles && type === "unknown") {
    type = "design-only";
    integrations.push("pencil");
  }

  // Static showcase — site HTML/CSS sans manifest (vitrine livrée en statique)
  if (type === "unknown" && !pkg) {
    const hasHtml = (() => { try { return readdirSync(cwd).some(f => f.toLowerCase().endsWith(".html")); } catch { return false; } })();
    if (hasHtml) { type = "website-showcase"; integrations.push("showcase"); }
  }

  // Additional integrations
  if (deps?.stripe || deps?.["@stripe/stripe-js"]) integrations.push("stripe");
  if (deps?.resend) integrations.push("resend");
  if (fileExists(".env") || fileExists(".env.local")) integrations.push("env-configured");

  return {
    type, framework, runtime, packageManager, language,
    styling, database, auth, testing, deployment,
    hasClaudeConfig, hasCICD, detectedIntegrations: integrations,
  };
}

const result = detect();
console.log(JSON.stringify(result, null, 2));
