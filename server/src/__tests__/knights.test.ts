/**
 * Knights (อัศวิน) -- Unit + Integration tests.
 *
 * Tests the full game flow: role assignment, team proposal, team vote,
 * mission voting, win conditions, assassin endgame, reconnect handling,
 * hammer rule, and edge cases.
 *
 * Uses the same mock-client pattern as WerewolfRoom and SpyRoom tests.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { matchMaker, LocalDriver, LocalPresence } from "@colyseus/core";
import { KnightsRoom } from "../rooms/KnightsRoom";
import {
  KnightsState,
  KnightsPlayer,
  KnightsRole,
  KnightsTeam,
  getRoleDistribution,
  buildRoleArray,
  ROLE_TABLE,
  ROLE_NAMES_TH,
  ROLE_ICONS,
  ROLE_TEAM,
} from "../schemas/KnightsState";
import { makeMockClient, type MockClient } from "./integration/helpers";

// ─── Test Setup ──────────────────────────────────────────────

let setupDone = false;

async function setupKnights() {
  if (!setupDone) {
    await matchMaker.setup(new LocalPresence(), new LocalDriver());
    matchMaker.defineRoomType("knights", KnightsRoom);
    setupDone = true;
  }
}

async function createKnightsRoom(roomCode = "KNTS") {
  await setupKnights();
  const listing = await matchMaker.createRoom("knights", { roomCode, gameType: "knights" });
  return matchMaker.getRoomById(listing.roomId) as any as KnightsRoom;
}

async function joinRoom(room: any, client: MockClient, options: { nickname: string; avatar: string }) {
  await (room as any)["_reserveSeat"](client.sessionId, options, undefined);
  await (room as any)["_onJoin"](client);
}

function sendMessage(room: any, client: MockClient, type: string, data?: any) {
  const handler = (room as any).onMessageHandlers[type];
  if (!handler) throw new Error(`No handler for message type: ${type}`);
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

function getState(room: any): KnightsState {
  return (room as any).state as KnightsState;
}

function getPlayers(room: any): KnightsPlayer[] {
  const players: KnightsPlayer[] = [];
  getState(room).players.forEach((p) => players.push(p as KnightsPlayer));
  return players;
}

function getPlayerRoles(room: any): Map<string, KnightsRole> {
  return (room as any).playerRoles as Map<string, KnightsRole>;
}

function getLeaderOrder(room: any): string[] {
  return (room as any).leaderOrder as string[];
}

function getProposedTeam(room: any): Set<string> {
  return (room as any).proposedTeam as Set<string>;
}

function getMissionVotes(room: any): Map<string, "success" | "fail"> {
  return (room as any).missionVotes as Map<string, "success" | "fail">;
}

function getTeamVotes(room: any): Map<string, "approve" | "reject"> {
  return (room as any).teamVotes as Map<string, "approve" | "reject">;
}

/**
 * Helper: create a room with N players and start the game.
 * Returns the room, clients, and state.
 */
async function setupGame(playerCount: number) {
  const room = await createKnightsRoom(`KN${playerCount}`);
  const clients: MockClient[] = [];

  for (let i = 0; i < playerCount; i++) {
    const client = makeMockClient(`player-${i}`);
    await joinRoom(room, client, { nickname: `Player${i}`, avatar: "🎭" });
    clients.push(client);
  }

  // Start the game
  sendMessage(room, clients[0], "START_GAME");

  return { room, clients, state: getState(room) };
}

/**
 * Helper: force specific roles for testing.
 * Must be called right after game start (during ROLE_REVEAL).
 */
function forceRoles(room: any, roleAssignments: Record<string, KnightsRole>) {
  const roles = getPlayerRoles(room);
  roles.clear();
  Object.entries(roleAssignments).forEach(([sessionId, role]) => {
    roles.set(sessionId, role);
  });
}

/**
 * Helper: advance through ROLE_REVEAL to TEAM_PROPOSAL.
 */
function skipRoleReveal(room: any) {
  advanceClock(room, 8000);
}

/**
 * Helper: propose a team and have all players approve it.
 */
function proposeAndApproveTeam(room: any, clients: MockClient[], teamIds: string[]) {
  const state = getState(room);
  const leaderId = state.currentLeaderId;
  const leaderClient = clients.find((c) => c.sessionId === leaderId)!;

  sendMessage(room, leaderClient, "PROPOSE_TEAM", { teamIds });

  // All players approve
  clients.forEach((c) => {
    if (getState(room).phase === "TEAM_VOTE") {
      const player = state.players.get(c.sessionId) as KnightsPlayer;
      if (player && !player.hasVoted && player.isConnected) {
        sendMessage(room, c, "TEAM_VOTE", { vote: "approve" });
      }
    }
  });
}

/**
 * Helper: all mission team members vote success.
 */
function allMissionSuccess(room: any, clients: MockClient[]) {
  const proposedTeam = getProposedTeam(room);
  clients.forEach((c) => {
    if (proposedTeam.has(c.sessionId)) {
      const player = getState(room).players.get(c.sessionId) as KnightsPlayer;
      if (player && !player.hasMissionVoted) {
        sendMessage(room, c, "MISSION_VOTE", { vote: "success" });
      }
    }
  });
}

// ─── Tests ──────────────────────────────────────────────────────

describe("Knights (อัศวิน)", () => {
  // ─── Schema Unit Tests ──────────────────────────────────────

  describe("KnightsState schema", () => {
    it("should have correct role distribution for 5 players", () => {
      const dist = getRoleDistribution(5);
      expect(dist.good).toBe(3);
      expect(dist.evil).toBe(2);
      expect(dist.missionSizes).toEqual([2, 3, 2, 3, 3]);
      expect(dist.mission4DoubleFail).toBe(false);
      expect(dist.specialRoles.leader).toBe(true);
      expect(dist.specialRoles.assassin).toBe(true);
      expect(dist.specialRoles.advisor).toBe(false);
      expect(dist.specialRoles.doubleAgent).toBe(false);
    });

    it("should have correct role distribution for 7 players", () => {
      const dist = getRoleDistribution(7);
      expect(dist.good).toBe(4);
      expect(dist.evil).toBe(3);
      expect(dist.missionSizes).toEqual([2, 3, 3, 4, 4]);
      expect(dist.mission4DoubleFail).toBe(true);
      expect(dist.specialRoles.advisor).toBe(true);
      expect(dist.specialRoles.doubleAgent).toBe(true);
    });

    it("should have correct role distribution for 10 players", () => {
      const dist = getRoleDistribution(10);
      expect(dist.good).toBe(6);
      expect(dist.evil).toBe(4);
      expect(dist.missionSizes).toEqual([3, 4, 4, 5, 5]);
      expect(dist.mission4DoubleFail).toBe(true);
    });

    it("should throw for unsupported player count", () => {
      expect(() => getRoleDistribution(4)).toThrow("unsupported player count");
      expect(() => getRoleDistribution(11)).toThrow("unsupported player count");
    });

    it("should build correct role array for 5 players", () => {
      const roles = buildRoleArray(5);
      expect(roles).toHaveLength(5);
      expect(roles.filter((r) => ROLE_TEAM[r] === "good")).toHaveLength(3);
      expect(roles.filter((r) => ROLE_TEAM[r] === "evil")).toHaveLength(2);
      expect(roles).toContain("leader");
      expect(roles).toContain("assassin");
      expect(roles).not.toContain("advisor");
      expect(roles).not.toContain("double-agent");
    });

    it("should build correct role array for 7 players (includes advisor + double-agent)", () => {
      const roles = buildRoleArray(7);
      expect(roles).toHaveLength(7);
      expect(roles).toContain("leader");
      expect(roles).toContain("assassin");
      expect(roles).toContain("advisor");
      expect(roles).toContain("double-agent");
    });

    it("should have Thai names for all roles", () => {
      const allRoles: KnightsRole[] = ["good-knight", "leader", "advisor", "traitor", "assassin", "double-agent"];
      allRoles.forEach((role) => {
        expect(ROLE_NAMES_TH[role]).toBeTruthy();
        expect(ROLE_ICONS[role]).toBeTruthy();
        expect(ROLE_TEAM[role]).toBeTruthy();
      });
    });

    it("should have correct team assignments", () => {
      expect(ROLE_TEAM["good-knight"]).toBe("good");
      expect(ROLE_TEAM["leader"]).toBe("good");
      expect(ROLE_TEAM["advisor"]).toBe("good");
      expect(ROLE_TEAM["traitor"]).toBe("evil");
      expect(ROLE_TEAM["assassin"]).toBe("evil");
      expect(ROLE_TEAM["double-agent"]).toBe("evil");
    });

    it("should cover all player counts 5-10 in ROLE_TABLE", () => {
      for (let n = 5; n <= 10; n++) {
        expect(ROLE_TABLE[n]).toBeDefined();
        const dist = ROLE_TABLE[n];
        expect(dist.good + dist.evil).toBe(n);
        expect(dist.missionSizes).toHaveLength(5);
      }
    });
  });

  // ─── Room Lifecycle Tests ─────────────────────────────────────

  describe("Room creation and lobby", () => {
    it("should create a room with LOBBY phase", async () => {
      const room = await createKnightsRoom();
      expect(getState(room).phase).toBe("LOBBY");
    });

    it("should accept 5-10 players", async () => {
      const room = await createKnightsRoom("JOIN5");
      for (let i = 0; i < 10; i++) {
        const client = makeMockClient(`p-${i}`);
        await joinRoom(room, client, { nickname: `P${i}`, avatar: "🎭" });
      }
      expect(getState(room).playerCount).toBe(10);
    });

    it("should require minimum 5 players to start", async () => {
      const room = await createKnightsRoom("MIN5");
      const clients: MockClient[] = [];
      for (let i = 0; i < 4; i++) {
        const client = makeMockClient(`min-${i}`);
        await joinRoom(room, client, { nickname: `Min${i}`, avatar: "🎭" });
        clients.push(client);
      }
      sendMessage(room, clients[0], "START_GAME");
      expect(getState(room).phase).toBe("LOBBY");
      const error = clients[0].sends.find((s) => s.type === "ERROR");
      expect(error?.msg.code).toBe("NOT_ENOUGH_PLAYERS");
    });
  });

  // ─── Game Start & Role Assignment ─────────────────────────────

  describe("Game start and role assignment", () => {
    it("should transition to ROLE_REVEAL on game start", async () => {
      const { state } = await setupGame(5);
      expect(state.phase).toBe("ROLE_REVEAL");
    });

    it("should assign roles to all players (5 players)", async () => {
      const { room } = await setupGame(5);
      const roles = getPlayerRoles(room);
      expect(roles.size).toBe(5);
      const goodCount = Array.from(roles.values()).filter((r) => ROLE_TEAM[r] === "good").length;
      const evilCount = Array.from(roles.values()).filter((r) => ROLE_TEAM[r] === "evil").length;
      expect(goodCount).toBe(3);
      expect(evilCount).toBe(2);
    });

    it("should always include leader and assassin roles", async () => {
      const { room } = await setupGame(5);
      const roleValues = Array.from(getPlayerRoles(room).values());
      expect(roleValues).toContain("leader");
      expect(roleValues).toContain("assassin");
    });

    it("should send ROLE_DATA to each player on game start", async () => {
      const { clients, room } = await setupGame(5);
      clients.forEach((c) => {
        const roleMsg = c.sends.find((s) => s.type === "ROLE_DATA");
        expect(roleMsg).toBeDefined();
        expect(roleMsg!.msg.role).toBeTruthy();
        expect(roleMsg!.msg.roleTh).toBeTruthy();
        expect(roleMsg!.msg.roleIcon).toBeTruthy();
        expect(roleMsg!.msg.team).toBeTruthy();
      });
    });

    it("should reveal evil team members to evil players", async () => {
      const { clients, room } = await setupGame(5);
      const roles = getPlayerRoles(room);

      // Find an evil player
      const evilClient = clients.find((c) => ROLE_TEAM[roles.get(c.sessionId)!] === "evil");
      expect(evilClient).toBeDefined();

      const roleMsg = evilClient!.sends.find((s) => s.type === "ROLE_DATA");
      expect(roleMsg!.msg.evilPlayers).toBeDefined();
      expect(roleMsg!.msg.evilPlayers.length).toBeGreaterThan(0);
    });

    it("should reveal evil players to the leader role", async () => {
      const { clients, room } = await setupGame(5);
      const roles = getPlayerRoles(room);

      const leaderClient = clients.find((c) => roles.get(c.sessionId) === "leader");
      expect(leaderClient).toBeDefined();

      const roleMsg = leaderClient!.sends.find((s) => s.type === "ROLE_DATA");
      expect(roleMsg!.msg.evilPlayers).toBeDefined();
      expect(roleMsg!.msg.evilPlayers.length).toBe(2); // 5 players = 2 evil
    });

    it("should transition to TEAM_PROPOSAL after role reveal timer", async () => {
      const { room, state } = await setupGame(5);
      expect(state.phase).toBe("ROLE_REVEAL");
      skipRoleReveal(room);
      expect(state.phase).toBe("TEAM_PROPOSAL");
    });

    it("should set leader rotation order on game start", async () => {
      const { room } = await setupGame(5);
      const order = getLeaderOrder(room);
      expect(order).toHaveLength(5);
    });
  });

  // ─── Team Proposal Tests ─────────────────────────────────────

  describe("Team proposal", () => {
    it("should set currentLeaderId on TEAM_PROPOSAL", async () => {
      const { room, state } = await setupGame(5);
      skipRoleReveal(room);
      expect(state.currentLeaderId).toBeTruthy();
      expect(state.currentLeaderNickname).toBeTruthy();
    });

    it("should set correct mission team size", async () => {
      const { room, state } = await setupGame(5);
      skipRoleReveal(room);
      expect(state.currentMission).toBe(1);
      expect(state.currentMissionTeamSize).toBe(2); // 5 players, mission 1 = 2
    });

    it("should only allow current leader to propose", async () => {
      const { room, clients, state } = await setupGame(5);
      skipRoleReveal(room);

      const nonLeader = clients.find((c) => c.sessionId !== state.currentLeaderId)!;
      nonLeader.sends = [];
      sendMessage(room, nonLeader, "PROPOSE_TEAM", { teamIds: ["player-0", "player-1"] });
      const error = nonLeader.sends.find((s) => s.type === "ERROR");
      expect(error?.msg.code).toBe("NOT_LEADER");
    });

    it("should reject proposals with wrong team size", async () => {
      const { room, clients, state } = await setupGame(5);
      skipRoleReveal(room);

      const leaderClient = clients.find((c) => c.sessionId === state.currentLeaderId)!;
      leaderClient.sends = [];
      sendMessage(room, leaderClient, "PROPOSE_TEAM", { teamIds: ["player-0"] });
      const error = leaderClient.sends.find((s) => s.type === "ERROR");
      expect(error?.msg.code).toBe("INVALID_TEAM_SIZE");
    });

    it("should reject proposals with duplicate members", async () => {
      const { room, clients, state } = await setupGame(5);
      skipRoleReveal(room);

      const leaderClient = clients.find((c) => c.sessionId === state.currentLeaderId)!;
      leaderClient.sends = [];
      sendMessage(room, leaderClient, "PROPOSE_TEAM", { teamIds: ["player-0", "player-0"] });
      const error = leaderClient.sends.find((s) => s.type === "ERROR");
      expect(error?.msg.code).toBe("DUPLICATE_MEMBER");
    });

    it("should accept valid team proposal and move to TEAM_VOTE", async () => {
      const { room, clients, state } = await setupGame(5);
      skipRoleReveal(room);

      const leaderClient = clients.find((c) => c.sessionId === state.currentLeaderId)!;
      const teamIds = clients.slice(0, 2).map((c) => c.sessionId);
      sendMessage(room, leaderClient, "PROPOSE_TEAM", { teamIds });
      expect(state.phase).toBe("TEAM_VOTE");
    });

    it("should mark proposed team members with isOnTeam", async () => {
      const { room, clients, state } = await setupGame(5);
      skipRoleReveal(room);

      const leaderClient = clients.find((c) => c.sessionId === state.currentLeaderId)!;
      const teamIds = clients.slice(0, 2).map((c) => c.sessionId);
      sendMessage(room, leaderClient, "PROPOSE_TEAM", { teamIds });

      teamIds.forEach((id) => {
        const player = state.players.get(id) as KnightsPlayer;
        expect(player.isOnTeam).toBe(true);
      });
    });

    it("should auto-reject on proposal timeout", async () => {
      const { room, state } = await setupGame(5);
      skipRoleReveal(room);

      const firstLeaderId = state.currentLeaderId;
      expect(state.consecutiveRejections).toBe(0);

      // Timeout the proposal
      advanceClock(room, 60000);

      expect(state.consecutiveRejections).toBe(1);
      // After rejection pause, new proposal should start
      advanceClock(room, 2000);
      expect(state.phase).toBe("TEAM_PROPOSAL");
    });
  });

  // ─── Team Vote Tests ──────────────────────────────────────────

  describe("Team vote", () => {
    it("should allow all players to vote approve/reject", async () => {
      const { room, clients, state } = await setupGame(5);
      skipRoleReveal(room);

      const leaderClient = clients.find((c) => c.sessionId === state.currentLeaderId)!;
      const teamIds = clients.slice(0, 2).map((c) => c.sessionId);
      sendMessage(room, leaderClient, "PROPOSE_TEAM", { teamIds });
      expect(state.phase).toBe("TEAM_VOTE");
      expect(state.teamVotersExpected).toBe(5);

      // All approve
      clients.forEach((c) => {
        sendMessage(room, c, "TEAM_VOTE", { vote: "approve" });
      });

      expect(state.phase).toBe("MISSION");
    });

    it("should reject team when majority rejects", async () => {
      const { room, clients, state } = await setupGame(5);
      skipRoleReveal(room);

      const leaderClient = clients.find((c) => c.sessionId === state.currentLeaderId)!;
      const teamIds = clients.slice(0, 2).map((c) => c.sessionId);
      sendMessage(room, leaderClient, "PROPOSE_TEAM", { teamIds });

      // 3 reject, 2 approve
      clients.slice(0, 3).forEach((c) => {
        sendMessage(room, c, "TEAM_VOTE", { vote: "reject" });
      });
      clients.slice(3).forEach((c) => {
        sendMessage(room, c, "TEAM_VOTE", { vote: "approve" });
      });

      expect(state.consecutiveRejections).toBe(1);
    });

    it("should broadcast TEAM_VOTE_RESULT with public votes (Loki L2)", async () => {
      const { room, clients, state } = await setupGame(5);
      skipRoleReveal(room);

      const leaderClient = clients.find((c) => c.sessionId === state.currentLeaderId)!;
      const teamIds = clients.slice(0, 2).map((c) => c.sessionId);
      sendMessage(room, leaderClient, "PROPOSE_TEAM", { teamIds });

      clients.forEach((c) => {
        c.sends = [];
        sendMessage(room, c, "TEAM_VOTE", { vote: "approve" });
      });

      // Check that broadcast includes individual vote data
      const lastClient = clients[clients.length - 1];
      const voteResult = lastClient.sends.find((s) => s.type === "TEAM_VOTE_RESULT");
      expect(voteResult).toBeDefined();
      expect(voteResult!.msg.votes).toBeDefined();
      expect(voteResult!.msg.votes.length).toBe(5);
    });

    it("should not allow double voting", async () => {
      const { room, clients, state } = await setupGame(5);
      skipRoleReveal(room);

      const leaderClient = clients.find((c) => c.sessionId === state.currentLeaderId)!;
      const teamIds = clients.slice(0, 2).map((c) => c.sessionId);
      sendMessage(room, leaderClient, "PROPOSE_TEAM", { teamIds });

      sendMessage(room, clients[0], "TEAM_VOTE", { vote: "approve" });
      clients[0].sends = [];
      sendMessage(room, clients[0], "TEAM_VOTE", { vote: "reject" });
      const error = clients[0].sends.find((s) => s.type === "ERROR");
      expect(error?.msg.code).toBe("ALREADY_VOTED");
    });

    it("should resolve vote on timeout (unvoted = reject)", async () => {
      const { room, clients, state } = await setupGame(5);
      skipRoleReveal(room);

      const leaderClient = clients.find((c) => c.sessionId === state.currentLeaderId)!;
      const teamIds = clients.slice(0, 2).map((c) => c.sessionId);
      sendMessage(room, leaderClient, "PROPOSE_TEAM", { teamIds });

      // Only 2 approve, 3 don't vote (timeout -> reject)
      sendMessage(room, clients[0], "TEAM_VOTE", { vote: "approve" });
      sendMessage(room, clients[1], "TEAM_VOTE", { vote: "approve" });

      advanceClock(room, 30000); // team vote timeout

      expect(state.consecutiveRejections).toBe(1);
    });
  });

  // ─── Mission Vote Tests ───────────────────────────────────────

  describe("Mission voting", () => {
    it("should allow only team members to vote on mission", async () => {
      const { room, clients, state } = await setupGame(5);
      skipRoleReveal(room);

      const leaderClient = clients.find((c) => c.sessionId === state.currentLeaderId)!;
      const teamIds = clients.slice(0, 2).map((c) => c.sessionId);
      sendMessage(room, leaderClient, "PROPOSE_TEAM", { teamIds });
      clients.forEach((c) => sendMessage(room, c, "TEAM_VOTE", { vote: "approve" }));

      expect(state.phase).toBe("MISSION");

      // Non-team member tries to vote
      const nonTeam = clients.find((c) => !teamIds.includes(c.sessionId))!;
      nonTeam.sends = [];
      sendMessage(room, nonTeam, "MISSION_VOTE", { vote: "success" });
      const error = nonTeam.sends.find((s) => s.type === "ERROR");
      expect(error?.msg.code).toBe("NOT_ON_TEAM");
    });

    it("should enforce good players must vote success (KN-003.2)", async () => {
      const { room, clients, state } = await setupGame(5);
      skipRoleReveal(room);

      // Force roles so we know who's good
      forceRoles(room, {
        "player-0": "leader",
        "player-1": "good-knight",
        "player-2": "good-knight",
        "player-3": "assassin",
        "player-4": "traitor",
      });

      const leaderClient = clients[0]; // leader is player-0
      // Force leader order so player-0 is the leader
      (room as any).leaderOrder = clients.map((c) => c.sessionId);
      (room as any).currentLeaderIndex = 0;

      // Start proposal fresh
      (room as any).startTeamProposal();

      const teamIds = ["player-0", "player-1"];
      sendMessage(room, leaderClient, "PROPOSE_TEAM", { teamIds });
      clients.forEach((c) => sendMessage(room, c, "TEAM_VOTE", { vote: "approve" }));

      expect(state.phase).toBe("MISSION");

      // Good player tries to vote fail
      clients[0].sends = [];
      sendMessage(room, clients[0], "MISSION_VOTE", { vote: "fail" });
      const error = clients[0].sends.find((s) => s.type === "ERROR");
      expect(error?.msg.code).toBe("GOOD_MUST_SUCCEED");
    });

    it("should allow evil players to vote fail", async () => {
      const { room, clients, state } = await setupGame(5);
      skipRoleReveal(room);

      // Force roles
      forceRoles(room, {
        "player-0": "leader",
        "player-1": "assassin",
        "player-2": "good-knight",
        "player-3": "good-knight",
        "player-4": "traitor",
      });
      (room as any).leaderOrder = clients.map((c) => c.sessionId);
      (room as any).currentLeaderIndex = 0;
      (room as any).startTeamProposal();

      // Propose team with evil member
      const teamIds = ["player-0", "player-1"];
      sendMessage(room, clients[0], "PROPOSE_TEAM", { teamIds });
      clients.forEach((c) => sendMessage(room, c, "TEAM_VOTE", { vote: "approve" }));

      expect(state.phase).toBe("MISSION");

      // Evil player votes fail
      sendMessage(room, clients[1], "MISSION_VOTE", { vote: "fail" });
      const missionVotes = getMissionVotes(room);
      expect(missionVotes.get("player-1")).toBe("fail");
    });

    it("should succeed mission when all vote success", async () => {
      const { room, clients, state } = await setupGame(5);
      skipRoleReveal(room);

      forceRoles(room, {
        "player-0": "leader",
        "player-1": "good-knight",
        "player-2": "good-knight",
        "player-3": "assassin",
        "player-4": "traitor",
      });
      (room as any).leaderOrder = clients.map((c) => c.sessionId);
      (room as any).currentLeaderIndex = 0;
      (room as any).startTeamProposal();

      const teamIds = ["player-0", "player-1"];
      sendMessage(room, clients[0], "PROPOSE_TEAM", { teamIds });
      clients.forEach((c) => sendMessage(room, c, "TEAM_VOTE", { vote: "approve" }));

      // Both vote success
      sendMessage(room, clients[0], "MISSION_VOTE", { vote: "success" });
      sendMessage(room, clients[1], "MISSION_VOTE", { vote: "success" });

      expect(state.goodWins).toBe(1);
      expect(state.evilWins).toBe(0);
      expect(state.missionHistory.length).toBe(1);
      expect(state.missionHistory.at(0)!.succeeded).toBe(true);
    });

    it("should fail mission when 1 fail vote (default rule)", async () => {
      const { room, clients, state } = await setupGame(5);
      skipRoleReveal(room);

      forceRoles(room, {
        "player-0": "leader",
        "player-1": "assassin",
        "player-2": "good-knight",
        "player-3": "good-knight",
        "player-4": "traitor",
      });
      (room as any).leaderOrder = clients.map((c) => c.sessionId);
      (room as any).currentLeaderIndex = 0;
      (room as any).startTeamProposal();

      const teamIds = ["player-0", "player-1"];
      sendMessage(room, clients[0], "PROPOSE_TEAM", { teamIds });
      clients.forEach((c) => sendMessage(room, c, "TEAM_VOTE", { vote: "approve" }));

      sendMessage(room, clients[0], "MISSION_VOTE", { vote: "success" });
      sendMessage(room, clients[1], "MISSION_VOTE", { vote: "fail" });

      expect(state.evilWins).toBe(1);
      expect(state.missionHistory.at(0)!.succeeded).toBe(false);
      expect(state.missionHistory.at(0)!.failVotes).toBe(1);
    });

    it("should not reveal individual mission votes (Loki H1)", async () => {
      const { room, clients, state } = await setupGame(5);
      skipRoleReveal(room);

      forceRoles(room, {
        "player-0": "leader",
        "player-1": "assassin",
        "player-2": "good-knight",
        "player-3": "good-knight",
        "player-4": "traitor",
      });
      (room as any).leaderOrder = clients.map((c) => c.sessionId);
      (room as any).currentLeaderIndex = 0;
      (room as any).startTeamProposal();

      const teamIds = ["player-0", "player-1"];
      sendMessage(room, clients[0], "PROPOSE_TEAM", { teamIds });
      clients.forEach((c) => sendMessage(room, c, "TEAM_VOTE", { vote: "approve" }));

      // Clear sends before mission vote
      clients.forEach((c) => { c.sends = []; });

      sendMessage(room, clients[0], "MISSION_VOTE", { vote: "success" });
      sendMessage(room, clients[1], "MISSION_VOTE", { vote: "fail" });

      // Check that MISSION_RESULT only has aggregate counts
      clients.forEach((c) => {
        const result = c.sends.find((s) => s.type === "MISSION_RESULT");
        if (result) {
          expect(result.msg.successVotes).toBeDefined();
          expect(result.msg.failVotes).toBeDefined();
          // Should NOT have individual vote data
          expect(result.msg.votes).toBeUndefined();
          expect(result.msg.individualVotes).toBeUndefined();
        }
      });
    });

    it("should auto-vote success on mission timeout", async () => {
      const { room, clients, state } = await setupGame(5);
      skipRoleReveal(room);

      forceRoles(room, {
        "player-0": "leader",
        "player-1": "good-knight",
        "player-2": "good-knight",
        "player-3": "assassin",
        "player-4": "traitor",
      });
      (room as any).leaderOrder = clients.map((c) => c.sessionId);
      (room as any).currentLeaderIndex = 0;
      (room as any).startTeamProposal();

      const teamIds = ["player-0", "player-1"];
      sendMessage(room, clients[0], "PROPOSE_TEAM", { teamIds });
      clients.forEach((c) => sendMessage(room, c, "TEAM_VOTE", { vote: "approve" }));

      // Don't vote -- let timeout handle it
      advanceClock(room, 30000);

      expect(state.goodWins).toBe(1); // auto-success
      expect(state.missionHistory.at(0)!.successVotes).toBe(2);
    });
  });

  // ─── Mission 4 Double-Fail Rule ───────────────────────────────

  describe("Mission 4 double-fail rule (KN-003.4)", () => {
    it("should require 2 fails for mission 4 with 7+ players", async () => {
      const { room, clients, state } = await setupGame(7);
      skipRoleReveal(room);

      // Force mission 4 context
      state.currentMission = 3; // after this resolves, it goes to mission 4
      state.goodWins = 2;
      state.evilWins = 0;

      // Start mission 4 directly
      (room as any).startMission(4);

      expect(state.currentMission).toBe(4);
      expect(state.currentMissionDoubleFail).toBe(true);
      expect(state.currentMissionTeamSize).toBe(4); // 7 players, mission 4 = 4

      // Force leader and propose team
      const leaderId = state.currentLeaderId;
      const leaderClient = clients.find((c) => c.sessionId === leaderId)!;
      const teamIds = clients.slice(0, 4).map((c) => c.sessionId);
      sendMessage(room, leaderClient, "PROPOSE_TEAM", { teamIds });
      clients.forEach((c) => sendMessage(room, c, "TEAM_VOTE", { vote: "approve" }));

      // Force roles so 2 evil are on team
      forceRoles(room, {
        [clients[0].sessionId]: "leader",
        [clients[1].sessionId]: "assassin",
        [clients[2].sessionId]: "traitor",
        [clients[3].sessionId]: "good-knight",
        [clients[4].sessionId]: "good-knight",
        [clients[5].sessionId]: "good-knight",
        [clients[6].sessionId]: "double-agent",
      });

      // 1 fail + 3 success = mission SUCCEEDS (need 2 fails)
      sendMessage(room, clients[0], "MISSION_VOTE", { vote: "success" });
      sendMessage(room, clients[1], "MISSION_VOTE", { vote: "fail" });
      sendMessage(room, clients[2], "MISSION_VOTE", { vote: "success" });
      sendMessage(room, clients[3], "MISSION_VOTE", { vote: "success" });

      const lastMission = state.missionHistory.at(state.missionHistory.length - 1)!;
      expect(lastMission.failVotes).toBe(1);
      expect(lastMission.succeeded).toBe(true); // 1 fail < 2 needed
    });

    it("should NOT require 2 fails for mission 4 with 5-6 players", async () => {
      const { room, clients, state } = await setupGame(5);
      skipRoleReveal(room);

      (room as any).startMission(4);
      expect(state.currentMissionDoubleFail).toBe(false);
    });
  });

  // ─── Hammer Rule Tests ────────────────────────────────────────

  describe("Hammer rule (5 consecutive rejections = evil wins, KN-002.4)", () => {
    it("should track consecutive rejections in synced state (Loki H3)", async () => {
      const { room, clients, state } = await setupGame(5);
      skipRoleReveal(room);

      // Reject first proposal
      const leaderClient = clients.find((c) => c.sessionId === state.currentLeaderId)!;
      const teamIds = clients.slice(0, 2).map((c) => c.sessionId);
      sendMessage(room, leaderClient, "PROPOSE_TEAM", { teamIds });

      clients.forEach((c) => sendMessage(room, c, "TEAM_VOTE", { vote: "reject" }));
      expect(state.consecutiveRejections).toBe(1);
    });

    it("should end game when 5 proposals rejected", async () => {
      const { room, clients, state } = await setupGame(5);
      skipRoleReveal(room);

      for (let i = 0; i < 5; i++) {
        const leaderId = state.currentLeaderId;
        const leaderClient = clients.find((c) => c.sessionId === leaderId)!;
        const teamIds = clients.slice(0, 2).map((c) => c.sessionId);
        sendMessage(room, leaderClient, "PROPOSE_TEAM", { teamIds });
        clients.forEach((c) => sendMessage(room, c, "TEAM_VOTE", { vote: "reject" }));

        if (i < 4) {
          // Wait for rejection handling pause
          advanceClock(room, 2000);
        }
      }

      expect(state.phase).toBe("GAME_OVER");
      expect(state.winner).toBe("evil");
      expect(state.winReason).toBe("hammer_rule");
    });

    it("should reset consecutive rejections on new mission", async () => {
      const { room, clients, state } = await setupGame(5);
      skipRoleReveal(room);

      forceRoles(room, {
        "player-0": "leader",
        "player-1": "good-knight",
        "player-2": "good-knight",
        "player-3": "assassin",
        "player-4": "traitor",
      });
      (room as any).leaderOrder = clients.map((c) => c.sessionId);
      (room as any).currentLeaderIndex = 0;
      (room as any).startTeamProposal();

      // Reject once, then approve
      sendMessage(room, clients[0], "PROPOSE_TEAM", { teamIds: ["player-0", "player-1"] });
      clients.forEach((c) => sendMessage(room, c, "TEAM_VOTE", { vote: "reject" }));
      expect(state.consecutiveRejections).toBe(1);

      advanceClock(room, 2000);
      // Now approve
      const leaderId2 = state.currentLeaderId;
      const leaderClient2 = clients.find((c) => c.sessionId === leaderId2)!;
      sendMessage(room, leaderClient2, "PROPOSE_TEAM", { teamIds: ["player-0", "player-1"] });
      clients.forEach((c) => sendMessage(room, c, "TEAM_VOTE", { vote: "approve" }));

      // Complete mission
      sendMessage(room, clients[0], "MISSION_VOTE", { vote: "success" });
      sendMessage(room, clients[1], "MISSION_VOTE", { vote: "success" });

      // Wait for mission reveal
      advanceClock(room, 5000);

      // Rejections should reset for the new mission
      expect(state.consecutiveRejections).toBe(0);
    });
  });

  // ─── Win Condition Tests ──────────────────────────────────────

  describe("Win conditions", () => {
    /**
     * Helper: directly start a mission vote and execute it.
     * Bypasses proposal/vote chain (which is tested separately).
     * Sets up proposed team and directly invokes startMissionVote.
     */
    function directMission(room: any, clients: MockClient[], failVote: boolean) {
      const state = getState(room);
      expect(state.phase).toBe("TEAM_PROPOSAL");

      // Set up proposed team directly
      const proposedTeam = (room as any).proposedTeam as Set<string>;
      proposedTeam.clear();
      proposedTeam.add("player-0");
      proposedTeam.add("player-1");
      const p0 = state.players.get("player-0") as KnightsPlayer;
      const p1 = state.players.get("player-1") as KnightsPlayer;
      if (p0) { p0.isOnTeam = true; p0.hasMissionVoted = false; }
      if (p1) { p1.isOnTeam = true; p1.hasMissionVoted = false; }

      (room as any).startMissionVote();
      expect(state.phase).toBe("MISSION");

      sendMessage(room, clients[0], "MISSION_VOTE", { vote: "success" });
      sendMessage(room, clients[1], "MISSION_VOTE", { vote: failVote ? "fail" : "success" });
    }

    it("should trigger ASSASSIN_GUESS when good wins 3 missions", async () => {
      const { room, clients, state } = await setupGame(5);
      skipRoleReveal(room);

      forceRoles(room, {
        "player-0": "leader",
        "player-1": "good-knight",
        "player-2": "good-knight",
        "player-3": "assassin",
        "player-4": "traitor",
      });
      (room as any).leaderOrder = clients.map((c) => c.sessionId);

      for (let mission = 0; mission < 3; mission++) {
        directMission(room, clients, false);
        expect(state.goodWins).toBe(mission + 1);
        advanceClock(room, 5000);
      }

      expect(state.phase).toBe("ASSASSIN_GUESS");
    });

    it("should end game as evil win when 3 missions fail", async () => {
      const { room, clients, state } = await setupGame(5);
      skipRoleReveal(room);

      forceRoles(room, {
        "player-0": "leader",
        "player-1": "assassin",
        "player-2": "good-knight",
        "player-3": "good-knight",
        "player-4": "traitor",
      });
      (room as any).leaderOrder = clients.map((c) => c.sessionId);

      for (let mission = 0; mission < 3; mission++) {
        directMission(room, clients, true);
        expect(state.evilWins).toBe(mission + 1);
        advanceClock(room, 5000);
      }

      expect(state.phase).toBe("GAME_OVER");
      expect(state.winner).toBe("evil");
      expect(state.winReason).toBe("three_missions_failed");
    });
  });

  // ─── Assassin Guess Tests ─────────────────────────────────────

  describe("Assassin guess (KN-004.3/KN-004.4)", () => {
    async function setupAssassinPhase() {
      const { room, clients, state } = await setupGame(5);
      skipRoleReveal(room);

      forceRoles(room, {
        "player-0": "leader",
        "player-1": "good-knight",
        "player-2": "good-knight",
        "player-3": "assassin",
        "player-4": "traitor",
      });
      (room as any).leaderOrder = clients.map((c) => c.sessionId);

      // Win 3 missions via direct mission approach
      for (let mission = 0; mission < 3; mission++) {
        expect(state.phase).toBe("TEAM_PROPOSAL");
        const proposedTeam = (room as any).proposedTeam as Set<string>;
        proposedTeam.clear();
        proposedTeam.add("player-0");
        proposedTeam.add("player-1");
        const p0 = state.players.get("player-0") as KnightsPlayer;
        const p1 = state.players.get("player-1") as KnightsPlayer;
        if (p0) { p0.isOnTeam = true; p0.hasMissionVoted = false; }
        if (p1) { p1.isOnTeam = true; p1.hasMissionVoted = false; }

        (room as any).startMissionVote();
        sendMessage(room, clients[0], "MISSION_VOTE", { vote: "success" });
        sendMessage(room, clients[1], "MISSION_VOTE", { vote: "success" });
        advanceClock(room, 5000);
      }

      expect(state.phase).toBe("ASSASSIN_GUESS");
      return { room, clients, state };
    }

    it("should send ASSASSIN_TARGETS to the assassin", async () => {
      const { clients } = await setupAssassinPhase();
      const assassin = clients[3]; // player-3 is assassin
      const targetsMsg = assassin.sends.find((s) => s.type === "ASSASSIN_TARGETS");
      expect(targetsMsg).toBeDefined();
      expect(targetsMsg!.msg.targets.length).toBe(3); // 3 good players
    });

    it("should end as evil win when assassin guesses leader correctly", async () => {
      const { room, clients, state } = await setupAssassinPhase();
      const assassin = clients[3];

      sendMessage(room, assassin, "ASSASSIN_GUESS", { targetId: "player-0" });
      expect(state.phase).toBe("GAME_OVER");
      expect(state.winner).toBe("evil");
      expect(state.winReason).toBe("assassin_killed_leader");
      expect(state.assassinGuessCorrect).toBe(true);
    });

    it("should end as good win when assassin guesses wrong", async () => {
      const { room, clients, state } = await setupAssassinPhase();
      const assassin = clients[3];

      sendMessage(room, assassin, "ASSASSIN_GUESS", { targetId: "player-1" }); // good-knight, not leader
      expect(state.phase).toBe("GAME_OVER");
      expect(state.winner).toBe("good");
      expect(state.winReason).toBe("assassin_missed");
      expect(state.assassinGuessCorrect).toBe(false);
    });

    it("should end as good win when assassin guess times out (Loki M4)", async () => {
      const { room, state } = await setupAssassinPhase();

      advanceClock(room, 30000);
      expect(state.phase).toBe("GAME_OVER");
      expect(state.winner).toBe("good");
      expect(state.winReason).toBe("assassin_timeout");
    });

    it("should only allow assassin to make the guess", async () => {
      const { room, clients } = await setupAssassinPhase();
      const nonAssassin = clients[0];

      nonAssassin.sends = [];
      sendMessage(room, nonAssassin, "ASSASSIN_GUESS", { targetId: "player-1" });
      const error = nonAssassin.sends.find((s) => s.type === "ERROR");
      expect(error?.msg.code).toBe("NOT_ASSASSIN");
    });

    it("should only allow guessing good team players", async () => {
      const { room, clients } = await setupAssassinPhase();
      const assassin = clients[3];

      assassin.sends = [];
      sendMessage(room, assassin, "ASSASSIN_GUESS", { targetId: "player-4" }); // traitor
      const error = assassin.sends.find((s) => s.type === "ERROR");
      expect(error?.msg.code).toBe("INVALID_TARGET");
    });
  });

  // ─── Game Over Tests ──────────────────────────────────────────

  describe("Game over", () => {
    it("should reveal all roles on game over", async () => {
      const { room, clients, state } = await setupGame(5);
      skipRoleReveal(room);

      forceRoles(room, {
        "player-0": "leader",
        "player-1": "good-knight",
        "player-2": "good-knight",
        "player-3": "assassin",
        "player-4": "traitor",
      });

      // Force hammer rule
      for (let i = 0; i < 5; i++) {
        (room as any).leaderOrder = clients.map((c) => c.sessionId);
        (room as any).currentLeaderIndex = 0;
        (room as any).startTeamProposal();
        const leaderId = state.currentLeaderId;
        const leaderClient = clients.find((c) => c.sessionId === leaderId)!;
        sendMessage(room, leaderClient, "PROPOSE_TEAM", { teamIds: ["player-0", "player-1"] });
        clients.forEach((c) => sendMessage(room, c, "TEAM_VOTE", { vote: "reject" }));
        if (state.phase === "GAME_OVER") break;
        advanceClock(room, 2000);
      }

      expect(state.phase).toBe("GAME_OVER");

      // Check revealed roles in state
      getPlayers(room).forEach((p) => {
        expect(p.revealedRole).toBeTruthy();
        expect(p.revealedTeam).toBeTruthy();
      });
    });

    it("should broadcast GAME_OVER with full player data", async () => {
      const { room, clients, state } = await setupGame(5);
      skipRoleReveal(room);

      // Quick game over via hammer
      (room as any).endGame("evil", "test_end");

      const gameOverMsg = clients[0].sends.find((s) => s.type === "GAME_OVER");
      expect(gameOverMsg).toBeDefined();
      expect(gameOverMsg!.msg.winner).toBe("evil");
      expect(gameOverMsg!.msg.players).toHaveLength(5);
      expect(gameOverMsg!.msg.missionHistory).toBeDefined();
    });
  });

  // ─── Leader Rotation Tests ────────────────────────────────────

  describe("Leader rotation (Loki M2)", () => {
    it("should rotate leader after rejected proposal", async () => {
      const { room, clients, state } = await setupGame(5);
      skipRoleReveal(room);

      const firstLeaderId = state.currentLeaderId;
      const leaderClient = clients.find((c) => c.sessionId === firstLeaderId)!;
      sendMessage(room, leaderClient, "PROPOSE_TEAM", {
        teamIds: clients.slice(0, 2).map((c) => c.sessionId),
      });
      clients.forEach((c) => sendMessage(room, c, "TEAM_VOTE", { vote: "reject" }));
      advanceClock(room, 2000);

      const secondLeaderId = state.currentLeaderId;
      expect(secondLeaderId).not.toBe(firstLeaderId);
    });
  });

  // ─── Reconnect Tests ─────────────────────────────────────────

  describe("Reconnect handling (Loki H2)", () => {
    it("should send ROLE_DATA on reconnect", async () => {
      const { room, clients, state } = await setupGame(5);
      skipRoleReveal(room);

      const client = clients[0];
      client.sends = [];
      (room as any).onPlayerReconnected(client, state.players.get(client.sessionId));

      const roleMsg = client.sends.find((s) => s.type === "ROLE_DATA");
      expect(roleMsg).toBeDefined();
      expect(roleMsg!.msg.role).toBeTruthy();
    });

    it("should send PHASE_CONTEXT on reconnect", async () => {
      const { room, clients, state } = await setupGame(5);
      skipRoleReveal(room);

      const client = clients[0];
      client.sends = [];
      (room as any).onPlayerReconnected(client, state.players.get(client.sessionId));

      const contextMsg = client.sends.find((s) => s.type === "PHASE_CONTEXT");
      expect(contextMsg).toBeDefined();
      expect(contextMsg!.msg.phase).toBe("TEAM_PROPOSAL");
      expect(contextMsg!.msg.currentMission).toBe(1);
    });

    it("should NOT send individual vote data on reconnect", async () => {
      const { room, clients, state } = await setupGame(5);
      skipRoleReveal(room);

      const client = clients[0];
      client.sends = [];
      (room as any).onPlayerReconnected(client, state.players.get(client.sessionId));

      // Should not contain any vote breakdown messages
      const msgs = client.sends;
      msgs.forEach((m) => {
        if (m.type === "PHASE_CONTEXT") {
          expect(m.msg.votes).toBeUndefined();
          expect(m.msg.missionVotes).toBeUndefined();
        }
      });
    });
  });

  // ─── 7+ Player Special Roles ─────────────────────────────────

  describe("7+ player special roles (Loki M1)", () => {
    it("should include advisor and double-agent for 7 players", async () => {
      const { room } = await setupGame(7);
      const roleValues = Array.from(getPlayerRoles(room).values());
      expect(roleValues).toContain("advisor");
      expect(roleValues).toContain("double-agent");
    });

    it("should show leader candidates to advisor (leader + double-agent)", async () => {
      const { room, clients } = await setupGame(7);
      const roles = getPlayerRoles(room);

      const advisorClient = clients.find((c) => roles.get(c.sessionId) === "advisor");
      if (advisorClient) {
        const roleMsg = advisorClient.sends.find((s) => s.type === "ROLE_DATA");
        expect(roleMsg!.msg.leaderCandidates).toBeDefined();
        expect(roleMsg!.msg.leaderCandidates.length).toBe(2); // leader + double-agent
      }
    });

    it("should NOT include advisor/double-agent for 5 players", async () => {
      const { room } = await setupGame(5);
      const roleValues = Array.from(getPlayerRoles(room).values());
      expect(roleValues).not.toContain("advisor");
      expect(roleValues).not.toContain("double-agent");
    });
  });

  // ─── IP Audit (Loki M5) ──────────────────────────────────────

  describe("IP audit -- Thai role names (Loki M5)", () => {
    it("should have no Avalon-specific terms in role names", () => {
      const avalonTerms = ["merlin", "mordred", "percival", "morgana", "oberon", "avalon"];
      const allRoleNames = Object.values(ROLE_NAMES_TH);
      const allRoleKeys: string[] = Object.keys(ROLE_NAMES_TH);

      avalonTerms.forEach((term) => {
        allRoleNames.forEach((name) => {
          expect(name.toLowerCase()).not.toContain(term);
        });
        allRoleKeys.forEach((key) => {
          expect(key.toLowerCase()).not.toContain(term);
        });
      });
    });

    it("should have Thai names for all roles", () => {
      Object.values(ROLE_NAMES_TH).forEach((name) => {
        // Thai characters are in Unicode range U+0E00-U+0E7F
        expect(/[฀-๿]/.test(name)).toBe(true);
      });
    });
  });

  // ─── Edge Cases ──────────────────────────────────────────────

  describe("Edge cases", () => {
    it("should handle game restart from GAME_OVER", async () => {
      const { room, clients, state } = await setupGame(5);
      skipRoleReveal(room);

      // Force game over
      (room as any).endGame("evil", "test");
      expect(state.phase).toBe("GAME_OVER");

      // Restart
      sendMessage(room, clients[0], "START_GAME");
      expect(state.phase).toBe("ROLE_REVEAL");
    });

    it("should not allow mission vote outside MISSION phase", async () => {
      const { room, clients, state } = await setupGame(5);
      skipRoleReveal(room);

      clients[0].sends = [];
      sendMessage(room, clients[0], "MISSION_VOTE", { vote: "success" });
      const error = clients[0].sends.find((s) => s.type === "ERROR");
      expect(error?.msg.code).toBe("INVALID_PHASE");
    });

    it("should not allow team vote outside TEAM_VOTE phase", async () => {
      const { room, clients } = await setupGame(5);
      skipRoleReveal(room);

      clients[0].sends = [];
      sendMessage(room, clients[0], "TEAM_VOTE", { vote: "approve" });
      const error = clients[0].sends.find((s) => s.type === "ERROR");
      expect(error?.msg.code).toBe("INVALID_PHASE");
    });

    it("should not allow assassin guess outside ASSASSIN_GUESS phase", async () => {
      const { room, clients } = await setupGame(5);
      skipRoleReveal(room);

      clients[0].sends = [];
      sendMessage(room, clients[0], "ASSASSIN_GUESS", { targetId: "player-1" });
      const error = clients[0].sends.find((s) => s.type === "ERROR");
      expect(error?.msg.code).toBe("INVALID_PHASE");
    });

    it("should broadcast MISSION_VOTE_PROGRESS without individual identities", async () => {
      const { room, clients, state } = await setupGame(5);
      skipRoleReveal(room);

      forceRoles(room, {
        "player-0": "leader",
        "player-1": "good-knight",
        "player-2": "good-knight",
        "player-3": "assassin",
        "player-4": "traitor",
      });
      (room as any).leaderOrder = clients.map((c) => c.sessionId);
      (room as any).currentLeaderIndex = 0;
      (room as any).startTeamProposal();

      sendMessage(room, clients[0], "PROPOSE_TEAM", { teamIds: ["player-0", "player-1"] });
      clients.forEach((c) => sendMessage(room, c, "TEAM_VOTE", { vote: "approve" }));

      clients.forEach((c) => { c.sends = []; });
      sendMessage(room, clients[0], "MISSION_VOTE", { vote: "success" });

      // Check progress broadcast
      const progress = clients[2].sends.find((s) => s.type === "MISSION_VOTE_PROGRESS");
      if (progress) {
        expect(progress.msg.missionVotesCast).toBe(1);
        expect(progress.msg.missionVotersExpected).toBe(2);
        // Should NOT reveal who voted
        expect(progress.msg.voterId).toBeUndefined();
        expect(progress.msg.vote).toBeUndefined();
      }
    });

    it("should send MISSION_VOTE_CONFIRMED privately to voter", async () => {
      const { room, clients, state } = await setupGame(5);
      skipRoleReveal(room);

      forceRoles(room, {
        "player-0": "leader",
        "player-1": "good-knight",
        "player-2": "good-knight",
        "player-3": "assassin",
        "player-4": "traitor",
      });
      (room as any).leaderOrder = clients.map((c) => c.sessionId);
      (room as any).currentLeaderIndex = 0;
      (room as any).startTeamProposal();

      sendMessage(room, clients[0], "PROPOSE_TEAM", { teamIds: ["player-0", "player-1"] });
      clients.forEach((c) => sendMessage(room, c, "TEAM_VOTE", { vote: "approve" }));

      clients[0].sends = [];
      sendMessage(room, clients[0], "MISSION_VOTE", { vote: "success" });
      const confirm = clients[0].sends.find((s) => s.type === "MISSION_VOTE_CONFIRMED");
      expect(confirm).toBeDefined();
      expect(confirm!.msg.vote).toBe("success");
    });
  });
});
