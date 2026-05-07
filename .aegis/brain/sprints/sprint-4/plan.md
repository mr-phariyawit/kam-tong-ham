# Sprint 4 Plan: Spy (สายลับ)

> Sprint: 4
> Start: 2026-05-07
> Target: 2026-05-12 (5 working days)
> Points: 11 pts
> Epic: KTH-E-011

## Objective

Ship Spy (สายลับ, Spyfall-style) as the third playable game on the platform.
Location-deduction mechanic: all players except the spy know the secret location.
Players ask questions to identify the spy; the spy tries to deduce the location.

Spec: PLATFORM_SPEC_v2.md sections SP-001 through SP-004.

## Game Summary

One random player is the spy. Everyone else knows the secret location and is assigned
a role at that location (e.g., Hospital -> Doctor, Nurse, Pharmacist). Players take
turns asking each other questions to find the spy -- but questions must be vague enough
not to reveal the location to the spy. The spy can guess the location at any time to win.

## Task Breakdown

| ID | Title | Points | Priority | Depends On |
|----|-------|--------|----------|------------|
| KTH-T-020 | Location data file (30+ Thai locations with roles) | 2 | Must | -- |
| KTH-T-021 | SpyState schema + SpyPlayer | 1 | Must | -- |
| KTH-T-022 | SpyRoom class (game lifecycle, role assignment, voting) | 3 | Must | KTH-T-020, KTH-T-021 |
| KTH-T-023 | Timer + accusation flow | 2 | Must | KTH-T-022 |
| KTH-T-024 | Client UI (game page, role reveal, accusation modal) | 2 | Must | KTH-T-022 |
| KTH-T-025 | Spy test suite (30+ tests) | 1 | Must | KTH-T-022, KTH-T-023 |

**Total: 11 pts**

## Implementation Waves

**Wave A (Data + Schema)**: KTH-T-020 + KTH-T-021 (parallel, no coupling)
**Wave B (Server Core)**: KTH-T-022 + KTH-T-023 (sequential, Room + accusation flow)
**Wave C (Client)**: KTH-T-024 (client UI, depends on server being functional)
**Wave D (Tests)**: KTH-T-025 (test suite, written alongside but finalized last)

## Registry Integration

- Register SpyRoom in gameRegistry with `comingSoon: false`
- Define "spy" room in Colyseus gameServer
- Add "spy" to roomTypes in GET /api/rooms/:roomCode
- Create client/games/spy/ directory (index.html, game.js, style.css)

## Key Design Decisions

1. Location data: 30+ Thai-themed locations, each with 8-10 plausible roles
2. Spy assignment: server randomly picks exactly 1 spy per round
3. Non-spy players see the location name + their assigned role + full location list
4. Spy sees only "You are the spy" + full location list (no location/role info)
5. Question flow: free-form discussion (no strict turn enforcement on server)
6. Timer: configurable 5-8 minutes, server-authoritative countdown
7. Accusation: any player calls a vote; majority required to accuse
8. Spy guess: spy can reveal + guess location at any time for instant win/lose
9. Scoring: +2 winning side, +1 bonus for unanimous spy catch

## Success Criteria

- All existing 262 tests still pass
- 30+ new tests for Spy game
- Spy playable end-to-end (lobby -> role reveal -> discussion -> vote/guess -> win/lose)
- Home screen shows Spy as ACTIVE (not "coming soon")
- GameRegistry reports 3 active games
- Location data: 30+ locations, culturally appropriate Thai content
