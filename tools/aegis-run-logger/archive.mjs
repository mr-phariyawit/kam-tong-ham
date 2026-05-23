#!/usr/bin/env node
// archive.mjs — Stop hook for aegis-run-logger (sprint v11-07)
//
// Reads the Claude Code Stop hook payload from stdin:
//   { session_id, stop_hook_active, transcript_path, ... }
// Copies transcript_path → .aegis/brain/runs/<YYYY-MM-DD>-<session>/transcript.ndjson
// Writes meta.json alongside.
//
// Stop hooks must NOT block the user; this script always exits 0.

import fs from "node:fs";
import path from "node:path";
import { safeRun } from "../_hook-utils/safe-run.mjs";

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const RUNS_DIR    = path.join(PROJECT_DIR, ".aegis/brain/runs");
const PERSONA     = process.env.AEGIS_PERSONA || process.env.AEGIS_AGENT || "";

async function readStdin() {
  let raw = "";
  process.stdin.setEncoding("utf8");
  await new Promise((resolve) => {
    const t = setTimeout(resolve, 100);
    let total = 0;
    process.stdin.on("data", c => {
      total += c.length;
      if (total > 1024 * 1024) { resolve(); return; }
      raw += c;
    });
    process.stdin.on("end",   () => { clearTimeout(t); resolve(); });
    process.stdin.on("error", () => { clearTimeout(t); resolve(); });
  });
  return raw;
}

function todayUTC() { return new Date().toISOString().slice(0, 10); }

async function main() {
  const raw = await readStdin();
  let hook = {};
  try { hook = raw ? JSON.parse(raw) : {}; } catch {}

  const sessionId = String(hook.session_id || "").slice(0, 32);
  // Skip the archive entirely if we got nothing useful from the hook payload.
  // Empty session_id usually means we're running outside a real session
  // (e.g. garbage stdin during a test); creating a "no-session" archive dir
  // there pollutes the runs/ index.
  if (!sessionId) return;
  const transcriptPath = hook.transcript_path || "";

  const runId = `${todayUTC()}-${sessionId}`;
  const runDir = path.join(RUNS_DIR, runId);

  try { fs.mkdirSync(runDir, { recursive: true }); } catch { return; }

  let transcriptLines = 0;
  if (transcriptPath && fs.existsSync(transcriptPath)) {
    try {
      const dst = path.join(runDir, "transcript.ndjson");
      fs.copyFileSync(transcriptPath, dst);
      const data = fs.readFileSync(dst, "utf8");
      transcriptLines = data.split("\n").filter(l => l.trim()).length;
    } catch {}
  }

  const meta = {
    session_id: sessionId,
    archived_at: new Date().toISOString(),
    persona: PERSONA,
    transcript_lines: transcriptLines,
    source_path: transcriptPath || null,
    project_dir: PROJECT_DIR,
  };
  try {
    fs.writeFileSync(path.join(runDir, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
  } catch {}
}

// v15-12: safeRun adds classified error logging + friendly stderr.
safeRun(main, { hookName: "aegis-run-logger/archive", failOpen: true });
