---
document: SI.02
title: Traceability Matrix — คำต้องห้าม (Kham Tong Ham)
version: 2
status: Active
updated: 2026-05-07
created: 2026-05-05
author: Coulson (AEGIS v11.0)
project: คำต้องห้าม — Thai Party Game
---

# SI.02 Traceability Matrix

## Requirements -> Implementation -> Tests

| REQ ID | Requirement | Implementation | Test Coverage | Status |
|--------|-------------|---------------|---------------|--------|
| FR-001.1 | Game logo/title Thai | client/index.html | Manual | Implemented |
| FR-001.2 | Create Room button | client/js/app.js | API-01..04 | Implemented |
| FR-001.3 | Join button | client/js/app.js | API-05..09 | Implemented |
| FR-001.4 | Category browser | client/js/app.js + GET /api/categories | API-10..11 | Implemented |
| FR-002.1 | Room code generation | server/src/utils/roomCode.ts | RC-01..07 | Implemented |
| FR-002.2 | Nickname + avatar | server/src/rooms/KhamTongHamRoom.ts | Anti-abuse tests | Implemented |
| FR-002.5 | 2h idle timeout | server/src/rooms/KhamTongHamRoom.ts | expiry.test.ts | Implemented |
| FR-003.1 | Code entry (case-insensitive) | server/src/app.ts | API-07 | Implemented |
| FR-003.3 | Join validation | server/src/app.ts | API-05..09 | Implemented |
| FR-004.1 | Real-time player list | KhamTongHamRoom.ts state | eightPlayer.test.ts | Implemented |
| FR-004.4 | Start (host, >=2 players) | KhamTongHamRoom.ts | twoPlayer.test.ts | Implemented |
| FR-004.5 | Host transfer on leave | KhamTongHamRoom.ts | disconnect.test.ts | Implemented |
| FR-005.3 | Unique word per player | server/src/utils/wordPicker.ts | WP-01..10, WPD-* | Implemented |
| FR-006.2 | 8 distinct colors | KhamTongHamRoom.ts | eightPlayer.test.ts | Implemented |
| FR-007.5 | Majority vote | KhamTongHamRoom.ts | voteResolution.test.ts | Implemented |
| FR-007.9 | Kill scoring (+2/-3) | KhamTongHamRoom.ts | scoring.test.ts | Implemented |
| FR-007.10 | False accusation (-1) | KhamTongHamRoom.ts | scoring.test.ts, AEG-53 | Implemented |
| FR-008.5 | Guess scoring (+3/0) | KhamTongHamRoom.ts | scoring.test.ts | Implemented |
| FR-011.3 | Host disconnect transfer | KhamTongHamRoom.ts | disconnect.test.ts | Implemented |
| FR-012.1 | Nickname filter | KhamTongHamRoom.ts | anti-abuse.test.ts | Implemented |
| FR-012.2 | Rejoin tokens | KhamTongHamRoom.ts | antiAbuse.test.ts (integration) | Implemented |
| FR-012.4 | Room code isolation | server/src/app.ts | API-15..16 (AEG-66) | Implemented |
| FR-013.1 | 19 categories (100+ words) | server/src/data/wordpacks/*.json | WPD-01..06 | Implemented |
| FR-013.2 | 3-tier difficulty | wordPicker.ts + pack JSON | WPD-04 | Implemented |
| FR-013.3 | Custom wordpack API | wordPicker.ts (saveWordPack) | WP-07 | Implemented |

## Business Rules -> Implementation

| Rule | Implementation | Verified By |
|------|---------------|-------------|
| BR-1 (min 2 players) | KhamTongHamRoom.ts START_GAME handler | twoPlayer.test.ts |
| BR-2 (max 8 players) | KhamTongHamRoom.ts maxClients=8 | API-08, eightPlayer.test.ts |
| BR-3 (4 uppercase, no I/O) | roomCode.ts | RC-01..07 |
| BR-4 (2h expiry) | KhamTongHamRoom.ts cleanup timer | expiry.test.ts |
| BR-7 (unique word/round) | wordPicker.ts pickUniqueWords | WP-01..05, WPD-03 |
| BR-9 (majority vote) | KhamTongHamRoom.ts vote resolution | voteResolution.test.ts |
| BR-10 (tie = fail) | KhamTongHamRoom.ts vote resolution | voteResolution.test.ts |

## Known Gaps (resolved)

All Sprint 1 gaps resolved as of 2026-05-05:
- KTH-T-001: Category count assertions updated (10->19) -- DONE
- KTH-T-002: Disconnect playerCount off-by-1 fixed -- DONE
- KTH-T-003: All 19 wordpacks validated (structure + content) -- DONE

## Platform Expansion (Sprint 2+)

New games planned -- see PLATFORM_SPEC_v2.md for full requirements:
- Werewolf (WW-001..004), Spy (SP-001..004), Knights (KN-001..004)
- Word Link (WL-001..004), Draw & Guess (DG-001..006)
- Platform shared requirements (PFR-001..003)
