# Party Games TH (เกมปาร์ตี้)

> Real-time multiplayer party games platform -- 6 games, Thai-first, mobile-friendly
>
> แพลตฟอร์มเกมปาร์ตี้ออนไลน์ -- 6 เกม, รองรับภาษาไทย, เล่นได้ทุกอุปกรณ์

---

## Games / เกมทั้งหมด

| Game | Thai Name | Players | Type |
|------|-----------|---------|------|
| Forbidden Word | คำต้องห้าม | 2-8 | Word / Social |
| Word Link | คำเชื่อม | 4-10 | Team Word (Codenames-style) |
| Spy | สายลับ | 3-8 | Social Deduction (Spyfall-style) |
| Werewolf | หมาป่า | 5-15 | Social Deduction (Mafia-style) |
| Knights | อัศวิน | 5-10 | Team Mission (Avalon-style) |
| Draw & Guess | วาดทาย | 2-8 | Drawing (Pictionary-style) |

### How Each Game Works / แต่ละเกมเล่นอย่างไร

**Forbidden Word (คำต้องห้าม)**: Each player gets a secret word they must avoid saying. Trick others into saying their forbidden word. Survive and guess your own word to win.

**Word Link (คำเชื่อม)**: Two teams. Spymasters give one-word clues to guide their team to the right words on a 5x5 grid. Avoid the assassin card.

**Spy (สายลับ)**: Everyone is at a secret location except the spy. Ask questions, identify the spy. The spy tries to figure out the location.

**Werewolf (หมาป่า)**: Village vs Werewolves. Night: wolves hunt, seer peeks, doctor saves. Day: discuss, nominate, defend, vote. Includes a defense timer for accused players.

**Knights (อัศวิน)**: Good vs Evil on team missions. The leader proposes teams, everyone votes. Mission members secretly vote success/fail. Assassin gets a final guess.

**Draw & Guess (วาดทาย)**: One player draws, others guess. Points for speed. Thai word pool with hint system.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | HTML5 PWA (Vanilla JS, mobile-first) |
| Game Server | [Colyseus](https://colyseus.io/) 0.15 on Node.js |
| HTTP API | Express 4 |
| Language | TypeScript 5 |
| Real-time | WebSocket (Colyseus transport) |
| Tests | Vitest (514 tests) |

---

## Running Locally / รันในเครื่อง

### Prerequisites

- Node.js 18+
- npm 9+

### Install & Run

```bash
git clone <repo-url>
cd kam-tong-ham
npm install

# Development (hot reload)
npm run dev

# Production build
npm run build
npm start
```

Open `http://localhost:2567` in your browser.

### Run Tests

```bash
npm test
```

---

## Project Structure

```
kam-tong-ham/
├── client/                     # PWA frontend (static files)
│   ├── index.html              # Platform home (game selection)
│   ├── manifest.json
│   ├── sw.js                   # Service worker
│   ├── shared/
│   │   ├── common.css          # Shared styles (all games)
│   │   └── components/
│   │       ├── lobby.css       # Shared lobby styles
│   │       └── lobby.js        # Shared lobby logic
│   └── games/
│       ├── forbidden-word/     # คำต้องห้าม
│       ├── word-link/          # คำเชื่อม
│       ├── spy/                # สายลับ
│       ├── werewolf/           # หมาป่า
│       ├── knights/            # อัศวิน
│       └── draw-guess/         # วาดทาย
├── server/
│   └── src/
│       ├── index.ts            # Express + Colyseus entry point
│       ├── rooms/
│       │   ├── BaseRoom.ts     # Shared room logic (lobby, reconnect, host)
│       │   ├── KhamTongHamRoom.ts
│       │   ├── WordLinkRoom.ts
│       │   ├── SpyRoom.ts
│       │   ├── WerewolfRoom.ts
│       │   ├── KnightsRoom.ts
│       │   └── DrawGuessRoom.ts
│       ├── schemas/            # Colyseus state schemas per game
│       ├── data/
│       │   ├── wordpacks/      # JSON word category files (19 categories)
│       │   └── locations.json  # Spy game locations
│       ├── utils/              # Shared utilities
│       └── __tests__/          # 514 tests (Vitest)
├── package.json
└── tsconfig.json
```

---

## REST API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/games` | GET | List all registered games |
| `/api/rooms/create` | POST | Create new room (body: `{gameType}`) |
| `/api/rooms/:roomCode` | GET | Check room status |
| `/api/categories` | GET | List word categories |
| `/api/health` | GET | Health check |

---

## Architecture

All 6 games extend a shared `BaseRoom` that handles:
- Room lifecycle (create, join, leave, dispose)
- Player management (nicknames, avatars, host transfer)
- Reconnection (5-minute window with game state recovery)
- Rejoin token anti-abuse system
- Inactivity timeout (2 hours)

Game-specific logic (roles, phases, scoring) lives in each game's Room class. Private data (secret words, roles, spy identity) is stored server-side and sent via private messages -- never synced to other clients.

---

## Deploy

```bash
npm run build
PORT=3000 npm start
```

WebSocket and HTTP share the same port. Use a reverse proxy (nginx/caddy) that forwards WebSocket upgrades:

```nginx
location / {
    proxy_pass http://localhost:2567;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```

Compatible with Railway, Render, Fly.io -- set `PORT` env var, build: `npm run build`, start: `npm start`.

---

## License

MIT
