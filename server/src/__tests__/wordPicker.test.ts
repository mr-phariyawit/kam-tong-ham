import { describe, it, expect, beforeEach } from "vitest";
import { pickUniqueWords, getAvailableCategories, loadWordPack } from "../utils/wordPicker";

describe("pickUniqueWords", () => {
  // WP-01: Basic unique selection
  it("WP-01: returns requested count of distinct words", () => {
    const words = pickUniqueWords("common", 3);
    expect(words.length).toBe(3);
    const unique = new Set(words);
    expect(unique.size).toBe(3);
  });

  // WP-02: Max players, no duplicates
  it("WP-02: returns 8 distinct words for max player count", () => {
    const words = pickUniqueWords("common", 8);
    expect(words.length).toBe(8);
    const unique = new Set(words);
    expect(unique.size).toBe(8);
  });

  // WP-03: Excluded words not returned
  it("WP-03: does not return words in the exclusion set", () => {
    const pack = loadWordPack("common");
    const exclude = new Set([pack.words[0], pack.words[1]]);
    const words = pickUniqueWords("common", 3, exclude);
    expect(words.length).toBe(3);
    words.forEach((w) => expect(exclude.has(w)).toBe(false));
  });

  // WP-04: Count <= pack size returns exactly count
  it("WP-04: returns exactly count when count <= available words", () => {
    const words = pickUniqueWords("common", 5);
    expect(words.length).toBe(5);
  });

  // WP-05: Count > available after exclusion falls back
  it("WP-05: falls back to full pool when exclusion leaves too few words", () => {
    // common pack has 25 words — exclude 23 of them, request 5
    const pack = loadWordPack("common");
    const exclude = new Set(pack.words.slice(0, 23));
    const words = pickUniqueWords("common", 5, exclude);
    // Should return 5 words without crashing (may repeat since < 5 available)
    expect(words.length).toBe(5);
  });

  // WP-06: Randomness check — at least 2 different orderings in 10 calls
  it("WP-06: produces varied orderings across multiple calls", () => {
    const results = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const words = pickUniqueWords("common", 5);
      results.add(words.join(","));
    }
    // Expect at least 2 distinct orderings (very unlikely to be all same)
    expect(results.size).toBeGreaterThan(1);
  });

  // WP-07: All 10 categories supported
  it("WP-07: all available categories return non-empty arrays without error", () => {
    const categories = getAvailableCategories();
    expect(categories.length).toBe(10);
    categories.forEach((cat) => {
      const words = pickUniqueWords(cat, 2);
      expect(words.length).toBeGreaterThan(0);
    });
  });

  // WP-08: Count = 1
  it("WP-08: returns a single-element array when count is 1", () => {
    const words = pickUniqueWords("common", 1);
    expect(words.length).toBe(1);
    expect(typeof words[0]).toBe("string");
  });

  // WP-09: Cache works — calling same category twice produces consistent results
  it("WP-09: loads the same category multiple times without errors", () => {
    expect(() => {
      pickUniqueWords("common", 3);
      pickUniqueWords("common", 3);
    }).not.toThrow();
  });

  // WP-10: Count > full pack — DEFECT-001 (fixed)
  // EXPECTED: returns count words with repetition allowed, no crash
  it("WP-10: count > full pack returns requested count with repetition", () => {
    const words = pickUniqueWords("common", 30);
    expect(words.length).toBe(30);
  });
});

describe("getAvailableCategories", () => {
  it("returns exactly 10 categories", () => {
    const cats = getAvailableCategories();
    expect(cats.length).toBe(10);
  });

  it("returns known category IDs", () => {
    const cats = getAvailableCategories();
    expect(cats).toContain("common");
    expect(cats).toContain("animals");
    expect(cats).toContain("food");
  });
});

describe("loadWordPack", () => {
  it("throws on unknown category", () => {
    expect(() => loadWordPack("not_a_real_category")).toThrow();
  });

  it("returns a pack with id, category, icon, difficulty, and words array", () => {
    const pack = loadWordPack("common");
    expect(pack.id).toBeDefined();
    expect(pack.category).toBeDefined();
    expect(pack.icon).toBeDefined();
    expect(pack.difficulty).toBeDefined();
    expect(Array.isArray(pack.words)).toBe(true);
    expect(pack.words.length).toBeGreaterThan(0);
  });
});
