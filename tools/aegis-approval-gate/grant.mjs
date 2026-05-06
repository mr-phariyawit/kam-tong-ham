#!/usr/bin/env node
// grant.mjs — issue an approval marker
//
// Usage:
//   grant.mjs --task <ID> --action <name> --scope <s> [--scope <s>...] [--ttl <dur>] [--by <user>]
//
// Scope formats:
//   rule:<rule-name>       e.g. rule:rm-rf
//   bash:<substring>       e.g. bash:rm -rf
//   *                       wildcard — covers any matched rule (use sparingly)
//
// TTL: 5m, 1h, 24h, 7d (default: 1h). Sets expires_at.
//
// Writes to .aegis/brain/approvals/<TASK>-<ACTION>.yaml.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { emitYaml, APPROVALS_SUBDIR } from "./lib.mjs";

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();

function parseTtl(s) {
  const m = String(s || "1h").match(/^(\d+)([smhd])$/);
  if (!m) return 60 * 60 * 1000;
  const n = parseInt(m[1], 10);
  return n * ({ s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 })[m[2]];
}

function parseArgs(argv) {
  const f = { task: "", action: "", scope: [], ttl: "1h", by: "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--task":   f.task   = argv[++i]; break;
      case "--action": f.action = argv[++i]; break;
      case "--scope":  f.scope.push(argv[++i]); break;
      case "--ttl":    f.ttl    = argv[++i]; break;
      case "--by":     f.by     = argv[++i]; break;
      case "-h": case "--help":
        process.stdout.write(`Usage: grant.mjs --task <ID> --action <name> --scope <s> [--scope ...] [--ttl 1h] [--by <user>]

Scope formats:
  rule:<rule-name>   e.g. rule:rm-rf
  bash:<substring>   e.g. "bash:rm -rf"
  *                  wildcard

Default --ttl: 1h. Default --by: $USER.
Output path: .aegis/brain/approvals/<TASK>-<ACTION>.yaml
`);
        process.exit(0);
      default: process.stderr.write(`unknown flag: ${a}\n`); process.exit(2);
    }
  }
  return f;
}

const f = parseArgs(process.argv.slice(2));
if (!f.task)   { process.stderr.write("--task is required\n");   process.exit(2); }
if (!f.action) { process.stderr.write("--action is required\n"); process.exit(2); }
if (f.scope.length === 0) { process.stderr.write("--scope is required (at least one)\n"); process.exit(2); }

const now = new Date();
const expires = new Date(now.getTime() + parseTtl(f.ttl));

const rec = {
  task: f.task,
  action: f.action,
  approved_by: f.by || os.userInfo().username || "unknown",
  approved_at: now.toISOString(),
  expires_at: expires.toISOString(),
  scope: f.scope,
};

const dir = path.join(PROJECT_DIR, APPROVALS_SUBDIR);
fs.mkdirSync(dir, { recursive: true });
const fp = path.join(dir, `${f.task}-${f.action}.yaml`);
fs.writeFileSync(fp, emitYaml(rec));
process.stdout.write(`granted: ${path.relative(PROJECT_DIR, fp)} (expires ${expires.toISOString()})\n`);
