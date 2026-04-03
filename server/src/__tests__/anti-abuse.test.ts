/**
 * AEG-41 QA: Anti-abuse features
 *
 * Covers the 12 test scenarios from AEG-41:
 *   Rejoin Tokens  (SC-RJ-01 … SC-RJ-04) — blocked on AEG-34 implementation
 *   Nickname Filter(SC-NF-05 … SC-NF-08) — blocked on AEG-35 implementation
 *   Host Transfer  (SC-HT-09 … SC-HT-12) — blocked on AEG-36 implementation
 *
 * Tests that depend on unimplemented features are marked `.todo`.
 * Tests that exercise existing code (partial AEG-36 host-election logic) are
 * written as ordinary `it()` blocks and are expected to PASS already.
 *
 * When Bolt completes AEG-34 / AEG-35 / AEG-36, remove the `.todo` markers
 * and run the suite to verify compliance.
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
} from "./integration/helpers";

beforeAll(setupMatchMaker);
afterAll(teardownMatchMaker);

function simulateLeave(room: any, client: any, consented = false) {
  (room as any)["_onLeave"](client, consented);
}

// ─── REJOIN TOKENS (AEG-34) ────────────────────────────────────────────────
// All blocked until AEG-34 is implemented.

describe("SC-RJ: Rejoin Tokens (requires AEG-34)", () => {
  /**
   * SC-RJ-01: Valid token — player refreshes browser and rejoins successfully.
   *
   * Expected behaviour (AEG-34):
   *   1. After onJoin, server sends client a ROOM_TOKEN message.
   *   2. Player "refreshes" (leaves + rejoins) presenting that token.
   *   3. Server validates signature → join succeeds, same player state preserved.
   */
  it.todo("SC-RJ-01: valid token — player rejoins successfully after browser refresh");

  /**
   * SC-RJ-02: Kicked player's token is revoked; rejoin attempt fails.
   *
   * Expected behaviour:
   *   1. p1 (host) kicks p2.
   *   2. p2 attempts to rejoin presenting their old ROOM_TOKEN.
   *   3. Server rejects with REJOIN_REJECTED error.
   */
  it.todo("SC-RJ-02: kicked player token revoked — rejoin attempt returns REJOIN_REJECTED");

  /**
   * SC-RJ-03: Kicked player can re-enter with a NEW nickname (no token).
   *
   * Expected behaviour:
   *   1. p2 is kicked.
   *   2. p2 joins fresh (no token) with a different nickname → succeeds.
   *   3. Server issues a new ROOM_TOKEN for the new session.
   */
  it.todo("SC-RJ-03: new join after kick with fresh nickname succeeds and receives new token");

  /**
   * SC-RJ-04: Token replay — reusing a valid token for a different nickname is rejected.
   *
   * Expected behaviour:
   *   1. p2 holds a valid ROOM_TOKEN (issued at join time).
   *   2. Attacker tries to join presenting p2's token but with nickname "Hacker".
   *   3. Server rejects with REJOIN_REJECTED (token bound to original sessionId/fingerprint).
   */
  it.todo("SC-RJ-04: token replay with different nickname returns REJOIN_REJECTED");
});

// ─── NICKNAME FILTER (AEG-35) ─────────────────────────────────────────────
// All blocked until AEG-35 is implemented.

describe("SC-NF: Nickname Filter (requires AEG-35)", () => {
  /**
   * SC-NF-05: Offensive Thai term → rejected with OFFENSIVE reason.
   *
   * Expected behaviour (AEG-35):
   *   - joinRoom with a term from the blocklist sends NICKNAME_REJECTED
   *     { reason: "OFFENSIVE" } to the joining client.
   *   - The player is NOT added to room state.
   */
  it.todo("SC-NF-05: offensive Thai term → NICKNAME_REJECTED with reason OFFENSIVE");

  /**
   * SC-NF-06: Reserved name "Admin" → rejected with RESERVED reason.
   *
   * Expected behaviour:
   *   - joinRoom with nickname "Admin" (case-insensitive) sends
   *     NICKNAME_REJECTED { reason: "RESERVED" }.
   */
  it.todo('SC-NF-06: reserved name "Admin" → NICKNAME_REJECTED with reason RESERVED');

  /**
   * SC-NF-07: Normal nickname → accepted, player joins normally.
   *
   * This will trivially pass once the filter is in place (normal names must
   * still be allowed).  Written here to make the suite self-documenting.
   */
  it.todo("SC-NF-07: normal nickname accepted — player joins and appears in room state");

  /**
   * SC-NF-08: Unicode variant of blocked Thai term → rejected (normalization test).
   *
   * Expected behaviour:
   *   - A blocked term written with visually similar Unicode characters is
   *     normalised and caught by the filter → NICKNAME_REJECTED { reason: "OFFENSIVE" }.
   */
  it.todo("SC-NF-08: Unicode-normalised variant of blocked term → NICKNAME_REJECTED OFFENSIVE");
});

// ─── HOST TRANSFER (AEG-36) ────────────────────────────────────────────────

describe("SC-HT: Host Transfer (partial — HOST_TRANSFERRED event requires AEG-36)", () => {
  /**
   * SC-HT-09: Host disconnects mid-lobby → next player becomes host automatically.
   *
   * The host-election logic already exists in KhamTongHamRoom.transferHost().
   * AEG-36 additionally requires a HOST_TRANSFERRED broadcast.
   *
   * Part A (existing logic) passes now.
   * Part B (HOST_TRANSFERRED event) will fail until AEG-36 is done.
   */
  describe("SC-HT-09: host disconnects mid-lobby", () => {
    it("next player becomes host (existing logic — should pass)", async () => {
      const room = await createRoom("HT09A");
      const p1 = makeMockClient("p1_ht09a");
      const p2 = makeMockClient("p2_ht09a");
      const p3 = makeMockClient("p3_ht09a");
      await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
      await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });
      await joinRoom(room, p3, { nickname: "Carol", avatar: "🎉" });

      expect(room.state.players.get("p1_ht09a").isHost).toBe(true);
      simulateLeave(room, p1, false);

      // p2 joined first after p1 → should be promoted
      expect(room.state.players.get("p2_ht09a").isHost).toBe(true);
      expect(room.state.playerCount).toBe(2);
    });

    it.todo(
      "SC-HT-09b: HOST_TRANSFERRED event broadcast to remaining players (requires AEG-36)"
    );
  });

  /**
   * SC-HT-10: Host disconnects mid-game → game continues, new host has controls.
   *
   * Part A (host election + game continues) passes now.
   * Part B (HOST_TRANSFERRED broadcast) will fail until AEG-36.
   */
  describe("SC-HT-10: host disconnects mid-game", () => {
    it("game phase stays PLAYING after host disconnect (existing logic — should pass)", async () => {
      const room = await createRoom("HT10A");
      const p1 = makeMockClient("p1_ht10a");
      const p2 = makeMockClient("p2_ht10a");
      const p3 = makeMockClient("p3_ht10a");
      await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
      await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });
      await joinRoom(room, p3, { nickname: "Carol", avatar: "🎉" });
      sendMessage(room, p1, "START_GAME");
      (room as any)["startPlaying"]();

      simulateLeave(room, p1, false);

      // Game should not have ended
      expect(["PLAYING", "VOTING"]).toContain(room.state.phase);
    });

    it("a non-host player is promoted after host disconnect mid-game (existing logic — should pass)", async () => {
      const room = await createRoom("HT10B");
      const p1 = makeMockClient("p1_ht10b");
      const p2 = makeMockClient("p2_ht10b");
      const p3 = makeMockClient("p3_ht10b");
      await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
      await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });
      await joinRoom(room, p3, { nickname: "Carol", avatar: "🎉" });
      sendMessage(room, p1, "START_GAME");
      (room as any)["startPlaying"]();

      simulateLeave(room, p1, false);

      const p2Host = room.state.players.get("p2_ht10b")?.isHost ?? false;
      const p3Host = room.state.players.get("p3_ht10b")?.isHost ?? false;
      expect(p2Host || p3Host).toBe(true);
    });

    it("new host can call END_GAME after promotion mid-game (existing logic — should pass)", async () => {
      const room = await createRoom("HT10C");
      const p1 = makeMockClient("p1_ht10c");
      const p2 = makeMockClient("p2_ht10c");
      const p3 = makeMockClient("p3_ht10c");
      await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
      await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });
      await joinRoom(room, p3, { nickname: "Carol", avatar: "🎉" });
      sendMessage(room, p1, "START_GAME");
      (room as any)["startPlaying"]();

      simulateLeave(room, p1, false);

      // Determine new host
      const newHostClient =
        room.state.players.get("p2_ht10c")?.isHost ? p2 : p3;

      // New host can end game without error
      expect(() => sendMessage(room, newHostClient, "END_GAME")).not.toThrow();
      expect(room.state.phase).toBe("GAME_OVER");
    });

    it.todo(
      "SC-HT-10d: HOST_TRANSFERRED event broadcast includes new host nickname (requires AEG-36)"
    );
  });

  /**
   * SC-HT-11: Last player leaves → room cleanup timer starts (room gone after 5 min).
   *
   * CURRENTLY FAILING: the room uses a 30-second cleanup timer, not 5 minutes.
   * AEG-36 must change the timer to 5 * 60 * 1000 ms.
   */
  describe("SC-HT-11: last player leaves — 5-minute room cleanup", () => {
    it("room is NOT disposed before 5 minutes (300 000 ms) elapse", async () => {
      const room = await createRoom("HT11A");
      const p1 = makeMockClient("p1_ht11a");
      const p2 = makeMockClient("p2_ht11a");
      await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
      await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });

      simulateLeave(room, p1, false);
      simulateLeave(room, p2, false);

      // Advance 4 min 59 sec — room must still be alive
      advanceClock(room, 4 * 60 * 1000 + 59 * 1000);
      expect(room.state).toBeDefined(); // room object has not been destroyed
    });

    it("room is disposed at or after 5 minutes (300 000 ms)", async () => {
      const room = await createRoom("HT11B");
      const p1 = makeMockClient("p1_ht11b");
      const p2 = makeMockClient("p2_ht11b");
      await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
      await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });

      let disposed = false;
      room.onDispose(() => { disposed = true; });

      simulateLeave(room, p1, false);
      simulateLeave(room, p2, false);

      // Advance past 5 minutes
      advanceClock(room, 5 * 60 * 1000 + 1000);
      expect(disposed).toBe(true);
    });
  });

  /**
   * SC-HT-12: Voluntary transfer — host can pass role via TRANSFER_HOST message.
   *
   * Currently FAILING: no TRANSFER_HOST message handler exists.
   * AEG-36 must add this handler.
   */
  describe("SC-HT-12: voluntary host transfer", () => {
    it("host sends TRANSFER_HOST → target becomes new host, old host loses role", async () => {
      const room = await createRoom("HT12A");
      const p1 = makeMockClient("p1_ht12a");
      const p2 = makeMockClient("p2_ht12a");
      await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
      await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });

      expect(room.state.players.get("p1_ht12a").isHost).toBe(true);

      sendMessage(room, p1, "TRANSFER_HOST", { targetPlayerId: "p2_ht12a" });

      expect(room.state.players.get("p2_ht12a").isHost).toBe(true);
      expect(room.state.players.get("p1_ht12a").isHost).toBe(false);
    });

    it("non-host cannot invoke TRANSFER_HOST", async () => {
      const room = await createRoom("HT12B");
      const p1 = makeMockClient("p1_ht12b");
      const p2 = makeMockClient("p2_ht12b");
      await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
      await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });

      sendMessage(room, p2, "TRANSFER_HOST", { targetPlayerId: "p1_ht12b" });

      // Host should not have changed
      expect(room.state.players.get("p1_ht12b").isHost).toBe(true);
      const errMsg = p2.sends.find((s) => s.type === "ERROR");
      expect(errMsg).toBeDefined();
      expect(errMsg?.msg.code).toBe("NOT_HOST");
    });

    it.todo(
      "SC-HT-12c: HOST_TRANSFERRED event broadcast after voluntary transfer (requires AEG-36)"
    );
  });
});
