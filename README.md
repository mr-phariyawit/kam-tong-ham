# คำต้องห้าม (Kham Tong Ham)

> เกมปาร์ตี้ไทย — อย่าพูดคำต้องห้ามของคุณ!
>
> Thai party game — don't say your forbidden word!

---

## เกี่ยวกับโปรเจกต์ / About

**คำต้องห้าม** เป็นเกมปาร์ตี้มือถือแบบ multiplayer ที่ดิจิไทซ์เกมกระดาษยอดนิยมของ เทพลีลา ผู้เล่นแต่ละคนได้รับคำลับที่ห้ามพูด แล้วพยายามหลอกล่อให้คนอื่นพลั้งปาก ใครอยู่รอดสุดท้ายและเดาคำของตัวเองถูกจะได้คะแนนสูงสุด

**คำต้องห้าม** is a real-time multiplayer mobile web party game digitizing the popular Thai board game by เทพลีลา. Each player receives a secret forbidden word they must not say while trying to bait others into saying theirs.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5 PWA (Vanilla JS) |
| Game Server | [Colyseus](https://colyseus.io/) 0.15 on Node.js |
| HTTP API | Express 4 |
| Language | TypeScript 5 |
| Real-time | WebSocket (Colyseus transport) |

---

## รันในเครื่อง / Running Locally

### ข้อกำหนด / Prerequisites

- Node.js 18+
- npm 9+

### ติดตั้ง / Install

```bash
git clone <repo-url>
cd kam-tong-ham
npm install
```

### เริ่มเซิร์ฟเวอร์ / Start Server

```bash
# Development (hot reload)
npm run dev

# Production build
npm run build
npm start
```

เซิร์ฟเวอร์จะรันที่ / The server runs at:

- HTTP API: `http://localhost:2567/api`
- WebSocket: `ws://localhost:2567`
- Game client: `http://localhost:2567`

เปิด `http://localhost:2567` ในเบราว์เซอร์เพื่อเล่นเกม

Open `http://localhost:2567` in your browser to play.

### ตัวแปรสภาพแวดล้อม / Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `2567` | Server port |

---

## โครงสร้างโปรเจกต์ / Project Structure

```
kam-tong-ham/
├── client/               # PWA frontend (static files)
│   ├── index.html
│   ├── manifest.json
│   ├── sw.js             # Service worker
│   ├── css/style.css
│   └── js/
│       ├── app.js        # Main game client
│       └── sounds.js     # Sound effects
├── server/
│   └── src/
│       ├── index.ts      # Entry point, Express + Colyseus setup
│       ├── rooms/
│       │   └── KhamTongHamRoom.ts  # Core game room & state machine
│       ├── schemas/
│       │   └── GameState.ts        # Colyseus state schemas
│       ├── data/
│       │   └── wordpacks/          # JSON word category files
│       └── utils/
│           ├── roomCode.ts         # Room code generation
│           └── wordPicker.ts       # Word pack loading & selection
├── package.json
└── tsconfig.json
```

---

## REST API

| Endpoint | Method | Description |
|---|---|---|
| `/api/rooms/create` | POST | สร้างห้องใหม่ / Create new room |
| `/api/rooms/:roomCode` | GET | ตรวจสอบห้อง / Check room status |
| `/api/categories` | GET | รายการหมวดคำ / List word categories |
| `/api/health` | GET | Health check |

---

## Deploy

### Self-hosted (VPS/cloud server)

```bash
npm run build
PORT=3000 npm start
```

ให้แน่ใจว่า WebSocket port เปิดรับ traffic และ reverse proxy (nginx/caddy) ส่งต่อทั้ง HTTP และ WebSocket ไปยัง port เดียวกัน

Ensure your WebSocket port is open and your reverse proxy (nginx/caddy) forwards both HTTP and WebSocket upgrades to the same port.

**nginx example:**

```nginx
location / {
    proxy_pass http://localhost:2567;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```

### Railway / Render / Fly.io

1. เพิ่ม `PORT` environment variable ตามที่ platform กำหนด
2. Build command: `npm run build`
3. Start command: `npm start`

---

## License

MIT
