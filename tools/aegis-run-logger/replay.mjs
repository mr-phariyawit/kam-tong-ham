#!/usr/bin/env node
// replay.mjs — pretty-print an archived session transcript
//
// Usage:
//   replay.mjs <run-id>          # latest by default
//   replay.mjs --latest
//   replay.mjs --limit 50 <id>
//   replay.mjs --raw <id>        # NDJSON dump

import fs from "node:fs";
import path from "node:path";

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const RUNS_DIR    = path.join(PROJECT_DIR, ".aegis/brain/runs");

const ANSI = { reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
               cyan: "\x1b[36m", magenta: "\x1b[35m", yellow: "\x1b[33m",
               gray: "\x1b[90m", green: "\x1b[32m" };

const flags = { id: null, latest: false, limit: 0, raw: false };
for (let i = 0; i < process.argv.length - 2; i++) {
  const a = process.argv[i + 2];
  switch (a) {
    case "--latest": flags.latest = true; break;
    case "--limit":  flags.limit = parseInt(process.argv[++i + 2] || "0", 10) || 0; break;
    case "--raw":    flags.raw = true; break;
    case "-h": case "--help":
      process.stdout.write("Usage: replay.mjs [<run-id>|--latest] [--limit N] [--raw]\n"); process.exit(0);
    default:
      if (a.startsWith("--")) { process.stderr.write(`unknown flag: ${a}\n`); process.exit(2); }
      flags.id = a;
  }
}

function listRuns() {
  if (!fs.existsSync(RUNS_DIR)) return [];
  return fs.readdirSync(RUNS_DIR).filter(d => {
    return fs.statSync(path.join(RUNS_DIR, d)).isDirectory();
  }).sort();
}

let runId = flags.id;
if (!runId || flags.latest) {
  const all = listRuns();
  if (all.length === 0) { process.stderr.write("(no archived runs)\n"); process.exit(2); }
  runId = all[all.length - 1];
}

const runDir = path.join(RUNS_DIR, runId);
if (!fs.existsSync(runDir)) { process.stderr.write(`no such run: ${runId}\n`); process.exit(2); }

const metaPath = path.join(runDir, "meta.json");
const transcriptPath = path.join(runDir, "transcript.ndjson");

// --raw skips the human header — just dump NDJSON for piping to jq / etc.
if (flags.raw) {
  if (!fs.existsSync(transcriptPath)) { process.stderr.write("(no transcript file)\n"); process.exit(0); }
  process.stdout.write(fs.readFileSync(transcriptPath, "utf8"));
  process.exit(0);
}

if (fs.existsSync(metaPath)) {
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  process.stdout.write(`${ANSI.bold}=== run: ${runId} ===${ANSI.reset}\n`);
  process.stdout.write(`session: ${meta.session_id || ""}\n`);
  process.stdout.write(`archived: ${meta.archived_at || ""}\n`);
  process.stdout.write(`persona: ${meta.persona || "(none)"}\n`);
  process.stdout.write(`lines: ${meta.transcript_lines || 0}\n`);
  process.stdout.write("---\n");
}

if (!fs.existsSync(transcriptPath)) { process.stderr.write("(no transcript file)\n"); process.exit(0); }

const lines = fs.readFileSync(transcriptPath, "utf8").split("\n").filter(l => l.trim());
const slice = flags.limit > 0 ? lines.slice(-flags.limit) : lines;

for (const line of slice) {
  let rec; try { rec = JSON.parse(line); } catch { continue; }
  const role = rec.role || rec.type || rec.message?.role || "?";
  const text = extractText(rec);
  const color = role === "user" ? ANSI.cyan : role === "assistant" ? ANSI.magenta : ANSI.gray;
  const prefix = `${ANSI.dim}[${role.padEnd(9)}]${ANSI.reset}`;
  process.stdout.write(`${prefix} ${color}${text.slice(0, 600)}${text.length > 600 ? "…" : ""}${ANSI.reset}\n\n`);
}

function extractText(rec) {
  if (rec.message?.content) {
    if (Array.isArray(rec.message.content)) {
      return rec.message.content.map(c => c.text || c.content || JSON.stringify(c).slice(0, 100)).join(" ");
    }
    return String(rec.message.content);
  }
  if (rec.content)  return Array.isArray(rec.content) ? rec.content.map(c => c.text || "").join(" ") : String(rec.content);
  if (rec.text)     return String(rec.text);
  if (rec.tool_name) return `[tool:${rec.tool_name}] ${JSON.stringify(rec.tool_input || {}).slice(0, 200)}`;
  return JSON.stringify(rec).slice(0, 200);
}
