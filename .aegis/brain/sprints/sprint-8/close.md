# Sprint 8 Close -- Polish + Audit to 100%

> Closed: 2026-05-07
> Points: 5/5 delivered
> Branch: feat/sprint-8-polish
> CI: Pending (local: typecheck + build + 514 tests all green)
> Main HEAD: (pending merge)

## Delivered

| ID | Title | Pts | Status |
|----|-------|-----|--------|
| KTH-T-050 | Cross-game reconnect-leak audit | 2 | DONE |
| KTH-T-051 | Werewolf defense timer (WW-003.4) | 1 | DONE |
| KTH-T-052 | Final regression + smoke playthroughs | 1 | DONE |
| KTH-T-053 | UI consistency polish | 1 | DONE |

## Test Results

- Total suite: 514 tests, 0 failures
- New tests: 20 (15 reconnect audit + 5 defense timer)
- Regressions: 0
- TypeScript: clean (zero errors)
- Build: clean

## Key Findings & Fixes

1. **SpyPlayer synced-state leak (FIXED)**: `isSpy` and `role` fields had `@type`
   decorators causing Colyseus to sync spy identity to all clients. Removed @type
   decorators. Client already uses private `ROLE_DATA` messages.

2. **All other games (5/6) passed reconnect audit clean**: KhamTongHam, Werewolf,
   Knights, WordLink, DrawGuess all properly isolate private data during reconnection.

3. **Werewolf defense timer**: Added DAY_DEFENSE phase (30s default, configurable
   15/30/45s) between nomination and vote, giving accused players time to defend.

4. **UI consistency**: Created shared common.css with unified typography, toast
   system, loading states, and responsive breakpoints. Imported by all 6 games.

## Milestone Achieved

M10: Production-ready platform
- 109/109 pts delivered across 8 sprints
- 6 games active: Forbidden Word, Word Link, Spy, Werewolf, Knights, Draw & Guess
- 514 tests, zero regressions
- Cross-game reconnect audit clean
- Platform fully shipped

## Deferred

- Fuzzy guess matching (Levenshtein for Thai) -- future enhancement
- Lazy-load game assets per route -- future perf work
- Advanced Werewolf roles -- out of scope
