# Product Backlog

> Last updated: 2026-05-07
> Source: PLATFORM_SPEC_v2.md + post-launch candidates
> v1.0 scope: 109 pts COMPLETE (Sprints 0-8)

## Completed Sprints (S0-S8)

All original scope delivered. See roadmap.md for details.

## Sprint 9 (active)

See sprint-9/plan.md -- Deploy + Tag + Smoke Tests (13 pts)

## Sprint 10 (planned, ~10 pts)

### Telemetry + Player Onboarding
- Basic telemetry: per-game played counter, room created count (free tier: Axiom or simple file log)
- "How to play" overlay per game (30-second rules summary in Thai)
- Bug report infrastructure: GitHub Issues template + triage labels
- Landing page rules summary

## Sprint 11 (planned, ~15 pts)

### Polish + Feature Expansion
- Fuzzy Thai guess matching (Levenshtein) for Draw & Guess
- Lazy-load game assets per route (perf)
- Advanced Werewolf roles (Hunter, Witch, Cupid, Bodyguard)
- QR code room sharing (FR-002.3)
- APAC region upgrade (Render Singapore -- requires paid tier)

## Unscheduled (nice-to-have)

- FR-003.4: QR scan auto-fill
- FR-009.4: Leader animation
- FR-010.1: Winner crown (full implementation)
- FR-010.2: Share results via Line card
- NFR-1..5: Performance + compatibility testing
- Custom location packs for Spy game
- Tournament mode (multi-game scoring)
- Redis state persistence for graceful restart (PNFR-6)
