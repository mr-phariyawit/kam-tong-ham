#!/usr/bin/env node
// checkpoint.mjs — write a resumable checkpoint to .aegis/brain/state/
//
// Usage:
//   checkpoint.mjs --session <id> [--task "fix X"] [--persona spider-man]
//
// Auto-fills git state (branch / last_commit / dirty_files). Designed to
// be invoked manually (`/aegis-checkpoint`) or by a periodic background
// hook in the future.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { emitCheckpoint, gitSnapshot, statePath, STATE_REL } from "./lib.mjs";

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();

const flags = { session: null, task: "", persona: process.env.AEGIS_PERSONA || "" };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  switch (a) {
    case "--session": flags.session = process.argv[++i]; break;
    case "--task":    flags.task    = process.argv[++i]; break;
    case "--persona": flags.persona = process.argv[++i]; break;
    case "-h": case "--help":
      process.stdout.write(`Usage: checkpoint.mjs --session <id> [--task "..."] [--persona <name>]

Writes a resumable checkpoint to .aegis/brain/state/<session>.yaml.
Auto-fills branch / last_commit / dirty_files via git.
`); process.exit(0);
    default: process.stderr.write(`unknown flag: ${a}\n`); process.exit(2);
  }
}

if (!flags.session) {
  process.stderr.write("--session is required (use the Claude Code session id)\n");
  process.exit(2);
}

const git = gitSnapshot(PROJECT_DIR);
const rec = {
  session_id: flags.session,
  ts: new Date().toISOString(),
  branch: git.branch,
  persona: flags.persona,
  task: flags.task,
  last_commit: git.last_commit,
  dirty_files: git.dirty_files,
};

const dir = path.join(PROJECT_DIR, STATE_REL);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(statePath(PROJECT_DIR, flags.session), emitCheckpoint(rec));
process.stdout.write(`checkpoint: ${path.relative(PROJECT_DIR, statePath(PROJECT_DIR, flags.session))} (branch=${git.branch}, commit=${git.last_commit}, dirty=${git.dirty_files.length})\n`);
