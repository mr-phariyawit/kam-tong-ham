import { Schema, type, ArraySchema } from "@colyseus/schema";
import { BaseState, BasePlayer } from "./BaseState";

// ─── Knights Role Types ─────────────────────────────────────────

/**
 * All possible roles in the Knights game.
 * Thai-themed names to avoid Avalon IP (Loki F2, Sprint 2).
 */
export type KnightsRole =
  | "good-knight"    // อัศวินฝ่ายดี (basic good)
  | "leader"         // ผู้นำอัศวิน (knows evil, target of assassination)
  | "advisor"        // ที่ปรึกษา (knows who leader is)
  | "traitor"        // ผู้ทรยศ (basic evil)
  | "assassin"       // มือสังหาร (can guess leader at game end)
  | "double-agent";  // สายลับฝ่ายชั่ว (appears as leader to advisor)

export type KnightsTeam = "good" | "evil";

/** Thai display names for each role. */
export const ROLE_NAMES_TH: Record<KnightsRole, string> = {
  "good-knight": "อัศวินฝ่ายดี",
  "leader": "ผู้นำอัศวิน",
  "advisor": "ที่ปรึกษา",
  "traitor": "ผู้ทรยศ",
  "assassin": "มือสังหาร",
  "double-agent": "สายลับฝ่ายชั่ว",
};

/** Role icons for UI display. */
export const ROLE_ICONS: Record<KnightsRole, string> = {
  "good-knight": "\u{1F6E1}",   // shield
  "leader": "\u{1F451}",        // crown
  "advisor": "\u{1F4DC}",       // scroll
  "traitor": "\u{1F5E1}",       // dagger
  "assassin": "\u{2694}",       // crossed swords
  "double-agent": "\u{1F3AD}",  // performing arts mask
};

/** Map role to team. */
export const ROLE_TEAM: Record<KnightsRole, KnightsTeam> = {
  "good-knight": "good",
  "leader": "good",
  "advisor": "good",
  "traitor": "evil",
  "assassin": "evil",
  "double-agent": "evil",
};

// ─── Role Distribution Table ────────────────────────────────────

export interface KnightsRoleDistribution {
  good: number;   // total good count
  evil: number;   // total evil count
  /** Mission team sizes for 5 rounds. */
  missionSizes: [number, number, number, number, number];
  /** Whether mission 4 requires 2 fails (7+ players). */
  mission4DoubleFail: boolean;
  /** Special roles included at this player count. */
  specialRoles: {
    leader: boolean;     // always true
    assassin: boolean;   // always true
    advisor: boolean;    // 7+ players
    doubleAgent: boolean; // 7+ players (needs 3+ evil)
  };
}

/**
 * Role distribution by player count (KN-001.4 spec).
 * Special roles: Loki M1 -- advisor/double-agent at 7+ only.
 */
export const ROLE_TABLE: Record<number, KnightsRoleDistribution> = {
  5: {
    good: 3, evil: 2,
    missionSizes: [2, 3, 2, 3, 3],
    mission4DoubleFail: false,
    specialRoles: { leader: true, assassin: true, advisor: false, doubleAgent: false },
  },
  6: {
    good: 4, evil: 2,
    missionSizes: [2, 3, 4, 3, 4],
    mission4DoubleFail: false,
    specialRoles: { leader: true, assassin: true, advisor: false, doubleAgent: false },
  },
  7: {
    good: 4, evil: 3,
    missionSizes: [2, 3, 3, 4, 4],
    mission4DoubleFail: true,
    specialRoles: { leader: true, assassin: true, advisor: true, doubleAgent: true },
  },
  8: {
    good: 5, evil: 3,
    missionSizes: [3, 4, 4, 5, 5],
    mission4DoubleFail: true,
    specialRoles: { leader: true, assassin: true, advisor: true, doubleAgent: true },
  },
  9: {
    good: 6, evil: 3,
    missionSizes: [3, 4, 4, 5, 5],
    mission4DoubleFail: true,
    specialRoles: { leader: true, assassin: true, advisor: true, doubleAgent: true },
  },
  10: {
    good: 6, evil: 4,
    missionSizes: [3, 4, 4, 5, 5],
    mission4DoubleFail: true,
    specialRoles: { leader: true, assassin: true, advisor: true, doubleAgent: true },
  },
};

/**
 * Get role distribution for a given player count.
 * @throws Error if player count is not supported (5-10).
 */
export function getRoleDistribution(playerCount: number): KnightsRoleDistribution {
  const dist = ROLE_TABLE[playerCount];
  if (!dist) {
    throw new Error(`Knights: unsupported player count ${playerCount} (must be 5-10)`);
  }
  return { ...dist, specialRoles: { ...dist.specialRoles } };
}

/**
 * Build the role array for a given player count.
 * Includes special roles per the distribution table.
 */
export function buildRoleArray(playerCount: number): KnightsRole[] {
  const dist = getRoleDistribution(playerCount);
  const roles: KnightsRole[] = [];

  // Good team
  roles.push("leader"); // always present
  if (dist.specialRoles.advisor) {
    roles.push("advisor");
  }
  // Fill remaining good slots with basic good-knight
  const goodSpecialCount = 1 + (dist.specialRoles.advisor ? 1 : 0);
  for (let i = 0; i < dist.good - goodSpecialCount; i++) {
    roles.push("good-knight");
  }

  // Evil team
  roles.push("assassin"); // always present
  if (dist.specialRoles.doubleAgent) {
    roles.push("double-agent");
  }
  // Fill remaining evil slots with basic traitor
  const evilSpecialCount = 1 + (dist.specialRoles.doubleAgent ? 1 : 0);
  for (let i = 0; i < dist.evil - evilSpecialCount; i++) {
    roles.push("traitor");
  }

  return roles;
}

// ─── Game Phases ────────────────────────────────────────────────

export type KnightsPhase =
  | "LOBBY"
  | "ROLE_REVEAL"
  | "TEAM_PROPOSAL"
  | "TEAM_VOTE"
  | "MISSION"
  | "MISSION_REVEAL"
  | "ASSASSIN_GUESS"
  | "GAME_OVER";

// ─── Mission History Entry ──────────────────────────────────────

export class MissionEntry extends Schema {
  @type("number") missionNumber: number = 0;
  @type("number") successVotes: number = 0;
  @type("number") failVotes: number = 0;
  @type("boolean") succeeded: boolean = false;
  @type("number") teamSize: number = 0;
}

// ─── KnightsPlayer ──────────────────────────────────────────────

/**
 * KnightsPlayer -- extends BasePlayer with Knights-specific fields.
 *
 * CRITICAL (Loki H2): Roles stored server-side in KnightsRoom.playerRoles.
 * `revealedRole` is EMPTY until game over.
 * Player's own role is sent via private ROLE_DATA message.
 */
export class KnightsPlayer extends BasePlayer {
  /** Revealed role -- empty until game over. */
  @type("string") revealedRole: string = "";

  /** Revealed team -- empty until game over. */
  @type("string") revealedTeam: string = "";

  /** Whether this player has voted in the current vote phase. */
  @type("boolean") hasVoted: boolean = false;

  /** Whether this player is on the current mission team. */
  @type("boolean") isOnTeam: boolean = false;

  /** Whether this player has submitted their mission vote. */
  @type("boolean") hasMissionVoted: boolean = false;
}

// ─── KnightsState ───────────────────────────────────────────────

/**
 * KnightsState -- Colyseus synced state for the Knights game.
 *
 * Inherits from BaseState: roomCode, phase, gameType, playerCount, createdAt, players.
 */
export class KnightsState extends BaseState {
  // ─── Mission Tracking ─────────────────────────────────────────

  /** Current mission number (1-5, 1-based). */
  @type("number") currentMission: number = 0;

  /** Number of missions completed successfully by good team. */
  @type("number") goodWins: number = 0;

  /** Number of missions failed (evil wins). */
  @type("number") evilWins: number = 0;

  /** Team size required for current mission. */
  @type("number") currentMissionTeamSize: number = 0;

  /** Whether current mission requires 2 fails (mission 4 with 7+ players). */
  @type("boolean") currentMissionDoubleFail: boolean = false;

  // ─── Leader / Proposal ────────────────────────────────────────

  /** Session ID of the current leader (who proposes teams). */
  @type("string") currentLeaderId: string = "";

  /** Nickname of the current leader. */
  @type("string") currentLeaderNickname: string = "";

  /** Number of consecutive proposal rejections this round (Loki H3: persists). */
  @type("number") consecutiveRejections: number = 0;

  // ─── Team Vote ────────────────────────────────────────────────

  /** Votes to approve the proposed team. */
  @type("number") approveVotes: number = 0;

  /** Votes to reject the proposed team. */
  @type("number") rejectVotes: number = 0;

  /** Total team votes cast. */
  @type("number") teamVotesCast: number = 0;

  /** Expected team voter count. */
  @type("number") teamVotersExpected: number = 0;

  // ─── Mission Vote ─────────────────────────────────────────────

  /** Mission votes submitted count (shown to all). */
  @type("number") missionVotesCast: number = 0;

  /** Expected mission voter count. */
  @type("number") missionVotersExpected: number = 0;

  // ─── Timers ───────────────────────────────────────────────────

  /** Timer countdown in seconds. */
  @type("number") timer: number = 0;

  // ─── Game Over ────────────────────────────────────────────────

  /** Winner: "good" or "evil" or "" (game not over). */
  @type("string") winner: string = "";

  /** Win reason description. */
  @type("string") winReason: string = "";

  /** Mission history (visible to all). */
  @type([MissionEntry]) missionHistory = new ArraySchema<MissionEntry>();

  // ─── Assassin Guess ───────────────────────────────────────────

  /** Session ID of the player the assassin guessed. */
  @type("string") assassinGuessTargetId: string = "";

  /** Nickname of the guessed player. */
  @type("string") assassinGuessTargetNickname: string = "";

  /** Whether the assassin's guess was correct. */
  @type("boolean") assassinGuessCorrect: boolean = false;
}
