---
name: aegis-live-tail
description: "Always-on terminal pane that displays the live conversation/activity stream from the active Claude Code session. Use this skill whenever the user wants to watch agent activity in real time, open a live view, tail the session, or see what Claude is doing right now. Triggers on 'live tail', 'watch session', 'show live activity', 'open live view', 'tail the agent', 'ดูสด', 'ติดตามแบบ real-time', 'เปิดหน้าจอ live', 'ดูสตรีม'."
profile: standard
triggers:
  en: ["live tail", "watch session", "show live activity", "open live view", "tail agent", "watch agent", "real time view"]
  th: ["ดูสด", "ติดตามแบบ real-time", "เปิดหน้าจอ live", "ดูสตรีม", "ตามดูเอเจนต์"]
---

## Quick Reference

`aegis-live-tail` ships an always-on terminal pane that shows every Edit / Write / Bash / Skill / Agent event in real time. It is the v11-01 deliverable from the AEGIS-Plus Mega Plan and the foundation for every later v11 skill.

- **Storage**: `.aegis/brain/live/current.fifo` (named pipe) + `.aegis/brain/live/format.yaml` (display config)
- **Hot path**: `tools/aegis-live-tail/emit.mjs` runs as a PostToolUse hook — sub-200ms p95
- **Foreground tailer**: `tools/aegis-live-tail/watch.mjs` runs in a tmux split or any second terminal
- **Bootstrap**: `bash tools/aegis-live-tail/start.sh` splits the current tmux window 70/30 and spawns the watcher

## When to invoke

- User asks to "watch what's happening", "tail the session", "ดูสด"
- Starting a long-running session and wanting visibility into agent activity
- Debugging hooks / persona behavior — every event lands in the pane
- Operator wants a non-Claude-Code view of in-flight work without leaving the terminal

## Files

| Path | Purpose |
|---|---|
| `tools/aegis-live-tail/emit.mjs` | PostToolUse hook — formats one event line, non-blocking write to fifo |
| `tools/aegis-live-tail/watch.mjs` | Foreground tailer — `tail -f`-style loop with filters + ANSI render |
| `tools/aegis-live-tail/start.sh` | tmux bootstrap (`start \| watch \| stop` subcommands) |
| `tools/aegis-live-tail/format.mjs` | Pure render utility shared by emit + watch |
| `.aegis/brain/live/current.fifo` | Named pipe for streaming events (transient — gitignored) |
| `.aegis/brain/live/format.yaml` | Display config (width, colors, persona palette) |

## Steps

1. **Bootstrap the pane** (once per terminal session):
   ```bash
   bash tools/aegis-live-tail/start.sh
   ```
   Inside tmux this splits the current window 70/30 and spawns the watcher in the bottom pane. Outside tmux it tells you to start one or run `start.sh watch` directly.

2. **Wire the hook** (one-time per project — already wired in AEGIS-Team meta):
   ```jsonc
   // .claude/settings.json
   {
     "hooks": {
       "PostToolUse": [
         {
           "matcher": ".*",
           "hooks": [
             {
               "type": "command",
               "command": "node \"$CLAUDE_PROJECT_DIR/tools/aegis-live-tail/emit.mjs\""
             }
           ]
         }
       ]
     }
   }
   ```

3. **Filter the feed** in the watcher pane as needed:
   ```bash
   bash tools/aegis-live-tail/start.sh watch --persona spider-man
   bash tools/aegis-live-tail/start.sh watch --tool Edit
   bash tools/aegis-live-tail/start.sh watch --errors-only
   bash tools/aegis-live-tail/start.sh watch --since 5m
   bash tools/aegis-live-tail/start.sh watch --no-color > /tmp/session.log
   ```

4. **Stop the pane** when done:
   ```bash
   bash tools/aegis-live-tail/start.sh stop
   ```

## Design constraints (from AEGIS-Plus Mega Plan §6.1, sprint v11-01)

- **Terminal-only** — no servers, no browsers, no GUI. Everything is `stdout` / tmux pane / file
- **Sub-200ms emit p95** — Risk R1 mitigation; benchmarked in `tests/aegis-live-tail-test.sh`
- **Fail-open** — `emit.mjs` always exits 0 (Risk R6); a broken hook never blocks a tool call
- **Non-blocking fifo writes** — emit drops the line if the pipe buffer is full or no reader is attached (Risk R3)
- **Memory-bounded watcher** — `watch.mjs` self-recycles when RSS exceeds 20MB or after 24h uptime (Risk R2)
- **Standalone fallback** — `start.sh watch` runs the tailer in any terminal, no tmux required (Risk R11)

## Examples

**Start a watching pane and trigger an event:**
```bash
bash tools/aegis-live-tail/start.sh
# (top pane: open Claude Code session, do something)
# bottom pane shows:
17:42:08 [spider-man    ] Edit  src/wordPool.ts
17:42:11 [spider-man    ] Bash  npm test --run wordPool
17:42:18 [spider-man    ] ✓ Bash
```

**Tail just errors across a 1-hour window:**
```bash
bash tools/aegis-live-tail/start.sh watch --errors-only --since 1h
```

**Capture a clean (no-color) log file for paste/share:**
```bash
bash tools/aegis-live-tail/start.sh watch --no-color > /tmp/session-$(date +%H%M).log
```

## Testing

Sprint v11-01 ships a 25-assertion regression test:

```bash
bash tests/aegis-live-tail-test.sh
```

Covers:
- format.mjs render shape, ANSI handling, truncation, hook→event mapping
- emit.mjs latency p95, fail-open paths (missing fifo, no reader, malformed stdin)
- watch.mjs filters (`--persona`, `--tool`, `--errors-only`, `--no-color`)
- start.sh subcommand wiring + bash syntax
- End-to-end: 10 emits → 10 lines arrive at the watcher

## References

- `~/Documents/AEGIS-PLUS-MEGA-PLAN.md` §6.1 — full spec
- `.aegis/brain/sprints/sprint-v11-01/plan.md` — sprint plan + acceptance criteria
- `.aegis/brain/learnings/2026-05-04_aegis-plus-pilot-feedback.md` — pilot feedback log
