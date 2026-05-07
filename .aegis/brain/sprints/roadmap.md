# Party Games Platform -- Roadmap

> Last updated: 2026-05-07
> Total scope: ~109 story points across 8 sprints
> Status: Sprint 7 complete

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

## Active

| Sprint | Title | Points | Status | Epic |
|--------|-------|--------|--------|------|
| Sprint 8 | Polish + Audit to 100% | 5 | ACTIVE | KTH-E-009 |

## Planned

(none -- Sprint 8 is the FINAL sprint)

## Progress

- Completed: 104 pts (Sprint 0-7)
- Active: 5 pts (Sprint 8)
- Remaining: 0 pts
- Total: 109 pts
- Progress: ~95% -> 100% in progress

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
| M10 | Production-ready platform | Sprint 8 | PLANNED |

## Sprint 7 Change Log

- Sprint 7 completed: Draw & Guess shipped (13 pts, 494 tests, PR #6 merged)
  - Last new game on the platform -- ALL 6 games now active
  - HTML5 Canvas drawing with touch support (mobile-first)
  - Stroke broadcast + periodic snapshot architecture
  - Thai text normalization for guess matching
  - Loki pre-review: CONDITIONAL APPROVE (0 blockers, all findings addressed)
  - 53 new tests, zero regressions
  - Milestone M9 achieved: All 6 games playable
