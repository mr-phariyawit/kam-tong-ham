# Sprint 6 Plan -- Knights (อัศวิน)

> Start: 2026-05-07
> Target: 15 story points
> Epic: KTH-E-006
> Branch: feat/sprint-6-knights
> Spec: PLATFORM_SPEC_v2.md sections KN-001 through KN-004

## Objective

Ship game #5: Knights -- hidden-role + team-mission game (Avalon-style mechanic,
Thai theming). 5-10 players, good vs evil teams, mission proposals + voting,
secret mission success/fail, assassin endgame guess.

## Tasks

| ID | Title | Points | Status | Agent |
|----|-------|--------|--------|-------|
| KTH-T-034 | KnightsState schema (roles, missions, votes) | 2 | TODO | Spider-Man |
| KTH-T-035 | KnightsRoom phase machine + role assignment | 3 | TODO | Spider-Man |
| KTH-T-036 | Team proposal + approve/reject voting | 2 | TODO | Spider-Man |
| KTH-T-037 | Mission success/fail secret voting + reveal | 2 | TODO | Spider-Man |
| KTH-T-038 | Win conditions + assassin endgame guess | 2 | TODO | Spider-Man |
| KTH-T-039 | Reconnect handling (no role/vote leak) | 1 | TODO | Spider-Man |
| KTH-T-040 | Client UI (game.js + index.html + style.css) | 2 | TODO | Spider-Man |
| KTH-T-041 | Test suite (target 50+ tests) | 1 | TODO | Spider-Man |

## Role Distribution (from spec KN-001.4)

| Players | Good | Evil | Mission Sizes |
|---------|------|------|---------------|
| 5 | 3 | 2 | 2,3,2,3,3 |
| 6 | 4 | 2 | 2,3,4,3,4 |
| 7 | 4 | 3 | 2,3,3,4,4 |
| 8 | 5 | 3 | 3,4,4,5,5 |
| 9 | 6 | 3 | 3,4,4,5,5 |
| 10 | 6 | 4 | 3,4,4,5,5 |

## Thai-Themed Role Names (Loki F2 mandate)

| Role | Thai Name | Description |
|------|-----------|-------------|
| Good Knight | อัศวินฝ่ายดี | Basic good team member |
| Evil Traitor | ผู้ทรยศ | Basic evil team member |
| Leader (Merlin) | ผู้นำอัศวิน | Knows evil identities, target of assassination |
| Assassin (Mordred) | มือสังหาร | Can guess ผู้นำอัศวิน at game end |
| Advisor (Percival) | ที่ปรึกษา | Knows who ผู้นำอัศวิน is (helps protect) |
| Double Agent (Morgana) | สายลับฝ่ายชั่ว | Appears as ผู้นำอัศวิน to ที่ปรึกษา |

## Key Design Decisions

1. Roles stored server-side only (same pattern as WerewolfRoom.playerRoles)
2. Phase machine: LOBBY -> ROLE_REVEAL -> TEAM_PROPOSAL -> TEAM_VOTE ->
   MISSION -> MISSION_REVEAL -> (loop or ASSASSIN_GUESS or GAME_OVER)
3. Fixed-duration timers for all vote/proposal phases (prevent timing attacks)
4. Reconnect sends only own role + current phase context (no vote/proposal leaks)
5. Mission 4 with 7+ players: requires 2 fails to fail the mission (KN-003.4)
6. 5 consecutive rejections in a round = evil wins (hammer rule, KN-002.4)

## Loki Pre-Review Items

See .aegis/brain/issues/sprint-6-loki-review.md (generated before implementation)

## Dependencies

- BaseRoom (server/src/rooms/BaseRoom.ts) -- extends for lobby/reconnect
- BaseState (server/src/schemas/BaseState.ts) -- extends for state sync
- gameRegistry (server/src/utils/gameRegistry.ts) -- already registered as coming-soon
- Client scaffold (client/games/knights/) -- new directory
