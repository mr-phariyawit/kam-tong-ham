# Project State Resonance
> Established by Nick Fury on 2026-05-05 (first AEGIS session)

## Project Identity
- Name: kam-tong-ham (คำต้องห้าม / Kham Tong Ham)
- Description: Real-time multiplayer Thai party game — digital version of the viral Thai board game by เทพลีลา. Players receive secret forbidden words they must not say while trying to bait others into saying theirs.
- Profile: standard
- AEGIS Version: 11.0
- Created: 2026-05-05

## Tech Stack
- Server: Colyseus 0.15 on Node.js (TypeScript 5)
- Client: HTML5 PWA (Vanilla JS) — mobile-first Thai UI
- HTTP API: Express 4
- Transport: WebSocket (Colyseus)
- Testing: Vitest 4.1
- Build: tsc
- Port: 2567 (default)

## Architecture
- server/src/rooms/KhamTongHamRoom.ts — Core game room state machine (LOBBY -> COUNTDOWN -> PLAYING -> VOTING -> ROUND_END -> SCOREBOARD -> GAME_OVER)
- server/src/utils/wordPicker.ts — Word pack loading with built-in + custom directory, tiered difficulty
- server/src/data/wordpacks/ — 19 JSON category files (10 original + 9 new in WIP)
- client/ — PWA frontend (HTML + CSS + JS)
- REST API: POST /api/rooms/create, GET /api/rooms/:code, GET /api/categories, GET /api/health

## Current State
- Phase: active development (Sprint 3 in-flight)
- Active Branch: feat/sprint3-wip-preserve (WIP committed for safety)
- Base Branch: main
- Autonomy Level: L3 (autonomous)
- Test Health: 165 pass / 7 fail (WIP-expected: category count assertions + disconnect logic)

## Completed Work (from git history — AEG-* tickets)
- AEG-31/32/34/35/36/37: Sprint 2 pre-launch blocker fixes
- AEG-40: Score integrity + CHALLENGE_PENALTY gap tests
- AEG-41: Anti-abuse test suite (rejoin tokens, nickname filter, host transfer)
- AEG-51: Room cleanup timer 5min + TRANSFER_HOST handler
- AEG-53: CHALLENGE_PENALTY event emission fix
- AEG-59: Anti-abuse test fixes (NICKNAME_REJECTED)
- AEG-66: Room code isolation regression tests
- AEG-67: REST API test suite + QA gate rules

## In-Flight Work (uncommitted -> now committed to WIP branch)
- 9 new wordpack categories (daily-life, entertainment, office, relationships, school, shopping, slang, trap-words, travel)
- Expanded client UI (blind voting, host transfer notification, volunteer transfer button)
- Server API expansion (custom wordpacks CRUD, enhanced room management)
- WordPicker with custom-packs directory support + tiered difficulty

## Known Issues
1. Tests expect 10 categories but 19 now exist -> update wordPicker.test.ts assertions
2. disconnect.test.ts playerCount assertions off-by-1 -> review onLeave logic
3. AEGIS PM.01/SI.01/SI.02 contain wrong-project boilerplate -> must regenerate

## Business Rules (from SPEC.md)
- BR-1: Min 2 players to start
- BR-2: Max 8 players per room
- BR-3: Room codes = 4 uppercase letters (no I/O)
- BR-4: Codes expire after 2h inactivity
- BR-5: Family-friendly words
- BR-6: Guest play only (no accounts)
- BR-7: Unique word per round per player
- BR-8: Host controls progression
- BR-9: Kill = majority vote (>50%) from non-accused alive players
- BR-10: Tie = accusation fails

## Key Decisions
- D-001: Preserve WIP on feat/sprint3-wip-preserve before AEGIS bootstrap (safety-first)
- D-002: Project identity extracted from code/README/SPEC.md (no human question needed)
- D-003: PM.01/SI.01/SI.02 to be regenerated from SPEC.md (not approved as-is)

## Blockers
- None (WIP preserved, AEGIS bootstrap proceeding)
