<!-- version: 1.0.0 -->
<!-- Last updated: 2026-05-13 -->

# Command audience model — who types what

## Principle

The **human types `/aegis-start`**. The **team uses every other AEGIS skill internally**.

A user shouldn't need to learn the AEGIS command set to get value from the framework. The agent team — Nick Fury, Captain America, Iron Man, Spider-Man, War Machine, Black Panther, Coulson, Thor, Loki, Beast — drives the work using the full command set as **its** tools. The human is the principal, not the operator.

## Two audiences

### User commands (thin surface, ~5)

| Command | When the user types it |
|---|---|
| `/aegis-start` | Begin a session — the team takes over |
| `/aegis-status` | Quick health snapshot mid-session |
| `/aegis-mode` | Change autonomy level or profile |
| `/aegis-handoff` | Save state before quitting |
| `/aegis-upgrade` | Maintenance (rare) |

These are the entire user-facing slash-command surface. A non-developer-operator could run AEGIS knowing only these.

### Team commands (~11) — invoked by Nick Fury / Captain America / agents

| Command | Who invokes it (typical) |
|---|---|
| `/aegis-sprint plan/standup/review/retro/status/close` | Captain America during sprint ceremonies |
| `/aegis-breakdown` | Iron Man + Coulson when SI.01 has unmapped requirements |
| `/aegis-pipeline` | Nick Fury for full-cycle analysis runs |
| `/aegis-team` | Nick Fury when fanning out a parallel build |
| `/aegis-verify` | War Machine before gating a story to DONE |
| `/aegis-deploy` | Thor with explicit human approval gate |
| `/aegis-retro` | Captain America at session/sprint end |
| `/aegis-memory` | Beast for brain ingestion or distill |
| `/aegis-linear` | Captain America after every kanban write (one-way mirror sync) |
| `/aegis-goal` | Nick Fury when setting an explicit completion condition |
| `/aegis-decisions` | Beast for decision-audit FTS queries |

## What this means in practice

When a user types `/aegis-start`, they should NOT see:
- "Loop substrate selection: if /goal then... else..."
- "Sprint plan needed first — calling /aegis-sprint plan now"
- "Triggering /aegis-linear sync after kanban write"

They SHOULD see:
- Brain load banner (loaded N learnings, M ADRs, sprint pointer)
- Human queue (if pending)
- Linear health (one line, GREEN/YELLOW/RED only)
- Nick Fury banner
- Decisions and dispatches announced AS Nick Fury would announce them

All the team commands run **transparently inside** the autonomous loop. Their existence is implementation detail — not user knowledge.

## When team commands DO surface to the user

Two narrow exceptions:
1. **MBP escalation** — when a decision belongs in one of the 4 categories (Identity / Irreversible scope / External access / Explicit approval gate), Nick Fury routes through `.aegis/brain/human-queue.md`. The user sees a banner; the team waits.
2. **Explicit user request** — if the user types `/aegis-sprint plan` directly, that's fine — they're operating at a deeper layer voluntarily. The default flow doesn't surface team commands.

## Why this matters

**Cognitive load**. AEGIS has 16 canonical commands. A user who needs to know all 16 to use the framework will not use the framework. A user who knows only `/aegis-start` and lets the team handle everything else has an ergonomic, learnable system.

**Composability**. Team commands are AEGIS's internal API. Treating them as user-facing UI freezes the API surface — every refactor becomes a breaking change. Treating them as internal tools lets the framework evolve without burdening the user.

**Principal vs operator**. The user is the principal: they say what they want done. The team are the operators: they figure out how. AEGIS commands are operator tools. Putting them in front of the principal inverts the relationship.

## Related

- [`.claude/references/aegis-start-loop-substrate.md`](aegis-start-loop-substrate.md) — internal substrate-selection logic (the kind of detail this doc says should NOT be in `/aegis-start`)
- [`CLAUDE.md`](../../CLAUDE.md) — Master Brain Protocol (which 4 categories DO reach the human)
- [`.claude/agents/nick-fury.md`](../agents/nick-fury.md) — the team's autonomous controller
