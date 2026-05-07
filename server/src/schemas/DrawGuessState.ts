import { type } from "@colyseus/schema";
import { BaseState, BasePlayer } from "./BaseState";

// ─── Draw & Guess Phases ───────────────────────────────────────

export type DrawGuessPhase =
  | "LOBBY"
  | "COUNTDOWN"
  | "DRAWING"
  | "ROUND_END"
  | "SCOREBOARD"
  | "GAME_OVER";

// ─── Drawable Word Categories ──────────────────────────────────

/**
 * Categories suitable for Draw & Guess (concrete nouns / drawable concepts).
 * Excludes: emotions, relationships, slang, trap-words, common, colors, family
 * (too abstract or linguistic for drawing).
 */
export const DRAWABLE_CATEGORIES = [
  "animals",
  "food",
  "sports",
  "body",
  "jobs",
  "places",
  "entertainment",
  "daily-life",
  "school",
  "shopping",
  "travel",
  "office",
] as const;

// ─── Configuration Defaults ────────────────────────────────────

export const DRAW_GUESS_CONFIG = {
  MIN_PLAYERS: 3,
  MAX_PLAYERS: 8,
  DEFAULT_ROUNDS: 2,
  MIN_ROUNDS: 1,
  MAX_ROUNDS: 5,
  DEFAULT_DRAW_TIME_SECS: 60,
  MIN_DRAW_TIME_SECS: 30,
  MAX_DRAW_TIME_SECS: 120,
  COUNTDOWN_SECS: 3,
  ROUND_END_SECS: 5,
  SCOREBOARD_SECS: 5,
  MAX_STROKES_PER_TURN: 500,
  STROKE_RATE_LIMIT_PER_SEC: 30,
  SNAPSHOT_MAX_BYTES: 50_000, // 50KB cap (Loki M1)
  /** Word hint: show first character + char count after this % of draw time */
  HINT_THRESHOLD_PERCENT: 50,
} as const;

// ─── Scoring Constants (DG-003) ────────────────────────────────

export const SCORING = {
  FIRST_GUESSER: 3,
  SECOND_GUESSER: 2,
  THIRD_PLUS_GUESSER: 1,
  DRAWER_PER_CORRECT_GUESS: 1,
} as const;

// ─── Canvas Tool Types ─────────────────────────────────────────

export type CanvasTool = "pen" | "eraser";

export const PEN_SIZES = [2, 5, 10] as const;

export const COLOR_PALETTE = [
  "#000000", // Black
  "#FF0000", // Red
  "#0000FF", // Blue
  "#00AA00", // Green
  "#FFD700", // Yellow
  "#FF8C00", // Orange
  "#800080", // Purple
  "#FFFFFF", // White
] as const;

// ─── Stroke Data Types (for broadcast) ─────────────────────────

export interface StrokePoint {
  x: number;
  y: number;
}

export interface StrokeData {
  tool: CanvasTool;
  color: string;
  size: number;
  points: StrokePoint[];
}

// ─── DrawGuessPlayer ───────────────────────────────────────────

/**
 * DrawGuessPlayer -- extends BasePlayer with draw-guess-specific fields.
 */
export class DrawGuessPlayer extends BasePlayer {
  /** Whether this player has guessed correctly this turn. */
  @type("boolean") hasGuessedCorrectly: boolean = false;

  /** Points earned in the current round. */
  @type("number") roundPoints: number = 0;
}

// ─── DrawGuessState ────────────────────────────────────────────

/**
 * DrawGuessState -- Colyseus synced state for Draw & Guess.
 *
 * Inherits from BaseState: roomCode, phase, gameType, playerCount, createdAt, players.
 *
 * SECURITY (Loki H2): The current drawing word is NEVER stored in synced state.
 * It is kept as a private variable in DrawGuessRoom and sent only to the drawer
 * via private message.
 */
export class DrawGuessState extends BaseState {
  // ─── Game Configuration ──────────────────────────────────────

  /** Number of full rounds (each player draws once per round). */
  @type("number") totalRounds: number = DRAW_GUESS_CONFIG.DEFAULT_ROUNDS;

  /** Drawing time in seconds per turn. */
  @type("number") drawTimeSecs: number = DRAW_GUESS_CONFIG.DEFAULT_DRAW_TIME_SECS;

  // ─── Round Tracking ──────────────────────────────────────────

  /** Current round number (1-based). */
  @type("number") currentRound: number = 0;

  /** Current turn within the round (1-based, 1 turn per player per round). */
  @type("number") currentTurn: number = 0;

  /** Total turns per round (= player count). */
  @type("number") turnsPerRound: number = 0;

  // ─── Drawer Info ─────────────────────────────────────────────

  /** Session ID of the current drawer. */
  @type("string") currentDrawerId: string = "";

  /** Nickname of the current drawer. */
  @type("string") currentDrawerNickname: string = "";

  // ─── Timer ───────────────────────────────────────────────────

  /** Countdown timer (seconds remaining). */
  @type("number") timer: number = 0;

  // ─── Word Hint (DG-002.6) ───────────────────────────────────

  /** Word character count (shown to guessers). */
  @type("number") wordLength: number = 0;

  /** First character hint (shown after 50% time). Empty until hint activates. */
  @type("string") wordHint: string = "";

  /** Whether the hint has been revealed. */
  @type("boolean") hintRevealed: boolean = false;

  // ─── Guessing Progress ───────────────────────────────────────

  /** Number of correct guesses this turn. */
  @type("number") correctGuessCount: number = 0;

  // ─── Stroke Snapshot (for late joiners) ──────────────────────

  /**
   * JSON-serialized stroke snapshot for late joiners (Loki M1).
   * Updated periodically (every 5s) or on clear/undo.
   * Format: JSON string of StrokeData[] array.
   */
  @type("string") strokeSnapshot: string = "[]";

  // ─── Game Over ───────────────────────────────────────────────

  /** ID of the winner (highest score player). */
  @type("string") winnerId: string = "";

  /** Nickname of the winner. */
  @type("string") winnerNickname: string = "";

  // ─── Last Round Word (for ROUND_END reveal) ──────────────────

  /** The word from the just-ended turn (revealed to all at ROUND_END). */
  @type("string") revealedWord: string = "";
}
