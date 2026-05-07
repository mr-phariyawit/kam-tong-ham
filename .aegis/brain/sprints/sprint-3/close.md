# Sprint 3 Close: Word Link (คำเชื่อม)

> Closed: 2026-05-07
> Duration: 1 session (same-day sprint)
> Points delivered: 17 pts (7/7 tasks DONE)
> PR: #2 (merged to main via rebase)

## Objective: ACHIEVED

Shipped Word Link (คำเชื่อม) as the second playable game on the platform.
Game is fully functional end-to-end: lobby -> team assignment -> spymaster clue ->
team guessing -> win/lose -> game over with full grid reveal.

## Task Summary

| ID | Title | Pts | Status |
|----|-------|-----|--------|
| KTH-T-013 | WordLinkState schema + WordLinkPlayer | 2 | DONE |
| KTH-T-014 | WordLinkRoom class (game logic) | 3 | DONE |
| KTH-T-015 | Grid generation + color assignment | 2 | DONE |
| KTH-T-016 | Spymaster clue + team guess flow | 3 | DONE |
| KTH-T-017 | Win condition detection + game over | 2 | DONE |
| KTH-T-018 | Client UI (game page, grid, clue input) | 3 | DONE |
| KTH-T-019 | Word Link test suite (42 tests) | 2 | DONE |

## Key Decisions

1. **Game selection**: Word Link chosen over Werewolf (roadmap override).
   Rationale: lowest risk, reuses wordpacks, validates team-based BaseRoom.
   Werewolf deferred to Sprint 5.

2. **Word source**: Used "common" category from existing wordpack infrastructure.
   No new data files needed.

3. **Color distribution**: 9 red / 8 blue / 7 neutral / 1 assassin (standard Codenames).

4. **Team assignment**: Server auto-divides via round-robin shuffle.
   First player on each team becomes spymaster.

5. **Turn limit**: number + 1 guesses per clue (zero-clue = unlimited).

6. **Room lookup API**: Updated GET /api/rooms/:code to query all room types
   (was only querying kham_tong_ham).

## Test Results

- Before sprint: 220 tests, 16 files
- After sprint: 262 tests, 17 files (+42 new, +1 file)
- Zero regression on existing tests
- gameRegistry test updated (REG-09 now expects 2 active games)

## Velocity

- Estimated: 17 pts (adjusted from spec's 11pt)
- Delivered: 17 pts
- Sprint 2 velocity: 18 pts
- Cumulative: 47 pts delivered across 4 sprints (0-3)

## Carry-over

None. All tasks completed.

## Sprint 4 Recommendation

**Spy (สายลับ)** -- 11 pts estimated.
- Location deduction game, clean mechanic
- Needs new data: 30+ Thai locations with roles (SP-004)
- Medium complexity, natural follow-up after Word Link
- Spec sections: SP-001 through SP-004
