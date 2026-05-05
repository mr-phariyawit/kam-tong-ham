/**
 * Scenario 4.3: Disconnect and Reconnect
 * Scenario 4.4: Host Transfer on Host Leave
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  setupMatchMaker, teardownMatchMaker, createRoom, joinRoom,
  sendMessage, makeMockClient, startPlaying, MockClient,
} from "./helpers";

beforeAll(setupMatchMaker);
afterAll(teardownMatchMaker);

/**
 * Simulate a player leaving the room.
 * - For consented LOBBY leave: the promise resolves immediately (sync path in onLeave).
 * - For non-consented leave during game: we call _onLeave (which starts
 *   allowReconnection) and then immediately reject the reconnection deferred
 *   to simulate timeout, so the catch block runs and the player is surrendered.
 */
async function simulateLeave(room: any, client: MockClient, consented = false) {
  // Colyseus _onLeave expects a close code: 4000 = consented, 1001 = going away
  const leavePromise = (room as any)["_onLeave"](client, consented ? 4000 : 1001);

  // For non-consented leaves (game disconnect), the onLeave awaits allowReconnection.
  // We need to reject the reconnection deferred so the catch block processes the disconnect.
  if (!consented && room.state.phase !== "LOBBY") {
    // Clear the reconnection seat timeout and reject the deferred immediately
    const sessionId = client.sessionId;
    if (room.reservedSeatTimeouts && room.reservedSeatTimeouts[sessionId]) {
      clearTimeout(room.reservedSeatTimeouts[sessionId]);
      delete room.reservedSeatTimeouts[sessionId];
    }
    // Find and reject the reconnection deferred via the room's _reconnections map
    if (room._reconnections) {
      const token = client._reconnectionToken;
      if (token && room._reconnections[token]) {
        const [, deferred] = room._reconnections[token];
        deferred.reject(false);
      }
    }
    // Also reject via the room's own reconnectDeferreds map (user-level)
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

describe("Scenario 4.3: Player Disconnect During Game", () => {
  it("non-host disconnects during PLAYING → isAlive=false, score-=3, isConnected=false", async () => {
    const room = await createRoom();
    const p1 = makeMockClient("p1_sc43a");
    const p2 = makeMockClient("p2_sc43a");
    const p3 = makeMockClient("p3_sc43a");
    await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
    await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });
    await joinRoom(room, p3, { nickname: "Carol", avatar: "🎉" });
    sendMessage(room, p1, "START_GAME");
    startPlaying(room);

    await simulateLeave(room, p3, false);

    const p3State = room.state.players.get("p3_sc43a");
    expect(p3State.isConnected).toBe(false);
    expect(p3State.isAlive).toBe(false);
    expect(p3State.score).toBe(-3);
  });

  it("aliveCount decrements after disconnect during game", async () => {
    const room = await createRoom();
    const p1 = makeMockClient("p1_sc43b");
    const p2 = makeMockClient("p2_sc43b");
    const p3 = makeMockClient("p3_sc43b");
    await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
    await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });
    await joinRoom(room, p3, { nickname: "Carol", avatar: "🎉" });
    sendMessage(room, p1, "START_GAME");
    startPlaying(room);

    const aliveBefore = room.state.aliveCount;
    await simulateLeave(room, p3, false);
    expect(room.state.aliveCount).toBe(aliveBefore - 1);
  });

  it("LOBBY leave — player removed entirely from state", async () => {
    const room = await createRoom();
    const p1 = makeMockClient("p1_sc43c");
    const p2 = makeMockClient("p2_sc43c");
    await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
    await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });

    await simulateLeave(room, p2, true);
    expect(room.state.playerCount).toBe(1);
    expect(room.state.players.get("p2_sc43c")).toBeUndefined();
  });
});

describe("Scenario 4.4: Host Transfer on Host Leave", () => {
  it("host leaves LOBBY → next connected player becomes host", async () => {
    const room = await createRoom();
    const p1 = makeMockClient("p1_sc44a");
    const p2 = makeMockClient("p2_sc44a");
    const p3 = makeMockClient("p3_sc44a");
    await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
    await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });
    await joinRoom(room, p3, { nickname: "Carol", avatar: "🎉" });

    expect(room.state.players.get("p1_sc44a").isHost).toBe(true);
    await simulateLeave(room, p1, true);

    expect(room.state.players.get("p2_sc44a").isHost).toBe(true);
    expect(room.state.playerCount).toBe(2);
  });

  it("new host can start game after original host leaves", async () => {
    const room = await createRoom();
    const p1 = makeMockClient("p1_sc44b");
    const p2 = makeMockClient("p2_sc44b");
    const p3 = makeMockClient("p3_sc44b");
    await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
    await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });
    await joinRoom(room, p3, { nickname: "Carol", avatar: "🎉" });
    await simulateLeave(room, p1, true);

    sendMessage(room, p2, "START_GAME");
    expect(room.state.phase).toBe("COUNTDOWN");
  });

  it("host disconnects during PLAYING → another player gets host", async () => {
    const room = await createRoom();
    const p1 = makeMockClient("p1_sc44c");
    const p2 = makeMockClient("p2_sc44c");
    const p3 = makeMockClient("p3_sc44c");
    await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
    await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });
    await joinRoom(room, p3, { nickname: "Carol", avatar: "🎉" });
    sendMessage(room, p1, "START_GAME");
    startPlaying(room);

    await simulateLeave(room, p1, false);
    // P2 or P3 should now be host
    const p2Host = room.state.players.get("p2_sc44c").isHost;
    const p3Host = room.state.players.get("p3_sc44c")?.isHost ?? false;
    expect(p2Host || p3Host).toBe(true);
  });
});
