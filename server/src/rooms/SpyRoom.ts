import { Client, Delayed } from "colyseus";
import {
  SpyState,
  SpyPlayer,
  LocationInfo,
} from "../schemas/SpyState";
import { BaseRoom, type GameRoomConfig } from "./BaseRoom";
import { BasePlayer } from "../schemas/BaseState";
import locationData from "../data/locations.json";

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 8;
const ROLE_REVEAL_SECS = 5;
const VOTE_TIMEOUT_SECS = 30;
const SPY_GUESS_TIMEOUT_SECS = 30;
const DEFAULT_TIMER_SECS = 480; // 8 minutes

/**
 * Location entry from the JSON data file.
 */
interface LocationEntry {
  id: string;
  name: string;
  nameEn: string;
  icon: string;
  category: string;
  roles: string[];
}

/**
 * SpyRoom -- สายลับ (Spyfall-style) game room.
 *
 * Extends BaseRoom for shared lobby, player management, host, kick, reconnection.
 * Contains only game-specific logic: spy assignment, location selection,
 * question flow, accusation voting, spy guess mechanic.
 *
 * Spec: PLATFORM_SPEC_v2.md sections SP-001 through SP-004.
 */
export class SpyRoom extends BaseRoom<SpyState> {
  private gameTimerInterval: Delayed | null = null;
  private voteTimeout: Delayed | null = null;
  private spyGuessTimeout: Delayed | null = null;

  /**
   * Server-side only: the actual location for this round.
   * Not synced to clients until game over.
   */
  private currentLocation: LocationEntry | null = null;

  /**
   * Server-side only: mapping of player sessionId -> assigned role.
   * Only the individual player receives their own role via private message.
   */
  private playerRoles: Map<string, string> = new Map();

  /**
   * Server-side only: the spy's session id.
   */
  private spySessionId: string = "";

  // ─── BaseRoom abstract implementations ──────────────────────────

  protected createState(): SpyState {
    return new SpyState();
  }

  protected createPlayer(): SpyPlayer {
    return new SpyPlayer();
  }

  protected getGameConfig(): GameRoomConfig {
    return { minPlayers: MIN_PLAYERS, maxPlayers: MAX_PLAYERS };
  }

  protected onGameStart(_client: Client): void {
    const state = this.state;
    state.round++;

    // Reset previous round state
    this.resetGameState();

    // Pick a random location
    const locations = locationData.locations as LocationEntry[];
    const locationIndex = Math.floor(Math.random() * locations.length);
    this.currentLocation = locations[locationIndex];

    // Build location list for all players (including spy -- they use it to guess)
    state.locationList.clear();
    for (const loc of locations) {
      const info = new LocationInfo();
      info.id = loc.id;
      info.name = loc.name;
      info.icon = loc.icon;
      state.locationList.push(info);
    }

    // Assign spy
    const connected = this.getConnectedPlayers() as SpyPlayer[];
    const spyIndex = Math.floor(Math.random() * connected.length);
    const spy = connected[spyIndex];
    this.spySessionId = spy.id;
    spy.isSpy = true;
    state.revealedSpyId = ""; // Don't reveal yet

    // Assign roles to non-spy players
    this.playerRoles.clear();
    const availableRoles = [...this.currentLocation.roles];
    this.shuffleArray(availableRoles);

    let roleIndex = 0;
    for (const player of connected) {
      if (player.id === spy.id) {
        player.role = "";
        player.isSpy = true;
        this.playerRoles.set(player.id, "spy");
      } else {
        const role = availableRoles[roleIndex % availableRoles.length];
        player.role = role;
        player.isSpy = false;
        this.playerRoles.set(player.id, role);
        roleIndex++;
      }
    }

    // Enter role reveal phase
    state.phase = "ROLE_REVEAL";

    // Send private role data to each player
    this.sendRoleRevealToAll();

    // After reveal, start discussion
    this.clock.setTimeout(() => {
      if (state.phase === "ROLE_REVEAL") {
        this.startDiscussion();
      }
    }, ROLE_REVEAL_SECS * 1000);
  }

  // ─── BaseRoom optional hooks ────────────────────────────────────

  protected registerMessageHandlers(): void {
    this.onMessage("ACCUSE", (client, data: { targetPlayerId: string }) =>
      this.handleAccuse(client, data.targetPlayerId),
    );
    this.onMessage("VOTE", (client, data: { vote: "guilty" | "innocent" }) =>
      this.handleVote(client, data.vote),
    );
    this.onMessage("SPY_GUESS", (client, data: { locationId: string }) =>
      this.handleSpyGuess(client, data.locationId),
    );
    this.onMessage("UPDATE_CONFIG", (client, data: { timerSetting?: number }) =>
      this.handleUpdateConfig(client, data),
    );
  }

  protected onPlayerReconnected(client: Client, _player: BasePlayer): void {
    const player = _player as SpyPlayer;

    // Re-send private role data
    if (this.state.phase !== "LOBBY" && this.state.phase !== "GAME_OVER") {
      if (player.isSpy) {
        client.send("ROLE_DATA", {
          isSpy: true,
          location: null,
          role: null,
        });
      } else {
        client.send("ROLE_DATA", {
          isSpy: false,
          location: this.currentLocation
            ? { id: this.currentLocation.id, name: this.currentLocation.name, icon: this.currentLocation.icon }
            : null,
          role: this.playerRoles.get(player.id) || "",
        });
      }
    }
  }

  protected onPlayerDisconnectedDuringGame(player: BasePlayer): void {
    const spyPlayer = player as SpyPlayer;

    // If the spy disconnects, hunters win
    if (spyPlayer.isSpy && this.state.phase !== "GAME_OVER") {
      this.endGame("hunters", "spy_disconnected");
    }
  }

  protected onGameDispose(): void {
    this.stopGameTimer();
    this.stopVoteTimeout();
    this.stopSpyGuessTimeout();
    this.currentLocation = null;
    this.playerRoles.clear();
    this.spySessionId = "";
  }

  // ─── MESSAGE HANDLERS ──────────────────────────────────────────

  private handleAccuse(client: Client, targetPlayerId: string) {
    if (this.state.phase !== "DISCUSSION") {
      this.sendError(client, "INVALID_PHASE", "ไม่สามารถกล่าวหาได้ในขณะนี้");
      return;
    }

    const accuser = this.state.players.get(client.sessionId) as SpyPlayer | undefined;
    if (!accuser || !accuser.isAlive || !accuser.isConnected) return;

    const target = this.state.players.get(targetPlayerId) as SpyPlayer | undefined;
    if (!target || !target.isAlive || !target.isConnected) {
      this.sendError(client, "INVALID_TARGET", "ผู้เล่นไม่ถูกต้อง");
      return;
    }

    if (targetPlayerId === client.sessionId) {
      this.sendError(client, "SELF_ACCUSE", "ไม่สามารถกล่าวหาตัวเองได้");
      return;
    }

    // Pause the game timer during voting
    this.stopGameTimer();

    // Start accusation vote
    this.state.phase = "VOTING";
    this.state.accusedPlayerId = targetPlayerId;
    this.state.accuserPlayerId = client.sessionId;
    this.state.guiltyVotes = 0;
    this.state.innocentVotes = 0;
    this.state.totalVotesCast = 0;

    // Reset all votes
    const alivePlayers = this.getAlivePlayers() as SpyPlayer[];
    alivePlayers.forEach((p) => {
      p.hasVoted = false;
      p.vote = "";
    });

    // Voters = all alive connected players EXCEPT the accused
    const voters = alivePlayers.filter((p) => p.id !== targetPlayerId);
    this.state.totalVotersExpected = voters.length;

    this.broadcast("ACCUSATION_STARTED", {
      accuserId: client.sessionId,
      accuserNickname: accuser.nickname,
      targetId: targetPlayerId,
      targetNickname: target.nickname,
    });

    // Vote timeout
    this.startVoteTimeout();
  }

  private handleVote(client: Client, vote: "guilty" | "innocent") {
    if (this.state.phase !== "VOTING") {
      this.sendError(client, "INVALID_PHASE", "ไม่ได้อยู่ในช่วงโหวต");
      return;
    }

    const player = this.state.players.get(client.sessionId) as SpyPlayer | undefined;
    if (!player || !player.isAlive || !player.isConnected) return;

    // Accused player cannot vote
    if (client.sessionId === this.state.accusedPlayerId) {
      this.sendError(client, "ACCUSED_CANNOT_VOTE", "ผู้ถูกกล่าวหาไม่สามารถโหวตได้");
      return;
    }

    // Already voted
    if (player.hasVoted) {
      this.sendError(client, "ALREADY_VOTED", "คุณโหวตแล้ว");
      return;
    }

    player.hasVoted = true;
    player.vote = vote;
    this.state.totalVotesCast++;

    if (vote === "guilty") {
      this.state.guiltyVotes++;
    } else {
      this.state.innocentVotes++;
    }

    this.broadcast("VOTE_CAST", {
      playerId: client.sessionId,
      playerNickname: player.nickname,
      totalVotesCast: this.state.totalVotesCast,
      totalVotersExpected: this.state.totalVotersExpected,
    });

    // Check if all votes are in
    if (this.state.totalVotesCast >= this.state.totalVotersExpected) {
      this.resolveVote();
    }
  }

  private handleSpyGuess(client: Client, locationId: string) {
    // Spy can guess during DISCUSSION or SPY_GUESS phase
    if (this.state.phase !== "DISCUSSION" && this.state.phase !== "SPY_GUESS") {
      this.sendError(client, "INVALID_PHASE", "ไม่สามารถเดาได้ในขณะนี้");
      return;
    }

    const player = this.state.players.get(client.sessionId) as SpyPlayer | undefined;
    if (!player || !player.isSpy) {
      this.sendError(client, "NOT_SPY", "เฉพาะสายลับเท่านั้นที่เดาสถานที่ได้");
      return;
    }

    this.stopGameTimer();
    this.stopSpyGuessTimeout();

    this.state.spyGuess = locationId;

    // Check if guess is correct
    if (this.currentLocation && locationId === this.currentLocation.id) {
      this.endGame("spy", "correct_guess");
    } else {
      this.endGame("hunters", "wrong_guess");
    }
  }

  private handleUpdateConfig(
    client: Client,
    data: { timerSetting?: number },
  ) {
    const player = this.state.players.get(client.sessionId);
    if (!player || !player.isHost) {
      this.sendError(client, "NOT_HOST", "เฉพาะเจ้าของห้องเท่านั้น");
      return;
    }

    if (this.state.phase !== "LOBBY") {
      this.sendError(client, "INVALID_PHASE", "ไม่สามารถเปลี่ยนการตั้งค่าได้ในขณะนี้");
      return;
    }

    if (data.timerSetting !== undefined) {
      // Allow 300 (5min), 360 (6min), 420 (7min), 480 (8min)
      const allowed = [300, 360, 420, 480];
      if (allowed.includes(data.timerSetting)) {
        this.state.timerSetting = data.timerSetting;
      }
    }
  }

  // ─── GAME FLOW ──────────────────────────────────────────────────

  /**
   * Send private role data to each player.
   */
  private sendRoleRevealToAll() {
    this.clients.forEach((client) => {
      const player = this.state.players.get(client.sessionId) as SpyPlayer | undefined;
      if (!player) return;

      if (player.isSpy) {
        client.send("ROLE_DATA", {
          isSpy: true,
          location: null,
          role: null,
        });
      } else {
        client.send("ROLE_DATA", {
          isSpy: false,
          location: this.currentLocation
            ? { id: this.currentLocation.id, name: this.currentLocation.name, icon: this.currentLocation.icon }
            : null,
          role: this.playerRoles.get(player.id) || "",
        });
      }
    });
  }

  /**
   * Start the discussion phase with countdown timer.
   */
  private startDiscussion() {
    this.state.phase = "DISCUSSION";
    this.state.timer = this.state.timerSetting || DEFAULT_TIMER_SECS;

    this.broadcast("PHASE_CHANGE", {
      phase: "DISCUSSION",
      timer: this.state.timer,
    });

    this.startGameTimer();
  }

  /**
   * Resolve an accusation vote.
   */
  private resolveVote() {
    this.stopVoteTimeout();

    const accusedId = this.state.accusedPlayerId;
    const accused = this.state.players.get(accusedId) as SpyPlayer | undefined;

    // Majority required (> 50% of voters)
    const majority = Math.floor(this.state.totalVotersExpected / 2) + 1;
    const isGuilty = this.state.guiltyVotes >= majority;

    this.broadcast("VOTE_RESULT", {
      accusedId,
      accusedNickname: accused?.nickname || "",
      guilty: this.state.guiltyVotes,
      innocent: this.state.innocentVotes,
      isGuilty,
    });

    if (isGuilty) {
      // Player voted out -- check if they're the spy
      if (accused?.isSpy) {
        // Hunters win! Spy was caught
        const isUnanimous = this.state.innocentVotes === 0;
        this.endGame("hunters", isUnanimous ? "caught_unanimous" : "caught");
      } else {
        // Wrong accusation -- spy wins
        this.endGame("spy", "wrong_accusation");
      }
    } else {
      // Not enough votes to convict -- resume discussion
      this.state.phase = "DISCUSSION";
      this.state.accusedPlayerId = "";
      this.state.accuserPlayerId = "";

      // Resume game timer
      this.startGameTimer();

      this.broadcast("PHASE_CHANGE", {
        phase: "DISCUSSION",
        timer: this.state.timer,
      });
    }
  }

  /**
   * Called when the game timer expires.
   * Spy wins by survival -- OR give spy a last chance to guess.
   */
  private onTimerExpired() {
    this.stopGameTimer();

    // Give the spy a chance to guess the location
    this.state.phase = "SPY_GUESS";

    this.broadcast("PHASE_CHANGE", {
      phase: "SPY_GUESS",
    });

    // Spy has 30 seconds to guess
    this.startSpyGuessTimeout();
  }

  /**
   * End the game.
   */
  private endGame(winner: "spy" | "hunters", reason: string) {
    this.stopGameTimer();
    this.stopVoteTimeout();
    this.stopSpyGuessTimeout();

    this.state.phase = "GAME_OVER";
    this.state.winner = winner;
    this.state.winReason = reason;
    this.state.revealedSpyId = this.spySessionId;
    this.state.revealedLocation = this.currentLocation?.name || "";

    // Assign scores
    const alivePlayers = this.getAlivePlayers() as SpyPlayer[];
    for (const player of alivePlayers) {
      if (winner === "hunters" && !player.isSpy) {
        player.score += 2;
        if (reason === "caught_unanimous") {
          player.score += 1; // Bonus for unanimous catch
        }
      } else if (winner === "spy" && player.isSpy) {
        player.score += 2;
      }
    }

    // Reveal all roles
    const allPlayers: SpyPlayer[] = [];
    this.state.players.forEach((p) => allPlayers.push(p as SpyPlayer));

    const roleReveal = allPlayers.map((p) => ({
      playerId: p.id,
      nickname: p.nickname,
      isSpy: p.isSpy,
      role: this.playerRoles.get(p.id) || "",
    }));

    this.broadcast("GAME_OVER", {
      winner,
      reason,
      spyId: this.spySessionId,
      spyNickname: this.state.players.get(this.spySessionId)?.nickname || "",
      location: this.currentLocation
        ? { id: this.currentLocation.id, name: this.currentLocation.name, icon: this.currentLocation.icon }
        : null,
      spyGuess: this.state.spyGuess,
      roles: roleReveal,
    });
  }

  /**
   * Reset game state for a new round.
   */
  private resetGameState() {
    this.stopGameTimer();
    this.stopVoteTimeout();
    this.stopSpyGuessTimeout();

    this.state.timer = 0;
    this.state.accusedPlayerId = "";
    this.state.accuserPlayerId = "";
    this.state.guiltyVotes = 0;
    this.state.innocentVotes = 0;
    this.state.totalVotesCast = 0;
    this.state.totalVotersExpected = 0;
    this.state.winner = "";
    this.state.winReason = "";
    this.state.revealedSpyId = "";
    this.state.revealedLocation = "";
    this.state.spyGuess = "";
    this.state.locationList.clear();

    // Reset player states
    this.state.players.forEach((p) => {
      const sp = p as SpyPlayer;
      sp.isSpy = false;
      sp.role = "";
      sp.hasVoted = false;
      sp.vote = "";
      sp.isAlive = true;
    });

    this.currentLocation = null;
    this.playerRoles.clear();
    this.spySessionId = "";
  }

  // ─── TIMERS ─────────────────────────────────────────────────────

  private startGameTimer() {
    this.stopGameTimer();

    this.gameTimerInterval = this.clock.setInterval(() => {
      this.state.timer--;
      if (this.state.timer <= 0) {
        this.onTimerExpired();
      }
    }, 1000);
  }

  private stopGameTimer() {
    if (this.gameTimerInterval) {
      this.gameTimerInterval.clear();
      this.gameTimerInterval = null;
    }
  }

  private startVoteTimeout() {
    this.stopVoteTimeout();

    this.voteTimeout = this.clock.setTimeout(() => {
      // Auto-resolve with current votes
      if (this.state.phase === "VOTING") {
        this.resolveVote();
      }
    }, VOTE_TIMEOUT_SECS * 1000);
  }

  private stopVoteTimeout() {
    if (this.voteTimeout) {
      this.voteTimeout.clear();
      this.voteTimeout = null;
    }
  }

  private startSpyGuessTimeout() {
    this.stopSpyGuessTimeout();

    this.spyGuessTimeout = this.clock.setTimeout(() => {
      // Spy didn't guess in time -- spy wins by survival
      if (this.state.phase === "SPY_GUESS") {
        this.endGame("spy", "time_expired");
      }
    }, SPY_GUESS_TIMEOUT_SECS * 1000);
  }

  private stopSpyGuessTimeout() {
    if (this.spyGuessTimeout) {
      this.spyGuessTimeout.clear();
      this.spyGuessTimeout = null;
    }
  }

  // ─── UTILITIES ──────────────────────────────────────────────────

  private shuffleArray<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
}
