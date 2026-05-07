/**
 * Adversarial Scenario #4: 8-player Spy with one disconnect mid-round
 *
 * Sprint 17, Issue #18, KTH-T-104
 *
 * Tests that when a player drops mid-question phase (DISCUSSION) in an
 * 8-player Spy game, the game continues correctly with reduced participants:
 * - If the spy disconnects: hunters win immediately (spy_disconnected)
 * - If a non-spy disconnects: game continues with 7 active players
 * - Vote mechanics adjust for reduced player count
 * - Reconnected player receives role data on reconnect
 * - Multiple sequential disconnects don't crash the game
 */
import { describe, it, expect } from "vitest";
import { matchMaker, LocalDriver, LocalPresence } from "@colyseus/core";
import { SpyRoom } from "../../rooms/SpyRoom";
import { SpyState, SpyPlayer } from "../../schemas/SpyState";
import { makeMockClient, type MockClient } from "../integration/helpers";

// ─── Setup ──────────────────────────────────────────────────

let setupDone = false;

async function setup() {
  if (!setupDone) {
    await matchMaker.setup(new LocalPresence(), new LocalDriver());
    matchMaker.defineRoomType("spy_8d", SpyRoom);
    setupDone = true;
  }
}

async function createRoom(code = "SP8D") {
  await setup();
  const listing = await matchMaker.createRoom("spy_8d", { roomCode: code, gameType: "spy" });
  return matchMaker.getRoomById(listing.roomId) as any;
}

async function joinRoom(room: any, client: MockClient, nick: string) {
  await (room as any)["_reserveSeat"](client.sessionId, { nickname: nick, avatar: "D" }, undefined);
  await (room as any)["_onJoin"](client);
}

function sendMsg(room: any, client: MockClient, type: string, data?: any) {
  const handler = (room as any).onMessageHandlers[type];
  if (!handler) throw new Error(`No handler: ${type}`);
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

function getState(room: any): SpyState {
  return room.state as SpyState;
}

function getPlayers(room: any): SpyPlayer[] {
  const players: SpyPlayer[] = [];
  getState(room).players.forEach((p) => players.push(p as SpyPlayer));
  return players;
}

function findSpy(room: any): { client: MockClient; player: SpyPlayer } | null {
  const players = getPlayers(room);
  const spy = players.find((p) => p.isSpy);
  if (!spy) return null;
  const client = (room as any).clients.find((c: MockClient) => c.sessionId === spy.id);
  return client ? { client, player: spy } : null;
}

function findNonSpies(room: any): Array<{ client: MockClient; player: SpyPlayer }> {
  return getPlayers(room)
    .filter((p) => !p.isSpy && p.isConnected)
    .map((p) => ({
      client: (room as any).clients.find((c: MockClient) => c.sessionId === p.id),
      player: p,
    }))
    .filter((x) => x.client !== undefined);
}

/**
 * Simulate a player disconnecting mid-game.
 * Marks isConnected=false, removes from clients array,
 * and calls onPlayerDisconnectedDuringGame (what BaseRoom does after
 * reconnection timeout expires).
 */
function simulateDisconnectAndTimeout(room: any, client: MockClient): void {
  const player = room.state.players.get(client.sessionId);
  if (!player) throw new Error(`Player not found: ${client.sessionId}`);

  player.isConnected = false;

  // Remove from clients array
  const idx = room.clients.findIndex((c: MockClient) => c.sessionId === client.sessionId);
  if (idx >= 0) room.clients.splice(idx, 1);

  // Call the disconnect handler (simulates reconnection timeout)
  room["onPlayerDisconnectedDuringGame"](player);
}

/**
 * Simulate disconnect without calling onPlayerDisconnectedDuringGame
 * (player still in reconnection window).
 */
function simulateTemporaryDisconnect(room: any, client: MockClient): void {
  const player = room.state.players.get(client.sessionId);
  if (!player) throw new Error(`Player not found: ${client.sessionId}`);
  player.isConnected = false;

  // Remove from clients array
  const idx = room.clients.findIndex((c: MockClient) => c.sessionId === client.sessionId);
  if (idx >= 0) room.clients.splice(idx, 1);
}

function simulateReconnect(room: any, client: MockClient): void {
  const player = room.state.players.get(client.sessionId);
  if (!player) throw new Error(`Player not found: ${client.sessionId}`);
  player.isConnected = true;
  room.clients.push(client);
  client.sends = [];
  room["onPlayerReconnected"](client, player);
}

async function setup8pGame(code = "SP8D"): Promise<{ room: any; clients: MockClient[] }> {
  const room = await createRoom(code);
  const clients: MockClient[] = [];
  for (let i = 0; i < 8; i++) {
    const c = makeMockClient(`8d-${code}-p${i}`);
    clients.push(c);
    await joinRoom(room, c, `Player${i}`);
  }

  sendMsg(room, clients[0], "START_GAME");
  advanceClock(room, 5000); // past role reveal -> DISCUSSION
  return { room, clients };
}

// ─── Tests ──────────────────────────────────────────────────

describe("Adversarial: 8-player Spy with disconnect mid-round", () => {
  it("ADV-DC-01: spy disconnects during DISCUSSION -> hunters win immediately", async () => {
    const { room, clients } = await setup8pGame("DC1");
    expect(getState(room).phase).toBe("DISCUSSION");

    const spy = findSpy(room);
    expect(spy).not.toBeNull();

    // Spy disconnects (reconnection timeout expires)
    simulateDisconnectAndTimeout(room, spy!.client);

    // Hunters should win with reason "spy_disconnected"
    expect(getState(room).phase).toBe("GAME_OVER");
    expect(getState(room).winner).toBe("hunters");
    expect(getState(room).winReason).toBe("spy_disconnected");
  });

  it("ADV-DC-02: non-spy disconnects during DISCUSSION -> game continues with 7", async () => {
    const { room, clients } = await setup8pGame("DC2");
    expect(getState(room).phase).toBe("DISCUSSION");

    const nonSpies = findNonSpies(room);
    expect(nonSpies.length).toBe(7); // 8 players, 1 spy

    // A non-spy disconnects
    const disconnecting = nonSpies[0];
    simulateTemporaryDisconnect(room, disconnecting.client);

    // Game should still be in DISCUSSION (not ended)
    expect(getState(room).phase).toBe("DISCUSSION");

    // Should have 7 connected players now
    const connectedCount = getPlayers(room).filter((p) => p.isConnected).length;
    expect(connectedCount).toBe(7);

    // Spy should still exist
    const spy = findSpy(room);
    expect(spy).not.toBeNull();
  });

  it("ADV-DC-03: accusation after disconnect uses correct voter count", async () => {
    const { room, clients } = await setup8pGame("DC3");

    const nonSpies = findNonSpies(room);
    const spy = findSpy(room)!;

    // A non-spy disconnects temporarily
    simulateTemporaryDisconnect(room, nonSpies[0].client);

    // Another non-spy accuses someone (not the disconnected person)
    const accuser = nonSpies[1];
    const accusedTarget = nonSpies[2];
    sendMsg(room, accuser.client, "ACCUSE", { targetPlayerId: accusedTarget.client.sessionId });

    expect(getState(room).phase).toBe("VOTING");
    expect(getState(room).accusedPlayerId).toBe(accusedTarget.client.sessionId);

    // Voter count should be alive connected players minus the accused
    const aliveConnected = getPlayers(room).filter(
      (p) => p.isAlive && p.isConnected && p.id !== accusedTarget.client.sessionId,
    );
    expect(getState(room).totalVotersExpected).toBe(aliveConnected.length);
  });

  it("ADV-DC-04: reconnected non-spy receives ROLE_DATA", async () => {
    const { room, clients } = await setup8pGame("DC4");

    const nonSpies = findNonSpies(room);
    const disconnectingClient = nonSpies[0].client;

    // Record their role before disconnect
    const playerBefore = getState(room).players.get(disconnectingClient.sessionId) as SpyPlayer;
    const roleBefore = playerBefore.role;
    expect(roleBefore.length).toBeGreaterThan(0);

    // Disconnect and reconnect
    simulateTemporaryDisconnect(room, disconnectingClient);
    simulateReconnect(room, disconnectingClient);

    // Should receive ROLE_DATA on reconnect
    const roleData = disconnectingClient.sends.find((s) => s.type === "ROLE_DATA");
    expect(roleData).toBeDefined();
    expect(roleData!.msg.isSpy).toBe(false);
    expect(roleData!.msg.location).not.toBeNull();
    expect(roleData!.msg.role).toBe(roleBefore);
  });

  it("ADV-DC-05: reconnected spy receives spy ROLE_DATA (no location leak)", async () => {
    const { room, clients } = await setup8pGame("DC5");

    const spy = findSpy(room)!;

    simulateTemporaryDisconnect(room, spy.client);
    simulateReconnect(room, spy.client);

    // Spy should get spy ROLE_DATA
    const roleData = spy.client.sends.find((s) => s.type === "ROLE_DATA");
    expect(roleData).toBeDefined();
    expect(roleData!.msg.isSpy).toBe(true);
    expect(roleData!.msg.location).toBeNull(); // No location leak
    expect(roleData!.msg.role).toBeNull();
  });

  it("ADV-DC-06: multiple sequential disconnects don't crash the game", async () => {
    const { room, clients } = await setup8pGame("DC6");

    const nonSpies = findNonSpies(room);
    // Disconnect 3 non-spy players in rapid succession
    simulateTemporaryDisconnect(room, nonSpies[0].client);
    simulateTemporaryDisconnect(room, nonSpies[1].client);
    simulateTemporaryDisconnect(room, nonSpies[2].client);

    // Game should still be in DISCUSSION (spy still connected, game not over)
    expect(getState(room).phase).toBe("DISCUSSION");

    // 5 connected players remain
    const connected = getPlayers(room).filter((p) => p.isConnected);
    expect(connected.length).toBe(5);

    // Timer should still be ticking
    const timerBefore = getState(room).timer;
    advanceClock(room, 3000);
    expect(getState(room).timer).toBe(timerBefore - 3);
  });

  it("ADV-DC-07: disconnect during VOTING phase - vote resolves with partial votes on timeout", async () => {
    const { room, clients } = await setup8pGame("DC7");

    // Start an accusation
    const nonSpies = findNonSpies(room);
    const spy = findSpy(room)!;
    const target = nonSpies[0];
    const accuser = nonSpies[1];

    sendMsg(room, accuser.client, "ACCUSE", { targetPlayerId: target.client.sessionId });
    expect(getState(room).phase).toBe("VOTING");

    // A voter disconnects before voting
    const disconnectingVoter = nonSpies[2];
    simulateTemporaryDisconnect(room, disconnectingVoter.client);

    // Some remaining voters vote
    sendMsg(room, accuser.client, "VOTE", { vote: "guilty" });
    sendMsg(room, spy.client, "VOTE", { vote: "guilty" });

    // Vote timeout should still resolve with partial results
    advanceClock(room, 30000);

    // Game should have resolved the vote (back to discussion or game over)
    const phase = getState(room).phase;
    expect(["DISCUSSION", "GAME_OVER"]).toContain(phase);
  });

  it("ADV-DC-08: all non-spy players disconnect -> spy wins (by survival, timer expires)", async () => {
    const { room, clients } = await setup8pGame("DC8");

    const spy = findSpy(room)!;
    const nonSpies = findNonSpies(room);

    // Disconnect ALL non-spies (temporary - still in reconnection window)
    for (const ns of nonSpies) {
      simulateTemporaryDisconnect(room, ns.client);
    }

    // Game continues (players are still in state, just disconnected)
    // Timer keeps ticking
    expect(getState(room).phase).toBe("DISCUSSION");

    // Advance timer to expiry
    const remainingTime = getState(room).timer;
    advanceClock(room, remainingTime * 1000);

    // Should enter SPY_GUESS phase
    expect(getState(room).phase).toBe("SPY_GUESS");

    // Spy guess timeout -> spy wins
    advanceClock(room, 30000);
    expect(getState(room).phase).toBe("GAME_OVER");
    expect(getState(room).winner).toBe("spy");
    expect(getState(room).winReason).toBe("time_expired");
  });
});
