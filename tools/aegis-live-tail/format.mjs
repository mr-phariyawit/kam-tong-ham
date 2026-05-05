// format.mjs — shared rendering utility for aegis-live-tail
//
// Used by both emit.mjs (hot-path hook) and watch.mjs (foreground tailer).
// Pure functions only — no I/O, no env reads. Keep this file fast and testable.
//
// One event = one line, ANSI-colored:
//   HH:MM:SS [Persona  ] Tool   target (extra)
// Examples:
//   14:23:08 [Bolt    ] ✓ tests passed (12/12)
//   14:23:18 [Vigil   ] ⚠ flagged: missing rate limit
//   14:23:30 [Bolt    ] issue created KTH-43 :: rate limit

const ANSI = {
  reset:   "\x1b[0m",
  bold:    "\x1b[1m",
  dim:     "\x1b[2m",
  red:     "\x1b[31m",
  green:   "\x1b[32m",
  yellow:  "\x1b[33m",
  blue:    "\x1b[34m",
  magenta: "\x1b[35m",
  cyan:    "\x1b[36m",
  gray:    "\x1b[90m",
};

const PERSONA_COLORS = {
  bolt:           ANSI.cyan,
  "spider-man":   ANSI.cyan,
  forge:          ANSI.green,
  beast:          ANSI.green,
  "iron-man":     ANSI.magenta,
  sage:           ANSI.magenta,
  vigil:          ANSI.yellow,
  "black-panther":ANSI.yellow,
  thor:           ANSI.blue,
  "war-machine":  ANSI.red,
  "captain-america": ANSI.bold + ANSI.cyan,
  "nick-fury":    ANSI.bold + ANSI.magenta,
  loki:           ANSI.bold + ANSI.yellow,
  coulson:        ANSI.gray,
  wasp:           ANSI.green,
  havoc:          ANSI.red,
  pixel:          ANSI.magenta,
  muse:           ANSI.magenta,
  navi:           ANSI.cyan,
  ops:            ANSI.blue,
};

const STATUS_GLYPHS = {
  ok:    `${ANSI.green}✓${ANSI.reset}`,
  warn:  `${ANSI.yellow}⚠${ANSI.reset}`,
  err:   `${ANSI.red}✗${ANSI.reset}`,
  block: `${ANSI.red}⛔${ANSI.reset}`,
  info:  `${ANSI.blue}ℹ${ANSI.reset}`,
};

const TOOL_GLYPHS = {
  Bash:        "Bash",
  Edit:        "Edit",
  Write:       "Write",
  MultiEdit:   "MEdit",
  Read:        "Read",
  Grep:        "Grep",
  Glob:        "Glob",
  Agent:       "Agent",
  Task:        "Agent",
  Skill:       "Skill",
  WebFetch:    "Web ",
  WebSearch:   "Web ",
};

export function formatTimestamp(date = new Date()) {
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function pad(s, n) {
  s = String(s ?? "");
  if (s.length >= n) return s.slice(0, n);
  return s + " ".repeat(n - s.length);
}

// Strip ANSI escapes from a string — used by truncate() to count visible chars.
function stripAnsi(s) {
  return String(s).replace(/\x1b\[[0-9;]*m/g, "");
}

// Truncate to visible-char width, ANSI-aware.
function truncate(s, n) {
  const visible = stripAnsi(s);
  if (visible.length <= n) return s;
  // Slow path: walk bytes, count visible, snip.
  let out = "";
  let count = 0;
  let i = 0;
  while (i < s.length && count < n - 1) {
    const ch = s[i];
    if (ch === "\x1b") {
      // copy whole escape sequence
      const m = s.slice(i).match(/^\x1b\[[0-9;]*m/);
      if (m) { out += m[0]; i += m[0].length; continue; }
    }
    out += ch;
    count++;
    i++;
  }
  return out + "…";
}

function colorPersona(name) {
  if (!name) return ANSI.gray + "?" + ANSI.reset;
  const key = String(name).toLowerCase();
  const color = PERSONA_COLORS[key] || ANSI.gray;
  return color + name + ANSI.reset;
}

// Public API ─────────────────────────────────────────────────────────────────

/**
 * Format one event into a printable line.
 *
 * @param {object} e
 * @param {Date|string} [e.ts]      - timestamp (Date or ISO string); defaults to now
 * @param {string}      [e.persona] - active persona name (e.g. "spider-man")
 * @param {string}      [e.tool]    - tool name (Bash, Edit, Write, ...)
 * @param {string}      [e.target]  - file path or command summary
 * @param {string}      [e.extra]   - extra status info (e.g. "+12 -3", "12/12 tests")
 * @param {"ok"|"warn"|"err"|"block"|"info"} [e.status]
 * @param {object}      [opts]
 * @param {boolean}     [opts.color=true]
 * @param {number}      [opts.maxWidth=120]
 * @returns {string} one line, no trailing newline
 */
export function formatEvent(e = {}, opts = {}) {
  const color = opts.color !== false;
  const maxWidth = opts.maxWidth ?? 120;

  const ts = e.ts instanceof Date ? e.ts
    : (typeof e.ts === "string" ? new Date(e.ts) : new Date());
  const tsStr = formatTimestamp(ts);

  // 14 chars wide to fit AEGIS Marvel persona names ("captain-america" =14,
  // "black-panther" =13, "spider-man"/"war-machine" =10).
  const personaPad = pad(e.persona || "?", 14);
  const personaCell = color
    ? `[${colorPersona(personaPad.trim())}${" ".repeat(personaPad.length - personaPad.trim().length)}]`
    : `[${personaPad}]`;

  const tool = TOOL_GLYPHS[e.tool] || e.tool || "?";
  const toolCell = pad(tool, 5);

  const status = e.status && STATUS_GLYPHS[e.status]
    ? (color ? STATUS_GLYPHS[e.status] : statusPlain(e.status))
    : "";

  const target = e.target || "";
  const extra = e.extra ? ` (${e.extra})` : "";

  const dim = color ? ANSI.dim : "";
  const reset = color ? ANSI.reset : "";

  let line = `${dim}${tsStr}${reset} ${personaCell} ${toolCell}${status ? " " + status : ""}${target ? " " + target : ""}${extra}`;
  return truncate(line, maxWidth);
}

function statusPlain(s) {
  return ({ ok: "OK", warn: "WARN", err: "ERR", block: "BLOCK", info: "INFO" })[s] || "";
}

/**
 * Build an event from a Claude Code PostToolUse hook payload.
 *
 * @param {object} hook    - parsed JSON from hook stdin
 *   { tool_name, tool_input, tool_response, ... }
 * @param {string} [persona] - active persona from env, optional
 * @returns {object} event (suitable for formatEvent)
 */
export function eventFromHook(hook, persona) {
  const tool = hook?.tool_name || "?";
  const ti = hook?.tool_input || {};
  let target = "";
  let extra = "";
  let status = undefined;

  switch (tool) {
    case "Edit":
    case "Write":
    case "MultiEdit":
      target = ti.file_path || "";
      break;
    case "Bash":
      target = (ti.command || "").slice(0, 60);
      break;
    case "Read":
    case "Grep":
    case "Glob":
      target = ti.file_path || ti.path || ti.pattern || "";
      break;
    case "Agent":
    case "Task":
      target = ti.subagent_type || ti.description || "";
      extra = ti.description ? "" : "";
      break;
    case "Skill":
      target = ti.skill || "";
      break;
    default:
      target = ti.file_path || ti.command || ti.url || "";
  }

  const resp = hook?.tool_response;
  if (resp && typeof resp === "object") {
    if (resp.error || resp.is_error) status = "err";
    else if (resp.warning) status = "warn";
  }

  return {
    ts: new Date(),
    persona,
    tool,
    target,
    extra,
    status,
  };
}

export const _internal = { ANSI, PERSONA_COLORS, TOOL_GLYPHS, STATUS_GLYPHS, stripAnsi, truncate, pad };
