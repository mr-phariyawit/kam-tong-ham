# Sprint 8 Plan -- Polish + Audit to 100%

> Created: 2026-05-07
> Duration: 1 session (final sprint)
> Velocity target: 5 pts
> Objective: Quality-first polish, reconnect-leak audit, final regression

## Sprint Goal

Ship the party platform at 100% quality -- no new games, no new mechanics.
Cross-game reconnect-leak audit, Werewolf defense timer, final regression
suite run, and targeted UI polish.

## Tasks

| ID | Title | Pts | Priority | Agent |
|----|-------|-----|----------|-------|
| KTH-T-050 | Cross-game reconnect-leak audit | 2 | P1 | Spider-Man + Loki |
| KTH-T-051 | Werewolf defense timer (WW-003.4) | 1 | P2 | Spider-Man |
| KTH-T-052 | Final regression + smoke playthroughs | 1 | P3 | War Machine |
| KTH-T-053 | UI consistency polish | 1 | P4 | Spider-Man |

Total: 5 pts

## Priority Order

1. P1 (KTH-T-050): Reconnect audit -- correctness, spans all 6 rooms
2. P2 (KTH-T-051): Defense timer -- deferred SHOULD from Sprint 5
3. P3 (KTH-T-052): Regression + smoke -- runs LAST on polished branch
4. P4 (KTH-T-053): UI consistency -- nice-to-have, smallest scope

## Minimum Viable Sprint

If time/scope pressure: ship P1 + P3 (audit + regression) at minimum.
P2 and P4 are nice-to-have. Quality > completeness.

## Deferred (not this sprint)

- Fuzzy guess matching (Levenshtein for Thai near-misses) -- Sprint 9-or-never
- Lazy-load game assets per route -- future perf work
- Advanced Werewolf roles (Hunter, Witch, Cupid, Bodyguard) -- out of scope

## Definition of Done

- All tests green (>=494 + new tests for audit/timer)
- Reconnect audit report written
- No privacy leaks found (or all fixed)
- README updated
- Roadmap at 109/109 pts
- PR merged to main with CI green
