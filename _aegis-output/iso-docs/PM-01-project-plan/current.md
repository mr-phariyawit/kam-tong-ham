---
document: PM.01
title: Project Plan — คำต้องห้าม (Kham Tong Ham)
version: 2
status: Approved
updated: 2026-05-07
created: 2026-05-05
author: Coulson (AEGIS v11.0)
project: คำต้องห้าม — Thai Party Game
---

# PM.01 Project Plan

## 1. Project Objective

Build a multi-game party platform (Party Games TH / เกมปาร์ตี้) starting from the existing คำต้องห้าม (Kham Tong Ham) game. The platform hosts 6 real-time multiplayer party games playable on mobile browsers -- zero equipment, zero accounts, instant start.

**Primary goal**: Deliver a production-ready PWA that enables Thai-speaking groups of 2-15 players to choose from 6 party games using only their phones.

**Games**: Forbidden Word (shipped), Werewolf, Spy, Knights, Word Link, Draw & Guess.

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
| M1 | Core game loop functional | Sprint 0 | DONE |
| M2 | Anti-abuse + stability (AEG-41/51/53/59) | Sprint 0 | DONE |
| M3 | Word pack expansion (10->19 categories) | Sprint 1 | DONE |
| M4 | Test stabilization (172/172 green) | Sprint 1 | DONE |
| M5 | Multi-game platform architecture | Sprint 2 | IN PROGRESS |
| M6 | First new game -- Werewolf | Sprint 3 | PLANNED |
| M7 | Social deduction trio complete | Sprint 5 | PLANNED |
| M8 | All 6 games playable | Sprint 7 | PLANNED |
| M9 | Production-ready platform + polish | Sprint 8 | PLANNED |

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
