import { Client, Delayed } from "colyseus";
import {
  DrawGuessState,
  DrawGuessPlayer,
  DrawGuessPhase,
  DRAW_GUESS_CONFIG,
  SCORING,
  DRAWABLE_CATEGORIES,
  type StrokeData,
} from "../schemas/DrawGuessState";
import { BaseRoom, type GameRoomConfig } from "./BaseRoom";
import { BasePlayer } from "../schemas/BaseState";
import { checkGuess, type GuessStrictness } from "../utils/thaiNormalize";
import { loadWordPack, getAvailableCategories } from "../utils/wordPicker";

/**
 * DrawGuessRoom -- วาดทาย (Draw & Guess) game room.
 *
 * One player draws, others guess. Points for speed of correct guess.
 * Canvas-based drawing with real-time stroke broadcast.
 *
 * Extends BaseRoom for shared lobby, player management, host, kick, reconnection.
 *
 * Phase machine:
 *   LOBBY -> COUNTDOWN -> DRAWING -> ROUND_END -> (next drawer | SCOREBOARD -> DRAWING | GAME_OVER)
 *
 * Security constraints from Loki review:
 * - H2: Word stored in private variable, NEVER in synced state
 * - H1: Force snapshot on reconnect (stale-on-join)
 * - M1: Snapshot size cap (50KB)
 * - M2: Stroke rate limiting (30msg/s)
 *
 * Spec: PLATFORM_SPEC_v2.md sections DG-001 through DG-006.
 */
export class DrawGuessRoom extends BaseRoom<DrawGuessState> {
  // ─── Timers ────────────────────────────────────────────────────
  private countdownTimer: Delayed | null = null;
  private drawTimer: Delayed | null = null;
  private drawInterval: Delayed | null = null;
  private roundEndTimer: Delayed | null = null;
  private scoreboardTimer: Delayed | null = null;
  private snapshotInterval: Delayed | null = null;
  private hintTimer: Delayed | null = null;

  // ─── Server-side secrets (NEVER synced -- Loki H2) ────────────
  /** The current word being drawn. NEVER in synced state. */
  private currentWord: string = "";

  // ─── Drawer Rotation ──────────────────────────────────────────
  /** Drawing order (session IDs). Fixed at game start. */
  private drawerOrder: string[] = [];
  private currentDrawerIndex: number = 0;

  // ─── Word Pool ────────────────────────────────────────────────
  /** Drawable word pool (built at game start from wordpacks). */
  private wordPool: string[] = [];
  /** Words already used this game (DG-006.3: no duplicates). */
  private usedWords: Set<string> = new Set();

  // ─── Stroke Tracking ─────────────────────────────────────────
  /** Current turn's strokes (server-side buffer for snapshot). */
  private currentStrokes: StrokeData[] = [];
  /** Stroke count this turn (for DG-005.5 cap). */
  private strokeCount: number = 0;
  /** Rate limiter: last stroke message timestamps (ring buffer). */
  private strokeTimestamps: number[] = [];

  // ─── Guess Tracking ───────────────────────────────────────────
  /** Order of correct guesses this turn (for scoring). */
  private correctGuessOrder: string[] = [];

  // ─── BaseRoom abstract implementations ─────────────────────────

  protected createState(): DrawGuessState {
    return new DrawGuessState();
  }

  protected createPlayer(): DrawGuessPlayer {
    return new DrawGuessPlayer();
  }

  protected getGameConfig(): GameRoomConfig {
    return {
      minPlayers: DRAW_GUESS_CONFIG.MIN_PLAYERS,
      maxPlayers: DRAW_GUESS_CONFIG.MAX_PLAYERS,
    };
  }

  protected onGameStart(_client: Client): void {
    const state = this.state;

    // Reset all game state
    this.resetGameState();

    // Apply configuration from host (via START_GAME options or defaults)
    // Configuration is set via CONFIG message before START_GAME
    // Clamp to valid ranges
    state.totalRounds = Math.max(
      DRAW_GUESS_CONFIG.MIN_ROUNDS,
      Math.min(DRAW_GUESS_CONFIG.MAX_ROUNDS, state.totalRounds),
    );
    state.drawTimeSecs = Math.max(
      DRAW_GUESS_CONFIG.MIN_DRAW_TIME_SECS,
      Math.min(DRAW_GUESS_CONFIG.MAX_DRAW_TIME_SECS, state.drawTimeSecs),
    );

    // Build word pool from drawable categories
    this.buildWordPool();

    // Set drawer rotation order (all connected players)
    this.setupDrawerOrder();

    // Start the game
    state.currentRound = 1;
    state.currentTurn = 0;
    state.turnsPerRound = this.drawerOrder.length;

    // Start first turn with countdown
    this.startNextTurn();
  }

  // ─── BaseRoom optional hooks ───────────────────────────────────

  protected registerMessageHandlers(): void {
    // Game config (host sets before START_GAME)
    this.onMessage("CONFIG", (client, data: { rounds?: number; drawTime?: number; guessStrictness?: string }) =>
      this.handleConfig(client, data),
    );

    // Stroke messages from drawer
    this.onMessage("STROKE", (client, data: StrokeData) =>
      this.handleStroke(client, data),
    );
    this.onMessage("CLEAR_CANVAS", (client) =>
      this.handleClearCanvas(client),
    );
    this.onMessage("UNDO_STROKE", (client) =>
      this.handleUndoStroke(client),
    );

    // Guess from guessers
    this.onMessage("GUESS", (client, data: { text: string }) =>
      this.handleGuess(client, data.text),
    );
  }

  protected onPlayerReconnected(client: Client, _player: BasePlayer): void {
    const player = _player as DrawGuessPlayer;
    const state = this.state;

    if (state.phase === "LOBBY" || state.phase === "GAME_OVER") return;

    // Send phase context
    client.send("PHASE_CONTEXT", {
      phase: state.phase,
      currentRound: state.currentRound,
      currentTurn: state.currentTurn,
      currentDrawerId: state.currentDrawerId,
      currentDrawerNickname: state.currentDrawerNickname,
      timer: state.timer,
      hasGuessedCorrectly: player.hasGuessedCorrectly,
    });

    // If DRAWING phase: send stroke snapshot for late joiner (Loki H1)
    if (state.phase === "DRAWING") {
      // Force a fresh snapshot capture (Loki H1: close stale-on-join gap)
      this.captureSnapshot();

      // Send the snapshot
      client.send("STROKE_SNAPSHOT", { strokes: state.strokeSnapshot });

      // If this player is the drawer, send the word
      if (player.id === state.currentDrawerId) {
        client.send("DRAW_WORD", { word: this.currentWord });
      }

      // Send hint status
      if (state.hintRevealed) {
        client.send("WORD_HINT", {
          wordLength: state.wordLength,
          firstChar: state.wordHint,
        });
      }
    }
  }

  protected onPlayerDisconnectedDuringGame(_player: BasePlayer): void {
    const player = _player as DrawGuessPlayer;
    const state = this.state;

    // If the drawer disconnects during DRAWING: end the turn immediately (Loki M3)
    if (state.phase === "DRAWING" && player.id === state.currentDrawerId) {
      this.endTurn(true); // forceEnd = true (drawer disconnected)
    }
  }

  protected onGameDispose(): void {
    this.clearAllTimers();
    this.currentWord = "";
    this.drawerOrder = [];
    this.wordPool = [];
    this.usedWords.clear();
    this.currentStrokes = [];
    this.correctGuessOrder = [];
    this.strokeTimestamps = [];
  }

  // ─── CONFIGURATION ───────────────────────────────────────────

  private handleConfig(client: Client, data: { rounds?: number; drawTime?: number; guessStrictness?: string }): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || !player.isHost) {
      this.sendError(client, "NOT_HOST", "เฉพาะเจ้าของห้องที่ตั้งค่าได้");
      return;
    }

    if (this.state.phase !== "LOBBY" && this.state.phase !== "GAME_OVER") {
      this.sendError(client, "INVALID_PHASE", "ตั้งค่าได้เฉพาะในล็อบบี้");
      return;
    }

    if (data.rounds !== undefined) {
      this.state.totalRounds = Math.max(
        DRAW_GUESS_CONFIG.MIN_ROUNDS,
        Math.min(DRAW_GUESS_CONFIG.MAX_ROUNDS, Math.floor(data.rounds)),
      );
    }
    if (data.drawTime !== undefined) {
      this.state.drawTimeSecs = Math.max(
        DRAW_GUESS_CONFIG.MIN_DRAW_TIME_SECS,
        Math.min(DRAW_GUESS_CONFIG.MAX_DRAW_TIME_SECS, Math.floor(data.drawTime)),
      );
    }
    if (data.guessStrictness !== undefined) {
      const v = data.guessStrictness;
      if (v === "strict" || v === "normal" || v === "lenient") {
        this.state.guessStrictness = v;
      }
    }

    this.broadcast("CONFIG_UPDATED", {
      rounds: this.state.totalRounds,
      drawTime: this.state.drawTimeSecs,
      guessStrictness: this.state.guessStrictness,
    });
  }

  // ─── WORD POOL ────────────────────────────────────────────────

  /**
   * Build the drawable word pool from wordpacks.
   * Uses easy + medium tiers from drawable categories (DG-006.1).
   */
  private buildWordPool(): void {
    this.wordPool = [];
    const available = getAvailableCategories();

    for (const cat of DRAWABLE_CATEGORIES) {
      if (!available.includes(cat)) continue;
      try {
        const pack = loadWordPack(cat);
        if (pack.tiers) {
          if (pack.tiers.easy) this.wordPool.push(...pack.tiers.easy);
          if (pack.tiers.medium) this.wordPool.push(...pack.tiers.medium);
        } else {
          // Fallback: use all words
          this.wordPool.push(...pack.words);
        }
      } catch {
        // Skip unavailable packs
      }
    }

    // Shuffle the pool
    this.shuffleArray(this.wordPool);
  }

  /**
   * Pick a word from the pool that hasn't been used this game (DG-006.3).
   */
  private pickWord(): string {
    // Find first unused word
    for (let i = 0; i < this.wordPool.length; i++) {
      if (!this.usedWords.has(this.wordPool[i])) {
        const word = this.wordPool[i];
        this.usedWords.add(word);
        return word;
      }
    }

    // Fallback: if all words used (extremely unlikely with 900+ pool),
    // reset used words and pick from beginning
    this.usedWords.clear();
    if (this.wordPool.length > 0) {
      const word = this.wordPool[0];
      this.usedWords.add(word);
      return word;
    }

    // Ultra-fallback: should never happen
    return "แมว"; // cat
  }

  // ─── DRAWER ROTATION ─────────────────────────────────────────

  private setupDrawerOrder(): void {
    const connected = this.getConnectedPlayers();
    this.drawerOrder = connected.map((p) => p.id);
    this.shuffleArray(this.drawerOrder);
    this.currentDrawerIndex = 0;
  }

  /**
   * Get the next drawer. Skips disconnected players.
   * Returns null if no connected player is available.
   */
  private getNextDrawer(): string | null {
    const maxAttempts = this.drawerOrder.length;
    for (let i = 0; i < maxAttempts; i++) {
      const candidateId = this.drawerOrder[this.currentDrawerIndex % this.drawerOrder.length];
      const player = this.state.players.get(candidateId);
      if (player && player.isConnected) {
        return candidateId;
      }
      this.currentDrawerIndex++;
    }
    return null;
  }

  // ─── TURN / ROUND LIFECYCLE ───────────────────────────────────

  /**
   * Start the next turn. If all players have drawn this round, advance to next round.
   */
  private startNextTurn(): void {
    const state = this.state;

    state.currentTurn++;

    // Check if round is complete (all players have drawn)
    if (state.currentTurn > state.turnsPerRound) {
      // Check if game is complete
      if (state.currentRound >= state.totalRounds) {
        this.showScoreboard(true); // final scoreboard -> GAME_OVER
        return;
      }

      // Show scoreboard between rounds
      this.showScoreboard(false); // intermediate -> next round
      return;
    }

    // Find next drawer
    const drawerId = this.getNextDrawer();
    if (!drawerId) {
      // No connected players -- end game
      this.endGame();
      return;
    }

    state.currentDrawerId = drawerId;
    const drawer = state.players.get(drawerId);
    state.currentDrawerNickname = drawer?.nickname || "";

    this.currentDrawerIndex++;

    // Start countdown
    this.startCountdown();
  }

  /**
   * 3-second countdown before drawing starts.
   */
  private startCountdown(): void {
    const state = this.state;
    state.phase = "COUNTDOWN";
    state.timer = DRAW_GUESS_CONFIG.COUNTDOWN_SECS;

    // Pick word for this turn
    this.currentWord = this.pickWord();

    // Reset turn state
    this.currentStrokes = [];
    this.strokeCount = 0;
    this.strokeTimestamps = [];
    this.correctGuessOrder = [];
    state.correctGuessCount = 0;
    state.strokeSnapshot = "[]";
    state.wordLength = this.currentWord.length;
    state.wordHint = "";
    state.hintRevealed = false;
    state.revealedWord = "";

    // Reset player turn state
    state.players.forEach((p) => {
      const dgp = p as DrawGuessPlayer;
      dgp.hasGuessedCorrectly = false;
      dgp.roundPoints = 0;
    });

    // Send word to drawer ONLY (Loki H2: private message)
    const drawerClient = this.clients.find((c) => c.sessionId === state.currentDrawerId);
    if (drawerClient) {
      drawerClient.send("DRAW_WORD", { word: this.currentWord });
    }

    this.broadcast("PHASE_CHANGE", {
      phase: "COUNTDOWN",
      currentRound: state.currentRound,
      currentTurn: state.currentTurn,
      turnsPerRound: state.turnsPerRound,
      drawerId: state.currentDrawerId,
      drawerNickname: state.currentDrawerNickname,
      timer: state.timer,
      wordLength: state.wordLength,
    });

    this.countdownTimer = this.clock.setTimeout(() => {
      if (state.phase === "COUNTDOWN") {
        this.startDrawing();
      }
    }, DRAW_GUESS_CONFIG.COUNTDOWN_SECS * 1000);
  }

  /**
   * Start the DRAWING phase. Timer counts down. Drawer draws, guessers guess.
   */
  private startDrawing(): void {
    const state = this.state;
    state.phase = "DRAWING";
    state.timer = state.drawTimeSecs;

    this.broadcast("PHASE_CHANGE", {
      phase: "DRAWING",
      timer: state.drawTimeSecs,
      drawerId: state.currentDrawerId,
      wordLength: state.wordLength,
    });

    // Drawing timer (1s ticks)
    this.drawInterval = this.clock.setInterval(() => {
      state.timer--;

      // Check hint threshold (DG-002.6)
      if (!state.hintRevealed) {
        const elapsed = state.drawTimeSecs - state.timer;
        const threshold = Math.floor(state.drawTimeSecs * DRAW_GUESS_CONFIG.HINT_THRESHOLD_PERCENT / 100);
        if (elapsed >= threshold) {
          this.revealHint();
        }
      }

      if (state.timer <= 0) {
        this.endTurn(false);
      }
    }, 1000);

    // Periodic snapshot interval (every 5 seconds, Loki D-098)
    this.snapshotInterval = this.clock.setInterval(() => {
      this.captureSnapshot();
    }, 5000);
  }

  /**
   * Reveal the word hint: character count + first character (DG-002.6).
   */
  private revealHint(): void {
    const state = this.state;
    if (!this.currentWord || state.hintRevealed) return;

    state.hintRevealed = true;
    state.wordHint = this.currentWord.charAt(0);

    this.broadcast("WORD_HINT", {
      wordLength: state.wordLength,
      firstChar: state.wordHint,
    });
  }

  /**
   * End the current turn.
   * @param drawerDisconnected - True if ended due to drawer disconnect (Loki M3)
   */
  private endTurn(drawerDisconnected: boolean): void {
    this.stopDrawingTimers();

    const state = this.state;

    // Award drawer points (DG-003: +1 per correct guesser)
    if (!drawerDisconnected && this.correctGuessOrder.length > 0) {
      const drawer = state.players.get(state.currentDrawerId) as DrawGuessPlayer | undefined;
      if (drawer) {
        const drawerPoints = this.correctGuessOrder.length * SCORING.DRAWER_PER_CORRECT_GUESS;
        drawer.score += drawerPoints;
        drawer.roundPoints += drawerPoints;
      }
    }

    // Transition to ROUND_END
    state.phase = "ROUND_END";
    state.revealedWord = this.currentWord;

    // Build round results
    const roundResults: Array<{
      playerId: string;
      nickname: string;
      roundPoints: number;
      totalScore: number;
      guessOrder: number; // 0 = didn't guess, 1 = first, etc.
      isDrawer: boolean;
    }> = [];

    state.players.forEach((p) => {
      const dgp = p as DrawGuessPlayer;
      const guessOrder = this.correctGuessOrder.indexOf(p.id) + 1; // 1-based, 0 = didn't guess
      roundResults.push({
        playerId: p.id,
        nickname: p.nickname,
        roundPoints: dgp.roundPoints,
        totalScore: dgp.score,
        guessOrder,
        isDrawer: p.id === state.currentDrawerId,
      });
    });

    this.broadcast("TURN_END", {
      word: this.currentWord,
      drawerDisconnected,
      results: roundResults,
    });

    // Clear the word
    this.currentWord = "";
    this.currentStrokes = [];

    // After pause, start next turn
    this.roundEndTimer = this.clock.setTimeout(() => {
      if (state.phase === "ROUND_END") {
        this.startNextTurn();
      }
    }, DRAW_GUESS_CONFIG.ROUND_END_SECS * 1000);
  }

  /**
   * Show the scoreboard between rounds or at game end.
   */
  private showScoreboard(isFinal: boolean): void {
    const state = this.state;
    state.phase = "SCOREBOARD";

    const scores: Array<{
      playerId: string;
      nickname: string;
      score: number;
      rank: number;
    }> = [];

    state.players.forEach((p) => {
      scores.push({
        playerId: p.id,
        nickname: p.nickname,
        score: p.score,
        rank: 0,
      });
    });

    // Sort by score descending, assign ranks
    scores.sort((a, b) => b.score - a.score);
    scores.forEach((s, i) => { s.rank = i + 1; });

    this.broadcast("SCOREBOARD", {
      scores,
      currentRound: state.currentRound,
      totalRounds: state.totalRounds,
      isFinal,
    });

    if (isFinal) {
      // After showing scoreboard briefly, transition to GAME_OVER
      this.scoreboardTimer = this.clock.setTimeout(() => {
        this.endGame();
      }, DRAW_GUESS_CONFIG.SCOREBOARD_SECS * 1000);
    } else {
      // After showing scoreboard, start next round
      this.scoreboardTimer = this.clock.setTimeout(() => {
        if (state.phase === "SCOREBOARD") {
          state.currentRound++;
          state.currentTurn = 0;
          this.currentDrawerIndex = 0;
          this.shuffleArray(this.drawerOrder);
          state.turnsPerRound = this.getConnectedPlayers().length;
          this.startNextTurn();
        }
      }, DRAW_GUESS_CONFIG.SCOREBOARD_SECS * 1000);
    }
  }

  /**
   * End the game. Determine winner by highest score.
   */
  private endGame(): void {
    this.clearAllTimers();

    const state = this.state;
    state.phase = "GAME_OVER";

    // Determine winner
    let highestScore = -1;
    let winnerId = "";
    let winnerNickname = "";

    state.players.forEach((p) => {
      if (p.score > highestScore) {
        highestScore = p.score;
        winnerId = p.id;
        winnerNickname = p.nickname;
      }
    });

    state.winnerId = winnerId;
    state.winnerNickname = winnerNickname;

    const finalScores: Array<{
      playerId: string;
      nickname: string;
      score: number;
      rank: number;
    }> = [];

    state.players.forEach((p) => {
      finalScores.push({
        playerId: p.id,
        nickname: p.nickname,
        score: p.score,
        rank: 0,
      });
    });

    finalScores.sort((a, b) => b.score - a.score);
    finalScores.forEach((s, i) => { s.rank = i + 1; });

    this.broadcast("GAME_OVER", {
      winnerId,
      winnerNickname,
      scores: finalScores,
    });
  }

  // ─── STROKE HANDLING ─────────────────────────────────────────

  /**
   * Handle stroke data from the drawer.
   * Validates sender is the current drawer, rate-limits, and broadcasts.
   */
  private handleStroke(client: Client, data: StrokeData): void {
    const state = this.state;

    if (state.phase !== "DRAWING") return;

    // Only the drawer can send strokes
    if (client.sessionId !== state.currentDrawerId) {
      return; // silently ignore (don't reveal who the drawer is by error)
    }

    // DG-005.5: Max strokes per turn
    if (this.strokeCount >= DRAW_GUESS_CONFIG.MAX_STROKES_PER_TURN) {
      client.send("ERROR", {
        code: "STROKE_LIMIT",
        message: "ถึงจำนวนเส้นสูงสุดแล้ว", // Max stroke limit reached
      });
      return;
    }

    // Rate limiting (Loki M2): max 30 stroke messages per second
    const now = Date.now();
    // Remove timestamps older than 1 second
    this.strokeTimestamps = this.strokeTimestamps.filter((t) => now - t < 1000);
    if (this.strokeTimestamps.length >= DRAW_GUESS_CONFIG.STROKE_RATE_LIMIT_PER_SEC) {
      return; // silently drop
    }
    this.strokeTimestamps.push(now);

    // Validate stroke data
    if (!data || !data.points || !Array.isArray(data.points) || data.points.length === 0) {
      return;
    }

    // Store stroke for snapshot
    this.currentStrokes.push(data);
    this.strokeCount++;

    // Broadcast to all EXCEPT the drawer (drawer already has it locally)
    this.broadcast("STROKE", data, { except: client });
  }

  /**
   * Handle clear canvas from the drawer.
   */
  private handleClearCanvas(client: Client): void {
    if (this.state.phase !== "DRAWING") return;
    if (client.sessionId !== this.state.currentDrawerId) return;

    this.currentStrokes = [];
    this.strokeCount = 0;

    // Update snapshot immediately on clear
    this.captureSnapshot();

    this.broadcast("CLEAR_CANVAS", {}, { except: client });
  }

  /**
   * Handle undo last stroke from the drawer (DG-005.4).
   */
  private handleUndoStroke(client: Client): void {
    if (this.state.phase !== "DRAWING") return;
    if (client.sessionId !== this.state.currentDrawerId) return;

    if (this.currentStrokes.length > 0) {
      this.currentStrokes.pop();
      this.strokeCount = Math.max(0, this.strokeCount - 1);

      // Update snapshot immediately on undo
      this.captureSnapshot();

      this.broadcast("UNDO_STROKE", {}, { except: client });
    }
  }

  // ─── SNAPSHOT ─────────────────────────────────────────────────

  /**
   * Capture the current stroke buffer as a snapshot in synced state.
   * Enforces size cap (Loki M1: 50KB max).
   */
  private captureSnapshot(): void {
    let snapshot = JSON.stringify(this.currentStrokes);

    // Loki M1: Truncate if over size cap
    if (snapshot.length > DRAW_GUESS_CONFIG.SNAPSHOT_MAX_BYTES) {
      // Remove oldest strokes until under cap
      const trimmed = [...this.currentStrokes];
      while (
        trimmed.length > 1 &&
        JSON.stringify(trimmed).length > DRAW_GUESS_CONFIG.SNAPSHOT_MAX_BYTES
      ) {
        trimmed.shift();
      }
      snapshot = JSON.stringify(trimmed);
    }

    this.state.strokeSnapshot = snapshot;
  }

  // ─── GUESS HANDLING ───────────────────────────────────────────

  /**
   * Handle a guess from a guesser.
   */
  private handleGuess(client: Client, text: string): void {
    const state = this.state;

    if (state.phase !== "DRAWING") {
      return; // silently ignore out-of-phase guesses
    }

    // Drawer cannot guess
    if (client.sessionId === state.currentDrawerId) {
      return;
    }

    const player = state.players.get(client.sessionId) as DrawGuessPlayer | undefined;
    if (!player || !player.isConnected) return;

    // DG-003.6: Already guessed correctly -- cannot guess again
    if (player.hasGuessedCorrectly) {
      return;
    }

    // Validate guess text
    if (!text || text.trim().length === 0) return;
    const trimmedGuess = text.trim().slice(0, 50); // Cap length

    // Check guess with fuzzy matching (Sprint 11 — KTH-T-072)
    const strictness = (state.guessStrictness as GuessStrictness) || "normal";
    const result = checkGuess(trimmedGuess, this.currentWord, strictness);

    if (result.kind === "exact" || result.kind === "near") {
      // CORRECT or NEAR-MISS counts as correct (the point of the feature)
      player.hasGuessedCorrectly = true;
      this.correctGuessOrder.push(client.sessionId);
      state.correctGuessCount++;

      // Award points based on guess order (DG-003)
      const order = this.correctGuessOrder.length;
      let points: number;
      if (order === 1) {
        points = SCORING.FIRST_GUESSER;
      } else if (order === 2) {
        points = SCORING.SECOND_GUESSER;
      } else {
        points = SCORING.THIRD_PLUS_GUESSER;
      }

      player.score += points;
      player.roundPoints += points;

      // DG-003.5: Announce correct guess (but don't reveal the word).
      // Distinguish exact vs near so clients can show "ใกล้เคียง!" feedback (Sprint 11).
      this.broadcast("CORRECT_GUESS", {
        playerId: client.sessionId,
        nickname: player.nickname,
        guessOrder: order,
        points,
        matchKind: result.kind, // "exact" | "near"
      });

      // Check if ALL guessers have guessed correctly
      const guessers = this.getConnectedPlayers().filter(
        (p) => p.id !== state.currentDrawerId,
      );
      const allCorrect = guessers.every(
        (p) => (p as DrawGuessPlayer).hasGuessedCorrectly,
      );

      if (allCorrect) {
        // Everyone guessed -- end turn early
        this.endTurn(false);
      }
    } else {
      // WRONG GUESS -- broadcast to all (so others can see guesses)
      this.broadcast("GUESS", {
        playerId: client.sessionId,
        nickname: player.nickname,
        text: trimmedGuess,
      });
    }
  }

  // ─── STATE MANAGEMENT ─────────────────────────────────────────

  private resetGameState(): void {
    this.clearAllTimers();

    const state = this.state;
    state.currentRound = 0;
    state.currentTurn = 0;
    state.turnsPerRound = 0;
    state.currentDrawerId = "";
    state.currentDrawerNickname = "";
    state.timer = 0;
    state.wordLength = 0;
    state.wordHint = "";
    state.hintRevealed = false;
    state.correctGuessCount = 0;
    state.strokeSnapshot = "[]";
    state.winnerId = "";
    state.winnerNickname = "";
    state.revealedWord = "";

    // Reset player scores
    state.players.forEach((p) => {
      const dgp = p as DrawGuessPlayer;
      dgp.score = 0;
      dgp.hasGuessedCorrectly = false;
      dgp.roundPoints = 0;
    });

    this.currentWord = "";
    this.drawerOrder = [];
    this.currentDrawerIndex = 0;
    this.usedWords.clear();
    this.currentStrokes = [];
    this.strokeCount = 0;
    this.strokeTimestamps = [];
    this.correctGuessOrder = [];
  }

  // ─── TIMER MANAGEMENT ─────────────────────────────────────────

  private stopDrawingTimers(): void {
    if (this.drawInterval) {
      this.drawInterval.clear();
      this.drawInterval = null;
    }
    if (this.drawTimer) {
      this.drawTimer.clear();
      this.drawTimer = null;
    }
    if (this.snapshotInterval) {
      this.snapshotInterval.clear();
      this.snapshotInterval = null;
    }
    if (this.hintTimer) {
      this.hintTimer.clear();
      this.hintTimer = null;
    }
  }

  private clearAllTimers(): void {
    this.stopDrawingTimers();
    if (this.countdownTimer) {
      this.countdownTimer.clear();
      this.countdownTimer = null;
    }
    if (this.roundEndTimer) {
      this.roundEndTimer.clear();
      this.roundEndTimer = null;
    }
    if (this.scoreboardTimer) {
      this.scoreboardTimer.clear();
      this.scoreboardTimer = null;
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
