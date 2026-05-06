---
name: aegis-router
description: "Pick the right Claude model tier (opus/sonnet/haiku) for a subagent task based on quality fit, not cost. Use this skill whenever the user wants to route a task to the appropriate model, decide which model fits a job, or audit routing decisions. Triggers on 'route to model', 'pick model', 'which model for', 'model tier', 'audit routing', 'เลือก model', 'router', 'ใช้ opus หรือ sonnet'."
profile: standard
triggers:
  en: ["route to model", "pick model", "which model for", "model tier", "audit routing", "router decide"]
  th: ["เลือก model", "ใช้ opus หรือ sonnet", "router", "เลือกโมเดล"]
reads: [".aegis/brain/routing/policy.yaml"]
writes: []
wires: []
tests: ["tests/aegis-router-test.sh"]
supersedes: []
---

## Quick Reference

`aegis-router` picks the subagent model tier based on **quality fit** (per Mega Plan v1.1: unlimited budget — optimization target shifted from cost to right-tool-for-the-job). It is a CLI helper plus a discipline; the actual `Agent({...})` call is still made by Claude.

- **Helper**: `tools/aegis-router/route.mjs`
- **Policy**: `.aegis/brain/routing/policy.yaml` (project override → meta default)
- **Audit log**: `.aegis/brain/logs/routing-audit.log` (one JSON per decision)

## When to invoke

- Spawning an `Agent` subagent and unsure which tier fits
- Reviewing routing patterns across a session (audit log)
- Tuning routing policy after a quality miss

## Model tiers (default policy)

| Tier | When to pick |
|---|---|
| **opus**   | Loki / Havoc adversarial reviews · Iron Man architecture · design / trade-off questions |
| **sonnet** | Spider-Man / Thor / War Machine implementation · standard reviews · refactor · tests |
| **haiku**  | Quick lookups / `ls` / `grep` / file enumeration · trivial substitutions · short prompts |

## Workflow

```bash
# 1. Ask the router for a recommendation
node tools/aegis-router/route.mjs --task "review SPEC.md adversarially" --persona loki
# → picked: opus / reason: Adversarial / red-team review benefits from highest reasoning depth

# 2. Use the recommendation in the Agent call (Claude does this)
# Agent({ subagent_type: "loki", model: "opus", ... })

# 3. Manual override always wins
node tools/aegis-router/route.mjs --task "implement test fix" --persona spider-man --model opus
# → picked: opus / reason: operator override (--model)
```

## Worked examples

### 1. Architecture review (opus)
```bash
node tools/aegis-router/route.mjs \
    --task "design a system for sprint v11-07 archive layer" \
    --persona iron-man
# → opus (rule: architecture-opus)
```

### 2. Test implementation (sonnet)
```bash
node tools/aegis-router/route.mjs \
    --task "write vitest tests for wordPool dedup logic" \
    --persona spider-man
# → sonnet (rule: implementation-sonnet)
```

### 3. Quick file lookup (haiku)
```bash
node tools/aegis-router/route.mjs --task "list .ts files in src/"
# → haiku (rule: tight-task-haiku — short task with "list" keyword)
```

### 4. Adversarial spec review (opus)
```bash
node tools/aegis-router/route.mjs \
    --task "find every weakness in this spec" \
    --persona loki
# → opus (rule: adversarial-review-opus)
```

## Policy schema

Edit `.aegis/brain/routing/policy.yaml` to customize. Each rule supports:

- `when_persona: [list]` — match against the active persona name
- `when_keyword: [list]` — match against task description (case-insensitive)
- `when_length: N` — minimum task description length
- `when_max_length: N` — maximum task description length

First match wins. Order rules from most-specific to least-specific.

## Audit log

```json
{"ts":"2026-05-05T10:00:00Z","task_summary":"design v11-07 layer","persona":"iron-man","picked":"opus","reason":"...","rule":"architecture-opus","override":false}
{"ts":"2026-05-05T10:01:00Z","task_summary":"implement test fix","persona":"spider-man","picked":"opus","reason":"operator override (--model)","rule":null,"override":true}
```

Review with:
```bash
node tools/aegis-activity-logger/view.mjs --tool Bash --since 7d | grep aegis-router
# Or directly:
cat .aegis/brain/logs/routing-audit.log | tail -20
```

## Tests

```bash
bash tests/aegis-router-test.sh
```

## References

- `~/Documents/AEGIS-PLUS-MEGA-PLAN.md` §7.2
- `.aegis/brain/sprints/sprint-v11-06/plan.md`
- `.aegis/brain/routing/policy.yaml` (default policy, editable per-project)
