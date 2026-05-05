---
name: aegis-team
description: "Spawn a team — build, review, or debate"
triggers:
  en: team build, team review, team debate, spawn team
  th: ทีม, สปอนทีม
---

# /aegis-team

## Quick Reference
Unified team-spawn command. Replaces /aegis-team-build, /aegis-team-review,
/aegis-team-debate.

| Subcommand | Purpose |
|-----------|---------|
| `/aegis-team build` | Iron Man specs, Spider-Man builds, Black Panther reviews |
| `/aegis-team review` | Multi-agent review (Black Panther + Loki) |
| `/aegis-team debate` | Adversarial debate on design/approach |

## Modes

| Flag | Behavior | Source |
|------|----------|--------|
| `build` | Full build pipeline: spec → implement → review → test | was /aegis-team-build |
| `review` | Multi-agent review (Black Panther + Loki) | was /aegis-team-review |
| `debate` | Adversarial debate on design trade-offs | was /aegis-team-debate |

## Dispatch

Read the first argument after `/aegis-team`:
- If `build`: execute the full /aegis-team-build flow (spec → Spider-Man → Black Panther)
- If `review`: execute the full /aegis-team-review flow (Black Panther + Loki consolidated report)
- If `debate`: execute the full /aegis-team-debate flow (adversarial debate → decision logged)
- If missing: default to `build`

## Full Instructions

### build — Full Build Pipeline

1. Iron Man reviews/creates spec for the task
2. Spider-Man implements against the spec
3. Black Panther reviews the implementation
4. Loki adversarially tests the implementation
5. On PASS: return to Nick Fury
6. On FAIL: Spider-Man fix loop (max 2 rounds)

### review — Multi-Agent Review

1. Black Panther performs primary code review
2. Loki performs adversarial review
3. Captain America synthesizes findings
4. Consolidated report output
5. Return to Nick Fury

### debate — Adversarial Debate

1. Iron Man proposes design option A
2. Loki argues for option B or challenges A
3. Nick Fury moderates and decides
4. Decision logged to decision-audit.log
5. Return to Nick Fury

---

## Continuation Protocol (MBP / Golden Rule #7)

When this command finishes, do NOT pause to ask the human "what next?" — follow the chain defined in [command-chain.md](../references/command-chain.md). Only stop for MBP escalation categories: **Identity** / **Irreversible scope** / **External access** / **Explicit approval gate**.

If Nick Fury is offline, apply the chain directly and log the decision. Never fall back to asking the human as a substitute for the chain.
