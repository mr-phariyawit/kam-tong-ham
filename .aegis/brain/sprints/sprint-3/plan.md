# Sprint 3 Plan: Word Link (คำเชื่อม)

> Sprint: 3
> Start: 2026-05-07
> Target: 2026-05-12 (5 working days)
> Points: 15 pts
> Epic: KTH-E-010

## Objective

Ship Word Link (คำเชื่อม, Codenames-style) as the second playable game on the platform.
Validates BaseRoom for team-based gameplay. Reuses existing wordpack infrastructure.

## Game Summary

Two teams compete. Each team has a spymaster who sees a 5x5 grid of Thai words,
color-coded by team. Spymasters give one-word clues + a number to help teammates
guess their words. Hit the assassin word = instant loss.

Spec: PLATFORM_SPEC_v2.md sections WL-001 through WL-004.

## Task Breakdown

| ID | Title | Points | Priority | Depends On |
|----|-------|--------|----------|------------|
| KTH-T-013 | WordLinkState schema + WordLinkPlayer | 2 | Must | -- |
| KTH-T-014 | WordLinkRoom class (game logic) | 3 | Must | KTH-T-013 |
| KTH-T-015 | Grid generation + color assignment | 2 | Must | KTH-T-013 |
| KTH-T-016 | Spymaster clue + team guess flow | 3 | Must | KTH-T-014, KTH-T-015 |
| KTH-T-017 | Win condition detection + game over | 2 | Must | KTH-T-016 |
| KTH-T-018 | Client UI (game page, grid, clue input) | 3 | Must | KTH-T-014 |
| KTH-T-019 | Word Link test suite (20+ tests) | 2 | Must | KTH-T-014, KTH-T-016 |

**Total: 17 pts** (adjusted up from spec's 11pt estimate after Sprint 2 velocity calibration)

## Implementation Waves

**Wave 1 (Server Foundation)**: KTH-T-013 + KTH-T-015 (parallel, no coupling)
**Wave 2 (Server Core)**: KTH-T-014 + KTH-T-016 (sequential, Room depends on schema+grid)
**Wave 3 (Server Completion)**: KTH-T-017 (win conditions, depends on game flow)
**Wave 4 (Client)**: KTH-T-018 (client UI, depends on server being functional)
**Wave 5 (Tests)**: KTH-T-019 (test suite, written alongside but finalized last)

## Registry Integration

- Register WordLinkRoom in gameRegistry with `comingSoon: false`
- Define "word_link" room in Colyseus gameServer
- Update client gamePaths to include `/games/word-link/index.html`

## Key Design Decisions

1. Team assignment: server auto-divides players into 2 teams at game start
2. Spymaster selection: first player on each team is spymaster (host can override)
3. Word source: reuse pickUniqueWords() from existing wordpack infrastructure
4. Grid: 25 words, server-assigned colors (9 red, 8 blue, 7 neutral, 1 assassin)
5. Color key: only visible to spymasters (server filters what each client sees)
6. Turn flow: red team always goes first (they have 9 words, one more than blue)

## Success Criteria

- All existing 220 tests still pass
- 20+ new tests for Word Link
- Word Link playable end-to-end (lobby -> teams -> clue -> guess -> win/lose)
- Home screen shows Word Link as ACTIVE (not "coming soon")
- GameRegistry reports 2 active games
