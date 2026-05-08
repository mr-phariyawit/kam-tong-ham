# Project State Resonance
> Restored by Nick Fury on 2026-05-08 (v12 installer had reset this to placeholder)

## Project
- Name: Party Games TH (kam-tong-ham / เกมปาร์ตี้)
- Profile: standard
- AEGIS Version: 12.0 (upgraded from v11.0 on 2026-05-08)
- Created: 2026-04-14
- Repository: github.com/mr-phariyawit/kam-tong-ham

## Current State
- Phase: post-launch maintenance (v1.0 shipped, v1.1+v1.2 complete)
- Active Branch: main (at commit 7542110)
- Autonomy Level: L3 (Autonomous -- Nick Fury decides)
- Deploy: LIVE at https://kam-tong-ham.onrender.com
- Release: v1.0.0 tagged + GitHub Release published

## Sprint History
- Total sprints completed: 18 (Sprint 0 through Sprint 17, plus Sprint 18 via PR)
- Total story points delivered: ~170+ pts
- v1.0 milestone: 100% SHIPPED (Sprint 0-8)
- v1.1 milestone: 100% SHIPPED (Sprint 9-12: deploy, telemetry, share-by-URL)
- v1.2 milestone: 100% SHIPPED (Sprint 13-18: cleanup, hardening, deploy, i18n, e2e)
- Games: 6 (kam-tong-ham, Word Link, Spy, Werewolf, Knights, Draw & Guess)
- Tests: 514+ (all green, including Playwright e2e)

## Open Issues
- #19 (P1): iOS Safari + Android Chrome real-device verification -- requires human action
- #20 (P2): Accessibility audit (WCAG AA) -- can be automated partially

## Key Decisions
- SharedLobby architecture adopted for all 6 games (Sprint 15)
- Rate limiter with TRUST_PROXY for Render deployment (Sprint 14)
- i18n audit + cold-start loading overlay (Sprint 16)
- Playwright real-browser e2e for adversarial scenarios (Sprint 18)
- AEGIS v12.0 upgrade (2026-05-08)

## Active Tasks
- Commit AEGIS v12 framework upgrade (meta-task)
- Queue Issue #19 to human (real-device testing)
- Plan Issue #20 (a11y audit) for future sprint

## Blockers
- Issue #19 blocked on human having iOS/Android devices
