#!/usr/bin/env node
// watch.mjs — foreground tailer for aegis-live-tail
//
// Reads from .aegis/brain/live/current.fifo and prints each line to stdout
// with optional filtering. Designed to run in a tmux pane (or any second
// terminal) for the lifetime of the user's working session.
//
// Filter flags (all optional):
//   --persona <name>    only show events from this persona
//   --tool <name>       only show events for this tool (Bash, Edit, ...)
//   --errors-only       only show events with error/warn/block status
//   --since <duration>  only show events newer than now-<duration> (5m, 1h)
//   --no-color          strip ANSI escapes (e.g. when piping to file)
//   --max-mem-mb <N>    voluntary self-recycle when RSS > N MB (default 20)
//
// The reader uses a 24-hour auto-recycle by default to bound memory growth
// (Risk R2 mitigation per sprint plan v11-01).

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { _internal } from "./format.mjs";

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const LIVE_DIR = path.join(PROJECT_DIR, ".aegis/brain/live");
const FIFO = path.join(LIVE_DIR, "current.fifo");

const RECYCLE_AFTER_MS = 24 * 60 * 60 * 1000; // 24h
const MEM_CHECK_MS = 60 * 1000;               // 1m
const DEFAULT_MAX_MEM_MB = 20;

// ── arg parse ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flags = {
  persona: null,
  tool: null,
  errorsOnly: false,
  since: null,
  noColor: false,
  maxMemMb: DEFAULT_MAX_MEM_MB,
};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  switch (a) {
    case "--persona":     flags.persona = argv[++i] || null; break;
    case "--tool":        flags.tool    = argv[++i] || null; break;
    case "--errors-only": flags.errorsOnly = true; break;
    case "--since":       flags.since   = parseDuration(argv[++i] || ""); break;
    case "--no-color":    flags.noColor = true; break;
    case "--max-mem-mb":  flags.maxMemMb = parseInt(argv[++i] || "", 10) || DEFAULT_MAX_MEM_MB; break;
    case "--help": case "-h":
      printHelp(); process.exit(0);
    default:
      process.stderr.write(`unknown flag: ${a}\n`);
      process.exit(2);
  }
}

function parseDuration(s) {
  const m = String(s).match(/^(\d+)([smh])$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n * ({ s: 1000, m: 60_000, h: 3_600_000 })[m[2]];
}

function printHelp() {
  process.stdout.write(`Usage: aegis-live-tail watch [flags]

Flags:
  --persona <name>     filter to one persona
  --tool <name>        filter to one tool (Bash | Edit | Write | Agent | ...)
  --errors-only        only show events with status err/warn/block
  --since <5m|1h>      only show events newer than now-<duration>
  --no-color           strip ANSI escapes
  --max-mem-mb <N>     self-recycle when RSS > N MB (default ${DEFAULT_MAX_MEM_MB})
  --help, -h           show this help

Reads from ${FIFO}
`);
}

// ── filter logic ─────────────────────────────────────────────────────────────
function passes(line, now = Date.now()) {
  // Strip ANSI to inspect content.
  const plain = _internal.stripAnsi(line);
  if (flags.persona) {
    // pattern: HH:MM:SS [Persona  ] ...
    const m = plain.match(/^\d{2}:\d{2}:\d{2}\s+\[([^\]]+)\]/);
    if (!m) return false;
    if (m[1].trim().toLowerCase() !== flags.persona.toLowerCase()) return false;
  }
  if (flags.tool) {
    // tool sits after the persona cell
    if (!plain.includes(` ${flags.tool.padEnd(5).slice(0,5)}`) &&
        !plain.includes(` ${flags.tool} `)) {
      return false;
    }
  }
  if (flags.errorsOnly) {
    if (!/[✗⚠⛔]/u.test(plain)) return false;
  }
  if (flags.since) {
    const m = plain.match(/^(\d{2}):(\d{2}):(\d{2})/);
    if (m) {
      const today = new Date();
      const lineDate = new Date(Date.UTC(
        today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(),
        parseInt(m[1],10), parseInt(m[2],10), parseInt(m[3],10),
      ));
      if (now - lineDate.getTime() > flags.since) return false;
    }
  }
  return true;
}

// ── memory + uptime self-watch ───────────────────────────────────────────────
const startedAt = Date.now();
let memTimer;
function checkMemoryAndUptime() {
  const rssMb = process.memoryUsage().rss / (1024 * 1024);
  const ageMs = Date.now() - startedAt;
  if (rssMb > flags.maxMemMb || ageMs > RECYCLE_AFTER_MS) {
    process.stderr.write(`\n[live-tail] self-recycling (rss=${rssMb.toFixed(1)}MB, age=${(ageMs/3600_000).toFixed(2)}h)\n`);
    process.exit(0); // re-spawn handled by start-tmux.sh wrapper
  }
}

// ── ensure fifo exists ───────────────────────────────────────────────────────
import { spawnSync } from "node:child_process";

function ensureFifo() {
  fs.mkdirSync(LIVE_DIR, { recursive: true });
  if (!fs.existsSync(FIFO)) {
    spawnSync("mkfifo", [FIFO], { stdio: "ignore" });
  }
}

// ── main loop ────────────────────────────────────────────────────────────────
//
// Implementation note: we open the fifo in O_RDWR mode rather than O_RDONLY.
// On a fifo with no writer, a non-blocking O_RDONLY reader receives EOF
// immediately as soon as a transient writer (e.g. the emit hook) closes
// — which closes the read stream and exits node when there's nothing else
// holding the event loop. Opening O_RDWR keeps us simultaneously a writer,
// so the kernel never reports EOF to our reader stream. The classic
// "self-pinned fifo" trick. We never actually write through this fd.
function start() {
  ensureFifo();

  let fd;
  try {
    fd = fs.openSync(FIFO, fs.constants.O_RDWR);
  } catch (err) {
    process.stderr.write(`[live-tail] cannot open fifo ${FIFO}: ${err.message}\n`);
    process.exit(1);
  }

  const rs = fs.createReadStream(null, { fd, autoClose: false });
  rs.on("error", (err) => {
    if (err.code === "EAGAIN" || err.code === "ENXIO") return;
    process.stderr.write(`[live-tail] read error: ${err.message}\n`);
  });

  const rl = readline.createInterface({ input: rs, crlfDelay: Infinity });
  rl.on("line", (line) => {
    if (!passes(line)) return;
    const out = flags.noColor ? _internal.stripAnsi(line) : line;
    process.stdout.write(out + "\n");
  });
  // With O_RDWR pinning the fd open, rl.close should not fire spontaneously;
  // if it does (signal-driven shutdown), the SIGINT/SIGTERM handlers below
  // will exit cleanly.

  memTimer = setInterval(checkMemoryAndUptime, MEM_CHECK_MS);
  memTimer.unref?.();
}

process.on("SIGINT",  () => { clearInterval(memTimer); process.exit(0); });
process.on("SIGTERM", () => { clearInterval(memTimer); process.exit(0); });

start();
