---
document: PM.01
title: Project Plan — คำต้องห้าม (Kham Tong Ham)
version: 1
status: Approved
created: 2026-05-05
author: Coulson (AEGIS v11.0)
project: คำต้องห้าม — Thai Party Game
---

# PM.01 Project Plan

## 1. Project Objective

Build and maintain คำต้องห้าม (Kham Tong Ham), a real-time multiplayer mobile web party game that digitizes the popular Thai board game by เทพลีลา. Players receive secret forbidden words they must not say while trying to bait others into saying theirs. The last survivor with the most points wins.

**Primary goal**: Deliver a production-ready PWA that enables any group of 2-8 Thai-speaking players to play the forbidden word game using only their phones — zero equipment, zero accounts, instant start.

## 2. Scope

### In Scope (MVP v1.0)
- Room creation and joining via 4-letter code
- Lobby management (player list, category selection, start)
- Core game loop: LOBBY -> COUNTDOWN -> PLAYING -> VOTING -> ROUND_END -> SCOREBOARD -> GAME_OVER
- Kill accusation + majority voting mechanic
- Guess-own-word bonus phase
- Full scoring system
- 19 word pack categories (100+ words each, 3 difficulty tiers)
- Custom wordpack upload/management via API
- Mobile-optimized Thai UI (PWA installable)
- Anti-abuse protections (nickname filter, rejoin tokens, room cleanup)
- Share results functionality

### Out of Scope (v1.0)
- Native iOS/Android app
- Online matchmaking with strangers
- User accounts / authentication
- Monetization / in-app purchases
- Voice chat

## 3. Technical Architecture

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | HTML5 PWA (Vanilla JS) | - |
| Game Server | Colyseus | 0.15 |
| HTTP API | Express | 4.18 |
| Language | TypeScript | 5.3 |
| Transport | WebSocket | Colyseus |
| Testing | Vitest | 4.1 |
| Deployment | Node.js (Docker optional) | 18+ |

## 4. Team & Roles

| Role | Agent | Responsibility |
|------|-------|---------------|
| Controller | Nick Fury | Autonomous project management |
| Architect | Iron Man | System design, specs |
| Implementer | Spider-Man | Code delivery |
| Reviewer | Black Panther | Code quality |
| QA | War Machine | Test planning + execution |
| DevOps | Thor | Build, deploy, monitor |
| Compliance | Coulson | ISO docs, changelogs |
| Devil's Advocate | Loki | Adversarial review |

## 5. Milestones

| # | Milestone | Target | Status |
|---|-----------|--------|--------|
| M1 | Core game loop functional | Completed | DONE |
| M2 | Anti-abuse + stability | Completed (AEG-41/51/53/59) | DONE |
| M3 | Word pack expansion (10->19 categories) | Sprint 1 | IN PROGRESS |
| M4 | Test stabilization (all green) | Sprint 1 | IN PROGRESS |
| M5 | Production deployment | Sprint 2 | PLANNED |
| M6 | Performance + polish | Sprint 3 | PLANNED |

## 6. Quality Gates

| Gate | Owner | Criteria |
|------|-------|----------|
| Gate 0 | Coulson | PM.01 + SI.01 + SI.02 exist and current |
| Gate 1 | Black Panther | Code review pass (correctness, security, style) |
| Gate 2 | War Machine | All tests pass, no regressions |
| Gate 3 | Coulson | ISO docs updated, traceability matrix current |
| Gate 4 | Thor | Clean build, deploy success, health check |
| Gate 5 | Thor | Error rate < 2x baseline for 5 min |

## 7. Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| WebSocket connection drops on Thai mobile networks | High | Colyseus reconnection, session persistence |
| Word pack content inappropriate | Medium | Family-friendly filter, moderation |
| Room code collision at scale | Low | 24^4 = 331,776 codes, retry on collision |
| Browser PWA limitations on iOS Safari | Medium | Graceful degradation, test on target devices |

## 8. Communication

- Project repo: kam-tong-ham (local)
- Branch strategy: feat/* branches, PR to main
- Sprint cadence: 5-day sprints
- Retrospective: end of each sprint via /aegis-retro
