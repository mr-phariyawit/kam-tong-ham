#!/usr/bin/env node
// list.mjs — summarize archived runs

import fs from "node:fs";
import path from "node:path";

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const RUNS_DIR    = path.join(PROJECT_DIR, ".aegis/brain/runs");

const flags = { json: false, since: null, limit: 0, persona: null };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  switch (a) {
    case "--json":    flags.json = true; break;
    case "--since":   flags.since = process.argv[++i]; break;
    case "--limit":   flags.limit = parseInt(process.argv[++i] || "0", 10) || 0; break;
    case "--persona": flags.persona = process.argv[++i]; break;
    case "-h": case "--help":
      process.stdout.write("Usage: list.mjs [--since YYYY-MM-DD] [--persona <name>] [--limit N] [--json]\n"); process.exit(0);
    default: process.stderr.write(`unknown flag: ${a}\n`); process.exit(2);
  }
}

if (!fs.existsSync(RUNS_DIR)) { process.stderr.write("(no archive dir)\n"); process.exit(0); }

const dirs = fs.readdirSync(RUNS_DIR)
  .filter(d => fs.statSync(path.join(RUNS_DIR, d)).isDirectory())
  .filter(d => !flags.since || d.slice(0, 10) >= flags.since)
  .sort();

const rows = [];
for (const d of dirs) {
  const metaPath = path.join(RUNS_DIR, d, "meta.json");
  let meta = {};
  if (fs.existsSync(metaPath)) {
    try { meta = JSON.parse(fs.readFileSync(metaPath, "utf8")); } catch {}
  }
  if (flags.persona && (meta.persona || "").toLowerCase() !== flags.persona.toLowerCase()) continue;
  rows.push({
    id: d,
    session: meta.session_id || "",
    persona: meta.persona || "",
    lines: meta.transcript_lines || 0,
    archived_at: meta.archived_at || "",
  });
}

const sliced = flags.limit > 0 ? rows.slice(-flags.limit) : rows;
if (flags.json) { process.stdout.write(JSON.stringify(sliced, null, 2) + "\n"); process.exit(0); }

if (sliced.length === 0) { process.stdout.write("(no runs match)\n"); process.exit(0); }
const w = (s, n) => String(s ?? "").padEnd(n).slice(0, n);
process.stdout.write(`${w("RUN-ID", 38)} ${w("PERSONA", 14)} ${w("LINES", 6)} ARCHIVED-AT\n`);
for (const r of sliced) {
  process.stdout.write(`${w(r.id, 38)} ${w(r.persona, 14)} ${w(r.lines, 6)} ${r.archived_at}\n`);
}
