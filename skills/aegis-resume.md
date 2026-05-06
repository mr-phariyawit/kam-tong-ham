---
name: aegis-resume
description: "Persistent run state — checkpoint a session, then resume after a Claude Code crash, machine restart, or branch swap. Surfaces interrupted runs at SessionStart. Use this skill whenever the user wants to checkpoint current work, list interrupted sessions, generate a resume brief, or clear archived checkpoints. Triggers on 'checkpoint session', 'resume run', 'list interrupted', 'resume brief', 'pick up where I left off', 'รีซูม session', 'จุด checkpoint'."
profile: standard
triggers:
  en: ["checkpoint session", "resume run", "list interrupted", "resume brief", "pick up where I left off", "session resume"]
  th: ["รีซูม session", "จุด checkpoint", "ทำต่อจากเมื่อวาน", "เซฟ session"]
reads: [".aegis/brain/state/", ".aegis/brain/runs/"]
writes: [".aegis/brain/state/"]
wires: ["SessionStart:startup:tools/aegis-resume/session-start.mjs"]
tests: ["tests/aegis-resume-test.sh"]
supersedes: []
---

## Quick Reference

`aegis-resume` ships sprint v11-10 (Phase-3 §8.1, gate-overridden by user). One CLI plus a SessionStart hook.

- **Storage**: `.aegis/brain/state/<SESSION>.yaml` — overwrite-on-checkpoint
- **CLIs**: `tools/aegis-resume/{checkpoint,resume,session-start}.mjs`
- **v11-07 integration**: a checkpoint whose session has a `runs/` archive is "archived" (cleanly stopped); checkpoints without one are "interrupted" (real resume candidates)

## Workflow

```bash
# 1. Capture current state (Claude or operator runs this periodically, or before risky work)
node tools/aegis-resume/checkpoint.mjs --session abc123 --task "fix wordPool dedup race" --persona spider-man
# → checkpoint: .aegis/brain/state/abc123.yaml (branch=feat/dedup, commit=ab12cd3, dirty=4)

# 2. Session crashes / machine restarts / you branch-swap. New session.
#    SessionStart hook automatically prints:
#      🔄 aegis-resume: 1 interrupted run found.
#        · session abc123 — branch feat/dedup, task: fix wordPool dedup race
#        Run: node tools/aegis-resume/resume.mjs list --interrupted

# 3. List + render brief
node tools/aegis-resume/resume.mjs list --interrupted
node tools/aegis-resume/resume.mjs show abc123
# → paste-ready text: branch + last_commit + dirty files + task + recovery commands

# 4. After picking up the work + completing it, clear
node tools/aegis-resume/resume.mjs clear abc123
# Or bulk-clear everything that v11-07 already archived cleanly
node tools/aegis-resume/resume.mjs clear --all-stopped
```

## Checkpoint schema

```yaml
session_id: abc123
ts: 2026-05-05T20:00:00Z
branch: feat/sprint-2-cache
persona: spider-man
task: "fix wordPool dedup race"
last_commit: ab12cd3
dirty_files:
  - src/wordPool.ts
  - tests/wordPool.test.ts
```

## SessionStart hook (delivered by install.sh)

```jsonc
"SessionStart": [
  { "matcher": "startup",
    "hooks": [
      { "type": "command",
        "command": "node $CLAUDE_PROJECT_DIR/tools/aegis-resume/session-start.mjs" }
    ]
  }
]
```

The hook is **non-blocking** — exits 0 even on internal error (Risk R6). Output is shown by Claude Code at session start.

## Design notes

- **Overwrite-on-checkpoint, not append.** One checkpoint per session = always-current snapshot. If you need history, v11-07's `runs/` archive holds the full transcript.
- **No automatic restore.** This skill does NOT auto-checkout the branch or undo dirty files. It produces a brief; the operator (or Claude) decides what to do. That preserves the operator's judgment and avoids fighting against intentional state changes.
- **Clean-stop detection via v11-07.** A checkpoint becomes "archived" when its session has a runs/ entry — that's the signal a Stop hook fired and the work was archived cleanly. Anything older that's still in state/ is by definition "interrupted".

## Tests

```bash
bash tests/aegis-resume-test.sh
```

## References

- `~/Documents/AEGIS-PLUS-MEGA-PLAN.md` §8.1
- `.aegis/brain/sprints/sprint-v11-10/plan.md`
- v11-07 `aegis-run-logger` — archived counterpart to interrupted checkpoints
