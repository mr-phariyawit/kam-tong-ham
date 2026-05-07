/**
 * Adversarial Scenario #3: 5-player Werewolf edge-case role distribution
 *
 * Sprint 17, Issue #18, KTH-T-103
 *
 * Tests the minimum player count (5) for Werewolf, which is special because:
 * - No doctor role (doctor count = 0)
 * - Only 1 werewolf
 * - 1 seer + 3 villagers
 * - Wolf-to-village ratio is 1:4 (most lopsided)
 * - Win conditions must still work correctly despite no doctor
 * - Night resolution without doctor save is a distinct code path
 *
 * Also validates the role distribution table exhaustively for all supported
 * player counts (5-15), and checks that role sums always equal player count.
 */
import { describe, it, expect } from "vitest";
import { matchMaker, LocalDriver, LocalPresence } from "@colyseus/core";
import { WerewolfRoom } from "../../rooms/WerewolfRoom";
import {
  WerewolfState,
  WerewolfPlayer,
  WerewolfRole,
  getRoleDistribution,
  ROLE_TABLE,
  ROLE_NAMES_TH,
} from "../../schemas/WerewolfState";
import { makeMockClient, type MockClient } from "../integration/helpers";

// ─── Setup ──────────────────────────────────────────────────

let setupDone = false;

async function setup() {
  if (!setupDone) {
    await matchMaker.setup(new LocalPresence(), new LocalDriver());
    matchMaker.defineRoomType("ww_5p", WerewolfRoom);
    setupDone = true;
  }
}

async function createRoom(code = "WW5P") {
  await setup();
  const listing = await matchMaker.createRoom("ww_5p", { roomCode: code, gameType: "werewolf" });
  return matchMaker.getRoomById(listing.roomId) as any;
}

async function joinRoom(room: any, client: MockClient, nick: string) {
  await (room as any)["_reserveSeat"](client.sessionId, { nickname: nick, avatar: "5" }, undefined);
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

function getState(room: any): WerewolfState {
  return room.state as WerewolfState;
}

function getPlayers(room: any): WerewolfPlayer[] {
  const players: WerewolfPlayer[] = [];
  getState(room).players.forEach((p) => players.push(p as WerewolfPlayer));
  return players;
}

function getPlayerRoles(room: any): Map<string, WerewolfRole> {
  return (room as any).playerRoles as Map<string, WerewolfRole>;
}

function countRoles(room: any): Record<WerewolfRole, number> {
  const roles = getPlayerRoles(room);
  const counts: Record<WerewolfRole, number> = { werewolf: 0, seer: 0, doctor: 0, villager: 0 };
  roles.forEach((role) => { counts[role]++; });
  return counts;
}

function findByRole(room: any, role: WerewolfRole): Array<{ client: MockClient; player: WerewolfPlayer }> {
  const roles = getPlayerRoles(room);
  return getPlayers(room)
    .filter((p) => roles.get(p.id) === role && p.isAlive)
    .map((p) => ({
      client: (room as any).clients.find((c: MockClient) => c.sessionId === p.id),
      player: p,
    }));
}

function findNonWolves(room: any): Array<{ client: MockClient; player: WerewolfPlayer }> {
  const roles = getPlayerRoles(room);
  return getPlayers(room)
    .filter((p) => roles.get(p.id) !== "werewolf" && p.isAlive && p.isConnected)
    .map((p) => ({
      client: (room as any).clients.find((c: MockClient) => c.sessionId === p.id),
      player: p,
    }));
}

// ─── Tests ──────────────────────────────────────────────────

describe("Adversarial: 5-player Werewolf role distribution", () => {
  it("ADV-5P-01: exactly 1 wolf, 1 seer, 0 doctor, 3 villagers at 5 players", async () => {
    const room = await createRoom();
    const clients: MockClient[] = [];
    for (let i = 0; i < 5; i++) {
      const c = makeMockClient(`5p-a-${i}`);
      clients.push(c);
      await joinRoom(room, c, `Player${i}`);
    }

    sendMsg(room, clients[0], "START_GAME");

    const counts = countRoles(room);
    expect(counts.werewolf).toBe(1);
    expect(counts.seer).toBe(1);
    expect(counts.doctor).toBe(0);
    expect(counts.villager).toBe(3);

    // Total must equal player count
    const total = counts.werewolf + counts.seer + counts.doctor + counts.villager;
    expect(total).toBe(5);
  });

  it("ADV-5P-02: no doctor means doctor message handlers reject gracefully", async () => {
    const room = await createRoom("5PB");
    const clients: MockClient[] = [];
    for (let i = 0; i < 5; i++) {
      const c = makeMockClient(`5p-b-${i}`);
      clients.push(c);
      await joinRoom(room, c, `Player${i}`);
    }

    sendMsg(room, clients[0], "START_GAME");
    advanceClock(room, 5000); // past role reveal -> NIGHT

    // No doctor exists. If a villager tries DOCTOR_SAVE, it should be rejected.
    const villagers = findByRole(room, "villager");
    expect(villagers.length).toBeGreaterThan(0);

    sendMsg(room, villagers[0].client, "DOCTOR_SAVE", { targetId: villagers[1]?.client.sessionId || villagers[0].client.sessionId });
    const err = villagers[0].client.sends.find(
      (s) => s.type === "ERROR" && s.msg?.code === "NOT_DOCTOR",
    );
    expect(err).toBeDefined();
  });

  it("ADV-5P-03: night resolves correctly without doctor save path", async () => {
    const room = await createRoom("5PC");
    const clients: MockClient[] = [];
    for (let i = 0; i < 5; i++) {
      const c = makeMockClient(`5p-c-${i}`);
      clients.push(c);
      await joinRoom(room, c, `Player${i}`);
    }

    sendMsg(room, clients[0], "START_GAME");
    advanceClock(room, 5000); // -> NIGHT

    const wolves = findByRole(room, "werewolf");
    const nonWolves = findNonWolves(room);

    // Wolf votes for a target
    sendMsg(room, wolves[0].client, "WOLF_VOTE", { targetId: nonWolves[0].client.sessionId });

    // Resolve night
    advanceClock(room, 30000);

    // Target should be dead (no doctor to save)
    const target = getState(room).players.get(nonWolves[0].client.sessionId) as WerewolfPlayer;
    expect(target.isAlive).toBe(false);
    expect(getState(room).lastNightSaved).toBe(false);

    // Should transition to DAY_ANNOUNCE (not stuck)
    expect(getState(room).phase).toBe("DAY_ANNOUNCE");
  });

  it("ADV-5P-04: village wins by eliminating the lone wolf in day vote", async () => {
    const room = await createRoom("5PD");
    const clients: MockClient[] = [];
    for (let i = 0; i < 5; i++) {
      const c = makeMockClient(`5p-d-${i}`);
      clients.push(c);
      await joinRoom(room, c, `Player${i}`);
    }

    sendMsg(room, clients[0], "START_GAME");
    advanceClock(room, 5000); // -> NIGHT

    // No wolf vote, skip night
    advanceClock(room, 30000); // night resolves (no kill)
    advanceClock(room, 5000);  // DAY_ANNOUNCE -> DAY_DISCUSSION

    expect(getState(room).phase).toBe("DAY_DISCUSSION");

    // Find the wolf and nominate them
    const wolves = findByRole(room, "werewolf");
    expect(wolves.length).toBe(1);
    const wolfId = wolves[0].client.sessionId;

    const alive = getPlayers(room).filter((p) => p.isAlive && p.isConnected);
    const nonWolf = alive.find((p) => p.id !== wolfId)!;
    const nonWolfClient = clients.find((c) => c.sessionId === nonWolf.id)!;

    sendMsg(room, nonWolfClient, "NOMINATE", { targetId: wolfId });

    // Advance past defense timer (WW-003.4)
    advanceClock(room, 30000);

    // All non-wolf voters vote eliminate
    const voters = alive.filter((p) => p.id !== wolfId);
    for (const voter of voters) {
      const vc = clients.find((c) => c.sessionId === voter.id)!;
      sendMsg(room, vc, "DAY_VOTE", { vote: "eliminate" });
    }

    // Village should win
    expect(getState(room).phase).toBe("GAME_OVER");
    expect(getState(room).winner).toBe("village");
    expect(getState(room).winReason).toBe("all_wolves_eliminated");
  });

  it("ADV-5P-05: wolf wins when alive wolves >= alive non-wolves (5p endgame)", async () => {
    const room = await createRoom("5PE");
    const clients: MockClient[] = [];
    for (let i = 0; i < 5; i++) {
      const c = makeMockClient(`5p-e-${i}`);
      clients.push(c);
      await joinRoom(room, c, `Player${i}`);
    }

    sendMsg(room, clients[0], "START_GAME");
    advanceClock(room, 5000); // -> NIGHT

    const roles = getPlayerRoles(room);

    // Manually simulate state: kill non-wolves until wolf >= non-wolves
    // With 1 wolf and 4 non-wolves, we need to kill 3 non-wolves
    // to get 1 wolf vs 1 non-wolf (wolves win at >=)
    const nonWolfIds: string[] = [];
    roles.forEach((role, id) => {
      if (role !== "werewolf") nonWolfIds.push(id);
    });

    // Kill 3 of 4 non-wolves
    for (let i = 0; i < 3; i++) {
      const p = getState(room).players.get(nonWolfIds[i]) as WerewolfPlayer;
      p.isAlive = false;
    }

    // Update alive count
    let aliveCount = 0;
    getState(room).players.forEach((p) => { if (p.isAlive) aliveCount++; });
    getState(room).aliveCount = aliveCount;

    // Now: 1 wolf alive, 1 non-wolf alive -> wolves should win
    // The checkWinCondition method checks this
    const checkWin = (room as any)["checkWinCondition"].bind(room);
    const result = checkWin();
    expect(result).not.toBeNull();
    expect(result.winner).toBe("werewolves");
    expect(result.reason).toBe("wolves_outnumber_village");
  });

  it("ADV-5P-06: seer can identify the lone wolf at 5 players", async () => {
    const room = await createRoom("5PF");
    const clients: MockClient[] = [];
    for (let i = 0; i < 5; i++) {
      const c = makeMockClient(`5p-f-${i}`);
      clients.push(c);
      await joinRoom(room, c, `Player${i}`);
    }

    sendMsg(room, clients[0], "START_GAME");
    advanceClock(room, 5000); // -> NIGHT

    const seers = findByRole(room, "seer");
    const wolves = findByRole(room, "werewolf");

    expect(seers.length).toBe(1);
    expect(wolves.length).toBe(1);

    // Seer peeks at the wolf
    sendMsg(room, seers[0].client, "SEER_PEEK", { targetId: wolves[0].client.sessionId });

    const result = seers[0].client.sends.find((s) => s.type === "SEER_RESULT");
    expect(result).toBeDefined();
    expect(result!.msg.isWerewolf).toBe(true);
  });

  it("ADV-5P-07: ROLE_DATA for wolves shows empty otherWolves at 5 players (solo wolf)", async () => {
    const room = await createRoom("5PG");
    const clients: MockClient[] = [];
    for (let i = 0; i < 5; i++) {
      const c = makeMockClient(`5p-g-${i}`);
      clients.push(c);
      await joinRoom(room, c, `Player${i}`);
    }

    sendMsg(room, clients[0], "START_GAME");

    const roles = getPlayerRoles(room);
    const wolfClient = clients.find((c) => roles.get(c.sessionId) === "werewolf")!;

    const roleData = wolfClient.sends.find((s) => s.type === "ROLE_DATA");
    expect(roleData).toBeDefined();
    expect(roleData!.msg.isWerewolf).toBe(true);
    // Solo wolf: otherWolves should be empty array
    expect(roleData!.msg.otherWolves).toHaveLength(0);
  });
});

describe("Adversarial: Role distribution table validation", () => {
  it("ADV-DIST-01: role sums equal player count for all 5-15", () => {
    for (let n = 5; n <= 15; n++) {
      const dist = getRoleDistribution(n);
      const total = dist.werewolves + dist.seer + dist.doctor + dist.villagers;
      expect(total).toBe(n);
    }
  });

  it("ADV-DIST-02: wolf count is always < half the player count", () => {
    for (let n = 5; n <= 15; n++) {
      const dist = getRoleDistribution(n);
      expect(dist.werewolves).toBeLessThan(n / 2);
    }
  });

  it("ADV-DIST-03: exactly 1 seer at all player counts", () => {
    for (let n = 5; n <= 15; n++) {
      const dist = getRoleDistribution(n);
      expect(dist.seer).toBe(1);
    }
  });

  it("ADV-DIST-04: doctor absent only at 5 players", () => {
    for (let n = 5; n <= 15; n++) {
      const dist = getRoleDistribution(n);
      if (n === 5) {
        expect(dist.doctor).toBe(0);
      } else {
        expect(dist.doctor).toBe(1);
      }
    }
  });

  it("ADV-DIST-05: at least 1 villager at every player count", () => {
    for (let n = 5; n <= 15; n++) {
      const dist = getRoleDistribution(n);
      expect(dist.villagers).toBeGreaterThanOrEqual(1);
    }
  });

  it("ADV-DIST-06: wolf count increases monotonically", () => {
    let prevWolves = 0;
    for (let n = 5; n <= 15; n++) {
      const dist = getRoleDistribution(n);
      expect(dist.werewolves).toBeGreaterThanOrEqual(prevWolves);
      prevWolves = dist.werewolves;
    }
  });

  it("ADV-DIST-07: throws for out-of-range player counts", () => {
    expect(() => getRoleDistribution(4)).toThrow();
    expect(() => getRoleDistribution(16)).toThrow();
    expect(() => getRoleDistribution(0)).toThrow();
    expect(() => getRoleDistribution(-1)).toThrow();
  });
});
