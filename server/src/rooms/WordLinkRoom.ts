import { Client, Delayed } from "colyseus";
import {
  WordLinkState,
  WordLinkPlayer,
  WordCard,
  ClueInfo,
} from "../schemas/WordLinkState";
import { pickUniqueWords } from "../utils/wordPicker";
import { BaseRoom, type GameRoomConfig } from "./BaseRoom";
import { BasePlayer } from "../schemas/BaseState";

const MIN_PLAYERS = 4;
const MAX_PLAYERS = 10;
const TEAM_REVEAL_SECS = 5;

/**
 * Color distribution for the 5x5 grid.
 * Red team starts with 9 words (goes first), blue has 8.
 * 7 neutral bystanders, 1 assassin.
 */
const COLOR_DISTRIBUTION: string[] = [
  ...Array(9).fill("red"),
  ...Array(8).fill("blue"),
  ...Array(7).fill("neutral"),
  "assassin",
];

/**
 * WordLinkRoom -- คำเชื่อม (Codenames-style) game room.
 *
 * Extends BaseRoom for shared lobby, player management, host, kick, reconnection.
 * Contains only game-specific logic: team assignment, grid generation, clue/guess flow,
 * win condition detection.
 *
 * Spec: PLATFORM_SPEC_v2.md sections WL-001 through WL-004.
 */
export class WordLinkRoom extends BaseRoom<WordLinkState> {
  private turnTimerInterval: Delayed | null = null;

  /**
   * Server-side only: the full color key (maps grid index -> color).
   * This is the source of truth. Only spymasters receive this data.
   * Guessers get colors only when cards are revealed.
   */
  private colorKey: Map<number, string> = new Map();

  // ─── BaseRoom abstract implementations ──────────────────────────

  protected createState(): WordLinkState {
    return new WordLinkState();
  }

  protected createPlayer(): WordLinkPlayer {
    return new WordLinkPlayer();
  }

  protected getGameConfig(): GameRoomConfig {
    return { minPlayers: MIN_PLAYERS, maxPlayers: MAX_PLAYERS };
  }

  protected onGameStart(_client: Client): void {
    // Assign teams
    this.assignTeams();

    // Generate grid
    this.generateGrid();

    // Show team assignments briefly
    this.state.phase = "TEAM_REVEAL";
    this.state.currentTeam = "red"; // Red always goes first (they have 9 words)

    // After reveal, start first clue phase
    this.clock.setTimeout(() => {
      if (this.state.phase === "TEAM_REVEAL") {
        this.startCluePhase();
      }
    }, TEAM_REVEAL_SECS * 1000);

    // Send color key to spymasters
    this.sendColorKeyToSpymasters();
  }

  // ─── BaseRoom optional hooks ────────────────────────────────────

  protected registerMessageHandlers(): void {
    this.onMessage("GIVE_CLUE", (client, data: { word: string; number: number }) =>
      this.handleGiveClue(client, data),
    );
    this.onMessage("GUESS_CARD", (client, data: { index: number }) =>
      this.handleGuessCard(client, data.index),
    );
    this.onMessage("END_TURN", (client) =>
      this.handleEndTurn(client),
    );
    this.onMessage("UPDATE_CONFIG", (client, data: { turnTimerSetting?: number }) =>
      this.handleUpdateConfig(client, data),
    );
  }

  protected onPlayerReconnected(client: Client, _player: BasePlayer): void {
    const player = _player as WordLinkPlayer;

    // Re-send color key if player is a spymaster
    if (player.role === "spymaster") {
      this.sendColorKeyToClient(client);
    }
  }

  protected onGameDispose(): void {
    this.stopTurnTimer();
    this.colorKey.clear();
  }

  // ─── GAME-SPECIFIC MESSAGE HANDLERS ─────────────────────────────

  private handleGiveClue(client: Client, data: { word: string; number: number }) {
    if (this.state.phase !== "CLUE_GIVING") {
      this.sendError(client, "INVALID_PHASE", "ยังไม่ถึงเวลาใบ้คำ");
      return;
    }

    const player = this.state.players.get(client.sessionId) as WordLinkPlayer | undefined;
    if (!player) return;

    // Only the active team's spymaster can give a clue
    if (player.role !== "spymaster" || player.team !== this.state.currentTeam) {
      this.sendError(client, "NOT_SPYMASTER", "เฉพาะหัวหน้าทีมที่กำลังเล่นเท่านั้น");
      return;
    }

    const clueWord = (data.word || "").trim();
    const clueNumber = Math.max(0, Math.min(25, Math.floor(data.number || 0)));

    // Validate clue
    if (!clueWord || clueWord.length === 0) {
      this.sendError(client, "INVALID_CLUE", "กรุณาใส่คำใบ้");
      return;
    }

    // Clue cannot be a word currently on the grid (unrevealed)
    const isGridWord = this.state.grid.some(
      (card) => !card.revealed && card.word === clueWord,
    );
    if (isGridWord) {
      this.sendError(client, "CLUE_IS_GRID_WORD", "คำใบ้ต้องไม่ใช่คำบนตาราง");
      return;
    }

    if (clueNumber < 0) {
      this.sendError(client, "INVALID_NUMBER", "จำนวนต้องมากกว่า 0");
      return;
    }

    // Set the clue
    const clue = new ClueInfo();
    clue.word = clueWord;
    clue.number = clueNumber;
    clue.guessesUsed = 0;
    // Allow number + 1 guesses (the +1 is for "catching up" on previous clues)
    // Special case: 0 means unlimited guesses (Codenames "zero clue")
    clue.maxGuesses = clueNumber === 0 ? 25 : clueNumber + 1;
    this.state.currentClue = clue;

    // Move to guessing phase
    this.state.phase = "GUESSING";

    // Start turn timer if configured
    this.startTurnTimer();

    this.broadcast("CLUE_GIVEN", {
      team: this.state.currentTeam,
      word: clueWord,
      number: clueNumber,
    });
  }

  private handleGuessCard(client: Client, cardIndex: number) {
    if (this.state.phase !== "GUESSING") {
      this.sendError(client, "INVALID_PHASE", "ยังไม่ถึงเวลาทาย");
      return;
    }

    const player = this.state.players.get(client.sessionId) as WordLinkPlayer | undefined;
    if (!player) return;

    // Only guessers on the active team can guess
    if (player.role !== "guesser" || player.team !== this.state.currentTeam) {
      this.sendError(client, "NOT_YOUR_TURN", "ยังไม่ถึงตาทีมคุณ");
      return;
    }

    // Validate card index
    if (cardIndex < 0 || cardIndex >= 25) {
      this.sendError(client, "INVALID_CARD", "การ์ดไม่ถูกต้อง");
      return;
    }

    const card = this.state.grid[cardIndex];
    if (!card || card.revealed) {
      this.sendError(client, "ALREADY_REVEALED", "การ์ดนี้ถูกเปิดแล้ว");
      return;
    }

    // Reveal the card
    const trueColor = this.colorKey.get(cardIndex) || "neutral";
    card.revealed = true;
    card.revealedColor = trueColor;

    // Update remaining counts
    if (trueColor === "red") {
      this.state.redRemaining--;
    } else if (trueColor === "blue") {
      this.state.blueRemaining--;
    }

    // Increment guesses used
    if (this.state.currentClue) {
      this.state.currentClue.guessesUsed++;
    }

    this.broadcast("CARD_REVEALED", {
      index: cardIndex,
      word: card.word,
      color: trueColor,
      guesser: player.nickname,
      team: this.state.currentTeam,
    });

    // Check win/loss conditions
    if (this.checkGameOver(trueColor)) {
      return; // Game ended
    }

    // Determine what happens next based on card color
    const activeTeam = this.state.currentTeam;

    if (trueColor === activeTeam) {
      // Correct guess -- team can continue
      // But check if they've used all their guesses
      if (
        this.state.currentClue &&
        this.state.currentClue.guessesUsed >= this.state.currentClue.maxGuesses
      ) {
        this.switchTurn();
      }
      // Otherwise, team keeps guessing (no action needed, stay in GUESSING)
    } else {
      // Wrong guess (neutral, opponent, or assassin handled above)
      // Assassin is handled in checkGameOver, so here it's neutral or opponent
      this.switchTurn();
    }
  }

  private handleEndTurn(client: Client) {
    if (this.state.phase !== "GUESSING") {
      this.sendError(client, "INVALID_PHASE", "ไม่สามารถจบตาได้ในขณะนี้");
      return;
    }

    const player = this.state.players.get(client.sessionId) as WordLinkPlayer | undefined;
    if (!player) return;

    // Only active team members can end turn
    if (player.team !== this.state.currentTeam) {
      this.sendError(client, "NOT_YOUR_TURN", "ยังไม่ถึงตาทีมคุณ");
      return;
    }

    this.broadcast("TURN_ENDED", {
      team: this.state.currentTeam,
      reason: "voluntary",
    });

    this.switchTurn();
  }

  private handleUpdateConfig(
    client: Client,
    data: { turnTimerSetting?: number },
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

    if (
      data.turnTimerSetting !== undefined &&
      [0, 60, 90, 120].includes(data.turnTimerSetting)
    ) {
      this.state.turnTimerSetting = data.turnTimerSetting;
    }
  }

  // ─── GAME FLOW ──────────────────────────────────────────────

  /**
   * Assign players to two teams and select spymasters.
   * Uses round-robin assignment for balance.
   */
  private assignTeams() {
    const connected = this.getConnectedPlayers() as WordLinkPlayer[];

    // Shuffle players for random team assignment
    const shuffled = [...connected];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Alternate assignment: red, blue, red, blue, ...
    shuffled.forEach((player, index) => {
      player.team = index % 2 === 0 ? "red" : "blue";
      player.role = "guesser"; // Default everyone to guesser
    });

    // First player on each team becomes spymaster
    const redPlayers = shuffled.filter((p) => p.team === "red");
    const bluePlayers = shuffled.filter((p) => p.team === "blue");

    if (redPlayers.length > 0) redPlayers[0].role = "spymaster";
    if (bluePlayers.length > 0) bluePlayers[0].role = "spymaster";
  }

  /**
   * Generate the 5x5 word grid.
   * Picks 25 unique words from wordpacks, assigns shuffled colors.
   */
  private generateGrid() {
    // Pick 25 words using existing wordpack infrastructure
    // Use "common" category as default -- it has the most general words
    const words = pickUniqueWords("common", 25);

    // Shuffle color distribution
    const colors = [...COLOR_DISTRIBUTION];
    for (let i = colors.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [colors[i], colors[j]] = [colors[j], colors[i]];
    }

    // Clear existing grid
    this.state.grid.clear();
    this.colorKey.clear();

    // Create cards
    for (let i = 0; i < 25; i++) {
      const card = new WordCard();
      card.index = i;
      card.word = words[i];
      card.color = ""; // Colors NOT synced to clients by default
      card.revealed = false;
      card.revealedColor = "";
      this.state.grid.push(card);

      // Store true color server-side
      this.colorKey.set(i, colors[i]);
    }

    // Reset remaining counts
    this.state.redRemaining = 9;
    this.state.blueRemaining = 8;
  }

  /**
   * Send the full color key to all spymasters.
   */
  private sendColorKeyToSpymasters() {
    this.clients.forEach((client) => {
      const player = this.state.players.get(client.sessionId) as WordLinkPlayer | undefined;
      if (player && player.role === "spymaster") {
        this.sendColorKeyToClient(client);
      }
    });
  }

  /**
   * Send the full color key to a specific client.
   */
  private sendColorKeyToClient(client: Client) {
    const colorKeyArray: Array<{ index: number; color: string }> = [];
    this.colorKey.forEach((color, index) => {
      colorKeyArray.push({ index, color });
    });
    client.send("COLOR_KEY", { cards: colorKeyArray });
  }

  /**
   * Start the clue-giving phase for the current team.
   */
  private startCluePhase() {
    this.state.phase = "CLUE_GIVING";
    this.state.currentClue = null;
    this.stopTurnTimer();

    this.broadcast("PHASE_CHANGE", {
      phase: "CLUE_GIVING",
      team: this.state.currentTeam,
    });
  }

  /**
   * Switch turn to the other team.
   */
  private switchTurn() {
    this.stopTurnTimer();
    this.state.currentTeam = this.state.currentTeam === "red" ? "blue" : "red";

    this.broadcast("TURN_SWITCH", {
      newTeam: this.state.currentTeam,
    });

    this.startCluePhase();
  }

  /**
   * Check if the game is over.
   * @returns true if game ended
   */
  private checkGameOver(lastRevealedColor: string): boolean {
    // Assassin card = instant loss for the guessing team
    if (lastRevealedColor === "assassin") {
      const losingTeam = this.state.currentTeam;
      const winningTeam = losingTeam === "red" ? "blue" : "red";
      this.endGame(winningTeam, "assassin");
      return true;
    }

    // All red words revealed = red wins
    if (this.state.redRemaining === 0) {
      this.endGame("red", "all_words");
      return true;
    }

    // All blue words revealed = blue wins
    if (this.state.blueRemaining === 0) {
      this.endGame("blue", "all_words");
      return true;
    }

    return false;
  }

  /**
   * End the game with a winner.
   */
  private endGame(winner: string, reason: string) {
    this.stopTurnTimer();
    this.state.phase = "GAME_OVER";
    this.state.winner = winner;
    this.state.winReason = reason;

    // Reveal all cards
    this.state.grid.forEach((card) => {
      if (!card.revealed) {
        card.revealed = true;
        card.revealedColor = this.colorKey.get(card.index) || "neutral";
      }
    });

    this.broadcast("GAME_OVER", {
      winner,
      reason,
      redRemaining: this.state.redRemaining,
      blueRemaining: this.state.blueRemaining,
    });
  }

  // ─── TIMER ──────────────────────────────────────────────────

  private startTurnTimer() {
    this.stopTurnTimer();

    if (this.state.turnTimerSetting <= 0) {
      this.state.turnTimer = 0;
      return; // No timer
    }

    this.state.turnTimer = this.state.turnTimerSetting;

    this.turnTimerInterval = this.clock.setInterval(() => {
      this.state.turnTimer--;
      if (this.state.turnTimer <= 0) {
        // Time's up -- auto end turn
        this.broadcast("TURN_ENDED", {
          team: this.state.currentTeam,
          reason: "timer",
        });
        this.switchTurn();
      }
    }, 1000);
  }

  private stopTurnTimer() {
    if (this.turnTimerInterval) {
      this.turnTimerInterval.clear();
      this.turnTimerInterval = null;
    }
    this.state.turnTimer = 0;
  }
}
