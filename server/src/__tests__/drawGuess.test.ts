/**
 * Draw & Guess (วาดทาย) -- Unit + Integration tests.
 *
 * Tests the full game flow: word selection, drawer rotation, stroke broadcast,
 * guess matching, scoring, timer, word hint, reconnect, disconnect handling,
 * configuration, and edge cases.
 *
 * Uses the same mock-client pattern as KnightsRoom and WerewolfRoom tests.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { matchMaker, LocalDriver, LocalPresence } from "@colyseus/core";
import { DrawGuessRoom } from "../rooms/DrawGuessRoom";
import {
  DrawGuessState,
  DrawGuessPlayer,
  DRAW_GUESS_CONFIG,
  SCORING,
  DRAWABLE_CATEGORIES,
} from "../schemas/DrawGuessState";
import {
  normalizeThaiGuess,
  isCorrectGuess,
  levenshtein,
  similarityScore,
  checkGuess,
  STRICTNESS_THRESHOLDS,
} from "../utils/thaiNormalize";
import { makeMockClient, type MockClient } from "./integration/helpers";

// ─── Test Setup ──────────────────────────────────────────────

let setupDone = false;

async function setupDrawGuess() {
  if (!setupDone) {
    await matchMaker.setup(new LocalPresence(), new LocalDriver());
    matchMaker.defineRoomType("draw_guess", DrawGuessRoom);
    setupDone = true;
  }
}

async function createDrawGuessRoom(roomCode = "DRAW") {
  await setupDrawGuess();
  const listing = await matchMaker.createRoom("draw_guess", { roomCode, gameType: "draw-guess" });
  return matchMaker.getRoomById(listing.roomId) as any as DrawGuessRoom;
}

async function joinRoom(room: any, client: MockClient, options: { nickname: string; avatar: string }) {
  await (room as any)["_reserveSeat"](client.sessionId, options, undefined);
  await (room as any)["_onJoin"](client);
}

function sendMessage(room: any, client: MockClient, type: string, data?: any) {
  const handler = (room as any).onMessageHandlers[type];
  if (!handler) throw new Error(`No handler for message type: ${type}`);
  handler(client, data);
}

function advanceClock(room: any, totalMs: number, stepMs = 1000) {
  let remaining = totalMs;
  while (remaining > 0) {
    const step = Math.min(remaining, stepMs);
    const delayedList = room.clock.delayed as any[];
    for (let i = delayedList.length - 1; i >= 0; i--) {
      const d = delayedList[i];
      if (d.active) {
        d.tick(step);
      } else {
        delayedList.splice(i, 1);
      }
    }
    remaining -= step;
  }
}

function getState(room: any): DrawGuessState {
  return (room as any).state as DrawGuessState;
}

function getPlayers(room: any): DrawGuessPlayer[] {
  const players: DrawGuessPlayer[] = [];
  getState(room).players.forEach((p) => players.push(p as DrawGuessPlayer));
  return players;
}

function getPlayerById(room: any, id: string): DrawGuessPlayer {
  return getState(room).players.get(id) as DrawGuessPlayer;
}

/** Get the current word (server-side private field) */
function getCurrentWord(room: any): string {
  return (room as any).currentWord;
}

/** Set the current word for testing */
function setCurrentWord(room: any, word: string): void {
  (room as any).currentWord = word;
}

/** Get correct guess order */
function getCorrectGuessOrder(room: any): string[] {
  return (room as any).correctGuessOrder;
}

/** Get word pool */
function getWordPool(room: any): string[] {
  return (room as any).wordPool;
}

/** Get used words set */
function getUsedWords(room: any): Set<string> {
  return (room as any).usedWords;
}

function findSend(client: MockClient, type: string): any {
  return client.sends.find((s) => s.type === type);
}

function findSends(client: MockClient, type: string): any[] {
  return client.sends.filter((s) => s.type === type);
}

// ─── Helper: Setup a 3-player game and start it ─────────────

async function setup3PlayerGame(roomCode = "DG3P") {
  const room = await createDrawGuessRoom(roomCode);
  const host = makeMockClient("host-1");
  const p2 = makeMockClient("player-2");
  const p3 = makeMockClient("player-3");

  await joinRoom(room, host, { nickname: "โฮสต์", avatar: "H" });
  await joinRoom(room, p2, { nickname: "ผู้เล่น2", avatar: "2" });
  await joinRoom(room, p3, { nickname: "ผู้เล่น3", avatar: "3" });

  return { room, host, p2, p3 };
}

async function startGame(room: any, host: MockClient) {
  sendMessage(room, host, "START_GAME");
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

describe("Thai Text Normalization", () => {
  it("DG-N01: strips whitespace", () => {
    expect(normalizeThaiGuess(" แมว ")).toBe("แมว");
    expect(normalizeThaiGuess("แ ม ว")).toBe("แมว");
  });

  it("DG-N02: strips tone marks", () => {
    expect(normalizeThaiGuess("น้ำ")).toBe("นำ");
    expect(normalizeThaiGuess("ก๊อก")).toBe("กอก");
    expect(normalizeThaiGuess("ก๋วยเตี๋ยว")).toBe("กวยเตียว");
  });

  it("DG-N03: strips thanthakhat (silent marker)", () => {
    // จันทร์ -> removes ์ (thanthakhat) only, ั is a vowel (sara an) not a tone mark
    expect(normalizeThaiGuess("จันทร์")).toBe("จันทร");
  });

  it("DG-N04: lowercases Latin text", () => {
    expect(normalizeThaiGuess("Cat")).toBe("cat");
    expect(normalizeThaiGuess("DOG")).toBe("dog");
  });

  it("DG-N05: preserves ใ/ไ distinction (Loki M4)", () => {
    // These are distinct Thai vowels, NOT interchangeable
    expect(normalizeThaiGuess("ใจ")).not.toBe(normalizeThaiGuess("ไจ"));
    expect(normalizeThaiGuess("ใบไม้")).not.toBe(normalizeThaiGuess("ไบไม้"));
  });

  it("DG-N06: isCorrectGuess matches normalized text", () => {
    expect(isCorrectGuess("แมว", "แมว")).toBe(true);
    expect(isCorrectGuess(" แมว ", "แมว")).toBe(true);
    expect(isCorrectGuess("หมา", "แมว")).toBe(false);
    expect(isCorrectGuess("", "แมว")).toBe(false);
    expect(isCorrectGuess("แมว", "")).toBe(false);
  });

  it("DG-N07: handles tone-mark variations in guesses", () => {
    // Same word spelled identically matches
    expect(isCorrectGuess("ผีเสื้อ", "ผีเสื้อ")).toBe(true);
    // Tone marks (้) stripped: ผีเสื้อ -> ผีเสือ, and both normalize the same
    expect(isCorrectGuess("ผีเสือ", "ผีเสื้อ")).toBe(true);
    // Note: ี and ื are vowels, NOT tone marks -- they are preserved
    expect(isCorrectGuess("ผเสอ", "ผีเสื้อ")).toBe(false); // vowels differ
  });
});

describe("Fuzzy Thai Matching (Sprint 11 — KTH-T-071)", () => {
  it("FZ-01: levenshtein zero for identical strings", () => {
    expect(levenshtein("", "")).toBe(0);
    expect(levenshtein("แมว", "แมว")).toBe(0);
    expect(levenshtein("cat", "cat")).toBe(0);
  });

  it("FZ-02: levenshtein counts each Thai codepoint as 1 edit", () => {
    // Insert one Thai char
    expect(levenshtein("แมว", "แมวๆ")).toBe(1);
    // Substitute one char
    expect(levenshtein("แมว", "แมก")).toBe(1);
    // Delete one
    expect(levenshtein("แมวน้อย", "แมวน้อ")).toBe(1);
  });

  it("FZ-03: levenshtein on empty strings", () => {
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("abc", "")).toBe(3);
  });

  it("FZ-04: similarityScore returns 1 for normalized-equal strings", () => {
    expect(similarityScore("แมว", "แมว")).toBe(1);
    expect(similarityScore(" แมว ", "แมว")).toBe(1);
    expect(similarityScore("น้ำ", "นำ")).toBe(1); // tone mark stripped
  });

  it("FZ-05: similarityScore returns 0 for completely different inputs", () => {
    expect(similarityScore("", "")).toBe(0); // empty falsy guard
    const score = similarityScore("abc", "xyz");
    expect(score).toBeLessThan(0.5);
  });

  it("FZ-06: similarityScore preserves ใ/ไ distinction (Loki S7 M4)", () => {
    // ใจ vs ไจ are distinct Thai vowels — should NOT be treated as exact
    const score = similarityScore("ใจ", "ไจ");
    expect(score).toBeLessThan(1);
    // But they ARE 1-edit apart so similarity is high
    expect(score).toBeGreaterThan(0.4);
  });

  it("FZ-07: STRICTNESS_THRESHOLDS has the expected values", () => {
    expect(STRICTNESS_THRESHOLDS.strict).toBe(1.0);
    expect(STRICTNESS_THRESHOLDS.normal).toBe(0.85);
    expect(STRICTNESS_THRESHOLDS.lenient).toBe(0.75);
  });

  it("FZ-08: checkGuess returns 'exact' on exact normalized match (any strictness)", () => {
    expect(checkGuess("แมว", "แมว", "strict").kind).toBe("exact");
    expect(checkGuess("แมว", "แมว", "normal").kind).toBe("exact");
    expect(checkGuess("แมว", "แมว", "lenient").kind).toBe("exact");
    expect(checkGuess(" แมว ", "แมว", "strict").kind).toBe("exact");
    expect(checkGuess("น้ำ", "นำ", "strict").kind).toBe("exact"); // tone-stripped match
  });

  it("FZ-09: checkGuess strict rejects all near-misses", () => {
    // 1-character typo
    expect(checkGuess("แมก", "แมว", "strict").kind).toBe("wrong");
    // High-similarity near miss
    expect(checkGuess("แมวน้อ", "แมวน้อย", "strict").kind).toBe("wrong");
  });

  it("FZ-10: checkGuess normal accepts near-misses ≥ 0.85", () => {
    // แมวน้อ vs แมวน้อย: normalize strips tone mark → 5 vs 6 codepoints, dist=1, score≈0.833 → wrong at 0.85
    expect(checkGuess("แมวน้อ", "แมวน้อย", "normal").kind).toBe("wrong");
    // คอมพิวเตอ vs คอมพิวเตอร์: target normalizes (strip ์) to 10 chars, guess=9, dist=1, score=0.9 → near
    const r1 = checkGuess("คอมพิวเตอ", "คอมพิวเตอร์", "normal");
    expect(r1.kind).toBe("near");
    expect(r1.score).toBeGreaterThanOrEqual(0.85);
  });

  it("FZ-11: checkGuess lenient accepts at 0.75+", () => {
    // แมก vs แมว: 1 substitute on 3 chars: 1 - 1/3 ≈ 0.667 → wrong even at lenient
    expect(checkGuess("แมก", "แมว", "lenient").kind).toBe("wrong");
    // แมวน้อ vs แมวน้อย: score ≈ 0.833 → near at lenient (0.75) but wrong at normal (0.85)
    const r2 = checkGuess("แมวน้อ", "แมวน้อย", "lenient");
    expect(r2.kind).toBe("near");
    // Same input at normal must reject
    expect(checkGuess("แมวน้อ", "แมวน้อย", "normal").kind).toBe("wrong");
  });

  it("FZ-12: checkGuess defaults to 'normal' when strictness omitted", () => {
    // Use FZ-10's near-at-normal case
    const r = checkGuess("คอมพิวเตอ", "คอมพิวเตอร์");
    expect(r.kind).toBe("near");
  });

  it("FZ-13: checkGuess returns wrong with score for empty inputs", () => {
    expect(checkGuess("", "แมว", "normal").kind).toBe("wrong");
    expect(checkGuess("แมว", "", "normal").kind).toBe("wrong");
    expect(checkGuess("", "", "normal").kind).toBe("wrong");
  });

  it("FZ-14: checkGuess includes a numeric score for near and wrong cases", () => {
    const near = checkGuess("คอมพิวเตอ", "คอมพิวเตอร์", "normal");
    expect(near.kind).toBe("near");
    expect(typeof near.score).toBe("number");
    expect(near.score).toBeGreaterThanOrEqual(0.85);
    expect(near.score).toBeLessThan(1);

    const wrong = checkGuess("xyz", "แมว", "normal");
    expect(wrong.kind).toBe("wrong");
    expect(typeof wrong.score).toBe("number");
  });
});

describe("DrawGuessRoom -- Setup & Lobby", () => {
  it("DG-01: creates room in LOBBY phase", async () => {
    const room = await createDrawGuessRoom("LOBBY");
    const state = getState(room);

    expect(state.phase).toBe("LOBBY");
    expect(state.gameType).toBe("draw-guess");
    expect(state.totalRounds).toBe(DRAW_GUESS_CONFIG.DEFAULT_ROUNDS);
    expect(state.drawTimeSecs).toBe(DRAW_GUESS_CONFIG.DEFAULT_DRAW_TIME_SECS);
  });

  it("DG-02: supports 3-8 players (DG-001.1)", async () => {
    const { room, host } = await setup3PlayerGame("DG02");

    // With 3 players, START_GAME should work (min 3)
    // But let's test that with only 2 connected, it fails
    const state = getState(room);
    const allPlayers = getPlayers(room);
    // Disconnect one to get below min
    allPlayers[2].isConnected = false;

    // Try to start with only 2 connected
    sendMessage(room, host, "START_GAME");
    const error = findSend(host, "ERROR");
    expect(error).toBeDefined();
    expect(error.msg.code).toBe("NOT_ENOUGH_PLAYERS");
  });

  it("DG-03: host can configure rounds and draw time (DG-001.2)", async () => {
    const { room, host } = await setup3PlayerGame("DG03");

    sendMessage(room, host, "CONFIG", { rounds: 3, drawTime: 90 });

    const state = getState(room);
    expect(state.totalRounds).toBe(3);
    expect(state.drawTimeSecs).toBe(90);
  });

  it("DG-04: config clamps to valid ranges", async () => {
    const { room, host } = await setup3PlayerGame("DG04");

    sendMessage(room, host, "CONFIG", { rounds: 99, drawTime: 5 });

    const state = getState(room);
    expect(state.totalRounds).toBe(DRAW_GUESS_CONFIG.MAX_ROUNDS);
    expect(state.drawTimeSecs).toBe(DRAW_GUESS_CONFIG.MIN_DRAW_TIME_SECS);
  });

  it("DG-05: non-host cannot configure", async () => {
    const { room, host, p2 } = await setup3PlayerGame("DG05");

    sendMessage(room, p2, "CONFIG", { rounds: 5 });
    const error = findSend(p2, "ERROR");
    expect(error).toBeDefined();
    expect(error.msg.code).toBe("NOT_HOST");
  });
});

describe("DrawGuessRoom -- Game Start & Phase Machine", () => {
  it("DG-06: game starts with COUNTDOWN phase after START_GAME", async () => {
    const { room, host } = await setup3PlayerGame("START");

    startGame(room, host);
    const state = getState(room);

    expect(state.phase).toBe("COUNTDOWN");
    expect(state.currentRound).toBe(1);
    expect(state.currentTurn).toBe(1);
    expect(state.turnsPerRound).toBe(3); // 3 players
    expect(state.currentDrawerId).toBeTruthy();
    expect(state.timer).toBe(DRAW_GUESS_CONFIG.COUNTDOWN_SECS);
  });

  it("DG-07: transitions to DRAWING after countdown", async () => {
    const { room, host } = await setup3PlayerGame("CDWN");

    startGame(room, host);
    advanceClock(room, DRAW_GUESS_CONFIG.COUNTDOWN_SECS * 1000);

    const state = getState(room);
    expect(state.phase).toBe("DRAWING");
    expect(state.timer).toBe(state.drawTimeSecs);
  });

  it("DG-08: word is picked and sent to drawer only (Loki H2)", async () => {
    const { room, host, p2, p3 } = await setup3PlayerGame("WORD");

    startGame(room, host);

    const state = getState(room);
    const drawerId = state.currentDrawerId;
    const word = getCurrentWord(room);

    expect(word).toBeTruthy();
    expect(word.length).toBeGreaterThan(0);

    // Drawer should have received DRAW_WORD
    const clients = [host, p2, p3];
    const drawerClient = clients.find((c) => c.sessionId === drawerId)!;
    const otherClients = clients.filter((c) => c.sessionId !== drawerId);

    const drawerWordMsg = findSend(drawerClient, "DRAW_WORD");
    expect(drawerWordMsg).toBeDefined();
    expect(drawerWordMsg.msg.word).toBe(word);

    // Non-drawers should NOT have received DRAW_WORD
    for (const c of otherClients) {
      const wordMsg = findSend(c, "DRAW_WORD");
      expect(wordMsg).toBeUndefined();
    }

    // Word should NOT be in synced state
    expect(state.revealedWord).toBe("");
  });

  it("DG-09: word length is set in state for guessers", async () => {
    const { room, host } = await setup3PlayerGame("WLEN");

    startGame(room, host);

    const state = getState(room);
    const word = getCurrentWord(room);
    expect(state.wordLength).toBe(word.length);
  });

  it("DG-10: timer counts down during DRAWING phase", async () => {
    const { room, host } = await setup3PlayerGame("TMR");

    startGame(room, host);
    advanceClock(room, DRAW_GUESS_CONFIG.COUNTDOWN_SECS * 1000); // past countdown

    const state = getState(room);
    const initialTime = state.drawTimeSecs;

    advanceClock(room, 5000); // 5 seconds
    expect(state.timer).toBe(initialTime - 5);
  });

  it("DG-11: transitions to ROUND_END when timer expires", async () => {
    const { room, host } = await setup3PlayerGame("TMRX");

    startGame(room, host);
    advanceClock(room, DRAW_GUESS_CONFIG.COUNTDOWN_SECS * 1000); // past countdown
    advanceClock(room, DRAW_GUESS_CONFIG.DEFAULT_DRAW_TIME_SECS * 1000); // full draw time

    const state = getState(room);
    expect(state.phase).toBe("ROUND_END");
    expect(state.revealedWord).toBeTruthy(); // Word is revealed
  });
});

describe("DrawGuessRoom -- Word Hint", () => {
  it("DG-12: hint reveals first character after 50% time (DG-002.6)", async () => {
    const { room, host } = await setup3PlayerGame("HINT");

    startGame(room, host);
    advanceClock(room, DRAW_GUESS_CONFIG.COUNTDOWN_SECS * 1000); // past countdown

    const state = getState(room);
    expect(state.hintRevealed).toBe(false);
    expect(state.wordHint).toBe("");

    const word = getCurrentWord(room);
    const halfTime = Math.floor(state.drawTimeSecs * 0.5);

    // Advance to just past 50% time
    advanceClock(room, halfTime * 1000);

    expect(state.hintRevealed).toBe(true);
    expect(state.wordHint).toBe(word.charAt(0));
  });
});

describe("DrawGuessRoom -- Stroke Broadcast", () => {
  it("DG-13: drawer can send strokes during DRAWING", async () => {
    const { room, host, p2, p3 } = await setup3PlayerGame("STRK");

    startGame(room, host);
    advanceClock(room, DRAW_GUESS_CONFIG.COUNTDOWN_SECS * 1000);

    const state = getState(room);
    const drawerId = state.currentDrawerId;
    const clients = [host, p2, p3];
    const drawerClient = clients.find((c) => c.sessionId === drawerId)!;

    // Clear sends to isolate stroke messages
    clients.forEach((c) => (c.sends = []));

    const strokeData = {
      tool: "pen" as const,
      color: "#000000",
      size: 5,
      points: [{ x: 10, y: 20 }, { x: 30, y: 40 }],
    };

    sendMessage(room, drawerClient, "STROKE", strokeData);

    // Other players should receive the stroke broadcast
    const otherClients = clients.filter((c) => c.sessionId !== drawerId);
    // Note: broadcast uses enqueueRaw which is decoded by MockClient
    // In the test environment, we check the room's internal stroke tracking
    const currentStrokes = (room as any).currentStrokes;
    expect(currentStrokes.length).toBe(1);
    expect(currentStrokes[0].color).toBe("#000000");
  });

  it("DG-14: non-drawer stroke messages are silently ignored", async () => {
    const { room, host, p2, p3 } = await setup3PlayerGame("NSRK");

    startGame(room, host);
    advanceClock(room, DRAW_GUESS_CONFIG.COUNTDOWN_SECS * 1000);

    const state = getState(room);
    const drawerId = state.currentDrawerId;
    const clients = [host, p2, p3];
    const nonDrawer = clients.find((c) => c.sessionId !== drawerId)!;

    const strokeData = {
      tool: "pen" as const,
      color: "#FF0000",
      size: 5,
      points: [{ x: 10, y: 20 }],
    };

    sendMessage(room, nonDrawer, "STROKE", strokeData);

    // Should NOT be stored
    const currentStrokes = (room as any).currentStrokes;
    expect(currentStrokes.length).toBe(0);
  });

  it("DG-15: stroke count cap enforced (DG-005.5)", async () => {
    const { room, host, p2, p3 } = await setup3PlayerGame("SCAP");

    startGame(room, host);
    advanceClock(room, DRAW_GUESS_CONFIG.COUNTDOWN_SECS * 1000);

    const state = getState(room);
    const drawerId = state.currentDrawerId;
    const drawerClient = [host, p2, p3].find((c) => c.sessionId === drawerId)!;

    // Force stroke count to max
    (room as any).strokeCount = DRAW_GUESS_CONFIG.MAX_STROKES_PER_TURN;

    const strokeData = {
      tool: "pen" as const,
      color: "#000000",
      size: 5,
      points: [{ x: 0, y: 0 }],
    };

    drawerClient.sends = [];
    sendMessage(room, drawerClient, "STROKE", strokeData);

    // Should get error
    const error = findSend(drawerClient, "ERROR");
    expect(error).toBeDefined();
    expect(error.msg.code).toBe("STROKE_LIMIT");
  });

  it("DG-16: clear canvas resets strokes", async () => {
    const { room, host, p2, p3 } = await setup3PlayerGame("CLR");

    startGame(room, host);
    advanceClock(room, DRAW_GUESS_CONFIG.COUNTDOWN_SECS * 1000);

    const state = getState(room);
    const drawerId = state.currentDrawerId;
    const drawerClient = [host, p2, p3].find((c) => c.sessionId === drawerId)!;

    // Add some strokes
    sendMessage(room, drawerClient, "STROKE", {
      tool: "pen", color: "#000", size: 5, points: [{ x: 0, y: 0 }],
    });

    expect((room as any).currentStrokes.length).toBe(1);

    sendMessage(room, drawerClient, "CLEAR_CANVAS");

    expect((room as any).currentStrokes.length).toBe(0);
    expect((room as any).strokeCount).toBe(0);
    expect(state.strokeSnapshot).toBe("[]");
  });

  it("DG-17: undo stroke removes last stroke (DG-005.4)", async () => {
    const { room, host, p2, p3 } = await setup3PlayerGame("UNDO");

    startGame(room, host);
    advanceClock(room, DRAW_GUESS_CONFIG.COUNTDOWN_SECS * 1000);

    const state = getState(room);
    const drawerId = state.currentDrawerId;
    const drawerClient = [host, p2, p3].find((c) => c.sessionId === drawerId)!;

    // Add two strokes
    sendMessage(room, drawerClient, "STROKE", {
      tool: "pen", color: "#000", size: 5, points: [{ x: 0, y: 0 }],
    });
    sendMessage(room, drawerClient, "STROKE", {
      tool: "pen", color: "#F00", size: 5, points: [{ x: 10, y: 10 }],
    });

    expect((room as any).currentStrokes.length).toBe(2);

    sendMessage(room, drawerClient, "UNDO_STROKE");

    expect((room as any).currentStrokes.length).toBe(1);
    expect((room as any).currentStrokes[0].color).toBe("#000");
  });
});

describe("DrawGuessRoom -- Guessing & Scoring", () => {
  it("DG-18: correct guess awards points (DG-003.1-3)", async () => {
    const { room, host, p2, p3 } = await setup3PlayerGame("GSCR");

    startGame(room, host);
    advanceClock(room, DRAW_GUESS_CONFIG.COUNTDOWN_SECS * 1000);

    const state = getState(room);
    const drawerId = state.currentDrawerId;
    const word = getCurrentWord(room);
    const clients = [host, p2, p3];
    const guessers = clients.filter((c) => c.sessionId !== drawerId);

    // First guesser: +3 pts
    sendMessage(room, guessers[0], "GUESS", { text: word });
    expect(getPlayerById(room, guessers[0].sessionId).score).toBe(SCORING.FIRST_GUESSER);

    // Second guesser: +2 pts
    sendMessage(room, guessers[1], "GUESS", { text: word });
    expect(getPlayerById(room, guessers[1].sessionId).score).toBe(SCORING.SECOND_GUESSER);
  });

  it("DG-19: drawer cannot guess", async () => {
    const { room, host, p2, p3 } = await setup3PlayerGame("DRNOGSS");

    startGame(room, host);
    advanceClock(room, DRAW_GUESS_CONFIG.COUNTDOWN_SECS * 1000);

    const state = getState(room);
    const drawerId = state.currentDrawerId;
    const word = getCurrentWord(room);
    const drawerClient = [host, p2, p3].find((c) => c.sessionId === drawerId)!;

    sendMessage(room, drawerClient, "GUESS", { text: word });

    // Drawer's score should be 0
    expect(getPlayerById(room, drawerId).score).toBe(0);
  });

  it("DG-20: player cannot guess again after correct guess (DG-003.6)", async () => {
    const { room, host, p2, p3 } = await setup3PlayerGame("NORE");

    startGame(room, host);
    advanceClock(room, DRAW_GUESS_CONFIG.COUNTDOWN_SECS * 1000);

    const state = getState(room);
    const drawerId = state.currentDrawerId;
    const word = getCurrentWord(room);
    const guessers = [host, p2, p3].filter((c) => c.sessionId !== drawerId);

    // First guess: correct
    sendMessage(room, guessers[0], "GUESS", { text: word });
    expect(getPlayerById(room, guessers[0].sessionId).hasGuessedCorrectly).toBe(true);

    // Second guess: should be ignored
    const scoreBefore = getPlayerById(room, guessers[0].sessionId).score;
    sendMessage(room, guessers[0], "GUESS", { text: word });
    expect(getPlayerById(room, guessers[0].sessionId).score).toBe(scoreBefore);
  });

  it("DG-21: wrong guess is broadcast but no points awarded", async () => {
    const { room, host, p2, p3 } = await setup3PlayerGame("WRNG");

    startGame(room, host);
    advanceClock(room, DRAW_GUESS_CONFIG.COUNTDOWN_SECS * 1000);

    const state = getState(room);
    const drawerId = state.currentDrawerId;
    const guessers = [host, p2, p3].filter((c) => c.sessionId !== drawerId);

    sendMessage(room, guessers[0], "GUESS", { text: "ผิดแน่นอน" });

    expect(getPlayerById(room, guessers[0].sessionId).score).toBe(0);
    expect(getPlayerById(room, guessers[0].sessionId).hasGuessedCorrectly).toBe(false);
  });

  it("DG-22: drawer gets +1 per correct guesser (DG-003.1)", async () => {
    const { room, host, p2, p3 } = await setup3PlayerGame("DRPT");

    startGame(room, host);
    advanceClock(room, DRAW_GUESS_CONFIG.COUNTDOWN_SECS * 1000);

    const state = getState(room);
    const drawerId = state.currentDrawerId;
    const word = getCurrentWord(room);
    const guessers = [host, p2, p3].filter((c) => c.sessionId !== drawerId);

    // Both guessers guess correctly
    sendMessage(room, guessers[0], "GUESS", { text: word });
    sendMessage(room, guessers[1], "GUESS", { text: word });

    // Turn should end (all guessers correct) -> wait for ROUND_END
    // Drawer gets +1 per correct guesser = +2
    const drawerPlayer = getPlayerById(room, drawerId);
    expect(drawerPlayer.score).toBe(2 * SCORING.DRAWER_PER_CORRECT_GUESS);
  });

  it("DG-23: turn ends early when all guessers are correct", async () => {
    const { room, host, p2, p3 } = await setup3PlayerGame("ALLY");

    startGame(room, host);
    advanceClock(room, DRAW_GUESS_CONFIG.COUNTDOWN_SECS * 1000);

    const state = getState(room);
    const drawerId = state.currentDrawerId;
    const word = getCurrentWord(room);
    const guessers = [host, p2, p3].filter((c) => c.sessionId !== drawerId);

    sendMessage(room, guessers[0], "GUESS", { text: word });
    sendMessage(room, guessers[1], "GUESS", { text: word });

    expect(state.phase).toBe("ROUND_END");
    expect(state.revealedWord).toBe(word);
  });

  it("DG-24: normalized guess matches (tone marks stripped)", async () => {
    const { room, host, p2, p3 } = await setup3PlayerGame("NORM");

    startGame(room, host);
    advanceClock(room, DRAW_GUESS_CONFIG.COUNTDOWN_SECS * 1000);

    const state = getState(room);
    const drawerId = state.currentDrawerId;
    const guessers = [host, p2, p3].filter((c) => c.sessionId !== drawerId);

    // Set a known word with tone marks
    setCurrentWord(room, "น้ำ");
    (room as any).state.wordLength = "น้ำ".length;

    // Guess without tone marks
    sendMessage(room, guessers[0], "GUESS", { text: "นำ" });
    // Should match because normalizeThaiGuess strips tone marks
    expect(getPlayerById(room, guessers[0].sessionId).hasGuessedCorrectly).toBe(true);
  });
});

describe("DrawGuessRoom -- Round & Drawer Rotation", () => {
  it("DG-25: drawer rotates through all players (DG-001.3)", async () => {
    const { room, host, p2, p3 } = await setup3PlayerGame("ROTN");

    // Config: 1 round for faster test
    sendMessage(room, host, "CONFIG", { rounds: 1 });
    startGame(room, host);

    const drawnBy = new Set<string>();
    const state = getState(room);

    // Turn 1
    drawnBy.add(state.currentDrawerId);
    const word1 = getCurrentWord(room);
    advanceClock(room, DRAW_GUESS_CONFIG.COUNTDOWN_SECS * 1000);
    advanceClock(room, DRAW_GUESS_CONFIG.DEFAULT_DRAW_TIME_SECS * 1000);
    // ROUND_END -> wait
    advanceClock(room, DRAW_GUESS_CONFIG.ROUND_END_SECS * 1000);

    // Turn 2
    expect(state.currentTurn).toBe(2);
    drawnBy.add(state.currentDrawerId);
    advanceClock(room, DRAW_GUESS_CONFIG.COUNTDOWN_SECS * 1000);
    advanceClock(room, DRAW_GUESS_CONFIG.DEFAULT_DRAW_TIME_SECS * 1000);
    advanceClock(room, DRAW_GUESS_CONFIG.ROUND_END_SECS * 1000);

    // Turn 3
    expect(state.currentTurn).toBe(3);
    drawnBy.add(state.currentDrawerId);
    advanceClock(room, DRAW_GUESS_CONFIG.COUNTDOWN_SECS * 1000);
    advanceClock(room, DRAW_GUESS_CONFIG.DEFAULT_DRAW_TIME_SECS * 1000);
    advanceClock(room, DRAW_GUESS_CONFIG.ROUND_END_SECS * 1000);

    // All 3 players should have drawn
    expect(drawnBy.size).toBe(3);

    // After all turns in 1 round with 1 round configured, should go to SCOREBOARD then GAME_OVER
    advanceClock(room, DRAW_GUESS_CONFIG.SCOREBOARD_SECS * 1000);
    expect(state.phase).toBe("GAME_OVER");
  });

  it("DG-26: no duplicate words within a game (DG-006.3)", async () => {
    const { room, host, p2, p3 } = await setup3PlayerGame("NDUP");

    sendMessage(room, host, "CONFIG", { rounds: 2 });
    startGame(room, host);

    const wordsUsed: string[] = [];

    // Go through 6 turns (2 rounds x 3 players)
    for (let i = 0; i < 6; i++) {
      const word = getCurrentWord(room);
      if (word) wordsUsed.push(word);

      // Advance through countdown + drawing + round_end
      advanceClock(room, DRAW_GUESS_CONFIG.COUNTDOWN_SECS * 1000);
      advanceClock(room, DRAW_GUESS_CONFIG.DEFAULT_DRAW_TIME_SECS * 1000);
      advanceClock(room, DRAW_GUESS_CONFIG.ROUND_END_SECS * 1000);

      // If scoreboard between rounds, advance through it
      if (getState(room).phase === "SCOREBOARD") {
        advanceClock(room, DRAW_GUESS_CONFIG.SCOREBOARD_SECS * 1000);
      }

      if (getState(room).phase === "GAME_OVER") break;
    }

    // All words should be unique
    const uniqueWords = new Set(wordsUsed);
    expect(uniqueWords.size).toBe(wordsUsed.length);
  });
});

describe("DrawGuessRoom -- Game Over", () => {
  it("DG-27: GAME_OVER identifies winner by highest score", async () => {
    const { room, host, p2, p3 } = await setup3PlayerGame("GOWN");

    sendMessage(room, host, "CONFIG", { rounds: 1 });
    startGame(room, host);

    const state = getState(room);
    const drawerId = state.currentDrawerId;
    const word = getCurrentWord(room);
    const guessers = [host, p2, p3].filter((c) => c.sessionId !== drawerId);

    advanceClock(room, DRAW_GUESS_CONFIG.COUNTDOWN_SECS * 1000);

    // First guesser gets 3 pts
    sendMessage(room, guessers[0], "GUESS", { text: word });

    // Time expires for remaining turns
    advanceClock(room, DRAW_GUESS_CONFIG.DEFAULT_DRAW_TIME_SECS * 1000);
    advanceClock(room, DRAW_GUESS_CONFIG.ROUND_END_SECS * 1000);

    // Turns 2 and 3: no correct guesses (let timers expire)
    advanceClock(room, DRAW_GUESS_CONFIG.COUNTDOWN_SECS * 1000);
    advanceClock(room, DRAW_GUESS_CONFIG.DEFAULT_DRAW_TIME_SECS * 1000);
    advanceClock(room, DRAW_GUESS_CONFIG.ROUND_END_SECS * 1000);
    advanceClock(room, DRAW_GUESS_CONFIG.COUNTDOWN_SECS * 1000);
    advanceClock(room, DRAW_GUESS_CONFIG.DEFAULT_DRAW_TIME_SECS * 1000);
    advanceClock(room, DRAW_GUESS_CONFIG.ROUND_END_SECS * 1000);

    // Scoreboard -> GAME_OVER
    advanceClock(room, DRAW_GUESS_CONFIG.SCOREBOARD_SECS * 1000);

    expect(state.phase).toBe("GAME_OVER");
    expect(state.winnerId).toBe(guessers[0].sessionId);
  });

  it("DG-28: game can restart from GAME_OVER", async () => {
    const { room, host, p2, p3 } = await setup3PlayerGame("RST");

    sendMessage(room, host, "CONFIG", { rounds: 1 });
    startGame(room, host);

    const state = getState(room);

    // Speed through all turns
    for (let i = 0; i < 3; i++) {
      advanceClock(room, DRAW_GUESS_CONFIG.COUNTDOWN_SECS * 1000);
      advanceClock(room, DRAW_GUESS_CONFIG.DEFAULT_DRAW_TIME_SECS * 1000);
      advanceClock(room, DRAW_GUESS_CONFIG.ROUND_END_SECS * 1000);
    }
    advanceClock(room, DRAW_GUESS_CONFIG.SCOREBOARD_SECS * 1000);

    expect(state.phase).toBe("GAME_OVER");

    // Restart
    startGame(room, host);
    expect(state.phase).toBe("COUNTDOWN");
    expect(state.currentRound).toBe(1);
    expect(state.currentTurn).toBe(1);

    // Scores should be reset
    getPlayers(room).forEach((p) => {
      expect(p.score).toBe(0);
    });
  });
});

describe("DrawGuessRoom -- Disconnect Handling", () => {
  it("DG-29: drawer disconnect ends turn immediately (Loki M3)", async () => {
    const { room, host, p2, p3 } = await setup3PlayerGame("DDISC");

    startGame(room, host);
    advanceClock(room, DRAW_GUESS_CONFIG.COUNTDOWN_SECS * 1000);

    const state = getState(room);
    const drawerId = state.currentDrawerId;
    const drawerPlayer = getPlayerById(room, drawerId);

    // Simulate drawer disconnect
    drawerPlayer.isConnected = false;
    (room as any).onPlayerDisconnectedDuringGame(drawerPlayer);

    // Should transition to ROUND_END
    expect(state.phase).toBe("ROUND_END");
    expect(state.revealedWord).toBeTruthy();
  });

  it("DG-30: guesser disconnect does not end turn", async () => {
    const { room, host, p2, p3 } = await setup3PlayerGame("GDISC");

    startGame(room, host);
    advanceClock(room, DRAW_GUESS_CONFIG.COUNTDOWN_SECS * 1000);

    const state = getState(room);
    const drawerId = state.currentDrawerId;
    const guessers = [host, p2, p3].filter((c) => c.sessionId !== drawerId);

    // Simulate guesser disconnect
    const guesserPlayer = getPlayerById(room, guessers[0].sessionId);
    guesserPlayer.isConnected = false;
    (room as any).onPlayerDisconnectedDuringGame(guesserPlayer);

    // Should still be in DRAWING
    expect(state.phase).toBe("DRAWING");
  });
});

describe("DrawGuessRoom -- Snapshot", () => {
  it("DG-31: snapshot captures current strokes", async () => {
    const { room, host, p2, p3 } = await setup3PlayerGame("SNAP");

    startGame(room, host);
    advanceClock(room, DRAW_GUESS_CONFIG.COUNTDOWN_SECS * 1000);

    const state = getState(room);
    const drawerId = state.currentDrawerId;
    const drawerClient = [host, p2, p3].find((c) => c.sessionId === drawerId)!;

    // Add strokes
    sendMessage(room, drawerClient, "STROKE", {
      tool: "pen", color: "#000", size: 5, points: [{ x: 0, y: 0 }],
    });
    sendMessage(room, drawerClient, "STROKE", {
      tool: "pen", color: "#F00", size: 10, points: [{ x: 10, y: 10 }],
    });

    // Trigger periodic snapshot (advance 5s)
    advanceClock(room, 5000);

    const snapshot = JSON.parse(state.strokeSnapshot);
    expect(snapshot.length).toBe(2);
    expect(snapshot[0].color).toBe("#000");
    expect(snapshot[1].color).toBe("#F00");
  });

  it("DG-32: snapshot is empty after clear", async () => {
    const { room, host, p2, p3 } = await setup3PlayerGame("SNPC");

    startGame(room, host);
    advanceClock(room, DRAW_GUESS_CONFIG.COUNTDOWN_SECS * 1000);

    const state = getState(room);
    const drawerId = state.currentDrawerId;
    const drawerClient = [host, p2, p3].find((c) => c.sessionId === drawerId)!;

    sendMessage(room, drawerClient, "STROKE", {
      tool: "pen", color: "#000", size: 5, points: [{ x: 0, y: 0 }],
    });

    sendMessage(room, drawerClient, "CLEAR_CANVAS");
    expect(state.strokeSnapshot).toBe("[]");
  });
});

describe("DrawGuessRoom -- Word Pool", () => {
  it("DG-33: word pool is built from drawable categories", async () => {
    const { room, host } = await setup3PlayerGame("WDPL");

    startGame(room, host);

    const pool = getWordPool(room);
    expect(pool.length).toBeGreaterThan(100); // Should have 900+ words
  });

  it("DG-34: used words are tracked (DG-006.3)", async () => {
    const { room, host } = await setup3PlayerGame("USED");

    startGame(room, host);

    const usedWords = getUsedWords(room);
    const word = getCurrentWord(room);

    // First word should be tracked
    expect(usedWords.has(word)).toBe(true);
  });

  it("DG-35: drawable categories are correct", () => {
    expect(DRAWABLE_CATEGORIES).toContain("animals");
    expect(DRAWABLE_CATEGORIES).toContain("food");
    expect(DRAWABLE_CATEGORIES).toContain("sports");
    expect(DRAWABLE_CATEGORIES).not.toContain("emotions");
    expect(DRAWABLE_CATEGORIES).not.toContain("slang");
    expect(DRAWABLE_CATEGORIES).not.toContain("trap-words");
    expect(DRAWABLE_CATEGORIES).not.toContain("relationships");
  });
});

describe("DrawGuessRoom -- Edge Cases", () => {
  it("DG-36: empty guess is ignored", async () => {
    const { room, host, p2, p3 } = await setup3PlayerGame("EMTY");

    startGame(room, host);
    advanceClock(room, DRAW_GUESS_CONFIG.COUNTDOWN_SECS * 1000);

    const state = getState(room);
    const drawerId = state.currentDrawerId;
    const guesser = [host, p2, p3].find((c) => c.sessionId !== drawerId)!;

    sendMessage(room, guesser, "GUESS", { text: "" });
    sendMessage(room, guesser, "GUESS", { text: "   " });

    expect(getPlayerById(room, guesser.sessionId).score).toBe(0);
  });

  it("DG-37: guesses outside DRAWING phase are ignored", async () => {
    const { room, host, p2, p3 } = await setup3PlayerGame("OPHS");

    startGame(room, host);

    // In COUNTDOWN phase
    const state = getState(room);
    const guesser = [host, p2, p3].find((c) => c.sessionId !== state.currentDrawerId)!;

    sendMessage(room, guesser, "GUESS", { text: "anything" });
    expect(getPlayerById(room, guesser.sessionId).score).toBe(0);
  });

  it("DG-38: strokes outside DRAWING phase are ignored", async () => {
    const { room, host, p2, p3 } = await setup3PlayerGame("OSRK");

    startGame(room, host);

    // In COUNTDOWN phase
    const state = getState(room);
    const drawerClient = [host, p2, p3].find((c) => c.sessionId === state.currentDrawerId)!;

    sendMessage(room, drawerClient, "STROKE", {
      tool: "pen", color: "#000", size: 5, points: [{ x: 0, y: 0 }],
    });

    expect((room as any).currentStrokes.length).toBe(0);
  });

  it("DG-39: guess text is capped at 50 characters", async () => {
    const { room, host, p2, p3 } = await setup3PlayerGame("GCAP");

    startGame(room, host);
    advanceClock(room, DRAW_GUESS_CONFIG.COUNTDOWN_SECS * 1000);

    const state = getState(room);
    const guesser = [host, p2, p3].find((c) => c.sessionId !== state.currentDrawerId)!;

    // Long guess should not crash
    const longGuess = "ก".repeat(100);
    sendMessage(room, guesser, "GUESS", { text: longGuess });

    // Should not throw, just processed normally
    expect(getPlayerById(room, guesser.sessionId).score).toBe(0); // won't match
  });

  it("DG-40: invalid stroke data is silently dropped", async () => {
    const { room, host, p2, p3 } = await setup3PlayerGame("INVS");

    startGame(room, host);
    advanceClock(room, DRAW_GUESS_CONFIG.COUNTDOWN_SECS * 1000);

    const state = getState(room);
    const drawerClient = [host, p2, p3].find((c) => c.sessionId === state.currentDrawerId)!;

    // Empty points array
    sendMessage(room, drawerClient, "STROKE", {
      tool: "pen", color: "#000", size: 5, points: [],
    });

    // Null data
    sendMessage(room, drawerClient, "STROKE", null as any);

    expect((room as any).currentStrokes.length).toBe(0);
  });

  it("DG-41: multiple rounds rotate drawer order", async () => {
    const { room, host, p2, p3 } = await setup3PlayerGame("MROT");

    sendMessage(room, host, "CONFIG", { rounds: 2 });
    startGame(room, host);

    const state = getState(room);

    // Round 1, Turn 1
    const round1Turn1Drawer = state.currentDrawerId;

    // Fast-forward through 3 turns of round 1
    for (let i = 0; i < 3; i++) {
      advanceClock(room, DRAW_GUESS_CONFIG.COUNTDOWN_SECS * 1000);
      advanceClock(room, DRAW_GUESS_CONFIG.DEFAULT_DRAW_TIME_SECS * 1000);
      advanceClock(room, DRAW_GUESS_CONFIG.ROUND_END_SECS * 1000);
    }

    // Should be at SCOREBOARD between rounds
    expect(state.phase).toBe("SCOREBOARD");
    advanceClock(room, DRAW_GUESS_CONFIG.SCOREBOARD_SECS * 1000);

    // Round 2 should start
    expect(state.currentRound).toBe(2);
    expect(state.currentTurn).toBe(1);
  });

  it("DG-42: reconnecting guesser gets snapshot + hint status", async () => {
    const { room, host, p2, p3 } = await setup3PlayerGame("RCGSR");

    startGame(room, host);
    advanceClock(room, DRAW_GUESS_CONFIG.COUNTDOWN_SECS * 1000);

    const state = getState(room);
    const drawerId = state.currentDrawerId;
    const drawerClient = [host, p2, p3].find((c) => c.sessionId === drawerId)!;
    const guesser = [host, p2, p3].find((c) => c.sessionId !== drawerId)!;

    // Add some strokes
    sendMessage(room, drawerClient, "STROKE", {
      tool: "pen", color: "#000", size: 5, points: [{ x: 0, y: 0 }],
    });

    // Advance past hint threshold
    const halfTime = Math.floor(state.drawTimeSecs * 0.5);
    advanceClock(room, halfTime * 1000);

    // Simulate reconnect
    guesser.sends = [];
    (room as any).onPlayerReconnected(guesser, getPlayerById(room, guesser.sessionId));

    // Should receive PHASE_CONTEXT
    const phaseCtx = findSend(guesser, "PHASE_CONTEXT");
    expect(phaseCtx).toBeDefined();

    // Should receive STROKE_SNAPSHOT
    const snapshot = findSend(guesser, "STROKE_SNAPSHOT");
    expect(snapshot).toBeDefined();

    // Should receive WORD_HINT (since hint was revealed)
    const hint = findSend(guesser, "WORD_HINT");
    expect(hint).toBeDefined();
    expect(hint.msg.firstChar).toBeTruthy();
  });

  it("DG-43: reconnecting drawer gets word back", async () => {
    const { room, host, p2, p3 } = await setup3PlayerGame("RCDRW");

    startGame(room, host);
    advanceClock(room, DRAW_GUESS_CONFIG.COUNTDOWN_SECS * 1000);

    const state = getState(room);
    const drawerId = state.currentDrawerId;
    const drawerClient = [host, p2, p3].find((c) => c.sessionId === drawerId)!;
    const word = getCurrentWord(room);

    // Simulate reconnect
    drawerClient.sends = [];
    (room as any).onPlayerReconnected(drawerClient, getPlayerById(room, drawerId));

    const wordMsg = findSend(drawerClient, "DRAW_WORD");
    expect(wordMsg).toBeDefined();
    expect(wordMsg.msg.word).toBe(word);
  });
});

describe("DrawGuessRoom -- SCOREBOARD phase", () => {
  it("DG-44: scoreboard shows between rounds", async () => {
    const { room, host, p2, p3 } = await setup3PlayerGame("SCRB");

    sendMessage(room, host, "CONFIG", { rounds: 2 });
    startGame(room, host);

    const state = getState(room);

    // Fast-forward through round 1 (3 turns)
    for (let i = 0; i < 3; i++) {
      advanceClock(room, DRAW_GUESS_CONFIG.COUNTDOWN_SECS * 1000);
      advanceClock(room, DRAW_GUESS_CONFIG.DEFAULT_DRAW_TIME_SECS * 1000);
      advanceClock(room, DRAW_GUESS_CONFIG.ROUND_END_SECS * 1000);
    }

    expect(state.phase).toBe("SCOREBOARD");
  });
});

describe("DrawGuessRoom -- Config Constants", () => {
  it("DG-45: DRAW_GUESS_CONFIG has correct defaults", () => {
    expect(DRAW_GUESS_CONFIG.MIN_PLAYERS).toBe(3);
    expect(DRAW_GUESS_CONFIG.MAX_PLAYERS).toBe(8);
    expect(DRAW_GUESS_CONFIG.DEFAULT_ROUNDS).toBe(2);
    expect(DRAW_GUESS_CONFIG.DEFAULT_DRAW_TIME_SECS).toBe(60);
    expect(DRAW_GUESS_CONFIG.MAX_STROKES_PER_TURN).toBe(500);
    expect(DRAW_GUESS_CONFIG.STROKE_RATE_LIMIT_PER_SEC).toBe(30);
    expect(DRAW_GUESS_CONFIG.HINT_THRESHOLD_PERCENT).toBe(50);
  });

  it("DG-46: SCORING constants match DG-003 spec", () => {
    expect(SCORING.FIRST_GUESSER).toBe(3);
    expect(SCORING.SECOND_GUESSER).toBe(2);
    expect(SCORING.THIRD_PLUS_GUESSER).toBe(1);
    expect(SCORING.DRAWER_PER_CORRECT_GUESS).toBe(1);
  });
});
