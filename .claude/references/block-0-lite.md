# BLOCK 0 Lite Mode (S2-03)

> **Purpose**: Make BLOCK 0 (Coulson pre-work gate) proportional to task size.
> Address Loki Critical #5: "BLOCK 0 forced on every task -- 31,481 tokens/story-point"

## Problem

Current BLOCK 0 (full mode) requires for EVERY task regardless of size:
1. Coulson generates SI.01 spec
2. Coulson generates SI.02 design
3. Iron Man writes Epic/Task/Sub-task structure
4. Kanban entry created
5. Pre-implementation review

For a 1pt typo fix, this consumes ~10x the tokens of the actual fix.

## Solution: Proportional BLOCK 0

Three modes triggered by task complexity:

| Mode | Trigger | Required Artifacts | Skipped |
|------|---------|-------------------|---------|
| **lite** | task ≤ 1pt OR tag in {chore, typo, docs-fix, hotfix} | meta.json only | SI.01, SI.02, Epic, Sub-task |
| **standard** | task 2-5pt | meta.json + brief SI.01 | SI.02, Sub-task |
| **full** | task ≥6pt OR tag in {feature, refactor, security, breaking} | All artifacts | None |

## Mode Detection (Nick Fury Decision)

When Nick Fury receives a new task:

```python
def determine_block0_mode(task):
    # Tag-based override (highest priority)
    if any(tag in task.tags for tag in ['chore', 'typo', 'docs-fix', 'hotfix']):
        return 'lite'
    if any(tag in task.tags for tag in ['feature', 'refactor', 'security', 'breaking']):
        return 'full'

    # Size-based default
    if task.story_points <= 1:
        return 'lite'
    elif task.story_points <= 5:
        return 'standard'
    else:
        return 'full'
```

## Lite Mode Workflow

```
Task created (size ≤1pt or chore tag)
     │
     ▼
Coulson:
  - Create .aegis/brain/tasks/<TASK-ID>/meta.json (id, title, points, mode=lite, owner)
  - SKIP: SI.01, SI.02, Epic, Sub-task
     │
     ▼
Spider-Man / Spider-Man Direct:
  - Implement
  - Update meta.json status: in_progress → done
     │
     ▼
Black Panther:
  - Quick review (no formal gate, just visual diff check)
     │
     ▼
DONE
```

**Token estimate**: ~500 tokens overhead vs ~5000 in full mode (10x reduction)

## Standard Mode Workflow

```
Task (2-5pt)
     │
     ▼
Coulson: meta.json + brief SI.01 (≤200 lines, just goals + acceptance criteria)
     │
     ▼
Iron Man: brief design comment in SI.01 (no separate SI.02)
     │
     ▼
Spider-Man: implement
     │
     ▼
Black Panther: gate G1 (code review)
     │
     ▼
War Machine: gate G2 (QA)
     │
     ▼
DONE
```

## Full Mode Workflow (unchanged from v8.x)

Existing 6-gate pipeline. Unchanged for tasks ≥6pt or tagged as feature/refactor/security/breaking.

## Implementation Markers

For each mode, `meta.json` includes:

```json
{
  "id": "PROJ-T-042",
  "title": "Fix typo in README",
  "story_points": 1,
  "tags": ["docs-fix"],
  "block0_mode": "lite",
  "block0_artifacts": {
    "meta": true,
    "si01": false,
    "si02": false,
    "epic": false,
    "subtask": false
  }
}
```

## Migration Path

For existing v8.x tasks (no `block0_mode` field):
- Default behavior: assume `full` mode (v8.x compatible)
- New tasks: Nick Fury sets mode at creation

## Auditability

All modes log to `.aegis/brain/logs/block0-decisions.log`:

```
[2026-04-20T10:30:00Z] PROJ-T-042 mode=lite trigger=tag:docs-fix size=1pt
[2026-04-20T11:15:00Z] PROJ-T-043 mode=standard trigger=size:3pt size=3pt
[2026-04-20T14:00:00Z] PROJ-T-044 mode=full trigger=tag:security size=8pt
```

## Acceptance Criteria (S2-03 + S2-04)

- [x] Reference doc explains 3 modes (this file)
- [x] Decision logic documented (Python pseudocode above)
- [x] Decision logic shipped as testable helper (`tools/aegis-block0-mode.sh`,
  26/26 assertions)
- [x] meta.json schema extension documented (optional `block0_mode` field
  accepted by helper; `labels` and `tags` both supported for compatibility)
- [x] Nick Fury calls `determine_block0_mode()` per task (agent-prompt edit
  in `.claude/agents/nick-fury.md` BLOCK 0 section: invokes helper, branches
  0A/0B/0E enforcement by mode)
- [x] Coulson skips artifacts based on mode (agent-prompt edit in
  `.claude/agents/coulson.md`: mode-aware generation matrix, logs each skip
  to activity.log)
- [x] Audit log appends per task (skips logged to activity.log with
  `task=<ID> mode=<M> skipped=<0B,0E>` format)
- [ ] Tested: 1pt typo fix uses lite mode (behavioral test -- not run,
  requires a live /aegis-team-build cycle)
- [ ] Tested: 8pt feature uses full mode (behavioral test -- not run)

**Audit note (2026-04-20)**: the BLOCK 0 gate itself is fully shipped and
live. What remains is the **lite / skip mode switching** for small tasks,
which requires: (a) `block0_mode` field in task meta schema, (b) the
`determine_block0_mode()` branch in Nick Fury's pre-work check, and (c)
Coulson skipping SI.01/SI.02 when mode=lite. Scope estimate: ~4pt.

**Session-5-extended update (2026-04-20 late PM)**: the determiner
function itself is now shipped as `tools/aegis-block0-mode.sh` with
26/26 test assertions (`tools/aegis-block0-mode-test.sh`). Usage:

```
./tools/aegis-block0-mode.sh --points <N> [--tags <t1,t2,...>]
./tools/aegis-block0-mode.sh --task-id PROJ-T-NNN    # reads meta.json
```

Emits: `lite` / `standard` / `full` on stdout. Precedence order from
the spec is preserved: lite-tag (chore/typo/docs-fix/hotfix) > full-tag
(feature/refactor/security/breaking) > size (<=1 lite, 2-5 standard,
>5 full).

### meta.json schema (v9-02 S2-03/04)

Tasks MAY include a `block0_mode` field to pin the mode explicitly. If
present, the helper honors it regardless of points/labels. This is the
stable source of truth across Nick Fury re-dispatches.

```jsonc
{
  "id": "PROJ-T-042",
  "title": "Fix typo in README",
  "points": 1,
  "labels": ["typo", "docs"],
  // new: optional, pinned by Nick Fury on first BLOCK 0 check
  "block0_mode": "lite"
}
```

Compatibility: `labels` (existing AEGIS convention) and `tags` (original
spec term) are both accepted by the helper -- no migration needed for
existing task files.

### Agent-prompt wiring (S2-03/04 completion)

Nick Fury (`.claude/agents/nick-fury.md`) now reads the mode before
BLOCK 0 checks and skips 0A/0B/0E by mode per the gate table.

Coulson (`.claude/agents/coulson.md`) now skips generating SI.01 when
mode=lite and SI.02 stub when mode in {lite, standard}; logs each skip
to `activity.log` as `[HOOK:coulson-block0] task=<ID> mode=<M> skipped=<items>`.

Remaining: behavioral validation — run `/aegis-team-build` on a 1pt typo
(expect lite, no SI.01/SI.02) and an 8pt feature (expect full, all five
artifacts). Not in-session work; belongs in the next test pass.

## Loki Counter to Lite Mode

> "Lite mode could be abused -- agent tags everything as 'chore' to skip docs"

Mitigation:
- Nick Fury validates tag legitimacy on task creation
- Quarterly audit of mode distribution (alert if >40% lite)
- Tags require Iron Man approval if task size >3pt (prevents bypass)

## Trade-off Accepted

Lite mode reduces traceability for small tasks. Acceptable because:
- Small tasks have small blast radius
- Git history still tracks the change
- Time saved (~30 min/task) compounds significantly across sprint
