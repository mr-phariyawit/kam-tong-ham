import { Client, Delayed } from "colyseus";
import {
  GameState,
  Player,
  Accusation,
  GamePhase,
} from "../schemas/GameState";
import { pickUniqueWords } from "../utils/wordPicker";
import { BaseRoom, type GameRoomConfig } from "./BaseRoom";
import { BasePlayer } from "../schemas/BaseState";

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;
const COUNTDOWN_SECS = 3;
const VOTE_TIMER_SECS = 30; // blind voting: 30s for all eligible voters to cast
const GUESS_TIMER_SECS = 10;

/**
 * KhamTongHamRoom -- Forbidden Word game room.
 *
 * Extends BaseRoom for shared lobby, player management, host, kick, reconnection.
 * Contains only game-specific logic: word assignment, voting, scoring, phases.
 *
 * Refactored in KTH-T-009: ~1031 lines -> ~550 lines by inheriting BaseRoom.
 */
export class KhamTongHamRoom extends BaseRoom<GameState> {
  private tickInterval: Delayed | null = null;
  private usedWordsPerGame: Set<string> = new Set();
  /** Server-side only: maps playerId -> assigned word for current round */
  private roundWords: Map<string, string> = new Map();

  // ─── AEG-31: Blind voting ────────────────────────────────────
  /** Sealed votes -- not visible to clients until VOTE_REVEAL fires. */
  private sealedVotes: Map<string, string> = new Map(); // playerId -> "guilty" | "not_yet"

  // ─── BaseRoom abstract implementations ──────────────────────────

  protected createState(): GameState {
    return new GameState();
  }

  protected createPlayer(): Player {
    return new Player();
  }

  protected getGameConfig(): GameRoomConfig {
    return { minPlayers: MIN_PLAYERS, maxPlayers: MAX_PLAYERS };
  }

  protected onGameStart(_client: Client): void {
    this.state.currentRound = 0;
    this.usedWordsPerGame.clear();
    this.startCountdown();
  }

  // ─── BaseRoom optional hooks ────────────────────────────────────

  protected registerMessageHandlers(): void {
    this.onMessage("ACCUSE", (client, data: { targetPlayerId: string }) =>
      this.handleAccuse(client, data.targetPlayerId),
    );
    this.onMessage("VOTE", (client, data: { vote: string }) =>
      this.handleVote(client, data.vote),
    );
    this.onMessage("GUESS_WORD", (client, data: { guess: string }) =>
      this.handleGuessWord(client, data.guess),
    );
    this.onMessage("NEXT_ROUND", (client) => this.handleNextRound(client));
    this.onMessage("END_GAME", (client) => this.handleEndGame(client));
    this.onMessage("SURRENDER", (client) => this.handleSurrender(client));
    this.onMessage(
      "UPDATE_CONFIG",
      (client, data: { category?: string; totalRounds?: number; roundDurationSecs?: number }) =>
        this.handleUpdateConfig(client, data),
    );
  }

  protected onPlayerReconnected(client: Client, _player: BasePlayer): void {
    // Re-send the player's secret word if in an active round
    if (
      this.state.phase === "PLAYING" ||
      this.state.phase === "VOTING" ||
      this.state.phase === "COUNTDOWN"
    ) {
      const word = this.roundWords.get(client.sessionId);
      if (word) {
        client.send("YOUR_WORD", { word });
      }
    }
  }

  protected onPlayerDisconnectedDuringGame(player: BasePlayer): void {
    // Cast to Player to access game-specific fields
    const p = player as Player;
    if (p.isAlive) {
      p.isAlive = false;
      p.roundPoints -= 3;
      p.score -= 3;
      this.updateAliveCount();
      this.checkLastSurvivor();
    }
  }

  protected onGameDispose(): void {
    this.stopTick();
    this.roundWords.clear();
    this.sealedVotes.clear();
  }

  // ─── GAME-SPECIFIC MESSAGE HANDLERS ─────────────────────────────

  private handleAccuse(client: Client, targetPlayerId: string) {
    if (this.state.currentAccusation) {
      this.sendError(client, "VOTE_IN_PROGRESS", "กำลังโหวตอยู่");
      return;
    }

    if (this.state.phase !== "PLAYING") {
      this.sendError(client, "INVALID_PHASE", "ไม่สามารถกล่าวหาได้ในขณะนี้");
      return;
    }

    const accuser = this.state.players.get(client.sessionId);
    const target = this.state.players.get(targetPlayerId);

    if (!accuser || !target) {
      this.sendError(client, "PLAYER_NOT_FOUND", "ไม่พบผู้เล่น");
      return;
    }

    if (!accuser.isAlive) {
      this.sendError(client, "PLAYER_DEAD", "คุณถูกคัดออกแล้ว");
      return;
    }

    if (!target.isAlive) {
      this.sendError(client, "TARGET_DEAD", "ผู้เล่นนี้ถูกคัดออกแล้ว");
      return;
    }

    if (client.sessionId === targetPlayerId) {
      this.sendError(client, "SELF_ACCUSE", "ไม่สามารถกล่าวหาตัวเองได้");
      return;
    }

    // Create accusation
    const accusation = new Accusation();
    accusation.accuserId = client.sessionId;
    accusation.accuserName = accuser.nickname;
    accusation.targetId = targetPlayerId;
    accusation.targetName = target.nickname;
    accusation.voteDeadline = Date.now() + VOTE_TIMER_SECS * 1000;
    accusation.yesCount = 0;
    accusation.noCount = 0;
    accusation.votedCount = 0;

    // AEG-31: Eligible voters exclude BOTH the accused AND the accuser (self-exclusion).
    // AEG-32: Challenger self-exclusion is enforced here and in handleVote.
    const eligibleVoters = this.getGameAlivePlayers().filter(
      (p) => p.id !== targetPlayerId && p.id !== client.sessionId,
    );
    accusation.totalVoters = eligibleVoters.length;

    this.state.currentAccusation = accusation;
    this.state.phase = "VOTING";
    this.state.voteTimer = VOTE_TIMER_SECS;

    // Reset all votes
    this.state.players.forEach((p) => {
      (p as Player).vote = "";
    });

    // Clear sealed votes for this challenge round
    this.sealedVotes.clear();

    // Broadcast accusation details (targetWord intentionally omitted -- secret stays server-side)
    this.broadcast("ACCUSATION", {
      accuserId: accusation.accuserId,
      accuserName: accusation.accuserName,
      targetId: accusation.targetId,
      targetName: accusation.targetName,
      totalVoters: accusation.totalVoters,
    });
  }

  private handleVote(client: Client, vote: string) {
    if (this.state.phase !== "VOTING" || !this.state.currentAccusation) {
      this.sendError(client, "INVALID_PHASE", "ไม่สามารถโหวตได้ในขณะนี้");
      return;
    }

    const voter = this.state.players.get(client.sessionId);
    if (!voter || !voter.isAlive) {
      this.sendError(client, "CANNOT_VOTE", "คุณไม่สามารถโหวตได้");
      return;
    }

    // Accused cannot vote
    if (client.sessionId === this.state.currentAccusation.targetId) {
      this.sendError(client, "ACCUSED_CANNOT_VOTE", "ผู้ถูกกล่าวหาไม่สามารถโหวตได้");
      return;
    }

    // AEG-31/32: Accuser (challenger) cannot vote on their own challenge
    if (client.sessionId === this.state.currentAccusation.accuserId) {
      this.sendError(client, "ACCUSER_CANNOT_VOTE", "ผู้กล่าวหาไม่สามารถโหวตได้");
      return;
    }

    // Already voted (use sealedVotes for the check -- player.vote is set to "voted" sentinel)
    if (this.sealedVotes.has(client.sessionId)) {
      this.sendError(client, "ALREADY_VOTED", "คุณโหวตแล้ว");
      return;
    }

    const validVote = vote === "guilty" ? "guilty" : "not_yet";

    // AEG-31: Store vote in sealed map (invisible to clients until VOTE_REVEAL)
    this.sealedVotes.set(client.sessionId, validVote);

    // Mark player as "voted" without revealing the choice
    (voter as Player).vote = "voted";

    // Update progress counter (how many have voted, NOT what they voted)
    this.state.currentAccusation.votedCount = this.sealedVotes.size;

    // If all eligible voters have cast their votes, reveal immediately
    if (this.sealedVotes.size >= this.state.currentAccusation.totalVoters) {
      this.resolveVote();
    }
  }

  private handleGuessWord(client: Client, guess: string) {
    if (this.state.phase !== "GUESS_PHASE" && this.state.phase !== "PLAYING") {
      this.sendError(client, "INVALID_PHASE", "ไม่สามารถเดาคำได้ในขณะนี้");
      return;
    }

    const player = this.state.players.get(client.sessionId) as Player | undefined;
    if (!player) return;

    if (player.hasGuessed) {
      this.sendError(client, "ALREADY_GUESSED", "คุณเดาคำแล้ว");
      return;
    }

    const actualWord = this.roundWords.get(client.sessionId);
    if (!actualWord) return;

    player.hasGuessed = true;
    player.guessedWord = guess.trim();

    const isCorrect =
      guess.trim().toLowerCase() === actualWord.toLowerCase() ||
      guess.trim() === actualWord;
    player.guessCorrect = isCorrect;

    if (isCorrect) {
      player.roundPoints += 3;
      player.score += 3;
    }

    // Send result to this player only
    const targetClient = this.clients.find((c) => c.sessionId === client.sessionId);
    if (targetClient) {
      targetClient.send("GUESS_RESULT", {
        correct: isCorrect,
        word: actualWord,
      });
    }

    // In GUESS_PHASE, check if all alive players have guessed
    if (this.state.phase === "GUESS_PHASE") {
      const aliveNotGuessed = this.getGameAlivePlayers().filter((p) => !p.hasGuessed);
      if (aliveNotGuessed.length === 0) {
        this.showRoundEnd();
      }
    }
  }

  private handleNextRound(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player || !player.isHost) {
      this.sendError(client, "NOT_HOST", "เฉพาะเจ้าของห้องเท่านั้น");
      return;
    }

    if (
      this.state.phase !== "SCOREBOARD" &&
      this.state.phase !== "ROUND_END" &&
      this.state.phase !== "GUESS_PHASE"
    ) {
      this.sendError(client, "INVALID_PHASE", "ไม่สามารถเริ่มรอบถัดไปได้ในขณะนี้");
      return;
    }

    if (this.state.currentRound >= this.state.config.totalRounds) {
      this.handleEndGame(client);
      return;
    }

    this.startCountdown();
  }

  private handleEndGame(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player || !player.isHost) {
      this.sendError(client, "NOT_HOST", "เฉพาะเจ้าของห้องเท่านั้น");
      return;
    }

    this.stopTick();
    this.state.phase = "GAME_OVER";
    this.revealAllWords();

    this.broadcast("GAME_OVER", {
      rankings: this.getRankings(),
    });
  }

  private handleSurrender(client: Client) {
    if (this.state.phase !== "PLAYING" && this.state.phase !== "VOTING") {
      this.sendError(client, "INVALID_PHASE", "ไม่สามารถยอมแพ้ได้ในขณะนี้");
      return;
    }

    const player = this.state.players.get(client.sessionId) as Player | undefined;
    if (!player || !player.isAlive) return;

    player.isAlive = false;
    player.roundPoints -= 3;
    player.score -= 3;
    this.updateAliveCount();
    this.checkLastSurvivor();
  }

  private handleUpdateConfig(
    client: Client,
    data: { category?: string; totalRounds?: number; roundDurationSecs?: number },
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

    if (data.category) {
      this.state.config.category = data.category;
    }
    if (data.totalRounds && data.totalRounds >= 1 && data.totalRounds <= 5) {
      this.state.config.totalRounds = data.totalRounds;
    }
    if (
      data.roundDurationSecs &&
      [120, 180, 300].includes(data.roundDurationSecs)
    ) {
      this.state.config.roundDurationSecs = data.roundDurationSecs;
    }
  }

  // ─── GAME FLOW ──────────────────────────────────────────────

  private startCountdown() {
    this.state.currentRound++;
    this.state.phase = "COUNTDOWN";
    this.state.countdownTimer = COUNTDOWN_SECS;

    // Reset player state for new round
    this.state.players.forEach((bp) => {
      const p = bp as Player;
      if (p.isConnected) {
        p.isAlive = true;
      }
      p.vote = "";
      p.hasGuessed = false;
      p.guessCorrect = false;
      p.guessedWord = "";
      p.assignedWord = "";
      p.roundPoints = 0;
    });
    this.state.currentAccusation = null;
    this.sealedVotes.clear();

    // Assign words
    this.assignWords();

    // Countdown tick
    this.stopTick();
    let countdown = COUNTDOWN_SECS;

    this.broadcast("COUNTDOWN", { secondsLeft: countdown });

    this.tickInterval = this.clock.setInterval(() => {
      countdown--;
      this.state.countdownTimer = countdown;
      this.broadcast("COUNTDOWN", { secondsLeft: countdown });

      if (countdown <= 0) {
        this.startPlaying();
      }
    }, 1000);
  }

  private startPlaying() {
    this.stopTick();
    this.state.phase = "PLAYING";
    this.state.roundTimer = this.state.config.roundDurationSecs;
    this.updateAliveCount();

    // Send each player their secret word privately
    this.clients.forEach((client) => {
      const word = this.roundWords.get(client.sessionId);
      if (word) {
        client.send("YOUR_WORD", { word });
      }
    });

    // Start round timer tick (every second)
    this.tickInterval = this.clock.setInterval(() => {
      this.tick();
    }, 1000);
  }

  private tick() {
    if (this.state.phase === "PLAYING") {
      this.state.roundTimer--;
      if (this.state.roundTimer <= 0) {
        this.endRound("timer");
      }
    } else if (this.state.phase === "VOTING") {
      this.state.voteTimer--;
      if (this.state.voteTimer <= 0) {
        // Timer expired: absent votes default to "not_yet" -- resolve with sealed votes as-is
        this.resolveVote();
      }
    } else if (this.state.phase === "GUESS_PHASE") {
      this.state.guessTimer--;
      if (this.state.guessTimer <= 0) {
        this.showRoundEnd();
      }
    }
  }

  private endRound(reason: "timer" | "last_survivor") {
    this.stopTick();

    // Award survival points to alive players
    this.state.players.forEach((bp) => {
      const p = bp as Player;
      if (p.isAlive && p.isConnected) {
        p.roundPoints += 5;
        p.score += 5;
      }
    });

    this.broadcast("ROUND_END", { reason });

    // Check if any alive players exist for guess phase
    const alivePlayers = this.getGameAlivePlayers();
    if (alivePlayers.length > 0) {
      this.state.phase = "GUESS_PHASE";
      this.state.guessTimer = GUESS_TIMER_SECS;

      this.tickInterval = this.clock.setInterval(() => {
        this.tick();
      }, 1000);
    } else {
      this.showRoundEnd();
    }
  }

  private resolveVote() {
    if (!this.state.currentAccusation) return;

    const accusation = this.state.currentAccusation;

    // AEG-31: Count votes from the sealed map (absent votes count as "not_yet")
    let yesCount = 0;
    let noCount = 0;
    this.sealedVotes.forEach((vote) => {
      if (vote === "guilty") yesCount++;
      else noCount++;
    });

    const totalEligible = accusation.totalVoters;
    const absentVotes = totalEligible - (yesCount + noCount);
    const effectiveNoCount = noCount + absentVotes;

    // Majority = strictly more than 50% of eligible voters
    const guilty = yesCount > effectiveNoCount;

    const accuser = this.state.players.get(accusation.accuserId) as Player | undefined;
    const target = this.state.players.get(accusation.targetId) as Player | undefined;

    if (guilty) {
      // Kill confirmed
      if (target) {
        target.isAlive = false;
        target.roundPoints -= 3;
        target.score -= 3;
      }
      if (accuser) {
        accuser.roundPoints += 2;
        accuser.score += 2;
      }
    } else {
      // AEG-32: False challenge -- deduct 1 point from challenger
      if (accuser) {
        accuser.roundPoints -= 1;
        accuser.score -= 1;
      }
      // AEG-53: Emit CHALLENGE_PENALTY so the UI penalty toast fires
      this.broadcast("CHALLENGE_PENALTY", {
        accuserId: accusation.accuserId,
        accuserName: accuser?.nickname ?? "",
        penalty: 1,
      });
    }

    // AEG-31: Reveal all individual votes simultaneously via VOTE_REVEAL event
    const voteList: Array<{ playerId: string; vote: string }> = [];
    this.sealedVotes.forEach((vote, playerId) => {
      voteList.push({ playerId, vote });
    });

    this.broadcast("VOTE_REVEAL", {
      guilty,
      yesCount,
      noCount: effectiveNoCount,
      targetId: accusation.targetId,
      accuserId: accusation.accuserId,
      votes: voteList,
    });

    // Update player.vote fields to actual votes (post-reveal)
    this.sealedVotes.forEach((vote, playerId) => {
      const p = this.state.players.get(playerId) as Player | undefined;
      if (p) p.vote = vote;
    });

    // Clear accusation and sealed votes
    this.sealedVotes.clear();
    this.state.currentAccusation = null;
    this.state.players.forEach((bp) => {
      const p = bp as Player;
      if (p.vote === "voted") p.vote = ""; // clear any remaining "voted" sentinels
    });

    // Return to playing
    this.state.phase = "PLAYING";
    this.updateAliveCount();

    // Check for last survivor after a kill
    if (guilty) {
      this.checkLastSurvivor();
    }
  }

  private showRoundEnd() {
    this.stopTick();
    this.revealAllWords();
    this.state.phase = "ROUND_END";

    // After a short display, move to scoreboard
    this.clock.setTimeout(() => {
      if (this.state.phase === "ROUND_END") {
        this.state.phase = "SCOREBOARD";
      }
    }, 5000);
  }

  // ─── GAME-SPECIFIC HELPERS ──────────────────────────────────

  private assignWords() {
    const connectedPlayers = this.getConnectedPlayers();
    const words = pickUniqueWords(
      this.state.config.category,
      connectedPlayers.length,
      this.usedWordsPerGame,
    );

    this.roundWords.clear();
    connectedPlayers.forEach((player, index) => {
      const word = words[index];
      this.roundWords.set(player.id, word);
      this.usedWordsPerGame.add(word);
    });
  }

  private revealAllWords() {
    this.state.players.forEach((bp) => {
      const p = bp as Player;
      const word = this.roundWords.get(p.id);
      if (word) {
        p.assignedWord = word;
      }
    });
  }

  private updateAliveCount() {
    let count = 0;
    this.state.players.forEach((p) => {
      if (p.isAlive && p.isConnected) count++;
    });
    this.state.aliveCount = count;
  }

  /**
   * Get alive and connected players, cast to game-specific Player type.
   * Uses BaseRoom's getAlivePlayers() internally but returns typed Players.
   */
  private getGameAlivePlayers(): Player[] {
    const alive: Player[] = [];
    this.state.players.forEach((p) => {
      if (p.isAlive && p.isConnected) alive.push(p as Player);
    });
    return alive;
  }

  private checkLastSurvivor() {
    if (this.state.phase !== "PLAYING" && this.state.phase !== "VOTING") return;

    const alivePlayers = this.getGameAlivePlayers();
    if (alivePlayers.length <= 1) {
      // If we're in voting, resolve it first conceptually, but end round
      if (this.state.phase === "VOTING") {
        this.sealedVotes.clear();
        this.state.currentAccusation = null;
        this.state.players.forEach((bp) => {
          (bp as Player).vote = "";
        });
      }
      this.state.phase = "PLAYING"; // Briefly set to playing so endRound works
      this.endRound("last_survivor");
    }
  }

  private getRankings(): Array<{
    id: string;
    nickname: string;
    avatar: string;
    score: number;
    rank: number;
  }> {
    const players: Array<{
      id: string;
      nickname: string;
      avatar: string;
      score: number;
      rank: number;
    }> = [];

    this.state.players.forEach((p) => {
      players.push({
        id: p.id,
        nickname: p.nickname,
        avatar: p.avatar,
        score: p.score,
        rank: 0,
      });
    });

    players.sort((a, b) => b.score - a.score);
    players.forEach((p, i) => {
      p.rank = i + 1;
    });

    return players;
  }

  private stopTick() {
    if (this.tickInterval) {
      this.tickInterval.clear();
      this.tickInterval = null;
    }
  }
}
