---
name: aegis-run-logger
description: "Stop hook that archives every Claude Code session transcript to .aegis/brain/runs/ for later replay. Use this skill whenever the user wants to replay an old session, list archived runs, or audit completed work. Triggers on 'replay session', 'list runs', 'show old session', 'archive transcript', 'รีเพลย์ session', 'ดู session เก่า'."
profile: standard
triggers:
  en: ["replay session", "list runs", "show old session", "archive transcript", "session archive"]
  th: ["รีเพลย์ session", "ดู session เก่า", "ดู run เก่า", "เปิด archive"]
reads: [".aegis/brain/runs/"]
writes: [".aegis/brain/runs/"]
wires: ["Stop::tools/aegis-run-logger/archive.mjs"]
tests: ["tests/aegis-run-logger-test.sh"]
supersedes: []
---

## Quick Reference

`aegis-run-logger` — Stop hook + 2 CLIs.

- **Hook**: `tools/aegis-run-logger/archive.mjs` — fires on every session Stop, copies the Claude Code transcript_path into `.aegis/brain/runs/<DATE>-<SESSION>/transcript.ndjson` plus a `meta.json`.
- **Replay**: `tools/aegis-run-logger/replay.mjs` — pretty-print archived transcripts in the terminal (no Web UI; per Mega Plan v1.1).
- **List**: `tools/aegis-run-logger/list.mjs` — summarize archives by date / persona / line count.

## When to invoke

- "What did I do in last week's session?" → replay or list
- Triaging a regression that started yesterday → replay yesterday's run
- Building a session digest for a stakeholder

## Storage

```
.aegis/brain/runs/
├── 2026-05-05-abc123def/
│   ├── meta.json        {session_id, archived_at, persona, transcript_lines, source_path}
│   └── transcript.ndjson  ← verbatim copy of Claude Code's session JSONL
└── 2026-05-06-xyz789/
    ├── meta.json
    └── transcript.ndjson
```

`costUsd` is intentionally omitted — Mega Plan v1.1 dropped cost tracking.

## Workflow

```bash
# Replay the latest archived session, last 50 messages, color
node tools/aegis-run-logger/replay.mjs --latest --limit 50

# Replay a specific run
node tools/aegis-run-logger/replay.mjs 2026-05-05-abc123def

# Raw NDJSON dump (for jq / piping)
node tools/aegis-run-logger/replay.mjs --raw 2026-05-05-abc123def | jq '.'

# List archived runs
node tools/aegis-run-logger/list.mjs --since 2026-05-01 --limit 10

# JSON for tooling
node tools/aegis-run-logger/list.mjs --json --persona spider-man
```

## Hook wiring (additive, delivered by install.sh)

```jsonc
"Stop": [
  { "hooks": [
    { "type": "command", "command": "bash $CLAUDE_PROJECT_DIR/.claude/hooks/run-with-flags.sh on-stop $CLAUDE_PROJECT_DIR/.claude/hooks/on-stop.sh" },
    { "type": "command", "command": "node $CLAUDE_PROJECT_DIR/tools/aegis-run-logger/archive.mjs" }
  ]}
]
```

archive.mjs runs alongside on-stop.sh; both succeed independently. archive.mjs always exits 0 (Risk R6: a Stop hook must never block the user).

## Tests

```bash
bash tests/aegis-run-logger-test.sh
```

## References

- `~/Documents/AEGIS-PLUS-MEGA-PLAN.md` §7.3
- `.aegis/brain/sprints/sprint-v11-07/plan.md`
