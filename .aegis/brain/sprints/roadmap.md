# Party Games Platform -- Roadmap

> Last updated: 2026-05-07
> Total scope: 109 story points across 8 sprints
> Status: ALL SPRINTS CLOSED -- PROJECT SHIPPED

## Completed

| Sprint | Title | Points | Status |
|--------|-------|--------|--------|
| Sprint 0 | Project Bootstrap | 5 | DONE |
| Sprint 1 | Test Stabilization + Wordpack Integration | 7 | DONE |
| Sprint 2 | Platform Foundation (BaseRoom, Home Screen, Refactor) | 18 | DONE |
| Sprint 3 | Word Link (คำเชื่อม) | 17 | DONE |
| Sprint 4 | Spy (สายลับ) | 11 | DONE |
| Sprint 5 | Werewolf (หมาป่า) | 18 | DONE |
| Sprint 6 | Knights (อัศวิน) | 15 | DONE |
| Sprint 7 | Draw & Guess (วาดทาย) | 13 | DONE |
| Sprint 8 | Polish + Audit to 100% | 5 | DONE |

## Active

(none -- all sprints closed)

## Planned

(none -- project complete)

## Progress

- Completed: 109 pts (Sprint 0-8)
- Active: 0 pts
- Remaining: 0 pts
- Total: 109 pts
- Progress: 100% SHIPPED

## Key Milestones

| # | Milestone | Target Sprint | Status |
|---|-----------|--------------|--------|
| M1 | Core game loop (kam-tong-ham) | Sprint 0-1 | DONE |
| M2 | Anti-abuse + stability | Sprint 0-1 | DONE |
| M3 | Wordpack expansion (19 categories) | Sprint 1 | DONE |
| M4 | All tests green (172/172) | Sprint 1 | DONE |
| M5 | Multi-game platform architecture | Sprint 2 | DONE |
| M6 | First new game (Word Link) | Sprint 3 | DONE |
| M7 | Social deduction game (Spy) | Sprint 4 | DONE |
| M8 | Social deduction duo (Spy + Werewolf) | Sprint 5 | DONE |
| M9 | All 6 games playable | Sprint 7 | DONE |
| M10 | Production-ready platform | Sprint 8 | DONE |

## Sprint 8 Change Log

- Sprint 8 completed: Polish + Audit (5 pts, 514 tests, all green)
  - Cross-game reconnect-leak audit: 1 finding fixed (SpyPlayer @type leak)
  - 15 reconnect audit tests across all 6 games
  - Werewolf defense timer (WW-003.4): DAY_DEFENSE phase added
  - Shared common.css for cross-game UI consistency
  - Full regression: 514/514 tests, typecheck clean, build clean
  - Milestone M10 achieved: Production-ready platform (109/109 pts)

## Sprint 7 Change Log

- Sprint 7 completed: Draw & Guess shipped (13 pts, 494 tests, PR #6 merged)
  - Last new game on the platform -- ALL 6 games now active
  - HTML5 Canvas drawing with touch support (mobile-first)
  - Stroke broadcast + periodic snapshot architecture
  - Thai text normalization for guess matching
  - Loki pre-review: CONDITIONAL APPROVE (0 blockers, all findings addressed)
  - 53 new tests, zero regressions
  - Milestone M9 achieved: All 6 games playable
