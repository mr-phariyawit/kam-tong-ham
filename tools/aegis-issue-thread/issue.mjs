#!/usr/bin/env node
// issue.mjs — single-binary CLI for aegis-issue-thread (sprint v11-03)
//
// Subcommands:
//   create  --title <t> [--assignee <a>] [--parent <ID>] [--status <s>]
//   update  <ID> --status <s> | --assignee <a> | --title <t>
//   comment <ID> --by <a> --body <text>
//   link    <ID> --type file|pr|url --value <v>
//   list    [--status <s>] [--assignee <a>] [--limit <N>] [--json]
//   show    <ID>
//   help
//
// Storage layout:
//   .aegis/brain/issues/_config.yaml           prefix (default KTH)
//   .aegis/brain/issues/_index.yaml            counter + status_by_id map
//   .aegis/brain/issues/<PREFIX>-<N>.yaml      one issue per file
//
// YAML handling: scoped emitter/parser for the known schema. Comment bodies
// stored as YAML literal-block scalars (`|`) so multi-line / special-char
// bodies survive round-trip without external dep.

import fs from "node:fs";
import path from "node:path";

const PROJECT_DIR  = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const ISSUES_DIR   = path.join(PROJECT_DIR, ".aegis/brain/issues");
const CONFIG_FILE  = path.join(ISSUES_DIR, "_config.yaml");
const INDEX_FILE   = path.join(ISSUES_DIR, "_index.yaml");
const STATUSES = new Set(["todo","in_progress","blocked","review","done","cancelled"]);

function nowISO() { return new Date().toISOString(); }

function ensureDirs() { fs.mkdirSync(ISSUES_DIR, { recursive: true }); }

// ── tiny YAML helpers ────────────────────────────────────────────────────────
function ymlString(s) {
  // Quote with double-quotes if the string would otherwise be ambiguous.
  if (s == null) return '""';
  s = String(s);
  if (s === "") return '""';
  if (/[:#&*!|>'"%@`{}\[\],?\n\r\t]/.test(s) || /^[\s-]/.test(s) || /[\s]$/.test(s)
      || /^(true|false|null|yes|no|on|off)$/i.test(s) || /^\d/.test(s) && !/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n") + '"';
  }
  return s;
}
function ymlBlock(s) {
  // Literal block for multi-line; preserves newlines.
  const indent = "    ";
  return "|\n" + String(s).split("\n").map(l => indent + l).join("\n");
}
function emitIssue(rec) {
  const lines = [];
  lines.push(`id: ${ymlString(rec.id)}`);
  lines.push(`title: ${ymlString(rec.title || "")}`);
  lines.push(`status: ${ymlString(rec.status || "todo")}`);
  lines.push(`assignee: ${ymlString(rec.assignee || "")}`);
  lines.push(`created: ${ymlString(rec.created || nowISO())}`);
  lines.push(`updated: ${ymlString(rec.updated || rec.created || nowISO())}`);
  if (rec.parent)   lines.push(`parent: ${ymlString(rec.parent)}`);
  if (rec.children?.length) {
    lines.push(`children:`);
    for (const c of rec.children) lines.push(`  - ${ymlString(c)}`);
  }
  if (rec.comments?.length) {
    lines.push(`comments:`);
    for (const c of rec.comments) {
      lines.push(`  - by: ${ymlString(c.by)}`);
      lines.push(`    ts: ${ymlString(c.ts)}`);
      lines.push(`    body: ${ymlBlock(c.body || "")}`);
    }
  }
  if (rec.links?.length) {
    lines.push(`links:`);
    for (const l of rec.links) {
      lines.push(`  - type: ${ymlString(l.type)}`);
      lines.push(`    value: ${ymlString(l.value)}`);
    }
  }
  return lines.join("\n") + "\n";
}

function parseScalarField(text, key) {
  const m = text.match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
  if (!m) return null;
  let v = m[1].trim();
  if (v.startsWith('"') && v.endsWith('"')) {
    v = v.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return v;
}
function parseListSection(text, key) {
  const re = new RegExp(`^${key}:\\s*\\n((?:\\s+- .*\\n?)+)`, "m");
  const m = text.match(re);
  if (!m) return [];
  return m[1].split("\n")
    .map(l => l.trim())
    .filter(l => l.startsWith("- "))
    .map(l => {
      let v = l.slice(2).trim();
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      return v;
    });
}
// Parse a small subset of structured arrays (comments, links).
function parseObjectArray(text, key) {
  const re = new RegExp(`^${key}:\\s*\\n((?:[ ]{2,}.*\\n)+)`, "m");
  const m = text.match(re);
  if (!m) return [];
  // Split into entries by lines starting "  - "
  const lines = m[1].split("\n");
  const entries = [];
  let cur = null;
  let inBlock = false;
  let blockKey = null;
  let blockLines = [];
  for (const line of lines) {
    if (/^  - /.test(line)) {
      if (cur) {
        if (blockKey !== null) cur[blockKey] = blockLines.join("\n");
        entries.push(cur);
      }
      cur = {};
      inBlock = false; blockKey = null; blockLines = [];
      const rest = line.slice(4);
      addKeyVal(cur, rest);
    } else if (cur) {
      const trimmed = line.replace(/^    /, "");
      if (inBlock) {
        if (line.startsWith("    ")) { blockLines.push(line.slice(4)); continue; }
        cur[blockKey] = blockLines.join("\n");
        inBlock = false; blockKey = null; blockLines = [];
      }
      const m2 = trimmed.match(/^(\w+):\s*(.*)$/);
      if (m2) {
        const k = m2[1], v = m2[2];
        if (v === "|") { inBlock = true; blockKey = k; blockLines = []; }
        else { cur[k] = unquote(v); }
      }
    }
  }
  if (cur) {
    if (blockKey !== null) cur[blockKey] = blockLines.join("\n");
    entries.push(cur);
  }
  return entries;
}
function addKeyVal(obj, line) {
  const m = line.match(/^(\w+):\s*(.*)$/);
  if (!m) return;
  obj[m[1]] = unquote(m[2]);
}
function unquote(v) {
  v = v.trim();
  if (v.startsWith('"') && v.endsWith('"')) {
    return v.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return v;
}

function parseIssue(text) {
  return {
    id:       parseScalarField(text, "id") || "",
    title:    parseScalarField(text, "title") || "",
    status:   parseScalarField(text, "status") || "todo",
    assignee: parseScalarField(text, "assignee") || "",
    created:  parseScalarField(text, "created") || "",
    updated:  parseScalarField(text, "updated") || "",
    parent:   parseScalarField(text, "parent") || "",
    children: parseListSection(text, "children"),
    comments: parseObjectArray(text, "comments"),
    links:    parseObjectArray(text, "links"),
  };
}

// ── config + index ───────────────────────────────────────────────────────────
function loadConfig() {
  ensureDirs();
  if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, "prefix: KTH\n");
  }
  const t = fs.readFileSync(CONFIG_FILE, "utf8");
  return { prefix: parseScalarField(t, "prefix") || "KTH" };
}
function loadIndex() {
  ensureDirs();
  if (!fs.existsSync(INDEX_FILE)) return { last_n: 0, ids: [] };
  const t = fs.readFileSync(INDEX_FILE, "utf8");
  const last_n = parseInt(parseScalarField(t, "last_n") || "0", 10) || 0;
  const ids = parseListSection(t, "ids");
  return { last_n, ids };
}
function saveIndex(idx) {
  let out = `last_n: ${idx.last_n}\n`;
  if (idx.ids?.length) {
    out += "ids:\n";
    for (const id of idx.ids) out += `  - ${id}\n`;
  }
  fs.writeFileSync(INDEX_FILE, out);
}
function issuePath(id) { return path.join(ISSUES_DIR, `${id}.yaml`); }
function loadIssue(id) {
  if (!fs.existsSync(issuePath(id))) return null;
  return parseIssue(fs.readFileSync(issuePath(id), "utf8"));
}
function saveIssue(rec) { fs.writeFileSync(issuePath(rec.id), emitIssue(rec)); }

// ── arg parsing ──────────────────────────────────────────────────────────────
function parseFlags(argv) {
  const BOOL = new Set(["json"]);
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      if (BOOL.has(k)) { out[k] = true; continue; }
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) { out[k] = true; }
      else { out[k] = next; i++; }
    } else {
      out._.push(a);
    }
  }
  return out;
}

// ── subcommands ──────────────────────────────────────────────────────────────
function cmdCreate(flags) {
  const cfg = loadConfig();
  const idx = loadIndex();
  const n = idx.last_n + 1;
  const id = `${cfg.prefix}-${n}`;
  const status = flags.status || "todo";
  if (!STATUSES.has(status)) die(`invalid status: ${status}`);
  const rec = {
    id,
    title: flags.title || "",
    status,
    assignee: flags.assignee || process.env.AEGIS_PERSONA || "",
    created: nowISO(),
    updated: nowISO(),
    parent: flags.parent || "",
    children: [],
    comments: [],
    links: [],
  };
  saveIssue(rec);
  idx.last_n = n;
  idx.ids = [...(idx.ids || []), id];
  saveIndex(idx);
  console.log(id);
}

function cmdUpdate(flags) {
  const id = flags._[1];
  if (!id) die("update requires an issue ID");
  const rec = loadIssue(id);
  if (!rec) die(`no such issue: ${id}`);
  if (flags.status) {
    if (!STATUSES.has(flags.status)) die(`invalid status: ${flags.status}`);
    rec.status = flags.status;
  }
  if (flags.assignee !== undefined) rec.assignee = flags.assignee;
  if (flags.title    !== undefined) rec.title    = flags.title;
  rec.updated = nowISO();
  saveIssue(rec);
  console.log(`updated ${id}`);
}

function cmdComment(flags) {
  const id = flags._[1];
  if (!id) die("comment requires an issue ID");
  const fp = issuePath(id);
  if (!fs.existsSync(fp)) die(`no such issue: ${id}`);
  const by = flags.by || process.env.AEGIS_PERSONA || "anonymous";
  const body = flags.body || "";
  // True append-friendly: read, mutate, write — but in production the
  // append happens at the end of the file and won't disturb earlier bytes
  // in a way that produces large diffs.
  const rec = parseIssue(fs.readFileSync(fp, "utf8"));
  rec.comments.push({ by, ts: nowISO(), body });
  rec.updated = nowISO();
  saveIssue(rec);
  console.log(`comment added to ${id}`);
}

function cmdLink(flags) {
  const id = flags._[1];
  if (!id) die("link requires an issue ID");
  const rec = loadIssue(id);
  if (!rec) die(`no such issue: ${id}`);
  const type = flags.type;
  const value = flags.value;
  if (!type || !value) die("link requires --type <file|pr|url> --value <v>");
  if (!["file","pr","url"].includes(type)) die(`invalid link type: ${type}`);
  rec.links.push({ type, value });
  rec.updated = nowISO();
  saveIssue(rec);
  console.log(`link added to ${id}`);
}

function cmdList(flags) {
  const idx = loadIndex();
  const out = [];
  for (const id of idx.ids || []) {
    const rec = loadIssue(id);
    if (!rec) continue;
    if (flags.status && rec.status !== flags.status) continue;
    if (flags.assignee && rec.assignee !== flags.assignee) continue;
    out.push(rec);
  }
  const limit = parseInt(flags.limit || "0", 10) || 0;
  const sliced = limit > 0 ? out.slice(0, limit) : out;
  if (flags.json) { process.stdout.write(JSON.stringify(sliced, null, 2) + "\n"); return; }
  for (const r of sliced) {
    process.stdout.write(`${r.id.padEnd(10)} [${r.status.padEnd(11)}] ${r.assignee.padEnd(14)} ${r.title}\n`);
  }
  if (sliced.length === 0) process.stderr.write("(no issues match)\n");
}

function cmdShow(flags) {
  const id = flags._[1];
  if (!id) die("show requires an issue ID");
  const rec = loadIssue(id);
  if (!rec) die(`no such issue: ${id}`);
  process.stdout.write(emitIssue(rec));
}

function help() {
  process.stdout.write(`Usage: aegis-issue-thread <subcommand> [flags]

Subcommands:
  create   --title <t> [--assignee <a>] [--parent <ID>] [--status <s>]
  update   <ID> [--status <s>] [--assignee <a>] [--title <t>]
  comment  <ID> --body <text> [--by <author>]
  link     <ID> --type file|pr|url --value <v>
  list     [--status <s>] [--assignee <a>] [--limit <N>] [--json]
  show     <ID>
  help

Storage: .aegis/brain/issues/<PREFIX>-<N>.yaml (PREFIX from _config.yaml; default KTH)

Status enum: todo | in_progress | blocked | review | done | cancelled
`);
}

function die(msg) { process.stderr.write(`error: ${msg}\n`); process.exit(2); }

// ── main ─────────────────────────────────────────────────────────────────────
const flags = parseFlags(process.argv.slice(2));
const sub = flags._[0];
switch (sub) {
  case "create":   cmdCreate(flags); break;
  case "update":   cmdUpdate(flags); break;
  case "comment":  cmdComment(flags); break;
  case "link":     cmdLink(flags); break;
  case "list":     cmdList(flags); break;
  case "show":     cmdShow(flags); break;
  case "help": case undefined: case "-h": case "--help": help(); break;
  default: process.stderr.write(`unknown subcommand: ${sub}\n`); help(); process.exit(2);
}
