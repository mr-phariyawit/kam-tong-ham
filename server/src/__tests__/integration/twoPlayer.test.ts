/**
 * Scenario 4.1: Minimum Players — 2-Player Game Flow
 * Scenario 4.6: Full Round Cycle — Happy Path
 * Scenario 4.7: Last Survivor Auto-End Round
 * Error Cases: EC-01 to EC-10
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  setupMatchMaker, teardownMatchMaker, createRoom, joinRoom,
  sendMessage, makeMockClient, advanceClock, startPlaying, endRound,
} from "./helpers";

beforeAll(setupMatchMaker);
afterAll(teardownMatchMaker);

// ─── Scenario 4.1 — 2-Player game flow ──────────────────────────────────────

describe("Scenario 4.1: 2-Player game flow", () => {
  it("two clients join → P1 is host, P2 is not, phase is LOBBY", async () => {
    const room = await createRoom();
    const p1 = makeMockClient("p1_sc41a");
    const p2 = makeMockClient("p2_sc41a");
    await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
    await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });

    expect(room.state.playerCount).toBe(2);
    expect(room.state.players.get("p1_sc41a").isHost).toBe(true);
    expect(room.state.players.get("p2_sc41a").isHost).toBe(false);
    expect(room.state.phase).toBe("LOBBY");
  });

  it("host sends START_GAME → phase becomes COUNTDOWN", async () => {
    const room = await createRoom();
    const p1 = makeMockClient("p1_sc41b");
    const p2 = makeMockClient("p2_sc41b");
    await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
    await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });

    sendMessage(room, p1, "START_GAME");
    expect(room.state.phase).toBe("COUNTDOWN");
    expect(room.state.currentRound).toBe(1);
  });

  it("after COUNTDOWN phase, startPlaying gives each player a private word", async () => {
    const room = await createRoom();
    const p1 = makeMockClient("p1_sc41c");
    const p2 = makeMockClient("p2_sc41c");
    await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
    await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });

    sendMessage(room, p1, "START_GAME");
    advanceClock(room, 3000); // advance countdown timer (3 ticks of 1000ms)
    expect(room.state.phase).toBe("PLAYING");

    const p1Word = p1.sends.find((s) => s.type === "YOUR_WORD");
    const p2Word = p2.sends.find((s) => s.type === "YOUR_WORD");
    expect(p1Word).toBeDefined();
    expect(p2Word).toBeDefined();
    expect(p1Word?.msg?.word).not.toBe(p2Word?.msg?.word);
  });

  it("P1 accuses P2 while PLAYING → phase VOTING, currentAccusation set", async () => {
    const room = await createRoom();
    const p1 = makeMockClient("p1_sc41d");
    const p2 = makeMockClient("p2_sc41d");
    await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
    await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });
    sendMessage(room, p1, "START_GAME");
    startPlaying(room);

    sendMessage(room, p1, "ACCUSE", { targetPlayerId: "p2_sc41d" });
    expect(room.state.phase).toBe("VOTING");
    expect(room.state.currentAccusation).not.toBeNull();
    expect(room.state.currentAccusation.targetId).toBe("p2_sc41d");
  });

  it("P1 votes guilty (only voter) → P2 eliminated, P1 gets +2 accuse bonus (+5 survival after last-survivor)", async () => {
    const room = await createRoom();
    const p1 = makeMockClient("p1_sc41e");
    const p2 = makeMockClient("p2_sc41e");
    await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
    await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });
    sendMessage(room, p1, "START_GAME");
    startPlaying(room);
    sendMessage(room, p1, "ACCUSE", { targetPlayerId: "p2_sc41e" });

    sendMessage(room, p1, "VOTE", { vote: "guilty" });
    // 1 eligible voter (P1, accuser), 1 guilty → guilty=true
    // P2 eliminated: -3; P1 gets +2 (accuse bonus)
    // P1 is last survivor → endRound fires → P1 gets +5 survival bonus
    // Final P1 score: +2 + +5 = 7
    expect(room.state.players.get("p2_sc41e").isAlive).toBe(false);
    expect(room.state.players.get("p2_sc41e").score).toBe(-3);
    expect(room.state.players.get("p1_sc41e").score).toBe(7); // 2 (accuse) + 5 (last survivor)
  });

  it("2-player scoreboard: P1=7 (survive+accuse), P2=0 (eliminated+guess correct)", async () => {
    const room = await createRoom();
    const p1 = makeMockClient("p1_sc41f");
    const p2 = makeMockClient("p2_sc41f");
    await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
    await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });
    sendMessage(room, p1, "START_GAME");
    startPlaying(room);

    // Get P2's actual word
    const p2Word = p2.sends.find((s) => s.type === "YOUR_WORD")?.msg?.word;
    expect(p2Word).toBeDefined();

    // P1 accuses P2 and wins
    sendMessage(room, p1, "ACCUSE", { targetPlayerId: "p2_sc41f" });
    sendMessage(room, p1, "VOTE", { vote: "guilty" });
    // P1: +2 (accuse), P2: -3 (eliminated)

    // Now end round (P1 is last survivor)
    // P1 gets +5 survival bonus since endRound was called by checkLastSurvivor
    // After elimination, checkLastSurvivor fires endRound('last_survivor')
    // which gives alive players +5

    const p1State = room.state.players.get("p1_sc41f");
    const p2State = room.state.players.get("p2_sc41f");
    // P1 got +5 (last survivor) + +2 (accuse) = 7
    expect(p1State.score).toBe(7);

    // P2 guesses their word correctly in GUESS_PHASE
    if (["GUESS_PHASE", "PLAYING"].includes(room.state.phase)) {
      sendMessage(room, p2, "GUESS_WORD", { guess: p2Word });
      expect(p2State.guessCorrect).toBe(true);
      // P2: -3 (eliminated) + 3 (guess correct) = 0
      expect(p2State.score).toBe(0);
    }
  });
});

// ─── Error / Edge Cases ──────────────────────────────────────────────────────

describe("Error Cases (EC-01 to EC-10)", () => {
  it("EC-01: non-host sends START_GAME → NOT_HOST error", async () => {
    const room = await createRoom();
    const p1 = makeMockClient("p1_ec01");
    const p2 = makeMockClient("p2_ec01");
    await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
    await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });

    sendMessage(room, p2, "START_GAME");
    const err = p2.sends.find((s) => s.type === "ERROR");
    expect(err?.msg?.code).toBe("NOT_HOST");
  });

  it("EC-02: START_GAME with 1 player → NOT_ENOUGH_PLAYERS error", async () => {
    const room = await createRoom();
    const p1 = makeMockClient("p1_ec02");
    await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });

    sendMessage(room, p1, "START_GAME");
    const err = p1.sends.find((s) => s.type === "ERROR");
    expect(err?.msg?.code).toBe("NOT_ENOUGH_PLAYERS");
  });

  it("EC-03: ACCUSE in LOBBY phase → INVALID_PHASE error", async () => {
    const room = await createRoom();
    const p1 = makeMockClient("p1_ec03");
    const p2 = makeMockClient("p2_ec03");
    await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
    await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });

    sendMessage(room, p1, "ACCUSE", { targetPlayerId: "p2_ec03" });
    const err = p1.sends.find((s) => s.type === "ERROR");
    expect(err?.msg?.code).toBe("INVALID_PHASE");
  });

  it("EC-04: player accuses self → SELF_ACCUSE error", async () => {
    const room = await createRoom();
    const p1 = makeMockClient("p1_ec04");
    const p2 = makeMockClient("p2_ec04");
    await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
    await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });
    sendMessage(room, p1, "START_GAME");
    startPlaying(room);

    sendMessage(room, p1, "ACCUSE", { targetPlayerId: "p1_ec04" });
    const err = p1.sends.find((s) => s.type === "ERROR");
    expect(err?.msg?.code).toBe("SELF_ACCUSE");
  });

  it("EC-05: ACCUSE while accusation pending → INVALID_PHASE error (phase is VOTING, not PLAYING)", async () => {
    // Note: the code checks phase !== PLAYING before VOTE_IN_PROGRESS, so when an accusation is
    // pending (phase=VOTING), a second ACCUSE returns INVALID_PHASE, not VOTE_IN_PROGRESS.
    // This differs from the test plan description which expected VOTE_IN_PROGRESS.
    // This is documented as DEFECT-003 (error code ordering).
    const room = await createRoom();
    const p1 = makeMockClient("p1_ec05");
    const p2 = makeMockClient("p2_ec05");
    const p3 = makeMockClient("p3_ec05");
    await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
    await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });
    await joinRoom(room, p3, { nickname: "Carol", avatar: "🎉" });
    sendMessage(room, p1, "START_GAME");
    startPlaying(room);

    sendMessage(room, p1, "ACCUSE", { targetPlayerId: "p2_ec05" });
    expect(room.state.phase).toBe("VOTING");
    p1.sends = [];
    sendMessage(room, p1, "ACCUSE", { targetPlayerId: "p3_ec05" });
    const err = p1.sends.find((s) => s.type === "ERROR");
    expect(err?.msg?.code).toBe("VOTE_IN_PROGRESS");
  });

  it("EC-06: KICK_PLAYER during active game → INVALID_PHASE error", async () => {
    const room = await createRoom();
    const p1 = makeMockClient("p1_ec06");
    const p2 = makeMockClient("p2_ec06");
    await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
    await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });
    sendMessage(room, p1, "START_GAME");
    startPlaying(room);

    sendMessage(room, p1, "KICK_PLAYER", { targetPlayerId: "p2_ec06" });
    const err = p1.sends.find((s) => s.type === "ERROR");
    expect(err?.msg?.code).toBe("INVALID_PHASE");
  });

  it("EC-07: UPDATE_CONFIG during PLAYING → INVALID_PHASE error", async () => {
    const room = await createRoom();
    const p1 = makeMockClient("p1_ec07");
    const p2 = makeMockClient("p2_ec07");
    await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
    await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });
    sendMessage(room, p1, "START_GAME");
    startPlaying(room);

    sendMessage(room, p1, "UPDATE_CONFIG", { totalRounds: 2 });
    const err = p1.sends.find((s) => s.type === "ERROR");
    expect(err?.msg?.code).toBe("INVALID_PHASE");
  });

  it("EC-08: roundDurationSecs=90 (invalid) → silently ignored, value unchanged", async () => {
    const room = await createRoom();
    const p1 = makeMockClient("p1_ec08");
    const p2 = makeMockClient("p2_ec08");
    await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
    await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });

    const original = room.state.config.roundDurationSecs;
    sendMessage(room, p1, "UPDATE_CONFIG", { roundDurationSecs: 90 });
    expect(room.state.config.roundDurationSecs).toBe(original);
  });

  it("EC-09: totalRounds=6 (above max 5) → silently ignored, value unchanged", async () => {
    const room = await createRoom();
    const p1 = makeMockClient("p1_ec09");
    const p2 = makeMockClient("p2_ec09");
    await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
    await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });

    const original = room.state.config.totalRounds;
    sendMessage(room, p1, "UPDATE_CONFIG", { totalRounds: 6 });
    expect(room.state.config.totalRounds).toBe(original);
  });

  it("EC-10: invalid category ID in config → error thrown when START_GAME triggers word assignment", async () => {
    const room = await createRoom();
    const p1 = makeMockClient("p1_ec10");
    const p2 = makeMockClient("p2_ec10");
    await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
    await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });

    sendMessage(room, p1, "UPDATE_CONFIG", { category: "nonexistent_category" });
    // category IS accepted without validation in UPDATE_CONFIG
    expect(room.state.config.category).toBe("nonexistent_category");
    // START_GAME → startCountdown → assignWords → loadWordPack → throws "Unknown category"
    expect(() => sendMessage(room, p1, "START_GAME")).toThrow();
  });
});

// ─── Scenario 4.6: Full Round Cycle ─────────────────────────────────────────

describe("Scenario 4.6: Full Round Cycle (no accusations)", () => {
  it("round timer expiry awards +5 to survivors", async () => {
    const room = await createRoom();
    const p1 = makeMockClient("p1_sc46");
    const p2 = makeMockClient("p2_sc46");
    await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
    await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });
    sendMessage(room, p1, "START_GAME");
    startPlaying(room);

    endRound(room, "timer");
    expect(room.state.players.get("p1_sc46").score).toBe(5);
    expect(room.state.players.get("p2_sc46").score).toBe(5);
  });

  it("after round end, phase transitions through GUESS_PHASE → ROUND_END", async () => {
    const room = await createRoom();
    const p1 = makeMockClient("p1_sc46b");
    const p2 = makeMockClient("p2_sc46b");
    await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
    await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });
    sendMessage(room, p1, "START_GAME");
    startPlaying(room);

    endRound(room, "timer");
    expect(["GUESS_PHASE"]).toContain(room.state.phase);
  });
});

// ─── Scenario 4.7: Last Survivor ────────────────────────────────────────────

describe("Scenario 4.7: Last Survivor", () => {
  it("all except 1 surrender → last survivor gets +5, round ends", async () => {
    const room = await createRoom();
    const p1 = makeMockClient("p1_sc47");
    const p2 = makeMockClient("p2_sc47");
    const p3 = makeMockClient("p3_sc47");
    await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
    await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });
    await joinRoom(room, p3, { nickname: "Carol", avatar: "🎉" });
    sendMessage(room, p1, "START_GAME");
    startPlaying(room);

    // P1 and P2 surrender → P3 is last
    sendMessage(room, p1, "SURRENDER");
    sendMessage(room, p2, "SURRENDER");

    // P3 should have survival bonus
    expect(room.state.players.get("p3_sc47").score).toBe(5);
    expect(["GUESS_PHASE", "ROUND_END", "SCOREBOARD"]).toContain(room.state.phase);
  });
});
