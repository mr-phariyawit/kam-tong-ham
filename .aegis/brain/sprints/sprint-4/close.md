# Sprint 4 Close: Spy (สายลับ)

> Closed: 2026-05-07
> Duration: 1 session (same-day sprint)
> Points delivered: 11 pts (6/6 tasks DONE)
> PR: #3 (pending merge)

## Objective: ACHIEVED

Shipped Spy (สายลับ) as the third playable game on the platform.
Game is fully functional end-to-end: lobby -> role reveal -> discussion ->
accusation/voting -> spy guess -> game over with full role reveal.

## Task Summary

| ID | Title | Pts | Status |
|----|-------|-----|--------|
| KTH-T-020 | Location data file (36 Thai locations) | 2 | DONE |
| KTH-T-021 | SpyState schema + SpyPlayer | 1 | DONE |
| KTH-T-022 | SpyRoom class (game lifecycle) | 3 | DONE |
| KTH-T-023 | Timer + accusation flow | 2 | DONE |
| KTH-T-024 | Client UI (all screens) | 2 | DONE |
| KTH-T-025 | Spy test suite (49 tests) | 1 | DONE |

## Key Decisions

1. **Location data**: 36 Thai-themed locations (exceeded 30 target).
   Categories: institutions, travel, entertainment, city, rural, sports, events.
   Each location has exactly 8 plausible roles in Thai.

2. **Timer mechanic**: Server-authoritative countdown, configurable 5-8 minutes.
   When timer expires, spy gets 30-second window to guess location.
   If spy doesn't guess, they win by survival.

3. **Accusation flow**: Any player can accuse during discussion. Accused
   cannot vote. Majority required to convict (>50% of voters).
   Unanimous conviction gives +1 bonus score.

4. **Spy disconnect**: If spy disconnects during game, hunters win immediately
   (prevents griefing/abandonment).

5. **BaseRoom GAME_OVER phase**: Added GAME_OVER to allowed phases for
   START_GAME (play again). Previously only LOBBY and SCOREBOARD were allowed.
   This is a non-breaking enhancement used by Spy's play-again flow.

6. **Spy guess during discussion**: Spy can choose to reveal and guess at
   any time (not just after timer expiry). This matches Spyfall's "spy calls
   it" mechanic -- adds strategic tension.

## Test Results

- Before sprint: 262 tests, 17 files
- After sprint: 311 tests, 18 files (+49 new, +1 file)
- Zero regression on existing tests
- gameRegistry test updated (REG-09 now expects 3 active games)
- Location data integrity tests: uniqueness, Thai characters, role count

## Velocity

- Estimated: 11 pts
- Delivered: 11 pts
- Sprint 3 velocity: 17 pts
- Sprint 2 velocity: 18 pts
- Cumulative: 58 pts delivered across 5 sprints (0-4)
- Platform progress: 58/109 pts (53%)

## Carry-over

None. All tasks completed.

## Sprint 5 Recommendation

**Werewolf (หมาป่า)** -- 18 pts estimated.
- Social deduction game with roles (wolves, seer, doctor, villagers)
- Night/day phase cycle, elimination voting
- Most complex game remaining -- needs careful state machine design
- Validates BaseRoom for multi-phase, multi-role gameplay
- Spec sections: WW-001 through WW-004
