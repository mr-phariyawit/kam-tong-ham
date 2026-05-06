#!/usr/bin/env node
// mt.mjs — single-binary CLI for aegis-multi-tenant (sprint v11-09)
//
// Subcommands:
//   register --path <p> [--name <n>] [--role <r>]
//   list   [--json]
//   where  <name>
//   activity --all-projects [--since <Nd|YYYY-MM-DD>] [--limit N] [--json]
//   issues   --all-projects [--status <s>] [--json]
//   help
//
// Storage: ~/.aegis-plus/projects.yaml

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import readline from "node:readline";

const HOME       = os.homedir();
const REGISTRY_DIR  = path.join(HOME, ".aegis-plus");
const REGISTRY_FILE = path.join(REGISTRY_DIR, "projects.yaml");

// ── tiny YAML helpers (project-list scope only) ───────────────────────
function parseRegistry(text) {
  const out = { projects: [] };
  const lines = String(text).split(/\r?\n/);
  let i = 0;
  while (i < lines.length && !/^projects:\s*$/.test(lines[i])) i++;
  i++;
  while (i < lines.length) {
    const line = lines[i];
    if (/^[A-Za-z_]/.test(line)) break;
    if (!line.trim() || /^\s*#/.test(line)) { i++; continue; }
    const start = line.match(/^\s+- (\w+):\s*(.*)$/);
    if (!start) { i++; continue; }
    const obj = {};
    obj[start[1]] = stripQ(start[2]);
    i++;
    while (i < lines.length) {
      const sub = lines[i].match(/^\s{4,}(\w+):\s*(.*)$/);
      if (!sub) break;
      obj[sub[1]] = stripQ(sub[2]);
      i++;
    }
    out.projects.push(obj);
  }
  return out;
}

function stripQ(v) {
  if (typeof v !== "string") return v;
  v = v.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

function ymlScalar(v) {
  v = String(v == null ? "" : v);
  if (v === "" || /[:#&*!|>'"`{}\[\],?\s]/.test(v) || /^[-?]/.test(v)) {
    return '"' + v.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  }
  return v;
}

function emitRegistry(reg) {
  const out = ["projects:"];
  for (const p of reg.projects || []) {
    out.push(`  - name: ${ymlScalar(p.name)}`);
    out.push(`    path: ${ymlScalar(p.path)}`);
    if (p.role) out.push(`    role: ${ymlScalar(p.role)}`);
  }
  return out.join("\n") + "\n";
}

function loadRegistry() {
  if (!fs.existsSync(REGISTRY_FILE)) return { projects: [] };
  try { return parseRegistry(fs.readFileSync(REGISTRY_FILE, "utf8")); }
  catch { return { projects: [] }; }
}

function saveRegistry(reg) {
  fs.mkdirSync(REGISTRY_DIR, { recursive: true });
  fs.writeFileSync(REGISTRY_FILE, emitRegistry(reg));
}

// ── arg parsing ───────────────────────────────────────────────────────
function parseFlags(argv) {
  const BOOL = new Set(["all-projects", "json"]);
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

// ── helpers ───────────────────────────────────────────────────────────
function readVersion(p) {
  // Prefer AEGIS_VERSION (the installed pin written by install.sh).
  const pin = path.join(p, "AEGIS_VERSION");
  if (fs.existsSync(pin)) return fs.readFileSync(pin, "utf8").trim();
  // Fall back to top-level VERSION ONLY if this looks like the meta source
  // repo (has install.sh + a top-level VERSION file). Other projects often
  // have an unrelated VERSION file (e.g. their app's semver) that would be
  // misleading to show as the AEGIS version.
  const isMeta = fs.existsSync(path.join(p, "install.sh"))
              && fs.existsSync(path.join(p, "CLAUDE.md"));
  if (isMeta) {
    const v = path.join(p, "VERSION");
    if (fs.existsSync(v)) return fs.readFileSync(v, "utf8").trim() + " (meta)";
  }
  return "?";
}

function projectsExist(reg) {
  return reg.projects.map(p => ({ ...p, exists: fs.existsSync(p.path) }));
}

// ── subcommands ───────────────────────────────────────────────────────
function cmdRegister(flags) {
  const p = flags.path;
  if (!p) die("register requires --path");
  const abs = path.resolve(p);
  if (!fs.existsSync(abs)) die(`no such directory: ${abs}`);
  if (!fs.existsSync(path.join(abs, ".aegis"))) die(`not an AEGIS project (no .aegis/): ${abs}`);
  const name = flags.name || path.basename(abs);
  const role = flags.role || "";
  const reg = loadRegistry();
  if (reg.projects.find(x => x.name === name)) die(`already registered: ${name}`);
  if (reg.projects.find(x => path.resolve(x.path) === abs)) die(`already registered (different name): ${abs}`);
  reg.projects.push({ name, path: abs, role });
  saveRegistry(reg);
  console.log(`registered: ${name} → ${abs}${role ? ` [${role}]` : ""}`);
}

function cmdList(flags) {
  const reg = loadRegistry();
  const enriched = projectsExist(reg).map(p => ({
    ...p,
    version: p.exists ? readVersion(p.path) : null,
  }));
  if (flags.json) { process.stdout.write(JSON.stringify(enriched, null, 2) + "\n"); return; }
  if (enriched.length === 0) { console.log("(no projects registered)"); return; }
  const w = (s, n) => String(s ?? "").padEnd(n).slice(0, n);
  // VERSION is 14 wide so "11.0 (meta)" (11 chars) and future "11.5-rc1 (meta)" fit cleanly.
  console.log(`${w("NAME", 22)} ${w("ROLE", 12)} ${w("VERSION", 14)} ${w("EXISTS", 6)} PATH`);
  for (const p of enriched) {
    console.log(`${w(p.name, 22)} ${w(p.role, 12)} ${w(p.version || "-", 14)} ${w(p.exists ? "yes" : "no", 6)} ${p.path}`);
  }
}

function cmdWhere(flags) {
  const name = flags._[1];
  if (!name) die("where requires <name>");
  const reg = loadRegistry();
  const p = reg.projects.find(x => x.name === name);
  if (!p) die(`no such project: ${name}`);
  console.log(p.path);
}

async function cmdActivity(flags) {
  if (!flags["all-projects"]) die("activity requires --all-projects");
  const reg = projectsExist(loadRegistry());
  const sinceDate = parseSinceDate(flags.since);
  const limit = parseInt(flags.limit || "0", 10) || 0;
  const records = [];

  for (const p of reg) {
    if (!p.exists) continue;
    const dir = path.join(p.path, ".aegis/brain/activity");
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).sort()) {
      if (!/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)) continue;
      if (sinceDate && f.slice(0, 10) < sinceDate) continue;
      const fp = path.join(dir, f);
      const lines = fs.readFileSync(fp, "utf8").split("\n").filter(l => l.trim());
      for (const line of lines) {
        let r; try { r = JSON.parse(line); } catch { continue; }
        records.push({ project: p.name, ...r });
      }
    }
  }

  records.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  const sliced = limit > 0 ? records.slice(-limit) : records;

  if (flags.json) { process.stdout.write(JSON.stringify(sliced, null, 2) + "\n"); return; }
  for (const r of sliced) {
    const ts = String(r.ts || "").slice(11, 19);
    const persona = String(r.persona || "?").padEnd(14).slice(0, 14);
    const tool = String(r.tool || "?").padEnd(6).slice(0, 6);
    const project = String(r.project).padEnd(15).slice(0, 15);
    const target = String(r.target || "").slice(0, 60);
    console.log(`${ts} [${persona}] ${tool} {${project}} ${target}`);
  }
  if (sliced.length === 0) console.log("(no activity matches)");
}

async function cmdIssues(flags) {
  if (!flags["all-projects"]) die("issues requires --all-projects");
  const reg = projectsExist(loadRegistry());
  const wanted = flags.status;
  const all = [];
  for (const p of reg) {
    if (!p.exists) continue;
    const dir = path.join(p.path, ".aegis/brain/issues");
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".yaml") || f.startsWith("_")) continue;
      const fp = path.join(dir, f);
      const text = fs.readFileSync(fp, "utf8");
      const status = (text.match(/^status:\s*(.*)$/m) || [])[1]?.trim().replace(/['"]/g, "") || "todo";
      const title  = (text.match(/^title:\s*(.*)$/m) || [])[1]?.trim().replace(/['"]/g, "") || "";
      const assignee = (text.match(/^assignee:\s*(.*)$/m) || [])[1]?.trim().replace(/['"]/g, "") || "";
      if (wanted && status !== wanted) continue;
      all.push({ project: p.name, id: f.replace(/\.yaml$/, ""), status, title, assignee });
    }
  }
  if (flags.json) { process.stdout.write(JSON.stringify(all, null, 2) + "\n"); return; }
  if (all.length === 0) { console.log("(no issues match)"); return; }
  const w = (s, n) => String(s ?? "").padEnd(n).slice(0, n);
  console.log(`${w("PROJECT", 16)} ${w("ID", 14)} ${w("STATUS", 12)} ${w("ASSIGNEE", 14)} TITLE`);
  for (const r of all) {
    console.log(`${w(r.project, 16)} ${w(r.id, 14)} ${w(r.status, 12)} ${w(r.assignee, 14)} ${r.title}`);
  }
}

function help() {
  process.stdout.write(`Usage: mt.mjs <subcommand> [flags]

Subcommands:
  register --path <p> [--name <n>] [--role <r>]
  list     [--json]
  where    <name>
  activity --all-projects [--since <Nd|YYYY-MM-DD>] [--limit N] [--json]
  issues   --all-projects [--status <s>] [--json]
  help

Registry: ${REGISTRY_FILE}
`);
}

function die(msg) { process.stderr.write(`error: ${msg}\n`); process.exit(2); }

function parseSinceDate(s) {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = String(s).match(/^(\d+)d$/);
  if (!m) return null;
  return new Date(Date.now() - parseInt(m[1], 10) * 86_400_000).toISOString().slice(0, 10);
}

// ── main ──────────────────────────────────────────────────────────────
const flags = parseFlags(process.argv.slice(2));
const sub = flags._[0];
switch (sub) {
  case "register": cmdRegister(flags); break;
  case "list":     cmdList(flags); break;
  case "where":    cmdWhere(flags); break;
  case "activity": await cmdActivity(flags); break;
  case "issues":   await cmdIssues(flags); break;
  case "help": case undefined: case "-h": case "--help": help(); break;
  default: process.stderr.write(`unknown subcommand: ${sub}\n`); help(); process.exit(2);
}
