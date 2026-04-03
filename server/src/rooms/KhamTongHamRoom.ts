import { Room, Client, Delayed } from "colyseus";
import {
  GameState,
  Player,
  Accusation,
  GameConfig,
  GamePhase,
  PLAYER_COLORS,
} from "../schemas/GameState";
import { pickUniqueWords } from "../utils/wordPicker";
import { activeRoomCodes } from "../utils/roomRegistry";

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;
const COUNTDOWN_SECS = 3;
const VOTE_TIMER_SECS = 15;
const GUESS_TIMER_SECS = 10;
const INACTIVITY_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours

interface JoinOptions {
  nickname: string;
  avatar: string;
  roomCode?: string;
}

export class KhamTongHamRoom extends Room<GameState> {
  private tickInterval: Delayed | null = null;
  private inactivityTimeout: Delayed | null = null;
  private usedWordsPerGame: Set<string> = new Set();
  /** Server-side only: maps playerId -> assigned word for current round */
  private roundWords: Map<string, string> = new Map();
  private colorIndex: number = 0;

  onCreate(options: { roomCode: string }) {
    this.setState(new GameState());
    this.state.roomCode = options.roomCode || "";
    this.state.phase = "LOBBY";
    this.state.createdAt = Date.now();

    this.maxClients = MAX_PLAYERS;
    this.autoDispose = true;

    // Register message handlers
    this.onMessage("START_GAME", (client) => this.handleStartGame(client));
    this.onMessage("ACCUSE", (client, data: { targetPlayerId: string }) =>
      this.handleAccuse(client, data.targetPlayerId)
    );
    this.onMessage("VOTE", (client, data: { vote: string }) =>
      this.handleVote(client, data.vote)
    );
    this.onMessage("GUESS_WORD", (client, data: { guess: string }) =>
      this.handleGuessWord(client, data.guess)
    );
    this.onMessage("NEXT_ROUND", (client) => this.handleNextRound(client));
    this.onMessage("END_GAME", (client) => this.handleEndGame(client));
    this.onMessage("SURRENDER", (client) => this.handleSurrender(client));
    this.onMessage(
      "UPDATE_CONFIG",
      (client, data: { category?: string; totalRounds?: number; roundDurationSecs?: number }) =>
        this.handleUpdateConfig(client, data)
    );
    this.onMessage("KICK_PLAYER", (client, data: { targetPlayerId: string }) =>
      this.handleKickPlayer(client, data.targetPlayerId)
    );

    this.resetInactivityTimer();
  }

  onJoin(client: Client, options: JoinOptions) {
    const player = new Player();
    player.id = client.sessionId;
    player.nickname = (options.nickname || "ผู้เล่น").slice(0, 15);
    player.avatar = options.avatar || "😀";
    player.isHost = this.state.players.size === 0;
    player.isAlive = true;
    player.isConnected = true;
    player.score = 0;
    player.color = PLAYER_COLORS[this.colorIndex % PLAYER_COLORS.length];
    this.colorIndex++;

    this.state.players.set(client.sessionId, player);
    this.state.playerCount = this.state.players.size;
    this.resetInactivityTimer();
  }

  onLeave(client: Client, consented: boolean) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    if (this.state.phase === "LOBBY") {
      // In lobby, remove the player entirely
      const wasHost = player.isHost;
      this.state.players.delete(client.sessionId);
      this.state.playerCount = this.state.players.size;

      // Transfer host if needed
      if (wasHost && this.state.players.size > 0) {
        this.transferHost();
      }
    } else {
      // During game, mark as disconnected and treat as surrendered
      player.isConnected = false;
      if (player.isAlive) {
        player.isAlive = false;
        player.roundPoints -= 3;
        player.score -= 3;
        this.updateAliveCount();
        this.checkLastSurvivor();
      }

      // Transfer host if needed
      if (player.isHost) {
        player.isHost = false;
        this.transferHost();
      }
    }

    this.resetInactivityTimer();

    // Clean up if all players left
    if (this.state.players.size === 0 || this.allDisconnected()) {
      this.clock.setTimeout(() => {
        if (this.allDisconnected()) {
          this.disconnect();
        }
      }, 30000);
    }
  }

  // ─── MESSAGE HANDLERS ───────────────────────────────────────

  private handleStartGame(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player || !player.isHost) {
      this.sendError(client, "NOT_HOST", "เฉพาะเจ้าของห้องเท่านั้นที่เริ่มเกมได้");
      return;
    }

    const connectedCount = this.getConnectedPlayers().length;
    if (connectedCount < MIN_PLAYERS) {
      this.sendError(client, "NOT_ENOUGH_PLAYERS", "ต้องมีผู้เล่นอย่างน้อย 2 คน");
      return;
    }

    if (this.state.phase !== "LOBBY" && this.state.phase !== "SCOREBOARD") {
      this.sendError(client, "INVALID_PHASE", "ไม่สามารถเริ่มเกมได้ในขณะนี้");
      return;
    }

    this.state.currentRound = 0;
    this.usedWordsPerGame.clear();
    this.startCountdown();
  }

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

    // Count eligible voters: alive players excluding the accused and the accuser
    const eligibleVoters = this.getAlivePlayers().filter(
      (p) => p.id !== targetPlayerId && p.id !== client.sessionId
    );
    accusation.totalVoters = eligibleVoters.length;

    this.state.currentAccusation = accusation;
    this.state.phase = "VOTING";
    this.state.voteTimer = VOTE_TIMER_SECS;

    // Reset all votes
    this.state.players.forEach((p) => {
      p.vote = "";
    });

    // Broadcast accusation details (targetWord intentionally omitted — secret stays server-side)
    this.broadcast("ACCUSATION", {
      accuserId: accusation.accuserId,
      accuserName: accusation.accuserName,
      targetId: accusation.targetId,
      targetName: accusation.targetName,
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

    // Already voted
    if (voter.vote === "guilty" || voter.vote === "not_yet") {
      this.sendError(client, "ALREADY_VOTED", "คุณโหวตแล้ว");
      return;
    }

    const validVote = vote === "guilty" ? "guilty" : "not_yet";
    voter.vote = validVote;

    if (validVote === "guilty") {
      this.state.currentAccusation.yesCount++;
    } else {
      this.state.currentAccusation.noCount++;
    }

    // Check if all eligible voters have voted
    const totalVoted =
      this.state.currentAccusation.yesCount + this.state.currentAccusation.noCount;
    if (totalVoted >= this.state.currentAccusation.totalVoters) {
      this.resolveVote();
    }
  }

  private handleGuessWord(client: Client, guess: string) {
    if (this.state.phase !== "GUESS_PHASE" && this.state.phase !== "PLAYING") {
      this.sendError(client, "INVALID_PHASE", "ไม่สามารถเดาคำได้ในขณะนี้");
      return;
    }

    const player = this.state.players.get(client.sessionId);
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
      const aliveNotGuessed = this.getAlivePlayers().filter((p) => !p.hasGuessed);
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

    if (this.state.phase !== "SCOREBOARD") {
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

    const player = this.state.players.get(client.sessionId);
    if (!player || !player.isAlive) return;

    player.isAlive = false;
    player.roundPoints -= 3;
    player.score -= 3;
    this.updateAliveCount();
    this.checkLastSurvivor();
  }

  private handleUpdateConfig(
    client: Client,
    data: { category?: string; totalRounds?: number; roundDurationSecs?: number }
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

  private handleKickPlayer(client: Client, targetPlayerId: string) {
    const player = this.state.players.get(client.sessionId);
    if (!player || !player.isHost) {
      this.sendError(client, "NOT_HOST", "เฉพาะเจ้าของห้องเท่านั้น");
      return;
    }

    if (this.state.phase !== "LOBBY") {
      this.sendError(client, "INVALID_PHASE", "ไม่สามารถเตะผู้เล่นได้ในขณะนี้");
      return;
    }

    if (targetPlayerId === client.sessionId) {
      this.sendError(client, "SELF_KICK", "ไม่สามารถเตะตัวเองได้");
      return;
    }

    const target = this.state.players.get(targetPlayerId);
    if (!target) return;

    // Notify kicked player
    const targetClient = this.clients.find((c) => c.sessionId === targetPlayerId);
    if (targetClient) {
      targetClient.send("KICKED", { message: "คุณถูกเตะออกจากห้อง" });
      targetClient.leave();
    }

    this.state.players.delete(targetPlayerId);
    this.state.playerCount = this.state.players.size;
  }

  // ─── GAME FLOW ──────────────────────────────────────────────

  private startCountdown() {
    this.state.currentRound++;
    this.state.phase = "COUNTDOWN";
    this.state.countdownTimer = COUNTDOWN_SECS;

    // Reset player state for new round
    this.state.players.forEach((p) => {
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
        // Absent votes default to "not_yet"
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
    this.state.players.forEach((p) => {
      if (p.isAlive && p.isConnected) {
        p.roundPoints += 5;
        p.score += 5;
      }
    });

    this.broadcast("ROUND_END", { reason });

    // Check if any alive players exist for guess phase
    const alivePlayers = this.getAlivePlayers();
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
    const yesCount = accusation.yesCount;
    const noCount = accusation.noCount;

    // Absent votes count as "not_yet"
    const totalEligible = accusation.totalVoters;
    const absentVotes = totalEligible - (yesCount + noCount);
    const effectiveNoCount = noCount + absentVotes;

    // Majority = strictly more than 50% of eligible voters
    const guilty = yesCount > effectiveNoCount;

    const accuser = this.state.players.get(accusation.accuserId);
    const target = this.state.players.get(accusation.targetId);

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
      // False accusation
      if (accuser) {
        accuser.roundPoints -= 1;
        accuser.score -= 1;
      }
    }

    // Broadcast vote result
    this.broadcast("VOTE_RESULT", {
      guilty,
      yesCount,
      noCount: effectiveNoCount,
      targetId: accusation.targetId,
      accuserId: accusation.accuserId,
    });

    // Clear accusation and votes
    this.state.currentAccusation = null;
    this.state.players.forEach((p) => {
      p.vote = "";
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

        // Auto-advance to game over if all rounds done
        if (this.state.currentRound >= this.state.config.totalRounds) {
          // Host can still choose to end or continue
          // Don't auto-advance; let host decide
        }
      }
    }, 5000);
  }

  // ─── HELPERS ────────────────────────────────────────────────

  private assignWords() {
    const connectedPlayers = this.getConnectedPlayers();
    const words = pickUniqueWords(
      this.state.config.category,
      connectedPlayers.length,
      this.usedWordsPerGame
    );

    this.roundWords.clear();
    connectedPlayers.forEach((player, index) => {
      const word = words[index];
      this.roundWords.set(player.id, word);
      this.usedWordsPerGame.add(word);
    });
  }

  private revealAllWords() {
    this.state.players.forEach((player) => {
      const word = this.roundWords.get(player.id);
      if (word) {
        player.assignedWord = word;
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

  private checkLastSurvivor() {
    if (this.state.phase !== "PLAYING" && this.state.phase !== "VOTING") return;

    const alivePlayers = this.getAlivePlayers();
    if (alivePlayers.length <= 1) {
      // If we're in voting, resolve it first conceptually, but end round
      if (this.state.phase === "VOTING") {
        this.state.currentAccusation = null;
        this.state.players.forEach((p) => {
          p.vote = "";
        });
      }
      this.state.phase = "PLAYING"; // Briefly set to playing so endRound works
      this.endRound("last_survivor");
    }
  }

  private getAlivePlayers(): Player[] {
    const alive: Player[] = [];
    this.state.players.forEach((p) => {
      if (p.isAlive && p.isConnected) alive.push(p);
    });
    return alive;
  }

  private getConnectedPlayers(): Player[] {
    const connected: Player[] = [];
    this.state.players.forEach((p) => {
      if (p.isConnected) connected.push(p);
    });
    return connected;
  }

  private allDisconnected(): boolean {
    let allDisc = true;
    this.state.players.forEach((p) => {
      if (p.isConnected) allDisc = false;
    });
    return allDisc;
  }

  private transferHost() {
    let newHost: Player | null = null;
    this.state.players.forEach((p) => {
      if (p.isConnected && !newHost) {
        newHost = p;
      }
    });
    if (newHost) {
      (newHost as Player).isHost = true;
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

  private sendError(client: Client, code: string, message: string) {
    client.send("ERROR", { code, message });
  }

  private stopTick() {
    if (this.tickInterval) {
      this.tickInterval.clear();
      this.tickInterval = null;
    }
  }

  private resetInactivityTimer() {
    if (this.inactivityTimeout) {
      this.inactivityTimeout.clear();
    }
    this.inactivityTimeout = this.clock.setTimeout(() => {
      this.broadcast("ROOM_EXPIRED", {
        message: "ห้องหมดเวลาเนื่องจากไม่มีกิจกรรม",
      });
      this.disconnect();
    }, INACTIVITY_TIMEOUT_MS);
  }

  onDispose() {
    this.stopTick();
    if (this.inactivityTimeout) {
      this.inactivityTimeout.clear();
    }
    if (this.state.roomCode) {
      activeRoomCodes.delete(this.state.roomCode);
    }
    this.roundWords.clear();
  }
}
