// lib.mjs — shared helpers for aegis-approval-gate
//
// Pure functions: rule loader, approval-marker reader, decision logic.
// No I/O wiring beyond fs reads. Used by check.mjs (hot path) and the
// grant/list/revoke CLIs.

import fs from "node:fs";
import path from "node:path";

export const APPROVALS_SUBDIR = ".aegis/brain/approvals";
export const RULES_FILE       = ".aegis/brain/gate-rules.yaml";
export const AUDIT_LOG        = ".aegis/brain/logs/approval-audit.log";

// ── tiny YAML reader (scoped to our schema) ───────────────────────────
// Schema is intentionally tiny: top-level scalar keys + a `rules:` or
// `scope:` list of either scalars or {name, regex, severity, note} maps.
// We do NOT attempt full YAML — just enough to round-trip our files.
export function parseYaml(text) {
  const out = { rules: [], scope: [] };
  const lines = String(text).split(/\r?\n/);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) { i++; continue; }

    const top = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (top) {
      const key = top[1];
      const val = top[2];
      if (val === "" || val === undefined) {
        // list or nested map — read children at greater indent
        const items = [];
        i++;
        while (i < lines.length) {
          const child = lines[i];
          if (/^[A-Za-z_]/.test(child)) break; // next top-level
          if (!child.trim()) { i++; continue; }
          const item = child.match(/^\s+- (.*)$/);
          if (item) {
            const v = item[1];
            // scalar list element OR start of map (key: val on same line)
            const m = v.match(/^([\w-]+):\s*(.*)$/);
            if (m && m[2] !== "") {
              const obj = { [m[1]]: stripQuotes(m[2]) };
              // collect subsequent indented "  key: val" lines under this entry
              i++;
              while (i < lines.length) {
                const sub = lines[i];
                const sm = sub.match(/^\s{4,}([\w-]+):\s*(.*)$/);
                if (!sm) break;
                obj[sm[1]] = stripQuotes(sm[2]);
                i++;
              }
              items.push(obj);
              continue;
            } else if (m && m[2] === "") {
              // map entry with no inline value — accept as object key with empty
              items.push({ [m[1]]: "" });
              i++;
              continue;
            } else {
              items.push(stripQuotes(v));
              i++;
              continue;
            }
          }
          i++;
        }
        out[key] = items;
      } else {
        out[key] = stripQuotes(val);
        i++;
      }
    } else {
      i++;
    }
  }
  return out;
}

function stripQuotes(v) {
  if (typeof v !== "string") return v;
  v = v.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

export function emitYaml(rec) {
  const lines = [];
  for (const k of Object.keys(rec)) {
    const v = rec[k];
    if (Array.isArray(v)) {
      if (v.length === 0) continue;
      lines.push(`${k}:`);
      for (const item of v) {
        if (typeof item === "string") lines.push(`  - ${ymlScalar(item)}`);
        else if (typeof item === "object") {
          const ks = Object.keys(item);
          lines.push(`  - ${ks[0]}: ${ymlScalar(item[ks[0]])}`);
          for (const k2 of ks.slice(1)) lines.push(`    ${k2}: ${ymlScalar(item[k2])}`);
        }
      }
    } else if (v != null && v !== "") {
      lines.push(`${k}: ${ymlScalar(v)}`);
    }
  }
  return lines.join("\n") + "\n";
}

function ymlScalar(v) {
  v = String(v == null ? "" : v);
  if (v === "" || /[:#&*!|>'"`{}\[\],?\s]/.test(v) || /^[-?]/.test(v)) {
    return '"' + v.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  }
  return v;
}

// ── rules loader ──────────────────────────────────────────────────────
export function loadRules(projectDir, fallbackDir) {
  const candidates = [
    path.join(projectDir, RULES_FILE),
    fallbackDir ? path.join(fallbackDir, RULES_FILE) : null,
  ].filter(Boolean);

  for (const fp of candidates) {
    if (fs.existsSync(fp)) {
      try {
        const parsed = parseYaml(fs.readFileSync(fp, "utf8"));
        const rules = Array.isArray(parsed.rules) ? parsed.rules.filter(r => r && r.name && r.regex) : [];
        return { rules, source: fp };
      } catch (e) {
        return { rules: [], source: fp, error: e.message };
      }
    }
  }
  return { rules: [], source: null };
}

// ── approval store ────────────────────────────────────────────────────
export function listApprovals(projectDir, now = new Date()) {
  const dir = path.join(projectDir, APPROVALS_SUBDIR);
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".yaml")) continue;
    const fp = path.join(dir, f);
    try {
      const obj = parseYaml(fs.readFileSync(fp, "utf8"));
      const expires = obj.expires_at ? new Date(obj.expires_at) : null;
      const expired = expires && !Number.isNaN(expires.getTime()) && expires.getTime() < now.getTime();
      out.push({
        id: f.replace(/\.yaml$/, ""),
        path: fp,
        task: obj.task || "",
        action: obj.action || "",
        approved_by: obj.approved_by || "",
        approved_at: obj.approved_at || "",
        expires_at: obj.expires_at || "",
        scope: Array.isArray(obj.scope) ? obj.scope : [],
        expired,
      });
    } catch {}
  }
  return out;
}

// ── decision ──────────────────────────────────────────────────────────
/**
 * Decide whether to allow a Bash command.
 *
 * Returns:
 *   { decision: "allow", reason: string, matched_rules: [] }
 *   { decision: "block", reason: string, matched_rules: [...], hint: string }
 *   { decision: "bypass", reason: "AEGIS_BYPASS=1", matched_rules: [] }
 */
export function decide({ command, rules, approvals, env = {} }) {
  if (env.AEGIS_BYPASS === "1") {
    return { decision: "bypass", reason: "AEGIS_BYPASS=1 emergency override", matched_rules: [] };
  }

  const matched = [];
  for (const rule of rules) {
    let re;
    try { re = new RegExp(rule.regex); } catch { continue; }
    if (re.test(command)) matched.push(rule);
  }

  if (matched.length === 0) {
    return { decision: "allow", reason: "no destructive pattern matched", matched_rules: [] };
  }

  // Each matched rule must have at least one active approval covering its scope.
  const now = new Date();
  const active = approvals.filter(a => !a.expired);
  const uncovered = matched.filter(rule => {
    return !active.some(a => (a.scope || []).some(s => {
      // Scope entries look like "bash:rm -rf" or "rule:rm-rf" or "*"
      if (s === "*") return true;
      if (s === `rule:${rule.name}`) return true;
      // bash:<substring> — match if the substring is in the rule's note or regex
      if (s.startsWith("bash:")) {
        const needle = s.slice(5);
        if (rule.note && rule.note.includes(needle)) return true;
        if (rule.regex && rule.regex.includes(needle)) return true;
      }
      return false;
    }));
  });

  if (uncovered.length === 0) {
    return {
      decision: "allow",
      reason: "matched destructive pattern(s) covered by active approval",
      matched_rules: matched.map(r => r.name),
    };
  }

  return {
    decision: "block",
    reason: `destructive pattern(s) without active approval: ${uncovered.map(r => r.name).join(", ")}`,
    matched_rules: matched.map(r => r.name),
    uncovered: uncovered.map(r => r.name),
    hint:
      "Grant an approval marker via:\n" +
      `  node tools/aegis-approval-gate/grant.mjs --task <ID> --action <name> --scope rule:${uncovered[0].name} --ttl 1h\n` +
      "Or bypass once with: AEGIS_BYPASS=1 <your command>",
  };
}

// ── audit ─────────────────────────────────────────────────────────────
export function appendAudit(projectDir, record) {
  try {
    const fp = path.join(projectDir, AUDIT_LOG);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.appendFileSync(fp, JSON.stringify({ ts: new Date().toISOString(), ...record }) + "\n");
  } catch {}
}
