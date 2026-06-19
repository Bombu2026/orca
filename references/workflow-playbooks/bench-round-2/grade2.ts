import { mkdtempSync, writeFileSync, copyFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
const t = (process.argv[process.argv.indexOf("--task")+1]||"");
const filesArg = process.argv.includes("--files") ? process.argv[process.argv.indexOf("--files")+1] : "{}";
const HERE = import.meta.dir;
let files:Record<string,string>; try{files=JSON.parse(filesArg);}catch{console.log(JSON.stringify({passed:0,total:1}));process.exit(0);}
const dir = mkdtempSync(join(tmpdir(),`r2-${t}-`));
writeFileSync(join(dir,"SUT.ts"), files["SUT.ts"] ?? Object.values(files)[0] ?? "");
copyFileSync(join(HERE,t,"accept.test.ts"), join(dir,"accept.test.ts"));
const p = Bun.spawnSync(["bun","test",join(dir,"accept.test.ts")],{stdout:"pipe",stderr:"pipe"});
const out = new TextDecoder().decode(p.stdout)+new TextDecoder().decode(p.stderr);
const pass=(out.match(/(\d+)\s+pass/)||[])[1], fail=(out.match(/(\d+)\s+fail/)||[])[1];
const passed=pass?+pass:0, total=passed+(fail?+fail:0)||1;
console.log(JSON.stringify({passed,total,ratio:Math.round(passed/total*100)/100}));
