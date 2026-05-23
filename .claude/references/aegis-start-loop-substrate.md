<!-- version: 1.0.0 -->
<!-- Last updated: 2026-05-13 -->

# `/aegis-start` loop substrate — internal reference

> **Audience: agents reading this file as part of executing /aegis-start. NOT user-facing.**
> See [command-audience.md](command-audience.md) for the user-vs-team split principle.

When `/aegis-start` reaches Step 4 (Activate Nick Fury), the team has a choice of loop primitive:

1. **CC 2.1.139+ `/goal`** — native cross-turn continuation
2. **Subagent + SendMessage heartbeat** — legacy fallback for older CC versions

Detection is automatic. The user never sees the choice.

## Path A — `/goal` (CC 2.1.139+, preferred)

Open `/goal` with the AEGIS exit-condition text:

```
/goal Continue executing AEGIS Decision Matrix per .claude/agents/nick-fury.md
      until ONE of:
        (a) all kanban TODO/IN_PROGRESS for the current sprint reach DONE,
        (b) BLOCK 0 documents are missing and Coulson needs to run first,
        (c) MBP escalation category 1-4 triggers (Identity / Irreversible
            scope / External access / Explicit approval gate),
        (d) tests/lint go red and require a hotfix before further work,
        (e) context budget exceeds 80%.
      On each turn:
        1. SCAN (git, tests, sprint, kanban, specs, deps, debt)
        2. Apply Decision Matrix P0-P10 from nick-fury.md
        3. Announce decision with rationale BEFORE acting
        4. Dispatch sub-agents (Agent tool, run_in_background=true)
        5. Log decision to .aegis/brain/logs/activity.log + decision-audit.log
        6. Verify-before-claim — no "done" without a passing test
      Persona overlay: read .claude/agents/nick-fury.md for full protocol.
```

CC handles the heartbeat (cross-turn continuation, overlay panel, agent-id propagation, cost runaway protection). Nick Fury's persona handles the policy at each turn.

## Path B — Legacy subagent (older CC)

If `/goal` is not available (CC < 2.1.139 or command returns "unknown command"):

```
Agent tool call:
  subagent_type: "nick-fury"
  name: "nick-fury"
  mode: "bypassPermissions"
  run_in_background: true
  prompt: |
    You are 🧬 Nick Fury — the autonomous controller of AEGIS.
    Read .claude/agents/nick-fury.md for your full protocol.

    SESSION CONTEXT:
    - Date: [current date]
    - Autonomy: L3 (Autonomous)
    - Profile: [tier]
    - Context budget: [X]%
    - Handoff data: [summary from Step 2, or "none"]
    - Brain resonance: [key points from Step 2]

    IMMEDIATE ACTIONS:
    1. Run your first SCAN (git, tests, sprint, kanban, specs, deps, debt)
    2. Apply Decision Matrix — pick highest-priority action
    3. Announce your decision
    4. DISPATCH sub-agents to execute (use Agent tool, run_in_background=true)
    5. Enter HEARTBEAT LOOP:
       - Monitor spawned agents via SendMessage
       - Nudge agents idle > 120s
       - Re-spawn agents that timeout > 300s
       - After each task completes: verify gates, log results, pick next task
       - Check context budget each cycle
       - Continue until context >= 80% or all tasks done
    6. When wrapping up: log final state to activity.log, report summary

    RULES:
    - NEVER ask "what would you like to do?" — analyze, decide, execute
    - ALWAYS announce decisions with rationale before acting
    - ALWAYS spawn sub-agents with run_in_background=true
    - ALWAYS include SUCCESS CRITERIA in sub-agent prompts
    - ALWAYS instruct sub-agents to SendMessage back when done
    - Log every decision to .aegis/brain/logs/activity.log
```

The subagent runs the same Decision Cycle as Path A. The only difference is who drives the loop: CC (`/goal`) vs the subagent itself (manual SendMessage polling).

## Detection logic

Try Path A first. If `/goal` returns "unknown command" or otherwise errors before accepting the goal-text, fall to Path B.

There is no version-string check — the runtime probe is the authoritative signal.

## What both paths share

- Nick Fury persona (`.claude/agents/nick-fury.md`) is the brain
- Decision Matrix P0–P10 is the policy
- BLOCK 0 gates run first
- MBP escalation categories 1–4 are the only paths to the human
- Activity log + decision-audit log are the audit trail
- Verify-before-claim is the completion rule

## Provenance

- Decision: sprint-v15-01-cc21-goal-spike (HYBRID)
- Wiring: sprint-v15-02-goal-loop-substrate
- Transparency refactor: sprint-v15-06-transparent-skill-model (extracted from `/aegis-start` Step 4 into this ref doc)
