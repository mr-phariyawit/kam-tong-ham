---
name: aegis-plus-pilot
description: "Pilot-week orchestrator for v11 Phase-1 → Phase-2 gate. Use this skill to bootstrap an external project as the AEGIS-Plus pilot, run end-of-day captures during the pilot week, and measure the Phase-2 gate (≥2 of 3 signals) on Day 7. Triggers on 'pilot week', 'bootstrap pilot', 'gate check', 'phase-2 gate', 'pilot status', 'ตรวจ gate', 'รัน pilot'."
profile: standard
triggers:
  en: ["pilot week", "bootstrap pilot", "gate check", "phase-2 gate", "pilot status", "daily eod"]
  th: ["ตรวจ gate", "รัน pilot", "เช็ค pilot", "วันสุดท้าย pilot"]
---

## Quick Reference

`aegis-plus-pilot` codifies the pilot procedure from AEGIS-Plus Mega Plan §10 Step 2 into three executable scripts. Phase-2 (v11-05..08, 32pt) cannot kick off until this gate passes — that's the autonomous hold Nick Fury enforces after v11 Phase-1 ships.

| Script | When | What it does |
|---|---|---|
| `tools/aegis-plus-pilot/bootstrap.sh` | Day 0 (once) | Installs AEGIS into the pilot project, verifies the 4 v11 P1 skills + 12 tool files landed, configures issue prefix, seeds friction log |
| `tools/aegis-plus-pilot/daily-eod.sh` | Every weekday end | Prints today's activity / week stats / open issues / fifo health, appends a friction-log template |
| `tools/aegis-plus-pilot/gate-check.sh` | Day 7 | Measures the 3 Phase-2 signals; exits 0 if ≥2 met (gate open), 1 otherwise (gate hold) |

## The 3 Phase-2 signals (Mega Plan §14 D6)

| # | Signal | Threshold |
|---|---|---|
| 1 | Prevented-incident value | ≥1 actionable err/warn/block event surfaced via activity log this week |
| 2 | Audit-query value | ≥3 manual invocations of activity-logger view/stats or issue list/show |
| 3 | Run-replay value | ≥1 mention of "replay" / "reconstruct" / "looked back" in friction log |

Phase-2 opens iff ≥2 of 3.

## When to invoke

- Starting the pilot week → run `bootstrap.sh <pilot-project>`
- End of any working day during pilot → run `daily-eod.sh <pilot-project>`
- Day 7 → run `gate-check.sh <pilot-project>` then come back to AEGIS-Team with the verdict

## Day-0 bootstrap

```bash
# Default issue prefix derived from project basename
bash tools/aegis-plus-pilot/bootstrap.sh ~/Documents/kam-tong-ham

# Or explicit
bash tools/aegis-plus-pilot/bootstrap.sh --prefix KTH ~/Documents/kam-tong-ham
```

What it does:
1. Runs `install.sh --upgrade` (if `.aegis/` exists) or fresh install
2. Verifies all 4 v11 P1 skills + 12 tool files landed
3. Sanity-checks PostToolUse hook wiring (live-tail emit + activity-logger log)
4. Seeds `.aegis/brain/issues/_config.yaml` with the prefix
5. Creates `.aegis/brain/{live,activity,memory}/` if absent
6. Seeds `.aegis/brain/memory/aegis-plus-feedback.md` with the friction-log header

Refuses to bootstrap the meta source repo into itself.

## Daily end-of-day

```bash
bash tools/aegis-plus-pilot/daily-eod.sh ~/Documents/kam-tong-ham
```

Prints:
- Top 50 lines of today's activity
- This week's day×tool grid
- Open issues (in_progress + todo)
- fifo health check (warns if pane closed)

Appends today's friction template if not already present:

```markdown
## YYYY-MM-DD
- ✅ what worked:
- ⚠️ friction:
- 💡 ideas:
- 🔍 Phase-2 signal seen today (prevented-incident / audit-query / run-replay):
```

You fill in the bullets manually.

## Day-7 gate check

```bash
bash tools/aegis-plus-pilot/gate-check.sh ~/Documents/kam-tong-ham
```

Output: signal-by-signal report + verdict.

| Verdict | Exit | Meaning |
|---|---|---|
| **GATE OPEN** | 0 | ≥2 of 3 signals met → "go phase 2" |
| **GATE HOLD** | 1 | <2 signals → run another pilot week, or de-scope Phase-2 |

## Tests

```bash
bash tests/aegis-plus-pilot-test.sh
```

## References

- `~/Documents/AEGIS-PLUS-MEGA-PLAN.md` §10 (Migration & Rollout) and §14 (Decision Points)
- `.aegis/brain/sprints/sprint-v11-04/close.md` — Phase-1 close + Phase-2 gate ref
- `.aegis/brain/human-queue.md` — bootstrap-into-external-project decision sits here pending human approval
