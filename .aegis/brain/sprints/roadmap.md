# Party Games Platform -- Roadmap

> Last updated: 2026-05-07
> Total scope: 132 story points across 10+ sprints
> Status: v1.0 SHIPPED (109 pts) -- v1.1 post-launch active

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
| Sprint 9 | Post-Launch: Deploy + Tag + Smoke Tests | 13 | DONE |
| Sprint 10 | Telemetry + Player Onboarding | 10 | DONE |

## Active

| Sprint | Title | Points | Status |
|--------|-------|--------|--------|
| Sprint 14 | Pre-Deploy Hardening | 6 | ACTIVE |

## Completed (recent)

| Sprint | Title | Points | Status |
|--------|-------|--------|--------|
| Sprint 13 | UI + Tests Cleanup | 3 | DONE |
| Sprint 12 | Finish Share-by-URL (auto-join + QR) | 8 | DONE |
| Sprint 11 | Fuzzy Thai Match + QR Room Sharing | 7 | DONE |

## Planned

(none -- backlog items deferred pending user feedback)

## Progress

- Completed: 150 pts (Sprint 0-13) -- v1.0 + deploy infra + telemetry/onboarding + fuzzy match + share-by-URL + cleanup
- Active: 6 pts (Sprint 14)
- Planned: 0 pts
- Total: 156 pts
- v1.0 Progress: 100% SHIPPED
- v1.1 Progress: 38/38 pts (Sprint 9-12 all done)

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
| M11 | Public URL accessible | Sprint 9 | DONE (HQ-001 pending deploy) |
| M12 | v1.0.0 release tag | Sprint 9 | DONE |
| M13 | Smoke playthroughs in CI | Sprint 9 | DONE |
| M14 | Basic telemetry + onboarding | Sprint 10 | DONE |

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
