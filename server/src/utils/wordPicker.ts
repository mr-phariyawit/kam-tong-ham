import * as fs from "fs";
import * as path from "path";

export interface WordPackTiers {
  easy: string[];
  medium: string[];
  hard: string[];
}

export interface WordPack {
  id: string;
  category: string;
  icon: string;
  difficulty: string;
  /** Flat word list — all tiers combined. Used for backward-compatible random picking. */
  words: string[];
  /** Optional tiered word lists for difficulty-aware dealing (AEG-37). */
  tiers?: WordPackTiers;
}

export type Difficulty = "easy" | "medium" | "hard" | "mixed";

const wordPackCache: Map<string, WordPack> = new Map();
let allowedCategoriesCache: Set<string> | null = null;

/**
 * Load a word pack from the data/wordpacks directory.
 * Validates categoryId against the allowlist to prevent path traversal.
 */
export function loadWordPack(categoryId: string): WordPack {
  if (wordPackCache.has(categoryId)) {
    return wordPackCache.get(categoryId)!;
  }

  if (!allowedCategoriesCache) {
    allowedCategoriesCache = new Set(getAvailableCategories());
  }
  if (!allowedCategoriesCache.has(categoryId)) {
    throw new Error(`Unknown category: ${categoryId}`);
  }

  const filePath = path.resolve(
    __dirname,
    "..",
    "data",
    "wordpacks",
    `${categoryId}.json`
  );
  const raw = fs.readFileSync(filePath, "utf-8");
  const pack: WordPack = JSON.parse(raw);
  wordPackCache.set(categoryId, pack);
  return pack;
}

/**
 * Pick `count` unique random words from a category.
 * Optionally exclude words already used in previous rounds.
 * Optionally filter by difficulty tier (defaults to "mixed" = all tiers).
 */
export function pickUniqueWords(
  categoryId: string,
  count: number,
  exclude: Set<string> = new Set(),
  difficulty: Difficulty = "mixed"
): string[] {
  const pack = loadWordPack(categoryId);

  let pool: string[];
  if (difficulty !== "mixed" && pack.tiers && pack.tiers[difficulty]) {
    pool = pack.tiers[difficulty];
  } else {
    pool = pack.words;
  }

  const available = pool.filter((w) => !exclude.has(w));

  if (available.length < count) {
    // If not enough words after exclusion, allow repeats from full pool
    return shuffleAndPick([...pool], count);
  }

  return shuffleAndPick(available, count);
}

function shuffleAndPick(arr: string[], count: number): string[] {
  if (count > arr.length) {
    // Pick with repetition when count exceeds pool size
    const result: string[] = [];
    for (let i = 0; i < count; i++) {
      result.push(arr[Math.floor(Math.random() * arr.length)]);
    }
    return result;
  }
  const shuffled = [...arr];
  // Fisher-Yates shuffle
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

/**
 * Get list of all available category IDs.
 */
export function getAvailableCategories(): string[] {
  const dir = path.resolve(__dirname, "..", "data", "wordpacks");
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(".json", ""));
}
