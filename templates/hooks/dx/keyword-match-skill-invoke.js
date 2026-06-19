// Hook: keyword-match-skill-invoke (UserPromptSubmit)
// Auto-suggests canonical skills based on keyword matching.
// 0 LLM calls — pure regex, ~95% reliability vs ~50% for LLM-based matching.
// Install in .claude/settings.local.json under hooks.UserPromptSubmit
// Output is advisory only (systemMessage), never blocks.

const SKILL_MAP = [
  { pattern: /\b(commit|git commit|stage(?:d)? files?)\b/i, skill: "/commit" },
  { pattern: /\b(fix|bug|error|broken|failing|crash|regression)\b/i, skill: "/fix" },
  { pattern: /\b(test|spec|unit test|passing|coverage|vitest|jest)\b/i, skill: "/test" },
  { pattern: /\b(refactor|clean ?up|simplify|restructure|rename)\b/i, skill: "/refactor" },
  { pattern: /\b(pull request|open pr|create pr|merge request)\b/i, skill: "/pr" },
  { pattern: /\b(explain|what does|how does|understand|walk me through)\b/i, skill: "/explain" },
  { pattern: /\b(review|check|audit|look at|feedback on)\b/i, skill: "/review" },
  { pattern: /\b(plan|explore|epct|think through|break down)\b/i, skill: "/epct" },
];

async function main() {
  let prompt = "";

  const hookData = process.env.HOOK_DATA;
  if (hookData) {
    try {
      prompt = JSON.parse(hookData).prompt || "";
    } catch {
      prompt = hookData;
    }
  } else {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString().trim();
    if (raw) {
      try {
        prompt = JSON.parse(raw).prompt || raw;
      } catch {
        prompt = raw;
      }
    }
  }

  const match = SKILL_MAP.find(({ pattern }) => pattern.test(prompt));

  if (match) {
    console.log(JSON.stringify({
      systemMessage: `Skill suggestion: consider running ${match.skill} for this task`,
    }));
  }

  process.exit(0);
}

main();
