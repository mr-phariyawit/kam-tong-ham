# Sprint Continuation Protocol

> **Purpose**: eliminate the silent stall at sprint end. Historically,
> `/aegis-sprint close` printed "Ready for: /aegis-sprint plan" and stopped.
> The next step required either a human typing the command or Nick Fury
> happening to re-scan on the next turn. This protocol makes sprint rollover
> autonomous.

## The problem

Three concrete failure modes were observed:

1. **Dead-end close.** `/aegis-sprint close` Step 9 is terminal. It prints a
   hint but doesn't re-enter Nick Fury's decision loop. Nick Fury then waits
   for the next user message before picking a new priority.

2. **"Prompt user for stories" anti-pattern.** `/aegis-sprint plan` Error
   Handling said: *"No backlog exists: create backlog.md and prompt the user
   to add stories."* That violates the Master Brain Protocol -- Nick Fury is
   the only agent allowed to ask the human, and even then only for the four
   allowed escalation categories. "What should the next stories be?" is a
   scope/design question, not an identity/irreversible/secret/approval one.

3. **Decision Matrix gap.** P7.5 covers *"no active sprint BUT backlog
   exists"*. There was no rule for *"sprint just closed, decide what's next"*
   or *"backlog empty AND spec exists"*. Both cases fell through to P9
   (optimize) or to nothing at all, causing Nick Fury to stall.

## The fix (four pieces)

### 1. P7.4 Decision Matrix entry (new, higher than P7.5)

**Signal**: `.aegis/brain/sprints/sprint-<N>/close.md` exists AND
`.aegis/brain/sprints/current` does not point to an open sprint.

**Action** (in order):
1. Read `close.md` for carry-over tasks and velocity.
2. If `backlog.md` has >= 1 story OR carry-over count > 0:
   → run `/aegis-sprint plan` for sprint N+1, honoring rolling-avg capacity.
3. If backlog is empty but `_aegis-output/iso-docs/SI-01-requirements-spec/`
   has unfinished requirements (i.e., SI.02 traceability shows REQ rows
   without DONE mapping):
   → spawn Iron Man with a `QUESTION_TO_BRAIN`-style internal prompt:
   "Given SI.01 + closed sprints, produce next 3-5 candidate stories.
   Prefer requirements with zero tasks mapped." Iron Man emits draft stories
   to `.aegis/brain/backlog.md`. Then loop to step 2.
4. If SI.01 has no unmapped requirements AND no carry-over:
   → sprint/project is effectively DONE. Escalate to human per Master Brain
   Protocol category 4 (explicit approval gate): "Spec fully delivered.
   Close project or expand SI.01?" Log the decision request to
   `.aegis/brain/logs/decision-audit.log` with source=judgment,
   confidence=1.0 (unambiguous state), escalate to the human.

### 2. `/aegis-sprint close` Step 10 -- re-enter decision loop

After the summary display (Step 9), the skill adds:

> **Step 10: Re-scan for next priority**
>
> - Announce: "Sprint N closed. Rescanning project state..."
> - Nick Fury runs its standard scan (git, tests, specs, deps, kanban).
> - Nick Fury picks the first actionable priority (expected P7.4 per above).
> - Announce the chosen action and dispatch.
> - Do NOT return control to the human. This is the whole point of L3
>   autonomy -- the loop continues without a prompt.

The announcement MUST appear before the dispatch so the human observer
can interrupt with Ctrl+C if they disagree. This preserves watchability
without blocking.

### 3. `/aegis-sprint plan` Error Handling rewrite

**Before:**
> "No backlog exists: Create `backlog.md` with a header and prompt the user
> to add stories."

**After:**
> "No backlog exists: route through Nick Fury's Master Brain Protocol. Nick
> Fury decides based on spec state:
> - If SI.01 has unmapped requirements -> spawn Iron Man to draft stories
>   (see P7.4 step 3 in `nick-fury.md`).
> - If SI.01 is fully mapped and no carry-over -> escalate to human as
>   approval-gate (category 4).
> - If no SI.01 -> P8 (no spec) takes over: run `/super-spec` chain first.
>
> The skill never prompts the user directly. It returns to the orchestration
> layer with a structured state and lets Nick Fury decide."

### 4. Nick Fury STEP 3 in the flow diagram

Replace:
```
STEP 2 — Sprint close:
   /aegis-sprint close
```

With:
```
STEP 2 — Sprint close:
   /aegis-sprint close
   (Step 10 auto-invokes the decision loop)

STEP 3 — Rollover:
   Decision Matrix re-scan. Expected pick: P7.4.
   Then back to STEP 1 for sprint N+1 unless P7.4 step 4 fires
   (project complete -> escalate).
```

This makes the continuation explicit in the doc, not just implicit in
P7.4's existence.

## Implementation checklist

- [x] `.claude/agents/nick-fury.md` — new P7.4 row in Decision Matrix
- [x] `.claude/agents/nick-fury.md` — STEP 3 in flow diagram
- [x] `.claude/commands/aegis-sprint.md` — Step 10 in close subcommand
- [x] `.claude/commands/aegis-sprint.md` — Error Handling rewrite
- [ ] Behavioral validation: close a real sprint, observe P7.4 fires and
      /aegis-sprint plan runs without human prompt. Next real sprint.
- [ ] Empty-backlog validation: delete backlog, close sprint, verify Iron
      Man draft-story path activates instead of human prompt. Next real
      sprint.

## Why not just "auto-plan on close"?

Tempting shortcut: have `/aegis-sprint close` directly call
`/aegis-sprint plan` at the end. Rejected because:

1. **Loses context-awareness.** P0/P1 incidents might have emerged during
   the sprint close step itself (e.g., deploy health failed). Nick Fury
   should re-scan, not blindly plan.
2. **Hides the decision.** Auto-plan hardcodes "next sprint" as the answer.
   P7.4 explicitly considers "spec exhausted -> escalate" and "spec gap
   -> /super-spec chain" as alternatives. The Decision Matrix is where
   those branches live.
3. **Violates single-source-of-decisions.** Nick Fury owns the Decision
   Matrix. Every other skill routes through it. Direct chaining would be
   a special case.

## Observability

Every P7.4 activation MUST log to `.aegis/brain/logs/decision-audit.log`:

```jsonl
{"ts":"<ISO>","decision_id":"D-NNN","question":"post-sprint rollover","source":"judgment","confidence":0.9,"answer":"P7.4 -> /aegis-sprint plan","reasoning":"sprint <N> closed with <M> carry-over, backlog has <K> stories"}
```

When P7.4 step 3 fires (Iron Man story draft), log one additional entry
per story generated with source=judgment and confidence=0.6-0.8.

When P7.4 step 4 fires (escalate as approval gate), log with
source=judgment, confidence=1.0, and note that escalation is the category
4 exception, not a routine question.

## Acceptance Criteria

- [x] Protocol documented (this file)
- [x] Decision Matrix entry P7.4 added
- [x] Sprint close Step 10 added
- [x] Sprint plan error handling rewritten
- [ ] First real rollover happens autonomously (no human prompt, no stall)
- [ ] decision-audit.log records the P7.4 activation
