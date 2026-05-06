#!/usr/bin/env node
// session-start.mjs — SessionStart hook integration for aegis-resume
//
// Reads the SessionStart hook payload from stdin, scans .aegis/brain/state/
// for interrupted checkpoints (those without a v11-07 archive for the same
// session_id), and writes a short banner to stdout suggesting resume.
//
// Hook output (stdout) is shown to the user by Claude Code at session
// start; exit 0 always (SessionStart hooks must be non-blocking, R6).

import { listCheckpoints, annotateCheckpoints } from "./lib.mjs";

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();

async function readStdin() {
  let raw = "";
  process.stdin.setEncoding("utf8");
  await new Promise(resolve => {
    const t = setTimeout(resolve, 50);
    process.stdin.on("data", c => { raw += c; });
    process.stdin.on("end",  () => { clearTimeout(t); resolve(); });
    process.stdin.on("error",() => { clearTimeout(t); resolve(); });
  });
  return raw;
}

(async () => {
  try {
    await readStdin(); // we don't actually use the payload; future-proofing
    const interrupted = annotateCheckpoints(PROJECT_DIR, listCheckpoints(PROJECT_DIR))
      .filter(c => !c.archived);

    if (interrupted.length === 0) return; // nothing to surface

    const lines = [
      `🔄 aegis-resume: ${interrupted.length} interrupted run${interrupted.length > 1 ? "s" : ""} found.`,
    ];
    for (const c of interrupted.slice(0, 5)) {
      lines.push(`  · session ${c.session_id} — branch ${c.branch || "?"}, task: ${(c.task || "(no task)").slice(0, 60)}`);
    }
    if (interrupted.length > 5) lines.push(`  · …and ${interrupted.length - 5} more`);
    lines.push(`  Run: node tools/aegis-resume/resume.mjs list --interrupted`);
    lines.push(`       node tools/aegis-resume/resume.mjs show <session>`);
    process.stdout.write(lines.join("\n") + "\n");
  } catch {
    // fail-OPEN per Risk R6: SessionStart hooks must never block start.
  }
})().then(() => process.exit(0), () => process.exit(0));
