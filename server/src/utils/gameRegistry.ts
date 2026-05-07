/**
 * Game Registry -- central catalog of all party games.
 *
 * Each game is registered with metadata (display names, player count range,
 * room class reference, availability flag). The registry is the single source
 * of truth for:
 * - GET /api/games endpoint (public game list)
 * - Room creation (resolving gameType -> Room class)
 * - Room code namespacing (Loki F6a: codes are unique per gameType)
 *
 * To add a new game:
 *   1. Create YourRoom extends BaseRoom in server/src/rooms/
 *   2. Call gameRegistry.register({ ... }) in this file
 *   3. Wire it in index.ts with gameServer.define()
 *
 * @module gameRegistry
 */

import type { Room } from "colyseus";

export interface GameDefinition {
  /** Unique game identifier (URL-safe, lowercase). Used as gameType param. */
  id: string;
  /** Display name in English. */
  displayName: string;
  /** Display name in Thai. */
  displayNameTh: string;
  /** Minimum players required to start. */
  minPlayers: number;
  /** Maximum players allowed in the room. */
  maxPlayers: number;
  /** Colyseus Room constructor. null for coming-soon games. */
  roomClass: (new (...args: any[]) => Room) | null;
  /** If true, this game is not yet playable (shown as "Coming Soon"). */
  comingSoon: boolean;
  /** Primary game mechanic / category. */
  mechanic: string;
  /** Short description in Thai. */
  description: string;
  /** Emoji icon for the game card. */
  icon: string;
}

/**
 * Public-facing game info (roomClass omitted for API responses).
 */
export interface GameInfo {
  id: string;
  displayName: string;
  displayNameTh: string;
  minPlayers: number;
  maxPlayers: number;
  comingSoon: boolean;
  mechanic: string;
  description: string;
  icon: string;
}

class GameRegistry {
  private games: Map<string, GameDefinition> = new Map();

  /**
   * Register a game in the registry.
   * @throws if a game with the same id is already registered
   */
  register(game: GameDefinition): void {
    if (this.games.has(game.id)) {
      throw new Error(`Game "${game.id}" is already registered`);
    }
    this.games.set(game.id, game);
  }

  /**
   * Get a game definition by id.
   * @returns GameDefinition or undefined if not found
   */
  get(id: string): GameDefinition | undefined {
    return this.games.get(id);
  }

  /**
   * Get all registered games as public GameInfo (roomClass omitted).
   * Preserves registration order.
   */
  getAll(): GameInfo[] {
    const result: GameInfo[] = [];
    for (const game of this.games.values()) {
      result.push({
        id: game.id,
        displayName: game.displayName,
        displayNameTh: game.displayNameTh,
        minPlayers: game.minPlayers,
        maxPlayers: game.maxPlayers,
        comingSoon: game.comingSoon,
        mechanic: game.mechanic,
        description: game.description,
        icon: game.icon,
      });
    }
    return result;
  }

  /**
   * Get only playable (non-coming-soon) games.
   */
  getPlayable(): GameInfo[] {
    return this.getAll().filter((g) => !g.comingSoon);
  }

  /**
   * Check if a game id exists in the registry.
   */
  has(id: string): boolean {
    return this.games.has(id);
  }

  /**
   * Get the total number of registered games.
   */
  get size(): number {
    return this.games.size;
  }

  /**
   * Clear all registrations (for testing).
   */
  clear(): void {
    this.games.clear();
  }
}

// Singleton instance
export const gameRegistry = new GameRegistry();

// ─── Register all 6 games ─────────────────────────────────────────────────────
// Note: roomClass is set to the actual class for active games.
// Coming-soon games have roomClass = null (no Room class built yet).

// We import KhamTongHamRoom lazily to avoid circular dependency issues.
// The actual wiring happens via registerDefaultGames() called from index.ts.

/**
 * Register the default 6-game lineup.
 * Called from index.ts after all Room classes are imported.
 *
 * @param roomClasses - Map of gameId -> Room constructor for active games
 */
export function registerDefaultGames(
  roomClasses: Record<string, new (...args: any[]) => Room>,
): void {
  gameRegistry.register({
    id: "forbidden-word",
    displayName: "Forbidden Word",
    displayNameTh: "คำต้องห้าม",
    minPlayers: 2,
    maxPlayers: 8,
    roomClass: roomClasses["forbidden-word"] || null,
    comingSoon: false,
    mechanic: "word-survival",
    description: "ได้คำต้องห้าม อย่าพูดมัน! เพื่อนจับได้ = แพ้",
    icon: "🤐",
  });

  gameRegistry.register({
    id: "werewolf",
    displayName: "Werewolf",
    displayNameTh: "หมาป่า",
    minPlayers: 5,
    maxPlayers: 15,
    roomClass: roomClasses["werewolf"] || null,
    comingSoon: true,
    mechanic: "social-deduction",
    description: "หาตัวหมาป่าให้เจอ ก่อนที่มันจะกินทุกคน!",
    icon: "🐺",
  });

  gameRegistry.register({
    id: "spy",
    displayName: "Spy",
    displayNameTh: "สายลับ",
    minPlayers: 3,
    maxPlayers: 8,
    roomClass: roomClasses["spy"] || null,
    comingSoon: true,
    mechanic: "location-deduction",
    description: "ถามคำถามหาสายลับ แต่ระวังอย่าเปิดเผยสถานที่!",
    icon: "🕵️",
  });

  gameRegistry.register({
    id: "knights",
    displayName: "Knights",
    displayNameTh: "อัศวิน",
    minPlayers: 5,
    maxPlayers: 10,
    roomClass: roomClasses["knights"] || null,
    comingSoon: true,
    mechanic: "hidden-role",
    description: "ภารกิจลับ ใครเป็นพวกเดียวกัน ใครเป็นทรยศ?",
    icon: "⚔️",
  });

  gameRegistry.register({
    id: "word-link",
    displayName: "Word Link",
    displayNameTh: "คำเชื่อม",
    minPlayers: 4,
    maxPlayers: 10,
    roomClass: roomClasses["word-link"] || null,
    comingSoon: false,
    mechanic: "word-association",
    description: "ใบ้คำให้ทีม ด้วยคำเพียงคำเดียว!",
    icon: "🔗",
  });

  gameRegistry.register({
    id: "draw-guess",
    displayName: "Draw & Guess",
    displayNameTh: "วาดทาย",
    minPlayers: 3,
    maxPlayers: 8,
    roomClass: roomClasses["draw-guess"] || null,
    comingSoon: true,
    mechanic: "drawing",
    description: "วาดรูปให้เพื่อนทาย ห้ามพิมพ์ ห้ามพูด!",
    icon: "🎨",
  });
}
