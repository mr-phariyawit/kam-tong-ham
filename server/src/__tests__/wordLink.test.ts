/**
 * Word Link (คำเชื่อม) -- Unit + Integration tests.
 *
 * Tests the full game flow: team assignment, grid generation,
 * clue giving, card guessing, win conditions, edge cases.
 *
 * Uses the same mock-client pattern as existing integration tests.
 */
import { describe, it, expect, beforeEach, afterAll, beforeAll } from "vitest";
import { matchMaker, LocalDriver, LocalPresence } from "@colyseus/core";
import { WordLinkRoom } from "../rooms/WordLinkRoom";
import {
  WordLinkState,
  WordLinkPlayer,
  WordCard,
} from "../schemas/WordLinkState";
import { makeMockClient, type MockClient } from "./integration/helpers";

// ─── Test Setup ──────────────────────────────────────────────

let setupDone = false;

async function setupWordLink() {
  if (!setupDone) {
    await matchMaker.setup(new LocalPresence(), new LocalDriver());
    matchMaker.defineRoomType("word_link", WordLinkRoom);
    setupDone = true;
  }
}

async function createWordLinkRoom(roomCode = "WLTS") {
  const listing = await matchMaker.createRoom("word_link", { roomCode, gameType: "word-link" });
  return matchMaker.getRoomById(listing.roomId) as any as WordLinkRoom;
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

function getState(room: any): WordLinkState {
  return (room as any).state as WordLinkState;
}

function getColorKey(room: any): Map<number, string> {
  return (room as any).colorKey as Map<number, string>;
}

function getPlayers(room: any): WordLinkPlayer[] {
  const players: WordLinkPlayer[] = [];
  getState(room).players.forEach((p) => players.push(p as WordLinkPlayer));
  return players;
}

function getSpymaster(room: any, team: string): { client: MockClient; player: WordLinkPlayer } | null {
  const players = getPlayers(room);
  const sm = players.find((p) => p.team === team && p.role === "spymaster");
  if (!sm) return null;
  const client = (room as any).clients.find((c: MockClient) => c.sessionId === sm.id);
  return { client, player: sm };
}

function getGuessers(room: any, team: string): Array<{ client: MockClient; player: WordLinkPlayer }> {
  const players = getPlayers(room);
  return players
    .filter((p) => p.team === team && p.role === "guesser")
    .map((p) => {
      const client = (room as any).clients.find((c: MockClient) => c.sessionId === p.id);
      return { client, player: p };
    });
}

/** Find the index of a card with a specific color (unrevealed). */
function findCardByColor(room: any, color: string): number {
  const colorKey = getColorKey(room);
  const state = getState(room);
  for (const [index, c] of colorKey.entries()) {
    if (c === color && !state.grid[index].revealed) {
      return index;
    }
  }
  return -1;
}

// ─── Helpers for setting up a game in progress ──────────────

async function setupGameWithPlayers(count = 4): Promise<{
  room: any;
  clients: MockClient[];
}> {
  const room = await createWordLinkRoom();
  const clients: MockClient[] = [];

  for (let i = 0; i < count; i++) {
    const c = makeMockClient(`player-${i}`);
    await joinRoom(room, c, { nickname: `P${i}`, avatar: "😀" });
    clients.push(c);
  }

  return { room, clients };
}

async function setupGameInProgress(count = 4): Promise<{
  room: any;
  clients: MockClient[];
}> {
  const { room, clients } = await setupGameWithPlayers(count);

  // Start game (first player is host)
  sendMessage(room, clients[0], "START_GAME");

  // Advance past TEAM_REVEAL phase
  advanceClock(room, 6000);

  return { room, clients };
}

// ─── Tests ──────────────────────────────────────────────────

beforeAll(async () => {
  await setupWordLink();
});

afterAll(async () => {
  await matchMaker.gracefullyShutdown();
  setupDone = false;
});

beforeEach(() => {
  // Clear room types cache if needed
});

describe("Word Link -- Schema", () => {
  it("WL-S01: WordLinkState extends BaseState", async () => {
    const { room } = await setupGameWithPlayers();
    const state = getState(room);

    expect(state.roomCode).toBeDefined();
    expect(state.phase).toBe("LOBBY");
    expect(state.gameType).toBe("word-link");
    expect(state.players).toBeDefined();
    expect(state.grid).toBeDefined();
    expect(state.currentTeam).toBe("red");

    await room.disconnect();
  });

  it("WL-S02: WordLinkPlayer has team and role fields", async () => {
    const { room, clients } = await setupGameWithPlayers();
    const player = getState(room).players.get(clients[0].sessionId) as WordLinkPlayer;

    expect(player.team).toBe(""); // Not assigned until game starts
    expect(player.role).toBe(""); // Not assigned until game starts
    expect(player.nickname).toBe("P0");

    await room.disconnect();
  });
});

describe("Word Link -- Team Assignment", () => {
  it("WL-T01: assigns all players to red or blue teams", async () => {
    const { room, clients } = await setupGameInProgress(6);
    const players = getPlayers(room);

    const teams = players.map((p) => p.team);
    expect(teams.every((t) => t === "red" || t === "blue")).toBe(true);

    await room.disconnect();
  });

  it("WL-T02: teams are roughly balanced (difference <= 1)", async () => {
    const { room } = await setupGameInProgress(6);
    const players = getPlayers(room);

    const redCount = players.filter((p) => p.team === "red").length;
    const blueCount = players.filter((p) => p.team === "blue").length;

    expect(Math.abs(redCount - blueCount)).toBeLessThanOrEqual(1);

    await room.disconnect();
  });

  it("WL-T03: each team has exactly one spymaster", async () => {
    const { room } = await setupGameInProgress(6);
    const players = getPlayers(room);

    const redSpymasters = players.filter((p) => p.team === "red" && p.role === "spymaster");
    const blueSpymasters = players.filter((p) => p.team === "blue" && p.role === "spymaster");

    expect(redSpymasters).toHaveLength(1);
    expect(blueSpymasters).toHaveLength(1);

    await room.disconnect();
  });

  it("WL-T04: non-spymaster players are guessers", async () => {
    const { room } = await setupGameInProgress(6);
    const players = getPlayers(room);

    const nonSpymasters = players.filter((p) => p.role !== "spymaster");
    expect(nonSpymasters.every((p) => p.role === "guesser")).toBe(true);

    await room.disconnect();
  });

  it("WL-T05: minimum 4 players required to start", async () => {
    const { room, clients } = await setupGameWithPlayers(3);
    const host = clients[0];
    host.sends = [];

    sendMessage(room, host, "START_GAME");

    const error = host.sends.find((s) => s.type === "ERROR");
    expect(error).toBeDefined();
    expect(error!.msg.code).toBe("NOT_ENOUGH_PLAYERS");

    await room.disconnect();
  });
});

describe("Word Link -- Grid Generation", () => {
  it("WL-G01: grid has exactly 25 cards", async () => {
    const { room } = await setupGameInProgress();
    const state = getState(room);

    expect(state.grid).toHaveLength(25);

    await room.disconnect();
  });

  it("WL-G02: all cards have unique words", async () => {
    const { room } = await setupGameInProgress();
    const state = getState(room);

    const words = state.grid.map((card) => card.word);
    const uniqueWords = new Set(words);
    expect(uniqueWords.size).toBe(25);

    await room.disconnect();
  });

  it("WL-G03: color distribution is 9 red, 8 blue, 7 neutral, 1 assassin", async () => {
    const { room } = await setupGameInProgress();
    const colorKey = getColorKey(room);

    let red = 0, blue = 0, neutral = 0, assassin = 0;
    colorKey.forEach((color) => {
      if (color === "red") red++;
      else if (color === "blue") blue++;
      else if (color === "neutral") neutral++;
      else if (color === "assassin") assassin++;
    });

    expect(red).toBe(9);
    expect(blue).toBe(8);
    expect(neutral).toBe(7);
    expect(assassin).toBe(1);

    await room.disconnect();
  });

  it("WL-G04: remaining counts initialized correctly", async () => {
    const { room } = await setupGameInProgress();
    const state = getState(room);

    expect(state.redRemaining).toBe(9);
    expect(state.blueRemaining).toBe(8);

    await room.disconnect();
  });

  it("WL-G05: cards start unrevealed", async () => {
    const { room } = await setupGameInProgress();
    const state = getState(room);

    expect(state.grid.every((card) => !card.revealed)).toBe(true);

    await room.disconnect();
  });

  it("WL-G06: spymasters receive COLOR_KEY message", async () => {
    const { room } = await setupGameInProgress();

    const redSM = getSpymaster(room, "red");
    expect(redSM).not.toBeNull();
    const colorKeyMsg = redSM!.client.sends.find((s) => s.type === "COLOR_KEY");
    expect(colorKeyMsg).toBeDefined();
    expect(colorKeyMsg!.msg.cards).toHaveLength(25);

    await room.disconnect();
  });
});

describe("Word Link -- Clue Giving", () => {
  it("WL-C01: spymaster can give a valid clue", async () => {
    const { room } = await setupGameInProgress();
    const state = getState(room);

    expect(state.phase).toBe("CLUE_GIVING");
    expect(state.currentTeam).toBe("red");

    const redSM = getSpymaster(room, "red");
    expect(redSM).not.toBeNull();

    sendMessage(room, redSM!.client, "GIVE_CLUE", { word: "สัตว์", number: 2 });

    expect(state.phase).toBe("GUESSING");
    expect(state.currentClue).not.toBeNull();
    expect(state.currentClue!.word).toBe("สัตว์");
    expect(state.currentClue!.number).toBe(2);
    expect(state.currentClue!.maxGuesses).toBe(3); // number + 1

    await room.disconnect();
  });

  it("WL-C02: non-spymaster cannot give clue", async () => {
    const { room } = await setupGameInProgress();

    const guessers = getGuessers(room, "red");
    if (guessers.length === 0) {
      await room.disconnect();
      return; // Skip if red team has only 1 player (the spymaster)
    }

    const guesser = guessers[0];
    guesser.client.sends = [];
    sendMessage(room, guesser.client, "GIVE_CLUE", { word: "test", number: 1 });

    const error = guesser.client.sends.find((s) => s.type === "ERROR");
    expect(error).toBeDefined();
    expect(error!.msg.code).toBe("NOT_SPYMASTER");

    await room.disconnect();
  });

  it("WL-C03: blue spymaster cannot give clue on red's turn", async () => {
    const { room } = await setupGameInProgress();
    const state = getState(room);

    expect(state.currentTeam).toBe("red");

    const blueSM = getSpymaster(room, "blue");
    expect(blueSM).not.toBeNull();
    blueSM!.client.sends = [];

    sendMessage(room, blueSM!.client, "GIVE_CLUE", { word: "test", number: 1 });

    const error = blueSM!.client.sends.find((s) => s.type === "ERROR");
    expect(error).toBeDefined();
    expect(error!.msg.code).toBe("NOT_SPYMASTER");

    await room.disconnect();
  });

  it("WL-C04: clue cannot be a word on the grid", async () => {
    const { room } = await setupGameInProgress();
    const state = getState(room);

    const gridWord = state.grid[0].word; // Pick a word from the grid
    const redSM = getSpymaster(room, "red");
    redSM!.client.sends = [];

    sendMessage(room, redSM!.client, "GIVE_CLUE", { word: gridWord, number: 1 });

    const error = redSM!.client.sends.find((s) => s.type === "ERROR");
    expect(error).toBeDefined();
    expect(error!.msg.code).toBe("CLUE_IS_GRID_WORD");

    await room.disconnect();
  });

  it("WL-C05: empty clue is rejected", async () => {
    const { room } = await setupGameInProgress();

    const redSM = getSpymaster(room, "red");
    redSM!.client.sends = [];

    sendMessage(room, redSM!.client, "GIVE_CLUE", { word: "", number: 1 });

    const error = redSM!.client.sends.find((s) => s.type === "ERROR");
    expect(error).toBeDefined();
    expect(error!.msg.code).toBe("INVALID_CLUE");

    await room.disconnect();
  });

  it("WL-C06: zero-number clue gives unlimited guesses", async () => {
    const { room } = await setupGameInProgress();

    const redSM = getSpymaster(room, "red");
    sendMessage(room, redSM!.client, "GIVE_CLUE", { word: "สัตว์", number: 0 });

    const state = getState(room);
    expect(state.currentClue!.maxGuesses).toBe(25);

    await room.disconnect();
  });
});

describe("Word Link -- Card Guessing", () => {
  it("WL-CG01: guesser can guess a card", async () => {
    const { room } = await setupGameInProgress();
    const state = getState(room);

    // Give a clue first
    const redSM = getSpymaster(room, "red");
    sendMessage(room, redSM!.client, "GIVE_CLUE", { word: "สัตว์", number: 2 });

    // Find a red card to guess correctly
    const redCardIndex = findCardByColor(room, "red");
    expect(redCardIndex).toBeGreaterThanOrEqual(0);

    const guessers = getGuessers(room, "red");
    if (guessers.length === 0) {
      await room.disconnect();
      return;
    }

    sendMessage(room, guessers[0].client, "GUESS_CARD", { index: redCardIndex });

    expect(state.grid[redCardIndex].revealed).toBe(true);
    expect(state.grid[redCardIndex].revealedColor).toBe("red");
    expect(state.redRemaining).toBe(8); // 9 - 1

    await room.disconnect();
  });

  it("WL-CG02: guessing neutral card ends turn", async () => {
    const { room } = await setupGameInProgress();
    const state = getState(room);

    const redSM = getSpymaster(room, "red");
    sendMessage(room, redSM!.client, "GIVE_CLUE", { word: "สัตว์", number: 2 });

    const neutralIndex = findCardByColor(room, "neutral");
    expect(neutralIndex).toBeGreaterThanOrEqual(0);

    const guessers = getGuessers(room, "red");
    if (guessers.length === 0) {
      await room.disconnect();
      return;
    }

    sendMessage(room, guessers[0].client, "GUESS_CARD", { index: neutralIndex });

    // Turn should switch to blue
    expect(state.currentTeam).toBe("blue");
    expect(state.phase).toBe("CLUE_GIVING");

    await room.disconnect();
  });

  it("WL-CG03: guessing opponent card ends turn", async () => {
    const { room } = await setupGameInProgress();
    const state = getState(room);

    const redSM = getSpymaster(room, "red");
    sendMessage(room, redSM!.client, "GIVE_CLUE", { word: "สัตว์", number: 2 });

    const blueIndex = findCardByColor(room, "blue");
    expect(blueIndex).toBeGreaterThanOrEqual(0);

    const guessers = getGuessers(room, "red");
    if (guessers.length === 0) {
      await room.disconnect();
      return;
    }

    sendMessage(room, guessers[0].client, "GUESS_CARD", { index: blueIndex });

    // Blue gets credit + turn switches
    expect(state.blueRemaining).toBe(7); // 8 - 1
    expect(state.currentTeam).toBe("blue");

    await room.disconnect();
  });

  it("WL-CG04: cannot guess already-revealed card", async () => {
    const { room } = await setupGameInProgress();

    const redSM = getSpymaster(room, "red");
    sendMessage(room, redSM!.client, "GIVE_CLUE", { word: "สัตว์", number: 3 });

    const redIndex = findCardByColor(room, "red");
    const guessers = getGuessers(room, "red");
    if (guessers.length === 0) {
      await room.disconnect();
      return;
    }

    sendMessage(room, guessers[0].client, "GUESS_CARD", { index: redIndex });

    // Try guessing same card again
    guessers[0].client.sends = [];
    sendMessage(room, guessers[0].client, "GUESS_CARD", { index: redIndex });

    const error = guessers[0].client.sends.find((s) => s.type === "ERROR");
    expect(error).toBeDefined();
    expect(error!.msg.code).toBe("ALREADY_REVEALED");

    await room.disconnect();
  });

  it("WL-CG05: guesses limited to number + 1", async () => {
    const { room } = await setupGameInProgress();
    const state = getState(room);

    const redSM = getSpymaster(room, "red");
    sendMessage(room, redSM!.client, "GIVE_CLUE", { word: "สัตว์", number: 1 });

    // maxGuesses = 1 + 1 = 2
    expect(state.currentClue!.maxGuesses).toBe(2);

    const guessers = getGuessers(room, "red");
    if (guessers.length === 0) {
      await room.disconnect();
      return;
    }

    // Guess 1: correct (red card)
    const red1 = findCardByColor(room, "red");
    sendMessage(room, guessers[0].client, "GUESS_CARD", { index: red1 });

    // Still red's turn if guess was correct
    if (state.currentTeam === "red" && state.phase === "GUESSING") {
      // Guess 2: correct (another red card)
      const red2 = findCardByColor(room, "red");
      sendMessage(room, guessers[0].client, "GUESS_CARD", { index: red2 });

      // After 2 guesses (maxGuesses), turn should switch
      expect(state.currentTeam).toBe("blue");
    }

    await room.disconnect();
  });

  it("WL-CG06: spymaster cannot guess cards", async () => {
    const { room } = await setupGameInProgress();

    const redSM = getSpymaster(room, "red");
    sendMessage(room, redSM!.client, "GIVE_CLUE", { word: "สัตว์", number: 2 });

    redSM!.client.sends = [];
    sendMessage(room, redSM!.client, "GUESS_CARD", { index: 0 });

    const error = redSM!.client.sends.find((s) => s.type === "ERROR");
    expect(error).toBeDefined();
    expect(error!.msg.code).toBe("NOT_YOUR_TURN");

    await room.disconnect();
  });

  it("WL-CG07: wrong team cannot guess", async () => {
    const { room } = await setupGameInProgress();

    const redSM = getSpymaster(room, "red");
    sendMessage(room, redSM!.client, "GIVE_CLUE", { word: "สัตว์", number: 2 });

    const blueGuessers = getGuessers(room, "blue");
    if (blueGuessers.length === 0) {
      await room.disconnect();
      return;
    }

    blueGuessers[0].client.sends = [];
    sendMessage(room, blueGuessers[0].client, "GUESS_CARD", { index: 0 });

    const error = blueGuessers[0].client.sends.find((s) => s.type === "ERROR");
    expect(error).toBeDefined();
    expect(error!.msg.code).toBe("NOT_YOUR_TURN");

    await room.disconnect();
  });
});

describe("Word Link -- End Turn", () => {
  it("WL-ET01: team can voluntarily end turn", async () => {
    const { room } = await setupGameInProgress();
    const state = getState(room);

    const redSM = getSpymaster(room, "red");
    sendMessage(room, redSM!.client, "GIVE_CLUE", { word: "สัตว์", number: 2 });
    expect(state.phase).toBe("GUESSING");

    // A red team member ends the turn
    const guessers = getGuessers(room, "red");
    if (guessers.length === 0) {
      // Even spymaster can end turn
      sendMessage(room, redSM!.client, "END_TURN");
    } else {
      sendMessage(room, guessers[0].client, "END_TURN");
    }

    expect(state.currentTeam).toBe("blue");
    expect(state.phase).toBe("CLUE_GIVING");

    await room.disconnect();
  });

  it("WL-ET02: wrong team cannot end turn", async () => {
    const { room } = await setupGameInProgress();

    const redSM = getSpymaster(room, "red");
    sendMessage(room, redSM!.client, "GIVE_CLUE", { word: "สัตว์", number: 2 });

    const blueGuessers = getGuessers(room, "blue");
    if (blueGuessers.length === 0) {
      await room.disconnect();
      return;
    }

    blueGuessers[0].client.sends = [];
    sendMessage(room, blueGuessers[0].client, "END_TURN");

    const error = blueGuessers[0].client.sends.find((s) => s.type === "ERROR");
    expect(error).toBeDefined();
    expect(error!.msg.code).toBe("NOT_YOUR_TURN");

    await room.disconnect();
  });
});

describe("Word Link -- Win Conditions", () => {
  it("WL-W01: assassin card = instant loss for guessing team", async () => {
    const { room } = await setupGameInProgress();
    const state = getState(room);

    const redSM = getSpymaster(room, "red");
    sendMessage(room, redSM!.client, "GIVE_CLUE", { word: "สัตว์", number: 1 });

    const assassinIndex = findCardByColor(room, "assassin");
    expect(assassinIndex).toBeGreaterThanOrEqual(0);

    const guessers = getGuessers(room, "red");
    if (guessers.length === 0) {
      await room.disconnect();
      return;
    }

    sendMessage(room, guessers[0].client, "GUESS_CARD", { index: assassinIndex });

    expect(state.phase).toBe("GAME_OVER");
    expect(state.winner).toBe("blue"); // Blue wins because red hit assassin
    expect(state.winReason).toBe("assassin");

    await room.disconnect();
  });

  it("WL-W02: all cards revealed = team wins", async () => {
    const { room } = await setupGameInProgress();
    const state = getState(room);
    const colorKey = getColorKey(room);

    // Find all red card indices
    const redIndices: number[] = [];
    colorKey.forEach((color, index) => {
      if (color === "red") redIndices.push(index);
    });
    expect(redIndices).toHaveLength(9);

    // We need to guess all 9 red cards on red's turn
    // Give a clue with 0 (unlimited guesses)
    const redSM = getSpymaster(room, "red");
    sendMessage(room, redSM!.client, "GIVE_CLUE", { word: "ทุกอย่าง", number: 0 });

    const guessers = getGuessers(room, "red");
    if (guessers.length === 0) {
      await room.disconnect();
      return;
    }

    // Guess all red cards
    for (const idx of redIndices) {
      if (state.phase === "GAME_OVER") break;
      sendMessage(room, guessers[0].client, "GUESS_CARD", { index: idx });
    }

    expect(state.phase).toBe("GAME_OVER");
    expect(state.winner).toBe("red");
    expect(state.winReason).toBe("all_words");

    await room.disconnect();
  });

  it("WL-W03: all cards revealed at game over", async () => {
    const { room } = await setupGameInProgress();
    const state = getState(room);

    // Trigger game over via assassin
    const redSM = getSpymaster(room, "red");
    sendMessage(room, redSM!.client, "GIVE_CLUE", { word: "สัตว์", number: 1 });

    const assassinIndex = findCardByColor(room, "assassin");
    const guessers = getGuessers(room, "red");
    if (guessers.length === 0) {
      await room.disconnect();
      return;
    }

    sendMessage(room, guessers[0].client, "GUESS_CARD", { index: assassinIndex });

    // All cards should be revealed
    expect(state.grid.every((card) => card.revealed)).toBe(true);
    expect(state.grid.every((card) => card.revealedColor !== "")).toBe(true);

    await room.disconnect();
  });
});

describe("Word Link -- Phase Flow", () => {
  it("WL-P01: game starts in TEAM_REVEAL phase", async () => {
    const { room, clients } = await setupGameWithPlayers();
    sendMessage(room, clients[0], "START_GAME");

    const state = getState(room);
    expect(state.phase).toBe("TEAM_REVEAL");

    await room.disconnect();
  });

  it("WL-P02: transitions to CLUE_GIVING after TEAM_REVEAL", async () => {
    const { room, clients } = await setupGameWithPlayers();
    sendMessage(room, clients[0], "START_GAME");

    advanceClock(room, 6000);

    const state = getState(room);
    expect(state.phase).toBe("CLUE_GIVING");

    await room.disconnect();
  });

  it("WL-P03: red team goes first", async () => {
    const { room } = await setupGameInProgress();
    const state = getState(room);

    expect(state.currentTeam).toBe("red");

    await room.disconnect();
  });

  it("WL-P04: full turn cycle: clue -> guess -> switch -> clue", async () => {
    const { room } = await setupGameInProgress();
    const state = getState(room);

    // Red's turn: give clue
    expect(state.phase).toBe("CLUE_GIVING");
    expect(state.currentTeam).toBe("red");

    const redSM = getSpymaster(room, "red");
    sendMessage(room, redSM!.client, "GIVE_CLUE", { word: "สัตว์", number: 1 });

    expect(state.phase).toBe("GUESSING");

    // Guess a neutral card to end turn
    const neutralIndex = findCardByColor(room, "neutral");
    const guessers = getGuessers(room, "red");
    if (guessers.length > 0) {
      sendMessage(room, guessers[0].client, "GUESS_CARD", { index: neutralIndex });
    }

    // Blue's turn
    expect(state.currentTeam).toBe("blue");
    expect(state.phase).toBe("CLUE_GIVING");

    // Blue gives clue
    const blueSM = getSpymaster(room, "blue");
    sendMessage(room, blueSM!.client, "GIVE_CLUE", { word: "อาหาร", number: 1 });

    expect(state.phase).toBe("GUESSING");
    expect(state.currentTeam).toBe("blue");

    await room.disconnect();
  });
});

describe("Word Link -- Config", () => {
  it("WL-CF01: host can set turn timer in lobby", async () => {
    const { room, clients } = await setupGameWithPlayers();
    const state = getState(room);

    sendMessage(room, clients[0], "UPDATE_CONFIG", { turnTimerSetting: 90 });
    expect(state.turnTimerSetting).toBe(90);

    await room.disconnect();
  });

  it("WL-CF02: non-host cannot update config", async () => {
    const { room, clients } = await setupGameWithPlayers();

    clients[1].sends = [];
    sendMessage(room, clients[1], "UPDATE_CONFIG", { turnTimerSetting: 90 });

    const error = clients[1].sends.find((s) => s.type === "ERROR");
    expect(error).toBeDefined();
    expect(error!.msg.code).toBe("NOT_HOST");

    await room.disconnect();
  });

  it("WL-CF03: invalid timer values rejected (uses original value)", async () => {
    const { room, clients } = await setupGameWithPlayers();
    const state = getState(room);

    sendMessage(room, clients[0], "UPDATE_CONFIG", { turnTimerSetting: 45 });
    expect(state.turnTimerSetting).toBe(0); // 45 is not in [0, 60, 90, 120]

    await room.disconnect();
  });
});

describe("Word Link -- Edge Cases", () => {
  it("WL-E01: cannot start game during active game", async () => {
    const { room, clients } = await setupGameInProgress();

    clients[0].sends = [];
    sendMessage(room, clients[0], "START_GAME");

    const error = clients[0].sends.find((s) => s.type === "ERROR");
    expect(error).toBeDefined();
    expect(error!.msg.code).toBe("INVALID_PHASE");

    await room.disconnect();
  });

  it("WL-E02: cannot give clue during guessing phase", async () => {
    const { room } = await setupGameInProgress();

    const redSM = getSpymaster(room, "red");
    sendMessage(room, redSM!.client, "GIVE_CLUE", { word: "สัตว์", number: 2 });

    // Now in GUESSING phase, try to give another clue
    redSM!.client.sends = [];
    sendMessage(room, redSM!.client, "GIVE_CLUE", { word: "อาหาร", number: 1 });

    const error = redSM!.client.sends.find((s) => s.type === "ERROR");
    expect(error).toBeDefined();
    expect(error!.msg.code).toBe("INVALID_PHASE");

    await room.disconnect();
  });

  it("WL-E03: cannot guess during clue-giving phase", async () => {
    const { room } = await setupGameInProgress();
    const state = getState(room);

    expect(state.phase).toBe("CLUE_GIVING");

    const guessers = getGuessers(room, "red");
    if (guessers.length === 0) {
      await room.disconnect();
      return;
    }

    guessers[0].client.sends = [];
    sendMessage(room, guessers[0].client, "GUESS_CARD", { index: 0 });

    const error = guessers[0].client.sends.find((s) => s.type === "ERROR");
    expect(error).toBeDefined();
    expect(error!.msg.code).toBe("INVALID_PHASE");

    await room.disconnect();
  });

  it("WL-E04: invalid card index rejected", async () => {
    const { room } = await setupGameInProgress();

    const redSM = getSpymaster(room, "red");
    sendMessage(room, redSM!.client, "GIVE_CLUE", { word: "สัตว์", number: 2 });

    const guessers = getGuessers(room, "red");
    if (guessers.length === 0) {
      await room.disconnect();
      return;
    }

    guessers[0].client.sends = [];
    sendMessage(room, guessers[0].client, "GUESS_CARD", { index: 99 });

    const error = guessers[0].client.sends.find((s) => s.type === "ERROR");
    expect(error).toBeDefined();
    expect(error!.msg.code).toBe("INVALID_CARD");

    await room.disconnect();
  });
});
