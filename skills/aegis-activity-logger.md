---
name: aegis-activity-logger
description: "Append-only JSONL audit log of every Edit/Write/Bash mutation, one file per UTC day. Provides historical replay for aegis-live-tail and powers stats reporting. Use this skill whenever the user wants to see what changed, audit activity, view today's mutations, or aggregate tool/persona counts. Triggers on 'show activity', 'audit log', 'what changed today', 'activity stats', 'ดูกิจกรรม', 'วันนี้แก้อะไรบ้าง', 'สถิติวันนี้'."
profile: standard
triggers:
  en: ["show activity", "audit log", "what changed today", "activity stats", "view audit"]
  th: ["ดูกิจกรรม", "วันนี้แก้อะไรบ้าง", "สถิติวันนี้", "บันทึกกิจกรรม"]
reads: [".aegis/brain/activity/"]
writes: [".aegis/brain/activity/YYYY-MM-DD.jsonl"]
wires: ["PostToolUse:.*:tools/aegis-activity-logger/log.mjs"]
tests: ["tests/aegis-activity-logger-test.sh"]
supersedes: []
---

## Quick Reference

`aegis-activity-logger` writes one JSON object per tool call to `.aegis/brain/activity/YYYY-MM-DD.jsonl`. Sprint v11-02 from the AEGIS-Plus Mega Plan §6.2; reuses `tools/aegis-live-tail/format.mjs::eventFromHook()` so the JSONL records and the live-tail stream agree on event shape.

- **Hot path**: `tools/aegis-activity-logger/log.mjs` — PostToolUse hook, p95 <100ms, fail-open on every error
- **Viewer**: `tools/aegis-activity-logger/view.mjs` — `--today`, `--since`, `--persona`, `--tool`, `--status`, `--watch`, `--json`, `--limit`
- **Stats**: `tools/aegis-activity-logger/stats.mjs` — counts by day, tool, persona, status, or day+tool grid
- **Storage**: `.aegis/brain/activity/YYYY-MM-DD.jsonl` (one file per UTC day, append-only)

## When to invoke

- "what did I change today?" / "ดูกิจกรรม"
- Triaging which files were touched in a session
- Generating per-persona / per-tool counts for retros
- Tailing today's file as JSON for downstream tooling

## Schema (one line per tool call)

```json
{"ts":"2026-05-04T14:23:08.123Z","tool":"Edit","target":"src/app.ts","extra":"+12 -3","persona":"spider-man","status":"ok","session":"<id>"}
```

## Files

| Path | Purpose |
|---|---|
| `tools/aegis-activity-logger/log.mjs` | PostToolUse hook — appends one JSON line per call |
| `tools/aegis-activity-logger/view.mjs` | Filter + render (human or JSON) |
| `tools/aegis-activity-logger/stats.mjs` | Aggregate counts across days/tools/personas |
| `.aegis/brain/activity/YYYY-MM-DD.jsonl` | Append-only audit log (one file per UTC day) |

## Steps

1. **Wire the hook** (one-time per project — already wired in AEGIS-Team meta):
   ```jsonc
   // .claude/settings.json
   "PostToolUse": [
     { "matcher": ".*", "hooks": [
       { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/tools/aegis-activity-logger/log.mjs\"" }
     ]}
   ]
   ```

2. **View today's activity:**
   ```bash
   node tools/aegis-activity-logger/view.mjs --today
   node tools/aegis-activity-logger/view.mjs --today --tool Edit --limit 20
   node tools/aegis-activity-logger/view.mjs --since 2d --persona spider-man --json
   ```

3. **Tail live (alternative to aegis-live-tail for non-tmux setups):**
   ```bash
   node tools/aegis-activity-logger/view.mjs --watch
   ```

4. **Aggregate stats:**
   ```bash
   node tools/aegis-activity-logger/stats.mjs --week
   node tools/aegis-activity-logger/stats.mjs --month --by persona
   node tools/aegis-activity-logger/stats.mjs --since 2026-05-01 --by tool --json
   ```

## Design notes

- **Append-only** — past entries are never modified. Daily file rotation; archive policy lives outside this skill (manual `.tar.gz` per quarter).
- **Fail-open** — `log.mjs` always exits 0; a broken hook never blocks a tool call.
- **Canonical event shape** — reuses `aegis-live-tail/format.mjs::eventFromHook()` so live-tail and activity-logger never diverge.
- **No PII redaction at this layer** — that's the job of `aegis-trace-export` (sprint v11-08, deferred).

## Testing

```bash
bash tests/aegis-activity-logger-test.sh
```

Covers log-line shape, fail-open paths, view filters, stats aggregation, end-to-end (10 hook fires → 10 JSONL lines → view sees all).

## References

- `~/Documents/AEGIS-PLUS-MEGA-PLAN.md` §6.2
- `.aegis/brain/sprints/sprint-v11-02/plan.md`
