import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";
import { BaseState, BasePlayer } from "./BaseState";

/**
 * Card colors in the Word Link grid.
 * - "red" / "blue" = team words
 * - "neutral" = bystander (ends turn)
 * - "assassin" = instant loss for guessing team
 */
export type CardColor = "red" | "blue" | "neutral" | "assassin";

/**
 * Team identifiers.
 */
export type Team = "red" | "blue";

/**
 * Player roles within a team.
 */
export type PlayerRole = "spymaster" | "guesser";

/**
 * Word Link game phases.
 */
export type WordLinkPhase =
  | "LOBBY"
  | "TEAM_REVEAL"    // Brief phase showing team assignments
  | "CLUE_GIVING"    // Active spymaster is entering a clue
  | "GUESSING"       // Active team is guessing cards
  | "GAME_OVER";

/**
 * A single card on the 5x5 grid.
 */
export class WordCard extends Schema {
  /** Index position in the grid (0-24). */
  @type("number") index: number = 0;
  /** The Thai word displayed on this card. */
  @type("string") word: string = "";
  /**
   * The card's true color. Only synced to spymasters.
   * For guessers, this is "" until the card is revealed.
   */
  @type("string") color: string = "";
  /** Whether this card has been revealed (guessed). */
  @type("boolean") revealed: boolean = false;
  /** The color shown after reveal (always visible once revealed). */
  @type("string") revealedColor: string = "";
}

/**
 * Word Link player -- extends BasePlayer with team and role.
 */
export class WordLinkPlayer extends BasePlayer {
  /** Which team this player belongs to ("red" or "blue"). */
  @type("string") team: string = "";
  /** Role: "spymaster" or "guesser". */
  @type("string") role: string = "";
}

/**
 * Current clue information.
 */
export class ClueInfo extends Schema {
  /** The one-word clue given by the spymaster. */
  @type("string") word: string = "";
  /** How many cards the clue relates to. */
  @type("number") number: number = 0;
  /** How many guesses the team has made for this clue. */
  @type("number") guessesUsed: number = 0;
  /** Maximum guesses allowed (number + 1). */
  @type("number") maxGuesses: number = 0;
}

/**
 * WordLinkState -- Colyseus state for the Word Link game.
 *
 * Inherits from BaseState: roomCode, phase, gameType, playerCount, createdAt, players.
 * Does NOT re-declare @type on players (follows BasePlayer-extension pattern).
 */
export class WordLinkState extends BaseState {
  /** The 5x5 grid of word cards (25 cards). */
  @type([WordCard]) grid = new ArraySchema<WordCard>();

  /** Which team's turn it is ("red" or "blue"). Red goes first. */
  @type("string") currentTeam: string = "red";

  /** Current clue (null when waiting for spymaster). */
  @type(ClueInfo) currentClue: ClueInfo | null = null;

  /** How many red team cards remain (starts at 9). */
  @type("number") redRemaining: number = 9;

  /** How many blue team cards remain (starts at 8). */
  @type("number") blueRemaining: number = 8;

  /** The winning team ("red", "blue", or "" if game not over). */
  @type("string") winner: string = "";

  /** Reason for game ending ("all_words" or "assassin"). */
  @type("string") winReason: string = "";

  /** Turn timer in seconds (0 = no timer). */
  @type("number") turnTimer: number = 0;

  /** Turn timer duration setting (host-configurable, default 0 = unlimited). */
  @type("number") turnTimerSetting: number = 0;
}
