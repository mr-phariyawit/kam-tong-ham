import { Client, Delayed } from "colyseus";
import {
  WerewolfState,
  WerewolfPlayer,
  WerewolfPhase,
  WerewolfRole,
  KillEntry,
  getRoleDistribution,
  ROLE_NAMES_TH,
  ROLE_ICONS,
} from "../schemas/WerewolfState";
import { BaseRoom, type GameRoomConfig } from "./BaseRoom";
import { BasePlayer } from "../schemas/BaseState";

const MIN_PLAYERS = 5;
const MAX_PLAYERS = 15;
const ROLE_REVEAL_SECS = 5;
const DEFAULT_NIGHT_TIMER_SECS = 30;
const DEFAULT_DISCUSSION_TIMER_SECS = 90;
const DEFAULT_DEFENSE_TIMER_SECS = 30;
const DAY_ANNOUNCE_SECS = 5;
const VOTE_TIMEOUT_SECS = 30;

/**
 * WerewolfRoom -- หมาป่า (Werewolf) game room.
 *
 * Extends BaseRoom for shared lobby, player management, host, kick, reconnection.
 * Implements the full Werewolf game lifecycle:
 *   LOBBY -> ROLE_REVEAL -> NIGHT -> DAY_ANNOUNCE -> DAY_DISCUSSION -> DAY_VOTE
 *   -> (back to NIGHT or GAME_OVER)
 *
 * Design constraints from Loki review:
 * - H1: Night actions resolved atomically via resolveNight()
 * - H2: Fixed-duration night timer to prevent timing attacks
 * - H3: Reconnect sends only own role, no result re-delivery
 * - H4: Handle absent doctor (5-player game)
 * - M3: Roles stored server-side, not in synced state
 *
 * Spec: PLATFORM_SPEC_v2.md sections WW-001 through WW-004.
 */
export class WerewolfRoom extends BaseRoom<WerewolfState> {
  // ─── Timers ────────────────────────────────────────────────────
  private nightTimer: Delayed | null = null;
  private dayAnnounceTimer: Delayed | null = null;
  private discussionTimer: Delayed | null = null;
  private discussionInterval: Delayed | null = null;
  private defenseInterval: Delayed | null = null;
  private voteTimer: Delayed | null = null;
  private roleRevealTimer: Delayed | null = null;

  // ─── Server-side secrets (NEVER synced to clients) ─────────────
  /**
   * Player roles. Key = sessionId, value = WerewolfRole.
   * This is the source of truth for roles. The synced WerewolfPlayer
   * only has `revealedRole` which is empty until death/game-over.
   */
  private playerRoles: Map<string, WerewolfRole> = new Map();

  /**
   * Night actions collected during the current night.
   * Reset at the start of each night.
   */
  private wolfVoteTarget: string = "";
  private wolfVoteCounts: Map<string, number> = new Map();
  private wolfVoters: Set<string> = new Set();
  private seerTarget: string = "";
  private seerHasActed: boolean = false;
  private doctorTarget: string = "";
  private doctorHasActed: boolean = false;

  // ─── BaseRoom abstract implementations ─────────────────────────

  protected createState(): WerewolfState {
    return new WerewolfState();
  }

  protected createPlayer(): WerewolfPlayer {
    return new WerewolfPlayer();
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

    // Enter role reveal phase
    state.phase = "ROLE_REVEAL";

    // Send private role data to each player
    this.sendRoleRevealToAll();

    // After reveal, start first night
    this.roleRevealTimer = this.clock.setTimeout(() => {
      if (state.phase === "ROLE_REVEAL") {
        this.startNight();
      }
    }, ROLE_REVEAL_SECS * 1000);
  }

  // ─── BaseRoom optional hooks ───────────────────────────────────

  protected registerMessageHandlers(): void {
    this.onMessage("WOLF_VOTE", (client, data: { targetId: string }) =>
      this.handleWolfVote(client, data.targetId),
    );
    this.onMessage("SEER_PEEK", (client, data: { targetId: string }) =>
      this.handleSeerPeek(client, data.targetId),
    );
    this.onMessage("DOCTOR_SAVE", (client, data: { targetId: string }) =>
      this.handleDoctorSave(client, data.targetId),
    );
    this.onMessage("NOMINATE", (client, data: { targetId: string }) =>
      this.handleNominate(client, data.targetId),
    );
    this.onMessage("DAY_VOTE", (client, data: { vote: "eliminate" | "spare" }) =>
      this.handleDayVote(client, data.vote),
    );
    this.onMessage("UPDATE_CONFIG", (client, data: { discussionTimer?: number; nightTimer?: number; defenseTimer?: number }) =>
      this.handleUpdateConfig(client, data),
    );
  }

  protected onPlayerReconnected(client: Client, _player: BasePlayer): void {
    const player = _player as WerewolfPlayer;
    const role = this.playerRoles.get(player.id);

    if (!role || this.state.phase === "LOBBY" || this.state.phase === "GAME_OVER") return;

    // Send only the player's own role (Loki H3: no result re-delivery)
    const roleData: any = {
      role,
      roleTh: ROLE_NAMES_TH[role],
      roleIcon: ROLE_ICONS[role],
      isWerewolf: role === "werewolf",
    };

    // If wolf, also reveal other wolves' identities
    if (role === "werewolf") {
      roleData.otherWolves = this.getAliveWolves()
        .filter((w) => w.id !== player.id)
        .map((w) => ({ id: w.id, nickname: w.nickname }));
    }

    client.send("ROLE_DATA", roleData);
  }

  protected onPlayerDisconnectedDuringGame(player: BasePlayer): void {
    const wwPlayer = player as WerewolfPlayer;
    wwPlayer.isAlive = false;

    // Reveal their role
    const role = this.playerRoles.get(player.id);
    if (role) {
      wwPlayer.revealedRole = ROLE_NAMES_TH[role];
    }

    this.updateAliveCount();

    // Check win conditions after disconnect
    const winResult = this.checkWinCondition();
    if (winResult) {
      this.endGame(winResult.winner, winResult.reason);
    }
  }

  protected onGameDispose(): void {
    this.clearAllTimers();
    this.playerRoles.clear();
    this.resetNightActions();
  }

  // ─── ROLE ASSIGNMENT ──────────────────────────────────────────

  private assignRoles(): void {
    const connected = this.getConnectedPlayers() as WerewolfPlayer[];
    const dist = getRoleDistribution(connected.length);

    // Build role array
    const roles: WerewolfRole[] = [];
    for (let i = 0; i < dist.werewolves; i++) roles.push("werewolf");
    for (let i = 0; i < dist.seer; i++) roles.push("seer");
    for (let i = 0; i < dist.doctor; i++) roles.push("doctor");
    for (let i = 0; i < dist.villagers; i++) roles.push("villager");

    // Shuffle roles
    this.shuffleArray(roles);

    // Assign to players (server-side only)
    this.playerRoles.clear();
    connected.forEach((player, i) => {
      this.playerRoles.set(player.id, roles[i]);
      player.isAlive = true;
      player.revealedRole = "";
      player.hasVoted = false;
      player.vote = "";
      player.hasActed = false;
    });

    this.updateAliveCount();
  }

  private sendRoleRevealToAll(): void {
    this.clients.forEach((client) => {
      const player = this.state.players.get(client.sessionId) as WerewolfPlayer | undefined;
      if (!player) return;

      const role = this.playerRoles.get(player.id);
      if (!role) return;

      const roleData: any = {
        role,
        roleTh: ROLE_NAMES_TH[role],
        roleIcon: ROLE_ICONS[role],
        isWerewolf: role === "werewolf",
      };

      // Wolves see each other (WW-001 implicit)
      if (role === "werewolf") {
        roleData.otherWolves = this.getAliveWolves()
          .filter((w) => w.id !== player.id)
          .map((w) => ({ id: w.id, nickname: w.nickname }));
      }

      client.send("ROLE_DATA", roleData);
    });
  }

  // ─── NIGHT PHASE ──────────────────────────────────────────────

  private startNight(): void {
    const state = this.state;
    state.nightNumber++;
    state.phase = "NIGHT";

    // Reset night actions
    this.resetNightActions();

    // Reset player hasActed flags
    state.players.forEach((p) => {
      (p as WerewolfPlayer).hasActed = false;
    });

    // Set night timer (Loki H2: fixed duration to prevent timing attacks)
    const timerSecs = state.nightTimerSetting || DEFAULT_NIGHT_TIMER_SECS;
    state.timer = timerSecs;

    this.broadcast("PHASE_CHANGE", {
      phase: "NIGHT",
      nightNumber: state.nightNumber,
      timer: timerSecs,
    });

    // Night timer countdown
    this.nightTimer = this.clock.setInterval(() => {
      state.timer--;
      if (state.timer <= 0) {
        this.resolveNight();
      }
    }, 1000);
  }

  private resetNightActions(): void {
    this.wolfVoteTarget = "";
    this.wolfVoteCounts.clear();
    this.wolfVoters.clear();
    this.seerTarget = "";
    this.seerHasActed = false;
    this.doctorTarget = "";
    this.doctorHasActed = false;
  }

  /**
   * Resolve all night actions atomically (Loki H1).
   *
   * Resolution order (all computed from collected actions):
   * 1. Determine wolf vote target (majority among wolf votes)
   * 2. Determine if doctor saved the target
   * 3. Seer result is sent to seer privately (already sent during peek)
   * 4. Apply kill or save
   * 5. Check win conditions
   * 6. Transition to DAY_ANNOUNCE
   */
  private resolveNight(): void {
    this.stopNightTimer();

    const state = this.state;

    // Resolve wolf vote: pick the target with most votes
    let wolfTarget = "";
    let maxVotes = 0;
    this.wolfVoteCounts.forEach((count, targetId) => {
      if (count > maxVotes) {
        maxVotes = count;
        wolfTarget = targetId;
      }
    });

    // Resolve: did doctor save the target?
    const wasSaved = wolfTarget !== "" && this.doctorTarget === wolfTarget;

    // Create kill entry
    const killEntry = new KillEntry();
    killEntry.night = state.nightNumber;

    if (wolfTarget === "") {
      // No wolf vote (Loki M1: wolves disconnected or didn't vote)
      killEntry.cause = "no_kill";
      killEntry.victimId = "";
      killEntry.victimNickname = "";
      killEntry.victimRole = "";
      killEntry.wasSaved = false;
      state.lastNightVictimId = "";
      state.lastNightVictimNickname = "";
      state.lastNightSaved = false;
    } else if (wasSaved) {
      // Doctor saved the target
      const victim = this.state.players.get(wolfTarget) as WerewolfPlayer | undefined;
      killEntry.cause = "wolf_kill";
      killEntry.victimId = wolfTarget;
      killEntry.victimNickname = victim?.nickname || "";
      killEntry.victimRole = "";
      killEntry.wasSaved = true;
      state.lastNightVictimId = "";
      state.lastNightVictimNickname = "";
      state.lastNightSaved = true;
    } else {
      // Wolf kill goes through
      const victim = this.state.players.get(wolfTarget) as WerewolfPlayer | undefined;
      if (victim) {
        victim.isAlive = false;
        const victimRole = this.playerRoles.get(wolfTarget) || "villager";
        victim.revealedRole = ROLE_NAMES_TH[victimRole];

        killEntry.cause = "wolf_kill";
        killEntry.victimId = wolfTarget;
        killEntry.victimNickname = victim.nickname;
        killEntry.victimRole = ROLE_NAMES_TH[victimRole];
        killEntry.wasSaved = false;

        state.lastNightVictimId = wolfTarget;
        state.lastNightVictimNickname = victim.nickname;
        state.lastNightSaved = false;
      }
    }

    state.killHistory.push(killEntry);
    this.updateAliveCount();

    // Check win conditions after night kill
    const winResult = this.checkWinCondition();
    if (winResult) {
      this.endGame(winResult.winner, winResult.reason);
      return;
    }

    // Transition to DAY_ANNOUNCE
    this.startDayAnnounce();
  }

  // ─── DAY ANNOUNCE ─────────────────────────────────────────────

  private startDayAnnounce(): void {
    const state = this.state;
    state.phase = "DAY_ANNOUNCE";

    this.broadcast("PHASE_CHANGE", {
      phase: "DAY_ANNOUNCE",
      victimId: state.lastNightVictimId,
      victimNickname: state.lastNightVictimNickname,
      wasSaved: state.lastNightSaved,
    });

    // Auto-transition to discussion after announcement
    this.dayAnnounceTimer = this.clock.setTimeout(() => {
      if (state.phase === "DAY_ANNOUNCE") {
        this.startDayDiscussion();
      }
    }, DAY_ANNOUNCE_SECS * 1000);
  }

  // ─── DAY DISCUSSION ──────────────────────────────────────────

  private startDayDiscussion(): void {
    const state = this.state;
    state.phase = "DAY_DISCUSSION";

    // Reset nomination/vote state
    state.nominatedPlayerId = "";
    state.nominatedPlayerNickname = "";
    state.nominatorId = "";
    state.eliminateVotes = 0;
    state.spareVotes = 0;
    state.totalVotesCast = 0;
    state.totalVotersExpected = 0;

    // Reset player vote state
    state.players.forEach((p) => {
      const wp = p as WerewolfPlayer;
      wp.hasVoted = false;
      wp.vote = "";
    });

    const timerSecs = state.discussionTimerSetting || DEFAULT_DISCUSSION_TIMER_SECS;
    state.timer = timerSecs;

    this.broadcast("PHASE_CHANGE", {
      phase: "DAY_DISCUSSION",
      timer: timerSecs,
    });

    // Discussion countdown
    this.discussionInterval = this.clock.setInterval(() => {
      state.timer--;
      if (state.timer <= 0) {
        this.onDiscussionTimerExpired();
      }
    }, 1000);
  }

  /**
   * Discussion timer expired without nomination (Loki M2).
   * Skip vote and go directly to night.
   */
  private onDiscussionTimerExpired(): void {
    this.stopDiscussionTimer();

    // No nomination made -- go directly to night
    this.broadcast("PHASE_CHANGE", {
      phase: "SKIP_TO_NIGHT",
      reason: "no_nomination",
    });

    // Brief pause then start night
    this.clock.setTimeout(() => {
      if (this.state.phase === "DAY_DISCUSSION") {
        this.startNight();
      }
    }, 2000);
  }

  // ─── DAY DEFENSE (WW-003.4) ──────────────────────────────────

  /**
   * Start the defense phase. The accused player has N seconds to defend
   * themselves before the elimination vote opens.
   */
  private startDayDefense(nominatorId: string, targetId: string): void {
    this.stopDiscussionTimer();

    const state = this.state;
    const target = state.players.get(targetId) as WerewolfPlayer | undefined;
    const nominator = state.players.get(nominatorId) as WerewolfPlayer | undefined;
    if (!target || !nominator) return;

    state.phase = "DAY_DEFENSE";
    state.nominatedPlayerId = targetId;
    state.nominatedPlayerNickname = target.nickname;
    state.nominatorId = nominatorId;

    const defenseSecs = state.defenseTimerSetting || DEFAULT_DEFENSE_TIMER_SECS;
    state.timer = defenseSecs;

    this.broadcast("PHASE_CHANGE", {
      phase: "DAY_DEFENSE",
      nominatorId,
      nominatorNickname: nominator.nickname,
      targetId,
      targetNickname: target.nickname,
      timer: defenseSecs,
    });

    // Defense countdown -- after timer expires, proceed to vote
    this.defenseInterval = this.clock.setInterval(() => {
      state.timer--;
      if (state.timer <= 0) {
        this.stopDefenseTimer();
        this.startDayVote();
      }
    }, 1000);
  }

  private stopDefenseTimer(): void {
    if (this.defenseInterval) {
      this.defenseInterval.clear();
      this.defenseInterval = null;
    }
  }

  // ─── DAY VOTE ─────────────────────────────────────────────────

  /**
   * Start the elimination vote. Called after defense timer expires.
   * nomination target is already set in state from startDayDefense().
   */
  private startDayVote(): void {
    const state = this.state;
    const targetId = state.nominatedPlayerId;
    const target = state.players.get(targetId) as WerewolfPlayer | undefined;
    const nominator = state.players.get(state.nominatorId) as WerewolfPlayer | undefined;
    if (!target) return;

    state.phase = "DAY_VOTE";
    state.eliminateVotes = 0;
    state.spareVotes = 0;
    state.totalVotesCast = 0;

    // Reset all votes
    state.players.forEach((p) => {
      const wp = p as WerewolfPlayer;
      wp.hasVoted = false;
      wp.vote = "";
    });

    // Voters = all alive players EXCEPT the nominated player
    const voters = this.getAliveConnectedPlayers().filter((p) => p.id !== targetId);
    state.totalVotersExpected = voters.length;

    this.broadcast("PHASE_CHANGE", {
      phase: "DAY_VOTE",
      nominatorId: state.nominatorId,
      nominatorNickname: nominator?.nickname || "",
      targetId,
      targetNickname: target.nickname,
      timer: VOTE_TIMEOUT_SECS,
    });

    state.timer = VOTE_TIMEOUT_SECS;

    // Vote countdown
    this.voteTimer = this.clock.setInterval(() => {
      state.timer--;
      if (state.timer <= 0) {
        this.resolveDayVote();
      }
    }, 1000);
  }

  /**
   * Resolve the day elimination vote.
   */
  private resolveDayVote(): void {
    this.stopVoteTimer();

    const state = this.state;
    const targetId = state.nominatedPlayerId;
    const target = state.players.get(targetId) as WerewolfPlayer | undefined;

    // Majority required to eliminate (> 50%)
    const majority = Math.floor(state.totalVotersExpected / 2) + 1;
    const isEliminated = state.eliminateVotes >= majority;

    this.broadcast("VOTE_RESULT", {
      targetId,
      targetNickname: target?.nickname || "",
      eliminateVotes: state.eliminateVotes,
      spareVotes: state.spareVotes,
      isEliminated,
    });

    if (isEliminated && target) {
      // Eliminate the player
      target.isAlive = false;
      const victimRole = this.playerRoles.get(targetId) || "villager";
      target.revealedRole = ROLE_NAMES_TH[victimRole];

      // Record in kill history
      const killEntry = new KillEntry();
      killEntry.night = state.nightNumber;
      killEntry.cause = "vote_eliminated";
      killEntry.victimId = targetId;
      killEntry.victimNickname = target.nickname;
      killEntry.victimRole = ROLE_NAMES_TH[victimRole];
      killEntry.wasSaved = false;
      state.killHistory.push(killEntry);

      this.updateAliveCount();

      this.broadcast("PLAYER_ELIMINATED", {
        playerId: targetId,
        nickname: target.nickname,
        role: victimRole,
        roleTh: ROLE_NAMES_TH[victimRole],
        roleIcon: ROLE_ICONS[victimRole],
      });

      // Check win conditions after elimination
      const winResult = this.checkWinCondition();
      if (winResult) {
        this.endGame(winResult.winner, winResult.reason);
        return;
      }
    }

    // Regardless of vote outcome, proceed to night after a brief pause
    this.clock.setTimeout(() => {
      if (this.state.phase === "DAY_VOTE" || this.state.phase === "DAY_DISCUSSION") {
        this.startNight();
      }
    }, 3000);
  }

  // ─── WIN CONDITION CHECK ──────────────────────────────────────

  /**
   * Check win conditions (Loki M5).
   * Called after every state change: night kill, day vote, disconnect.
   *
   * - Village wins: all werewolves dead
   * - Werewolves win: wolves >= non-wolves (alive count)
   */
  private checkWinCondition(): { winner: "village" | "werewolves"; reason: string } | null {
    let aliveWolves = 0;
    let aliveNonWolves = 0;

    this.state.players.forEach((p) => {
      if (!p.isAlive) return;
      const role = this.playerRoles.get(p.id);
      if (role === "werewolf") {
        aliveWolves++;
      } else {
        aliveNonWolves++;
      }
    });

    if (aliveWolves === 0) {
      return { winner: "village", reason: "all_wolves_eliminated" };
    }

    if (aliveWolves >= aliveNonWolves) {
      return { winner: "werewolves", reason: "wolves_outnumber_village" };
    }

    return null;
  }

  // ─── GAME OVER ────────────────────────────────────────────────

  private endGame(winner: "village" | "werewolves", reason: string): void {
    this.clearAllTimers();

    const state = this.state;
    state.phase = "GAME_OVER";
    state.winner = winner;
    state.winReason = reason;

    // Reveal all roles
    const allPlayerData: Array<{
      playerId: string;
      nickname: string;
      role: WerewolfRole;
      roleTh: string;
      roleIcon: string;
      isAlive: boolean;
    }> = [];

    state.players.forEach((p) => {
      const role = this.playerRoles.get(p.id) || "villager";
      const wp = p as WerewolfPlayer;
      wp.revealedRole = ROLE_NAMES_TH[role];
      allPlayerData.push({
        playerId: p.id,
        nickname: p.nickname,
        role,
        roleTh: ROLE_NAMES_TH[role],
        roleIcon: ROLE_ICONS[role],
        isAlive: p.isAlive,
      });
    });

    this.broadcast("GAME_OVER", {
      winner,
      reason,
      players: allPlayerData,
      killHistory: state.killHistory.toArray().map((k) => ({
        night: k.night,
        victimId: k.victimId,
        victimNickname: k.victimNickname,
        victimRole: k.victimRole,
        cause: k.cause,
        wasSaved: k.wasSaved,
      })),
    });
  }

  // ─── MESSAGE HANDLERS ─────────────────────────────────────────

  private handleWolfVote(client: Client, targetId: string): void {
    if (this.state.phase !== "NIGHT") {
      this.sendError(client, "INVALID_PHASE", "ไม่ใช่ช่วงกลางคืน");
      return;
    }

    const player = this.state.players.get(client.sessionId) as WerewolfPlayer | undefined;
    if (!player || !player.isAlive || !player.isConnected) return;

    const role = this.playerRoles.get(client.sessionId);
    if (role !== "werewolf") {
      this.sendError(client, "NOT_WEREWOLF", "คุณไม่ใช่หมาป่า");
      return;
    }

    const target = this.state.players.get(targetId) as WerewolfPlayer | undefined;
    if (!target || !target.isAlive) {
      this.sendError(client, "INVALID_TARGET", "เป้าหมายไม่ถูกต้อง");
      return;
    }

    // Wolves cannot target other wolves
    const targetRole = this.playerRoles.get(targetId);
    if (targetRole === "werewolf") {
      this.sendError(client, "CANNOT_TARGET_WOLF", "ไม่สามารถเลือกหมาป่าด้วยกันได้");
      return;
    }

    // Record wolf vote
    this.wolfVoters.add(client.sessionId);
    const prevTarget = this.wolfVoteCounts.get(targetId) || 0;
    // Clear this wolf's previous vote if any
    this.wolfVoteCounts.forEach((count, tid) => {
      // We don't track individual wolf->target, so just use latest vote system
    });
    this.wolfVoteCounts.set(targetId, prevTarget + 1);

    player.hasActed = true;

    // Notify other wolves about the vote (private to wolf team)
    this.getAliveWolves().forEach((wolf) => {
      const wolfClient = this.clients.find((c) => c.sessionId === wolf.id);
      if (wolfClient) {
        wolfClient.send("WOLF_VOTE_UPDATE", {
          voterId: client.sessionId,
          voterNickname: player.nickname,
          targetId,
          targetNickname: target.nickname,
        });
      }
    });
  }

  private handleSeerPeek(client: Client, targetId: string): void {
    if (this.state.phase !== "NIGHT") {
      this.sendError(client, "INVALID_PHASE", "ไม่ใช่ช่วงกลางคืน");
      return;
    }

    const player = this.state.players.get(client.sessionId) as WerewolfPlayer | undefined;
    if (!player || !player.isAlive) return;

    const role = this.playerRoles.get(client.sessionId);
    if (role !== "seer") {
      this.sendError(client, "NOT_SEER", "คุณไม่ใช่หมอดู");
      return;
    }

    if (this.seerHasActed) {
      this.sendError(client, "ALREADY_ACTED", "คุณใช้ความสามารถไปแล้ว");
      return;
    }

    const target = this.state.players.get(targetId) as WerewolfPlayer | undefined;
    if (!target || !target.isAlive) {
      this.sendError(client, "INVALID_TARGET", "เป้าหมายไม่ถูกต้อง");
      return;
    }

    // Cannot peek self
    if (targetId === client.sessionId) {
      this.sendError(client, "CANNOT_PEEK_SELF", "ไม่สามารถดูตัวเองได้");
      return;
    }

    this.seerTarget = targetId;
    this.seerHasActed = true;
    player.hasActed = true;

    // Send peek result privately to the seer (Loki H3: sent once, never re-sent)
    const targetRole = this.playerRoles.get(targetId) || "villager";
    const isWerewolf = targetRole === "werewolf";

    client.send("SEER_RESULT", {
      targetId,
      targetNickname: target.nickname,
      isWerewolf,
    });
  }

  private handleDoctorSave(client: Client, targetId: string): void {
    if (this.state.phase !== "NIGHT") {
      this.sendError(client, "INVALID_PHASE", "ไม่ใช่ช่วงกลางคืน");
      return;
    }

    const player = this.state.players.get(client.sessionId) as WerewolfPlayer | undefined;
    if (!player || !player.isAlive) return;

    const role = this.playerRoles.get(client.sessionId);
    if (role !== "doctor") {
      this.sendError(client, "NOT_DOCTOR", "คุณไม่ใช่หมอ");
      return;
    }

    if (this.doctorHasActed) {
      this.sendError(client, "ALREADY_ACTED", "คุณใช้ความสามารถไปแล้ว");
      return;
    }

    const target = this.state.players.get(targetId) as WerewolfPlayer | undefined;
    if (!target || !target.isAlive) {
      this.sendError(client, "INVALID_TARGET", "เป้าหมายไม่ถูกต้อง");
      return;
    }

    this.doctorTarget = targetId;
    this.doctorHasActed = true;
    player.hasActed = true;

    // Confirm save action to the doctor
    client.send("DOCTOR_SAVE_CONFIRMED", {
      targetId,
      targetNickname: target.nickname,
    });
  }

  private handleNominate(client: Client, targetId: string): void {
    if (this.state.phase !== "DAY_DISCUSSION") {
      this.sendError(client, "INVALID_PHASE", "ไม่ใช่ช่วงอภิปราย");
      return;
    }

    const nominator = this.state.players.get(client.sessionId) as WerewolfPlayer | undefined;
    if (!nominator || !nominator.isAlive || !nominator.isConnected) return;

    const target = this.state.players.get(targetId) as WerewolfPlayer | undefined;
    if (!target || !target.isAlive || !target.isConnected) {
      this.sendError(client, "INVALID_TARGET", "เป้าหมายไม่ถูกต้อง");
      return;
    }

    if (targetId === client.sessionId) {
      this.sendError(client, "SELF_NOMINATE", "ไม่สามารถเสนอชื่อตัวเองได้");
      return;
    }

    // One nomination per day (Loki G1)
    // WW-003.4: Defense phase before vote
    this.startDayDefense(client.sessionId, targetId);
  }

  private handleDayVote(client: Client, vote: "eliminate" | "spare"): void {
    if (this.state.phase !== "DAY_VOTE") {
      this.sendError(client, "INVALID_PHASE", "ไม่ได้อยู่ในช่วงโหวต");
      return;
    }

    const player = this.state.players.get(client.sessionId) as WerewolfPlayer | undefined;
    if (!player || !player.isAlive || !player.isConnected) return;

    // Nominated player cannot vote (same as Spy pattern)
    if (client.sessionId === this.state.nominatedPlayerId) {
      this.sendError(client, "NOMINATED_CANNOT_VOTE", "ผู้ถูกเสนอชื่อไม่สามารถโหวตได้");
      return;
    }

    if (player.hasVoted) {
      this.sendError(client, "ALREADY_VOTED", "คุณโหวตแล้ว");
      return;
    }

    player.hasVoted = true;
    player.vote = vote;
    this.state.totalVotesCast++;

    if (vote === "eliminate") {
      this.state.eliminateVotes++;
    } else {
      this.state.spareVotes++;
    }

    this.broadcast("VOTE_CAST", {
      playerId: client.sessionId,
      playerNickname: player.nickname,
      totalVotesCast: this.state.totalVotesCast,
      totalVotersExpected: this.state.totalVotersExpected,
    });

    // Check if all votes are in
    if (this.state.totalVotesCast >= this.state.totalVotersExpected) {
      this.resolveDayVote();
    }
  }

  private handleUpdateConfig(
    client: Client,
    data: { discussionTimer?: number; nightTimer?: number; defenseTimer?: number },
  ): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || !player.isHost) {
      this.sendError(client, "NOT_HOST", "เฉพาะเจ้าของห้องเท่านั้น");
      return;
    }

    if (this.state.phase !== "LOBBY") {
      this.sendError(client, "INVALID_PHASE", "ไม่สามารถเปลี่ยนการตั้งค่าได้ในขณะนี้");
      return;
    }

    if (data.discussionTimer !== undefined) {
      // Allow 60, 90, 120 seconds
      const allowed = [60, 90, 120];
      if (allowed.includes(data.discussionTimer)) {
        this.state.discussionTimerSetting = data.discussionTimer;
      }
    }

    if (data.nightTimer !== undefined) {
      // Allow 20, 30, 45 seconds
      const allowed = [20, 30, 45];
      if (allowed.includes(data.nightTimer)) {
        this.state.nightTimerSetting = data.nightTimer;
      }
    }

    if (data.defenseTimer !== undefined) {
      // WW-003.4: Allow 15, 30, 45 seconds for defense
      const allowed = [15, 30, 45];
      if (allowed.includes(data.defenseTimer)) {
        this.state.defenseTimerSetting = data.defenseTimer;
      }
    }
  }

  // ─── HELPER METHODS ───────────────────────────────────────────

  private getAliveWolves(): WerewolfPlayer[] {
    const wolves: WerewolfPlayer[] = [];
    this.state.players.forEach((p) => {
      if (p.isAlive && this.playerRoles.get(p.id) === "werewolf") {
        wolves.push(p as WerewolfPlayer);
      }
    });
    return wolves;
  }

  private getAliveConnectedPlayers(): WerewolfPlayer[] {
    const alive: WerewolfPlayer[] = [];
    this.state.players.forEach((p) => {
      if (p.isAlive && p.isConnected) {
        alive.push(p as WerewolfPlayer);
      }
    });
    return alive;
  }

  private updateAliveCount(): void {
    let count = 0;
    this.state.players.forEach((p) => {
      if (p.isAlive) count++;
    });
    this.state.aliveCount = count;
  }

  private resetGameState(): void {
    this.clearAllTimers();

    const state = this.state;
    state.nightNumber = 0;
    state.timer = 0;
    state.lastNightVictimId = "";
    state.lastNightVictimNickname = "";
    state.lastNightSaved = false;
    state.nominatedPlayerId = "";
    state.nominatedPlayerNickname = "";
    state.nominatorId = "";
    state.eliminateVotes = 0;
    state.spareVotes = 0;
    state.totalVotesCast = 0;
    state.totalVotersExpected = 0;
    state.winner = "";
    state.winReason = "";
    state.killHistory.clear();
    state.aliveCount = 0;

    // Reset player states
    state.players.forEach((p) => {
      const wp = p as WerewolfPlayer;
      wp.revealedRole = "";
      wp.hasVoted = false;
      wp.vote = "";
      wp.hasActed = false;
      wp.isAlive = true;
    });

    this.playerRoles.clear();
    this.resetNightActions();
  }

  // ─── TIMER MANAGEMENT ─────────────────────────────────────────

  private stopNightTimer(): void {
    if (this.nightTimer) {
      this.nightTimer.clear();
      this.nightTimer = null;
    }
  }

  private stopDiscussionTimer(): void {
    if (this.discussionInterval) {
      this.discussionInterval.clear();
      this.discussionInterval = null;
    }
  }

  private stopVoteTimer(): void {
    if (this.voteTimer) {
      this.voteTimer.clear();
      this.voteTimer = null;
    }
  }

  private clearAllTimers(): void {
    this.stopNightTimer();
    this.stopDiscussionTimer();
    this.stopDefenseTimer();
    this.stopVoteTimer();
    if (this.dayAnnounceTimer) {
      this.dayAnnounceTimer.clear();
      this.dayAnnounceTimer = null;
    }
    if (this.roleRevealTimer) {
      this.roleRevealTimer.clear();
      this.roleRevealTimer = null;
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
