#!/usr/bin/env node
// list.mjs — list approval markers
//
// Usage:
//   list.mjs                # all (active + expired)
//   list.mjs --active       # only non-expired
//   list.mjs --expired      # only expired
//   list.mjs --json

import { listApprovals } from "./lib.mjs";

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();

const argv = process.argv.slice(2);
const flags = { active: false, expired: false, json: false };
for (const a of argv) {
  switch (a) {
    case "--active":  flags.active = true; break;
    case "--expired": flags.expired = true; break;
    case "--json":    flags.json = true; break;
    case "-h": case "--help":
      process.stdout.write("Usage: list.mjs [--active|--expired] [--json]\n"); process.exit(0);
    default: process.stderr.write(`unknown flag: ${a}\n`); process.exit(2);
  }
}

let rows = listApprovals(PROJECT_DIR);
if (flags.active)  rows = rows.filter(r => !r.expired);
if (flags.expired) rows = rows.filter(r =>  r.expired);

if (flags.json) {
  process.stdout.write(JSON.stringify(rows, null, 2) + "\n");
  process.exit(0);
}

if (rows.length === 0) {
  process.stdout.write("(no approvals)\n");
  process.exit(0);
}

const w = (s, n) => String(s ?? "").padEnd(n).slice(0, n);
process.stdout.write(`${w("ID", 28)} ${w("STATE", 8)} ${w("BY", 14)} ${w("EXPIRES", 22)} SCOPE\n`);
for (const r of rows) {
  const state = r.expired ? "EXPIRED" : "ACTIVE";
  process.stdout.write(`${w(r.id, 28)} ${w(state, 8)} ${w(r.approved_by, 14)} ${w(r.expires_at, 22)} ${(r.scope || []).join(", ")}\n`);
}
