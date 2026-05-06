import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";
import { BaseState, BasePlayer } from "./BaseState";

export type GamePhase =
  | "LOBBY"
  | "COUNTDOWN"
  | "PLAYING"
  | "VOTING"
  | "ROUND_END"
  | "GUESS_PHASE"
  | "SCOREBOARD"
  | "GAME_OVER";

export type VoteChoice = "guilty" | "not_yet";

/**
 * Re-export PLAYER_COLORS for backward compatibility.
 * Canonical source is BaseState.ts.
 */
export { PLAYER_COLORS } from "./BaseState";

/**
 * Player schema for Forbidden Word game.
 * Extends BasePlayer with game-specific fields (vote, guess, round scoring).
 *
 * Colyseus serializes based on runtime instance type, so these extra
 * @type fields are correctly synced even though the players MapSchema
 * in BaseState is typed as MapSchema<BasePlayer>.
 */
export class Player extends BasePlayer {
  @type("string") vote: string = ""; // "guilty" | "not_yet" | ""
  @type("boolean") hasGuessed: boolean = false;
  @type("boolean") guessCorrect: boolean = false;
  @type("string") guessedWord: string = "";
  @type("string") assignedWord: string = ""; // revealed after round end
  @type("number") roundPoints: number = 0;
}

export class Accusation extends Schema {
  @type("string") accuserId: string = "";
  @type("string") accuserName: string = "";
  @type("string") targetId: string = "";
  @type("string") targetName: string = "";
  // targetWord is intentionally NOT in the shared schema -- it must stay server-side only
  @type("number") voteDeadline: number = 0;
  // yesCount and noCount are NOT @type-decorated -- they must NOT sync to clients before reveal
  // (blind voting: no vote counts exposed until VOTE_REVEAL event fires)
  yesCount: number = 0;
  noCount: number = 0;
  @type("number") totalVoters: number = 0;
  // votedCount shows progress (how many have voted) without revealing choices
  @type("number") votedCount: number = 0;
}

export class GameConfig extends Schema {
  @type("string") category: string = "common";
  @type("number") totalRounds: number = 3;
  @type("number") roundDurationSecs: number = 180;
}

/**
 * GameState -- Forbidden Word game state.
 * Extends BaseState (shared lobby fields) with game-specific fields.
 *
 * Inherited from BaseState (DO NOT re-declare @type):
 *   roomCode, phase, gameType, playerCount, createdAt, players
 *
 * Added here: config, currentRound, roundTimer, voteTimer,
 *   countdownTimer, guessTimer, aliveCount, currentAccusation
 */
export class GameState extends BaseState {
  @type(GameConfig) config: GameConfig = new GameConfig();
  @type("number") currentRound: number = 0;
  @type("number") roundTimer: number = 0;
  @type("number") voteTimer: number = 0;
  @type("number") countdownTimer: number = 0;
  @type("number") guessTimer: number = 0;
  @type("number") aliveCount: number = 0;
  @type(Accusation) currentAccusation: Accusation | null = null;
}
