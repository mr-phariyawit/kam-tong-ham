---
name: aegis-qa
description: "QA team: test planning, execution, and verdict (War Machine absorbed Vision in v9 consolidation)"
lead: war-machine
members: []
mode: tmux
requires: tmux
---

## Team Purpose
Quality assurance pipeline: War Machine plans tests, executes them, and issues the
verdict. (Pre-v9 this was a two-agent pipe -- War Machine planned, Vision executed,
War Machine verdicted. Sprint v9-06 merged Vision into War Machine, so War Machine
now owns all three phases solo.)

## Input Contract

```json
{
  "team": "qa",
  "trigger": "task_status == QA (set by Gate 1 PASS from build team)",
  "required_inputs": {
    "task_meta": ".aegis/brain/tasks/{TASK-ID}/meta.json",
    "spec": "_aegis-output/specs/{TASK-ID}-spec.md",
    "code_files": "list from handoff envelope artifacts",
    "review_report": "_aegis-output/reviews/{TASK-ID}-review.md",
    "gate_1_result": "PASS (from handoff envelope)"
  }
}
```

## Task Breakdown

### 1. War Machine (sonnet): Write test plan
- Reads: Spec (acceptance criteria), code files, review report
- Produces: `_aegis-output/qa/sprint-N/test-plan-{TASK-ID}.md`
- Each test case includes: ID, description, preconditions, steps, expected result, priority (P0-P3)

### 2. War Machine (sonnet): Execute test cases
- Reads: Own test plan from step 1
- Executes: Test cases via shell commands, manual verification steps
- Produces: `_aegis-output/qa/sprint-N/raw-results-{TASK-ID}.md`
- Per-test: ID, status (PASS/FAIL/SKIP/ERROR), actual result, duration, evidence
- Parallelism: if Nick Fury dispatches multiple QA tasks, War Machine can be
  spawned with `isolation: worktree` in parallel for independent test batches

### 3. War Machine (sonnet): Analyze results and issue verdict
- Reads: Own raw results from step 2, original test plan from step 1
- Produces: `_aegis-output/qa/sprint-N/qa-report-{TASK-ID}.md`
- Verdict: PASS, CONDITIONAL, or FAIL
- Gate 2 criteria: P0 tests 100%, overall >= 95%, 0 regressions

## Communication Flow
War Machine plan -> War Machine execution -> War Machine verdict -> Captain America / next team

(Internal phase handoffs are in-agent since v9-06; no inter-agent messages needed.)

## Output Contract

```json
{
  "from_team": "qa",
  "to_team": "compliance OR build",
  "task_id": "PROJ-T-XXX",
  "status": "QA_PASS OR QA_FAIL",
  "artifacts": {
    "test_plan": "_aegis-output/qa/sprint-N/test-plan-{TASK-ID}.md",
    "raw_results": "_aegis-output/qa/sprint-N/raw-results-{TASK-ID}.md",
    "qa_report": "_aegis-output/qa/sprint-N/qa-report-{TASK-ID}.md"
  },
  "gate_results": {
    "gate_2": "PASS or FAIL",
    "gate_2_reviewer": "war-machine",
    "gate_2_timestamp": "ISO timestamp",
    "pass_rate": "percentage",
    "regressions": 0
  }
}
```

## Handoff Rules
- **PASS** -> aegis-compliance team (Coulson verifies/generates ISO docs)
- **FAIL** -> back to aegis-build team with QA findings; task status -> IN_PROGRESS

## Skip Condition
Tasks under 3 story points skip QA team entirely. Black Panther's Gate 1 code review is sufficient.

## ISO Triggers
- **SI.05** (Test Report): Coulson generates after War Machine issues verdict

## Output
_aegis-output/qa/sprint-N/qa-report-{TASK-ID}.md
