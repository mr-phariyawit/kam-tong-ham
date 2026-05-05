---
document: SI.01
title: Requirements Specification — คำต้องห้าม (Kham Tong Ham)
version: 1
status: Approved
created: 2026-05-05
author: Coulson (AEGIS v11.0)
project: คำต้องห้าม — Thai Party Game
source: SPEC.md (BRD + SRS)
---

# SI.01 Requirements Specification

## 1. Purpose

This document specifies the functional and non-functional requirements for คำต้องห้าม (Kham Tong Ham) v1.0 MVP. Requirements are derived from SPEC.md (comprehensive BRD/SRS/UX/Architecture doc) and validated against the existing implementation.

## 2. Stakeholders

| Stakeholder | Role | Primary Concern |
|-------------|------|----------------|
| Thai friend groups (16-25) | Primary users | Fast start, fun gameplay |
| Family gatherings (13-50) | Secondary users | Simple Thai UI, family-friendly |
| Office parties (22-35) | Tertiary users | Room stability for 4-8 players |
| Developer (mr.phariyawit) | Operator | Maintainability, test coverage |

## 3. Functional Requirements

### FR-001: Home Screen
| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-001.1 | Display game logo and title in Thai | Must | Implemented |
| FR-001.2 | "สร้างห้อง" (Create Room) button | Must | Implemented |
| FR-001.3 | "เข้าร่วม" (Join) button with code entry | Must | Implemented |
| FR-001.4 | Category browser (view available word packs) | Should | Implemented |

### FR-002: Room Creation
| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-002.1 | Generate unique 4-letter room code (no I/O) | Must | Implemented |
| FR-002.2 | Nickname entry (1-15 chars) + emoji avatar | Must | Implemented |
| FR-002.3 | QR code from join URL | Should | Pending |
| FR-002.4 | Room code displayed large, copyable | Must | Implemented |
| FR-002.5 | 2-hour idle timeout cleanup | Must | Implemented (AEG-51) |

### FR-003: Room Joining
| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-003.1 | 4-letter code entry (case-insensitive) | Must | Implemented |
| FR-003.2 | Nickname + emoji avatar selection | Must | Implemented |
| FR-003.3 | Validation: exists, not full, not in progress | Must | Implemented |
| FR-003.4 | QR scan auto-fill | Should | Pending |
| FR-003.5 | Lobby screen on success | Must | Implemented |
| FR-003.6 | Thai error messages | Must | Implemented |

### FR-004: Lobby
| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-004.1 | Real-time player list | Must | Implemented |
| FR-004.2 | Host config: category, rounds (1-5), timer | Must | Implemented |
| FR-004.3 | Non-host read-only view | Must | Implemented |
| FR-004.4 | Start button (host only, >= 2 players) | Must | Implemented |
| FR-004.5 | Host transfer on leave | Must | Implemented (AEG-31/51) |
| FR-004.6 | Host kick functionality | Should | Implemented |
| FR-004.7 | Room code + QR for late joiners | Should | Partial |

### FR-005: Game Start / Countdown
| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-005.1 | 3-second countdown on all devices | Must | Implemented |
| FR-005.2 | COUNTDOWN state broadcast | Must | Implemented |
| FR-005.3 | Unique word per player from selected category | Must | Implemented (AEG-37) |
| FR-005.4 | Word revealed only to owning player | Must | Implemented |

### FR-006: Playing State
| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-006.1 | Forbidden word displayed large (>=150px) | Must | Implemented |
| FR-006.2 | Unique background color per player (8 colors) | Must | Implemented |
| FR-006.3 | Round timer with red at 30s | Must | Implemented |
| FR-006.4 | Alive player count | Must | Implemented |
| FR-006.5 | Kill button (large, red, bottom) | Must | Implemented |
| FR-006.6 | Guess Word button | Must | Implemented |
| FR-006.7 | Surrender button (-3 pts) | Should | Implemented |
| FR-006.8 | Spectator view for eliminated | Must | Implemented |
| FR-006.9 | Server-managed timer (no drift) | Must | Implemented |

### FR-007: Kill Accusation + Voting
| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-007.1 | Kill -> alive player list (exclude self) | Must | Implemented |
| FR-007.2 | Target selection | Must | Implemented |
| FR-007.3 | VOTING state broadcast | Must | Implemented |
| FR-007.4 | Accused word revealed to voters | Must | Implemented (AEG-34) |
| FR-007.5 | Guilty/Not Yet vote (alive, excl. accused) | Must | Implemented |
| FR-007.6 | Accuser cannot vote | Must | Implemented |
| FR-007.7 | 15s vote timer, default=Not Yet | Must | Implemented |
| FR-007.8 | Real-time tally | Should | Implemented |
| FR-007.9 | Majority YES: eliminate (-3), accuser +2 | Must | Implemented |
| FR-007.10 | Majority NO: false accusation (-1 accuser) | Must | Implemented (AEG-53) |
| FR-007.11 | Return to PLAYING after vote | Must | Implemented |

### FR-008: Round End
| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-008.1 | Trigger: timer expires OR 1 alive | Must | Implemented |
| FR-008.2 | All words revealed | Must | Implemented |
| FR-008.3 | GUESS_PHASE (10s window) | Must | Implemented |
| FR-008.4 | Survivor types guess | Must | Implemented |
| FR-008.5 | Correct: +3, Wrong: 0 | Must | Implemented |
| FR-008.6 | Round summary display | Must | Implemented |

### FR-009: Scoreboard
| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-009.1 | Cumulative scoreboard after each round | Must | Implemented |
| FR-009.2 | Ranked list, descending | Must | Implemented |
| FR-009.3 | Point delta shown | Should | Implemented |
| FR-009.4 | Leader animation | Nice | Pending |
| FR-009.5 | Next Round / End Game buttons (host) | Must | Implemented |
| FR-009.6 | Auto-advance based on round count | Must | Implemented |

### FR-010: Game Over
| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-010.1 | Final rankings + winner crown | Must | Partial |
| FR-010.2 | Share Results button (Line card) | Should | Pending |
| FR-010.3 | Play Again button | Must | Implemented |
| FR-010.4 | Exit button | Must | Implemented |

### FR-011: Disconnection
| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-011.1 | Show disconnected status | Must | Implemented |
| FR-011.2 | Disconnect during game = surrendered | Must | Implemented |
| FR-011.3 | Host disconnect = transfer | Must | Implemented (AEG-51) |
| FR-011.4 | All disconnect = cleanup 30s | Must | Implemented (AEG-51) |

### FR-012: Anti-Abuse (added Sprint 2)
| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-012.1 | Nickname filter (profanity, impersonation) | Must | Implemented (AEG-59) |
| FR-012.2 | Rejoin token system | Must | Implemented (AEG-41) |
| FR-012.3 | Rate limiting on room creation | Should | Implemented |
| FR-012.4 | Room code isolation (no cross-room access) | Must | Implemented (AEG-66) |

### FR-013: Word Pack System (expanded Sprint 3)
| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-013.1 | 19 built-in categories (100+ words each) | Must | In Progress |
| FR-013.2 | 3-tier difficulty (easy/medium/hard) per pack | Must | Implemented (AEG-37) |
| FR-013.3 | Custom wordpack upload via API | Should | Implemented |
| FR-013.4 | Custom pack override built-in on ID match | Should | Implemented |
| FR-013.5 | No duplicate words within pack | Must | In Progress |

## 4. Non-Functional Requirements

| ID | Category | Requirement | Priority | Status |
|----|----------|-------------|----------|--------|
| NFR-1 | Performance | Load < 2s on mid-range Android | Must | Untested |
| NFR-2 | Performance | WebSocket RTT < 100ms | Must | Untested |
| NFR-3 | Compatibility | Android Chrome 90+, iOS Safari 14+, Samsung Internet 14+ | Must | Untested |
| NFR-4 | Reliability | Room state survives graceful restart | Should | Untested |
| NFR-5 | Scalability | 100 concurrent rooms (MVP) | Must | Untested |
| NFR-6 | Accessibility | Thai font renders correctly | Must | Implemented |
| NFR-7 | Security | No PII, no persistent tokens | Must | Implemented |
| NFR-8 | PWA | Installable, offline home screen | Should | Implemented |
| NFR-9 | Availability | 99% uptime (platform SLA) | Must | Not deployed |
| NFR-10 | Content | Family-friendly word packs | Must | In Review |

## 5. Test Coverage Summary

| Area | Tests | Status |
|------|-------|--------|
| Word Picker | 14 tests | 12 pass, 2 fail (count assertions) |
| Word Pool | 18 tests | All pass |
| Room Code | 7 tests | All pass |
| REST API | 16 tests | All pass |
| Scoring | 6 tests | All pass |
| Vote Resolution | 6 tests | All pass |
| Anti-Abuse | 12 tests | All pass |
| Integration: 2-Player | 8 tests | All pass |
| Integration: 8-Player | 4 tests | All pass |
| Integration: Blind Voting | 6 tests | All pass |
| Integration: Expiry | 4 tests | All pass |
| Integration: Disconnect | 5 tests | 5 fail (off-by-1) |
| **Total** | **172** | **165 pass / 7 fail** |
