# Sprint 2 Plan -- Platform Foundation

> Sprint Start: 2026-05-07
> Sprint Duration: 5 days
> Sprint Goal: Transform kam-tong-ham from single-game app into multi-game platform. Extract BaseRoom, create home screen, refactor existing game to new architecture. Zero regression on 172 tests.

## Context
- Sprint 1 completed (3/3 tasks, 7pts, 172/172 tests PASS)
- Human directive: expand to multi-game platform with 5 famous board games
- PLATFORM_SPEC_v2.md approved: 6 games total across 7 sprints (91 pts)
- This sprint: foundation architecture that enables all future game additions

## Scope

| ID | Title | Pts | Priority | Assignee | Depends On |
|----|-------|-----|----------|----------|------------|
| KTH-T-005 | Create BaseRoom class | 3 | critical | @spider-man | - |
| KTH-T-006 | Create BaseState schema | 2 | critical | @spider-man | - |
| KTH-T-007 | Game registry + GET /api/games | 2 | high | @spider-man | KTH-T-005 |
| KTH-T-008 | Home screen (game selector grid) | 3 | high | @spider-man | KTH-T-007 |
| KTH-T-009 | Refactor ForbiddenWordRoom extends BaseRoom | 3 | critical | @spider-man | KTH-T-005, KTH-T-006 |
| KTH-T-010 | Migrate client to games/ structure | 2 | high | @spider-man | KTH-T-008 |
| KTH-T-011 | Shared lobby UI components | 2 | medium | @spider-man | KTH-T-010 |
| KTH-T-012 | Regression verification (172 tests + new) | 1 | critical | @war-machine | KTH-T-009 |

## Total: 18 story points (8 tasks)

## Execution Order (dependency-aware)
1. KTH-T-005 + KTH-T-006 (parallel -- server-side foundation)
2. KTH-T-009 (refactor existing room -- depends on 005+006)
3. KTH-T-007 (game registry -- depends on 005)
4. KTH-T-008 (home screen -- depends on 007)
5. KTH-T-010 (client restructure -- depends on 008)
6. KTH-T-011 (shared lobby -- depends on 010)
7. KTH-T-012 (regression gate -- depends on 009, runs after all changes)

## Definition of Done
- All 172 existing tests pass (zero regressions)
- BaseRoom class exists with shared logic
- ForbiddenWordRoom extends BaseRoom with same behavior
- Home screen shows game cards (at least kam-tong-ham card)
- GET /api/games returns game metadata
- Client code restructured into platform layout
- New tests added for BaseRoom + game registry

## Risks
- BaseRoom extraction may break subtle timing in existing tests
- Client restructure may break PWA manifest/service worker
- 18 pts is aggressive for architectural refactor
