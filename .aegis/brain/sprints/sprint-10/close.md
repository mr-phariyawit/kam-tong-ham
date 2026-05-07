# Sprint 10 Close

> Closed: 2026-05-07
> Branch: feat/sprint-10-telemetry-onboarding
> PR: #9 (merged at 2026-05-07T10:45:55Z)
> Points: 10/10 (100%)
> Tests: 535/535 (514 unit + 6 smoke + 15 new telemetry/API)

## Summary

Sprint 10 delivered telemetry, player onboarding, and bug-triage scaffolding.

### Telemetry (KTH-T-064, 065 -- 3pts)
- Self-hosted JSONL telemetry module (server/src/utils/telemetry.ts)
- Counters: room-created, game-started, peak-players (per game type)
- Server heartbeat: uptime + memory logged every 5 minutes
- GET /api/admin/telemetry endpoint for runtime snapshot
- Crash handler: uncaughtException + unhandledRejection -> server/data/crash.log
- server/data/ gitignored + dockerignored

### Onboarding Overlays (KTH-T-066, 067 -- 4pts)
- Shared onboarding modal (client/shared/components/onboarding.js + .css)
- Per-game "How to play" content for all 6 games
- Thai primary language with EN subtitles
- Auto-shows on first room join per game type (localStorage)
- "Don't show again" checkbox + "Show rules" button for re-display
- Integrated into all 6 game index.html and game.js

### GitHub Issues + Bug Triage (KTH-T-068, 069 -- 2pts)
- .github/ISSUE_TEMPLATE/bug_report.yml (bilingual Thai+EN)
- .github/ISSUE_TEMPLATE/feature_request.yml (bilingual Thai+EN)
- .github/ISSUE_TEMPLATE/config.yml (disable blank issues)
- .github/labels.yml with 19 labels
- tools/aegis-sync-labels.sh for one-time label sync
- "Report a bug" link in home screen footer

### Tests (KTH-T-070 -- 1pt)
- 15 new tests: 12 telemetry unit + 3 telemetry API endpoint
- Total: 535/535, zero regressions

## Decisions

- D-101: Telemetry storage = JSONL file append (simplest, no deps, per spec)
- D-102: Task IDs renumbered to KTH-T-064..070 (Sprint 9 occupied 055..063)
- D-103: Onboarding auto-marks as "seen" on first display (dismissal not required)
- D-104: GitHub Issues templates landed regardless of HQ-002 repo visibility status

## Blockers

None. HQ-001 (Render deploy) and HQ-002 (repo visibility) remain pending but are not Sprint 10 blockers.

## Sprint 11 Recommendation

Per roadmap, Sprint 11 (~15pts) should cover:
- Fuzzy Thai guess matching for Draw & Guess (Levenshtein distance)
- Lazy-load game assets per route (performance)
- Advanced Werewolf roles (Hunter, Witch, Cupid, Bodyguard)
- QR code room sharing (FR-002.3)
