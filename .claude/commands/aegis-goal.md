---
name: aegis-goal
description: "Persistent goal POC — Hermes Ralph-loop pattern (judge-loop until done or 20-turn budget)"
triggers:
  en: goal, set goal, persistent goal, keep working
  th: เป้าหมาย, ตั้งเป้า, ทำต่อจนกว่า
---

# /aegis-goal — Persistent Goal (POC)

## Quick Reference

POC adoption of Hermes Agent's `/goal` Ralph-loop pattern. Keeps a goal alive across turns. After each agent response, a judge evaluates whether the goal is satisfied; if not, work continues. Stops on: judge=yes / user message / 20-turn budget / explicit clear.

⚠️ **POC status**: shipped in sprint-v14-04 with heuristic judge (keyword grep). Real LLM judge integration is gated on the measurement campaign at `.aegis/brain/learnings/v14-04-goal-pattern-methodology.md`. Use this command for experimentation; promotion to canonical depends on POC measurement outcomes.

## Subcommands

| Form | Effect |
|------|--------|
| `/aegis-goal <text>` | Set or replace the goal |
| `/aegis-goal status` | Show current status |
| `/aegis-goal pause` | Stop auto-continuation |
| `/aegis-goal resume` | Resume from paused |
| `/aegis-goal clear` | Remove the goal |

## Implementation

Backed by `tools/aegis-goal/judge.sh` (verdict generator) and `tools/aegis-goal/state.sh` (per-session YAML state at `.aegis/brain/state/goal-<session>.yaml`).

**Judge modes**:
- `--mode heuristic` (default in POC) — keyword scan, free, instant. Suitable for testing loop mechanics.
- `--mode llm` — placeholder for real Claude call via routing/policy.yaml. **NOT wired in v14-04**; returns error with integration instructions.

**State schema** (session-scoped):
```yaml
session_id: <id>
goal: "<text>"
status: active | paused | achieved | exhausted | cleared
turn_count: <int>
max_turns: 20
created_at: ISO8601
updated_at: ISO8601
judge_history: [{turn, verdict, reason, ts}, ...]
```

**Stop conditions**:
1. Judge returns `verdict=yes` → status `achieved`
2. User sends a new message → user takes over
3. `turn_count >= max_turns` (default 20) → status `exhausted`
4. `/aegis-goal clear` → file deleted
5. `/aegis-goal pause` → status `paused` (resumable)

## Why this is POC

The Hermes pattern requires a judge model call after every turn, which:
- Adds cost ($0.05–0.10/session estimated at Haiku tier)
- Adds latency (~1–2s per turn)
- Risks false-positive completion claims (silent task abandonment)

Before promoting `/aegis-goal` to canonical, the measurement campaign at [v14-04-goal-pattern-methodology.md](../../.aegis/brain/learnings/v14-04-goal-pattern-methodology.md) must demonstrate:
- judge cost < $0.10/session
- false-positive rate < 10%
- user-interrupt rate < 30%

## Continuation Protocol (MBP / Golden Rule #7)

This command does NOT escalate to the human — it self-judges via the configured mode and either continues or stops per the rules above. When the goal achieves or exhausts, apply the chain in [command-chain.md](../references/command-chain.md).
