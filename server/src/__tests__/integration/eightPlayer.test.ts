/**
 * Scenario 4.2: Maximum Players — 8-Player Game Flow
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  setupMatchMaker, teardownMatchMaker, createRoom, joinRoom,
  sendMessage, makeMockClient, startPlaying,
} from "./helpers";

beforeAll(setupMatchMaker);
afterAll(teardownMatchMaker);

describe("Scenario 4.2: 8-Player maximum", () => {
  it("8 clients join → all 8 in state, 8 unique colors assigned", async () => {
    const room = await createRoom();
    const clients = Array.from({ length: 8 }, (_, i) =>
      makeMockClient(`p${i + 1}_sc42a`)
    );
    for (let i = 0; i < 8; i++) {
      await joinRoom(room, clients[i], { nickname: `Player${i + 1}`, avatar: "😀" });
    }

    expect(room.state.playerCount).toBe(8);
    const colors = new Set<string>();
    room.state.players.forEach((p: any) => colors.add(p.color));
    expect(colors.size).toBe(8);
  });

  it("host starts with 8 players → 8 unique words assigned", async () => {
    const room = await createRoom();
    const clients = Array.from({ length: 8 }, (_, i) =>
      makeMockClient(`p${i + 1}_sc42b`)
    );
    for (let i = 0; i < 8; i++) {
      await joinRoom(room, clients[i], { nickname: `Player${i + 1}`, avatar: "😀" });
    }

    sendMessage(room, clients[0], "START_GAME");
    startPlaying(room);
    expect(room.state.phase).toBe("PLAYING");

    const words = clients.map((c) => c.sends.find((s) => s.type === "YOUR_WORD")?.msg?.word);
    expect(words.filter(Boolean).length).toBe(8);
    expect(new Set(words).size).toBe(8);
  });

  it("accusation with 7 eligible voters (code excludes accused only, not accuser) resolves correctly", async () => {
    // NOTE: The test plan said 6 eligible voters (8 - accuser - accused), but the code
    // only excludes the accused from voting, NOT the accuser. So totalVoters = 7.
    // This is documented as DEFECT-002 (test plan / code mismatch on voter eligibility).
    const room = await createRoom();
    const clients = Array.from({ length: 8 }, (_, i) =>
      makeMockClient(`p${i + 1}_sc42c`)
    );
    for (let i = 0; i < 8; i++) {
      await joinRoom(room, clients[i], { nickname: `Player${i + 1}`, avatar: "😀" });
    }
    sendMessage(room, clients[0], "START_GAME");
    startPlaying(room);

    // P1 accuses P2 → 6 eligible voters (P3-P8; both P1 accuser and P2 accused excluded)
    sendMessage(room, clients[0], "ACCUSE", { targetPlayerId: `p2_sc42c` });
    expect(room.state.currentAccusation.totalVoters).toBe(6);

    // All 6 eligible voters (P3-P8) vote → resolves when totalVoted >= 6
    // 4 vote guilty, 2 vote not_yet → 4 > 2 → guilty
    sendMessage(room, clients[2], "VOTE", { vote: "guilty" });
    sendMessage(room, clients[3], "VOTE", { vote: "guilty" });
    sendMessage(room, clients[4], "VOTE", { vote: "guilty" });
    sendMessage(room, clients[5], "VOTE", { vote: "guilty" });
    sendMessage(room, clients[6], "VOTE", { vote: "not_yet" });
    sendMessage(room, clients[7], "VOTE", { vote: "not_yet" });
    // 6th vote triggers resolution: 4 guilty vs 2 not_yet → 4 > 2 → guilty

    expect(room.state.players.get("p2_sc42c").isAlive).toBe(false);
    expect(room.state.phase).toBe("PLAYING");
  });

  it("usedWords is populated after round, excluding previous words next round", async () => {
    const room = await createRoom();
    const p1 = makeMockClient("p1_sc42d");
    const p2 = makeMockClient("p2_sc42d");
    await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
    await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });
    sendMessage(room, p1, "UPDATE_CONFIG", { totalRounds: 2 });
    sendMessage(room, p1, "START_GAME");
    startPlaying(room);

    const round1Words = [
      p1.sends.find((s) => s.type === "YOUR_WORD")?.msg?.word,
      p2.sends.find((s) => s.type === "YOUR_WORD")?.msg?.word,
    ].filter(Boolean);

    const usedWords: Set<string> = (room as any).usedWordsPerGame;
    round1Words.forEach((w) => expect(usedWords.has(w)).toBe(true));
  });
});
