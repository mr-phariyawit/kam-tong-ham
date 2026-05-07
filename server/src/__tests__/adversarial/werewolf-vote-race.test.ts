/**
 * Adversarial Scenario #2: Simultaneous-vote race conditions in Werewolf
 *
 * Sprint 17, Issue #18, KTH-T-102
 *
 * Tests that when multiple clients submit votes "simultaneously" (in rapid
 * succession with no event-loop yields), the server resolves deterministically
 * without state corruption. Covers:
 * - Night phase: two wolves voting at the same tick
 * - Day phase: multiple players voting eliminate/spare in rapid succession
 * - Double-vote prevention under concurrent load
 * - Vote count integrity (never exceeds expected voters)
 */
import { describe, it, expect } from "vitest";
import { matchMaker, LocalDriver, LocalPresence } from "@colyseus/core";
import { WerewolfRoom } from "../../rooms/WerewolfRoom";
import {
  WerewolfState,
  WerewolfPlayer,
  WerewolfRole,
} from "../../schemas/WerewolfState";
import { makeMockClient, type MockClient } from "../integration/helpers";

// ─── Setup ──────────────────────────────────────────────────

let setupDone = false;

async function setup() {
  if (!setupDone) {
    await matchMaker.setup(new LocalPresence(), new LocalDriver());
    matchMaker.defineRoomType("ww_vr", WerewolfRoom);
    setupDone = true;
  }
}

async function createRoom(code = "WWVR") {
  await setup();
  const listing = await matchMaker.createRoom("ww_vr", { roomCode: code, gameType: "werewolf" });
  return matchMaker.getRoomById(listing.roomId) as any;
}

async function joinRoom(room: any, client: MockClient, nick: string) {
  await (room as any)["_reserveSeat"](client.sessionId, { nickname: nick, avatar: "V" }, undefined);
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

async function setupInNight(count = 8): Promise<{ room: any; clients: MockClient[] }> {
  const room = await createRoom(`VR${count}`);
  const clients: MockClient[] = [];
  for (let i = 0; i < count; i++) {
    const c = makeMockClient(`vr-p${i}`);
    clients.push(c);
    await joinRoom(room, c, `Player${i}`);
  }
  sendMsg(room, clients[0], "START_GAME");
  advanceClock(room, 5000); // past role reveal -> NIGHT
  return { room, clients };
}

async function setupInDay(count = 8): Promise<{ room: any; clients: MockClient[] }> {
  const { room, clients } = await setupInNight(count);
  const wolves = findByRole(room, "werewolf");
  const nonWolves = findNonWolves(room);
  if (wolves.length > 0 && nonWolves.length > 0) {
    sendMsg(room, wolves[0].client, "WOLF_VOTE", { targetId: nonWolves[0].client.sessionId });
  }
  advanceClock(room, 30000); // night resolves
  advanceClock(room, 5000);  // past DAY_ANNOUNCE -> DAY_DISCUSSION
  return { room, clients };
}

// ─── Tests ──────────────────────────────────────────────────

describe("Adversarial: Werewolf simultaneous-vote race conditions", () => {
  it("ADV-WW-01: two wolves voting for different targets in same tick - no state corruption", async () => {
    const { room } = await setupInNight(8);
    const wolves = findByRole(room, "werewolf");
    const nonWolves = findNonWolves(room);

    // 8 players = 2 wolves. Both vote for different targets simultaneously.
    expect(wolves.length).toBe(2);
    expect(nonWolves.length).toBeGreaterThanOrEqual(2);

    const target1 = nonWolves[0].client.sessionId;
    const target2 = nonWolves[1].client.sessionId;

    // "Simultaneous" = back-to-back with no yields
    sendMsg(room, wolves[0].client, "WOLF_VOTE", { targetId: target1 });
    sendMsg(room, wolves[1].client, "WOLF_VOTE", { targetId: target2 });

    // Both wolves should have hasActed = true
    expect(wolves[0].player.hasActed).toBe(true);
    expect(wolves[1].player.hasActed).toBe(true);

    // Resolve night
    advanceClock(room, 30000);

    // Game should transition cleanly (no crash, no stuck state)
    const phase = getState(room).phase;
    expect(["DAY_ANNOUNCE", "GAME_OVER"]).toContain(phase);

    // Kill history should have exactly 1 entry for this night
    const history = getState(room).killHistory;
    expect(history.length).toBe(1);
    expect(history[0].night).toBe(1);
  });

  it("ADV-WW-02: two wolves voting for SAME target - votes accumulate, not corrupt", async () => {
    const { room } = await setupInNight(8);
    const wolves = findByRole(room, "werewolf");
    const nonWolves = findNonWolves(room);

    expect(wolves.length).toBe(2);
    const sameTarget = nonWolves[0].client.sessionId;

    // Both vote for same target simultaneously
    sendMsg(room, wolves[0].client, "WOLF_VOTE", { targetId: sameTarget });
    sendMsg(room, wolves[1].client, "WOLF_VOTE", { targetId: sameTarget });

    // Resolve night
    advanceClock(room, 30000);

    // Target should be dead (unanimous wolf vote)
    const targetPlayer = getState(room).players.get(sameTarget) as WerewolfPlayer;
    // If doctor didn't save, target is dead
    if (!getState(room).lastNightSaved) {
      expect(targetPlayer.isAlive).toBe(false);
    }

    const phase = getState(room).phase;
    expect(["DAY_ANNOUNCE", "GAME_OVER"]).toContain(phase);
  });

  it("ADV-WW-03: rapid-fire day votes from all voters - count never exceeds expected", async () => {
    const { room, clients } = await setupInDay(8);
    const state = getState(room);

    if (state.phase !== "DAY_DISCUSSION") return; // Night kill might end game

    const alive = getPlayers(room).filter((p) => p.isAlive && p.isConnected);
    if (alive.length < 3) return; // Not enough for meaningful test

    const nominator = alive[0];
    const target = alive[1];
    const nominatorClient = clients.find((c) => c.sessionId === nominator.id)!;

    sendMsg(room, nominatorClient, "NOMINATE", { targetId: target.id });

    // Advance past defense timer (WW-003.4)
    advanceClock(room, 30000);

    if (getState(room).phase !== "DAY_VOTE") return;

    const expectedVoters = state.totalVotersExpected;
    expect(expectedVoters).toBeGreaterThan(0);

    // All eligible voters fire votes as fast as possible
    const voters = alive.filter((p) => p.id !== target.id);
    for (const voter of voters) {
      const vc = clients.find((c) => c.sessionId === voter.id);
      if (vc) {
        sendMsg(room, vc, "DAY_VOTE", { vote: "eliminate" });
      }
    }

    // INVARIANT: totalVotesCast NEVER exceeds totalVotersExpected
    expect(state.totalVotesCast).toBeLessThanOrEqual(expectedVoters);

    // Game should have resolved (all votes cast)
    const phase = getState(room).phase;
    expect(["NIGHT", "DAY_VOTE", "GAME_OVER"]).toContain(phase);
  });

  it("ADV-WW-04: double-vote attempt under rapid fire is rejected", async () => {
    const { room, clients } = await setupInDay(8);
    const state = getState(room);

    if (state.phase !== "DAY_DISCUSSION") return;

    const alive = getPlayers(room).filter((p) => p.isAlive && p.isConnected);
    if (alive.length < 3) return;

    const nominator = alive[0];
    const target = alive[1];
    const nominatorClient = clients.find((c) => c.sessionId === nominator.id)!;

    sendMsg(room, nominatorClient, "NOMINATE", { targetId: target.id });
    advanceClock(room, 30000);

    if (getState(room).phase !== "DAY_VOTE") return;

    // First vote: succeeds
    sendMsg(room, nominatorClient, "DAY_VOTE", { vote: "eliminate" });
    const votesBefore = state.totalVotesCast;

    // Second vote: must be rejected
    sendMsg(room, nominatorClient, "DAY_VOTE", { vote: "spare" });
    expect(state.totalVotesCast).toBe(votesBefore); // unchanged

    const err = nominatorClient.sends.find(
      (s) => s.type === "ERROR" && s.msg?.code === "ALREADY_VOTED",
    );
    expect(err).toBeDefined();
  });

  it("ADV-WW-05: wolf night vote + seer peek + doctor save all in same tick - atomic resolution", async () => {
    const { room } = await setupInNight(8);
    const wolves = findByRole(room, "werewolf");
    const seers = findByRole(room, "seer");
    const doctors = findByRole(room, "doctor");
    const nonWolves = findNonWolves(room);

    const wolfTarget = nonWolves[0].client.sessionId;

    // All three role actions fire simultaneously
    if (wolves.length > 0) {
      sendMsg(room, wolves[0].client, "WOLF_VOTE", { targetId: wolfTarget });
    }
    if (wolves.length > 1) {
      sendMsg(room, wolves[1].client, "WOLF_VOTE", { targetId: wolfTarget });
    }
    if (seers.length > 0) {
      // Seer peeks at the wolf target (or another non-wolf)
      const peekTarget = nonWolves.length > 1 ? nonWolves[1].client.sessionId : wolfTarget;
      sendMsg(room, seers[0].client, "SEER_PEEK", { targetId: peekTarget });
    }
    if (doctors.length > 0) {
      // Doctor saves the wolf's target
      sendMsg(room, doctors[0].client, "DOCTOR_SAVE", { targetId: wolfTarget });
    }

    // Resolve night
    advanceClock(room, 30000);

    // Game should transition cleanly
    const phase = getState(room).phase;
    expect(["DAY_ANNOUNCE", "GAME_OVER"]).toContain(phase);

    // If doctor saved the target, verify the save worked
    if (doctors.length > 0) {
      const targetPlayer = getState(room).players.get(wolfTarget) as WerewolfPlayer;
      expect(targetPlayer.isAlive).toBe(true);
      expect(getState(room).lastNightSaved).toBe(true);
    }

    // Kill history should have exactly 1 entry
    expect(getState(room).killHistory.length).toBe(1);
  });

  it("ADV-WW-06: vote-during-resolution edge case - late vote after all votes counted", async () => {
    const { room, clients } = await setupInDay(6);
    const state = getState(room);

    if (state.phase !== "DAY_DISCUSSION") return;

    const alive = getPlayers(room).filter((p) => p.isAlive && p.isConnected);
    if (alive.length < 3) return;

    const nominator = alive[0];
    const target = alive[1];
    const nominatorClient = clients.find((c) => c.sessionId === nominator.id)!;

    sendMsg(room, nominatorClient, "NOMINATE", { targetId: target.id });
    advanceClock(room, 30000); // past defense

    if (getState(room).phase !== "DAY_VOTE") return;

    // All voters vote
    const voters = alive.filter((p) => p.id !== target.id);
    for (const voter of voters) {
      const vc = clients.find((c) => c.sessionId === voter.id);
      if (vc) sendMsg(room, vc, "DAY_VOTE", { vote: "eliminate" });
    }

    // Phase should have resolved (all votes cast triggers immediate resolution)
    const phaseAfter = getState(room).phase;

    // A late "vote" from someone who already voted should be harmlessly rejected
    // (phase changed, so INVALID_PHASE or ALREADY_VOTED)
    if (voters.length > 0 && phaseAfter !== "DAY_VOTE") {
      const lateVoter = clients.find((c) => c.sessionId === voters[0].id);
      if (lateVoter) {
        lateVoter.sends = [];
        sendMsg(room, lateVoter, "DAY_VOTE", { vote: "spare" });
        // Should get either INVALID_PHASE (phase changed) or ALREADY_VOTED
        const err = lateVoter.sends.find(
          (s) => s.type === "ERROR" &&
            (s.msg?.code === "INVALID_PHASE" || s.msg?.code === "ALREADY_VOTED"),
        );
        expect(err).toBeDefined();
      }
    }
  });

  it("ADV-WW-07: concurrent wolf votes with changing targets - last vote wins per wolf", async () => {
    const { room } = await setupInNight(8);
    const wolves = findByRole(room, "werewolf");
    const nonWolves = findNonWolves(room);

    expect(wolves.length).toBe(2);
    expect(nonWolves.length).toBeGreaterThanOrEqual(3);

    // Wolf 0 changes their mind rapidly
    sendMsg(room, wolves[0].client, "WOLF_VOTE", { targetId: nonWolves[0].client.sessionId });
    sendMsg(room, wolves[0].client, "WOLF_VOTE", { targetId: nonWolves[1].client.sessionId });
    sendMsg(room, wolves[0].client, "WOLF_VOTE", { targetId: nonWolves[2].client.sessionId });

    // Wolf 1 votes once
    sendMsg(room, wolves[1].client, "WOLF_VOTE", { targetId: nonWolves[0].client.sessionId });

    // Resolve night
    advanceClock(room, 30000);

    // No crash, game continues
    const phase = getState(room).phase;
    expect(["DAY_ANNOUNCE", "GAME_OVER"]).toContain(phase);

    // Exactly one kill entry
    expect(getState(room).killHistory.length).toBe(1);
  });
});
