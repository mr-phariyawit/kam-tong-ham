/**
 * Sprint 15 -- KTH-T-095: Reconnect resilience test suite
 *
 * Tests disconnect mid-game -> reconnect for all 6 games.
 * Verifies:
 *   1. Player state is correctly restored after reconnect
 *   2. Player receives necessary game data to continue playing
 *   3. No information leaks (cross-validates with sprint-8 audit)
 *   4. Game continues normally after reconnect (not stuck/crashed)
 *
 * Unlike reconnect-audit.test.ts (Sprint 8) which ONLY tests leak prevention,
 * these tests verify the POSITIVE path: reconnected player can resume play.
 */
import { describe, it, expect } from "vitest";
import { matchMaker, LocalDriver, LocalPresence } from "@colyseus/core";
import { KhamTongHamRoom } from "../rooms/KhamTongHamRoom";
import { SpyRoom } from "../rooms/SpyRoom";
import { WerewolfRoom } from "../rooms/WerewolfRoom";
import { KnightsRoom } from "../rooms/KnightsRoom";
import { WordLinkRoom } from "../rooms/WordLinkRoom";
import { DrawGuessRoom } from "../rooms/DrawGuessRoom";
import { SpyPlayer } from "../schemas/SpyState";
import { WerewolfPlayer } from "../schemas/WerewolfState";
import { KnightsPlayer } from "../schemas/KnightsState";
import { WordLinkPlayer } from "../schemas/WordLinkState";
import { DrawGuessPlayer } from "../schemas/DrawGuessState";
import { makeMockClient, type MockClient } from "./integration/helpers";

// ─── Setup ──────────────────────────────────────────────────

let setupDone = false;

async function setup() {
  if (!setupDone) {
    await matchMaker.setup(new LocalPresence(), new LocalDriver());
    matchMaker.defineRoomType("kth_res", KhamTongHamRoom);
    matchMaker.defineRoomType("spy_res", SpyRoom);
    matchMaker.defineRoomType("ww_res", WerewolfRoom);
    matchMaker.defineRoomType("kn_res", KnightsRoom);
    matchMaker.defineRoomType("wl_res", WordLinkRoom);
    matchMaker.defineRoomType("dg_res", DrawGuessRoom);
    setupDone = true;
  }
}

async function createRoom(type: string, code: string) {
  await setup();
  const listing = await matchMaker.createRoom(type, { roomCode: code, gameType: type });
  return matchMaker.getRoomById(listing.roomId) as any;
}

async function joinRoom(room: any, client: MockClient, nick: string) {
  await (room as any)["_reserveSeat"](client.sessionId, { nickname: nick, avatar: "T" }, undefined);
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

/**
 * Simulate disconnect + reconnect for a player mid-game.
 * 1. Marks player disconnected (onPlayerReconnected is called by BaseRoom)
 * 2. Clears sends to isolate reconnect messages
 * 3. Calls onPlayerReconnected (simulates what BaseRoom does after allowReconnection resolves)
 * Returns the messages sent to the reconnected client.
 */
function simulateDisconnectReconnect(room: any, client: MockClient): Array<{ type: string; msg: any }> {
  const player = room.state.players.get(client.sessionId);
  if (!player) throw new Error(`Player not found: ${client.sessionId}`);

  // Step 1: Mark disconnected (what BaseRoom.onLeave does before allowReconnection)
  player.isConnected = false;

  // Step 2: Clear sends to isolate reconnect messages
  client.sends = [];

  // Step 3: Simulate successful reconnection
  player.isConnected = true;

  // Step 4: Call onPlayerReconnected (the hook each room implements)
  room["onPlayerReconnected"](client, player);

  return client.sends;
}

// ═══════════════════════════════════════════════════════════════
// 1. Forbidden Word (คำต้องห้าม)
// ═══════════════════════════════════════════════════════════════

describe("Reconnect Resilience: KhamTongHam", () => {
  it("reconnecting player receives their word and can continue playing", async () => {
    const room = await createRoom("kth_res", "RES1");
    const c1 = makeMockClient("res-kth-p1");
    const c2 = makeMockClient("res-kth-p2");
    const c3 = makeMockClient("res-kth-p3");

    await joinRoom(room, c1, "Alice");
    await joinRoom(room, c2, "Bob");
    await joinRoom(room, c3, "Carol");

    sendMsg(room, c1, "START_GAME");
    advanceClock(room, 4000); // Past countdown into PLAYING
    expect(room.state.phase).toBe("PLAYING");

    // Get Bob's word before disconnect
    const roundWords: Map<string, string> = (room as any).roundWords;
    const bobWord = roundWords.get(c2.sessionId)!;
    expect(bobWord).toBeTruthy();

    // Disconnect Bob and reconnect
    const sends = simulateDisconnectReconnect(room, c2);

    // Bob should receive their own word
    const wordMsg = sends.find((s) => s.type === "YOUR_WORD");
    expect(wordMsg).toBeDefined();
    expect(wordMsg!.msg.word).toBe(bobWord);

    // Game should still be in PLAYING phase (not crashed)
    expect(room.state.phase).toBe("PLAYING");

    // Bob should still be alive (not penalized for brief disconnect)
    const bobPlayer = room.state.players.get(c2.sessionId);
    expect(bobPlayer.isConnected).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. Spy (สายลับ)
// ═══════════════════════════════════════════════════════════════

describe("Reconnect Resilience: Spy", () => {
  it("non-spy reconnects mid-discussion and receives correct role + location", async () => {
    const room = await createRoom("spy_res", "RES2");
    const clients: MockClient[] = [];
    for (let i = 0; i < 4; i++) {
      clients.push(makeMockClient(`res-spy-p${i}`));
      await joinRoom(room, clients[i], `Player${i}`);
    }

    sendMsg(room, clients[0], "START_GAME");
    advanceClock(room, 6000); // Past ROLE_REVEAL into DISCUSSION
    expect(room.state.phase).toBe("DISCUSSION");

    // Find a non-spy
    const players: SpyPlayer[] = [];
    room.state.players.forEach((p: SpyPlayer) => players.push(p));
    const nonSpy = players.find((p) => !p.isSpy)!;
    const nonSpyClient = clients.find((c) => c.sessionId === nonSpy.id)!;

    // Get their role before disconnect
    const originalRole = (room as any).playerRoles.get(nonSpy.id);
    expect(originalRole).toBeTruthy();

    // Disconnect and reconnect
    const sends = simulateDisconnectReconnect(room, nonSpyClient);

    // Should receive ROLE_DATA with correct info
    const roleMsg = sends.find((s) => s.type === "ROLE_DATA");
    expect(roleMsg).toBeDefined();
    expect(roleMsg!.msg.isSpy).toBe(false);
    expect(roleMsg!.msg.location).not.toBeNull();
    expect(roleMsg!.msg.role).toBe(originalRole);

    // Game still in DISCUSSION
    expect(room.state.phase).toBe("DISCUSSION");
    expect(room.state.players.get(nonSpyClient.sessionId).isConnected).toBe(true);

    // NO leak of spy identity
    sends.forEach((s) => {
      if (s.msg && typeof s.msg === "object") {
        expect(s.msg.spyId).toBeUndefined();
      }
    });
  });

  it("spy reconnects mid-discussion and receives spy role (no location)", async () => {
    const room = await createRoom("spy_res", "RES3");
    const clients: MockClient[] = [];
    for (let i = 0; i < 4; i++) {
      clients.push(makeMockClient(`res-spy2-p${i}`));
      await joinRoom(room, clients[i], `Player${i}`);
    }

    sendMsg(room, clients[0], "START_GAME");
    advanceClock(room, 6000);

    // Find the spy
    const spySessionId: string = (room as any).spySessionId;
    const spyClient = clients.find((c) => c.sessionId === spySessionId)!;

    // Disconnect and reconnect
    const sends = simulateDisconnectReconnect(room, spyClient);

    const roleMsg = sends.find((s) => s.type === "ROLE_DATA");
    expect(roleMsg).toBeDefined();
    expect(roleMsg!.msg.isSpy).toBe(true);
    expect(roleMsg!.msg.location).toBeNull();
    expect(roleMsg!.msg.role).toBeNull();

    // Game continues
    expect(room.state.phase).toBe("DISCUSSION");
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. Werewolf (หมาป่า)
// ═══════════════════════════════════════════════════════════════

describe("Reconnect Resilience: Werewolf", () => {
  it("wolf reconnects during NIGHT and receives role + other wolves", async () => {
    const room = await createRoom("ww_res", "RES4");
    const clients: MockClient[] = [];
    for (let i = 0; i < 6; i++) {
      clients.push(makeMockClient(`res-ww-p${i}`));
      await joinRoom(room, clients[i], `Player${i}`);
    }

    sendMsg(room, clients[0], "START_GAME");
    advanceClock(room, 5000); // Past ROLE_REVEAL into NIGHT
    expect(room.state.phase).toBe("NIGHT");

    const playerRoles: Map<string, string> = (room as any).playerRoles;

    // Find a wolf
    let wolfClient: MockClient | null = null;
    let otherWolfIds: string[] = [];
    playerRoles.forEach((role, id) => {
      if (role === "werewolf") {
        if (!wolfClient) {
          wolfClient = clients.find((c) => c.sessionId === id)!;
        } else {
          otherWolfIds.push(id);
        }
      }
    });
    expect(wolfClient).not.toBeNull();

    // Disconnect and reconnect
    const sends = simulateDisconnectReconnect(room, wolfClient!);

    const roleMsg = sends.find((s) => s.type === "ROLE_DATA");
    expect(roleMsg).toBeDefined();
    expect(roleMsg!.msg.isWerewolf).toBe(true);
    expect(roleMsg!.msg.otherWolves).toBeDefined();

    // Other wolves should be listed (not including self)
    if (otherWolfIds.length > 0) {
      expect(roleMsg!.msg.otherWolves.length).toBeGreaterThan(0);
      const selfInOthers = roleMsg!.msg.otherWolves.find(
        (w: any) => w.id === wolfClient!.sessionId,
      );
      expect(selfInOthers).toBeUndefined();
    }

    // Game still in NIGHT
    expect(room.state.phase).toBe("NIGHT");
    expect(room.state.players.get(wolfClient!.sessionId).isConnected).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. Knights (อัศวิน)
// ═══════════════════════════════════════════════════════════════

describe("Reconnect Resilience: Knights", () => {
  it("player reconnects during TEAM_PROPOSAL and receives role + phase context", async () => {
    const room = await createRoom("kn_res", "RES5");
    const clients: MockClient[] = [];
    for (let i = 0; i < 5; i++) {
      clients.push(makeMockClient(`res-kn-p${i}`));
      await joinRoom(room, clients[i], `Player${i}`);
    }

    sendMsg(room, clients[0], "START_GAME");
    advanceClock(room, 8000); // Past ROLE_REVEAL into TEAM_PROPOSAL
    expect(room.state.phase).toBe("TEAM_PROPOSAL");

    // Pick a non-leader player to disconnect
    const leaderId = room.state.currentLeaderId;
    const nonLeaderClient = clients.find((c) => c.sessionId !== leaderId)!;
    const nonLeaderRole = (room as any).playerRoles.get(nonLeaderClient.sessionId);

    // Disconnect and reconnect
    const sends = simulateDisconnectReconnect(room, nonLeaderClient);

    // Should receive ROLE_DATA
    const roleMsg = sends.find((s) => s.type === "ROLE_DATA");
    expect(roleMsg).toBeDefined();
    expect(roleMsg!.msg.role).toBe(nonLeaderRole);

    // Should receive PHASE_CONTEXT
    const phaseMsg = sends.find((s) => s.type === "PHASE_CONTEXT");
    expect(phaseMsg).toBeDefined();
    expect(phaseMsg!.msg.phase).toBe("TEAM_PROPOSAL");
    expect(phaseMsg!.msg.currentMission).toBeDefined();
    expect(phaseMsg!.msg.currentLeaderId).toBe(leaderId);

    // No leak of other players' votes
    expect(phaseMsg!.msg.otherVotes).toBeUndefined();
    expect(phaseMsg!.msg.missionVotes).toBeUndefined();

    // Game continues
    expect(room.state.phase).toBe("TEAM_PROPOSAL");
    expect(room.state.players.get(nonLeaderClient.sessionId).isConnected).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. Word Link (คำเชื่อม)
// ═══════════════════════════════════════════════════════════════

describe("Reconnect Resilience: WordLink", () => {
  it("spymaster reconnects and receives color key to continue giving clues", async () => {
    const room = await createRoom("wl_res", "RES6");
    const clients: MockClient[] = [];
    for (let i = 0; i < 4; i++) {
      clients.push(makeMockClient(`res-wl-p${i}`));
      await joinRoom(room, clients[i], `Player${i}`);
    }

    sendMsg(room, clients[0], "START_GAME");
    advanceClock(room, 6000); // Past TEAM_REVEAL

    const phase = room.state.phase;
    expect(["CLUE_GIVING", "GUESSING"].includes(phase)).toBe(true);

    // Find a spymaster
    let spymasterClient: MockClient | null = null;
    room.state.players.forEach((p: WordLinkPlayer) => {
      if (p.role === "spymaster" && !spymasterClient) {
        spymasterClient = clients.find((c) => c.sessionId === p.id)!;
      }
    });
    expect(spymasterClient).not.toBeNull();

    // Disconnect and reconnect
    const sends = simulateDisconnectReconnect(room, spymasterClient!);

    // Spymaster should receive COLOR_KEY
    const colorKeyMsg = sends.find((s) => s.type === "COLOR_KEY");
    expect(colorKeyMsg).toBeDefined();
    expect(colorKeyMsg!.msg.cards).toBeDefined();
    expect(colorKeyMsg!.msg.cards.length).toBe(25);

    // Game still active
    expect(["CLUE_GIVING", "GUESSING"].includes(room.state.phase)).toBe(true);
    expect(room.state.players.get(spymasterClient!.sessionId).isConnected).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. Draw & Guess (วาดทาย)
// ═══════════════════════════════════════════════════════════════

describe("Reconnect Resilience: DrawGuess", () => {
  it("non-drawer reconnects during DRAWING and receives phase context + stroke snapshot (no word)", async () => {
    const room = await createRoom("dg_res", "RES7");
    const clients: MockClient[] = [];
    for (let i = 0; i < 3; i++) {
      clients.push(makeMockClient(`res-dg-p${i}`));
      await joinRoom(room, clients[i], `Player${i}`);
    }

    sendMsg(room, clients[0], "START_GAME");
    advanceClock(room, 4000); // Into DRAWING
    expect(room.state.phase).toBe("DRAWING");

    const drawerId: string = room.state.currentDrawerId;
    const currentWord: string = (room as any).currentWord;
    expect(currentWord).toBeTruthy();

    // Find a non-drawer
    const nonDrawerClient = clients.find((c) => c.sessionId !== drawerId)!;

    // Disconnect and reconnect
    const sends = simulateDisconnectReconnect(room, nonDrawerClient);

    // Should receive PHASE_CONTEXT
    const phaseMsg = sends.find((s) => s.type === "PHASE_CONTEXT");
    expect(phaseMsg).toBeDefined();
    expect(phaseMsg!.msg.phase).toBe("DRAWING");
    expect(phaseMsg!.msg.currentDrawerId).toBe(drawerId);

    // Should receive STROKE_SNAPSHOT
    const snapshotMsg = sends.find((s) => s.type === "STROKE_SNAPSHOT");
    expect(snapshotMsg).toBeDefined();

    // Must NOT receive the drawing word
    const wordMsg = sends.find((s) => s.type === "DRAW_WORD");
    expect(wordMsg).toBeUndefined();

    // No word leaked in phase context
    expect(phaseMsg!.msg.word).toBeUndefined();
    expect(phaseMsg!.msg.currentWord).toBeUndefined();

    // Game continues
    expect(room.state.phase).toBe("DRAWING");
    expect(room.state.players.get(nonDrawerClient.sessionId).isConnected).toBe(true);
  });
});
