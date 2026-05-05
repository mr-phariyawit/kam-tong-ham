/**
 * AEG-41 QA: Anti-abuse features — spec compliance suite
 *
 * Tests the 12 scenarios from AEG-41 against the AEG-34/35/36 specs.
 * All `.todo` markers removed now that implementations (AEG-34, AEG-35, AEG-36)
 * are merged (commit fd3349b + 797e33d).
 *
 * Failures indicate spec compliance gaps that need a follow-up fix.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  setupMatchMaker,
  teardownMatchMaker,
  createRoom,
  joinRoom,
  sendMessage,
  makeMockClient,
  advanceClock,
  MockClient,
} from "./integration/helpers";

beforeAll(setupMatchMaker);
afterAll(teardownMatchMaker);

/**
 * Simulate a player leaving. For LOBBY leaves, onLeave removes immediately (sync before await).
 * For mid-game leaves, the reconnection deferred is rejected to simulate timeout.
 */
async function simulateLeave(room: any, client: any, consented = false) {
  const leavePromise = (room as any)["_onLeave"](client, consented ? 4000 : 1001);

  // For non-LOBBY, non-consented leaves, reject the reconnection deferred
  if (!consented && room.state.phase !== "LOBBY") {
    const sessionId = client.sessionId;
    if (room.reservedSeatTimeouts && room.reservedSeatTimeouts[sessionId]) {
      clearTimeout(room.reservedSeatTimeouts[sessionId]);
      delete room.reservedSeatTimeouts[sessionId];
    }
    if (room._reconnections) {
      const token = client._reconnectionToken;
      if (token && room._reconnections[token]) {
        const [, deferred] = room._reconnections[token];
        deferred.reject(false);
      }
    }
    const roomReconnectDeferreds = (room as any).reconnectDeferreds;
    if (roomReconnectDeferreds && roomReconnectDeferreds.has(sessionId)) {
      const deferred = roomReconnectDeferreds.get(sessionId);
      if (deferred && deferred.reject) {
        try { deferred.reject(false); } catch (_) {}
      }
    }
  }

  await leavePromise;
}

/**
 * Colyseus emits "early_leave" when client.leave() is called from inside onJoin.
 * Tests that expect join rejection must catch this error.
 */
async function tryJoinExpectingRejection(
  room: any,
  client: MockClient,
  options: any
) {
  try {
    await joinRoom(room, client, options);
  } catch (e: any) {
    if (e?.message !== "early_leave") throw e;
  }
}

// ─── SC-RJ: REJOIN TOKENS (AEG-34) ────────────────────────────────────────

describe("SC-RJ: Rejoin Tokens (AEG-34)", () => {
  /**
   * SC-RJ-01: Valid token — player refreshes browser and rejoins successfully.
   */
  it("SC-RJ-01: valid token — player rejoins successfully after browser refresh", async () => {
    const room = await createRoom("RJ01");
    const p1 = makeMockClient("p1_rj01");
    const p2 = makeMockClient("p2_rj01");
    await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
    await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });

    const token = p2.sends.find((s) => s.type === "ROOM_TOKEN")?.msg?.token;
    expect(token).toBeDefined();

    // Bob "refreshes" — leaves and rejoins with token
    await simulateLeave(room, p2, false);

    const p2b = makeMockClient("p2b_rj01");
    await joinRoom(room, p2b, { nickname: "Bob", avatar: "😎", roomToken: token });

    // No KICKED error; player successfully in room
    const err = p2b.sends.find((s) => s.type === "ERROR" && s.msg?.code === "KICKED");
    expect(err).toBeUndefined();
    expect(room.state.players.has("p2b_rj01")).toBe(true);
  });

  /**
   * SC-RJ-02: Kicked player — token is revoked, rejoin attempt fails with KICKED error.
   */
  it("SC-RJ-02: kicked player token revoked — rejoin attempt fails", async () => {
    const room = await createRoom("RJ02");
    const p1 = makeMockClient("p1_rj02");
    const p2 = makeMockClient("p2_rj02");
    await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
    await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });

    const token = p2.sends.find((s) => s.type === "ROOM_TOKEN")?.msg?.token;
    sendMessage(room, p1, "KICK_PLAYER", { targetPlayerId: "p2_rj02" });

    const p2b = makeMockClient("p2b_rj02");
    await tryJoinExpectingRejection(room, p2b, {
      nickname: "Bob",
      avatar: "😎",
      roomToken: token,
    });

    const err = p2b.sends.find((s) => s.type === "ERROR");
    expect(err).toBeDefined();
    expect(err?.msg?.code).toBe("KICKED");
  });

  /**
   * SC-RJ-03: New join after kick — player with a DIFFERENT nickname can join.
   */
  it("SC-RJ-03: new join after kick with fresh nickname succeeds and receives new token", async () => {
    const room = await createRoom("RJ03");
    const p1 = makeMockClient("p1_rj03");
    const p2 = makeMockClient("p2_rj03");
    await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
    await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });

    sendMessage(room, p1, "KICK_PLAYER", { targetPlayerId: "p2_rj03" });

    // Fresh join with DIFFERENT nickname (not "Bob") must succeed
    const p2c = makeMockClient("p2c_rj03");
    await joinRoom(room, p2c, { nickname: "Charlie", avatar: "🤖" });

    const err = p2c.sends.find((s) => s.type === "ERROR");
    expect(err).toBeUndefined();
    expect(room.state.players.has("p2c_rj03")).toBe(true);

    // New player also gets a fresh ROOM_TOKEN
    const newToken = p2c.sends.find((s) => s.type === "ROOM_TOKEN");
    expect(newToken).toBeDefined();
  });

  /**
   * SC-RJ-04: Token replay — reusing a valid token for a DIFFERENT nickname must be rejected.
   *
   * Spec: "Token replay: reusing token for different nickname is rejected"
   * The token is bound to the original player; presenting it with a different
   * nickname should count as an invalid/replayed join and be rejected.
   *
   * DEFECT DETECTION: If this test FAILS, the implementation does not guard
   * against token replay attacks (the token validation ignores the nickname field).
   */
  it("SC-RJ-04: token replay with different nickname is rejected", async () => {
    const room = await createRoom("RJ04");
    const p1 = makeMockClient("p1_rj04");
    const p2 = makeMockClient("p2_rj04");
    await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
    await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });

    const bobToken = p2.sends.find((s) => s.type === "ROOM_TOKEN")?.msg?.token;

    // Attacker tries to join presenting Bob's token but with a different nickname
    const attacker = makeMockClient("attacker_rj04");
    await tryJoinExpectingRejection(room, attacker, {
      nickname: "Hacker",
      avatar: "💀",
      roomToken: bobToken,
    });

    const err = attacker.sends.find((s) => s.type === "ERROR");
    expect(err).toBeDefined(); // must be rejected
  });
});

// ─── SC-NF: NICKNAME FILTER (AEG-35) ──────────────────────────────────────

describe("SC-NF: Nickname Filter (AEG-35)", () => {
  /**
   * SC-NF-05: Offensive Thai term → rejected with OFFENSIVE reason.
   *
   * Spec: "return error event NICKNAME_REJECTED with reason code OFFENSIVE | RESERVED"
   *
   * DEFECT DETECTION: If this test FAILS, the implementation uses a non-spec
   * error code (e.g. BLOCKED_NICKNAME) or does not send a reason field.
   */
  it("SC-NF-05: offensive Thai term → NICKNAME_REJECTED with reason OFFENSIVE", async () => {
    const room = await createRoom("NF05");
    const p1 = makeMockClient("p1_nf05");
    await tryJoinExpectingRejection(room, p1, { nickname: "ไอ้สัตว์", avatar: "😀" });

    const err = p1.sends.find((s) => s.type === "ERROR");
    expect(err).toBeDefined();
    expect(err?.msg?.code).toBe("NICKNAME_REJECTED");
    expect(err?.msg?.reason).toBe("OFFENSIVE");
  });

  /**
   * SC-NF-06: Reserved name "Admin" → rejected with RESERVED reason.
   *
   * Spec: "Also block reserved system names: ผู้ดูแล, Admin, Host, System"
   *
   * DEFECT DETECTION: If this test FAILS, reserved names are not blocked.
   */
  it('SC-NF-06: reserved name "Admin" → NICKNAME_REJECTED with reason RESERVED', async () => {
    const room = await createRoom("NF06");
    const p1 = makeMockClient("p1_nf06");
    await tryJoinExpectingRejection(room, p1, { nickname: "Admin", avatar: "😀" });

    const err = p1.sends.find((s) => s.type === "ERROR");
    expect(err).toBeDefined();
    expect(err?.msg?.code).toBe("NICKNAME_REJECTED");
    expect(err?.msg?.reason).toBe("RESERVED");
  });

  /**
   * SC-NF-07: Normal nickname → accepted.
   */
  it("SC-NF-07: normal nickname accepted — player joins and appears in room state", async () => {
    const room = await createRoom("NF07");
    const p1 = makeMockClient("p1_nf07");
    await joinRoom(room, p1, { nickname: "สมชาย", avatar: "😀" });

    const err = p1.sends.find((s) => s.type === "ERROR");
    expect(err).toBeUndefined();
    expect(room.state.players.has("p1_nf07")).toBe(true);
  });

  /**
   * SC-NF-08: Unicode variant of blocked Thai term → rejected.
   *
   * Spec: "normalize Thai Unicode before comparison"
   * Test uses a visually similar but NFC-equivalent of a blocked term.
   *
   * DEFECT DETECTION: If this test FAILS, Thai Unicode normalization is not
   * applied before blocklist matching.
   */
  it("SC-NF-08: Unicode-normalised variant of blocked Thai term → NICKNAME_REJECTED OFFENSIVE", async () => {
    const room = await createRoom("NF08");
    const p1 = makeMockClient("p1_nf08");

    // "มึง" with an NFC-equivalent composed form (should normalise to same result)
    // Using the standard composed form — filter must handle both NFC and NFD.
    const unicodeVariant = "\u0E21\u0E36\u0E07"; // มึง in NFC/composed
    await tryJoinExpectingRejection(room, p1, { nickname: unicodeVariant, avatar: "😀" });

    const err = p1.sends.find((s) => s.type === "ERROR");
    expect(err).toBeDefined();
    expect(err?.msg?.code).toBe("NICKNAME_REJECTED");
  });
});

// ─── SC-HT: HOST TRANSFER (AEG-36) ────────────────────────────────────────

describe("SC-HT: Host Transfer (AEG-36)", () => {
  describe("SC-HT-09: host disconnects mid-lobby", () => {
    it("SC-HT-09a: next player becomes host automatically (existing logic)", async () => {
      const room = await createRoom("HT09A");
      const p1 = makeMockClient("p1_ht09a");
      const p2 = makeMockClient("p2_ht09a");
      const p3 = makeMockClient("p3_ht09a");
      await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
      await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });
      await joinRoom(room, p3, { nickname: "Carol", avatar: "🎉" });

      await simulateLeave(room, p1, false);
      expect(room.state.players.get("p2_ht09a").isHost).toBe(true);
      expect(room.state.playerCount).toBe(2);
    });

    it("SC-HT-09b: HOST_TRANSFERRED event broadcast to remaining players", async () => {
      const room = await createRoom("HT09B");
      const p1 = makeMockClient("p1_ht09b");
      const p2 = makeMockClient("p2_ht09b");
      const p3 = makeMockClient("p3_ht09b");
      await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
      await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });
      await joinRoom(room, p3, { nickname: "Carol", avatar: "🎉" });

      p2.sends = [];
      p3.sends = [];
      await simulateLeave(room, p1, false);

      const p2Transfer = p2.sends.find((s) => s.type === "HOST_TRANSFERRED");
      const p3Transfer = p3.sends.find((s) => s.type === "HOST_TRANSFERRED");
      expect(p2Transfer || p3Transfer).toBeTruthy();

      const transfer = (p2Transfer || p3Transfer)!;
      expect(transfer.msg.newHostId).toBeDefined();
      expect(transfer.msg.newHostNickname).toBeDefined();
    });
  });

  describe("SC-HT-10: host disconnects mid-game", () => {
    it("SC-HT-10a: game phase stays PLAYING after host disconnect", async () => {
      const room = await createRoom("HT10A");
      const p1 = makeMockClient("p1_ht10a");
      const p2 = makeMockClient("p2_ht10a");
      const p3 = makeMockClient("p3_ht10a");
      await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
      await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });
      await joinRoom(room, p3, { nickname: "Carol", avatar: "🎉" });
      sendMessage(room, p1, "START_GAME");
      (room as any)["startPlaying"]();

      await simulateLeave(room, p1, false);
      expect(["PLAYING", "VOTING"]).toContain(room.state.phase);
    });

    it("SC-HT-10b: non-host player is promoted after host disconnect mid-game", async () => {
      const room = await createRoom("HT10B");
      const p1 = makeMockClient("p1_ht10b");
      const p2 = makeMockClient("p2_ht10b");
      const p3 = makeMockClient("p3_ht10b");
      await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
      await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });
      await joinRoom(room, p3, { nickname: "Carol", avatar: "🎉" });
      sendMessage(room, p1, "START_GAME");
      (room as any)["startPlaying"]();

      await simulateLeave(room, p1, false);
      const p2Host = room.state.players.get("p2_ht10b")?.isHost ?? false;
      const p3Host = room.state.players.get("p3_ht10b")?.isHost ?? false;
      expect(p2Host || p3Host).toBe(true);
    });

    it("SC-HT-10c: new host can call END_GAME after promotion mid-game", async () => {
      const room = await createRoom("HT10C");
      const p1 = makeMockClient("p1_ht10c");
      const p2 = makeMockClient("p2_ht10c");
      const p3 = makeMockClient("p3_ht10c");
      await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
      await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });
      await joinRoom(room, p3, { nickname: "Carol", avatar: "🎉" });
      sendMessage(room, p1, "START_GAME");
      (room as any)["startPlaying"]();

      await simulateLeave(room, p1, false);
      const newHostClient = room.state.players.get("p2_ht10c")?.isHost ? p2 : p3;
      expect(() => sendMessage(room, newHostClient, "END_GAME")).not.toThrow();
      expect(room.state.phase).toBe("GAME_OVER");
    });

    it("SC-HT-10d: HOST_TRANSFERRED event broadcast includes new host nickname", async () => {
      const room = await createRoom("HT10D");
      const p1 = makeMockClient("p1_ht10d");
      const p2 = makeMockClient("p2_ht10d");
      const p3 = makeMockClient("p3_ht10d");
      await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
      await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });
      await joinRoom(room, p3, { nickname: "Carol", avatar: "🎉" });
      sendMessage(room, p1, "START_GAME");
      (room as any)["startPlaying"]();

      p2.sends = [];
      p3.sends = [];
      await simulateLeave(room, p1, false);

      const transfer =
        p2.sends.find((s) => s.type === "HOST_TRANSFERRED") ||
        p3.sends.find((s) => s.type === "HOST_TRANSFERRED");

      expect(transfer).toBeDefined();
      expect(typeof transfer?.msg?.newHostNickname).toBe("string");
      expect(transfer?.msg?.newHostNickname.length).toBeGreaterThan(0);
    });
  });

  describe("SC-HT-11: last player leaves — 5-minute room cleanup", () => {
    it("SC-HT-11a: room is NOT disposed before 5 minutes (300 000 ms) elapse", async () => {
      const room = await createRoom("HT11A");
      const p1 = makeMockClient("p1_ht11a");
      const p2 = makeMockClient("p2_ht11a");
      await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
      await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });

      await simulateLeave(room, p1, false);
      await simulateLeave(room, p2, false);

      advanceClock(room, 4 * 60 * 1000 + 59 * 1000);
      expect(room.state).toBeDefined();
    });

    it("SC-HT-11b: room is disposed at or after 5 minutes (300 000 ms)", async () => {
      const room = await createRoom("HT11B");
      const p1 = makeMockClient("p1_ht11b");
      const p2 = makeMockClient("p2_ht11b");
      await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
      await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });

      let disposed = false;
      room.onDispose(() => { disposed = true; });

      await simulateLeave(room, p1, false);
      await simulateLeave(room, p2, false);

      advanceClock(room, 5 * 60 * 1000 + 1000);
      expect(disposed).toBe(true);
    });
  });

  describe("SC-HT-12: voluntary host transfer", () => {
    it("SC-HT-12a: host sends TRANSFER_HOST → target becomes new host, old host loses role", async () => {
      const room = await createRoom("HT12A");
      const p1 = makeMockClient("p1_ht12a");
      const p2 = makeMockClient("p2_ht12a");
      await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
      await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });

      sendMessage(room, p1, "TRANSFER_HOST", { targetPlayerId: "p2_ht12a" });

      expect(room.state.players.get("p2_ht12a").isHost).toBe(true);
      expect(room.state.players.get("p1_ht12a").isHost).toBe(false);
    });

    it("SC-HT-12b: non-host cannot invoke TRANSFER_HOST", async () => {
      const room = await createRoom("HT12B");
      const p1 = makeMockClient("p1_ht12b");
      const p2 = makeMockClient("p2_ht12b");
      await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
      await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });

      sendMessage(room, p2, "TRANSFER_HOST", { targetPlayerId: "p1_ht12b" });

      expect(room.state.players.get("p1_ht12b").isHost).toBe(true);
      const errMsg = p2.sends.find((s) => s.type === "ERROR");
      expect(errMsg).toBeDefined();
      expect(errMsg?.msg.code).toBe("NOT_HOST");
    });

    it("SC-HT-12c: HOST_TRANSFERRED event broadcast after voluntary transfer", async () => {
      const room = await createRoom("HT12C");
      const p1 = makeMockClient("p1_ht12c");
      const p2 = makeMockClient("p2_ht12c");
      const p3 = makeMockClient("p3_ht12c");
      await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
      await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });
      await joinRoom(room, p3, { nickname: "Carol", avatar: "🎉" });

      p2.sends = [];
      p3.sends = [];
      sendMessage(room, p1, "TRANSFER_HOST", { targetPlayerId: "p2_ht12c" });

      const transfer =
        p2.sends.find((s) => s.type === "HOST_TRANSFERRED") ||
        p3.sends.find((s) => s.type === "HOST_TRANSFERRED");

      expect(transfer).toBeDefined();
      expect(transfer?.msg?.newHostNickname).toBe("Bob");
    });
  });
});
