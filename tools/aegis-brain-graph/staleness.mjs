#!/usr/bin/env node
// tools/aegis-brain-graph/staleness.mjs (sprint-v12-06)
//
// SessionStart-friendly staleness banner. Compares the graph's
// `meta.json.built_at` to the latest commit on HEAD. Emits a one-line
// warning iff:
//   - HEAD is at least 1 hour newer than the graph's built_at, AND
//   - at least one source file has changed since the graph was built
//     (i.e. `meta.source_mtime_max` lags an actual source file's mtime)
//
// Otherwise: silent exit 0. Always exits 0 (fail-OPEN per DoD §2 / R6).
//
// Usage:
//   node tools/aegis-brain-graph/staleness.mjs              (silent if fresh)
//   node tools/aegis-brain-graph/staleness.mjs --quiet      (always silent;
//                                                            for SessionStart hook)
//   node tools/aegis-brain-graph/staleness.mjs --json       (machine-readable)
//
// Spec: AEGIS Knowledge-Layer Mega Plan v1.1, sprint v12-06 story C.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execSync } from 'node:child_process';
import { safeRun } from '../_hook-utils/safe-run.mjs';

const STALE_HOURS_THRESHOLD = 1; // banner fires only when HEAD is ≥ 1h newer

function parseArgs(argv) {
  const args = { root: process.cwd(), quiet: false, json: false, threshold: STALE_HOURS_THRESHOLD };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--root':       args.root = path.resolve(argv[++i]); break;
      case '--quiet':      args.quiet = true; break;
      case '--json':       args.json = true; break;
      case '--threshold':  args.threshold = Number(argv[++i]); break;
      case '-h':
      case '--help':
        console.log('Usage: staleness.mjs [--root <path>] [--quiet] [--json] [--threshold <hours>]');
        process.exit(0);
        break;
      default:
        // staleness is a hot path — unknown args fail-OPEN, don't error.
        break;
    }
  }
  return args;
}

function safe(fn, fallback) {
  try { return fn(); } catch { return fallback; }
}

function check(args) {
  const graphMeta = path.join(args.root, '.aegis', 'brain', 'graph', 'meta.json');
  if (!fs.existsSync(graphMeta)) {
    return { stale: false, reason: 'no graph yet', graph_built_at: null, head_committed_at: null, hours_behind: 0 };
  }
  const meta = safe(() => JSON.parse(fs.readFileSync(graphMeta, 'utf8')), null);
  if (!meta || !meta.built_at) {
    return { stale: false, reason: 'meta.json unparseable', graph_built_at: null, head_committed_at: null, hours_behind: 0 };
  }
  const builtAtMs = new Date(meta.built_at).getTime();
  const headCommittedISO = safe(() =>
    execSync('git log -1 --format=%cI HEAD', { cwd: args.root, stdio: ['ignore', 'pipe', 'pipe'] })
      .toString().trim(), null);
  if (!headCommittedISO) {
    return { stale: false, reason: 'git not available or no commits', graph_built_at: meta.built_at, head_committed_at: null, hours_behind: 0 };
  }
  const headMs = new Date(headCommittedISO).getTime();
  const hoursBehind = (headMs - builtAtMs) / (1000 * 60 * 60);

  // Also check source mtimes — only fire if at least one source file is newer than meta.source_mtime_max.
  const srcMtimeMax = meta.source_mtime_max || 0;
  let anySourceNewer = false;
  for (const rel of ['skills', '.claude/settings.json']) {
    const full = path.join(args.root, rel);
    if (!fs.existsSync(full)) continue;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      const entries = safe(() => fs.readdirSync(full).map((f) => path.join(full, f)), []);
      for (const e of entries) {
        if (safe(() => fs.statSync(e).mtimeMs, 0) > srcMtimeMax) { anySourceNewer = true; break; }
      }
    } else if (stat.mtimeMs > srcMtimeMax) {
      anySourceNewer = true;
    }
    if (anySourceNewer) break;
  }

  const stale = hoursBehind >= args.threshold && anySourceNewer;
  return {
    stale,
    reason: stale ? 'HEAD is newer and a source file changed' : 'fresh',
    graph_built_at: meta.built_at,
    head_committed_at: headCommittedISO,
    hours_behind: Math.round(hoursBehind * 10) / 10,
    source_mtime_max: srcMtimeMax,
    any_source_newer: anySourceNewer,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let result;
  try {
    result = check(args);
  } catch (e) {
    // Fail-OPEN: never crash the SessionStart chain.
    if (args.json) process.stdout.write(JSON.stringify({ stale: false, error: String(e.message) }) + '\n');
    process.exit(0);
  }
  if (args.json) {
    process.stdout.write(JSON.stringify(result) + '\n');
  } else if (result.stale && !args.quiet) {
    console.log(`🕒 brain graph ${result.hours_behind}h behind HEAD — run: bash tools/aegis-brain-graph/build.mjs --full`);
  }
  process.exit(0);
}

// v15-12: safeRun adds classified error logging + friendly stderr.
safeRun(main, { hookName: "aegis-brain-graph/staleness", failOpen: true });
