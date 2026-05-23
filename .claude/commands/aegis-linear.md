---
name: aegis-linear
description: "Linear integration — health check, project bootstrap, sprint sync (one-way kanban→Linear, milestone-based)"
triggers:
  en: linear, linear sync, linear health, sync to linear, push to linear
  th: ลิเนียร์, ซิงค์ลิเนียร์, เช็คลิเนียร์
---

# /aegis-linear

## Quick Reference

| Subcommand | Purpose | Idempotent? |
|------------|---------|-------------|
| `/aegis-linear health` | Run all health checks (token, team, project, labels) | ✅ read-only |
| `/aegis-linear setup` | First-time bootstrap (token → keychain → config → project) | ✅ |
| `/aegis-linear sync <sprint>` | Sync kanban.md → Linear (issues + milestones + state) | ✅ |
| `/aegis-linear drift <sprint>` | Read-only: show divergence between kanban and Linear | ✅ read-only |
| `/aegis-linear open <sprint>` | Sync at sprint start (same as `sync` — alias) | ✅ |
| `/aegis-linear close <sprint>` | Final sync at sprint close + leave milestone in Linear | ✅ |

**Backed by tools**:
- [`tools/aegis-linear-setup.sh`](../../tools/aegis-linear-setup.sh) — bootstrap, health, ensure-project, ensure-milestone
- [`tools/aegis-linear-sync.sh`](../../tools/aegis-linear-sync.sh) — kanban → Linear sync

**Config**: [`.aegis/config/linear.json`](../../.aegis/config/linear.json)

## Architecture

```
┌────────────────────────────┐                ┌──────────────────────┐
│  kanban.md (source truth)  │ ─── one-way ──▶│  Linear Project      │
│  Captain America = writer  │                │  + Milestones        │
└────────────────────────────┘                │  + Issues            │
                                              └──────────────────────┘

Mapping:
  1 git repo ─────────────▶ 1 Linear Project (auto-created, named from git remote slug)
  1 AEGIS sprint ─────────▶ 1 Project Milestone (NOT Cycle — milestones are project-scoped)
  1 kanban story [Sx-yy] ─▶ 1 Linear Issue (deduped via <!-- aegis-sync:Sx-yy --> marker)
  Kanban section ─────────▶ Linear workflow state (BACKLOG/TODO/IN_PROGRESS/IN_REVIEW/QA/DONE)
```

## When to invoke

Captain America (single kanban writer) calls this skill:
1. **On `/aegis-start`** → run `health` (passes/warns/blocks based on result)
2. **On `/aegis-sprint plan`** → call `sync <sprint>` after kanban is initialized
3. **On every kanban write** → call `sync <sprint>` (idempotent — only diffs are sent)
4. **On `/aegis-sprint close`** → call `close <sprint>` for final sync
5. **On `/aegis-status`** → optionally call `drift <sprint>` to surface divergence

## Routing

Parse subcommand from user input. If missing, show Quick Reference table above.

```
/aegis-linear health           → bash tools/aegis-linear-setup.sh health
/aegis-linear setup            → bash tools/aegis-linear-setup.sh init
/aegis-linear sync <sprint>    → bash tools/aegis-linear-sync.sh open <sprint>
/aegis-linear open <sprint>    → bash tools/aegis-linear-sync.sh open <sprint>
/aegis-linear close <sprint>   → bash tools/aegis-linear-sync.sh close <sprint>
/aegis-linear drift <sprint>   → bash tools/aegis-linear-sync.sh drift <sprint>
```

## Health Check Output

```
[linear-setup] ✅ Config file present
[linear-setup] ✅ Token resolved (length=48)
[linear-setup] ✅ Authenticated as user@email @ workspace
[linear-setup] ✅ Team reachable: KEY / Name
[linear-setup] ✅ Project linked: ProjectName (started)
[linear-setup] Summary: issues=0 warnings=0
```

Exit codes:
- `0` GREEN — all healthy
- `2` YELLOW — degraded but functional (e.g. project not yet auto-created)
- `1`/`3` RED — fatal or action required

## Sync Output

```
[linear-sync] Step 1/3: ensure project + milestone
[linear-sync] ✅ Created milestone: sprint-v12-07 (mid_xxx)
[linear-sync] Step 2/3: parse kanban
[linear-sync] ✅ Parsed 5 stories from kanban
[linear-sync] Step 3/3: create missing issues + sync state
[linear-sync]   + S12-01 → PHA-203
[linear-sync]   ↻ S12-02 state → IN_PROGRESS
[linear-sync]   + S12-03 → PHA-204
[linear-sync] ✅ open complete: created=2 updated=1 skipped=2
```

## Throwaway / Shared Mode

For PoC repos that don't deserve a Linear project:

```bash
# Skip Linear entirely
jq '.project.throwaway = true' .aegis/config/linear.json > /tmp/c && mv /tmp/c .aegis/config/linear.json

# OR share an umbrella project
jq '.project.shared_with = "AEGIS Experiments"' .aegis/config/linear.json > /tmp/c && mv /tmp/c .aegis/config/linear.json
```

## Conflict Resolution

**AEGIS always wins.** If a human manually edits an issue in Linear:
- Next sync overwrites their changes
- Drift report (`/aegis-linear drift <sprint>`) will surface divergence first if you want a warning
- For human-driven changes, edit kanban.md and re-sync

## Privacy / Safety

- Token never logged or echoed (stored in macOS Keychain `aegis-linear-token` + chmod-600 dotfile)
- Sync direction is one-way (Linear → AEGIS never happens — no risk of reverse overwrite)
- `--dry` flag on `aegis-linear-sync.sh` skips all writes (read-only preview)
- Rate-limited to 20 req/min (well under Linear's 1500/hr cap)

## Failure modes & graceful degradation

| Failure | Behavior |
|---------|----------|
| Network down | health = RED, sync skipped, AEGIS continues offline (kanban still works) |
| Token expired/invalid | health = RED, surfaces in `/aegis-start`, user re-runs `setup` |
| Linear API rate-limited | exponential backoff, retry next sync |
| Project deleted in Linear | health detects, prompts re-create via `ensure-project` |
| User flagged `throwaway: true` | All sync ops are no-ops (logged) |

## Related

- [`.claude/commands/aegis-start.md`](aegis-start.md) — runs health on session start
- [`.claude/commands/aegis-sprint.md`](aegis-sprint.md) — calls sync on plan/close
- [`.claude/commands/aegis-status.md`](aegis-status.md) — calls drift for in-session report
