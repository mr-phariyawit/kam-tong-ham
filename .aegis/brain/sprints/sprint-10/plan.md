# Sprint 10 Plan -- Telemetry + Player Onboarding

> Sprint: 10
> Started: 2026-05-07
> Points: 10
> Branch: feat/sprint-10-telemetry-onboarding
> Objective: Add basic self-hosted telemetry, per-game onboarding overlays, and GitHub Issues scaffolding

## Epics

| Epic | Title | Points |
|------|-------|--------|
| KTH-E-012 | Basic Telemetry | 3 |
| KTH-E-013 | In-Game Onboarding Overlays | 4 |
| KTH-E-014 | GitHub Issues + Bug Triage | 3 |

## Tasks

| Task | Epic | Title | Points | Assignee | Status |
|------|------|-------|--------|----------|--------|
| KTH-T-064 | E-012 | Telemetry collector + counter API | 2 | Spider-Man | TODO |
| KTH-T-065 | E-012 | Crash log handler | 1 | Spider-Man | TODO |
| KTH-T-066 | E-013 | Onboarding component (shared) | 2 | Spider-Man | TODO |
| KTH-T-067 | E-013 | Onboarding content x6 games | 2 | Spider-Man | TODO |
| KTH-T-068 | E-014 | GitHub Issues templates + label config | 1 | Spider-Man | TODO |
| KTH-T-069 | E-014 | In-game "Report a bug" link | 1 | Spider-Man | TODO |
| KTH-T-070 | E-012/E-013 | Test suite for telemetry + onboarding | 1 | Vision | TODO |

## Phases

1. **Wave A (server):** KTH-T-064, KTH-T-065 -- Telemetry collector + crash handler
2. **Wave B (client):** KTH-T-066, KTH-T-067 -- Shared onboarding component + 6 game contents
3. **Wave C (infra):** KTH-T-068, KTH-T-069 -- Issue templates + Report-a-bug link
4. **Wave D (QA):** KTH-T-070 -- Tests for telemetry increments + onboarding-shown logic

## Key Decisions

- Telemetry storage: JSONL append to server/data/telemetry.log (simplest, no deps)
- No third-party telemetry services this sprint
- Onboarding: localStorage-based "seen" tracking per game type
- Issue templates: land regardless of HQ-002 (repo visibility) -- activate when public
- Task IDs: KTH-T-064..070 (Sprint 9 used 055..063)

## Dependencies

- None blocking. HQ-001/HQ-002 are not sprint-blocking.

## Definition of Done

- All 520+ existing tests pass
- New tests for telemetry counters + onboarding localStorage logic
- PR opened, CI green (Unit + Smoke), merged to main
- ISO docs updated (PM-01, SI-01, SI-02)
