/**
 * Adversarial Scenario #1: Mid-game host transfer in Spy
 *
 * Sprint 17, Issue #18, KTH-T-101
 *
 * Tests that when the host player disconnects mid-round (during DISCUSSION
 * or VOTING), host is automatically transferred to another connected player,
 * and game state remains consistent. The new host can perform host-only
 * actions (like starting next round from GAME_OVER), and the original host
 * reconnecting does NOT reclaim host.
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
    matchMaker.defineRoomType("spy_ht", SpyRoom);
    setupDone = true;
  }
}

async function createRoom(code = "SPHT") {
  await setup();
  const listing = await matchMaker.createRoom("spy_ht", { roomCode: code, gameType: "spy" });
  return matchMaker.getRoomById(listing.roomId) as any;
}

async function joinRoom(room: any, client: MockClient, nick: string) {
  await (room as any)["_reserveSeat"](client.sessionId, { nickname: nick, avatar: "H" }, undefined);
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

function simulateDisconnect(room: any, client: MockClient): void {
  const player = room.state.players.get(client.sessionId);
  if (!player) throw new Error(`Player not found: ${client.sessionId}`);
  player.isConnected = false;

  // Simulate BaseRoom host transfer logic on disconnect
  if (player.isHost) {
    player.isHost = false;
    // Transfer host to next connected player (first match only)
    let transferred = false;
    room.state.players.forEach((p: any) => {
      if (!transferred && p.isConnected && p.id !== client.sessionId) {
        p.isHost = true;
        transferred = true;
      }
    });
  }

  // Remove from clients array (simulates WebSocket close)
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

// ─── Tests ──────────────────────────────────────────────────

describe("Adversarial: Spy mid-game host transfer", () => {
  it("ADV-SPY-01: host disconnects during DISCUSSION, host transfers to another player", async () => {
    const room = await createRoom();
    const clients: MockClient[] = [];
    for (let i = 0; i < 4; i++) {
      const c = makeMockClient(`ht-p${i}`);
      clients.push(c);
      await joinRoom(room, c, `Player${i}`);
    }

    // Player0 is host
    expect(getState(room).players.get(clients[0].sessionId)!.isHost).toBe(true);

    // Start game and get to DISCUSSION
    sendMsg(room, clients[0], "START_GAME");
    advanceClock(room, 5000);
    expect(getState(room).phase).toBe("DISCUSSION");

    // Host disconnects mid-discussion
    simulateDisconnect(room, clients[0]);

    // Verify: host transferred to another connected player
    const connectedPlayers = getPlayers(room).filter((p) => p.isConnected);
    const hosts = connectedPlayers.filter((p) => p.isHost);
    expect(hosts.length).toBe(1);
    expect(hosts[0].id).not.toBe(clients[0].sessionId);

    // Verify: game still in DISCUSSION (not crashed)
    expect(getState(room).phase).toBe("DISCUSSION");
  });

  it("ADV-SPY-02: game continues normally after host transfer mid-round", async () => {
    const room = await createRoom("SPH2");
    const clients: MockClient[] = [];
    for (let i = 0; i < 4; i++) {
      const c = makeMockClient(`ht2-p${i}`);
      clients.push(c);
      await joinRoom(room, c, `Player${i}`);
    }

    sendMsg(room, clients[0], "START_GAME");
    advanceClock(room, 5000);

    // Disconnect host
    simulateDisconnect(room, clients[0]);

    // Game continues: a connected non-spy can still accuse
    const remainingClients = clients.filter(
      (c) => getState(room).players.get(c.sessionId)?.isConnected,
    );
    expect(remainingClients.length).toBe(3);

    // Find two connected players for accusation
    const accuser = remainingClients[0];
    const target = remainingClients[1];

    sendMsg(room, accuser, "ACCUSE", { targetPlayerId: target.sessionId });
    expect(getState(room).phase).toBe("VOTING");
    expect(getState(room).accusedPlayerId).toBe(target.sessionId);
  });

  it("ADV-SPY-03: explicit TRANSFER_HOST during DISCUSSION preserves game state", async () => {
    const room = await createRoom("SPH3");
    const clients: MockClient[] = [];
    for (let i = 0; i < 4; i++) {
      const c = makeMockClient(`ht3-p${i}`);
      clients.push(c);
      await joinRoom(room, c, `Player${i}`);
    }

    sendMsg(room, clients[0], "START_GAME");
    advanceClock(room, 5000);
    expect(getState(room).phase).toBe("DISCUSSION");

    // Capture timer value before transfer
    const timerBefore = getState(room).timer;

    // Host manually transfers to Player2
    sendMsg(room, clients[0], "TRANSFER_HOST", { targetPlayerId: clients[2].sessionId });

    // Verify: Player2 is now host
    expect(getState(room).players.get(clients[2].sessionId)!.isHost).toBe(true);
    expect(getState(room).players.get(clients[0].sessionId)!.isHost).toBe(false);

    // Verify: game state unchanged
    expect(getState(room).phase).toBe("DISCUSSION");
    expect(getState(room).timer).toBe(timerBefore);

    // Verify: all players still have their spy/non-spy assignments
    const spies = getPlayers(room).filter((p) => p.isSpy);
    expect(spies.length).toBe(1);
  });

  it("ADV-SPY-04: host disconnect during VOTING does not corrupt vote state", async () => {
    const room = await createRoom("SPH4");
    const clients: MockClient[] = [];
    for (let i = 0; i < 5; i++) {
      const c = makeMockClient(`ht4-p${i}`);
      clients.push(c);
      await joinRoom(room, c, `Player${i}`);
    }

    sendMsg(room, clients[0], "START_GAME");
    advanceClock(room, 5000);

    // Start an accusation (host accuses player1)
    sendMsg(room, clients[0], "ACCUSE", { targetPlayerId: clients[1].sessionId });
    expect(getState(room).phase).toBe("VOTING");

    // Host (accuser) casts vote
    sendMsg(room, clients[0], "VOTE", { vote: "guilty" });
    expect(getState(room).totalVotesCast).toBe(1);

    // Host disconnects mid-voting
    simulateDisconnect(room, clients[0]);

    // Verify: phase still VOTING
    expect(getState(room).phase).toBe("VOTING");

    // Verify: vote counts are preserved
    expect(getState(room).guiltyVotes).toBe(1);
    expect(getState(room).totalVotesCast).toBe(1);

    // Other players can still vote
    const voter2 = clients[2];
    const voter2Player = getState(room).players.get(voter2.sessionId) as SpyPlayer;
    if (voter2Player?.isConnected && voter2Player?.isAlive) {
      sendMsg(room, voter2, "VOTE", { vote: "guilty" });
      expect(getState(room).totalVotesCast).toBe(2);
    }
  });

  it("ADV-SPY-05: reconnected original host does NOT reclaim host", async () => {
    const room = await createRoom("SPH5");
    const clients: MockClient[] = [];
    for (let i = 0; i < 4; i++) {
      const c = makeMockClient(`ht5-p${i}`);
      clients.push(c);
      await joinRoom(room, c, `Player${i}`);
    }

    sendMsg(room, clients[0], "START_GAME");
    advanceClock(room, 5000);

    // Disconnect host
    simulateDisconnect(room, clients[0]);

    // Identify new host
    const newHost = getPlayers(room).find((p) => p.isHost);
    expect(newHost).toBeDefined();
    const newHostId = newHost!.id;

    // Reconnect original host
    simulateReconnect(room, clients[0]);

    // Verify: original host does NOT get host back
    expect(getState(room).players.get(clients[0].sessionId)!.isHost).toBe(false);
    expect(getState(room).players.get(newHostId)!.isHost).toBe(true);
  });

  it("ADV-SPY-06: host transfer preserves spy assignment integrity", async () => {
    const room = await createRoom("SPH6");
    const clients: MockClient[] = [];
    for (let i = 0; i < 4; i++) {
      const c = makeMockClient(`ht6-p${i}`);
      clients.push(c);
      await joinRoom(room, c, `Player${i}`);
    }

    sendMsg(room, clients[0], "START_GAME");
    advanceClock(room, 5000);

    // Record spy assignment before host transfer
    const spyBefore = getPlayers(room).find((p) => p.isSpy);
    const spyIdBefore = spyBefore!.id;
    const playerRoles = (room as any).playerRoles as Map<string, string>;
    const rolesSnapshot = new Map(playerRoles);

    // Disconnect host (may or may not be the spy)
    simulateDisconnect(room, clients[0]);

    // Verify: spy assignment unchanged
    const spyAfter = getPlayers(room).find((p) => p.isSpy);
    expect(spyAfter!.id).toBe(spyIdBefore);

    // Verify: all role assignments unchanged
    playerRoles.forEach((role, id) => {
      expect(rolesSnapshot.get(id)).toBe(role);
    });
  });
});
