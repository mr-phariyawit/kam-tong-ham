#!/usr/bin/env node
// export.mjs — read activity range, redact, write JSONL
//
// Usage:
//   export.mjs --since 7d --topic kam-tong-ham [--out file]
//   export.mjs --since 2026-05-01 --topic refactor

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { loadPatterns, redactValue, findMatches } from "./lib.mjs";

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const SCRIPT_DIR  = path.dirname(new URL(import.meta.url).pathname);
const META_DIR    = path.resolve(SCRIPT_DIR, "../..");
const ACTIVITY_DIR = path.join(PROJECT_DIR, ".aegis/brain/activity");
const EXPORTS_DIR  = path.join(PROJECT_DIR, ".aegis/brain/exports");

const flags = { since: null, topic: "trace", out: null, validate: true };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  switch (a) {
    case "--since":       flags.since = process.argv[++i]; break;
    case "--topic":       flags.topic = process.argv[++i]; break;
    case "--out":         flags.out   = process.argv[++i]; break;
    case "--no-validate": flags.validate = false; break;
    case "-h": case "--help":
      process.stdout.write(`Usage: export.mjs --since <Nd|YYYY-MM-DD> [--topic <name>] [--out <file>] [--no-validate]

Reads .aegis/brain/activity/*.jsonl in the date range, redacts via
patterns from .aegis/brain/redaction/patterns.yaml, writes a redacted
JSONL to .aegis/brain/exports/<DATE>-<TOPIC>.jsonl.
Validates the output (fails non-zero if any pattern still matches)
unless --no-validate is passed.
`);
      process.exit(0);
    default: process.stderr.write(`unknown flag: ${a}\n`); process.exit(2);
  }
}

if (!flags.since) { process.stderr.write("--since is required\n"); process.exit(2); }

function parseSince(s) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = String(s).match(/^(\d+)d$/);
  if (!m) return null;
  const d = new Date(Date.now() - parseInt(m[1], 10) * 86_400_000);
  return d.toISOString().slice(0, 10);
}

const sinceDate = parseSince(flags.since);
if (!sinceDate) { process.stderr.write(`bad --since: ${flags.since}\n`); process.exit(2); }

const { patterns, source: patternsSrc } = loadPatterns(PROJECT_DIR, META_DIR);
if (patterns.length === 0) {
  process.stderr.write("warning: no redaction patterns loaded — output is NOT redacted\n");
}

if (!fs.existsSync(ACTIVITY_DIR)) {
  process.stderr.write(`no activity dir at ${ACTIVITY_DIR}\n`);
  process.exit(1);
}

const files = fs.readdirSync(ACTIVITY_DIR)
  .filter(f => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
  .filter(f => f.slice(0, 10) >= sinceDate)
  .sort();

fs.mkdirSync(EXPORTS_DIR, { recursive: true });
const today = new Date().toISOString().slice(0, 10);
const outPath = flags.out || path.join(EXPORTS_DIR, `${today}-${flags.topic}.jsonl`);
const ws = fs.createWriteStream(outPath, { encoding: "utf8" });

let written = 0;
let leakedFile;
for (const f of files) {
  const fp = path.join(ACTIVITY_DIR, f);
  const lines = fs.readFileSync(fp, "utf8").split("\n").filter(l => l.trim());
  for (const line of lines) {
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }
    const redacted = redactValue(rec, patterns);
    ws.write(JSON.stringify(redacted) + "\n");
    written++;
  }
}
ws.end();
await new Promise(r => ws.on("close", r));

let validateOK = true;
let leaks = [];
if (flags.validate) {
  const text = fs.readFileSync(outPath, "utf8");
  leaks = findMatches(text, patterns);
  validateOK = leaks.length === 0;
}

process.stdout.write(JSON.stringify({
  out: outPath,
  records: written,
  patterns_loaded: patterns.length,
  patterns_source: patternsSrc,
  validated: flags.validate,
  validate_ok: validateOK,
  leaks,
}, null, 2) + "\n");

if (!validateOK) process.exit(1);
