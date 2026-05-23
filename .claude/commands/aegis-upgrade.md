---
name: aegis-upgrade
description: "Upgrade this AEGIS project to the latest framework — runs install.sh --upgrade with backup + hook normalization + migration log"
triggers:
  en: upgrade, upgrade aegis, update framework, sync framework
  th: อัพเกรด, อัพเดทเฟรมเวิร์ค
---

# /aegis-upgrade

## Quick Reference
Upgrade this AEGIS project to the latest framework from the AEGIS source repo.
Runs `tools/aegis-upgrade.sh` which invokes the source's `install.sh --upgrade`,
creates a timestamped backup, normalizes hook paths, and logs the migration.

## Flags
| Flag | Effect |
|------|--------|
| (none) | Interactive — shows diff summary, prompts for confirmation |
| `--check-only` | Dry-run — show what would change, no files modified |
| `--yes` / `-y` | Skip confirmation prompt (for autonomous / CI use) |
| `--source <path>` | Override AEGIS source repo (default: `$AEGIS_SOURCE` env, `~/Documents/AEGIS-Team`, `~/AEGIS-Team`, or `../AEGIS-Team`) |

## Full Instructions

### Step 1: Verify this project is an AEGIS installation
```bash
test -f CLAUDE.md && test -d .aegis || \
  echo "Not an AEGIS project — install.sh from AEGIS-Team first"
```
If not, halt and tell the user to run `bash <source>/install.sh --target-dir $(pwd)` first.

### Step 2: Parse flags
Extract flags from the command arguments:
- `--check-only` → dry-run mode
- `--yes` / `-y` → non-interactive
- `--source <path>` → explicit source override

### Step 3: Invoke the upgrade tool
Call `bash tools/aegis-upgrade.sh` with the parsed flags. The tool handles:
- Source resolution (AEGIS_SOURCE env, canonical paths, sibling dir)
- Diff summary (version, agents, commands, hooks, tools, ISO docs)
- Hook-path bug detection (warns if relative paths found)
- Backup creation (`_aegis-backup-<timestamp>/`)
- install.sh --upgrade invocation with preserved profile + project-name
- Post-upgrade activity log entry

### Step 4: Report outcome
Summarize:
- Upgraded from vX → vY
- Net component additions (agents, commands, hooks, tools, ISO docs)
- Backup location
- Hook paths normalized: yes/no
- Next action: "Restart Claude Code to pick up new settings"

### Step 5: Update brain
Append to `.aegis/brain/logs/activity.log`:
```
[YYYY-MM-DD HH:MM] UPGRADE | from=v<old> | to=v<new> | source=<source-path>
```

(The upgrade tool does this automatically, but verify it happened.)

### Step 6: Post-upgrade verification
Run these checks and report:
1. `cat VERSION` matches source version
2. `grep -c "CLAUDE_PROJECT_DIR" .claude/settings.json` should equal `grep -c '"command":' .claude/settings.json` — all hook commands anchored
3. `ls _aegis-output/iso-docs/ | wc -l` ≥ 12
4. `ls .claude/hooks/*.sh | wc -l` ≥ source hook count

If any check fails, offer rollback command:
```bash
# Restore from backup:
rm -rf .claude .aegis _aegis-output tools
cp -r _aegis-backup-<timestamp>/* .
```

## Error Handling

- **Source not found**: "Could not locate AEGIS source. Set `export AEGIS_SOURCE=/path/to/AEGIS-Team` or pass `--source`."
- **Not an AEGIS project**: "This directory has no `CLAUDE.md` + `.aegis/`. Install AEGIS first with `bash <source>/install.sh --target-dir $(pwd)`."
- **Source == Target**: "Cannot upgrade AEGIS source to itself. Run this command from a downstream project that has AEGIS installed."
- **Hook path normalization failed**: Manually run `bash tools/aegis-fix-hook-paths.sh` (between sessions) after the upgrade.

## Continuation Protocol
After upgrade completes, the natural next action is `/aegis-start` (which will
pick up the new settings + brain + commands). Follow the chain in
[`command-chain.md`](../references/command-chain.md); do not ask the user
"what next?" — restart guidance is part of the tool's own completion banner.
