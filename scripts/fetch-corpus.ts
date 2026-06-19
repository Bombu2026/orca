// fetch-corpus.ts
// Fetches external corpus for Assistant into ~/.claude/corpus/:
//   cookbooks/  — git clone anthropics/claude-cookbooks (shallow)
//   repos/      — top N repos metadata (topic:claude-code) + READMEs of top K
//   cc-docs/    — sitemap + WebFetch cache of code.claude.com pages
//   papers/     — arXiv abstracts of seminal AI-agent papers
// Idempotent: re-run for incremental refresh (mtime-based where possible).

import { mkdirSync, existsSync, writeFileSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const CORPUS = join(homedir(), ".claude", "corpus");
mkdirSync(CORPUS, { recursive: true });

const MANIFEST = join(CORPUS, "manifest.json");
const manifest: any = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf-8")) : { sources: {} };

function saveManifest() {
  manifest.updatedAt = new Date().toISOString();
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
}

function resolveGitHubToken(): { token: string; warning?: string } {
  const envToken = process.env.GITHUB_TOKEN?.trim();
  if (envToken) {
    const status = Bun.spawnSync(["gh", "auth", "status"], { stdout: "pipe", stderr: "pipe" });
    if (status.exitCode === 0) return { token: envToken };
    const keyringStatus = Bun.spawnSync(["env", "-u", "GITHUB_TOKEN", "-u", "GH_TOKEN", "gh", "auth", "status"], { stdout: "pipe", stderr: "pipe" });
    if (keyringStatus.exitCode === 0) {
      const token = Bun.spawnSync(["env", "-u", "GITHUB_TOKEN", "-u", "GH_TOKEN", "gh", "auth", "token"], { stdout: "pipe", stderr: "pipe" }).stdout.toString().trim();
      if (token.length > 10) {
        return {
          token,
          warning: "GITHUB_TOKEN is present but invalid; using gh keyring token instead.",
        };
      }
    }
    return {
      token: "",
      warning: "GITHUB_TOKEN is present but gh reports it invalid; ignoring it and using the public API rate limit.",
    };
  }

  try {
    const status = Bun.spawnSync(["env", "-u", "GITHUB_TOKEN", "-u", "GH_TOKEN", "gh", "auth", "status"], { stdout: "pipe", stderr: "pipe" });
    if (status.exitCode !== 0) return { token: "", warning: "gh auth unavailable; using the public API rate limit." };
    const token = Bun.spawnSync(["env", "-u", "GITHUB_TOKEN", "-u", "GH_TOKEN", "gh", "auth", "token"], { stdout: "pipe", stderr: "pipe" }).stdout.toString().trim();
    return { token };
  } catch {
    return { token: "", warning: "gh not available; using the public API rate limit." };
  }
}

const GH_AUTH = resolveGitHubToken();
const GH_TOKEN = GH_AUTH.token;

async function ghApi<T = any>(endpoint: string): Promise<T> {
  const r = await fetch(`https://api.github.com/${endpoint}`, {
    headers: { ...(GH_TOKEN ? { Authorization: `token ${GH_TOKEN}` } : {}), "User-Agent": "Assistant-Corpus" },
  });
  if (!r.ok) throw new Error(`GH API ${r.status} on ${endpoint}: ${await r.text()}`);
  return await r.json() as T;
}

async function ghRaw(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: { ...(GH_TOKEN ? { Authorization: `token ${GH_TOKEN}` } : {}), "User-Agent": "Assistant-Corpus" } });
    return r.ok ? await r.text() : null;
  } catch { return null; }
}

// -------- 1. anthropic/claude-cookbooks (shallow clone) --------
async function fetchCookbooks() {
  const dir = join(CORPUS, "cookbooks");
  const start = Date.now();
  if (existsSync(join(dir, ".git"))) {
    const r = Bun.spawnSync(["git", "-C", dir, "pull", "--depth", "1"], { stdout: "pipe", stderr: "pipe" });
    console.log(`[cookbooks] pulled (exit ${r.exitCode}, ${Date.now() - start}ms)`);
  } else {
    const r = Bun.spawnSync(["git", "clone", "--depth", "1", "https://github.com/anthropics/claude-cookbooks.git", dir], { stdout: "pipe", stderr: "pipe" });
    console.log(`[cookbooks] cloned (exit ${r.exitCode}, ${Date.now() - start}ms)`);
  }
  manifest.sources.cookbooks = { path: dir, updatedAt: new Date().toISOString() };
}

// -------- 2. Top repos by topic:claude-code --------
async function fetchTopRepos(limit = 500) {
  const outDir = join(CORPUS, "repos");
  mkdirSync(outDir, { recursive: true });
  const all: any[] = [];
  for (let page = 1; page <= Math.ceil(limit / 100); page++) {
    const data = await ghApi<any>(`search/repositories?q=topic:claude-code&sort=stars&order=desc&per_page=100&page=${page}`);
    const items = data.items || [];
    all.push(...items);
    if (items.length < 100) break;
  }
  const top = all.slice(0, limit);
  const index = top.map(r => ({
    full_name: r.full_name,
    stars: r.stargazers_count,
    description: r.description,
    topics: r.topics,
    pushed_at: r.pushed_at,
    default_branch: r.default_branch,
    html_url: r.html_url,
  }));
  writeFileSync(join(outDir, "index.json"), JSON.stringify(index, null, 2));
  console.log(`[repos] fetched ${top.length} top repos metadata`);
  manifest.sources.repos = { path: outDir, count: top.length, updatedAt: new Date().toISOString() };

  // Fetch READMEs of top 50 only (stay under rate limit ~1500 calls budget)
  const readmeDir = join(outDir, "readmes");
  mkdirSync(readmeDir, { recursive: true });
  let fetched = 0;
  for (const r of top.slice(0, 50)) {
    const safeName = r.full_name.replace("/", "__");
    const outFile = join(readmeDir, `${safeName}.md`);
    if (existsSync(outFile)) {
      const age = (Date.now() - statSync(outFile).mtime.getTime()) / (1000 * 60 * 60 * 24);
      if (age < 7) continue;
    }
    const readme = await ghRaw(`https://raw.githubusercontent.com/${r.full_name}/${r.default_branch}/README.md`);
    if (readme) { writeFileSync(outFile, readme); fetched++; }
  }
  console.log(`[repos] READMEs fetched: +${fetched} (top 50)`);
}

// -------- 3. code.claude.com/docs sitemap --------
async function fetchCcDocs() {
  const outDir = join(CORPUS, "cc-docs");
  mkdirSync(outDir, { recursive: true });
  try {
    const r = await fetch("https://code.claude.com/sitemap.xml", { headers: { "User-Agent": "Assistant-Corpus" } });
    if (r.ok) {
      const xml = await r.text();
      const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)]
        .map(m => m[1])
        .filter((u): u is string => typeof u === "string" && u.includes("/docs"));
      writeFileSync(join(outDir, "sitemap.json"), JSON.stringify(urls, null, 2));
      console.log(`[cc-docs] sitemap: ${urls.length} urls`);
      manifest.sources.ccDocs = { path: outDir, sitemapCount: urls.length, updatedAt: new Date().toISOString() };
      return;
    }
    console.log(`[cc-docs] sitemap: HTTP ${r.status}`);
  } catch (e: any) {
    console.log(`[cc-docs] sitemap error: ${e.message}`);
  }
  // Fallback: curated URL list based on known structure
  const knownUrls = [
    "https://code.claude.com/docs/en/overview",
    "https://code.claude.com/docs/en/quickstart",
    "https://code.claude.com/docs/en/memory",
    "https://code.claude.com/docs/en/hooks-guide",
    "https://code.claude.com/docs/en/skills",
    "https://code.claude.com/docs/en/sub-agents",
    "https://code.claude.com/docs/en/settings",
    "https://code.claude.com/docs/en/changelog",
  ];
  writeFileSync(join(outDir, "sitemap.json"), JSON.stringify(knownUrls, null, 2));
  console.log(`[cc-docs] fallback: ${knownUrls.length} curated urls`);
  manifest.sources.ccDocs = { path: outDir, sitemapCount: knownUrls.length, fallback: true, updatedAt: new Date().toISOString() };
}

// -------- 4. Academic papers (arXiv abstracts) --------
async function fetchPapers() {
  const outDir = join(CORPUS, "papers");
  mkdirSync(outDir, { recursive: true });
  const papers = [
    { id: "2303.11366", title: "Reflexion: Language Agents with Verbal Reinforcement Learning" },
    { id: "2210.03629", title: "ReAct: Synergizing Reasoning and Acting in Language Models" },
    { id: "2310.08560", title: "MemGPT: Towards LLMs as Operating Systems" },
    { id: "2302.04761", title: "Toolformer: Language Models Can Teach Themselves to Use Tools" },
    { id: "2305.16291", title: "Voyager: An Open-Ended Embodied Agent with LLMs" },
  ];
  for (const p of papers) {
    const outFile = join(outDir, `${p.id}.md`);
    if (existsSync(outFile)) continue;
    try {
      const r = await fetch(`http://export.arxiv.org/api/query?id_list=${p.id}`);
      const xml = await r.text();
      const abstract = xml.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]?.trim() || "";
      const authors = [...xml.matchAll(/<name>(.*?)<\/name>/g)].map(m => m[1]).join(", ");
      const content = `# ${p.title}\n\n**arXiv:** ${p.id}\n**Authors:** ${authors}\n**URL:** https://arxiv.org/abs/${p.id}\n\n## Abstract\n\n${abstract}\n`;
      writeFileSync(outFile, content);
      console.log(`[papers] ${p.id} fetched`);
    } catch (e: any) {
      console.log(`[papers] ${p.id} error: ${e.message}`);
    }
  }
  manifest.sources.papers = { path: outDir, count: papers.length, updatedAt: new Date().toISOString() };
}

// -------- Entrypoint --------
console.log("Fetching corpus to", CORPUS);
if (GH_AUTH.warning) console.log(`WARNING: ${GH_AUTH.warning}`);
if (!GH_TOKEN) console.log("WARNING: no GitHub token — rate limit will be 60 req/h");

await fetchCookbooks();
await fetchTopRepos();
await fetchCcDocs();
await fetchPapers();
saveManifest();

console.log("\nCorpus manifest:", MANIFEST);
