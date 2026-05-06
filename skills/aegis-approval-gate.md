---
name: aegis-approval-gate
description: "PreToolUse hook that blocks destructive Bash ops (rm -rf, git push --force, DROP TABLE, etc.) until an active approval marker grants permission. Use this skill whenever the user wants to grant a one-time approval, list active approvals, revoke one, or configure the gate-rules. Triggers on 'grant approval', 'approve destructive op', 'list approvals', 'revoke approval', 'gate rules', 'อนุมัติ destructive', 'ดู approval', 'ยกเลิก approval'."
profile: standard
triggers:
  en: ["grant approval", "approve destructive", "list approvals", "revoke approval", "gate rules", "approval gate", "block destructive op"]
  th: ["อนุมัติ destructive", "ดู approval", "ยกเลิก approval", "เปิด gate"]
reads: [".aegis/brain/gate-rules.yaml", ".aegis/brain/approvals/"]
writes: [".aegis/brain/approvals/"]
wires: ["PreToolUse:Bash:tools/aegis-approval-gate/check.mjs"]
tests: ["tests/aegis-approval-gate-test.sh"]
supersedes: []
---

## Quick Reference

`aegis-approval-gate` is a **PreToolUse hook + CLI**. It pattern-matches every Bash command against [`.aegis/brain/gate-rules.yaml`](../.aegis/brain/gate-rules.yaml). If a destructive pattern matches AND no active approval marker covers it, the hook **blocks the tool call** (exit 2) with an actionable error.

- **Hot path**: `tools/aegis-approval-gate/check.mjs` — PreToolUse hook, fail-OPEN on crash, p95 <100ms target
- **Grant CLI**: `tools/aegis-approval-gate/grant.mjs` — issue YAML approval marker with TTL
- **List CLI**:  `tools/aegis-approval-gate/list.mjs` — show active / expired markers
- **Revoke CLI**: `tools/aegis-approval-gate/revoke.mjs` — delete a marker (or `--all-expired`)
- **Audit log**: `.aegis/brain/logs/approval-audit.log` — every block / bypass / matched-allow decision (one JSON per line)
- **Emergency**: `AEGIS_BYPASS=1 <command>` — env override always wins, audited

## When to invoke

- About to run a one-off destructive op intentionally → grant a short-TTL approval first
- Reviewing what's currently approved → list
- Cleaning up after a session → revoke or `--all-expired`
- Pilot is locking you out → either grant + retry, or `AEGIS_BYPASS=1` once

## Default rules (conservative)

| Rule | Pattern | Severity |
|---|---|---|
| `rm-rf` | `rm -rf` / `rm -fr` / `rm --recursive --force` | high |
| `git-force-push` | `git push --force / -f / --force-with-lease` | high |
| `git-reset-hard` | `git reset --hard` | medium |
| `git-clean-force` | `git clean -fd / -f / --force` | medium |
| `drop-table` | SQL `DROP TABLE/DATABASE/SCHEMA` | high |
| `dd-to-device` | `dd of=/dev/...` | high |
| `chmod-777-root` | `chmod -R 777 /...` | medium |
| `sudo-rm` | `sudo rm` (any flags) | high |

Override per-project by editing `.aegis/brain/gate-rules.yaml`.

## Grant scope formats

| Form | Meaning |
|---|---|
| `rule:rm-rf` | Cover only the `rm-rf` rule |
| `bash:rm -rf` | Cover any rule whose `note`/`regex` contains `rm -rf` |
| `*` | Wildcard — covers everything matched (use sparingly) |

## Workflow

```bash
# 1. Block hits — Claude tries `rm -rf node_modules` and the hook says NO
# 2. Grant a 30m approval scoped to this rule, tied to your task ID
node tools/aegis-approval-gate/grant.mjs \
    --task KAM-12 --action wipe-node-modules --scope rule:rm-rf --ttl 30m

# 3. Re-run the destructive command — passes the gate
# 4. List active approvals while you work
node tools/aegis-approval-gate/list.mjs --active

# 5. After you're done, revoke (or wait for TTL)
node tools/aegis-approval-gate/revoke.mjs KAM-12-wipe-node-modules

# Bulk-cleanup expired markers
node tools/aegis-approval-gate/revoke.mjs --all-expired
```

## Hook wiring (delivered by install.sh, additive)

```jsonc
"PreToolUse": [
  {
    "matcher": "Bash",
    "hooks": [
      { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/tools/aegis-approval-gate/check.mjs\"" }
    ]
  }
]
```

The hook chain runs alongside any existing PreToolUse hooks (e.g. `guard-bash.sh`).

## Emergency override

If the gate is wrong and you need to act NOW:

```bash
AEGIS_BYPASS=1 git push --force
```

The bypass is logged to `.aegis/brain/logs/approval-audit.log` so it's auditable. Don't use for routine work — defeats the gate.

## Audit log format

```json
{"ts":"2026-05-05T07:12:00Z","decision":"block","command":"rm -rf /tmp/x","matched":["rm-rf"],"reason":"..."}
{"ts":"2026-05-05T07:12:30Z","decision":"bypass","command":"git push --force ...","matched":["git-force-push"]}
{"ts":"2026-05-05T07:15:00Z","decision":"allow","command":"rm -rf node_modules","matched":["rm-rf"],"reason":"matched destructive pattern(s) covered by active approval"}
```

## Tests

```bash
bash tests/aegis-approval-gate-test.sh
```

## References

- `~/Documents/AEGIS-PLUS-MEGA-PLAN.md` §7.1
- `.aegis/brain/sprints/sprint-v11-05/plan.md`
- `.aegis/brain/gate-rules.yaml` (default rule set, editable per-project)
