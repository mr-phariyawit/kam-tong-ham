#!/usr/bin/env node
// resume.mjs — list / show / clear checkpoints + render resume briefs
//
// Usage:
//   resume.mjs list                      # all checkpoints, with archived flag
//   resume.mjs list --interrupted        # only those NOT archived (real candidates)
//   resume.mjs show <session>            # paste-ready resume brief
//   resume.mjs clear <session>           # delete one
//   resume.mjs clear --all-stopped       # delete every checkpoint whose session has a v11-07 archive

import fs from "node:fs";
import path from "node:path";
import { listCheckpoints, annotateCheckpoints, statePath } from "./lib.mjs";

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();

const argv = process.argv.slice(2);
const sub = argv[0];
const flags = { interrupted: false, archived: false, json: false, "all-stopped": false };
const positional = [];
for (let i = 1; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--interrupted") flags.interrupted = true;
  else if (a === "--archived") flags.archived = true;
  else if (a === "--json") flags.json = true;
  else if (a === "--all-stopped") flags["all-stopped"] = true;
  else if (a.startsWith("--")) { process.stderr.write(`unknown flag: ${a}\n`); process.exit(2); }
  else positional.push(a);
}

function help() {
  process.stdout.write(`Usage: resume.mjs <subcommand>

  list [--interrupted|--archived] [--json]   show checkpoints
  show <session>                              paste-ready brief
  clear <session>                             delete one
  clear --all-stopped                         delete every cleanly-archived checkpoint

A checkpoint is "archived" iff aegis-run-logger (v11-07) wrote a runs/ entry
for the same session_id.  Otherwise it's "interrupted" (real resume candidate).
`);
}

function cmdList() {
  const all = annotateCheckpoints(PROJECT_DIR, listCheckpoints(PROJECT_DIR));
  let rows = all;
  if (flags.interrupted) rows = rows.filter(r => !r.archived);
  if (flags.archived)    rows = rows.filter(r =>  r.archived);
  if (flags.json) {
    process.stdout.write(JSON.stringify(rows, null, 2) + "\n");
    return;
  }
  if (rows.length === 0) { process.stdout.write("(no checkpoints match)\n"); return; }
  const w = (s, n) => String(s ?? "").padEnd(n).slice(0, n);
  process.stdout.write(`${w("SESSION", 14)} ${w("STATE", 12)} ${w("BRANCH", 24)} ${w("PERSONA", 14)} TASK\n`);
  for (const r of rows) {
    const state = r.archived ? "archived" : "interrupted";
    process.stdout.write(`${w(r.session_id, 14)} ${w(state, 12)} ${w(r.branch || "-", 24)} ${w(r.persona || "-", 14)} ${(r.task || "").slice(0, 60)}\n`);
  }
}

function cmdShow() {
  const id = positional[0];
  if (!id) { process.stderr.write("show requires <session>\n"); process.exit(2); }
  const list = listCheckpoints(PROJECT_DIR);
  const c = list.find(x => x.session_id === id);
  if (!c) { process.stderr.write(`no such checkpoint: ${id}\n`); process.exit(2); }
  const archived = annotateCheckpoints(PROJECT_DIR, [c])[0].archived;

  // Paste-ready brief — operator (or Claude) can read this and pick up.
  process.stdout.write(`### Resume brief — session ${id}
- ts:          ${c.ts || "?"}
- state:       ${archived ? "ARCHIVED (cleanly stopped)" : "INTERRUPTED"}
- branch:      ${c.branch || "(unknown)"}
- last_commit: ${c.last_commit || "(unknown)"}
- persona:     ${c.persona || "(none)"}
- task:        ${c.task || "(no task captured)"}
- dirty files: ${(c.dirty_files || []).length}
${(c.dirty_files || []).map(f => `    - ${f}`).join("\n")}

To pick up:
  cd ${PROJECT_DIR}
  git checkout ${c.branch || "main"}
  ${(c.dirty_files || []).length ? "# Note: " + (c.dirty_files || []).length + " uncommitted files were dirty at checkpoint" : "# Working tree was clean"}
  claude
${c.task ? "# Then in Claude Code, paste:\n#   resume task: " + c.task : ""}
`);
}

function cmdClear() {
  if (flags["all-stopped"]) {
    const all = annotateCheckpoints(PROJECT_DIR, listCheckpoints(PROJECT_DIR));
    const stopped = all.filter(r => r.archived);
    if (stopped.length === 0) { process.stdout.write("(no archived checkpoints to clear)\n"); return; }
    for (const r of stopped) {
      try { fs.unlinkSync(r._path); process.stdout.write(`cleared: ${r.session_id}\n`); }
      catch (e) { process.stderr.write(`fail ${r.session_id}: ${e.message}\n`); }
    }
    return;
  }
  const id = positional[0];
  if (!id) { process.stderr.write("clear requires <session> or --all-stopped\n"); process.exit(2); }
  const fp = statePath(PROJECT_DIR, id);
  if (!fs.existsSync(fp)) { process.stderr.write(`no such checkpoint: ${id}\n`); process.exit(2); }
  fs.unlinkSync(fp);
  process.stdout.write(`cleared: ${id}\n`);
}

switch (sub) {
  case "list":  cmdList(); break;
  case "show":  cmdShow(); break;
  case "clear": cmdClear(); break;
  case "help": case undefined: case "-h": case "--help": help(); break;
  default: process.stderr.write(`unknown subcommand: ${sub}\n`); help(); process.exit(2);
}
