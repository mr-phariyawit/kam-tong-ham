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

## Sprint 11 (active, 7 pts)

### Fuzzy Thai Match + QR Room Sharing
- Fuzzy Thai guess matching (Levenshtein) for Draw & Guess (4 pts)
- QR code room sharing with deep-link auto-join (3 pts)

### DEFERRED (scope discipline -- main session 2026-05-07)
- **Lazy-load game assets**: DEFERRED -- premature optimization; no performance issues reported from real users. Revisit after HQ-001 deploy lands and telemetry shows actual load times.
- **Advanced Werewolf roles**: DEFERRED -- scope creep; no user signal requesting additional roles. Revisit when player feedback indicates demand.
- **APAC region upgrade**: DEFERRED -- requires paid tier decision (external access category).

## Unscheduled (nice-to-have)

- FR-003.4: QR scan auto-fill
- FR-009.4: Leader animation
- FR-010.1: Winner crown (full implementation)
- FR-010.2: Share results via Line card
- NFR-1..5: Performance + compatibility testing
- Custom location packs for Spy game
- Tournament mode (multi-game scoring)
- Redis state persistence for graceful restart (PNFR-6)
