#!/usr/bin/env node
// validate.mjs — scan a file (or stdin) for unredacted PII patterns

import fs from "node:fs";
import path from "node:path";
import { loadPatterns, findMatches } from "./lib.mjs";

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const SCRIPT_DIR  = path.dirname(new URL(import.meta.url).pathname);
const META_DIR    = path.resolve(SCRIPT_DIR, "../..");

const argv = process.argv.slice(2);
let target = null;
let json = false;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  switch (a) {
    case "--json":    json = true; break;
    case "-h": case "--help":
      process.stdout.write("Usage: validate.mjs <file>      # exits non-zero on leak\n        cat foo.jsonl | validate.mjs\n        validate.mjs <file> --json\n"); process.exit(0);
    default:
      if (a.startsWith("--")) { process.stderr.write(`unknown flag: ${a}\n`); process.exit(2); }
      target = a;
  }
}

let text = "";
if (target) {
  if (!fs.existsSync(target)) { process.stderr.write(`no such file: ${target}\n`); process.exit(2); }
  text = fs.readFileSync(target, "utf8");
} else {
  text = fs.readFileSync(0, "utf8");
}

const { patterns } = loadPatterns(PROJECT_DIR, META_DIR);
const leaks = findMatches(text, patterns);

if (json) {
  process.stdout.write(JSON.stringify({ ok: leaks.length === 0, leaks }, null, 2) + "\n");
} else if (leaks.length === 0) {
  process.stdout.write(`✓ clean — no PII pattern matches in ${target || "stdin"} (${patterns.length} patterns checked)\n`);
} else {
  process.stderr.write(`✗ ${leaks.length} pattern(s) still matched in ${target || "stdin"}:\n`);
  for (const l of leaks) {
    process.stderr.write(`  - ${l.label}: ${l.count} occurrence(s) (sample: ${String(l.sample).slice(0, 60)})\n`);
  }
}

process.exit(leaks.length === 0 ? 0 : 1);
