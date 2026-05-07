import { Schema, type, ArraySchema } from "@colyseus/schema";
import { BaseState, BasePlayer } from "./BaseState";

// ─── Werewolf Roles ──────────────────────────────────────────────

export type WerewolfRole = "werewolf" | "seer" | "doctor" | "villager";

/**
 * Role display names in Thai.
 */
export const ROLE_NAMES_TH: Record<WerewolfRole, string> = {
  werewolf: "หมาป่า",
  seer: "หมอดู",
  doctor: "หมอ",
  villager: "ชาวบ้าน",
};

/**
 * Role icons for UI display.
 */
export const ROLE_ICONS: Record<WerewolfRole, string> = {
  werewolf: "\u{1F43A}", // wolf
  seer: "\u{1F52E}",     // crystal ball
  doctor: "\u{1FA7A}",   // stethoscope
  villager: "\u{1F9D1}",  // person
};

// ─── Role Distribution Table (Basic Preset) ─────────────────────

export interface RoleDistribution {
  werewolves: number;
  seer: number;
  doctor: number;
  villagers: number;
}

/**
 * Role distribution by player count (WW-001 spec).
 * Key = player count, value = role counts.
 */
export const ROLE_TABLE: Record<number, RoleDistribution> = {
  5:  { werewolves: 1, seer: 1, doctor: 0, villagers: 3 },
  6:  { werewolves: 1, seer: 1, doctor: 1, villagers: 3 },
  7:  { werewolves: 2, seer: 1, doctor: 1, villagers: 3 },
  8:  { werewolves: 2, seer: 1, doctor: 1, villagers: 4 },
  9:  { werewolves: 2, seer: 1, doctor: 1, villagers: 5 },
  10: { werewolves: 2, seer: 1, doctor: 1, villagers: 6 },
  11: { werewolves: 3, seer: 1, doctor: 1, villagers: 6 },
  12: { werewolves: 3, seer: 1, doctor: 1, villagers: 7 },
  13: { werewolves: 3, seer: 1, doctor: 1, villagers: 8 },
  14: { werewolves: 3, seer: 1, doctor: 1, villagers: 9 },
  15: { werewolves: 3, seer: 1, doctor: 1, villagers: 10 },
};

/**
 * Get role distribution for a given player count.
 * Falls back to interpolation for any count not in the table.
 */
export function getRoleDistribution(playerCount: number): RoleDistribution {
  if (ROLE_TABLE[playerCount]) {
    return { ...ROLE_TABLE[playerCount] };
  }
  // Should not happen with 5-15 constraint, but handle gracefully
  throw new Error(`Unsupported player count: ${playerCount}`);
}

// ─── Werewolf Phases ────────────────────────────────────────────

export type WerewolfPhase =
  | "LOBBY"
  | "ROLE_REVEAL"
  | "NIGHT"
  | "DAY_ANNOUNCE"
  | "DAY_DISCUSSION"
  | "DAY_VOTE"
  | "GAME_OVER";

// ─── Kill History Entry ─────────────────────────────────────────

export class KillEntry extends Schema {
  @type("number") night: number = 0;
  @type("string") victimId: string = "";
  @type("string") victimNickname: string = "";
  @type("string") victimRole: string = "";
  @type("string") cause: string = ""; // "wolf_kill" | "vote_eliminated" | "no_kill"
  @type("boolean") wasSaved: boolean = false;
}

// ─── WerewolfPlayer ─────────────────────────────────────────────

/**
 * WerewolfPlayer -- extends BasePlayer with werewolf-specific fields.
 *
 * CRITICAL (Loki M3): The actual role is stored server-side in WerewolfRoom.playerRoles.
 * The `revealedRole` field is EMPTY until the player dies or the game ends.
 * This prevents clients from reading other players' roles from synced state.
 *
 * The player's own role is sent via private message (ROLE_DATA).
 */
export class WerewolfPlayer extends BasePlayer {
  /**
   * Revealed role -- empty until death or game over.
   * Only set when the player is eliminated (night kill or day vote).
   */
  @type("string") revealedRole: string = "";

  /** Whether this player has voted in the current day vote. */
  @type("boolean") hasVoted: boolean = false;

  /** The player's current vote target (sessionId). Cleared between votes. */
  @type("string") vote: string = "";

  /** Whether this player has submitted their night action. */
  @type("boolean") hasActed: boolean = false;
}

// ─── WerewolfState ──────────────────────────────────────────────

/**
 * WerewolfState -- Colyseus state for the Werewolf game.
 *
 * Inherits from BaseState: roomCode, phase, gameType, playerCount, createdAt, players.
 * Does NOT re-declare @type on players (follows BasePlayer-extension pattern).
 */
export class WerewolfState extends BaseState {
  /** Current night number (1-based, increments each night cycle). */
  @type("number") nightNumber: number = 0;

  /** Timer countdown in seconds. */
  @type("number") timer: number = 0;

  /** Discussion timer setting (host configurable, default 90 seconds). */
  @type("number") discussionTimerSetting: number = 90;

  /** Night timer setting (per action, default 30 seconds). */
  @type("number") nightTimerSetting: number = 30;

  // ─── Day Announce ──────────────────────────────────────────────

  /** Id of the player killed last night (empty if no kill / doctor saved). */
  @type("string") lastNightVictimId: string = "";

  /** Nickname of the last night victim. */
  @type("string") lastNightVictimNickname: string = "";

  /** Whether the doctor saved the victim. */
  @type("boolean") lastNightSaved: boolean = false;

  // ─── Day Vote ──────────────────────────────────────────────────

  /** Id of the nominated player for elimination vote. */
  @type("string") nominatedPlayerId: string = "";

  /** Nickname of the nominated player. */
  @type("string") nominatedPlayerNickname: string = "";

  /** Id of the nominator. */
  @type("string") nominatorId: string = "";

  /** Votes to eliminate. */
  @type("number") eliminateVotes: number = 0;

  /** Votes to spare. */
  @type("number") spareVotes: number = 0;

  /** Total votes cast. */
  @type("number") totalVotesCast: number = 0;

  /** Expected voter count. */
  @type("number") totalVotersExpected: number = 0;

  // ─── Game Over ─────────────────────────────────────────────────

  /** Winner: "village" or "werewolves" or "" (game not over). */
  @type("string") winner: string = "";

  /** Win reason description. */
  @type("string") winReason: string = "";

  /** Kill history (revealed at game over). */
  @type([KillEntry]) killHistory = new ArraySchema<KillEntry>();

  // ─── Alive counts (for client-side display) ────────────────────

  /** Number of alive players. */
  @type("number") aliveCount: number = 0;
}
