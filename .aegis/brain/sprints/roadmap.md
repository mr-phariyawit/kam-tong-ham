# Party Games Platform -- Roadmap

> Last updated: 2026-05-07
> Total scope: ~109 story points across 8 sprints
> Status: Sprint 7 active

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

## Active

| Sprint | Title | Points | Status | Epic |
|--------|-------|--------|--------|------|
| Sprint 7 | Draw & Guess (วาดทาย) | 13 | ACTIVE | KTH-E-008 |

## Planned

| Sprint | Title | Points | Status | Epic |
|--------|-------|--------|--------|------|
| Sprint 8 | Polish + Performance | 5 | PLANNED | KTH-E-009 |

## Progress

- Completed: 91 pts (Sprint 0-6)
- Active: 13 pts (Sprint 7)
- Remaining: 5 pts (Sprint 8)
- Total: 109 pts
- Progress: ~83% (91/109)

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
| M9 | All 6 games playable | Sprint 7 | IN PROGRESS |
| M10 | Production-ready platform | Sprint 8 | PLANNED |

## Sprint 7 Change Log

- Sprint 7 started: Draw & Guess (13 pts, 8 tasks)
  - Last new game on the platform roadmap
  - Key tech: HTML5 canvas drawing, stroke broadcast, Thai guess normalization
  - Architecture decisions: broadcast-only strokes + periodic snapshot (D-098),
    normalized exact match for guesses (D-099)
