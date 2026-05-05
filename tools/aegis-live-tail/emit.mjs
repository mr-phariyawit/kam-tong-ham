#!/usr/bin/env node
// emit.mjs — PostToolUse hook for aegis-live-tail
//
// Reads a Claude Code hook event (JSON on stdin), formats it into one line,
// writes it to .aegis/brain/live/current.fifo (non-blocking, drops if full).
//
// Performance contract (from sprint v11-01 plan §6.1):
//   - p95 latency <100ms (Risk R1 mitigation)
//   - exits 0 on any internal error (Risk R6 fail-open: PostToolUse must not
//     block tool calls; live-tail visibility is best-effort)
//   - <5ms target on the hot path

import fs from "node:fs";
import path from "node:path";
import { eventFromHook, formatEvent } from "./format.mjs";

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const FIFO = path.join(PROJECT_DIR, ".aegis/brain/live/current.fifo");
const PERSONA = process.env.AEGIS_PERSONA || process.env.AEGIS_AGENT || "";

async function main() {
  // Read stdin (non-blocking with a hard timeout — we never want to hang
  // a tool call). Bounded read of up to 64KB.
  let raw = "";
  let timedOut = false;
  const MAX = 64 * 1024;

  process.stdin.setEncoding("utf8");

  await new Promise((resolve) => {
    const t = setTimeout(() => { timedOut = true; resolve(); }, 50);
    let total = 0;
    process.stdin.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX) { resolve(); return; }
      raw += chunk;
    });
    process.stdin.on("end", () => { clearTimeout(t); resolve(); });
    process.stdin.on("error", () => { clearTimeout(t); resolve(); });
  });

  let hook = {};
  try { hook = raw ? JSON.parse(raw) : {}; } catch { hook = {}; }

  const ev = eventFromHook(hook, PERSONA);
  // Honor color toggle: if NO_COLOR is set or stdout-of-fifo-reader is not a
  // tty (we can't tell here), still emit color codes — watch.mjs strips on
  // its end if asked. Keep wire format ANSI-rich.
  const line = formatEvent(ev, { color: true, maxWidth: 200 });

  // Best-effort non-blocking write to fifo. If no reader exists, the open
  // would block in regular mode — use O_NONBLOCK so we drop instead of stall.
  // If the fifo doesn't exist at all, silently no-op.
  try {
    if (!fs.existsSync(FIFO)) return;
    let fd;
    try {
      fd = fs.openSync(FIFO, fs.constants.O_WRONLY | fs.constants.O_NONBLOCK);
    } catch (err) {
      // ENXIO = no reader on the other end of the fifo. Drop the line.
      // Any other error: also drop, fail-open.
      return;
    }
    try {
      fs.writeSync(fd, line + "\n");
    } catch {
      // Drop on any write error (e.g. EAGAIN — pipe buffer full).
    } finally {
      try { fs.closeSync(fd); } catch {}
    }
  } catch {
    // Top-level catch — fail open per Risk R6.
  }
}

// Always exit 0; PostToolUse hooks must not block tool calls.
main().then(
  () => process.exit(0),
  () => process.exit(0),
);
