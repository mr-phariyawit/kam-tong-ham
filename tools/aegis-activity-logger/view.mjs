#!/usr/bin/env node
// view.mjs — CLI viewer for aegis-activity-logger JSONL files
//
// Usage:
//   view [flags]
//
// Flags:
//   --today                 only today's file (UTC)
//   --since <YYYY-MM-DD>    or "5m", "1h", "2d" — anything newer
//   --persona <name>        filter to one persona
//   --tool <name>           filter to one tool
//   --status <ok|err|warn>  filter by status
//   --watch                 tail today's file forever
//   --json                  output raw JSONL (default: human one-liner)
//   --limit <N>             max lines to print

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const ACTIVITY_DIR = path.join(PROJECT_DIR, ".aegis/brain/activity");

const flags = parseArgs(process.argv.slice(2));

function parseArgs(argv) {
  const f = { today: false, since: null, persona: null, tool: null, status: null, watch: false, json: false, limit: 0 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--today":   f.today = true; break;
      case "--since":   f.since = parseSince(argv[++i] || ""); break;
      case "--persona": f.persona = argv[++i] || null; break;
      case "--tool":    f.tool = argv[++i] || null; break;
      case "--status":  f.status = argv[++i] || null; break;
      case "--watch":   f.watch = true; break;
      case "--json":    f.json = true; break;
      case "--limit":   f.limit = parseInt(argv[++i] || "0", 10) || 0; break;
      case "-h": case "--help": printHelp(); process.exit(0);
      default:
        process.stderr.write(`unknown flag: ${a}\n`);
        process.exit(2);
    }
  }
  return f;
}

function parseSince(s) {
  // Accept YYYY-MM-DD, or relative duration (5m, 1h, 2d, 7d).
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + "T00:00:00Z").getTime();
  const m = String(s).match(/^(\d+)([smhd])$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Date.now() - n * ({ s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 })[m[2]];
}

function printHelp() {
  process.stdout.write(`Usage: aegis-activity-logger view [flags]

Flags:
  --today                only today's file (UTC)
  --since <date|dur>     YYYY-MM-DD or 5m / 1h / 2d
  --persona <name>       filter to persona
  --tool <name>          filter to tool
  --status <ok|err|warn> filter by status
  --watch                tail today's file forever
  --json                 raw JSONL (default: human one-liner)
  --limit <N>            max lines

Reads from .aegis/brain/activity/YYYY-MM-DD.jsonl
`);
}

function listFiles() {
  if (!fs.existsSync(ACTIVITY_DIR)) return [];
  const files = fs.readdirSync(ACTIVITY_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
    .sort(); // chronological
  if (flags.today) {
    const today = new Date().toISOString().slice(0, 10);
    return files.filter(f => f === `${today}.jsonl`);
  }
  if (flags.since) {
    return files.filter(f => {
      const day = f.slice(0, 10);
      return new Date(day + "T00:00:00Z").getTime() + 86_400_000 > flags.since;
    });
  }
  return files;
}

function passes(rec) {
  if (flags.persona && (rec.persona || "").toLowerCase() !== flags.persona.toLowerCase()) return false;
  if (flags.tool    && rec.tool !== flags.tool) return false;
  if (flags.status  && rec.status !== flags.status) return false;
  if (flags.since   && rec.ts) {
    const t = new Date(rec.ts).getTime();
    if (!Number.isFinite(t) || t < flags.since) return false;
  }
  return true;
}

function fmt(rec) {
  if (flags.json) return JSON.stringify(rec);
  const ts = (rec.ts || "").slice(11, 19);
  const persona = (rec.persona || "?").slice(0, 14).padEnd(14);
  const tool = (rec.tool || "?").slice(0, 6).padEnd(6);
  const target = rec.target || "";
  const extra = rec.extra ? ` (${rec.extra})` : "";
  const statusGlyph = rec.status === "err" ? "✗" : rec.status === "warn" ? "⚠" : rec.status === "block" ? "⛔" : " ";
  return `${ts} [${persona}] ${tool} ${statusGlyph} ${target}${extra}`;
}

async function main() {
  const files = listFiles();
  if (files.length === 0 && !flags.watch) {
    process.stderr.write("no activity files found.\n");
    process.exit(0);
  }

  let printed = 0;
  for (const f of files) {
    const fp = path.join(ACTIVITY_DIR, f);
    const rl = readline.createInterface({ input: fs.createReadStream(fp), crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      let rec; try { rec = JSON.parse(line); } catch { continue; }
      if (!passes(rec)) continue;
      process.stdout.write(fmt(rec) + "\n");
      printed++;
      if (flags.limit > 0 && printed >= flags.limit) return;
    }
  }

  if (flags.watch) {
    const today = new Date().toISOString().slice(0, 10);
    const fp = path.join(ACTIVITY_DIR, `${today}.jsonl`);
    fs.mkdirSync(ACTIVITY_DIR, { recursive: true });
    if (!fs.existsSync(fp)) fs.writeFileSync(fp, "");
    let pos = fs.statSync(fp).size;
    const watcher = fs.watch(fp, () => {
      const cur = fs.statSync(fp).size;
      if (cur <= pos) return;
      const buf = Buffer.alloc(cur - pos);
      const fd = fs.openSync(fp, "r");
      try { fs.readSync(fd, buf, 0, buf.length, pos); } finally { fs.closeSync(fd); }
      pos = cur;
      for (const line of buf.toString("utf8").split("\n")) {
        if (!line.trim()) continue;
        let rec; try { rec = JSON.parse(line); } catch { continue; }
        if (passes(rec)) process.stdout.write(fmt(rec) + "\n");
      }
    });
    process.on("SIGINT",  () => { watcher.close(); process.exit(0); });
    process.on("SIGTERM", () => { watcher.close(); process.exit(0); });
    // Keep process alive
    setInterval(() => {}, 1 << 30);
  }
}

main().catch(err => { process.stderr.write(`view: ${err.message}\n`); process.exit(1); });
