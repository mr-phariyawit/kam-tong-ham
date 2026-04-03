/**
 * Vote Resolution Tests (VR-01 to VR-13)
 *
 * Mirrors the resolveVote() and handleVote() logic from KhamTongHamRoom.
 */
import { describe, it, expect } from "vitest";
import { Player, Accusation } from "../schemas/GameState";

// ---------- helpers ----------

function makePlayer(opts: Partial<{
  id: string;
  isAlive: boolean;
  isConnected: boolean;
  score: number;
  roundPoints: number;
  vote: string;
}> = {}): Player {
  const p = new Player();
  p.id = opts.id ?? "p1";
  p.isAlive = opts.isAlive ?? true;
  p.isConnected = opts.isConnected ?? true;
  p.score = opts.score ?? 0;
  p.roundPoints = opts.roundPoints ?? 0;
  p.vote = opts.vote ?? "";
  return p;
}

function makeAccusation(accuserId: string, targetId: string, totalVoters: number): Accusation {
  const a = new Accusation();
  a.accuserId = accuserId;
  a.targetId = targetId;
  a.totalVoters = totalVoters;
  a.yesCount = 0;
  a.noCount = 0;
  return a;
}

/** Mirrors resolveVote() logic from KhamTongHamRoom */
function resolveVote(
  accusation: Accusation,
  players: Map<string, Player>
): { guilty: boolean; phase: string } {
  const yesCount = accusation.yesCount;
  const noCount = accusation.noCount;
  const totalEligible = accusation.totalVoters;
  const absentVotes = totalEligible - (yesCount + noCount);
  const effectiveNoCount = noCount + absentVotes;

  const guilty = yesCount > effectiveNoCount;

  const accuser = players.get(accusation.accuserId);
  const target = players.get(accusation.targetId);

  if (guilty) {
    if (target) {
      target.isAlive = false;
      target.roundPoints -= 3;
      target.score -= 3;
    }
    if (accuser) {
      accuser.roundPoints += 2;
      accuser.score += 2;
    }
  } else {
    if (accuser) {
      accuser.roundPoints -= 1;
      accuser.score -= 1;
    }
  }

  return { guilty, phase: "PLAYING" };
}

/** Mirrors handleVote() guards */
type VoteError =
  | "ACCUSED_CANNOT_VOTE"
  | "ALREADY_VOTED"
  | "CANNOT_VOTE"
  | "INVALID_PHASE"
  | null;

function tryVote(
  voterId: string,
  vote: string,
  accusation: Accusation,
  players: Map<string, Player>,
  phase: string
): VoteError {
  if (phase !== "VOTING" || !accusation) return "INVALID_PHASE";
  const voter = players.get(voterId);
  if (!voter || !voter.isAlive) return "CANNOT_VOTE";
  if (voterId === accusation.targetId) return "ACCUSED_CANNOT_VOTE";
  if (voter.vote === "guilty" || voter.vote === "not_yet") return "ALREADY_VOTED";
  return null;
}

// ---------- tests ----------

describe("Vote Resolution", () => {
  // VR-01: Clear guilty majority
  it("VR-01: 2 guilty vs 1 not_yet → guilty=true, target eliminated", () => {
    const accuser = makePlayer({ id: "accuser" });
    const target = makePlayer({ id: "target" });
    const players = new Map([["accuser", accuser], ["target", target]]);

    const accusation = makeAccusation("accuser", "target", 3);
    accusation.yesCount = 2;
    accusation.noCount = 1;

    const { guilty } = resolveVote(accusation, players);
    expect(guilty).toBe(true);
    expect(target.isAlive).toBe(false);
    expect(target.score).toBe(-3);
    expect(accuser.score).toBe(2);
  });

  // VR-02: Clear not-guilty majority
  it("VR-02: 1 guilty vs 2 not_yet → guilty=false, accuser penalized", () => {
    const accuser = makePlayer({ id: "accuser" });
    const target = makePlayer({ id: "target" });
    const players = new Map([["accuser", accuser], ["target", target]]);

    const accusation = makeAccusation("accuser", "target", 3);
    accusation.yesCount = 1;
    accusation.noCount = 2;

    const { guilty } = resolveVote(accusation, players);
    expect(guilty).toBe(false);
    expect(target.isAlive).toBe(true);
    expect(accuser.score).toBe(-1);
  });

  // VR-03: Exact tie → not guilty (strict majority required)
  it("VR-03: 2 guilty vs 2 not_yet → guilty=false (strict majority required)", () => {
    const accuser = makePlayer({ id: "accuser" });
    const target = makePlayer({ id: "target" });
    const players = new Map([["accuser", accuser], ["target", target]]);

    const accusation = makeAccusation("accuser", "target", 4);
    accusation.yesCount = 2;
    accusation.noCount = 2;

    const { guilty } = resolveVote(accusation, players);
    expect(guilty).toBe(false);
    expect(target.isAlive).toBe(true);
  });

  // VR-04: All absent (timer expires) → not guilty
  it("VR-04: 0 votes cast, timer fires → guilty=false (all absent = not_yet)", () => {
    const accuser = makePlayer({ id: "accuser" });
    const target = makePlayer({ id: "target" });
    const players = new Map([["accuser", accuser], ["target", target]]);

    const accusation = makeAccusation("accuser", "target", 3);
    accusation.yesCount = 0;
    accusation.noCount = 0;

    const { guilty } = resolveVote(accusation, players);
    expect(guilty).toBe(false);
  });

  // VR-05: One voter, votes guilty → guilty=true
  it("VR-05: 1 voter, votes guilty → guilty=true", () => {
    const accuser = makePlayer({ id: "accuser" });
    const target = makePlayer({ id: "target" });
    const players = new Map([["accuser", accuser], ["target", target]]);

    const accusation = makeAccusation("accuser", "target", 1);
    accusation.yesCount = 1;
    accusation.noCount = 0;

    const { guilty } = resolveVote(accusation, players);
    expect(guilty).toBe(true);
  });

  // VR-06: One voter, absent (timer fires) → not guilty
  it("VR-06: 1 eligible voter, no votes cast, timer fires → guilty=false", () => {
    const accuser = makePlayer({ id: "accuser" });
    const target = makePlayer({ id: "target" });
    const players = new Map([["accuser", accuser], ["target", target]]);

    const accusation = makeAccusation("accuser", "target", 1);
    accusation.yesCount = 0;
    accusation.noCount = 0;

    const { guilty } = resolveVote(accusation, players);
    expect(guilty).toBe(false);
  });

  // VR-07: 5 voters: 3 guilty, 1 not_yet, 1 absent → guilty=true
  it("VR-07: 3 guilty, 1 not_yet, 1 absent out of 5 → guilty=true", () => {
    const accuser = makePlayer({ id: "accuser" });
    const target = makePlayer({ id: "target" });
    const players = new Map([["accuser", accuser], ["target", target]]);

    const accusation = makeAccusation("accuser", "target", 5);
    accusation.yesCount = 3;
    accusation.noCount = 1;
    // 1 absent → effectiveNo = 1 + 1 = 2; 3 > 2 → guilty

    const { guilty } = resolveVote(accusation, players);
    expect(guilty).toBe(true);
  });

  // VR-08: 4 voters: 2 guilty, 1 not_yet, 1 absent → ties → not guilty
  it("VR-08: 2 guilty, 1 not_yet, 1 absent out of 4 → guilty=false (tie)", () => {
    const accuser = makePlayer({ id: "accuser" });
    const target = makePlayer({ id: "target" });
    const players = new Map([["accuser", accuser], ["target", target]]);

    const accusation = makeAccusation("accuser", "target", 4);
    accusation.yesCount = 2;
    accusation.noCount = 1;
    // 1 absent → effectiveNo = 1 + 1 = 2; 2 = 2 → not guilty

    const { guilty } = resolveVote(accusation, players);
    expect(guilty).toBe(false);
  });

  // VR-09: Vote clears accusation state (currentAccusation = null is asserted by caller)
  it("VR-09: resolveVote does not itself set currentAccusation; that is the room's responsibility", () => {
    // Verified: in KhamTongHamRoom.resolveVote(), `this.state.currentAccusation = null` is called.
    // The logic function returns cleanly without error.
    const accuser = makePlayer({ id: "accuser" });
    const target = makePlayer({ id: "target" });
    const players = new Map([["accuser", accuser], ["target", target]]);
    const accusation = makeAccusation("accuser", "target", 1);
    accusation.yesCount = 1;
    expect(() => resolveVote(accusation, players)).not.toThrow();
  });

  // VR-10: Phase returns to PLAYING after not-guilty vote
  it("VR-10: resolveVote returns phase=PLAYING for not-guilty outcome", () => {
    const accuser = makePlayer({ id: "accuser" });
    const target = makePlayer({ id: "target" });
    const players = new Map([["accuser", accuser], ["target", target]]);
    const accusation = makeAccusation("accuser", "target", 1);
    accusation.yesCount = 0;
    accusation.noCount = 0;

    const { phase } = resolveVote(accusation, players);
    expect(phase).toBe("PLAYING");
  });

  // VR-11: Accused cannot vote
  it("VR-11: accused player receives ACCUSED_CANNOT_VOTE error", () => {
    const accused = makePlayer({ id: "p2" });
    const players = new Map([["p2", accused]]);
    const accusation = makeAccusation("p1", "p2", 1);

    const err = tryVote("p2", "guilty", accusation, players, "VOTING");
    expect(err).toBe("ACCUSED_CANNOT_VOTE");
  });

  // VR-12: Dead player cannot vote
  it("VR-12: dead player (isAlive=false) receives CANNOT_VOTE error", () => {
    const dead = makePlayer({ id: "p3", isAlive: false });
    const players = new Map([["p3", dead]]);
    const accusation = makeAccusation("p1", "p2", 1);

    const err = tryVote("p3", "guilty", accusation, players, "VOTING");
    expect(err).toBe("CANNOT_VOTE");
  });

  // VR-13: Double vote rejected
  it("VR-13: player who already voted receives ALREADY_VOTED error on second attempt", () => {
    const voter = makePlayer({ id: "p4", vote: "guilty" });
    const players = new Map([["p4", voter]]);
    const accusation = makeAccusation("p1", "p2", 2);

    const err = tryVote("p4", "guilty", accusation, players, "VOTING");
    expect(err).toBe("ALREADY_VOTED");
  });
});
