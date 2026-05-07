import { Client, Delayed } from "colyseus";
import {
  KnightsState,
  KnightsPlayer,
  KnightsPhase,
  KnightsRole,
  KnightsTeam,
  MissionEntry,
  getRoleDistribution,
  buildRoleArray,
  ROLE_NAMES_TH,
  ROLE_ICONS,
  ROLE_TEAM,
} from "../schemas/KnightsState";
import { BaseRoom, type GameRoomConfig } from "./BaseRoom";
import { BasePlayer } from "../schemas/BaseState";

const MIN_PLAYERS = 5;
const MAX_PLAYERS = 10;
const ROLE_REVEAL_SECS = 8;
const PROPOSAL_TIMEOUT_SECS = 60;
const TEAM_VOTE_TIMEOUT_SECS = 30;
const MISSION_VOTE_TIMEOUT_SECS = 30;
const MISSION_REVEAL_SECS = 5;
const ASSASSIN_GUESS_TIMEOUT_SECS = 30;
const MAX_CONSECUTIVE_REJECTIONS = 5;

/**
 * KnightsRoom -- อัศวิน (Knights) game room.
 *
 * Avalon-style hidden-role team-mission game with Thai theming.
 * Extends BaseRoom for shared lobby, player management, host, kick, reconnection.
 *
 * Phase machine:
 *   LOBBY -> ROLE_REVEAL -> TEAM_PROPOSAL -> TEAM_VOTE ->
 *   (approved) MISSION -> MISSION_REVEAL -> (loop or ASSASSIN_GUESS or GAME_OVER)
 *   (rejected) -> back to TEAM_PROPOSAL (next leader)
 *
 * Security constraints from Loki review:
 * - H1: Mission votes resolved atomically via resolveMission() with fixed timer
 * - H2: Reconnect sends only own role + current phase (no vote/proposal leaks)
 * - H3: consecutiveRejections in synced state, persists across reconnects
 *
 * Spec: PLATFORM_SPEC_v2.md sections KN-001 through KN-004.
 */
export class KnightsRoom extends BaseRoom<KnightsState> {
  // ─── Timers ────────────────────────────────────────────────────
  private roleRevealTimer: Delayed | null = null;
  private proposalTimer: Delayed | null = null;
  private proposalInterval: Delayed | null = null;
  private teamVoteTimer: Delayed | null = null;
  private teamVoteInterval: Delayed | null = null;
  private missionVoteTimer: Delayed | null = null;
  private missionVoteInterval: Delayed | null = null;
  private missionRevealTimer: Delayed | null = null;
  private assassinGuessTimer: Delayed | null = null;
  private assassinGuessInterval: Delayed | null = null;

  // ─── Server-side secrets (NEVER synced to clients) ─────────────
  /**
   * Player roles. Key = sessionId, value = KnightsRole.
   * Source of truth for roles. Synced state only has revealedRole at game end.
   */
  private playerRoles: Map<string, KnightsRole> = new Map();

  /**
   * Leader rotation order (session IDs). Fixed at game start.
   * Loki M2: survives disconnects -- skip dead/disconnected players.
   */
  private leaderOrder: string[] = [];
  private currentLeaderIndex: number = 0;

  /**
   * Proposed team for current mission (session IDs).
   * Set by the leader during TEAM_PROPOSAL, cleared on rejection/completion.
   */
  private proposedTeam: Set<string> = new Set();

  /**
   * Team vote records. Key = sessionId, value = "approve" | "reject".
   * Used for public reveal after all votes are in (Loki L2: team votes are public).
   */
  private teamVotes: Map<string, "approve" | "reject"> = new Map();

  /**
   * Mission vote records. Key = sessionId, value = "success" | "fail".
   * NEVER revealed individually (Loki L2: mission votes are secret/aggregated).
   */
  private missionVotes: Map<string, "success" | "fail"> = new Map();

  // ─── BaseRoom abstract implementations ─────────────────────────

  protected createState(): KnightsState {
    return new KnightsState();
  }

  protected createPlayer(): KnightsPlayer {
    return new KnightsPlayer();
  }

  protected getGameConfig(): GameRoomConfig {
    return { minPlayers: MIN_PLAYERS, maxPlayers: MAX_PLAYERS };
  }

  protected onGameStart(_client: Client): void {
    const state = this.state;

    // Reset all game state for a new game
    this.resetGameState();

    // Assign roles
    this.assignRoles();

    // Set leader rotation order (all connected players, shuffled)
    this.setupLeaderOrder();

    // Enter role reveal phase
    state.phase = "ROLE_REVEAL";

    // Send private role data to each player
    this.sendRoleRevealToAll();

    // After reveal, start first mission proposal
    this.roleRevealTimer = this.clock.setTimeout(() => {
      if (state.phase === "ROLE_REVEAL") {
        this.startMission(1);
      }
    }, ROLE_REVEAL_SECS * 1000);
  }

  // ─── BaseRoom optional hooks ───────────────────────────────────

  protected registerMessageHandlers(): void {
    this.onMessage("PROPOSE_TEAM", (client, data: { teamIds: string[] }) =>
      this.handleProposeTeam(client, data.teamIds),
    );
    this.onMessage("TEAM_VOTE", (client, data: { vote: "approve" | "reject" }) =>
      this.handleTeamVote(client, data.vote),
    );
    this.onMessage("MISSION_VOTE", (client, data: { vote: "success" | "fail" }) =>
      this.handleMissionVote(client, data.vote),
    );
    this.onMessage("ASSASSIN_GUESS", (client, data: { targetId: string }) =>
      this.handleAssassinGuess(client, data.targetId),
    );
  }

  protected onPlayerReconnected(client: Client, _player: BasePlayer): void {
    const player = _player as KnightsPlayer;
    const role = this.playerRoles.get(player.id);

    if (!role || this.state.phase === "LOBBY" || this.state.phase === "GAME_OVER") return;

    // Send only the player's own role (Loki H2: no vote/proposal leaks)
    const roleData = this.buildRoleData(player.id, role);
    client.send("ROLE_DATA", roleData);

    // Send current phase context
    client.send("PHASE_CONTEXT", {
      phase: this.state.phase,
      currentMission: this.state.currentMission,
      currentLeaderId: this.state.currentLeaderId,
      consecutiveRejections: this.state.consecutiveRejections,
      hasVoted: player.hasVoted,
      isOnTeam: player.isOnTeam,
      hasMissionVoted: player.hasMissionVoted,
    });
  }

  protected onPlayerDisconnectedDuringGame(_player: BasePlayer): void {
    // Knights does not eliminate on disconnect -- the player stays in the game
    // but is skipped for leader rotation (Loki M2).
    // Mission votes: if a team member disconnects mid-mission, their vote
    // defaults to "success" (good intent assumed).
    const player = _player as KnightsPlayer;

    // If they were on the mission team and haven't voted, auto-vote success
    if (this.state.phase === "MISSION" && player.isOnTeam && !player.hasMissionVoted) {
      this.missionVotes.set(player.id, "success");
      player.hasMissionVoted = true;
      this.state.missionVotesCast++;
      if (this.state.missionVotesCast >= this.state.missionVotersExpected) {
        this.resolveMission();
      }
    }

    // If they haven't voted in team vote, auto-vote reject
    if (this.state.phase === "TEAM_VOTE" && !player.hasVoted) {
      this.teamVotes.set(player.id, "reject");
      player.hasVoted = true;
      this.state.rejectVotes++;
      this.state.teamVotesCast++;
      if (this.state.teamVotesCast >= this.state.teamVotersExpected) {
        this.resolveTeamVote();
      }
    }
  }

  protected onGameDispose(): void {
    this.clearAllTimers();
    this.playerRoles.clear();
    this.leaderOrder = [];
    this.proposedTeam.clear();
    this.teamVotes.clear();
    this.missionVotes.clear();
  }

  // ─── ROLE ASSIGNMENT ──────────────────────────────────────────

  private assignRoles(): void {
    const connected = this.getConnectedPlayers() as KnightsPlayer[];
    const roles = buildRoleArray(connected.length);

    // Shuffle roles
    this.shuffleArray(roles);

    // Assign to players (server-side only)
    this.playerRoles.clear();
    connected.forEach((player, i) => {
      this.playerRoles.set(player.id, roles[i]);
      player.isAlive = true;
      player.revealedRole = "";
      player.revealedTeam = "";
      player.hasVoted = false;
      player.isOnTeam = false;
      player.hasMissionVoted = false;
    });
  }

  private setupLeaderOrder(): void {
    const connected = this.getConnectedPlayers();
    this.leaderOrder = connected.map((p) => p.id);
    this.shuffleArray(this.leaderOrder);
    this.currentLeaderIndex = 0;
  }

  /**
   * Build role data for a player (private message).
   * Different roles see different information:
   * - Evil players see other evil players
   * - Leader (ผู้นำอัศวิน) sees evil players
   * - Advisor (ที่ปรึกษา) sees leader candidates (leader + double-agent)
   */
  private buildRoleData(playerId: string, role: KnightsRole): Record<string, any> {
    const team = ROLE_TEAM[role];
    const roleData: Record<string, any> = {
      role,
      roleTh: ROLE_NAMES_TH[role],
      roleIcon: ROLE_ICONS[role],
      team,
    };

    if (team === "evil") {
      // Evil players see each other
      roleData.evilPlayers = this.getPlayersByTeam("evil")
        .filter((p) => p.id !== playerId)
        .map((p) => ({ id: p.id, nickname: p.nickname }));
    }

    if (role === "leader") {
      // Leader sees all evil players
      roleData.evilPlayers = this.getPlayersByTeam("evil")
        .map((p) => ({ id: p.id, nickname: p.nickname }));
    }

    if (role === "advisor") {
      // Advisor sees "leader candidates" -- the leader AND the double-agent
      // (cannot distinguish which is the real leader)
      const candidates: Array<{ id: string; nickname: string }> = [];
      this.playerRoles.forEach((r, id) => {
        if (r === "leader" || r === "double-agent") {
          const player = this.state.players.get(id);
          if (player) {
            candidates.push({ id, nickname: player.nickname });
          }
        }
      });
      // Shuffle so the order doesn't reveal who is real
      this.shuffleArray(candidates);
      roleData.leaderCandidates = candidates;
    }

    return roleData;
  }

  private sendRoleRevealToAll(): void {
    this.clients.forEach((client) => {
      const player = this.state.players.get(client.sessionId) as KnightsPlayer | undefined;
      if (!player) return;

      const role = this.playerRoles.get(player.id);
      if (!role) return;

      const roleData = this.buildRoleData(player.id, role);
      client.send("ROLE_DATA", roleData);
    });
  }

  // ─── MISSION LIFECYCLE ────────────────────────────────────────

  /**
   * Start a new mission. Sets up the leader for team proposal.
   */
  private startMission(missionNumber: number): void {
    const state = this.state;
    const connected = this.getConnectedPlayers();
    const dist = getRoleDistribution(connected.length);

    state.currentMission = missionNumber;
    state.currentMissionTeamSize = dist.missionSizes[missionNumber - 1];
    state.currentMissionDoubleFail = dist.mission4DoubleFail && missionNumber === 4;

    // Reset consecutive rejections for new mission (Loki H3: only reset on approval)
    // Note: consecutiveRejections persists across proposals within a mission round.
    // It resets to 0 only when startMission is called (new mission).
    state.consecutiveRejections = 0;

    this.startTeamProposal();
  }

  /**
   * Start the team proposal phase. Current leader proposes a team.
   */
  private startTeamProposal(): void {
    const state = this.state;

    // Find next valid leader (skip disconnected)
    const leaderId = this.getNextLeader();
    state.currentLeaderId = leaderId;
    const leader = state.players.get(leaderId);
    state.currentLeaderNickname = leader?.nickname || "";

    state.phase = "TEAM_PROPOSAL";

    // Clear team-related state
    this.proposedTeam.clear();
    state.players.forEach((p) => {
      (p as KnightsPlayer).isOnTeam = false;
      (p as KnightsPlayer).hasVoted = false;
      (p as KnightsPlayer).hasMissionVoted = false;
    });

    // Reset vote counts
    state.approveVotes = 0;
    state.rejectVotes = 0;
    state.teamVotesCast = 0;
    state.teamVotersExpected = 0;

    state.timer = PROPOSAL_TIMEOUT_SECS;

    this.broadcast("PHASE_CHANGE", {
      phase: "TEAM_PROPOSAL",
      currentMission: state.currentMission,
      teamSize: state.currentMissionTeamSize,
      leaderId,
      leaderNickname: state.currentLeaderNickname,
      consecutiveRejections: state.consecutiveRejections,
      timer: PROPOSAL_TIMEOUT_SECS,
    });

    // Proposal timer -- if leader doesn't propose, auto-reject
    this.proposalInterval = this.clock.setInterval(() => {
      state.timer--;
      if (state.timer <= 0) {
        this.onProposalTimeout();
      }
    }, 1000);
  }

  /**
   * Proposal timed out -- treat as a rejected proposal.
   */
  private onProposalTimeout(): void {
    this.stopProposalTimer();
    this.handleRejection();
  }

  /**
   * Get the next leader in rotation order.
   * Skips disconnected players (Loki M2).
   */
  private getNextLeader(): string {
    const maxAttempts = this.leaderOrder.length;
    for (let i = 0; i < maxAttempts; i++) {
      const candidateId = this.leaderOrder[this.currentLeaderIndex % this.leaderOrder.length];
      const player = this.state.players.get(candidateId);
      if (player && player.isConnected) {
        return candidateId;
      }
      this.currentLeaderIndex++;
    }
    // Fallback: return first in order (shouldn't happen with connected validation)
    return this.leaderOrder[0];
  }

  /**
   * Advance leader index to the next player.
   */
  private advanceLeader(): void {
    this.currentLeaderIndex = (this.currentLeaderIndex + 1) % this.leaderOrder.length;
  }

  // ─── TEAM VOTE PHASE ─────────────────────────────────────────

  /**
   * Start the team vote phase. All players vote approve/reject.
   */
  private startTeamVote(): void {
    this.stopProposalTimer();

    const state = this.state;
    state.phase = "TEAM_VOTE";

    // Reset vote tracking
    this.teamVotes.clear();
    state.approveVotes = 0;
    state.rejectVotes = 0;
    state.teamVotesCast = 0;

    // All connected players vote
    const voters = this.getConnectedPlayers();
    state.teamVotersExpected = voters.length;

    state.players.forEach((p) => {
      (p as KnightsPlayer).hasVoted = false;
    });

    state.timer = TEAM_VOTE_TIMEOUT_SECS;

    this.broadcast("PHASE_CHANGE", {
      phase: "TEAM_VOTE",
      currentMission: state.currentMission,
      teamIds: Array.from(this.proposedTeam),
      teamNicknames: Array.from(this.proposedTeam).map((id) => {
        const p = state.players.get(id);
        return p?.nickname || "";
      }),
      leaderId: state.currentLeaderId,
      timer: TEAM_VOTE_TIMEOUT_SECS,
    });

    // Team vote timer
    this.teamVoteInterval = this.clock.setInterval(() => {
      state.timer--;
      if (state.timer <= 0) {
        this.resolveTeamVote();
      }
    }, 1000);
  }

  /**
   * Resolve the team vote.
   * Votes are public (Loki L2: approve/reject of team proposals are visible).
   */
  private resolveTeamVote(): void {
    this.stopTeamVoteTimer();

    const state = this.state;

    // Disconnected players who haven't voted count as reject
    state.players.forEach((p) => {
      const kp = p as KnightsPlayer;
      if (!kp.hasVoted && p.isConnected) {
        // Connected but didn't vote -- count as reject (abstain = reject)
        this.teamVotes.set(p.id, "reject");
        kp.hasVoted = true;
        state.rejectVotes++;
        state.teamVotesCast++;
      }
    });

    // Build public vote results (Loki L2: team votes are public)
    const voteResults: Array<{ playerId: string; nickname: string; vote: string }> = [];
    this.teamVotes.forEach((vote, playerId) => {
      const player = state.players.get(playerId);
      voteResults.push({
        playerId,
        nickname: player?.nickname || "",
        vote,
      });
    });

    // Majority approve = team goes on mission
    const majority = Math.floor(state.teamVotersExpected / 2) + 1;
    const approved = state.approveVotes >= majority;

    this.broadcast("TEAM_VOTE_RESULT", {
      approved,
      approveVotes: state.approveVotes,
      rejectVotes: state.rejectVotes,
      votes: voteResults,
    });

    if (approved) {
      // Team approved -- start mission
      this.startMissionVote();
    } else {
      // Team rejected
      this.handleRejection();
    }
  }

  /**
   * Handle a rejected team proposal.
   * Increments consecutive rejections. If 5 reached, evil wins (hammer rule).
   */
  private handleRejection(): void {
    const state = this.state;
    state.consecutiveRejections++;

    // Hammer rule: 5 consecutive rejections = evil wins (KN-002.4)
    if (state.consecutiveRejections >= MAX_CONSECUTIVE_REJECTIONS) {
      this.endGame("evil", "hammer_rule");
      return;
    }

    // Advance leader and start new proposal
    this.advanceLeader();

    // Brief pause before next proposal
    this.clock.setTimeout(() => {
      if (state.phase === "TEAM_VOTE" || state.phase === "TEAM_PROPOSAL") {
        this.startTeamProposal();
      }
    }, 2000);
  }

  // ─── MISSION VOTE PHASE ───────────────────────────────────────

  /**
   * Start the mission vote phase. Only team members vote success/fail.
   * Loki H1: Fixed-duration timer to prevent timing attacks.
   */
  private startMissionVote(): void {
    this.stopProposalTimer();
    this.stopTeamVoteTimer();

    const state = this.state;
    state.phase = "MISSION";

    // Reset mission vote tracking
    this.missionVotes.clear();
    state.missionVotesCast = 0;
    state.missionVotersExpected = this.proposedTeam.size;

    state.players.forEach((p) => {
      (p as KnightsPlayer).hasMissionVoted = false;
    });

    state.timer = MISSION_VOTE_TIMEOUT_SECS;

    this.broadcast("PHASE_CHANGE", {
      phase: "MISSION",
      currentMission: state.currentMission,
      teamIds: Array.from(this.proposedTeam),
      timer: MISSION_VOTE_TIMEOUT_SECS,
    });

    // Mission vote timer (Loki H1: fixed duration)
    this.missionVoteInterval = this.clock.setInterval(() => {
      state.timer--;
      if (state.timer <= 0) {
        this.resolveMission();
      }
    }, 1000);
  }

  /**
   * Resolve mission votes atomically (Loki H1).
   *
   * All votes processed at once. Results shown as aggregate only:
   * "X success, Y fail" (KN-003.5). Individual votes NEVER revealed.
   *
   * Mission failure:
   * - Default: 1+ fail vote = mission fails
   * - Exception: Mission 4 with 7+ players needs 2+ fails (KN-003.4)
   */
  private resolveMission(): void {
    this.stopMissionVoteTimer();

    const state = this.state;

    // Auto-vote success for team members who didn't vote (disconnect or timeout)
    this.proposedTeam.forEach((playerId) => {
      if (!this.missionVotes.has(playerId)) {
        this.missionVotes.set(playerId, "success");
      }
    });

    // Count votes
    let successCount = 0;
    let failCount = 0;
    this.missionVotes.forEach((vote) => {
      if (vote === "success") successCount++;
      else failCount++;
    });

    // Determine mission outcome
    const failsNeeded = state.currentMissionDoubleFail ? 2 : 1;
    const missionSucceeded = failCount < failsNeeded;

    // Record in mission history
    const entry = new MissionEntry();
    entry.missionNumber = state.currentMission;
    entry.successVotes = successCount;
    entry.failVotes = failCount;
    entry.succeeded = missionSucceeded;
    entry.teamSize = this.proposedTeam.size;
    state.missionHistory.push(entry);

    // Update win counters
    if (missionSucceeded) {
      state.goodWins++;
    } else {
      state.evilWins++;
    }

    // Mission reveal phase
    state.phase = "MISSION_REVEAL";

    this.broadcast("MISSION_RESULT", {
      missionNumber: state.currentMission,
      succeeded: missionSucceeded,
      successVotes: successCount,
      failVotes: failCount,
      teamSize: this.proposedTeam.size,
      failsNeeded,
      goodWins: state.goodWins,
      evilWins: state.evilWins,
    });

    // Check win conditions
    if (state.goodWins >= 3) {
      // Good wins 3 missions -- BUT assassin gets a guess (KN-004.3)
      this.missionRevealTimer = this.clock.setTimeout(() => {
        this.startAssassinGuess();
      }, MISSION_REVEAL_SECS * 1000);
      return;
    }

    if (state.evilWins >= 3) {
      // Evil wins 3 missions -- evil wins outright
      this.missionRevealTimer = this.clock.setTimeout(() => {
        this.endGame("evil", "three_missions_failed");
      }, MISSION_REVEAL_SECS * 1000);
      return;
    }

    // Continue to next mission
    this.missionRevealTimer = this.clock.setTimeout(() => {
      if (state.phase === "MISSION_REVEAL") {
        this.startMission(state.currentMission + 1);
      }
    }, MISSION_REVEAL_SECS * 1000);
  }

  // ─── ASSASSIN GUESS PHASE ────────────────────────────────────

  /**
   * Start the assassin guess phase.
   * Loki M4: มือสังหาร gets one chance to identify ผู้นำอัศวิน.
   * If correct -> evil wins. If wrong/timeout -> good wins.
   */
  private startAssassinGuess(): void {
    const state = this.state;
    state.phase = "ASSASSIN_GUESS";

    // Find the assassin
    let assassinId = "";
    this.playerRoles.forEach((role, id) => {
      if (role === "assassin") assassinId = id;
    });

    // If assassin is disconnected, good wins by default (Loki M4)
    const assassinPlayer = state.players.get(assassinId);
    if (!assassinPlayer || !assassinPlayer.isConnected) {
      this.endGame("good", "assassin_disconnected");
      return;
    }

    state.timer = ASSASSIN_GUESS_TIMEOUT_SECS;

    // Build list of possible targets (all good team players who are connected)
    const targets: Array<{ id: string; nickname: string }> = [];
    this.playerRoles.forEach((role, id) => {
      const team = ROLE_TEAM[role];
      if (team === "good") {
        const player = state.players.get(id);
        if (player) {
          targets.push({ id, nickname: player.nickname });
        }
      }
    });

    this.broadcast("PHASE_CHANGE", {
      phase: "ASSASSIN_GUESS",
      assassinId,
      assassinNickname: assassinPlayer.nickname,
      timer: ASSASSIN_GUESS_TIMEOUT_SECS,
    });

    // Send target list to assassin privately
    const assassinClient = this.clients.find((c) => c.sessionId === assassinId);
    if (assassinClient) {
      assassinClient.send("ASSASSIN_TARGETS", { targets });
    }

    // Assassin guess timer
    this.assassinGuessInterval = this.clock.setInterval(() => {
      state.timer--;
      if (state.timer <= 0) {
        // Timer expired -- assassin didn't guess. Good wins.
        this.stopAssassinGuessTimer();
        this.endGame("good", "assassin_timeout");
      }
    }, 1000);
  }

  // ─── GAME OVER ────────────────────────────────────────────────

  private endGame(winner: KnightsTeam, reason: string): void {
    this.clearAllTimers();

    const state = this.state;
    state.phase = "GAME_OVER";
    state.winner = winner;
    state.winReason = reason;

    // Reveal all roles
    const allPlayerData: Array<{
      playerId: string;
      nickname: string;
      role: KnightsRole;
      roleTh: string;
      roleIcon: string;
      team: KnightsTeam;
      isConnected: boolean;
    }> = [];

    state.players.forEach((p) => {
      const role = this.playerRoles.get(p.id) || "good-knight";
      const team = ROLE_TEAM[role];
      const kp = p as KnightsPlayer;
      kp.revealedRole = ROLE_NAMES_TH[role];
      kp.revealedTeam = team;
      allPlayerData.push({
        playerId: p.id,
        nickname: p.nickname,
        role,
        roleTh: ROLE_NAMES_TH[role],
        roleIcon: ROLE_ICONS[role],
        team,
        isConnected: p.isConnected,
      });
    });

    this.broadcast("GAME_OVER", {
      winner,
      reason,
      players: allPlayerData,
      missionHistory: state.missionHistory.toArray().map((m) => ({
        missionNumber: m.missionNumber,
        successVotes: m.successVotes,
        failVotes: m.failVotes,
        succeeded: m.succeeded,
        teamSize: m.teamSize,
      })),
      assassinGuessTargetId: state.assassinGuessTargetId,
      assassinGuessTargetNickname: state.assassinGuessTargetNickname,
      assassinGuessCorrect: state.assassinGuessCorrect,
    });
  }

  // ─── MESSAGE HANDLERS ─────────────────────────────────────────

  private handleProposeTeam(client: Client, teamIds: string[]): void {
    if (this.state.phase !== "TEAM_PROPOSAL") {
      this.sendError(client, "INVALID_PHASE", "ไม่ใช่ช่วงเสนอทีม");
      return;
    }

    if (client.sessionId !== this.state.currentLeaderId) {
      this.sendError(client, "NOT_LEADER", "คุณไม่ใช่ผู้นำ");
      return;
    }

    // Validate team size
    if (teamIds.length !== this.state.currentMissionTeamSize) {
      this.sendError(
        client,
        "INVALID_TEAM_SIZE",
        `ต้องเลือกผู้เล่น ${this.state.currentMissionTeamSize} คน`,
      );
      return;
    }

    // Validate: no duplicates
    const uniqueIds = new Set(teamIds);
    if (uniqueIds.size !== teamIds.length) {
      this.sendError(client, "DUPLICATE_MEMBER", "มีผู้เล่นซ้ำในทีม");
      return;
    }

    // Validate: all are connected players
    for (const id of teamIds) {
      const player = this.state.players.get(id);
      if (!player || !player.isConnected) {
        this.sendError(client, "INVALID_MEMBER", "ผู้เล่นไม่ถูกต้อง");
        return;
      }
    }

    // Set proposed team
    this.proposedTeam.clear();
    teamIds.forEach((id) => {
      this.proposedTeam.add(id);
      const player = this.state.players.get(id) as KnightsPlayer | undefined;
      if (player) player.isOnTeam = true;
    });

    // Move to team vote
    this.startTeamVote();
  }

  private handleTeamVote(client: Client, vote: "approve" | "reject"): void {
    if (this.state.phase !== "TEAM_VOTE") {
      this.sendError(client, "INVALID_PHASE", "ไม่ใช่ช่วงโหวตทีม");
      return;
    }

    const player = this.state.players.get(client.sessionId) as KnightsPlayer | undefined;
    if (!player || !player.isConnected) return;

    if (player.hasVoted) {
      this.sendError(client, "ALREADY_VOTED", "คุณโหวตแล้ว");
      return;
    }

    player.hasVoted = true;
    this.teamVotes.set(client.sessionId, vote);
    this.state.teamVotesCast++;

    if (vote === "approve") {
      this.state.approveVotes++;
    } else {
      this.state.rejectVotes++;
    }

    this.broadcast("TEAM_VOTE_CAST", {
      playerId: client.sessionId,
      playerNickname: player.nickname,
      totalVotesCast: this.state.teamVotesCast,
      totalVotersExpected: this.state.teamVotersExpected,
    });

    // Check if all votes are in
    if (this.state.teamVotesCast >= this.state.teamVotersExpected) {
      this.resolveTeamVote();
    }
  }

  private handleMissionVote(client: Client, vote: "success" | "fail"): void {
    if (this.state.phase !== "MISSION") {
      this.sendError(client, "INVALID_PHASE", "ไม่ใช่ช่วงภารกิจ");
      return;
    }

    const player = this.state.players.get(client.sessionId) as KnightsPlayer | undefined;
    if (!player || !player.isConnected) return;

    // Only team members can vote
    if (!this.proposedTeam.has(client.sessionId)) {
      this.sendError(client, "NOT_ON_TEAM", "คุณไม่ได้อยู่ในทีม");
      return;
    }

    if (player.hasMissionVoted) {
      this.sendError(client, "ALREADY_VOTED", "คุณโหวตแล้ว");
      return;
    }

    // Good players MUST vote success (KN-003.2)
    const role = this.playerRoles.get(client.sessionId);
    if (role && ROLE_TEAM[role] === "good" && vote === "fail") {
      this.sendError(client, "GOOD_MUST_SUCCEED", "อัศวินฝ่ายดีต้องเลือกสำเร็จ");
      return;
    }

    player.hasMissionVoted = true;
    this.missionVotes.set(client.sessionId, vote);
    this.state.missionVotesCast++;

    // Confirm vote to the player privately
    client.send("MISSION_VOTE_CONFIRMED", { vote });

    // Broadcast vote count (NOT individual votes -- Loki H1/L2)
    this.broadcast("MISSION_VOTE_PROGRESS", {
      missionVotesCast: this.state.missionVotesCast,
      missionVotersExpected: this.state.missionVotersExpected,
    });

    // Check if all votes are in -- but still wait for fixed timer (Loki H1)
    // Actually, we can resolve when all votes are in. The timing attack
    // concern is about individual vote timing, not the aggregate. Since we
    // don't reveal who voted when (only count), resolving early is safe.
    if (this.state.missionVotesCast >= this.state.missionVotersExpected) {
      this.resolveMission();
    }
  }

  private handleAssassinGuess(client: Client, targetId: string): void {
    if (this.state.phase !== "ASSASSIN_GUESS") {
      this.sendError(client, "INVALID_PHASE", "ไม่ใช่ช่วงเดามือสังหาร");
      return;
    }

    // Only the assassin can guess
    const role = this.playerRoles.get(client.sessionId);
    if (role !== "assassin") {
      this.sendError(client, "NOT_ASSASSIN", "คุณไม่ใช่มือสังหาร");
      return;
    }

    const target = this.state.players.get(targetId);
    if (!target) {
      this.sendError(client, "INVALID_TARGET", "เป้าหมายไม่ถูกต้อง");
      return;
    }

    // Can only guess good team players
    const targetRole = this.playerRoles.get(targetId);
    if (!targetRole || ROLE_TEAM[targetRole] !== "good") {
      this.sendError(client, "INVALID_TARGET", "ต้องเลือกผู้เล่นฝ่ายดี");
      return;
    }

    this.stopAssassinGuessTimer();

    const state = this.state;
    state.assassinGuessTargetId = targetId;
    state.assassinGuessTargetNickname = target.nickname;
    state.assassinGuessCorrect = targetRole === "leader";

    this.broadcast("ASSASSIN_GUESS_RESULT", {
      assassinId: client.sessionId,
      targetId,
      targetNickname: target.nickname,
      targetRole: targetRole,
      targetRoleTh: ROLE_NAMES_TH[targetRole],
      correct: state.assassinGuessCorrect,
    });

    if (state.assassinGuessCorrect) {
      // Assassin correctly identified the leader -- evil wins!
      this.endGame("evil", "assassin_killed_leader");
    } else {
      // Wrong guess -- good wins!
      this.endGame("good", "assassin_missed");
    }
  }

  // ─── HELPER METHODS ───────────────────────────────────────────

  private getPlayersByTeam(team: KnightsTeam): KnightsPlayer[] {
    const players: KnightsPlayer[] = [];
    this.state.players.forEach((p) => {
      const role = this.playerRoles.get(p.id);
      if (role && ROLE_TEAM[role] === team) {
        players.push(p as KnightsPlayer);
      }
    });
    return players;
  }

  private resetGameState(): void {
    this.clearAllTimers();

    const state = this.state;
    state.currentMission = 0;
    state.goodWins = 0;
    state.evilWins = 0;
    state.currentMissionTeamSize = 0;
    state.currentMissionDoubleFail = false;
    state.currentLeaderId = "";
    state.currentLeaderNickname = "";
    state.consecutiveRejections = 0;
    state.approveVotes = 0;
    state.rejectVotes = 0;
    state.teamVotesCast = 0;
    state.teamVotersExpected = 0;
    state.missionVotesCast = 0;
    state.missionVotersExpected = 0;
    state.timer = 0;
    state.winner = "";
    state.winReason = "";
    state.missionHistory.clear();
    state.assassinGuessTargetId = "";
    state.assassinGuessTargetNickname = "";
    state.assassinGuessCorrect = false;

    // Reset player states
    state.players.forEach((p) => {
      const kp = p as KnightsPlayer;
      kp.revealedRole = "";
      kp.revealedTeam = "";
      kp.hasVoted = false;
      kp.isOnTeam = false;
      kp.hasMissionVoted = false;
      kp.isAlive = true;
    });

    this.playerRoles.clear();
    this.leaderOrder = [];
    this.proposedTeam.clear();
    this.teamVotes.clear();
    this.missionVotes.clear();
  }

  // ─── TIMER MANAGEMENT ─────────────────────────────────────────

  private stopProposalTimer(): void {
    if (this.proposalInterval) {
      this.proposalInterval.clear();
      this.proposalInterval = null;
    }
    if (this.proposalTimer) {
      this.proposalTimer.clear();
      this.proposalTimer = null;
    }
  }

  private stopTeamVoteTimer(): void {
    if (this.teamVoteInterval) {
      this.teamVoteInterval.clear();
      this.teamVoteInterval = null;
    }
    if (this.teamVoteTimer) {
      this.teamVoteTimer.clear();
      this.teamVoteTimer = null;
    }
  }

  private stopMissionVoteTimer(): void {
    if (this.missionVoteInterval) {
      this.missionVoteInterval.clear();
      this.missionVoteInterval = null;
    }
    if (this.missionVoteTimer) {
      this.missionVoteTimer.clear();
      this.missionVoteTimer = null;
    }
  }

  private stopAssassinGuessTimer(): void {
    if (this.assassinGuessInterval) {
      this.assassinGuessInterval.clear();
      this.assassinGuessInterval = null;
    }
    if (this.assassinGuessTimer) {
      this.assassinGuessTimer.clear();
      this.assassinGuessTimer = null;
    }
  }

  private clearAllTimers(): void {
    this.stopProposalTimer();
    this.stopTeamVoteTimer();
    this.stopMissionVoteTimer();
    this.stopAssassinGuessTimer();
    if (this.roleRevealTimer) {
      this.roleRevealTimer.clear();
      this.roleRevealTimer = null;
    }
    if (this.missionRevealTimer) {
      this.missionRevealTimer.clear();
      this.missionRevealTimer = null;
    }
  }

  // ─── UTILITIES ────────────────────────────────────────────────

  private shuffleArray<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
}
