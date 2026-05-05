#!/usr/bin/env node
// stats.mjs — aggregate counts over the JSONL activity log
//
// Usage:
//   stats [flags]
//
// Flags:
//   --week           last 7 UTC days
//   --month          last 30 UTC days
//   --since <date>   YYYY-MM-DD inclusive
//   --by <dim>       day | tool | persona | status (default: day+tool table)
//   --json           machine-readable

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const ACTIVITY_DIR = path.join(PROJECT_DIR, ".aegis/brain/activity");

const flags = parseArgs(process.argv.slice(2));

function parseArgs(argv) {
  const f = { since: null, by: "day+tool", json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--week":  f.since = daysAgo(7);  break;
      case "--month": f.since = daysAgo(30); break;
      case "--since": f.since = argv[++i]; break;
      case "--by":    f.by    = argv[++i] || f.by; break;
      case "--json":  f.json  = true; break;
      case "-h": case "--help": printHelp(); process.exit(0);
      default:
        process.stderr.write(`unknown flag: ${a}\n`); process.exit(2);
    }
  }
  return f;
}

function daysAgo(n) {
  const d = new Date(Date.now() - n * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function printHelp() {
  process.stdout.write(`Usage: aegis-activity-logger stats [flags]

Flags:
  --week                last 7 UTC days
  --month               last 30 UTC days
  --since <YYYY-MM-DD>  custom start date (inclusive)
  --by <dim>            day | tool | persona | status | day+tool (default)
  --json                machine-readable

Reads from .aegis/brain/activity/*.jsonl
`);
}

async function loadRecords() {
  if (!fs.existsSync(ACTIVITY_DIR)) return [];
  const files = fs.readdirSync(ACTIVITY_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
    .filter(f => !flags.since || f.slice(0, 10) >= flags.since)
    .sort();
  const out = [];
  for (const f of files) {
    const fp = path.join(ACTIVITY_DIR, f);
    const rl = readline.createInterface({ input: fs.createReadStream(fp), crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      try { out.push(JSON.parse(line)); } catch {}
    }
  }
  return out;
}

function bucketKey(rec) {
  switch (flags.by) {
    case "day":     return (rec.ts || "").slice(0, 10) || "unknown";
    case "tool":    return rec.tool    || "unknown";
    case "persona": return rec.persona || "unknown";
    case "status":  return rec.status  || "unknown";
    case "day+tool":
    default:        return `${(rec.ts || "").slice(0,10) || "unknown"}\t${rec.tool || "unknown"}`;
  }
}

(async () => {
  const recs = await loadRecords();
  const buckets = new Map();
  for (const r of recs) {
    const k = bucketKey(r);
    buckets.set(k, (buckets.get(k) || 0) + 1);
  }

  if (flags.json) {
    const obj = {};
    for (const [k, v] of buckets) obj[k] = v;
    process.stdout.write(JSON.stringify({ since: flags.since, by: flags.by, total: recs.length, buckets: obj }, null, 2) + "\n");
    return;
  }

  if (flags.by === "day+tool") {
    const days = [...new Set([...buckets.keys()].map(k => k.split("\t")[0]))].sort();
    const tools = [...new Set([...buckets.keys()].map(k => k.split("\t")[1]))].sort();
    const w = Math.max(10, ...tools.map(t => t.length));
    process.stdout.write(`day        ${tools.map(t => t.padStart(w)).join(" ")}  total\n`);
    for (const d of days) {
      let row = d + "  ";
      let total = 0;
      for (const t of tools) {
        const v = buckets.get(`${d}\t${t}`) || 0;
        total += v;
        row += String(v).padStart(w) + " ";
      }
      row += " " + String(total).padStart(5);
      process.stdout.write(row + "\n");
    }
    process.stdout.write(`total: ${recs.length}\n`);
    return;
  }

  // Single-dim table.
  const rows = [...buckets.entries()].sort((a, b) => b[1] - a[1]);
  const keyW = Math.max(8, ...rows.map(r => String(r[0]).length));
  for (const [k, v] of rows) process.stdout.write(`${String(k).padEnd(keyW)}  ${v}\n`);
  process.stdout.write(`total: ${recs.length}\n`);
})();
