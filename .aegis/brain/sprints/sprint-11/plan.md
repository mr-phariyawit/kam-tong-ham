# Sprint 11 Plan -- Fuzzy Thai Match + QR Room Sharing

> Sprint: 11
> Started: 2026-05-07
> Points: 7
> Branch: feat/sprint-11-fuzzy-qr
> Objective: Targeted player-experience wins -- fuzzy Thai guess matching for Draw & Guess and QR code room sharing

## Epics

| Epic | Title | Points |
|------|-------|--------|
| KTH-E-015 | Fuzzy Thai Guess Matching | 4 |
| KTH-E-016 | QR Code Room Sharing | 3 |

## Tasks

| Task | Epic | Title | Points | Assignee | Status |
|------|------|-------|--------|----------|--------|
| KTH-T-071 | E-015 | Levenshtein-based fuzzy match (Thai-aware) | 2 | Spider-Man | TODO |
| KTH-T-072 | E-015 | Wire fuzzy match into DrawGuessRoom + tests | 1 | Spider-Man | TODO |
| KTH-T-073 | E-015 | Configurable threshold via room settings | 1 | Spider-Man | TODO |
| KTH-T-074 | E-016 | Verify GET /api/rooms/:code returns gameType + roomCode | 1 | Spider-Man | TODO |
| KTH-T-075 | E-016 | Client deep-link auto-join | 1 | Spider-Man | TODO |
| KTH-T-076 | E-016 | Client QR generator in lobby | 1 | Spider-Man | TODO |

## Phases

1. **Wave A (server + fuzzy):** KTH-T-071, 072, 073 -- Sequential: core algorithm, wiring, config
2. **Wave B (client + QR):** KTH-T-074, 075, 076 -- Parallel with Wave A: API verify, deep-link, QR modal
3. **QA pass:** War Machine regression run after both waves
4. **Optional:** Loki review on fuzzy-match Thai edge cases

## Key Decisions

- Scope deliberately narrowed from original Sprint 11 plan (~15 pts) to 7 pts
- DEFERRED: lazy-load game assets (premature optimization -- no perf issues reported)
- DEFERRED: advanced Werewolf roles (scope creep -- no user signal requesting them)
- DEFERRED: APAC region upgrade (requires paid tier decision)
- Fuzzy match threshold: 0.85 default (normal), 0.75 (lenient), 1.0 (strict)
- QR library: vendor under client/shared/vendor/ (MIT/BSD/Apache only, ~5KB, no npm dep)
- Room URL canonical form: https://<host>/?join=<roomCode>
- Task IDs: KTH-T-071..076 (Sprint 10 used 064..070)

## Dependencies

- KTH-T-071 depends on existing server/src/utils/thaiNormalize.ts
- KTH-T-072 depends on KTH-T-071 (fuzzy match function must exist)
- KTH-T-073 depends on KTH-T-072 (wiring must exist to add config)
- KTH-T-075 depends on KTH-T-074 (API must be verified before client consumes it)
- KTH-T-076 independent (QR modal, lobby UI)

## Definition of Done

- All 535+ existing tests pass
- New tests for fuzzy matching logic + near-miss feedback
- PR opened, CI green (Unit + Smoke), merged to main
- ISO docs updated (PM-01, SI-01, SI-02)
