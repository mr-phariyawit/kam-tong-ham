/**
 * Sprint 8 -- Cross-game reconnect-leak audit.
 *
 * Negative tests verifying that reconnecting players NEVER receive
 * private state belonging to other players. Covers all 6 games:
 *   1. KhamTongHam (Forbidden Word) -- other players' secret words
 *   2. Spy -- spy identity, other players' roles
 *   3. Werewolf -- other players' roles, wolf list (for non-wolves)
 *   4. Knights -- other players' roles, evil team list (for good)
 *   5. WordLink -- color key (for guessers)
 *   6. DrawGuess -- current word (for non-drawers)
 *
 * Each test:
 *   - Sets up a game with multiple players
 *   - Starts the game (roles/words assigned)
 *   - Simulates a player disconnect + reconnect
 *   - Inspects the private messages sent to the reconnecting client
 *   - Asserts NO forbidden data is present
 */
import { describe, it, expect, beforeEach } from "vitest";
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
    matchMaker.defineRoomType("kth_audit", KhamTongHamRoom);
    matchMaker.defineRoomType("spy_audit", SpyRoom);
    matchMaker.defineRoomType("ww_audit", WerewolfRoom);
    matchMaker.defineRoomType("kn_audit", KnightsRoom);
    matchMaker.defineRoomType("wl_audit", WordLinkRoom);
    matchMaker.defineRoomType("dg_audit", DrawGuessRoom);
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
 * Simulate disconnect + reconnect for a player.
 * Returns the fresh sends array after reconnection.
 */
function simulateReconnect(room: any, client: MockClient): Array<{ type: string; msg: any }> {
  // Clear sends to isolate reconnect messages
  client.sends = [];

  // Get the player
  const player = room.state.players.get(client.sessionId);
  if (!player) throw new Error(`Player not found: ${client.sessionId}`);

  // Call the onPlayerReconnected hook directly (simulates what BaseRoom does)
  room["onPlayerReconnected"](client, player);

  return client.sends;
}

// ─── KhamTongHam (Forbidden Word) ──────────────────────────

describe("Reconnect Audit: KhamTongHam", () => {
  it("reconnecting player receives only their OWN word, never others", async () => {
    const room = await createRoom("kth_audit", "KTH1");
    const c1 = makeMockClient("kth-p1");
    const c2 = makeMockClient("kth-p2");
    const c3 = makeMockClient("kth-p3");

    await joinRoom(room, c1, "Alice");
    await joinRoom(room, c2, "Bob");
    await joinRoom(room, c3, "Carol");

    // Start game
    sendMsg(room, c1, "START_GAME");
    // Advance past countdown
    advanceClock(room, 4000);

    // Get the server-side words
    const roundWords: Map<string, string> = (room as any).roundWords;
    const p1Word = roundWords.get(c1.sessionId)!;
    const p2Word = roundWords.get(c2.sessionId)!;
    const p3Word = roundWords.get(c3.sessionId)!;

    // Simulate reconnect for player 2
    const reconnectSends = simulateReconnect(room, c2);

    // Player 2 should receive their own word
    const wordMsg = reconnectSends.find((s) => s.type === "YOUR_WORD");
    expect(wordMsg).toBeDefined();
    expect(wordMsg!.msg.word).toBe(p2Word);

    // Player 2 must NOT receive player 1's or player 3's words
    reconnectSends.forEach((s) => {
      if (s.type === "YOUR_WORD") {
        expect(s.msg.word).not.toBe(p1Word);
        expect(s.msg.word).not.toBe(p3Word);
      }
    });
    // No "ALL_WORDS" or similar leak message
    expect(reconnectSends.filter((s) => s.type === "ALL_WORDS").length).toBe(0);
  });
});

// ─── Spy ────────────────────────────────────────────────────

describe("Reconnect Audit: Spy", () => {
  it("spy reconnect does NOT reveal spy identity to other players", async () => {
    const room = await createRoom("spy_audit", "SPY1");
    const clients: MockClient[] = [];
    for (let i = 0; i < 4; i++) {
      const c = makeMockClient(`spy-p${i}`);
      await joinRoom(room, c, `Player${i}`);
      clients.push(c);
    }

    // Start game
    sendMsg(room, clients[0], "START_GAME");
    advanceClock(room, 6000); // past ROLE_REVEAL

    // Find the spy
    const players: SpyPlayer[] = [];
    room.state.players.forEach((p: SpyPlayer) => players.push(p));
    const spy = players.find((p) => p.isSpy)!;
    const spyClient = clients.find((c) => c.sessionId === spy.id)!;

    // Find a non-spy
    const nonSpy = players.find((p) => !p.isSpy)!;
    const nonSpyClient = clients.find((c) => c.sessionId === nonSpy.id)!;

    // Reconnect the NON-SPY player
    const nonSpySends = simulateReconnect(room, nonSpyClient);

    // Non-spy should receive ROLE_DATA with isSpy: false
    const roleMsg = nonSpySends.find((s) => s.type === "ROLE_DATA");
    expect(roleMsg).toBeDefined();
    expect(roleMsg!.msg.isSpy).toBe(false);
    expect(roleMsg!.msg.location).not.toBeNull();
    expect(roleMsg!.msg.role).toBeTruthy();

    // Non-spy must NOT receive any message revealing who the spy is
    nonSpySends.forEach((s) => {
      // No message should contain the spy's session ID as "spyId"
      if (s.msg && typeof s.msg === "object") {
        expect(s.msg.spyId).toBeUndefined();
        expect(s.msg.spySessionId).toBeUndefined();
      }
    });
  });

  it("spy reconnect receives spy role data (isSpy: true, no location)", async () => {
    const room = await createRoom("spy_audit", "SPY2");
    const clients: MockClient[] = [];
    for (let i = 0; i < 4; i++) {
      const c = makeMockClient(`spy2-p${i}`);
      await joinRoom(room, c, `Player${i}`);
      clients.push(c);
    }

    sendMsg(room, clients[0], "START_GAME");
    advanceClock(room, 6000);

    // Find the spy
    const players: SpyPlayer[] = [];
    room.state.players.forEach((p: SpyPlayer) => players.push(p));
    const spy = players.find((p) => p.isSpy)!;
    const spyClient = clients.find((c) => c.sessionId === spy.id)!;

    // Reconnect the spy
    const spySends = simulateReconnect(room, spyClient);

    // Spy should receive ROLE_DATA with isSpy: true and no location
    const roleMsg = spySends.find((s) => s.type === "ROLE_DATA");
    expect(roleMsg).toBeDefined();
    expect(roleMsg!.msg.isSpy).toBe(true);
    expect(roleMsg!.msg.location).toBeNull();
    expect(roleMsg!.msg.role).toBeNull();
  });

  it("spy identity is NOT leaked via synced state (isSpy field unsynced)", async () => {
    const room = await createRoom("spy_audit", "SPY3");
    const clients: MockClient[] = [];
    for (let i = 0; i < 3; i++) {
      const c = makeMockClient(`spy3-p${i}`);
      await joinRoom(room, c, `Player${i}`);
      clients.push(c);
    }

    sendMsg(room, clients[0], "START_GAME");
    advanceClock(room, 6000);

    // Verify: the isSpy field does NOT have @type decorator
    // (This is a structural test -- if isSpy were @type decorated, it would
    //  appear in the schema's _definition. Without @type, it's a plain JS prop.)
    const playerSchema = room.state.players.get(clients[0].sessionId);
    const schemaDef = (playerSchema as any).constructor._definition;

    // isSpy should NOT be in the schema definition (no @type)
    // The schema definition has numeric field indices. Check descriptors.
    const fieldNames: string[] = [];
    if (schemaDef && schemaDef.descriptors) {
      for (const key of Object.keys(schemaDef.descriptors)) {
        fieldNames.push(key);
      }
    }
    // isSpy and role must NOT be in the synced field descriptors
    expect(fieldNames).not.toContain("isSpy");
    expect(fieldNames).not.toContain("role");
  });
});

// ─── Werewolf ──────────────────────────────────────────────

describe("Reconnect Audit: Werewolf", () => {
  it("villager reconnect does NOT receive wolf list", async () => {
    const room = await createRoom("ww_audit", "WW01");
    const clients: MockClient[] = [];
    for (let i = 0; i < 6; i++) {
      const c = makeMockClient(`ww-p${i}`);
      await joinRoom(room, c, `Player${i}`);
      clients.push(c);
    }

    sendMsg(room, clients[0], "START_GAME");
    advanceClock(room, 6000); // past ROLE_REVEAL

    // Access server-side role map
    const playerRoles: Map<string, string> = (room as any).playerRoles;

    // Find a villager/seer/doctor (non-wolf)
    let villagerClient: MockClient | null = null;
    let wolfIds: string[] = [];
    playerRoles.forEach((role, id) => {
      if (role === "werewolf") {
        wolfIds.push(id);
      } else if (!villagerClient) {
        villagerClient = clients.find((c) => c.sessionId === id)!;
      }
    });

    expect(villagerClient).not.toBeNull();
    expect(wolfIds.length).toBeGreaterThan(0);

    // Reconnect the villager
    const sends = simulateReconnect(room, villagerClient!);

    // Should get ROLE_DATA with their role
    const roleMsg = sends.find((s) => s.type === "ROLE_DATA");
    expect(roleMsg).toBeDefined();
    expect(roleMsg!.msg.isWerewolf).toBe(false);

    // Must NOT contain otherWolves or wolf identity
    expect(roleMsg!.msg.otherWolves).toBeUndefined();

    // No message should reveal wolf IDs to a non-wolf
    sends.forEach((s) => {
      if (s.msg && typeof s.msg === "object") {
        // Wolf IDs should never appear in any reconnect message to a non-wolf
        if (s.msg.wolfIds) {
          expect(s.msg.wolfIds).toBeUndefined();
        }
      }
    });
  });

  it("wolf reconnect receives other wolves' identities", async () => {
    const room = await createRoom("ww_audit", "WW02");
    const clients: MockClient[] = [];
    for (let i = 0; i < 6; i++) {
      const c = makeMockClient(`ww2-p${i}`);
      await joinRoom(room, c, `Player${i}`);
      clients.push(c);
    }

    sendMsg(room, clients[0], "START_GAME");
    advanceClock(room, 6000);

    const playerRoles: Map<string, string> = (room as any).playerRoles;

    // Find a wolf
    let wolfClient: MockClient | null = null;
    playerRoles.forEach((role, id) => {
      if (role === "werewolf" && !wolfClient) {
        wolfClient = clients.find((c) => c.sessionId === id)!;
      }
    });

    expect(wolfClient).not.toBeNull();

    // Reconnect the wolf
    const sends = simulateReconnect(room, wolfClient!);

    const roleMsg = sends.find((s) => s.type === "ROLE_DATA");
    expect(roleMsg).toBeDefined();
    expect(roleMsg!.msg.isWerewolf).toBe(true);
    expect(roleMsg!.msg.otherWolves).toBeDefined();
    // otherWolves should NOT include the reconnecting wolf themselves
    const selfInOthers = roleMsg!.msg.otherWolves.find(
      (w: any) => w.id === wolfClient!.sessionId,
    );
    expect(selfInOthers).toBeUndefined();
  });

  it("seer reconnect does NOT re-receive SEER_RESULT (no peek re-delivery)", async () => {
    const room = await createRoom("ww_audit", "WW03");
    const clients: MockClient[] = [];
    for (let i = 0; i < 6; i++) {
      const c = makeMockClient(`ww3-p${i}`);
      await joinRoom(room, c, `Player${i}`);
      clients.push(c);
    }

    sendMsg(room, clients[0], "START_GAME");
    advanceClock(room, 6000);

    const playerRoles: Map<string, string> = (room as any).playerRoles;

    // Find the seer
    let seerClient: MockClient | null = null;
    playerRoles.forEach((role, id) => {
      if (role === "seer") {
        seerClient = clients.find((c) => c.sessionId === id)!;
      }
    });

    if (seerClient) {
      // Reconnect the seer
      const sends = simulateReconnect(room, seerClient);

      // Per Loki H3: NO seer result re-delivery on reconnect
      const seerResults = sends.filter((s) => s.type === "SEER_RESULT");
      expect(seerResults.length).toBe(0);
    }
  });
});

// ─── Knights ──────────────────────────────────────────────

describe("Reconnect Audit: Knights", () => {
  it("good-knight reconnect does NOT receive evil player list", async () => {
    const room = await createRoom("kn_audit", "KN01");
    const clients: MockClient[] = [];
    for (let i = 0; i < 6; i++) {
      const c = makeMockClient(`kn-p${i}`);
      await joinRoom(room, c, `Player${i}`);
      clients.push(c);
    }

    sendMsg(room, clients[0], "START_GAME");
    advanceClock(room, 9000); // past ROLE_REVEAL

    const playerRoles: Map<string, string> = (room as any).playerRoles;
    const ROLE_TEAM: Record<string, string> = {
      "leader": "good",
      "good-knight": "good",
      "advisor": "good",
      "assassin": "evil",
      "traitor": "evil",
      "double-agent": "evil",
    };

    // Find a good-knight (basic good role with no special knowledge)
    let goodKnightClient: MockClient | null = null;
    playerRoles.forEach((role, id) => {
      if (role === "good-knight" && !goodKnightClient) {
        goodKnightClient = clients.find((c) => c.sessionId === id)!;
      }
    });

    if (goodKnightClient) {
      const sends = simulateReconnect(room, goodKnightClient);

      const roleMsg = sends.find((s) => s.type === "ROLE_DATA");
      expect(roleMsg).toBeDefined();
      expect(roleMsg!.msg.team).toBe("good");

      // Good knight must NOT receive evilPlayers list
      expect(roleMsg!.msg.evilPlayers).toBeUndefined();
      // Must NOT receive leader candidates (that's advisor-only)
      expect(roleMsg!.msg.leaderCandidates).toBeUndefined();
    }
  });

  it("evil player reconnect DOES receive other evil players", async () => {
    const room = await createRoom("kn_audit", "KN02");
    const clients: MockClient[] = [];
    for (let i = 0; i < 6; i++) {
      const c = makeMockClient(`kn2-p${i}`);
      await joinRoom(room, c, `Player${i}`);
      clients.push(c);
    }

    sendMsg(room, clients[0], "START_GAME");
    advanceClock(room, 9000);

    const playerRoles: Map<string, string> = (room as any).playerRoles;
    const ROLE_TEAM: Record<string, string> = {
      "leader": "good",
      "good-knight": "good",
      "advisor": "good",
      "assassin": "evil",
      "traitor": "evil",
      "double-agent": "evil",
    };

    // Find an evil player
    let evilClient: MockClient | null = null;
    let evilRole: string = "";
    playerRoles.forEach((role, id) => {
      if (ROLE_TEAM[role] === "evil" && !evilClient) {
        evilClient = clients.find((c) => c.sessionId === id)!;
        evilRole = role;
      }
    });

    if (evilClient) {
      const sends = simulateReconnect(room, evilClient);

      const roleMsg = sends.find((s) => s.type === "ROLE_DATA");
      expect(roleMsg).toBeDefined();
      expect(roleMsg!.msg.team).toBe("evil");
      // Evil players should see other evil players
      expect(roleMsg!.msg.evilPlayers).toBeDefined();
      // Self should NOT be in the evil list
      const selfInEvil = roleMsg!.msg.evilPlayers.find(
        (p: any) => p.id === evilClient!.sessionId,
      );
      expect(selfInEvil).toBeUndefined();
    }
  });

  it("reconnect sends PHASE_CONTEXT without leaking votes/proposals", async () => {
    const room = await createRoom("kn_audit", "KN03");
    const clients: MockClient[] = [];
    for (let i = 0; i < 5; i++) {
      const c = makeMockClient(`kn3-p${i}`);
      await joinRoom(room, c, `Player${i}`);
      clients.push(c);
    }

    sendMsg(room, clients[0], "START_GAME");
    advanceClock(room, 9000);

    // Reconnect any player
    const sends = simulateReconnect(room, clients[1]);

    const phaseMsg = sends.find((s) => s.type === "PHASE_CONTEXT");
    expect(phaseMsg).toBeDefined();
    // Phase context should contain safe fields only
    expect(phaseMsg!.msg.phase).toBeDefined();
    expect(phaseMsg!.msg.currentMission).toBeDefined();
    // Should NOT contain other players' votes
    expect(phaseMsg!.msg.otherVotes).toBeUndefined();
    expect(phaseMsg!.msg.missionVotes).toBeUndefined();
  });
});

// ─── WordLink ──────────────────────────────────────────────

describe("Reconnect Audit: WordLink", () => {
  it("guesser reconnect does NOT receive color key", async () => {
    const room = await createRoom("wl_audit", "WL01");
    const clients: MockClient[] = [];
    for (let i = 0; i < 4; i++) {
      const c = makeMockClient(`wl-p${i}`);
      await joinRoom(room, c, `Player${i}`);
      clients.push(c);
    }

    sendMsg(room, clients[0], "START_GAME");
    advanceClock(room, 6000); // past TEAM_REVEAL

    // Find a guesser (role === "guesser")
    let guesserClient: MockClient | null = null;
    room.state.players.forEach((p: WordLinkPlayer) => {
      if (p.role === "guesser" && !guesserClient) {
        guesserClient = clients.find((c) => c.sessionId === p.id)!;
      }
    });

    expect(guesserClient).not.toBeNull();

    const sends = simulateReconnect(room, guesserClient!);

    // Guesser must NEVER receive COLOR_KEY
    const colorKeyMsg = sends.find((s) => s.type === "COLOR_KEY");
    expect(colorKeyMsg).toBeUndefined();
  });

  it("spymaster reconnect DOES receive color key", async () => {
    const room = await createRoom("wl_audit", "WL02");
    const clients: MockClient[] = [];
    for (let i = 0; i < 4; i++) {
      const c = makeMockClient(`wl2-p${i}`);
      await joinRoom(room, c, `Player${i}`);
      clients.push(c);
    }

    sendMsg(room, clients[0], "START_GAME");
    advanceClock(room, 6000);

    // Find a spymaster
    let spymasterClient: MockClient | null = null;
    room.state.players.forEach((p: WordLinkPlayer) => {
      if (p.role === "spymaster" && !spymasterClient) {
        spymasterClient = clients.find((c) => c.sessionId === p.id)!;
      }
    });

    expect(spymasterClient).not.toBeNull();

    const sends = simulateReconnect(room, spymasterClient!);

    // Spymaster SHOULD receive COLOR_KEY
    const colorKeyMsg = sends.find((s) => s.type === "COLOR_KEY");
    expect(colorKeyMsg).toBeDefined();
    expect(colorKeyMsg!.msg.cards).toBeDefined();
    expect(colorKeyMsg!.msg.cards.length).toBe(25);
  });
});

// ─── DrawGuess ─────────────────────────────────────────────

describe("Reconnect Audit: DrawGuess", () => {
  it("non-drawer reconnect does NOT receive the current word", async () => {
    const room = await createRoom("dg_audit", "DG01");
    const clients: MockClient[] = [];
    for (let i = 0; i < 3; i++) {
      const c = makeMockClient(`dg-p${i}`);
      await joinRoom(room, c, `Player${i}`);
      clients.push(c);
    }

    sendMsg(room, clients[0], "START_GAME");
    // Advance past countdown (3s) into DRAWING
    advanceClock(room, 4000);

    const currentWord: string = (room as any).currentWord;
    expect(currentWord).toBeTruthy();

    const drawerId: string = room.state.currentDrawerId;

    // Find a non-drawer
    const nonDrawerClient = clients.find((c) => c.sessionId !== drawerId)!;
    expect(nonDrawerClient).toBeDefined();

    const sends = simulateReconnect(room, nonDrawerClient);

    // Non-drawer must NOT receive DRAW_WORD
    const wordMsg = sends.find((s) => s.type === "DRAW_WORD");
    expect(wordMsg).toBeUndefined();

    // Non-drawer gets PHASE_CONTEXT and STROKE_SNAPSHOT but no word
    const phaseMsg = sends.find((s) => s.type === "PHASE_CONTEXT");
    expect(phaseMsg).toBeDefined();
    // Verify no word leaked in phase context
    expect(phaseMsg!.msg.word).toBeUndefined();
    expect(phaseMsg!.msg.currentWord).toBeUndefined();
  });

  it("drawer reconnect DOES receive the current word", async () => {
    const room = await createRoom("dg_audit", "DG02");
    const clients: MockClient[] = [];
    for (let i = 0; i < 3; i++) {
      const c = makeMockClient(`dg2-p${i}`);
      await joinRoom(room, c, `Player${i}`);
      clients.push(c);
    }

    sendMsg(room, clients[0], "START_GAME");
    advanceClock(room, 4000);

    const currentWord: string = (room as any).currentWord;
    const drawerId: string = room.state.currentDrawerId;
    const drawerClient = clients.find((c) => c.sessionId === drawerId)!;

    const sends = simulateReconnect(room, drawerClient);

    // Drawer SHOULD receive DRAW_WORD
    const wordMsg = sends.find((s) => s.type === "DRAW_WORD");
    expect(wordMsg).toBeDefined();
    expect(wordMsg!.msg.word).toBe(currentWord);
  });

  it("reconnecting non-drawer receives stroke snapshot but not the word", async () => {
    const room = await createRoom("dg_audit", "DG03");
    const clients: MockClient[] = [];
    for (let i = 0; i < 3; i++) {
      const c = makeMockClient(`dg3-p${i}`);
      await joinRoom(room, c, `Player${i}`);
      clients.push(c);
    }

    sendMsg(room, clients[0], "START_GAME");
    advanceClock(room, 4000);

    const drawerId: string = room.state.currentDrawerId;
    const nonDrawerClient = clients.find((c) => c.sessionId !== drawerId)!;

    const sends = simulateReconnect(room, nonDrawerClient);

    // Should get snapshot
    const snapshotMsg = sends.find((s) => s.type === "STROKE_SNAPSHOT");
    expect(snapshotMsg).toBeDefined();

    // Snapshot data should NOT contain the word
    const snapshotStr = JSON.stringify(snapshotMsg!.msg);
    const currentWord: string = (room as any).currentWord;
    expect(snapshotStr).not.toContain(currentWord);
  });
});
