/**
 * AEG-42 QA: Word pool depletion and tier distribution
 *
 * Verifies that expanded word pools (AEG-37) cannot be exhausted in normal play
 * and that tiers distribute correctly.
 *
 * Test plan:
 *   WPD-01: Pool size ≥ 100 words per category
 *   WPD-02: No duplicate words across tiers within a category
 *   WPD-03: Dealing algorithm — 6 players × 8 rounds = 48 words, ≥ 52 remain
 *   WPD-04: Tier distribution — mixed dealing produces all three tiers
 *   WPD-05: Multi-session — words not repeated within a session
 *   WPD-06: Edge case — category with exactly 100 words: no index-out-of-bounds
 *
 * AEG-37 complete: all 10 categories expanded to 100+ words with tiers.
 * All .todo markers removed.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { pickUniqueWords, getAvailableCategories, loadWordPack } from "../utils/wordPicker";

const ALL_CATEGORIES = [
  "animals", "body", "colors", "common", "emotions",
  "family", "food", "jobs", "places", "sports",
];

// ─────────────────────────────────────────────────────────────────────────────
// WPD-01: Pool size ≥ 100 words per category
// ─────────────────────────────────────────────────────────────────────────────
describe("WPD-01: Pool size ≥ 100 words per category", () => {
  it("WPD-01a: common category has ≥ 100 words", () => {
    const pack = loadWordPack("common");
    expect(pack.words.length).toBeGreaterThanOrEqual(100);
  });

  it("WPD-01b: animals category has ≥ 100 words", () => {
    const pack = loadWordPack("animals");
    expect(pack.words.length).toBeGreaterThanOrEqual(100);
  });

  it("WPD-01c: body category has ≥ 100 words", () => {
    const pack = loadWordPack("body");
    expect(pack.words.length).toBeGreaterThanOrEqual(100);
  });

  it("WPD-01d: colors category has ≥ 100 words", () => {
    const pack = loadWordPack("colors");
    expect(pack.words.length).toBeGreaterThanOrEqual(100);
  });

  it("WPD-01e: emotions category has ≥ 100 words", () => {
    const pack = loadWordPack("emotions");
    expect(pack.words.length).toBeGreaterThanOrEqual(100);
  });

  it("WPD-01f: family category has ≥ 100 words", () => {
    const pack = loadWordPack("family");
    expect(pack.words.length).toBeGreaterThanOrEqual(100);
  });

  it("WPD-01g: food category has ≥ 100 words", () => {
    const pack = loadWordPack("food");
    expect(pack.words.length).toBeGreaterThanOrEqual(100);
  });

  it("WPD-01h: jobs category has ≥ 100 words", () => {
    const pack = loadWordPack("jobs");
    expect(pack.words.length).toBeGreaterThanOrEqual(100);
  });

  it("WPD-01i: places category has ≥ 100 words", () => {
    const pack = loadWordPack("places");
    expect(pack.words.length).toBeGreaterThanOrEqual(100);
  });

  it("WPD-01j: sports category has ≥ 100 words", () => {
    const pack = loadWordPack("sports");
    expect(pack.words.length).toBeGreaterThanOrEqual(100);
  });

  it("WPD-01k: all categories — documents current word counts", () => {
    const MIN_TARGET = 100;
    const results: Record<string, { count: number; passes: boolean }> = {};

    for (const cat of ALL_CATEGORIES) {
      const pack = loadWordPack(cat);
      results[cat] = {
        count: pack.words.length,
        passes: pack.words.length >= MIN_TARGET,
      };
    }

    // At least `common` must already pass
    expect(results["common"].passes).toBe(true);

    // Document which categories are below target (expected to be 9 until AEG-37 is complete)
    const belowTarget = Object.entries(results)
      .filter(([, v]) => !v.passes)
      .map(([cat, v]) => `${cat}: ${v.count}`);

    if (belowTarget.length > 0) {
      // Log rather than fail — this documents the gap for AEG-37 tracking
      console.warn(
        `WPD-01: ${belowTarget.length} categories below 100-word target (AEG-37 incomplete):\n` +
          belowTarget.join(", ")
      );
    }

    // AEG-37 complete: all categories should now pass
    expect(belowTarget.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WPD-02: No duplicates across tiers within a category
// ─────────────────────────────────────────────────────────────────────────────
describe("WPD-02: No duplicate words across tiers within a category", () => {
  it("WPD-02a: common — no word appears in multiple tiers", () => {
    const pack = loadWordPack("common");
    expect(pack.tiers).toBeDefined();

    const easy = new Set(pack.tiers!.easy);
    const medium = new Set(pack.tiers!.medium);
    const hard = new Set(pack.tiers!.hard);

    const easyMediumOverlap = [...easy].filter((w) => medium.has(w));
    const easyHardOverlap = [...easy].filter((w) => hard.has(w));
    const mediumHardOverlap = [...medium].filter((w) => hard.has(w));

    expect(easyMediumOverlap).toHaveLength(0);
    expect(easyHardOverlap).toHaveLength(0);
    expect(mediumHardOverlap).toHaveLength(0);
  });

  it("WPD-02b: common — no duplicates within each tier", () => {
    const pack = loadWordPack("common");
    expect(pack.tiers).toBeDefined();

    for (const tier of ["easy", "medium", "hard"] as const) {
      const words = pack.tiers![tier];
      const unique = new Set(words);
      expect(unique.size).toBe(words.length);
    }
  });

  it("WPD-02c: common — flat words array contains no duplicates", () => {
    const pack = loadWordPack("common");
    const unique = new Set(pack.words);
    expect(unique.size).toBe(pack.words.length);
  });

  it("WPD-02d: animals — no cross-tier or intra-tier duplicates", () => {
    const pack = loadWordPack("animals");
    expect(pack.tiers).toBeDefined();

    const easy = new Set(pack.tiers!.easy);
    const medium = new Set(pack.tiers!.medium);
    const hard = new Set(pack.tiers!.hard);

    expect([...easy].filter((w) => medium.has(w))).toHaveLength(0);
    expect([...easy].filter((w) => hard.has(w))).toHaveLength(0);
    expect([...medium].filter((w) => hard.has(w))).toHaveLength(0);

    for (const tier of ["easy", "medium", "hard"] as const) {
      const words = pack.tiers![tier];
      expect(new Set(words).size).toBe(words.length);
    }
  });

  it("WPD-02e: food — no cross-tier or intra-tier duplicates", () => {
    const pack = loadWordPack("food");
    expect(pack.tiers).toBeDefined();

    const easy = new Set(pack.tiers!.easy);
    const medium = new Set(pack.tiers!.medium);
    const hard = new Set(pack.tiers!.hard);

    expect([...easy].filter((w) => medium.has(w))).toHaveLength(0);
    expect([...easy].filter((w) => hard.has(w))).toHaveLength(0);
    expect([...medium].filter((w) => hard.has(w))).toHaveLength(0);

    for (const tier of ["easy", "medium", "hard"] as const) {
      const words = pack.tiers![tier];
      expect(new Set(words).size).toBe(words.length);
    }
  });

  it("WPD-02f: all other categories — no cross-tier or intra-tier duplicates", () => {
    for (const cat of ALL_CATEGORIES) {
      const pack = loadWordPack(cat);
      expect(pack.tiers).toBeDefined();

      const easy = new Set(pack.tiers!.easy);
      const medium = new Set(pack.tiers!.medium);
      const hard = new Set(pack.tiers!.hard);

      expect([...easy].filter((w) => medium.has(w))).toHaveLength(0);
      expect([...easy].filter((w) => hard.has(w))).toHaveLength(0);
      expect([...medium].filter((w) => hard.has(w))).toHaveLength(0);

      for (const tier of ["easy", "medium", "hard"] as const) {
        const words = pack.tiers![tier];
        expect(new Set(words).size).toBe(words.length);
      }

      // flat array no duplicates
      expect(new Set(pack.words).size).toBe(pack.words.length);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WPD-03: Dealing algorithm — 6 players × 8 rounds = 48 words, ≥ 52 remain
// ─────────────────────────────────────────────────────────────────────────────
describe("WPD-03: Dealing algorithm — 6 players × 8 rounds = 48 words", () => {
  const PLAYERS = 6;
  const ROUNDS = 8;
  const TOTAL_DEALT = PLAYERS * ROUNDS;

  it("WPD-03a: common — 48 words dealt across 6p×8r, ≥ 52 remain", () => {
    const pack = loadWordPack("common");
    expect(pack.words.length).toBeGreaterThanOrEqual(TOTAL_DEALT + 52);

    const used = new Set<string>();
    for (let round = 0; round < ROUNDS; round++) {
      const dealt = pickUniqueWords("common", PLAYERS, used);
      expect(dealt.length).toBe(PLAYERS);
      // All dealt words must be unique within this round
      expect(new Set(dealt).size).toBe(PLAYERS);
      // None of the dealt words should be in the used set
      dealt.forEach((w) => expect(used.has(w)).toBe(false));
      dealt.forEach((w) => used.add(w));
    }

    expect(used.size).toBe(TOTAL_DEALT);
    const remaining = pack.words.length - used.size;
    expect(remaining).toBeGreaterThanOrEqual(52);
  });

  it("WPD-03b: common — no word is dealt to two different players in the same round", () => {
    for (let trial = 0; trial < 10; trial++) {
      const used = new Set<string>();
      const dealt = pickUniqueWords("common", PLAYERS, used);
      const unique = new Set(dealt);
      expect(unique.size).toBe(PLAYERS);
    }
  });

  it("WPD-03c: animals — 48 words dealt without exhausting pool", () => {
    const pack = loadWordPack("animals");
    expect(pack.words.length).toBeGreaterThanOrEqual(TOTAL_DEALT + 52);

    const used = new Set<string>();
    for (let round = 0; round < ROUNDS; round++) {
      const dealt = pickUniqueWords("animals", PLAYERS, used);
      expect(dealt.length).toBe(PLAYERS);
      expect(new Set(dealt).size).toBe(PLAYERS);
      dealt.forEach((w) => expect(used.has(w)).toBe(false));
      dealt.forEach((w) => used.add(w));
    }

    const remaining = pack.words.length - used.size;
    expect(remaining).toBeGreaterThanOrEqual(52);
  });

  it("WPD-03d: food — 48 words dealt without exhausting pool", () => {
    const pack = loadWordPack("food");
    expect(pack.words.length).toBeGreaterThanOrEqual(TOTAL_DEALT + 52);

    const used = new Set<string>();
    for (let round = 0; round < ROUNDS; round++) {
      const dealt = pickUniqueWords("food", PLAYERS, used);
      expect(dealt.length).toBe(PLAYERS);
      expect(new Set(dealt).size).toBe(PLAYERS);
      dealt.forEach((w) => expect(used.has(w)).toBe(false));
      dealt.forEach((w) => used.add(w));
    }

    const remaining = pack.words.length - used.size;
    expect(remaining).toBeGreaterThanOrEqual(52);
  });

  it("WPD-03e: all other categories — 48 words dealt without exhausting pool", () => {
    for (const cat of ALL_CATEGORIES) {
      const pack = loadWordPack(cat);
      expect(pack.words.length).toBeGreaterThanOrEqual(TOTAL_DEALT + 52);

      const used = new Set<string>();
      for (let round = 0; round < ROUNDS; round++) {
        const dealt = pickUniqueWords(cat as any, PLAYERS, used);
        expect(dealt.length).toBe(PLAYERS);
        expect(new Set(dealt).size).toBe(PLAYERS);
        dealt.forEach((w) => expect(used.has(w)).toBe(false));
        dealt.forEach((w) => used.add(w));
      }

      const remaining = pack.words.length - used.size;
      expect(remaining).toBeGreaterThanOrEqual(52);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WPD-04: Tier distribution — mixed dealing produces all three tiers
// ─────────────────────────────────────────────────────────────────────────────
describe("WPD-04: Tier distribution — mixed dealing produces all three tiers", () => {
  it("WPD-04a: common — flat word list covers all three tiers", () => {
    const pack = loadWordPack("common");
    expect(pack.tiers).toBeDefined();

    const tierWords = new Set([
      ...pack.tiers!.easy,
      ...pack.tiers!.medium,
      ...pack.tiers!.hard,
    ]);
    const flatWords = new Set(pack.words);

    // Every tier word should appear in the flat list
    for (const w of tierWords) {
      expect(flatWords.has(w)).toBe(true);
    }
  });

  it("WPD-04b: common — tier-specific dealing returns only tier words", () => {
    const pack = loadWordPack("common");
    expect(pack.tiers).toBeDefined();

    const easySet = new Set(pack.tiers!.easy);
    const mediumSet = new Set(pack.tiers!.medium);
    const hardSet = new Set(pack.tiers!.hard);

    const easyDealt = pickUniqueWords("common", 5, new Set(), "easy");
    easyDealt.forEach((w) => expect(easySet.has(w)).toBe(true));

    const mediumDealt = pickUniqueWords("common", 5, new Set(), "medium");
    mediumDealt.forEach((w) => expect(mediumSet.has(w)).toBe(true));

    const hardDealt = pickUniqueWords("common", 5, new Set(), "hard");
    hardDealt.forEach((w) => expect(hardSet.has(w)).toBe(true));
  });

  it("WPD-04c: common — each tier has at least 1 word", () => {
    const pack = loadWordPack("common");
    expect(pack.tiers).toBeDefined();
    expect(pack.tiers!.easy.length).toBeGreaterThan(0);
    expect(pack.tiers!.medium.length).toBeGreaterThan(0);
    expect(pack.tiers!.hard.length).toBeGreaterThan(0);
  });

  it("WPD-04d: all categories — each has tiers defined with at least 1 word each", () => {
    for (const cat of ALL_CATEGORIES) {
      const pack = loadWordPack(cat);
      expect(pack.tiers).toBeDefined();
      expect(pack.tiers!.easy.length).toBeGreaterThan(0);
      expect(pack.tiers!.medium.length).toBeGreaterThan(0);
      expect(pack.tiers!.hard.length).toBeGreaterThan(0);

      // flat list covers all tier words
      const tierWords = new Set([
        ...pack.tiers!.easy,
        ...pack.tiers!.medium,
        ...pack.tiers!.hard,
      ]);
      const flatWords = new Set(pack.words);
      for (const w of tierWords) {
        expect(flatWords.has(w)).toBe(true);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WPD-05: Multi-session — words not repeated within a session
// ─────────────────────────────────────────────────────────────────────────────
describe("WPD-05: Multi-session word uniqueness", () => {
  it("WPD-05a: common — 3 consecutive sessions, no word repeated within a session", () => {
    const SESSIONS = 3;
    const PLAYERS = 6;
    const ROUNDS_PER_SESSION = 5;

    for (let session = 0; session < SESSIONS; session++) {
      const sessionUsed = new Set<string>();
      for (let round = 0; round < ROUNDS_PER_SESSION; round++) {
        const dealt = pickUniqueWords("common", PLAYERS, sessionUsed);
        expect(dealt.length).toBe(PLAYERS);
        // Within a session, no repeats
        dealt.forEach((w) => {
          expect(sessionUsed.has(w)).toBe(false);
          sessionUsed.add(w);
        });
      }
      // By end of session, used words count should be sessions×rounds×players
      expect(sessionUsed.size).toBe(PLAYERS * ROUNDS_PER_SESSION);
    }
  });

  it("WPD-05b: common — pool supports at least 3 full sessions (5 rounds × 6 players = 30 words each)", () => {
    const pack = loadWordPack("common");
    const WORDS_PER_SESSION = 6 * 5; // 30
    expect(pack.words.length).toBeGreaterThanOrEqual(WORDS_PER_SESSION * 3); // 90
  });

  it("WPD-05c: all categories — multi-session uniqueness within session", () => {
    const SESSIONS = 3;
    const PLAYERS = 6;
    const ROUNDS_PER_SESSION = 5;

    for (const cat of ALL_CATEGORIES) {
      for (let session = 0; session < SESSIONS; session++) {
        const sessionUsed = new Set<string>();
        for (let round = 0; round < ROUNDS_PER_SESSION; round++) {
          const dealt = pickUniqueWords(cat as any, PLAYERS, sessionUsed);
          expect(dealt.length).toBe(PLAYERS);
          dealt.forEach((w) => {
            expect(sessionUsed.has(w)).toBe(false);
            sessionUsed.add(w);
          });
        }
        expect(sessionUsed.size).toBe(PLAYERS * ROUNDS_PER_SESSION);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WPD-06: Edge case — category near 100 words: no index-out-of-bounds
// ─────────────────────────────────────────────────────────────────────────────
describe("WPD-06: Edge case — boundary conditions", () => {
  it("WPD-06a: common — requesting exactly (pool_size - 1) words does not crash", () => {
    const pack = loadWordPack("common");
    const count = pack.words.length - 1;
    expect(() => pickUniqueWords("common", count)).not.toThrow();
    const dealt = pickUniqueWords("common", count);
    expect(dealt.length).toBe(count);
  });

  it("WPD-06b: common — requesting exactly pool_size words does not crash", () => {
    const pack = loadWordPack("common");
    expect(() => pickUniqueWords("common", pack.words.length)).not.toThrow();
  });

  it("WPD-06c: common — requesting more than pool_size returns count words with repetition (no crash)", () => {
    const pack = loadWordPack("common");
    const over = pack.words.length + 10;
    const dealt = pickUniqueWords("common", over);
    expect(dealt.length).toBe(over);
  });

  it("WPD-06d: invalid category throws a clear error, not index-out-of-bounds", () => {
    expect(() => pickUniqueWords("not_a_real_category" as any, 5)).toThrow(/unknown category/i);
  });

  it("WPD-06e: category with exactly 100 words — deal 48 words without crash or index overflow", () => {
    // All categories have 100+ words; pick the smallest and verify 48-deal works
    const smallest = ALL_CATEGORIES
      .map((cat) => ({ cat, len: loadWordPack(cat).words.length }))
      .sort((a, b) => a.len - b.len)[0];

    expect(smallest.len).toBeGreaterThanOrEqual(100);

    const used = new Set<string>();
    const PLAYERS = 6;
    const ROUNDS = 8; // 48 words total
    for (let round = 0; round < ROUNDS; round++) {
      expect(() => pickUniqueWords(smallest.cat as any, PLAYERS, used)).not.toThrow();
      const dealt = pickUniqueWords(smallest.cat as any, PLAYERS, used);
      dealt.forEach((w) => used.add(w));
    }
    expect(used.size).toBe(PLAYERS * ROUNDS);
  });
});
