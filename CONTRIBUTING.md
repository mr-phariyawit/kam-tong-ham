# Contributing to คำต้องห้าม

ยินดีต้อนรับผู้ร่วมพัฒนา! / Welcome, contributors!

---

## การเพิ่มหมวดคำใหม่ / Adding a New Word Category

Word packs อยู่ที่ `server/src/data/wordpacks/` โดยแต่ละไฟล์ JSON หนึ่งไฟล์ = หนึ่งหมวด

Word packs live in `server/src/data/wordpacks/`. One JSON file = one category.

### รูปแบบไฟล์ / File Format

```json
{
  "id": "my-category",
  "category": "ชื่อหมวด (Thai display name)",
  "icon": "🎯",
  "difficulty": "easy",
  "words": [
    "คำที่ 1",
    "คำที่ 2",
    "คำที่ 3"
  ]
}
```

| Field | Description |
|---|---|
| `id` | Unique identifier (lowercase, kebab-case, matches filename without `.json`) |
| `category` | Display name shown in-game (Thai preferred, e.g. `"อาหาร"`) |
| `icon` | Single emoji shown next to the category name |
| `difficulty` | `"easy"` / `"medium"` / `"hard"` |
| `words` | Array of Thai words (คำไทย). **Minimum 25 words recommended.** |

### ขั้นตอน / Steps

1. สร้างไฟล์ใหม่ เช่น `server/src/data/wordpacks/vehicles.json`
2. เพิ่มคำอย่างน้อย 25 คำ (เผื่อหลายรอบในเกมเดียวกัน ไม่มีคำซ้ำ)
3. เพิ่ม id ใน `server/src/utils/wordPicker.ts` ที่รายการ `AVAILABLE_CATEGORIES` (ถ้ามี)
4. รันเซิร์ฟเวอร์แล้วตรวจสอบที่ `GET /api/categories` ว่าหมวดใหม่ปรากฏขึ้น

---
1. Create a new file, e.g. `server/src/data/wordpacks/vehicles.json`.
2. Add at least 25 words (avoids repetition across rounds in a single game).
3. Register the id in `server/src/utils/wordPicker.ts` under `AVAILABLE_CATEGORIES` (if a static list exists there).
4. Start the server and verify the new category appears at `GET /api/categories`.

### แนวทางการเลือกคำ / Word Selection Guidelines

- ใช้ **คำนาม** ที่รู้จักกันทั่วไป ไม่ยากเกินไป
- หลีกเลี่ยงคำที่มีความหมายซ้อน หรือคำสแลงที่ไม่เป็นที่รู้จักนอกกลุ่มอายุ 13–35
- หลีกเลี่ยงคำที่คล้ายกันมากในชุดเดียวกัน (เช่น "สุนัข" และ "หมา" ไม่ควรอยู่ชุดเดียวกัน)

---
- Prefer **common nouns** familiar to a broad age range (13–35).
- Avoid highly ambiguous words or niche slang.
- Avoid near-synonyms in the same pack (e.g. both "สุนัข" and "หมา" would be confusing).

---

## การปรับตรรกะเกม / Modifying Game Logic

Game logic ทั้งหมดอยู่ใน `server/src/rooms/KhamTongHamRoom.ts`

All game logic lives in `server/src/rooms/KhamTongHamRoom.ts`.

### Game Phases

```
LOBBY → COUNTDOWN → PLAYING → VOTING → ROUND_END → GUESS_PHASE → SCOREBOARD → GAME_OVER
```

Phase transitions ทั้งหมดผ่าน `this.state.phase = "PHASE_NAME"` และจะ sync ไปยัง client ทุกคนโดย Colyseus อัตโนมัติ

All phase transitions go through `this.state.phase = "PHASE_NAME"` and are automatically synced to all clients by Colyseus.

### การเปลี่ยน Timer Constants

ค่า timer อยู่ที่ด้านบนของ `KhamTongHamRoom.ts`:

Timer constants are at the top of `KhamTongHamRoom.ts`:

```typescript
const COUNTDOWN_SECS = 3;    // นับถอยหลังก่อนเริ่มรอบ / pre-round countdown
const VOTE_TIMER_SECS = 15;  // เวลาโหวต / voting window
const GUESS_TIMER_SECS = 10; // เวลาเดาคำ / guess window
```

### การเพิ่ม Message Handler ใหม่

1. ลงทะเบียน handler ใน `onCreate()`:

```typescript
this.onMessage("MY_ACTION", (client, data: { myField: string }) =>
  this.handleMyAction(client, data)
);
```

2. เพิ่ม method ใหม่:

```typescript
private handleMyAction(client: Client, data: { myField: string }) {
  const player = this.state.players.get(client.sessionId);
  if (!player) return;

  // ตรวจสอบ phase ก่อนเสมอ / always validate phase first
  if (this.state.phase !== "PLAYING") {
    this.sendError(client, "INVALID_PHASE", "ไม่สามารถทำได้ในขณะนี้");
    return;
  }

  // logic here
}
```

3. อัปเดต client ใน `client/js/app.js` ให้ส่งและรับ message นั้น

---
1. Register handler in `onCreate()`.
2. Add the private method.
3. Update `client/js/app.js` to send and receive the new message type.

### การแก้ไข State Schema

State types อยู่ใน `server/src/schemas/GameState.ts` — ใช้ Colyseus `@type` decorator:

State types live in `server/src/schemas/GameState.ts` using Colyseus `@type` decorators:

```typescript
export class Player extends Schema {
  @type("string") myNewField: string = "";
}
```

หลังเพิ่ม field ใหม่ ต้องอัปเดต client ด้วยเพื่อให้อ่านค่านั้นได้

After adding a new field, update the client to read it.

---

## TypeScript Build

```bash
# Type-check only (no emit)
npm run typecheck

# Full build
npm run build

# Development mode (hot reload)
npm run dev
```

---

## โครงสร้างไฟล์ที่ควรรู้จัก / Key Files

| File | หน้าที่ / Purpose |
|---|---|
| `server/src/rooms/KhamTongHamRoom.ts` | Game room, state machine, all message handlers |
| `server/src/schemas/GameState.ts` | Colyseus state schemas (Player, GameState, etc.) |
| `server/src/utils/wordPicker.ts` | Word pack loading and random word selection |
| `server/src/utils/roomCode.ts` | 4-character room code generation |
| `server/src/data/wordpacks/*.json` | Word category files |
| `client/js/app.js` | Frontend game client |
| `client/js/sounds.js` | Sound effect management |

---

## Pull Request Guidelines

- ทดสอบกับผู้เล่นจริงอย่างน้อย 2 คนก่อน PR
- อธิบาย word pack ใหม่หรือการเปลี่ยนแปลงกติกาใน PR description เสมอ
- รัน `npm run typecheck` ให้ผ่านก่อน push

---
- Test with at least 2 real players before opening a PR.
- Describe new word packs or rule changes in the PR description.
- Run `npm run typecheck` before pushing.

---

## QA Gate Rules (AEG-67)

These rules exist because a critical regression (cannot create rooms) reached production undetected due to missing API-layer test coverage.

### Rule 1 — REST API changes require API tests

Any PR that modifies `server/src/app.ts` or adds/changes HTTP endpoints **must** include or update tests in `server/src/__tests__/api.test.ts`. The test must exercise the endpoint with `supertest` and assert the response shape.

### Rule 2 — Client create/join flow changes require regression tests

Any PR that modifies the `createRoom()` or `joinRoom()` functions in `client/js/app.js` must include a note in the PR description confirming the flow was manually verified end-to-end (REST call + Colyseus join).

### Rule 3 — Regressions require test-first fixes

If a bug is filed against the room creation or join flow, the fix PR must include a failing test that reproduces the bug, then the fix that makes it pass. Commit the test in the same PR as the fix.

### Rule 4 — CI must pass before merge

The CI pipeline runs `typecheck → build → test`. All three must pass. Do not merge PRs with a failing CI run.
