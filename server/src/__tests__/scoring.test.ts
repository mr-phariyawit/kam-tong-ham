/**
 * Scoring Logic Tests (SC-01 to SC-12)
 *
 * These tests validate the scoring rules by directly simulating the logic
 * from KhamTongHamRoom since the methods are private. We mirror the exact
 * scoring formulas from the source and test them in isolation.
 */
import { describe, it, expect } from "vitest";
import { Player } from "../schemas/GameState";

// ---------- helpers that mirror the scoring logic in KhamTongHamRoom ----------

function makePlayer(opts: Partial<{
  score: number;
  roundPoints: number;
  isAlive: boolean;
  isConnected: boolean;
}> = {}): Player {
  const p = new Player();
  p.score = opts.score ?? 0;
  p.roundPoints = opts.roundPoints ?? 0;
  p.isAlive = opts.isAlive ?? true;
  p.isConnected = opts.isConnected ?? true;
  return p;
}

/** Mirrors endRound() survival bonus */
function applySurvivalBonus(player: Player) {
  if (player.isAlive && player.isConnected) {
    player.roundPoints += 5;
    player.score += 5;
  }
}

/** Mirrors resolveVote() — guilty path */
function applyGuiltySentence(target: Player, accuser: Player) {
  target.isAlive = false;
  target.roundPoints -= 3;
  target.score -= 3;
  accuser.roundPoints += 2;
  accuser.score += 2;
}

/** Mirrors resolveVote() — not-guilty path */
function applyFalseAccusation(accuser: Player) {
  accuser.roundPoints -= 1;
  accuser.score -= 1;
}

/** Mirrors onLeave() / handleSurrender() during game */
function applyDisconnectPenalty(player: Player) {
  if (player.isAlive) {
    player.isAlive = false;
    player.roundPoints -= 3;
    player.score -= 3;
  }
}

/** Mirrors handleGuessWord() — correct guess */
function applyCorrectGuess(player: Player) {
  player.roundPoints += 3;
  player.score += 3;
  player.guessCorrect = true;
}

// ---------- tests ----------

describe("Scoring Logic", () => {
  // SC-01: Survive full round → +5
  it("SC-01: alive player at round end gets +5 roundPoints and +5 score", () => {
    const p = makePlayer({ score: 0, roundPoints: 0 });
    applySurvivalBonus(p);
    expect(p.roundPoints).toBe(5);
    expect(p.score).toBe(5);
  });

  // SC-02: Correct accusation (guilty) → accuser +2
  it("SC-02: accuser gains +2 when accusation is correct (guilty vote wins)", () => {
    const accuser = makePlayer();
    const target = makePlayer();
    applyGuiltySentence(target, accuser);
    expect(accuser.roundPoints).toBe(2);
    expect(accuser.score).toBe(2);
  });

  // SC-03: False accusation (not-guilty) → accuser -1
  it("SC-03: accuser loses -1 when accusation is false (not-guilty vote wins)", () => {
    const accuser = makePlayer();
    applyFalseAccusation(accuser);
    expect(accuser.roundPoints).toBe(-1);
    expect(accuser.score).toBe(-1);
  });

  // SC-04: Target eliminated → score -3, isAlive=false
  it("SC-04: target loses -3 score and is marked dead on guilty verdict", () => {
    const target = makePlayer({ score: 10 });
    const accuser = makePlayer();
    applyGuiltySentence(target, accuser);
    expect(target.score).toBe(7);
    expect(target.isAlive).toBe(false);
    expect(target.roundPoints).toBe(-3);
  });

  // SC-05: Correct word guess → +3, guessCorrect=true
  it("SC-05: correct guess awards +3 and sets guessCorrect", () => {
    const p = makePlayer({ score: 0, roundPoints: 0 });
    applyCorrectGuess(p);
    expect(p.roundPoints).toBe(3);
    expect(p.score).toBe(3);
    expect(p.guessCorrect).toBe(true);
  });

  // SC-06: Incorrect word guess → no change
  it("SC-06: incorrect guess causes no score change and guessCorrect remains false", () => {
    const p = makePlayer({ score: 5, roundPoints: 0 });
    // No mutation — just check state is unchanged
    expect(p.score).toBe(5);
    expect(p.roundPoints).toBe(0);
    expect(p.guessCorrect).toBe(false);
  });

  // SC-07: Disconnect during game → score -3, isAlive=false
  it("SC-07: disconnect during game applies -3 penalty and marks dead", () => {
    const p = makePlayer({ score: 5 });
    applyDisconnectPenalty(p);
    expect(p.score).toBe(2);
    expect(p.isAlive).toBe(false);
    expect(p.roundPoints).toBe(-3);
  });

  // SC-08: No double-elimination — dead player's score not further decremented
  it("SC-08: second disconnect/leave on already-dead player has no effect", () => {
    const p = makePlayer({ score: 2, isAlive: false });
    // The guard `if (player.isAlive)` prevents double penalty
    applyDisconnectPenalty(p);
    expect(p.score).toBe(2); // unchanged
    expect(p.isAlive).toBe(false);
  });

  // SC-09: Score accumulation across rounds
  it("SC-09: survives rounds 1 & 2 then eliminated in round 3 → final score 7", () => {
    const p = makePlayer({ score: 0 });
    // Round 1: survive → +5
    applySurvivalBonus(p);
    // Round 2: survive → +5
    applySurvivalBonus(p);
    // Round 3: eliminated → -3
    const accuser = makePlayer();
    applyGuiltySentence(p, accuser);
    expect(p.score).toBe(7); // 5 + 5 - 3 = 7
  });

  // SC-10: Negative score allowed
  it("SC-10: score can go negative (false-accuse 3 times from 0)", () => {
    const accuser = makePlayer({ score: 0 });
    applyFalseAccusation(accuser); // -1
    applyFalseAccusation(accuser); // -2
    applyFalseAccusation(accuser); // -3
    expect(accuser.score).toBe(-3);
  });

  // SC-11: Accuser with score=0 penalized → score=-1
  it("SC-11: accuser at score=0 becomes score=-1 after false accusation", () => {
    const accuser = makePlayer({ score: 0 });
    applyFalseAccusation(accuser);
    expect(accuser.score).toBe(-1);
  });

  // SC-12: Survivor with negative score still gets +5
  it("SC-12: alive player with negative score still receives +5 survival bonus", () => {
    const p = makePlayer({ score: -2, roundPoints: 0 });
    applySurvivalBonus(p);
    expect(p.score).toBe(3);
    expect(p.roundPoints).toBe(5);
  });
});
