// lib.mjs — shared helpers for aegis-resume

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

export const STATE_REL = ".aegis/brain/state";
export const RUNS_REL  = ".aegis/brain/runs";

export function statePath(projectDir, sessionId) {
  return path.join(projectDir, STATE_REL, `${sessionId}.yaml`);
}

// ── tiny YAML helpers (scoped to checkpoint schema) ───────────────────
export function emitCheckpoint(rec) {
  const lines = [];
  for (const k of ["session_id", "ts", "branch", "persona", "task", "last_commit"]) {
    if (rec[k] != null && rec[k] !== "") lines.push(`${k}: ${ymlScalar(rec[k])}`);
  }
  if (Array.isArray(rec.dirty_files) && rec.dirty_files.length) {
    lines.push("dirty_files:");
    for (const f of rec.dirty_files) lines.push(`  - ${ymlScalar(f)}`);
  }
  return lines.join("\n") + "\n";
}

export function parseCheckpoint(text) {
  const out = { dirty_files: [] };
  const lines = String(text).split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) { i++; continue; }
    const m = line.match(/^([\w_]+):\s*(.*)$/);
    if (m) {
      const k = m[1], v = m[2];
      if (v === "") {
        // list
        const arr = [];
        i++;
        while (i < lines.length) {
          const item = lines[i].match(/^\s+- (.*)$/);
          if (!item) break;
          arr.push(stripQ(item[1]));
          i++;
        }
        out[k] = arr;
        continue;
      } else {
        out[k] = stripQ(v);
      }
    }
    i++;
  }
  return out;
}

function ymlScalar(v) {
  v = String(v == null ? "" : v);
  if (v === "" || /[:#&*!|>'"`{}\[\],?\s]/.test(v) || /^[-?]/.test(v)) {
    return '"' + v.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  }
  return v;
}

function stripQ(v) {
  if (typeof v !== "string") return v;
  v = v.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

// ── git snapshot helpers ──────────────────────────────────────────────
export function gitSnapshot(projectDir) {
  const env = { cwd: projectDir, encoding: "utf8" };
  const safe = (cmd) => { try { return execSync(cmd, env).trim(); } catch { return ""; } };
  return {
    branch:      safe("git rev-parse --abbrev-ref HEAD 2>/dev/null"),
    last_commit: safe("git rev-parse --short HEAD 2>/dev/null"),
    dirty_files: safe("git status --porcelain 2>/dev/null")
                  .split("\n")
                  .filter(l => l.trim())
                  .map(l => l.replace(/^...\s*/, "").trim())
                  .slice(0, 50),
  };
}

// ── checkpoint store ──────────────────────────────────────────────────
export function listCheckpoints(projectDir) {
  const dir = path.join(projectDir, STATE_REL);
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".yaml")) continue;
    const fp = path.join(dir, f);
    try {
      const rec = parseCheckpoint(fs.readFileSync(fp, "utf8"));
      out.push({ ...rec, _path: fp, _file: f });
    } catch {}
  }
  return out;
}

// A checkpoint is "archived" (cleanly stopped) iff a v11-07 run-logger
// archive exists for the same session_id.
export function isArchived(projectDir, sessionId) {
  const runsDir = path.join(projectDir, RUNS_REL);
  if (!fs.existsSync(runsDir)) return false;
  for (const d of fs.readdirSync(runsDir)) {
    // Run dir naming: YYYY-MM-DD-<session>
    if (d.endsWith(`-${sessionId}`) || d.includes(sessionId)) return true;
  }
  return false;
}

export function annotateCheckpoints(projectDir, list) {
  return list.map(c => ({
    ...c,
    archived: isArchived(projectDir, c.session_id),
  }));
}
