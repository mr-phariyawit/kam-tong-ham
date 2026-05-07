import { Schema, type, ArraySchema } from "@colyseus/schema";
import { BaseState, BasePlayer } from "./BaseState";

/**
 * Spy game phases.
 */
export type SpyPhase =
  | "LOBBY"
  | "ROLE_REVEAL"   // Brief phase showing each player their role/location
  | "DISCUSSION"    // Main gameplay: ask questions, discuss, timer running
  | "VOTING"        // Accusation vote in progress
  | "SPY_GUESS"     // Spy is guessing the location
  | "GAME_OVER";

/**
 * Spy player -- extends BasePlayer with spy-specific fields.
 */
export class SpyPlayer extends BasePlayer {
  /**
   * Whether this player is the spy.
   * NOT synced to clients -- kept server-side only.
   * Player's own spy status is sent via private ROLE_DATA message.
   * (Fixed in Sprint 8 reconnect-leak audit: was @type("boolean") which
   *  synced to ALL clients, leaking spy identity.)
   */
  isSpy: boolean = false;
  /**
   * The player's assigned role at the location (empty for spy).
   * NOT synced to clients -- kept server-side only.
   * Player's own role is sent via private ROLE_DATA message.
   * (Fixed in Sprint 8 reconnect-leak audit: was @type("string") which
   *  synced to ALL clients, leaking role assignments.)
   */
  role: string = "";
  /** Whether this player has voted in the current accusation. */
  @type("boolean") hasVoted: boolean = false;
  /** The player's vote: "guilty" or "innocent" (cleared between votes). */
  @type("string") vote: string = "";
}

/**
 * Location info visible to non-spy players.
 */
export class LocationInfo extends Schema {
  /** Location id. */
  @type("string") id: string = "";
  /** Location name in Thai. */
  @type("string") name: string = "";
  /** Emoji icon. */
  @type("string") icon: string = "";
}

/**
 * SpyState -- Colyseus state for the Spy game.
 *
 * Inherits from BaseState: roomCode, phase, gameType, playerCount, createdAt, players.
 * Does NOT re-declare @type on players (follows BasePlayer-extension pattern).
 */
export class SpyState extends BaseState {
  /** Game timer in seconds (counts down). */
  @type("number") timer: number = 0;

  /** Timer duration setting (host-configurable, default 480 = 8 minutes). */
  @type("number") timerSetting: number = 480;

  /** The current round number (increments on play again). */
  @type("number") round: number = 0;

  /**
   * All location names (visible to everyone -- the spy uses this to guess).
   * Non-spy players can cross-reference this list during discussion.
   */
  @type([LocationInfo]) locationList = new ArraySchema<LocationInfo>();

  /** The id of the player currently being accused (empty if no vote in progress). */
  @type("string") accusedPlayerId: string = "";

  /** The id of the player who started the accusation. */
  @type("string") accuserPlayerId: string = "";

  /** Number of "guilty" votes in current accusation. */
  @type("number") guiltyVotes: number = 0;

  /** Number of "innocent" votes in current accusation. */
  @type("number") innocentVotes: number = 0;

  /** Total votes cast in current accusation. */
  @type("number") totalVotesCast: number = 0;

  /** Total voters expected (all alive players except the accused). */
  @type("number") totalVotersExpected: number = 0;

  /** The winning side ("spy" or "hunters" or "" if game not over). */
  @type("string") winner: string = "";

  /** Reason for game ending. */
  @type("string") winReason: string = "";

  /** The spy's player id (revealed on game over). */
  @type("string") revealedSpyId: string = "";

  /** The actual location name (revealed on game over). */
  @type("string") revealedLocation: string = "";

  /** The spy's guess (if they guessed). */
  @type("string") spyGuess: string = "";

  // ─── Scoring ────────────────────────────────────────────────
  // Scores are tracked on BasePlayer.score. Updated at game end.
}
