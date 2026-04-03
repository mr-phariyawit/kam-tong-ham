# คำต้องห้าม — Complete Specification
## BRD · SRS · UX Blueprint · Technical Architecture

---

# PART 1 — BUSINESS REQUIREMENTS DOCUMENT (BRD)

## 1.1 Executive Summary

**Product Name:** คำต้องห้าม (Kham Tong Ham)
**Type:** Mobile web party game (PWA)
**Engine:** Construct 3 (HTML5) + Colyseus multiplayer server
**Market:** Thailand, Thai-speaking users age 13–35
**Launch Target:** MVP v1.0

คำต้องห้าม is a digitization of the viral Thai party game by เทพลีลา. The physical game sold out instantly. This product removes all physical barriers — no headbands, no card decks, no equipment — and enables any group to play with only the phones they already carry.

---

## 1.2 Business Objectives

| # | Objective | 3-Month KPI |
|---|-----------|------------|
| BO-1 | Drive organic adoption in Thai friend groups | 500+ games/week |
| BO-2 | Establish brand as the digital home of คำต้องห้าม | 20+ card categories, 50+ words each |
| BO-3 | Achieve frictionless session start | Room creation → first round < 15 seconds |
| BO-4 | Ensure broad device accessibility | Works on mid-range Android, < 2 sec load |
| BO-5 | Enable organic sharing via Line | Room codes shared organically |
| BO-6 | Sustain multiplayer engagement | Average 4+ players per room |

---

## 1.3 Target Users

**Primary Persona: ไปเที่ยวกับเพื่อน (Friend Group)**
- Age: 16–25
- Context: Night out, house party, school gathering
- Device: Android mid-range (Samsung A-series), iOS Safari
- Behavior: Discovers game via Line chat, joins quickly, plays 3–5 rounds

**Secondary Persona: ครอบครัว (Family Gathering)**
- Age: 13–50 (mixed)
- Context: New Year, Songkran, weekend family dinner
- Device: Mixed iOS/Android
- Behavior: Needs simple, clear Thai UI, forgiving onboarding

**Tertiary Persona: ออฟฟิศปาร์ตี้ (Office Party)**
- Age: 22–35
- Context: Team building, year-end parties
- Behavior: 4–8 players, needs reliable room stability

---

## 1.4 Problem Statement

The physical board game คำต้องห้าม by เทพลีลา:
- Sells out immediately — supply can't meet demand
- Headbands break after repeated use
- Card decks wear out
- Can't scale the word library without reprinting
- Requires carrying physical equipment

**Solution:** A PWA that every player accesses on their existing phone. Zero setup cost. Infinite card library. No equipment to break or forget.

---

## 1.5 Business Rules

| Rule | Description |
|------|-------------|
| BR-1 | Minimum 2 players to start a game |
| BR-2 | Maximum 8 players per room |
| BR-3 | Room codes are 4 uppercase letters (e.g. KTHM) |
| BR-4 | Room codes expire after 2 hours of inactivity |
| BR-5 | All words must be family-friendly (moderated content) |
| BR-6 | No user accounts required — guest play with nickname + emoji avatar |
| BR-7 | Each player must receive a unique word per round (no duplicates in same game) |
| BR-8 | Host player controls game progression; other players cannot start/skip rounds |
| BR-9 | Killing mechanic requires majority vote (> 50%) from non-accused alive players |
| BR-10 | Tie votes (equal yes/no) = accusation fails |

---

## 1.6 MVP Scope

### IN SCOPE (v1)
- Room creation and joining via code or QR scan
- Lobby management (player list, configuration, start)
- Core game loop with all states: LOBBY → COUNTDOWN → PLAYING → VOTING → ROUND_END → SCOREBOARD → GAME_OVER
- Kill accusation + voting mechanic
- Guess-own-word bonus phase
- Full scoring system
- 10 card categories (คำทั่วไป, อาหาร, สัตว์, อาชีพ, สถานที่, อารมณ์, กีฬา, สี, ร่างกาย, ครอบครัว)
- Mobile-optimized touch UI in Thai
- PWA (installable, offline home screen icon)
- Share results button

### OUT OF SCOPE (v1)
- Native iOS/Android app
- Online play with strangers (same-room only)
- Voice/video chat
- User accounts or persistent profiles
- Monetization/ads
- AI opponents
- English language support

---

# PART 2 — SOFTWARE REQUIREMENTS SPECIFICATION (SRS)

## 2.1 System Architecture Overview

```
[Browser / PWA]                    [Colyseus Server]
Construct 3 Game                   Node.js + Colyseus
  ↕ WebSocket (ws://)              Room state machine
  ↕ JSON messages                  Word assignment
                                   Vote tallying
                                   Score calculation
                                   Timer management

[Static Hosting]                   [App Server Hosting]
Vercel / Netlify                   Railway / Render
HTML5 export from C3               Node.js process
```

---

## 2.2 Functional Requirements

### FR-001: Home Screen
- **FR-001.1** Display game logo and title in Thai
- **FR-001.2** "สร้างห้อง" (Create Room) button — navigates to lobby as host
- **FR-001.3** "เข้าร่วม" (Join) button — opens room code entry or QR scanner
- **FR-001.4** Display category browser (view available word packs)

### FR-002: Room Creation
- **FR-002.1** System generates unique 4-letter room code on server
- **FR-002.2** Host is prompted to enter nickname (1–15 Thai/English chars) + pick emoji avatar
- **FR-002.3** QR code generated from join URL (e.g. `https://kthm.app/join/ABCD`)
- **FR-002.4** Room code displayed large, copyable to clipboard
- **FR-002.5** Room persists until game ends or 2-hour idle timeout

### FR-003: Room Joining
- **FR-003.1** Player enters 4-letter room code (case-insensitive)
- **FR-003.2** Player enters nickname + selects emoji avatar
- **FR-003.3** System validates: room exists, not full (< 8), game not in progress
- **FR-003.4** QR code scan auto-fills room code
- **FR-003.5** On join success, player sees lobby screen
- **FR-003.6** Error messages shown in Thai for: room not found, room full, game in progress

### FR-004: Lobby
- **FR-004.1** Real-time player list (nickname + emoji + host crown if host)
- **FR-004.2** Host sees configuration controls: category, round count (1–5), timer (2/3/5 min)
- **FR-004.3** Non-host players see configuration read-only
- **FR-004.4** "เริ่มเกม" (Start Game) button — host only, enabled when ≥ 2 players
- **FR-004.5** Players can leave lobby; host leaving transfers host to next player
- **FR-004.6** Host can kick players before game starts
- **FR-004.7** Room code + QR shown for late joiners

### FR-005: Game Start / Countdown
- **FR-005.1** 3-second countdown displayed on all phones simultaneously
- **FR-005.2** Server broadcasts COUNTDOWN state; client shows "3… 2… 1… เริ่ม!"
- **FR-005.3** Server assigns unique forbidden word to each player from selected category
- **FR-005.4** Each word is revealed ONLY to that player's phone after countdown

### FR-006: Playing State
- **FR-006.1** Player's forbidden word displayed in text ≥ 150px, bold, centered, full-screen
- **FR-006.2** Background color unique per player (8 distinct colors)
- **FR-006.3** Round timer displayed at top (counts down, turns red at last 30 seconds)
- **FR-006.4** Alive player count shown
- **FR-006.5** "ฆ่า!" (Kill) button — large, red, thumb-friendly at bottom, full-width
- **FR-006.6** "เดาคำ" (Guess Word) button — small, accessible
- **FR-006.7** "ยอมแพ้" (Surrender) button — small, penalty -3 pts
- **FR-006.8** Eliminated players see spectator view (others' words hidden, game timer visible)
- **FR-006.9** Server manages timer; client syncs from server time to prevent drift

### FR-007: Kill Accusation Flow
- **FR-007.1** Player presses Kill button → sees list of alive players (excluding self)
- **FR-007.2** Accuser selects target
- **FR-007.3** Server broadcasts VOTING state to all players
- **FR-007.4** Accused player's name shown; their word is revealed to all voters
- **FR-007.5** All alive players except accused vote: "โดนแล้ว" (Guilty) / "ยังนะ" (Not Yet)
- **FR-007.6** Accuser cannot vote on own accusation
- **FR-007.7** 15-second vote timer; absent votes default to "Not Yet"
- **FR-007.8** Vote progress bar shows real-time tally
- **FR-007.9** Result: majority YES → accused eliminated (-3 pts), accuser +2 pts
- **FR-007.10** Result: majority NO → false accusation (-1 pt for accuser, accused resumes)
- **FR-007.11** After voting, return to PLAYING state

### FR-008: Round End
- **FR-008.1** Triggered when: timer expires, or only 1 alive player remains
- **FR-008.2** All forbidden words revealed to all players
- **FR-008.3** Surviving players enter GUESS_PHASE (10-second window)
- **FR-008.4** Each survivor types their guess for their own word
- **FR-008.5** Correct guess: +3 pts; wrong guess: 0 pts (word revealed)
- **FR-008.6** Round summary shown: each player with word, status icon, points earned

### FR-009: Scoreboard
- **FR-009.1** After each round, cumulative scoreboard displayed
- **FR-009.2** Ranked list with total points, sorted descending
- **FR-009.3** Point change from this round shown (+/- delta)
- **FR-009.4** Confetti animation for current leader
- **FR-009.5** Host sees "รอบถัดไป" (Next Round) and "จบเกม" (End Game) buttons
- **FR-009.6** Auto-advance to next round or game over based on round count setting

### FR-010: Game Over
- **FR-010.1** Final rankings displayed with crown animation for winner
- **FR-010.2** "แชร์ผล" (Share Results) button generates shareable card image for Line
- **FR-010.3** "เล่นอีก" (Play Again) button returns to lobby with same players
- **FR-010.4** "ออก" (Exit) button disconnects player

### FR-011: Disconnection Handling
- **FR-011.1** Player disconnects: shown as "ขาดการเชื่อมต่อ" (Disconnected) in lobby/scoreboard
- **FR-011.2** Disconnected player during game: treated as surrendered
- **FR-011.3** Host disconnects: leadership transferred to next connected player
- **FR-011.4** All players disconnect: room cleaned up after 30 seconds

---

## 2.3 Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-1 | Performance | Full game load < 2 seconds on mid-range Android (3G equivalent) |
| NFR-2 | Performance | WebSocket round-trip < 100ms for room state sync |
| NFR-3 | Compatibility | Must work on: Android Chrome 90+, iOS Safari 14+, Samsung Internet 14+ |
| NFR-4 | Reliability | Room state survives single server restart (graceful shutdown) |
| NFR-5 | Scalability | Support 100 concurrent rooms (MVP), target 1000 rooms at peak |
| NFR-6 | Accessibility | Thai font renders correctly (Sarabun or Noto Sans Thai) |
| NFR-7 | Security | No PII collected; no auth tokens stored beyond session |
| NFR-8 | PWA | Installable on home screen; works with cached assets offline (lobby display) |
| NFR-9 | Availability | 99% uptime on Railway/Render (managed platform SLA) |
| NFR-10 | Content Safety | All word packs reviewed for family-friendly content before launch |

---

## 2.4 WebSocket Message Protocol

### Client → Server Messages

```json
// Join room
{ "type": "JOIN", "roomCode": "ABCD", "nickname": "สมชาย", "avatar": "😎" }

// Start game (host only)
{ "type": "START_GAME" }

// Accuse player
{ "type": "ACCUSE", "targetPlayerId": "player-uuid" }

// Vote
{ "type": "VOTE", "vote": "guilty" }  // "guilty" | "not_yet"

// Submit word guess
{ "type": "GUESS_WORD", "guess": "ข้าว" }

// Surrender
{ "type": "SURRENDER" }

// Next round (host)
{ "type": "NEXT_ROUND" }

// End game (host)
{ "type": "END_GAME" }
```

### Server → Client Messages

```json
// Full state sync
{ "type": "STATE_SYNC", "state": { ...GameState } }

// Your secret word (private, only sent to the target player)
{ "type": "YOUR_WORD", "word": "ข้าว" }

// Countdown
{ "type": "COUNTDOWN", "secondsLeft": 3 }

// Kill accusation broadcast
{ "type": "ACCUSATION", "accuserId": "...", "accuserName": "สมชาย", "targetId": "...", "targetName": "สมหญิง", "targetWord": "ข้าว" }

// Vote result
{ "type": "VOTE_RESULT", "guilty": true, "yesCount": 3, "noCount": 1 }

// Round ended
{ "type": "ROUND_END", "reason": "timer" }  // "timer" | "last_survivor"

// Guess result
{ "type": "GUESS_RESULT", "correct": true, "word": "ข้าว" }

// Error
{ "type": "ERROR", "code": "ROOM_FULL", "message": "ห้องเต็มแล้ว" }
```

---

## 2.5 Data Models

### GameRoom (Colyseus Room State)

```typescript
interface GameRoom {
  roomCode: string;        // 4-letter code
  phase: GamePhase;        // LOBBY | COUNTDOWN | PLAYING | VOTING | ROUND_END | SCOREBOARD | GAME_OVER
  config: GameConfig;
  players: Map<string, Player>;
  currentRound: number;
  roundTimer: number;      // seconds remaining
  voteTimer: number;
  currentAccusation: Accusation | null;
  roundWords: Map<string, string>;  // playerId → word (server-side only)
  createdAt: number;
}

interface GameConfig {
  category: string;
  totalRounds: number;     // 1–5
  roundDurationSecs: number; // 120 | 180 | 300
}

interface Player {
  id: string;
  nickname: string;
  avatar: string;          // emoji
  isHost: boolean;
  isAlive: boolean;
  isConnected: boolean;
  score: number;
  color: PlayerColor;      // assigned on join
  vote: "guilty" | "not_yet" | null;  // current round vote
}

interface Accusation {
  accuserId: string;
  targetId: string;
  targetWord: string;
  voteDeadline: number;    // unix timestamp
}
```

### WordPack (JSON file bundled in C3 project)

```json
{
  "id": "food",
  "category": "อาหาร",
  "icon": "🍜",
  "difficulty": "easy",
  "words": ["ข้าว", "แกง", "ส้มตำ", "ผัดไทย", "ต้มยำ", ...]
}
```

---

# PART 3 — UX BLUEPRINT

## 3.1 Design Principles

1. **เข้าใจทันที (Immediate Clarity)** — Word must be readable from arm's length. Zero learning curve.
2. **นิ้วโป้งแรก (Thumb-First)** — All primary actions reachable by one thumb in portrait.
3. **ภาษาไทยเป็นหลัก (Thai-First)** — All copy in Thai, culturally resonant language.
4. **ดูสนุก (Feel Fun)** — Bright colors, playful animations, celebratory moments.
5. **ไม่สับสน (No Confusion)** — During game, one action per state. No menus. No clutter.

---

## 3.2 Color System

| Purpose | Color | Hex |
|---------|-------|-----|
| Primary action | Coral Red | #FF4757 |
| Secondary action | Deep Navy | #2F3542 |
| Success | Emerald | #2ED573 |
| Warning | Amber | #FFA502 |
| Player 1 | Blue | #1E90FF |
| Player 2 | Purple | #9C59D1 |
| Player 3 | Orange | #FF6B35 |
| Player 4 | Teal | #1ABC9C |
| Player 5 | Pink | #FF6B9D |
| Player 6 | Yellow | #FFC312 |
| Player 7 | Red | #E84393 |
| Player 8 | Indigo | #574BC8 |

---

## 3.3 Typography

- **Body / UI:** Sarabun (Google Fonts) — excellent Thai rendering
- **Forbidden Word Display:** Sarabun ExtraBold, 160px, white, letter-spacing -2px
- **Room Code:** Sarabun Bold, 48px, monospaced appearance
- **Score:** Sarabun Bold, 32px
- **Labels:** Sarabun Regular, 16px

---

## 3.4 Screen Flows

```
[Home]
  ├── [Create Room] → [Enter Nickname] → [Lobby (Host)]
  └── [Join Room] → [Enter Code / Scan QR] → [Enter Nickname] → [Lobby (Player)]

[Lobby]
  └── [Start Game] (host only, ≥2 players)
        └── [Countdown 3-2-1]
              └── [Playing]
                    ├── [Kill Button] → [Select Target] → [Voting] → [Vote Result] → [Playing]
                    ├── [Guess Word Button] → [Guess Input] → [Result Toast]
                    ├── [Timer Expires] → [Round End] → [Guess Phase] → [Round Summary]
                    └── [Last Survivor] → [Round End]

[Round End / Scoreboard]
  ├── [Next Round] → [Countdown]
  └── [Game Over] → [Final Scoreboard] → [Share / Play Again / Exit]
```

---

## 3.5 Screen Wireframes (Detailed)

### Screen 1: หน้าแรก (Home)
```
┌─────────────────────────┐
│  [Status Bar]           │
│                         │
│    🎭                   │
│  คำต้องห้าม            │
│  (logo + title)         │
│                         │
│  ┌─────────────────┐   │
│  │  สร้างห้อง     │   │  ← Primary CTA (red)
│  └─────────────────┘   │
│                         │
│  ┌─────────────────┐   │
│  │  เข้าร่วมห้อง  │   │  ← Secondary (outline)
│  └─────────────────┘   │
│                         │
│  📚 หมวดคำ ►           │  ← Browse categories
│                         │
│  [Version + เทพลีลา]   │
└─────────────────────────┘
```

### Screen 2: ล็อบบี้ (Lobby)
```
┌─────────────────────────┐
│ ← ออก                  │
│                         │
│  รหัสห้อง              │
│  ┌───────────────────┐  │
│  │    K T H M       │  │  ← 48px bold, tap to copy
│  └───────────────────┘  │
│  [QR Code 120×120]      │
│                         │
│  ผู้เล่น 3/8           │
│  👑 สมชาย  😎          │  ← Host badge
│     สมหญิง 😊          │
│     เด็กเดิน 🐱        │
│                         │
│  [HOST ONLY ZONE]       │
│  หมวดคำ: อาหาร ▾       │
│  จำนวนรอบ: ○1 ●3 ○5  │
│  เวลา/รอบ: ○2 ●3 ○5 นาที│
│                         │
│  ┌─────────────────┐   │
│  │   เริ่มเกม      │   │  ← Enabled when ≥2 players
│  └─────────────────┘   │
└─────────────────────────┘
```

### Screen 3: เล่นเกม — หน้าจอหลัก (Playing)
```
┌─────────────────────────┐
│ เวลา  2:34  👁️3         │  ← Timer (red when <30s), alive count
│─────────────────────────│
│                         │
│                         │
│                         │
│   ข้า ว                 │  ← 160px ExtraBold, 1-3 char word
│                         │  ← Background = player color
│                         │
│                         │
│  [เดาคำ]   [ยอมแพ้]    │  ← Small buttons, top corners
│                         │
│ ┌─────────────────────┐ │
│ │       ฆ่า!          │ │  ← Full-width red, 80px height
│ └─────────────────────┘ │
└─────────────────────────┘
```

### Screen 4: โหวต Kill (Voting)
```
┌─────────────────────────┐
│  🗳️ โหวต               │
│  เวลาโหวต: 0:12        │
│─────────────────────────│
│                         │
│  สมหญิง 😊             │
│  พูดคำว่า...            │
│                         │
│  ┌─────────────────┐   │
│  │      ข้าว       │   │  ← Accused's word revealed, 64px
│  └─────────────────┘   │
│                         │
│  [██████░░░░] 2/3 โหวต │  ← Vote progress
│                         │
│  ┌──────────┐  ┌──────┐│
│  │ โดนแล้ว │  │ยังนะ ││  ← Green / Gray
│  └──────────┘  └──────┘│
│                         │
│  (ผู้ถูกกล่าวหาดูหน้าจอนี้) │
└─────────────────────────┘
```

### Screen 5: เดาคำ (Guess Phase)
```
┌─────────────────────────┐
│  🧠 เดาคำของคุณ!        │
│  เวลาเหลือ: 0:08        │
│─────────────────────────│
│                         │
│  คุณคิดว่าคำของคุณ      │
│  คืออะไร?               │
│                         │
│  ┌─────────────────┐   │
│  │ พิมพ์คำที่นี่...│   │  ← Text input
│  └─────────────────┘   │
│                         │
│  ┌─────────────────┐   │
│  │    ส่งคำตอบ     │   │
│  └─────────────────┘   │
│                         │
│  (หรือกด skip)          │
└─────────────────────────┘
```

### Screen 6: สรุปรอบ (Round End)
```
┌─────────────────────────┐
│  จบรอบ 2/3              │
│─────────────────────────│
│                         │
│  ชื่อ   คำ    สถานะ  +/- │
│  👑สมชาย ข้าว  ⭐รอด   +5 │
│  😊สมหญิง แกง  💀โดน  -3 │
│  🐱เด็กเดิน ส้มตำ ⭐🧠 +8│
│                         │
│  รอบนี้ได้คะแนน         │
│  สมชาย: +5              │
│  เด็กเดิน: +8 ⬆️        │
│                         │
│  [ต่อไป →]              │  ← Auto-advance 5s or tap
└─────────────────────────┘
```

### Screen 7: กระดานคะแนน (Scoreboard)
```
┌─────────────────────────┐
│  🏆 คะแนน               │
│─────────────────────────│
│                         │
│  🥇 เด็กเดิน 🐱   28 pt │
│  🥈 สมชาย 😎     22 pt  │
│  🥉 สมหญิง 😊    14 pt  │
│                         │
│  รอบ 2/3               │
│                         │
│  [เล่นรอบถัดไป] ← host │
│  [จบเกม]        ← host │
└─────────────────────────┘
```

### Screen 8: จบเกม (Game Over)
```
┌─────────────────────────┐
│  🎉 จบเกม!              │
│─────────────────────────│
│                         │
│  👑 ผู้ชนะ             │
│  เด็กเดิน 🐱   42 pt   │
│  [🎊 Confetti anim 🎊]  │
│                         │
│  อันดับ:               │
│  1. เด็กเดิน  42 pt    │
│  2. สมชาย    31 pt     │
│  3. สมหญิง   22 pt     │
│                         │
│  [📤 แชร์ผล]           │
│  [🔄 เล่นอีก]          │
│  [🚪 ออก]              │
└─────────────────────────┘
```

---

## 3.6 Animations & Micro-interactions

| Trigger | Animation |
|---------|-----------|
| Word reveal after countdown | Scale-in from 0 + bounce |
| Kill button press | Ripple + vibration (haptic) |
| Vote confirmed | Slide + fade result card |
| Kill confirmed | Screen flash red + skull emoji overlay |
| False accusation | Screen flash white + shield emoji |
| Correct word guess | Firework burst |
| Round winner | Confetti fall |
| Final winner crown | Crown drop + sparkle |

---

# PART 4 — TECHNICAL ARCHITECTURE

## 4.1 System Topology

```
                    ┌────────────────────────────────────┐
                    │           Player Devices            │
                    │  Construct 3 PWA (HTML5/WebSocket)  │
                    │  Android Chrome | iOS Safari         │
                    └───────────────┬────────────────────┘
                                    │ WSS (WebSocket Secure)
                    ┌───────────────▼────────────────────┐
                    │         Colyseus Server              │
                    │   Node.js 20 + Colyseus 0.15.x      │
                    │   Railway / Render (auto-scale)      │
                    │                                      │
                    │  Rooms: KhamTongHamRoom (custom)     │
                    │  State: Schema-based (auto-sync)     │
                    │  In-memory: no DB for v1             │
                    └────────────────────────────────────┘

                    ┌────────────────────────────────────┐
                    │      Static Asset Hosting           │
                    │  Construct 3 HTML5 export           │
                    │  Vercel / Netlify (CDN edge)        │
                    │  + Word pack JSON files             │
                    └────────────────────────────────────┘
```

---

## 4.2 Construct 3 Project Structure

```
Project Root
├── Layouts
│   ├── Home.c3l
│   ├── Lobby.c3l
│   ├── Playing.c3l
│   ├── Voting.c3l
│   ├── RoundEnd.c3l
│   ├── Scoreboard.c3l
│   └── GameOver.c3l
│
├── Event Sheets
│   ├── Global.c3e           ← WebSocket + global state
│   ├── Home.c3e
│   ├── Lobby.c3e
│   ├── Playing.c3e          ← Timer + Kill button logic
│   ├── Voting.c3e           ← Vote collection + timer
│   ├── RoundEnd.c3e
│   ├── Scoreboard.c3e
│   └── GameOver.c3e
│
├── Objects
│   ├── WebSocket plugin     ← Construct 3 WebSocket object
│   ├── LocalStorage plugin  ← Nickname + avatar persistence
│   ├── Browser plugin       ← QR, clipboard, share API
│   └── Audio plugin         ← Sound effects
│
├── Files (bundled JSON)
│   ├── wordpacks/
│   │   ├── common.json      ← คำทั่วไป
│   │   ├── food.json        ← อาหาร
│   │   ├── animals.json     ← สัตว์
│   │   └── [7 more packs]
│   └── config.json          ← Server URL, app version
│
└── Project Files
    ├── manifest.json        ← PWA manifest (Thai name, icons)
    └── service-worker.js    ← PWA cache strategy
```

---

## 4.3 Construct 3 State Machine (Event Sheet Design)

### Global.c3e — WebSocket Management

```
// On WebSocket Message received:
CONDITION: WebSocket.LastMessageTag = "STATE_SYNC"
ACTION: Parse JSON → update all global variables

CONDITION: WebSocket.LastMessageTag = "YOUR_WORD"
ACTION: Set GlobalVar.MyWord = parsed word
        → Play word reveal animation

CONDITION: WebSocket.LastMessageTag = "COUNTDOWN"
ACTION: Set GlobalVar.CountdownSec = data.secondsLeft
        → Update countdown display

CONDITION: WebSocket.LastMessageTag = "ACCUSATION"
ACTION: Store accusation data
        → Go to layout "Voting"

CONDITION: WebSocket.LastMessageTag = "VOTE_RESULT"
ACTION: Show result overlay
        → After 2 seconds, Go to layout "Playing"

CONDITION: WebSocket.LastMessageTag = "ROUND_END"
ACTION: Transition to "RoundEnd" layout

CONDITION: WebSocket.LastMessageTag = "ERROR"
ACTION: Show error toast in Thai
```

### Playing.c3e — Main Game Logic

```
// Timer sync from server
CONDITION: Every 1 second
ACTION: WebSocket.Send({ type: "HEARTBEAT" })
        // Server sends back timer value in STATE_SYNC

// Kill button
CONDITION: On KillButton clicked
ACTION: Show player selection list (alive players only)
        → WebSocket.Send({ type: "ACCUSE", targetPlayerId: selected })

// Guess button
CONDITION: On GuessButton clicked
ACTION: Show guess input overlay

// Surrender
CONDITION: On SurrenderButton clicked
         AND Confirm dialog = OK
ACTION: WebSocket.Send({ type: "SURRENDER" })
```

---

## 4.4 Colyseus Server Architecture

### File Structure

```
server/
├── src/
│   ├── index.ts              ← Express + Colyseus setup
│   ├── rooms/
│   │   └── KhamTongHamRoom.ts ← Main room class
│   ├── schemas/
│   │   ├── GameState.ts      ← @colyseus/schema definitions
│   │   ├── Player.ts
│   │   └── Accusation.ts
│   ├── utils/
│   │   ├── roomCode.ts       ← 4-letter code generator
│   │   ├── wordPicker.ts     ← Unique word assignment per round
│   │   └── timer.ts          ← Server-authoritative timer
│   └── data/
│       └── wordpacks/        ← Same JSON as C3 (or fetched from static host)
├── package.json
└── tsconfig.json
```

### KhamTongHamRoom.ts — Core Logic

```typescript
import { Room, Client } from "colyseus";
import { GameState, Player } from "../schemas/GameState";

export class KhamTongHamRoom extends Room<GameState> {
  maxClients = 8;

  onCreate(options: any) {
    this.setState(new GameState());
    this.state.roomCode = generateRoomCode();
    this.state.phase = "LOBBY";
    this.setSimulationInterval(() => this.tick(), 1000);
  }

  onJoin(client: Client, options: any) {
    const player = new Player();
    player.id = client.sessionId;
    player.nickname = sanitize(options.nickname);
    player.avatar = validateEmoji(options.avatar);
    player.isHost = this.state.players.size === 0;
    player.color = assignColor(this.state.players.size);
    this.state.players.set(client.sessionId, player);
  }

  onMessage(client: Client, data: any) {
    switch (data.type) {
      case "START_GAME": this.handleStartGame(client); break;
      case "ACCUSE": this.handleAccuse(client, data); break;
      case "VOTE": this.handleVote(client, data); break;
      case "GUESS_WORD": this.handleGuessWord(client, data); break;
      case "NEXT_ROUND": this.handleNextRound(client); break;
      case "END_GAME": this.handleEndGame(client); break;
      case "SURRENDER": this.handleSurrender(client); break;
    }
  }

  tick() {
    if (this.state.phase === "PLAYING" && this.state.roundTimer > 0) {
      this.state.roundTimer--;
      if (this.state.roundTimer === 0) this.endRound("timer");
    }
    if (this.state.phase === "VOTING" && this.state.voteTimer > 0) {
      this.state.voteTimer--;
      if (this.state.voteTimer === 0) this.resolveVote();
    }
    if (this.state.phase === "COUNTDOWN" && this.state.countdownTimer > 0) {
      this.state.countdownTimer--;
      if (this.state.countdownTimer === 0) this.startPlaying();
    }
  }

  private handleStartGame(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player?.isHost) return;
    if (this.state.players.size < 2) return;

    // Assign words
    const words = pickUniqueWords(this.state.config.category, this.state.players.size);
    const playerIds = Array.from(this.state.players.keys());
    this.roundWords = new Map(playerIds.map((id, i) => [id, words[i]]));

    // Send each player their secret word (private message)
    this.roundWords.forEach((word, playerId) => {
      const playerClient = this.clients.find(c => c.sessionId === playerId);
      playerClient?.send({ type: "YOUR_WORD", word });
    });

    this.state.phase = "COUNTDOWN";
    this.state.countdownTimer = 3;
  }

  // ... additional handlers
}
```

### Colyseus Schema (Auto-sync to Clients)

```typescript
import { Schema, MapSchema, type } from "@colyseus/schema";

class Player extends Schema {
  @type("string") id: string;
  @type("string") nickname: string;
  @type("string") avatar: string;
  @type("boolean") isHost: boolean;
  @type("boolean") isAlive: boolean;
  @type("boolean") isConnected: boolean;
  @type("number") score: number;
  @type("string") color: string;
  // NOTE: word is NOT in schema — sent as private message only
}

class GameState extends Schema {
  @type("string") roomCode: string;
  @type("string") phase: string;
  @type({ map: Player }) players = new MapSchema<Player>();
  @type("number") currentRound: number;
  @type("number") totalRounds: number;
  @type("number") roundTimer: number;
  @type("number") voteTimer: number;
  @type("number") countdownTimer: number;
  @type("string") accusedPlayerId: string;
  @type("string") accuserPlayerId: string;
  @type("number") voteYes: number;
  @type("number") voteNo: number;
}
```

---

## 4.5 PWA Configuration

### manifest.json
```json
{
  "name": "คำต้องห้าม",
  "short_name": "คำต้องห้าม",
  "lang": "th",
  "start_url": "/",
  "display": "fullscreen",
  "orientation": "portrait",
  "background_color": "#1a1a2e",
  "theme_color": "#FF4757",
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

---

## 4.6 Room Code Generation

```typescript
const CONSONANTS = 'BCDFGHJKLMNPQRSTVWXYZ';
const VOWELS = 'AEIOU';

function generateRoomCode(): string {
  // Pattern: CVCV — pronounceable, easy to share verbally
  return [
    CONSONANTS[Math.floor(Math.random() * CONSONANTS.length)],
    VOWELS[Math.floor(Math.random() * VOWELS.length)],
    CONSONANTS[Math.floor(Math.random() * CONSONANTS.length)],
    VOWELS[Math.floor(Math.random() * VOWELS.length)],
  ].join('');
}
```

---

## 4.7 Word Assignment Algorithm

```typescript
function pickUniqueWords(category: string, count: number): string[] {
  const pack = wordPacks.find(p => p.id === category);
  if (!pack || pack.words.length < count) {
    throw new Error(`Not enough words in category ${category}`);
  }
  // Fisher-Yates shuffle, take first `count` items
  const shuffled = [...pack.words];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}
```

---

## 4.8 Hosting Configuration

### Colyseus Server (Railway)
```toml
# railway.toml
[build]
builder = "NIXPACKS"

[deploy]
startCommand = "npm start"
healthcheckPath = "/health"
```

```typescript
// server health endpoint
app.get('/health', (req, res) => res.json({ ok: true }));
```

### Construct 3 Static Deploy (Vercel)
```json
// vercel.json
{
  "cleanUrls": true,
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    }
  ]
}
```

---

## 4.9 Security Considerations

| Risk | Mitigation |
|------|------------|
| Word injection/XSS | Sanitize all nickname inputs; words come from server-controlled JSON only |
| Room code brute-force | Rate limit JOIN attempts to 10/min per IP |
| Host privilege abuse | Server validates isHost before processing START/NEXT/END messages |
| Client-side word reveal | Secret words sent as private WebSocket messages, never in Schema state |
| Fake vote manipulation | Server counts votes; client UI is display-only |
| Timer manipulation | Timers run on server; client displays server-provided value |

---

## 4.10 Word Pack Data (v1 — 10 Categories)

| Category ID | Thai Name | Icon | Min Words |
|-------------|-----------|------|-----------|
| common | คำทั่วไป | 💬 | 50 |
| food | อาหาร | 🍜 | 50 |
| animals | สัตว์ | 🐘 | 50 |
| jobs | อาชีพ | 👨‍⚕️ | 50 |
| places | สถานที่ | 🏛️ | 50 |
| emotions | อารมณ์ | 😊 | 40 |
| sports | กีฬา | ⚽ | 40 |
| colors | สี | 🎨 | 30 |
| body | ร่างกาย | 🦷 | 40 |
| family | ครอบครัว | 👨‍👩‍👧 | 30 |

**Total minimum:** 430 words across 10 categories.

---

## 4.11 Development Milestones

| Milestone | Deliverable | Notes |
|-----------|------------|-------|
| M1 | Colyseus server: LOBBY state + room creation + player join | Core infrastructure |
| M2 | C3: Home + Lobby screens wired to server | WebSocket handshake |
| M3 | Colyseus: Game start + word assignment + PLAYING state | Server-authoritative |
| M4 | C3: Playing screen with word display + timer | Core UX |
| M5 | Colyseus + C3: Kill accusation + voting flow | Kill mechanic |
| M6 | Colyseus + C3: Round end + guess phase + scoring | End-of-round |
| M7 | C3: Scoreboard + Game Over screens + animations | Polish |
| M8 | PWA manifest + offline caching + share button | PWA hardening |
| M9 | Word packs: all 10 categories, 430+ words | Content |
| M10 | Deploy: Railway (Colyseus) + Vercel (static) | Production |

---

# APPENDIX

## A1. Error Codes (Thai UI Messages)

| Code | Thai Message |
|------|-------------|
| ROOM_NOT_FOUND | ไม่พบห้องนี้ กรุณาตรวจสอบรหัส |
| ROOM_FULL | ห้องเต็มแล้ว (8/8 คน) |
| GAME_IN_PROGRESS | เกมกำลังดำเนินอยู่ |
| INVALID_NICKNAME | ชื่อต้องมี 1-15 ตัวอักษร |
| CONNECTION_LOST | ขาดการเชื่อมต่อ กำลังพยายามเชื่อมต่อใหม่... |
| NOT_HOST | เฉพาะโฮสต์เท่านั้น |
| INSUFFICIENT_PLAYERS | ต้องมีอย่างน้อย 2 คนเพื่อเริ่มเกม |

## A2. Browser Compatibility Matrix

| Browser | Version | Status |
|---------|---------|--------|
| Android Chrome | 90+ | ✅ Primary |
| iOS Safari | 14+ | ✅ Primary |
| Samsung Internet | 14+ | ✅ Supported |
| Desktop Chrome | Any | ✅ Supported |
| Firefox | 90+ | ✅ Supported |
| IE 11 | any | ❌ Not supported |

---

*Document version: 1.0 — Created by Sage (AEG-8)*
*For คำต้องห้าม v1 MVP — เทพลีลา format digital game*

