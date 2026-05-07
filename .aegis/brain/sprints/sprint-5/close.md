# Sprint 5 Close: Werewolf (หมาป่า)

> Closed: 2026-05-07
> Duration: 1 session
> Points delivered: 18 pts (8/8 tasks DONE)
> PR: pending (feat/sprint-5-werewolf)

## Objective: ACHIEVED

Shipped Werewolf (หมาป่า) as the fourth playable game on the platform.
Full social deduction game with night/day cycle, role secrecy, and
wolf vs village win conditions. Most complex game on the roadmap -- delivered
in a single sprint.

## Task Summary

| ID | Title | Pts | Status |
|----|-------|-----|--------|
| KTH-T-026 | WerewolfState schema + WerewolfPlayer | 2 | DONE |
| KTH-T-027 | WerewolfRoom -- phase machine + role assignment | 3 | DONE |
| KTH-T-028 | Night phase -- wolf vote, seer peek, doctor save | 3 | DONE |
| KTH-T-029 | Day phase -- discussion, nomination, elimination vote | 2 | DONE |
| KTH-T-030 | Win condition resolver + game-over flow | 2 | DONE |
| KTH-T-031 | Reconnect handling (no info leak) | 1 | DONE |
| KTH-T-032 | Client UI (role reveal, night/day, voting) | 3 | DONE |
| KTH-T-033 | Werewolf test suite (60 tests) | 2 | DONE |

## Key Decisions

1. **Atomic night resolution (Loki H1)**: All night actions (wolf vote, seer peek,
   doctor save) collected independently and resolved in a single `resolveNight()`
   function at timer expiry. No partial state broadcast during night.

2. **Fixed-duration night (Loki H2)**: Night timer always runs to completion
   (default 30 seconds) regardless of when actions are submitted. This prevents
   timing attacks where players infer roles from night duration.

3. **Server-side roles (Loki M3)**: Player roles stored in a private Map on the
   server, never in synced `@type` state. The `revealedRole` field on WerewolfPlayer
   is empty until death or game over. Follows the SpyRoom pattern.

4. **No doctor at 5 players (Loki H4)**: Role table from WW-001 gives 0 doctors
   for 5-player games. `resolveNight()` handles absent doctor cleanly -- no waiting
   for an action that will never come.

5. **One nomination per day (Loki G1)**: Simplified from spec ambiguity. Single
   nomination per day phase. If vote fails (no majority), day ends and night begins.

6. **No-nomination path (Loki M2)**: If discussion timer expires without any
   nomination, game goes directly to night. No forced vote.

7. **Deferred features**: Defense timer (WW-003.4), advanced role presets (WW-001.4)
   deferred to Sprint 8 polish per Loki G2/G3 recommendation. Basic preset only.

## Loki Pre-Review Summary

Verdict: CONDITIONAL APPROVE (0 blockers, 4 HIGH, 5 MEDIUM)
All HIGH findings addressed in implementation:
- H1: Atomic resolveNight()
- H2: Fixed night timer
- H3: Reconnect own-role-only
- H4: Absent doctor handling

## Test Results

- Before sprint: 311 tests, 18 files
- After sprint: 371 tests, 19 files (+60 new, +1 file)
- Zero regression on existing tests
- gameRegistry test updated (REG-09 now expects 4 active games)
- Role distribution tests: all 5-15 player counts validated

## Velocity

- Estimated: 18 pts
- Delivered: 18 pts
- Sprint 4 velocity: 11 pts
- Sprint 3 velocity: 17 pts
- Sprint 2 velocity: 18 pts
- Cumulative: 76 pts delivered across 6 sprints (0-5)
- Platform progress: 76/109 pts (70%)

## Carry-over

None. All tasks completed.

## Sprint 6 Recommendation

**Knights (อัศวิน)** -- 15 pts estimated.
- Hidden role + team missions game (Avalon/Resistance-like)
- Mission proposal, approval voting, success/fail execution
- Special roles: leader who knows evil, assassin who gets final guess
- Validates BaseRoom for multi-mission, team-based gameplay
- Spec sections: KN-001 through KN-004
