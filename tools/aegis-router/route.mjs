#!/usr/bin/env node
// route.mjs — pick subagent model tier based on quality fit
//
// Usage:
//   route.mjs --task "review SPEC.md" [--persona iron-man] [--model opus] [--json]
//
// Output (default text):
//   picked: opus
//   reason: Architecture + spec design needs deep reasoning over trade-offs
//   rule:   architecture-opus
//
// Output (--json):
//   {"picked":"opus","reason":"...","rule":"architecture-opus","override":false}
//
// Manual override: --model X forces X regardless of policy. Logged with
// override=true so the audit trail captures operator intent.

import fs from "node:fs";
import path from "node:path";

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const SCRIPT_DIR  = path.dirname(new URL(import.meta.url).pathname);
const META_DIR    = path.resolve(SCRIPT_DIR, "../..");
const POLICY_REL  = ".aegis/brain/routing/policy.yaml";
const AUDIT_REL   = ".aegis/brain/logs/routing-audit.log";

// ── tiny YAML reader (scoped to our schema) ───────────────────────────
// Reuses the parser shape from aegis-approval-gate but inlined to keep
// route.mjs self-contained (hot CLI; minimize cross-file resolution).
function parseYaml(text) {
  const out = { rules: [], default: null };
  const lines = String(text).split(/\r?\n/);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) { i++; continue; }

    const top = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!top) { i++; continue; }
    const key = top[1];
    const inline = top[2];

    if (key === "rules" || key === "default") {
      // For 'default', it's a single object. For 'rules', it's a list of objects.
      if (key === "default") {
        const obj = {};
        i++;
        while (i < lines.length) {
          const sub = lines[i];
          if (/^[A-Za-z_]/.test(sub)) break;
          const m = sub.match(/^\s+([\w-]+):\s*(.*)$/);
          if (m) obj[m[1]] = stripQuotes(m[2]);
          i++;
        }
        out.default = obj;
      } else {
        // list of rule objects
        const items = [];
        i++;
        while (i < lines.length) {
          const child = lines[i];
          if (/^[A-Za-z_]/.test(child)) break;
          if (!child.trim()) { i++; continue; }
          const startItem = child.match(/^\s+- ([\w-]+):\s*(.*)$/);
          if (!startItem) { i++; continue; }

          const obj = {};
          obj[startItem[1]] = parseScalarOrList(startItem[2], lines, i);
          // If parseScalarOrList returned a list, lines are consumed; otherwise just one line
          if (Array.isArray(obj[startItem[1]])) {
            // advance i past the consumed list block
            i++;
            while (i < lines.length && /^\s+- /.test(lines[i])) i++;
          } else {
            obj[startItem[1]] = stripQuotes(startItem[2]);
            i++;
          }
          // collect subsequent fields of this rule entry (indented same as the key)
          while (i < lines.length) {
            const sub = lines[i];
            const sm = sub.match(/^\s{4,}([\w-]+):\s*(.*)$/);
            if (!sm) break;
            const subKey = sm[1];
            const subVal = sm[2];
            if (subVal === "" || subVal === undefined) {
              // nested list? next lines should be `      - item`
              i++;
              const arr = [];
              while (i < lines.length) {
                const ln = lines[i];
                const it = ln.match(/^\s{6,}- (.*)$/);
                if (!it) break;
                arr.push(stripQuotes(it[1]));
                i++;
              }
              obj[subKey] = arr;
            } else {
              // could be inline list "[a, b]" or scalar
              if (subVal.startsWith("[") && subVal.endsWith("]")) {
                obj[subKey] = subVal.slice(1, -1).split(",").map(s => stripQuotes(s.trim()));
              } else {
                obj[subKey] = stripQuotes(subVal);
              }
              i++;
            }
          }
          items.push(obj);
        }
        out.rules = items;
      }
    } else {
      i++;
    }
  }
  return out;
}

function parseScalarOrList(_inline, _lines, _i) {
  // Stub for the simpler path where rule entry starts with `- name: foo`
  return null; // we always treat it as scalar above
}

function stripQuotes(v) {
  if (typeof v !== "string") return v;
  v = v.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

// ── policy loader ─────────────────────────────────────────────────────
function loadPolicy() {
  const candidates = [
    path.join(PROJECT_DIR, POLICY_REL),
    path.join(META_DIR, POLICY_REL),
  ];
  for (const fp of candidates) {
    if (fs.existsSync(fp)) {
      try {
        const parsed = parseYaml(fs.readFileSync(fp, "utf8"));
        return { ...parsed, source: fp };
      } catch (e) {
        return { rules: [], default: { model: "sonnet", reason: "policy parse error" }, source: fp };
      }
    }
  }
  return {
    rules: [],
    default: { model: "sonnet", reason: "no policy file — using built-in default sonnet" },
    source: null,
  };
}

// ── matcher ───────────────────────────────────────────────────────────
function matches(rule, { task, persona }) {
  if (rule.when_persona) {
    const list = Array.isArray(rule.when_persona) ? rule.when_persona : [rule.when_persona];
    if (!persona) return false;
    if (!list.map(s => String(s).toLowerCase()).includes(String(persona).toLowerCase())) return false;
  }
  if (rule.when_keyword) {
    const list = Array.isArray(rule.when_keyword) ? rule.when_keyword : [rule.when_keyword];
    const t = String(task || "").toLowerCase();
    if (!list.some(k => t.includes(String(k).toLowerCase()))) return false;
  }
  if (rule.when_length) {
    if (String(task || "").length < parseInt(rule.when_length, 10)) return false;
  }
  if (rule.when_max_length) {
    if (String(task || "").length > parseInt(rule.when_max_length, 10)) return false;
  }
  return true;
}

// ── decide ────────────────────────────────────────────────────────────
function decide({ task, persona, override }, policy) {
  if (override) {
    return { picked: override, reason: "operator override (--model)", rule: null, override: true };
  }
  for (const rule of policy.rules || []) {
    if (matches(rule, { task, persona })) {
      return { picked: rule.model, reason: rule.reason || "(no reason)", rule: rule.name, override: false };
    }
  }
  const def = policy.default || { model: "sonnet", reason: "fallthrough default" };
  return { picked: def.model, reason: def.reason, rule: "default", override: false };
}

// ── audit ─────────────────────────────────────────────────────────────
function appendAudit(record) {
  try {
    const fp = path.join(PROJECT_DIR, AUDIT_REL);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.appendFileSync(fp, JSON.stringify({ ts: new Date().toISOString(), ...record }) + "\n");
  } catch {}
}

// ── arg parse ─────────────────────────────────────────────────────────
function parseArgs(argv) {
  const f = { task: "", persona: "", model: "", json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--task":    f.task    = argv[++i]; break;
      case "--persona": f.persona = argv[++i]; break;
      case "--model":   f.model   = argv[++i]; break;
      case "--json":    f.json    = true; break;
      case "-h": case "--help":
        process.stdout.write(`Usage: route.mjs --task "<text>" [--persona <name>] [--model <opus|sonnet|haiku>] [--json]

Picks subagent model tier based on quality fit.
Reads .aegis/brain/routing/policy.yaml (project) or falls back to meta default.
Writes one decision line to .aegis/brain/logs/routing-audit.log.
`);
        process.exit(0);
      default: process.stderr.write(`unknown flag: ${a}\n`); process.exit(2);
    }
  }
  return f;
}

// ── main ──────────────────────────────────────────────────────────────
const f = parseArgs(process.argv.slice(2));
const policy = loadPolicy();
const verdict = decide({ task: f.task, persona: f.persona, override: f.model || null }, policy);

appendAudit({
  task_summary: (f.task || "").slice(0, 120),
  persona: f.persona || "",
  picked: verdict.picked,
  reason: verdict.reason,
  rule: verdict.rule,
  override: verdict.override,
});

if (f.json) {
  process.stdout.write(JSON.stringify(verdict) + "\n");
} else {
  process.stdout.write(
    `picked: ${verdict.picked}\n` +
    `reason: ${verdict.reason}\n` +
    `rule:   ${verdict.rule || "(default)"}\n`
  );
}
