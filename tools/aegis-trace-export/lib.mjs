// lib.mjs — shared helpers for aegis-trace-export
//
// Pure functions: pattern loader + redactor + validator.

import fs from "node:fs";
import path from "node:path";

export const PATTERNS_REL = ".aegis/brain/redaction/patterns.yaml";

// Tiny YAML parser scoped to our pattern schema.
export function parsePatternsYaml(text) {
  const out = [];
  const lines = String(text).split(/\r?\n/);
  let i = 0;
  // skip until "patterns:"
  while (i < lines.length && !/^patterns:\s*$/.test(lines[i])) i++;
  i++;
  while (i < lines.length) {
    const line = lines[i];
    if (/^[A-Za-z_]/.test(line)) break; // next top-level key — done
    if (!line.trim() || /^\s*#/.test(line)) { i++; continue; }
    const start = line.match(/^\s+- (\w+):\s*(.*)$/);
    if (!start) { i++; continue; }
    const obj = {};
    obj[start[1]] = stripQuotes(start[2]);
    i++;
    while (i < lines.length) {
      const sub = lines[i].match(/^\s{4,}(\w+):\s*(.*)$/);
      if (!sub) break;
      obj[sub[1]] = stripQuotes(sub[2]);
      i++;
    }
    out.push(obj);
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

export function loadPatterns(projectDir, fallbackDir) {
  const candidates = [
    path.join(projectDir, PATTERNS_REL),
    fallbackDir ? path.join(fallbackDir, PATTERNS_REL) : null,
  ].filter(Boolean);
  for (const fp of candidates) {
    if (fs.existsSync(fp)) {
      try {
        const raw = parsePatternsYaml(fs.readFileSync(fp, "utf8"));
        const patterns = raw
          .filter(p => p && p.label && p.regex)
          .map(p => ({
            label: p.label,
            regex: p.regex,
            replacement: p.replacement || `[REDACTED-${p.label}]`,
          }));
        return { patterns, source: fp };
      } catch (e) {
        return { patterns: [], source: fp, error: e.message };
      }
    }
  }
  return { patterns: [], source: null };
}

export function redactString(s, patterns) {
  if (typeof s !== "string" || !patterns.length) return s;
  let out = s;
  for (const p of patterns) {
    let re;
    try { re = new RegExp(p.regex, "g"); } catch { continue; }
    out = out.replace(re, p.replacement);
  }
  return out;
}

// Recursively walk a JSON value, redacting all string fields.
export function redactValue(v, patterns) {
  if (v == null) return v;
  if (typeof v === "string") return redactString(v, patterns);
  if (Array.isArray(v)) return v.map(x => redactValue(x, patterns));
  if (typeof v === "object") {
    const o = {};
    for (const k of Object.keys(v)) o[k] = redactValue(v[k], patterns);
    return o;
  }
  return v;
}

// Validator: returns array of {label, count, sample} matches found in text.
// Empty array means clean.
export function findMatches(text, patterns) {
  const found = [];
  for (const p of patterns) {
    let re;
    try { re = new RegExp(p.regex, "g"); } catch { continue; }
    const matches = String(text).match(re);
    if (matches && matches.length) {
      found.push({ label: p.label, count: matches.length, sample: matches[0] });
    }
  }
  return found;
}
