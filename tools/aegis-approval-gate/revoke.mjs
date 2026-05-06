#!/usr/bin/env node
// revoke.mjs — revoke (delete) an approval marker by ID.
//
// Usage:
//   revoke.mjs <ID>           # ID is the YAML filename without .yaml
//   revoke.mjs --all-expired  # bulk-cleanup of expired markers

import fs from "node:fs";
import path from "node:path";
import { listApprovals, APPROVALS_SUBDIR } from "./lib.mjs";

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();

const argv = process.argv.slice(2);
if (argv.length === 0 || argv.includes("-h") || argv.includes("--help")) {
  process.stdout.write("Usage: revoke.mjs <ID>\n        revoke.mjs --all-expired\n");
  process.exit(argv.length === 0 ? 2 : 0);
}

if (argv[0] === "--all-expired") {
  const expired = listApprovals(PROJECT_DIR).filter(r => r.expired);
  if (expired.length === 0) { process.stdout.write("(no expired approvals)\n"); process.exit(0); }
  for (const r of expired) {
    try { fs.unlinkSync(r.path); process.stdout.write(`revoked: ${r.id}\n`); } catch (e) {
      process.stderr.write(`fail: ${r.id}: ${e.message}\n`);
    }
  }
  process.exit(0);
}

const id = argv[0].replace(/\.yaml$/, "");
const fp = path.join(PROJECT_DIR, APPROVALS_SUBDIR, `${id}.yaml`);
if (!fs.existsSync(fp)) {
  process.stderr.write(`no such approval: ${id}\n`);
  process.exit(2);
}
fs.unlinkSync(fp);
process.stdout.write(`revoked: ${id}\n`);
