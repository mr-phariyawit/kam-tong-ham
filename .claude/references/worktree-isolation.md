# Worktree Isolation + Background Agents (Sprint v9-05)

> **2026-05-23 NOTE**: This pattern is now **first-class in native Claude Code**.
> Pass `isolation: "worktree"` directly to the `Agent` tool — no AEGIS-specific
> setup needed. AEGIS-Team no longer ships extra infrastructure for this.
> This doc is kept as historical context. See [docs/AEGIS_VS_NATIVE_CC.md](../../docs/AEGIS_VS_NATIVE_CC.md)
> for the full native-vs-AEGIS positioning.

> **Purpose** (historical): Real blast radius enforcement via git worktree
> isolation per agent. Replace markdown-only "blast radius" rules with actual
> git boundaries.

## Problem (from Loki Critical #2)

v8.x blast radius is a markdown table; agents can write anywhere not in deny list.
Spider-Man could `kubectl delete pod` because hooks only enforce 2 patterns.

## Solution: Git Worktree per Spawn

Use Claude Code Agent tool's `isolation: "worktree"` parameter:
```typescript
Agent({
  subagent_type: "spider-man",
  isolation: "worktree",      // ← creates dedicated worktree
  mode: "acceptEdits",
  prompt: "..."
})
```

Worktree creates isolated copy → agent edits don't affect main → merged back after review.

## Naming Convention (S5-01)

```
aegis-wt/<agent>-<task-id>-<timestamp>
  e.g., aegis-wt/spider-man-S2-04-20260420T103000
        aegis-wt/black-panther-review-S2-04-20260420T110500
```

Rationale:
- Prefix `aegis-wt/` = always identifiable as AEGIS-managed
- Agent name = which character was working
- Task ID = trace back to backlog
- Timestamp = unique even if same agent re-spawns

## Lifecycle

```
1. Iron Man assigns task to Spider-Man
2. Spawn: Agent({subagent_type: "spider-man", isolation: "worktree", ...})
   → Claude Code creates: aegis-wt/spider-man-S2-04-20260420T103000
3. Spider-Man works in worktree (writes only affect worktree files)
4. Spider-Man completes, posts diff
5. Black Panther reviews (in OWN worktree, read-only of Spider-Man's)
6. If approved: merge worktree → main (via aegis-merge-worktree script)
7. Cleanup: delete worktree
```

## Per-Agent Defaults (S5-02 + S5-03)

| Agent | Default Mode | Worktree Default |
|-------|--------------|------------------|
| 🧬 Nick Fury | `acceptEdits` | NO (orchestrator, needs main view) |
| 🧭 Captain America | `acceptEdits` | NO (fallback brain, same as Nick Fury) |
| 📐 Iron Man | `acceptEdits` | OPTIONAL (specs only, low risk) |
| ⚡ Spider-Man | `acceptEdits` | YES (writes code) |
| 🛡️ Black Panther | `default` (read-only) | YES (review-only worktree) |
| 🔴 Loki | `default` (read-only) | YES (adversarial review) |
| 🔧 Beast | `default` (read-only) | NO (scanner, just reads) |
| 🎯 War Machine | `acceptEdits` | YES (writes test fixtures) |
| 🚀 Thor | `acceptEdits` | YES (deployment scripts) |
| 📜 Coulson | `acceptEdits` | OPTIONAL (docs only) |

## Worktree Merge Protocol (S5-04)

After Spider-Man completes + Black Panther approves:

```bash
# Script: tools/aegis-merge-worktree.sh
WORKTREE=$1   # e.g., aegis-wt/spider-man-S2-04-20260420T103000

# 1. Validate review approval
if ! grep -q "APPROVED" .aegis/brain/tasks/$TASK_ID/review.md; then
    die "No approval found"
fi

# 2. Detect conflicts vs main
git fetch origin main
CONFLICTS=$(git diff --name-only ${WORKTREE_BRANCH}...main | xargs -I{} git diff ${WORKTREE_BRANCH}..main -- {} | grep -c "^<<<<<<<" || echo 0)

if [ "$CONFLICTS" -gt 0 ]; then
    # Spawn Iron Man to resolve
    log_warn "Conflicts detected, spawning Iron Man for resolution"
    ...
fi

# 3. Merge worktree branch into main
git checkout main
git merge --no-ff ${WORKTREE_BRANCH} -m "merge: ${TASK_ID} via worktree"

# 4. Cleanup worktree
git worktree remove ${WORKTREE}
git branch -d ${WORKTREE_BRANCH}
```

## Background Agents (S5-05)

For non-blocking work (scanning, doc gen):

```typescript
Agent({
  subagent_type: "beast",
  run_in_background: true,    // ← async
  prompt: "scan codebase for TODOs, report at end"
})
// Continue with other work, get notified when Beast completes
```

Use cases:
- Beast: codebase scanning, dependency audit, security scan
- Coulson: ISO doc generation, retro doc drafting
- War Machine: long-running test suites

NOT for background:
- Spider-Man writing code (need synchronous review)
- Black Panther review (blocks merge)
- Nick Fury decisions (blocks downstream agents)

## mark_chapter Wire-up (S5-06)

Phase boundaries trigger chapter marks for session UX:

```typescript
// Nick Fury at phase transitions
mark_chapter({ title: "SCAN", summary: "Beast scanning project state" })
mark_chapter({ title: "PLAN", summary: "Iron Man drafting spec" })
mark_chapter({ title: "BUILD", summary: "Spider-Man implementing in worktree" })
mark_chapter({ title: "REVIEW", summary: "Black Panther + Loki reviews" })
mark_chapter({ title: "QA", summary: "War Machine running test suite" })
mark_chapter({ title: "MERGE", summary: "Worktree merge to main" })
mark_chapter({ title: "RETRO", summary: "Capturing lessons + handoff" })
```

User sees collapsible phases in transcript.

## Worktree Cleanup Hook (S5-07)

After sprint close, find + delete orphan worktrees:

```bash
#!/usr/bin/env bash
# tools/aegis-worktree-gc.sh

git worktree list | grep "aegis-wt/" | while read line; do
    PATH=$(echo $line | awk '{print $1}')
    AGE_DAYS=$(( ($(date +%s) - $(stat -f %m "$PATH" 2>/dev/null || echo 0)) / 86400 ))

    if [ "$AGE_DAYS" -gt 7 ]; then
        echo "Cleaning orphan worktree: $PATH (age: ${AGE_DAYS}d)"
        git worktree remove --force "$PATH"
    fi
done

# Also delete merged branches
git branch | grep "aegis-wt/" | while read branch; do
    if git merge-base --is-ancestor "$branch" main; then
        git branch -d "$branch"
    fi
done
```

Scheduled: ScheduleWakeup hook on sprint close + weekly fallback.

## Acceptance Criteria

- [x] Naming convention defined
- [x] Per-agent defaults table
- [x] Merge protocol script (specified, not implemented in this session)
- [x] Background agent guidance
- [x] mark_chapter integration plan
- [x] GC hook design
- [x] Real implementation: shipped and validated end-to-end. `Agent({isolation: "worktree"})` spawns tested in real use (scenario H + ongoing); `tools/aegis-merge-worktree.sh` handles stale-ancestor rebase + process-lock double-force; spawn-from-HEAD investigation closed (no SDK option; rebase step permanent per findings in Known Quirks below).

**Sprint 5 Status**: SHIPPED (2026-04-20). Worktree isolation is live: Agent tool `isolation` param tested, merge-script quirks handled, spider-man.md + spec Known Quirks updated. Remaining items are Anthropic-SDK-side (e.g., spawn-from-current-HEAD primitive).

## Known Quirks (discovered during first real-use validation, 2026-04-20)

### Quirk 1: Worktrees spawn from stale ancestor, not current HEAD

`Agent({isolation: "worktree"})` snapshots its worktree base from the session-start HEAD, not the caller's current HEAD at spawn time. A worktree spawned mid-session may be rooted several commits behind `main`, making every merge non-fast-forward and producing phantom add/add conflicts even when the semantic changes don't overlap.

**Mitigation (implemented in `aegis-merge-worktree.sh`):** before merging, rebase the worktree branch onto current `main` HEAD. If rebase is clean, the subsequent merge becomes a fast-forward (or a clean `--no-ff`). If rebase fails, that failure is the REAL conflict — abort rebase, fall through to the normal merge path, and surface it for human resolution.

**Investigation closed (2026-04-20):** no spawn-from-current-HEAD option exists. Empirical probe spawned `Agent({subagent_type: "beast", isolation: "worktree"})` while `HEAD=f940591` and the worktree reported `HEAD=1d5da1d` — 20 commits behind. The `Agent` tool schema's `isolation` param is `enum: ["worktree"]` (single value, no base/ref sub-parameter), and `EnterWorktree` only accepts `name` / `path` (no base selection either). Conclusion: the rebase-onto-HEAD step in `aegis-merge-worktree.sh` is a permanent requirement of the current SDK, not a workaround. If Anthropic later adds a base parameter, revisit this note — but don't wait for it.

### Quirk 2: Agent process holds the worktree lock past tool-call return

When a spawned agent returns its result, the underlying agent process may still hold the git worktree lock. Plain `git worktree remove --force` is rejected with `fatal: cannot remove a locked working tree`. Only `git worktree remove -f -f` (double-force) succeeds — this is a "unlock-and-remove" escalation, not a "destroy harder" force.

**Mitigation (implemented in `aegis-merge-worktree.sh`):** cleanup step escalates through plain remove → `-f` → `-f -f` automatically. If all three fail, log manual-cleanup guidance (`rm -rf <path> && git worktree prune`).

**Open question:** is there a clean way for Claude Code to signal "agent fully released" separate from "tool-call returned"? If yes, the double-force becomes unnecessary.
