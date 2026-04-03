import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";

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

export class Player extends Schema {
  @type("string") id: string = "";
  @type("string") nickname: string = "";
  @type("string") avatar: string = "";
  @type("boolean") isHost: boolean = false;
  @type("boolean") isAlive: boolean = true;
  @type("boolean") isConnected: boolean = true;
  @type("number") score: number = 0;
  @type("string") color: string = "";
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
  // targetWord is intentionally NOT in the shared schema — it must stay server-side only
  @type("number") voteDeadline: number = 0;
  @type("number") yesCount: number = 0;
  @type("number") noCount: number = 0;
  @type("number") totalVoters: number = 0;
}

export class GameConfig extends Schema {
  @type("string") category: string = "common";
  @type("number") totalRounds: number = 3;
  @type("number") roundDurationSecs: number = 180;
}

export class GameState extends Schema {
  @type("string") roomCode: string = "";
  @type("string") phase: string = "LOBBY";
  @type(GameConfig) config: GameConfig = new GameConfig();
  @type({ map: Player }) players = new MapSchema<Player>();
  @type("number") currentRound: number = 0;
  @type("number") roundTimer: number = 0;
  @type("number") voteTimer: number = 0;
  @type("number") countdownTimer: number = 0;
  @type("number") guessTimer: number = 0;
  @type("number") aliveCount: number = 0;
  @type(Accusation) currentAccusation: Accusation | null = null;
  @type("number") createdAt: number = Date.now();
  @type("number") playerCount: number = 0;
}
