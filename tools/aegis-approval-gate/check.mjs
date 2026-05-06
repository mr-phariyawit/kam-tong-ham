#!/usr/bin/env node
// check.mjs — PreToolUse hook for aegis-approval-gate (sprint v11-05)
//
// Reads a Claude Code hook event from stdin. If it is a Bash tool call,
// matches the command against .aegis/brain/gate-rules.yaml. If any rule
// matches AND no active approval marker covers it, exits 2 to BLOCK the
// tool call. Otherwise exits 0 (allow).
//
// AEGIS_BYPASS=1 environment override always wins; the bypass is logged
// to .aegis/brain/logs/approval-audit.log so it is auditable.
//
// Performance contract: p95 <100ms (Risk R1). This hook fires on every
// Bash tool call.
//
// Fail-OPEN on internal error (Risk R6): an exception in this script must
// NEVER block legitimate work. Only confirmed pattern matches block.

import fs from "node:fs";
import path from "node:path";
import { decide, loadRules, listApprovals, appendAudit } from "./lib.mjs";

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const SCRIPT_DIR  = path.dirname(new URL(import.meta.url).pathname);
const META_DIR    = path.resolve(SCRIPT_DIR, "../..");

async function readStdin() {
  let raw = "";
  process.stdin.setEncoding("utf8");
  await new Promise((resolve) => {
    const t = setTimeout(resolve, 50);
    let total = 0;
    process.stdin.on("data", c => {
      total += c.length;
      if (total > 64 * 1024) { resolve(); return; }
      raw += c;
    });
    process.stdin.on("end",   () => { clearTimeout(t); resolve(); });
    process.stdin.on("error", () => { clearTimeout(t); resolve(); });
  });
  return raw;
}

async function main() {
  const raw = await readStdin();
  let hook = {};
  try { hook = raw ? JSON.parse(raw) : {}; } catch { hook = {}; }

  const tool = hook?.tool_name;
  if (tool !== "Bash") return 0; // allow non-Bash tools straight through

  const command = String(hook?.tool_input?.command || "");
  if (!command.trim()) return 0;

  const { rules } = loadRules(PROJECT_DIR, META_DIR);
  const approvals = listApprovals(PROJECT_DIR);
  const verdict = decide({ command, rules, approvals, env: process.env });

  // Audit every decision (block + bypass + matched-but-allowed).
  // Skip pure no-match allows to keep the audit log focused.
  if (verdict.decision !== "allow" || (verdict.matched_rules || []).length > 0) {
    appendAudit(PROJECT_DIR, {
      decision: verdict.decision,
      command: command.slice(0, 200),
      matched: verdict.matched_rules,
      reason: verdict.reason,
    });
  }

  if (verdict.decision === "block") {
    process.stderr.write(
      `\n⛔ aegis-approval-gate: BLOCKED\n` +
      `   command:  ${command.slice(0, 120)}${command.length > 120 ? "…" : ""}\n` +
      `   rule(s):  ${(verdict.matched_rules || []).join(", ")}\n` +
      `   reason:   ${verdict.reason}\n\n` +
      `${verdict.hint || ""}\n`
    );
    return 2; // PreToolUse blocking exit
  }

  return 0;
}

main().then(
  rc => process.exit(rc | 0),
  // Fail-OPEN per Risk R6: a crash here must not block work.
  err => { try { appendAudit(PROJECT_DIR, { decision: "fail_open", error: err.message }); } catch {} process.exit(0); },
);
