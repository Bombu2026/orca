// Hook: block-dangerous (PreToolUse — Bash)
// Blocks destructive shell commands before execution.
// Install in .claude/settings.local.json under hooks.PreToolUse
// Source: Codelynx/Melvynx — "Yolo sécurisé" pattern

const BLOCK_PATTERNS = [
  /rm\s+.*-rf\s*\//i,
  /drop\s+(database|table)/i,
  /truncate\s+table/i,
  /git\s+push.*--force\s+origin\s+(main|master)/i,
  /sudo\s+rm/i,
  /mkfs\./i,
  /dd\s+if=/i,
  />\s*\/dev\/sd/i,
];

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const input = JSON.parse(Buffer.concat(chunks).toString());

  if (input.tool_name !== "Bash") {
    process.exit(0);
  }

  const cmd = input.tool_input?.command || "";
  const matched = BLOCK_PATTERNS.find((p) => p.test(cmd));

  if (matched) {
    console.log(JSON.stringify({
      decision: "block",
      reason: `Blocked destructive command matching: ${matched}`,
    }));
    process.exit(2);
  }

  process.exit(0);
}

main();
