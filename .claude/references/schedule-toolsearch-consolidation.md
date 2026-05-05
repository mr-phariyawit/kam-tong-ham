# ScheduleWakeup + ToolSearch + Agent Consolidation (Sprint v9-06)

> **Purpose**: Self-paced loops, lazy-load tools, reduce 13 agents → 10.
>
> **Status (2026-04-20 verification pass)**: Parts 1 + 2 rest on primitives
> that don't exist as specified. See "SDK Verification Findings" at the end of
> this doc before implementing anything. Part 3 (agent consolidation) is
> sound but requires staged execution.

## Part 1: ScheduleWakeup for Brain Maintenance (S6-01)

Auto-trigger pattern extraction without manual `/aegis-distill` calls.

### Trigger Conditions

```python
# Hook: post-task-complete
if tasks_completed_since_last_distill >= 3:
    ScheduleWakeup({
        delaySeconds: 1800,    # 30 min
        prompt: "/aegis-distill",
        reason: "auto-distill: 3 tasks completed since last run"
    })
```

### Schedule Strategy

- After 3 tasks complete → schedule distill in 30 min (let dust settle)
- Daily at 22:00 → run `/aegis-evolve` (cluster duplicates)
- Weekly Sunday 23:00 → run `/aegis-lint` (brain health check)

### Why ScheduleWakeup vs CronCreate

- ScheduleWakeup = self-paced (cache stays warm if < 5 min)
- CronCreate = wall-clock cron (always cold start)
- Brain maintenance is "do soon" not "do at exact time" → ScheduleWakeup wins

## Part 2: ToolSearch / Deferred Tools (S6-02)

Currently AEGIS preloads ALL agent schemas at session start = context bloat.

### New Approach

```json
// .claude/settings.json
{
  "tools": {
    "deferred": [
      "aegis-deploy", "aegis-compliance", "aegis-launch",
      "aegis-pipeline", "aegis-evolve", "aegis-distill",
      "aegis-ingest", "aegis-lint", "aegis-flow"
    ],
    "always_load": [
      "aegis-start", "aegis-retro", "aegis-status", "aegis-mode",
      "aegis-team-build", "aegis-team-review", "aegis-context"
    ]
  }
}
```

Always-load = 7 commands (essential for every session)
Deferred = 9 commands (load via ToolSearch when triggered)

### How Deferred Loading Works

1. Session starts → only 7 always-load commands visible
2. User says "let me deploy" → Claude calls ToolSearch with query "deploy"
3. ToolSearch returns aegis-deploy schema
4. Claude can now invoke aegis-deploy
5. Schema stays loaded for rest of session

### Token Savings Estimate

- Before: 31 commands × ~200 tokens each = 6,200 tokens preloaded
- After: 7 commands × ~200 tokens = 1,400 tokens preloaded
- Saving: ~4,800 tokens per session start
- Trade-off: 1 extra ToolSearch call when deferred tool needed (~500 tokens)
- Net: significant savings if user only uses 2-3 commands per session

## Part 3: Agent Consolidation (S6-03 to S6-07)

### Current 13 Agents → Target 10 Agents

| Action | From | To | Reason |
|--------|------|----|----|
| KEEP | Nick Fury | Nick Fury | Master controller (irreplaceable) |
| KEEP | Captain America | Captain America | Fallback brain (added per ADR-001) |
| KEEP | Iron Man | Iron Man | Architect (specs + ADRs) |
| KEEP | Spider-Man | Spider-Man | Implementer |
| KEEP | Black Panther | Black Panther | Reviewer / quality gate |
| KEEP | Loki | Loki | Adversarial review (proven valuable) |
| KEEP | Beast | Beast | Scanner (haiku, fast) |
| KEEP | Thor | Thor | DevOps |
| KEEP | Coulson | Coulson | Compliance + docs |
| **MERGE** | Vision | → War Machine | Test execution merges into QA Lead |
| **RETIRE** | Wasp | (route to Spider-Man) | UX tasks rare; route to Spider-Man + style guide |
| **RETIRE** | Songbird | (route to Coulson) | Content tasks merge with compliance docs |

### Merger: Vision → War Machine (S6-03)

War Machine becomes both QA strategist + executor.

Updated [.claude/agents/war-machine.md](../.claude/agents/war-machine.md):
- Plans test strategy (existing role)
- Executes test cases (Vision's role)
- Reports test results
- Gates releases

Vision archived to `.claude/agents/_archived/vision.md`

### Retirement: Wasp (S6-04)

Wasp UX tasks were rare in v8.x (~5% of total tasks).

Routing change:
- "Design UI component" → Spider-Man + reference [.claude/references/ui-style-guide.md](../.claude/references/ui-style-guide.md)
- "Accessibility review" → Black Panther (a11y is a quality concern)

Wasp archived. Reference doc updated.

### Retirement: Songbird (S6-05)

Songbird was content/marketing-focused. AEGIS rarely needs marketing content.

Routing change:
- "Write README" → Coulson (docs)
- "Draft changelog" → Coulson
- "Marketing copy" → out of scope (use external tool)

Songbird archived.

### Command Consolidation (S6-06)

31 commands → 12 core commands

| Keep (12) | Reason |
|-----------|--------|
| /aegis-start | Required entry point |
| /aegis-retro | Required exit point |
| /aegis-status | Daily check-in |
| /aegis-mode | Profile/autonomy switch |
| /aegis-team-build | Build pipeline |
| /aegis-team-review | Review pipeline |
| /aegis-team-debate | Multi-perspective decision |
| /aegis-sprint | Sprint management |
| /aegis-kanban | Kanban view |
| /aegis-memory | Brain query |
| /aegis-doctor | Health check |
| /aegis-context | Context budget |

Deferred (load via ToolSearch when needed):
- /aegis-pipeline, /aegis-deploy, /aegis-compliance, /aegis-launch
- /aegis-flow, /aegis-evolve, /aegis-distill, /aegis-lint, /aegis-ingest
- /aegis-instinct, /aegis-adr, /aegis-handoff, /aegis-breakdown
- /aegis-dashboard, /aegis-qa, /aegis-verify
- /aegis-team-build/review/debate (alternative direct calls)
- /aegis-reengineer

### Documentation Update (S6-07)

Update files to reflect 10-agent + 12-command model:
- CLAUDE.md (Quick Commands table)
- CLAUDE_agents.md (agent table)
- CLAUDE_skills.md (deprecated skills tagged)
- README.md (overview)

## Acceptance Criteria

- [x] ScheduleWakeup design + trigger conditions
- [x] ToolSearch / deferred tools config
- [x] Agent consolidation map (13→10)
- [x] Merge: Vision → War Machine specified
- [x] Retire: Wasp, Songbird specified
- [x] Command consolidation (31→12 core + 19 deferred)
- [x] Implementation: actual file changes shipped. Vision → War Machine
  merge, Wasp retirement, Songbird retirement all landed (audit 2026-04-20
  confirmed via `.claude/agents/_archived/` vs `.claude/agents/` diff).
- [x] CLAUDE.md/agents/skills updates shipped. `CLAUDE_agents.md` top-of-
  file declares "v9 Model: 10 agents"; active table matches the 10-agent
  reality. CLAUDE.md v9 transition block reflects post-audit state.

**Sprint 6 Status**: SHIPPED (2026-04-20). S6-01 Pattern A distill
reminder live + tested; S6-02 closed on SDK (no `tools.deferred` in
settings schema); S6-03/04/05/07 confirmed shipped via filesystem audit;
only S6-06 (29→12 command cut) remains deferred pending user-pain signal.
Per the "S6-06 decision point" section: no evidence of user pain yet, so
leave 29 commands active.

---

## SDK Verification Findings (2026-04-20)

Verified against Claude Code's current tool schemas + settings.json docs
(https://code.claude.com/docs/en/settings.md). The spec above was written
against aspirational / misremembered primitives; treat the below as the
corrections.

### Finding A — S6-01 "ScheduleWakeup for brain maintenance" is design-flawed

Two independent issues:

1. **ScheduleWakeup only fires in `/loop dynamic` mode.** From the tool
   description: "Schedule when to resume work in /loop dynamic mode." It does
   NOT run in normal sessions. The "post-task hook → ScheduleWakeup(...)"
   pattern in the spec cannot fire.
2. **Hooks cannot call Claude Code tools at all.** Hooks are subprocesses
   that run to completion and exit; they have no access to the tool-use
   API. A hook can write a counter file, but it cannot schedule anything.

**Nearest real primitive**: `CronCreate`. Session-only by default;
`durable: true` persists to `.claude/scheduled_tasks.json` and survives
restarts, but recurring jobs still auto-expire after 7 days, so any
long-term automation needs to be re-armed periodically.

**Redesigned S6-01 (Pattern A, simplest)**:
- A hook (e.g. `post-tool-use`) increments a counter in
  `.aegis/brain/state/distill-counter.txt` on task completion.
- At session start, the session-start hook reads the counter. If >=3, it
  writes a marker file `.aegis/brain/state/distill-due.flag`.
- Main agent, on its first turn, reads the marker (or MEMORY.md surfaces
  it) and runs `/aegis-distill` before other work. After distill,
  counter resets and marker is removed.
- **No external scheduler required**; the "schedule" is folded into the
  session's natural start-of-work inspection.

**Redesigned S6-01 (Pattern B, if the user wants wall-clock cadence)**:
- Main agent runs `CronCreate({cron: "13 22 * * *", prompt: "/aegis-distill",
  durable: true})` explicitly (e.g. as a one-liner during `/aegis-start`).
- Re-armed weekly because recurring crons expire after 7 days.
- Still single-machine, single-user -- cron state lives in the project's
  `.claude/scheduled_tasks.json`.

Pattern A is cheaper and more robust. Recommended.

### Finding B — S6-02 "`tools.deferred` / `tools.always_load` in settings.json" does not exist

`.claude/settings.json` supports only: `env`, `hooks`, `permissions`,
`skipDangerousModePermissionPrompt`. There is no `tools` key. The
schema does NOT support declaring which slash commands to lazy-load.

The existing `ToolSearch` primitive defers **API-level tools** (MCP tools
+ built-ins like `WebFetch`, `CronCreate`, etc.), not slash commands.
Slash commands auto-load based on file presence in `.claude/skills/` and
`~/.claude/skills/`. The only way to "defer" a slash command is to move
its file out of the skills directory.

**Implication**: the 4.8k-token-per-session savings estimated in the spec
is not reachable via a config change. To approximate it, we would need
to either:
- **Filesystem move** (skill files into a `.claude/skills-deferred/` dir)
  -- this removes them from the session entirely, not lazy-loads. Users
  lose tab-completion. Not equivalent to deferred loading.
- **Wait for Anthropic** to add a `skills.deferred` settings key. This
  is a feature request, not a change we can ship.

**Action**: close S6-02 as "blocked on SDK". Record as a feature request
candidate. Do NOT spend further implementation effort.

### Finding C — Agent consolidation (S6-03 to S6-07) is sound

Unlike Parts 1 + 2, Part 3 is purely a filesystem + docs change:
- Merge Vision → War Machine: concatenate agent definitions.
- Retire Wasp, Songbird: move to `.claude/agents/_archived/`, update any
  references in specs + CLAUDE_agents.md.
- Command consolidation: the 31→12 split is aspirational IF presented as
  "settings-driven", but operationally achievable by moving skill files
  between `.claude/skills/` and `.claude/skills/_archived/`.

Staged execution still applies: one agent per session with regression
testing, per the original spec's warning.

### Recommendation

- **S6-01**: redesign per Pattern A (counter + marker + session-start
  handoff). No new primitives needed. Estimate: ~5pt implementation.
- **S6-02**: close as "blocked on SDK". Estimate: 0pt (spec-only note).
- **S6-03**: Vision → War Machine merge. Estimate: ~5pt, one session.
- **S6-04**: Wasp retirement. Estimate: ~3pt, one session.
- **S6-05**: Songbird retirement. Estimate: ~3pt, one session.
- **S6-06**: approach as "skill file moves", not settings config.
  Estimate: ~4pt, one session.
- **S6-07**: incremental docs updates as each agent ships. Estimate:
  ~2pt, folded into each of S6-03/04/05.

Revised Sprint v9-06 total: **~22pt** (unchanged headline), but
re-distributed. Down from 22pt + the unreachable 4.8k-token saving.

Lesson: `2026-04-20_verify-primitives-before-speccing.md`.

---

## Spec-vs-Reality Audit (2026-04-20 late PM)

Inventory of the filesystem found that most of Part 3 is already shipped.
The spec was written as "to do" but the moves happened in an unrecorded
prior session.

| Sub-sprint | Spec wrote | Actual state | Evidence |
|-----------|-----------|-------------|----------|
| S6-03 Vision → War Machine | "to merge" | ✅ DONE | `.claude/agents/_archived/vision.md` + `war-machine.md` line "QA Lead + Executor (absorbed Vision in v9)" |
| S6-04 Wasp retire | "to retire" | ✅ DONE | `.claude/agents/_archived/wasp.md`, not in active dir |
| S6-05 Songbird retire | "to retire" | ✅ DONE | `.claude/agents/_archived/songbird.md`, `coulson.md` notes "absorbed Songbird's content role" |
| S6-07 CLAUDE_agents.md | "to update" | ✅ DONE | Top of file reads "v9 Model: 10 agents", active table lists exactly 10 |
| S6-06 command consolidation | "31 → 12" | ⚠ partial | 29 commands in `.claude/commands/`, `_archived/` dir does not exist |
| S6-01 ScheduleWakeup auto-distill | "to implement" | ❌ not started | `post-tool-use.sh` does not increment a distill counter; no marker file logic |
| S6-02 tools.deferred | "to add to settings" | ❌ closed | SDK verification -- not a real schema key |

**True remaining work for Sprint v9-06**: only S6-01 (Pattern A) and
potentially S6-06 (if we actually want the 29 → 12 command cut). Everything
else in Part 3 landed; this spec just didn't record it. **Do not redo
S6-03/04/05/07 -- they are complete.**

**S6-06 decision point**: cutting 17 commands is user-facing; it breaks
workflows that typed e.g. `/aegis-flow` or `/aegis-launch`. The spec's
12-command target was aspirational and assumed the settings-based
deferral (S6-02). With S6-02 blocked, we have two options:
1. Leave all 29 commands active. User discovers via tab-completion.
   No token saving, but no breakage.
2. Move rarely-used commands to `_archived/` with a "deprecated" note
   at the top of each. Users typing the old name get a skill-not-found
   error -- mild friction, reversible.

Recommend option 1 until we have evidence of real user pain from 29
commands. The earlier "save 4.8k tokens" motivation was based on a
feature that doesn't exist, so the cost/benefit flipped.
