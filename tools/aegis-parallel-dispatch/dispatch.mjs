#!/usr/bin/env node
// dispatch.mjs — manifest → parallel-Agent dispatch plan
//
// Reads a JSON or YAML-ish manifest from stdin or --file, emits a markdown
// plan that Claude can use to emit N parallel Agent tool calls in one
// message. Enforces the 5-concurrent-agents cap (Claude Code limit).
//
// Usage:
//   echo '{"tasks":[...]}' | node dispatch.mjs
//   node dispatch.mjs --file tasks.json
//   node dispatch.mjs --file tasks.json --force   # override 5-cap
//
// Manifest schema (JSON):
//   {
//     "topic": "review PRs 12, 13, 14",
//     "agent_type": "code-reviewer",        // optional, default: general-purpose
//     "model": "sonnet",                     // optional
//     "tasks": [
//       { "description": "review PR #12", "prompt": "Review the diff at ..." },
//       { "description": "review PR #13", "prompt": "..." }
//     ]
//   }
//
// Output: markdown with N "Agent dispatch" blocks + an aggregation table.

import fs from "node:fs";

const HARD_CAP = 5;

const flags = parseArgs(process.argv.slice(2));

function parseArgs(argv) {
  const f = { file: null, force: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--file":  f.file = argv[++i]; break;
      case "--force": f.force = true; break;
      case "--json":  f.json = true; break;
      case "-h": case "--help": help(); process.exit(0);
      default: process.stderr.write(`unknown flag: ${a}\n`); process.exit(2);
    }
  }
  return f;
}

function help() {
  process.stdout.write(`Usage: aegis-parallel-dispatch [flags]

Reads a JSON manifest from --file or stdin and emits a markdown plan with
N parallel Agent dispatch blocks plus an aggregation table.

Flags:
  --file <path>     read manifest from file (default: stdin)
  --force           bypass the 5-concurrent-agents safety cap
  --json            machine-readable output (one Agent call per line)

Manifest:
  {
    "topic": "review PRs",
    "agent_type": "code-reviewer",
    "model": "sonnet",
    "tasks": [ {"description": "...", "prompt": "..."} ]
  }
`);
}

async function readInput() {
  if (flags.file) return fs.readFileSync(flags.file, "utf8");
  let raw = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) raw += chunk;
  return raw;
}

function die(msg) { process.stderr.write(`error: ${msg}\n`); process.exit(2); }

function renderMarkdown(m) {
  const out = [];
  out.push(`# Parallel dispatch plan: ${m.topic || "(untitled)"}`);
  out.push("");
  out.push(`**Concurrent agents:** ${m.tasks.length}`);
  out.push(`**Agent type:** ${m.agent_type || "general-purpose"}`);
  if (m.model) out.push(`**Model:** ${m.model}`);
  out.push("");
  out.push("## Agent dispatch (emit ALL of these in one message)");
  out.push("");
  m.tasks.forEach((t, i) => {
    out.push(`### Agent ${i + 1}: ${t.description}`);
    out.push("```");
    out.push(`Agent({`);
    out.push(`  description: ${JSON.stringify(t.description)},`);
    out.push(`  subagent_type: ${JSON.stringify(t.agent_type || m.agent_type || "general-purpose")},`);
    if (t.model || m.model) out.push(`  model: ${JSON.stringify(t.model || m.model)},`);
    out.push(`  prompt: ${JSON.stringify(t.prompt)}`);
    out.push(`})`);
    out.push("```");
    out.push("");
  });
  out.push("## Result aggregation");
  out.push("");
  out.push("After all agents return, summarize results in this table:");
  out.push("");
  out.push("| # | Task | Result | Key finding |");
  out.push("|---|------|--------|-------------|");
  m.tasks.forEach((t, i) => out.push(`| ${i + 1} | ${t.description} | (fill in) | (fill in) |`));
  out.push("");
  return out.join("\n");
}

function renderJson(m) {
  return JSON.stringify({
    topic: m.topic || "",
    agent_type: m.agent_type || "general-purpose",
    model: m.model || null,
    tasks: m.tasks.map(t => ({
      description: t.description,
      subagent_type: t.agent_type || m.agent_type || "general-purpose",
      model: t.model || m.model || null,
      prompt: t.prompt,
    })),
  }, null, 2);
}

(async () => {
  const raw = await readInput();
  let m;
  try { m = JSON.parse(raw); } catch (e) { die(`manifest is not valid JSON: ${e.message}`); }
  if (!m || !Array.isArray(m.tasks) || m.tasks.length === 0) die("manifest must include a non-empty tasks[]");
  for (const t of m.tasks) {
    if (!t.description || !t.prompt) die("each task must have description + prompt");
  }
  if (m.tasks.length > HARD_CAP && !flags.force) {
    die(`manifest has ${m.tasks.length} tasks, exceeds Claude Code's ${HARD_CAP}-concurrent-agent limit. Use --force to override.`);
  }
  process.stdout.write((flags.json ? renderJson(m) : renderMarkdown(m)) + "\n");
})();
