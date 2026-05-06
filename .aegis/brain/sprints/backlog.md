# Product Backlog

> Last updated: 2026-05-07
> Source: PLATFORM_SPEC_v2.md

## Sprint 2 (assigned)
See sprint-2/plan.md -- 8 tasks, 18 pts

## Future Sprints (not yet broken down into tasks)

### Sprint 3 -- Werewolf (KTH-E-004, 18 pts)
- WerewolfRoom + WerewolfState
- Role assignment (basic preset)
- Night phase (wolf kill, seer, doctor)
- Day phase (discussion, nomination, voting)
- Win conditions + game over
- Client UI (role card, night/day, voting)
- Test suite (20+ tests)

### Sprint 4 -- Spy (KTH-E-005, 11 pts)
- SpyRoom + SpyState
- Location data (30+ Thai locations)
- Question flow + spy guess
- Client UI (location list, timer)
- Test suite (15+ tests)

### Sprint 5 -- Knights (KTH-E-006, 15 pts)
- KnightsRoom + KnightsState
- Mission proposal + approval voting
- Mission execution (success/fail)
- Merlin + Assassin roles
- Client UI (mission board, voting, roles)
- Test suite (20+ tests)

### Sprint 6 -- Word Link (KTH-E-007, 11 pts)
- WordLinkRoom + WordLinkState
- 5x5 grid generation + color assignment
- Spymaster clue + team guess flow
- Client UI (grid, clue input, team panels)
- Test suite (15+ tests)

### Sprint 7 -- Draw & Guess (KTH-E-008, 13 pts)
- DrawGuessRoom + DrawGuessState
- Canvas stroke broadcast (delta-based)
- Guess checking + scoring
- Drawing word pool
- Client UI (canvas, tools, guess input)
- Test suite (15+ tests)

### Sprint 8 -- Polish (KTH-E-009, 5 pts)
- QR code sharing across all games
- Performance: lazy-load game assets
- Cross-game UI polish
- Final regression QA

## Unscheduled (nice-to-have)
- FR-002.3: QR code for room joining
- FR-003.4: QR scan auto-fill
- FR-009.4: Leader animation
- FR-010.1: Winner crown (full implementation)
- FR-010.2: Share results via Line card
- NFR-1..5: Performance + compatibility testing
- Advanced Werewolf roles (Hunter, Witch, Cupid)
- Custom location packs for Spy game
- Tournament mode (multi-game scoring)
