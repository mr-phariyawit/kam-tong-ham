import { Schema, type, MapSchema } from "@colyseus/schema";

/**
 * Base player schema shared across all game types.
 * Game-specific player schemas extend this with additional @type fields.
 *
 * Colyseus schema inheritance rules:
 * - Subclasses CAN add new @type fields
 * - Subclasses CANNOT re-declare @type on inherited fields
 * - The parent's @type decorator determines serialization for inherited fields
 */
export class BasePlayer extends Schema {
  @type("string") id: string = "";
  @type("string") nickname: string = "";
  @type("string") avatar: string = "";
  @type("boolean") isHost: boolean = false;
  @type("boolean") isAlive: boolean = true;
  @type("boolean") isConnected: boolean = true;
  @type("number") score: number = 0;
  @type("string") color: string = "";
}

/**
 * Shared game phases across all game types.
 * Individual games may define additional phases via union types.
 */
export type BasePhase = "LOBBY" | "COUNTDOWN" | "PLAYING" | "GAME_OVER";

/**
 * Player color palette shared across all game types.
 */
export const PLAYER_COLORS = [
  "#1E90FF", // Blue
  "#9C59D1", // Purple
  "#FF6B35", // Orange
  "#1ABC9C", // Teal
  "#FF6B9D", // Pink
  "#FFC312", // Yellow
  "#E84393", // Red
  "#574BC8", // Indigo
];

/**
 * BaseState -- shared Colyseus state schema for all game rooms.
 *
 * Contains: players map, phase, roomCode, gameType, playerCount, timestamps.
 * Game-specific states extend this with their own fields (rounds, timers, etc.).
 *
 * @colyseus/schema requires `@type` decorators for all synced fields.
 *
 * IMPORTANT -- Colyseus schema inheritance constraint:
 * The `players` MapSchema is typed as `BasePlayer` in the @type decorator.
 * Subclasses CANNOT re-declare @type on this field. If a game needs a custom
 * Player subclass (e.g., with vote/guess fields), it has two options:
 *
 * 1. Add new @type fields to a BasePlayer subclass -- Colyseus will serialize
 *    the extra fields correctly because the runtime instance IS the subclass.
 * 2. Store game-specific per-player data in separate state fields (e.g., a
 *    MapSchema of game-specific data keyed by playerId).
 *
 * Option 1 is preferred for most cases. The existing ForbiddenWord game will
 * use option 1 when refactored (KTH-T-009): ForbiddenWordPlayer extends
 * BasePlayer with vote/guess/roundPoints fields.
 */
export class BaseState extends Schema {
  @type("string") roomCode: string = "";
  @type("string") phase: string = "LOBBY";
  @type("string") gameType: string = "";
  @type("number") playerCount: number = 0;
  @type("number") createdAt: number = Date.now();

  /**
   * Players map. Keyed by Colyseus sessionId.
   * Uses BasePlayer -- game rooms that need custom player types should
   * create a Player subclass that extends BasePlayer with additional fields.
   */
  @type({ map: BasePlayer }) players = new MapSchema<BasePlayer>();
}
