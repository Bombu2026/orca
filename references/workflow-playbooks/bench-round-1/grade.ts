#!/usr/bin/env bun
/**
 * grade.ts — assemble une solution candidate + le test d'acceptation caché, lance bun test,
 * renvoie { passed, total }. Sert à valider les fixtures ET à noter les solutions des arms.
 *
 * Usage : bun grade.ts --task A|B|C --files '<jsonMapPathToContent>'
 *   files = { "price.ts": "...", ... } (contenu des fichiers produits par l'arm)
 */
import { mkdtempSync, writeFileSync, copyFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const args = process.argv.slice(2);
const task = (args[args.indexOf("--task") + 1] || "").toUpperCase();
const filesArg = args.includes("--files") ? args[args.indexOf("--files") + 1] : "{}";
const HERE = import.meta.dir;
let files: Record<string, string>;
try { files = JSON.parse(filesArg); } catch (e) { console.log(JSON.stringify({ error: "bad --files json", passed: 0, total: 1 })); process.exit(0); }

const dir = mkdtempSync(join(tmpdir(), `bench-${task}-`));

function place(name: string, content: string) { writeFileSync(join(dir, name), content); }

if (task === "A") {
  place("SUT.ts", files["price.ts"] ?? files["SUT.ts"] ?? Object.values(files)[0] ?? "");
  copyFileSync(join(HERE, "taskA", "accept.test.ts"), join(dir, "accept.test.ts"));
} else if (task === "B") {
  place("SUT.ts", files["cart.ts"] ?? files["SUT.ts"] ?? Object.values(files)[0] ?? "");
  copyFileSync(join(HERE, "taskB", "coupons.ts"), join(dir, "coupons.ts"));
  copyFileSync(join(HERE, "taskB", "accept.test.ts"), join(dir, "accept.test.ts"));
} else if (task === "C") {
  for (const f of ["api.ts", "a.ts", "b.ts", "c.ts", "d.ts"]) place(f, files[f] ?? "");
  copyFileSync(join(HERE, "taskC", "accept.test.ts"), join(dir, "accept.test.ts"));
} else { console.log(JSON.stringify({ error: "task must be A|B|C", passed: 0, total: 1 })); process.exit(0); }

const proc = Bun.spawnSync(["bun", "test", join(dir, "accept.test.ts")], { stdout: "pipe", stderr: "pipe" });
const out = new TextDecoder().decode(proc.stdout) + new TextDecoder().decode(proc.stderr);
const passM = out.match(/(\d+)\s+pass/);
const failM = out.match(/(\d+)\s+fail/);
const passed = passM ? parseInt(passM[1]) : 0;
const failed = failM ? parseInt(failM[1]) : 0;
const total = passed + failed || 1;
console.log(JSON.stringify({ passed, total, ratio: Math.round((passed / total) * 100) / 100, compiled: !out.includes("error: ") || passed > 0 }));
