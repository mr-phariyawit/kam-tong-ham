#!/usr/bin/env node
// log.mjs — PostToolUse hook for aegis-activity-logger (sprint v11-02)
//
// Reads a Claude Code hook event from stdin, formats it as one JSON line,
// appends it to `.aegis/brain/activity/YYYY-MM-DD.jsonl` (UTC day).
//
// Performance contract:
//   - p95 < 100ms (Risk R1 mitigation, mirrors v11-01 budget)
//   - exits 0 on every error path (PostToolUse must never block tool calls)
//   - file rotates per UTC day, append-only — never modifies past entries

import fs from "node:fs";
import path from "node:path";
import { eventFromHook } from "../aegis-live-tail/format.mjs";
import { safeRun } from "../_hook-utils/safe-run.mjs";

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const ACTIVITY_DIR = path.join(PROJECT_DIR, ".aegis/brain/activity");
const PERSONA = process.env.AEGIS_PERSONA || process.env.AEGIS_AGENT || "";
const SESSION = process.env.CLAUDE_SESSION_ID || process.env.AEGIS_SESSION || "";
const MAX_STDIN = 64 * 1024;

function todayISO() {
  // UTC date stamp YYYY-MM-DD for filename
  return new Date().toISOString().slice(0, 10);
}

async function readStdin() {
  let raw = "";
  let timedOut = false;
  process.stdin.setEncoding("utf8");
  await new Promise((resolve) => {
    const t = setTimeout(() => { timedOut = true; resolve(); }, 50);
    let total = 0;
    process.stdin.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_STDIN) { resolve(); return; }
      raw += chunk;
    });
    process.stdin.on("end",   () => { clearTimeout(t); resolve(); });
    process.stdin.on("error", () => { clearTimeout(t); resolve(); });
  });
  return raw;
}

function buildRecord(hook, ev) {
  const r = {
    ts: ev.ts.toISOString(),
    tool: ev.tool,
    target: ev.target || "",
    extra: ev.extra || "",
    persona: ev.persona || "",
    status: ev.status || "ok",
    session: SESSION,
  };
  // For Edit/Write, try to capture a quick diff_summary if available in tool_input.
  if ((r.tool === "Edit" || r.tool === "Write" || r.tool === "MultiEdit") && hook?.tool_input) {
    const ti = hook.tool_input;
    if (ti.old_string && ti.new_string) {
      const oldLines = String(ti.old_string).split("\n").length;
      const newLines = String(ti.new_string).split("\n").length;
      r.extra = r.extra || `+${newLines} -${oldLines}`;
    }
  }
  return r;
}

async function main() {
  const raw = await readStdin();
  let hook = {};
  try { hook = raw ? JSON.parse(raw) : {}; } catch { hook = {}; }

  const ev = eventFromHook(hook, PERSONA);

  // Skip events that have no useful target (e.g. Skill invocations with no name).
  // Empty-target events are still logged — operators may want them — but we
  // never log a record with no tool at all.
  if (!ev.tool || ev.tool === "?") return;

  const rec = buildRecord(hook, ev);
  const line = JSON.stringify(rec) + "\n";

  try {
    fs.mkdirSync(ACTIVITY_DIR, { recursive: true });
    const file = path.join(ACTIVITY_DIR, `${todayISO()}.jsonl`);
    fs.appendFileSync(file, line, { encoding: "utf8" });
  } catch {
    // Fail-open: never block tool calls because of an audit-log write error.
  }
}

// v15-12: safeRun adds classified error logging + friendly stderr.
safeRun(main, { hookName: "aegis-activity-logger/log", failOpen: true });
