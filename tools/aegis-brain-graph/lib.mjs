// tools/aegis-brain-graph/lib.mjs (sprint-v12-04)
//
// Shared helpers for the aegis-brain-graph toolkit:
//   - NDJSON read / write with atomic temp+rename
//   - Minimal frontmatter parser (no js-yaml dep)
//   - Deterministic stable-sort comparators for nodes + edges
//   - mtime helpers
//
// Design constraints (per Mega Plan v1.1 §5.2 + §8.1):
//   - Zero external deps (pure node + builtin fs / path)
//   - File-as-contract: NDJSON only, no SQLite
//   - Atomic via temp+rename — never a half-written graph
//
// Spec: AEGIS Knowledge-Layer Mega Plan v1.1, sprint v12-04 story A.

import fs from 'node:fs';
import path from 'node:path';

export const BUILDER_VERSION = '1.0.0';

// ─── NDJSON read/write ─────────────────────────────────────────────────────

export function writeNdjson(filePath, records) {
  // Each record on its own line; trailing newline; LF line endings.
  const body = records.map((r) => JSON.stringify(r)).join('\n') + (records.length ? '\n' : '');
  fs.writeFileSync(filePath, body);
}

export function readNdjson(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const body = fs.readFileSync(filePath, 'utf8');
  if (body.length === 0) return [];
  return body
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

// ─── Atomic write trio (nodes + edges + meta) ──────────────────────────────
//
// Writes 3 files atomically: each is staged as <name>.tmp with fsync, then
// renamed in sequence. A crash before the first rename leaves the previous
// graph intact; a crash between renames produces a transient inconsistency
// that the next --full rebuild fixes (acceptable).

export function writeGraphAtomic(graphDir, { nodes, edges, meta }) {
  fs.mkdirSync(graphDir, { recursive: true });
  const targets = [
    { tmp: path.join(graphDir, 'nodes.ndjson.tmp'), final: path.join(graphDir, 'nodes.ndjson'), payload: ndjsonOf(nodes) },
    { tmp: path.join(graphDir, 'edges.ndjson.tmp'), final: path.join(graphDir, 'edges.ndjson'), payload: ndjsonOf(edges) },
    { tmp: path.join(graphDir, 'meta.json.tmp'),    final: path.join(graphDir, 'meta.json'),    payload: JSON.stringify(meta, null, 2) + '\n' },
  ];
  // Stage all three first, fsync each, THEN rename in sequence.
  for (const t of targets) {
    const fd = fs.openSync(t.tmp, 'w');
    try {
      fs.writeFileSync(fd, t.payload);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  }
  for (const t of targets) {
    fs.renameSync(t.tmp, t.final);
  }
}

function ndjsonOf(records) {
  if (records.length === 0) return '';
  return records.map((r) => JSON.stringify(r)).join('\n') + '\n';
}

// ─── Sort comparators (deterministic byte-equal output) ────────────────────

export function compareNodes(a, b) {
  if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  return 0;
}

export function compareEdges(a, b) {
  if (a.src !== b.src) return a.src < b.src ? -1 : 1;
  if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
  if (a.dst !== b.dst) return a.dst < b.dst ? -1 : 1;
  return 0;
}

// ─── Minimal YAML frontmatter parser (single + multi-line shapes) ──────────
//
// Recognizes:
//   key: <scalar>
//   key: <inline-array>          → ["a", "b"]
//   key: []                      → empty array
//   key:
//     - item                     → multi-line array
//     - item
//   key:
//     en: [...]                  → nested 1-level map
//     th: [...]
//
// Returns a flat object with `triggers.en` etc as nested arrays where present.

export function parseFrontmatter(content) {
  const lines = content.split('\n');
  if (lines[0] !== '---') return null;
  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') { endIdx = i; break; }
  }
  if (endIdx === -1) return null;
  const fmLines = lines.slice(1, endIdx);
  const result = {};
  let currentKey = null;
  let currentArray = null;
  let currentMap = null;
  for (const raw of fmLines) {
    if (raw.length === 0) continue;
    // Top-level key: starts at column 0
    const m = raw.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
    if (m && !raw.startsWith(' ') && !raw.startsWith('\t')) {
      const [, key, val] = m;
      currentKey = key;
      currentArray = null;
      currentMap = null;
      if (val.length === 0) {
        // multi-line follows — could be array or map
        result[key] = null; // tentative
      } else if (val === '[]') {
        result[key] = [];
      } else if (val.startsWith('[') && val.endsWith(']')) {
        // inline array — split by comma, trim quotes
        result[key] = parseInlineArray(val);
      } else if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        result[key] = val.slice(1, -1);
      } else if (val === 'true') {
        result[key] = true;
      } else if (val === 'false') {
        result[key] = false;
      } else if (!isNaN(Number(val)) && val.trim() !== '') {
        result[key] = Number(val);
      } else {
        result[key] = val;
      }
    } else if (raw.match(/^\s+-\s+/) && currentKey) {
      // multi-line array item
      const itemMatch = raw.match(/^\s+-\s+(.*)$/);
      const item = itemMatch[1].trim();
      const cleaned = (item.startsWith('"') && item.endsWith('"')) || (item.startsWith("'") && item.endsWith("'"))
        ? item.slice(1, -1)
        : item;
      if (!Array.isArray(result[currentKey])) result[currentKey] = [];
      result[currentKey].push(cleaned);
    } else if (raw.match(/^\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*:/) && currentKey) {
      // nested map (one level deep)
      const subMatch = raw.match(/^\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
      const [, subKey, subVal] = subMatch;
      if (typeof result[currentKey] !== 'object' || result[currentKey] === null || Array.isArray(result[currentKey])) {
        result[currentKey] = {};
      }
      if (subVal === '[]') {
        result[currentKey][subKey] = [];
      } else if (subVal.startsWith('[') && subVal.endsWith(']')) {
        result[currentKey][subKey] = parseInlineArray(subVal);
      } else {
        result[currentKey][subKey] = subVal;
      }
    }
  }
  return result;
}

function parseInlineArray(val) {
  // Strip [ and ]
  const inner = val.slice(1, -1).trim();
  if (inner.length === 0) return [];
  // Split by comma, but be cautious about commas inside quoted strings.
  const items = [];
  let buf = '';
  let inQuote = null;
  for (const ch of inner) {
    if (inQuote) {
      if (ch === inQuote) {
        items.push(buf);
        buf = '';
        inQuote = null;
      } else {
        buf += ch;
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = ch;
    } else if (ch === ',') {
      const trimmed = buf.trim();
      if (trimmed.length > 0) items.push(trimmed);
      buf = '';
    } else {
      buf += ch;
    }
  }
  const trimmed = buf.trim();
  if (trimmed.length > 0) items.push(trimmed);
  return items;
}

// ─── mtime helpers ─────────────────────────────────────────────────────────

export function mtimeOf(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

export function maxMtime(paths) {
  let m = 0;
  for (const p of paths) {
    const t = mtimeOf(p);
    if (t > m) m = t;
  }
  return m;
}

// ─── ID helpers ────────────────────────────────────────────────────────────

export function nodeId(kind, name) {
  return `${kind}:${name}`;
}

// ─── Walk helpers ──────────────────────────────────────────────────────────

export function listFiles(dir, opts = {}) {
  const { ext = null, recursive = false } = opts;
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const visit = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        if (recursive) visit(full);
      } else if (entry.isFile()) {
        if (!ext || full.endsWith(ext)) out.push(full);
      }
    }
  };
  visit(dir);
  return out.sort();
}
