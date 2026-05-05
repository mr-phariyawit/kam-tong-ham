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

/** Built-in wordpacks directory (inside Docker image / dist) */
const BUILTIN_DIR = path.resolve(__dirname, "..", "data", "wordpacks");

/** Custom wordpacks directory (persisted outside Docker, survives redeploy) */
const CUSTOM_DIR = process.env.CUSTOM_WORDPACKS_DIR
  || path.resolve(process.env.HOME || "/tmp", ".kam-tong-ham", "wordpacks");

// Ensure custom directory exists
if (!fs.existsSync(CUSTOM_DIR)) {
  fs.mkdirSync(CUSTOM_DIR, { recursive: true });
}

/**
 * Load a word pack from built-in OR custom directory.
 * Custom packs override built-in packs with same ID.
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

  // Custom packs take priority over built-in
  const customPath = path.join(CUSTOM_DIR, `${categoryId}.json`);
  const builtinPath = path.join(BUILTIN_DIR, `${categoryId}.json`);
  const filePath = fs.existsSync(customPath) ? customPath : builtinPath;

  const raw = fs.readFileSync(filePath, "utf-8");
  const pack: WordPack = JSON.parse(raw);
  wordPackCache.set(categoryId, pack);
  return pack;
}

/**
 * Save a custom word pack. Clears cache so it reloads on next use.
 */
export function saveWordPack(pack: WordPack): void {
  const filePath = path.join(CUSTOM_DIR, `${pack.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(pack, null, 2), "utf-8");
  wordPackCache.delete(pack.id);
  allowedCategoriesCache = null; // force rescan
}

/**
 * Delete a custom word pack. Cannot delete built-in packs.
 */
export function deleteWordPack(categoryId: string): boolean {
  const customPath = path.join(CUSTOM_DIR, `${categoryId}.json`);
  if (fs.existsSync(customPath)) {
    fs.unlinkSync(customPath);
    wordPackCache.delete(categoryId);
    allowedCategoriesCache = null;
    return true;
  }
  return false; // built-in packs cannot be deleted
}

/**
 * Check if a category is custom (editable) or built-in.
 */
export function isCustomPack(categoryId: string): boolean {
  return fs.existsSync(path.join(CUSTOM_DIR, `${categoryId}.json`));
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
 * Get list of all available category IDs (built-in + custom, deduplicated).
 */
export function getAvailableCategories(): string[] {
  const builtinFiles = fs.existsSync(BUILTIN_DIR)
    ? fs.readdirSync(BUILTIN_DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""))
    : [];
  const customFiles = fs.existsSync(CUSTOM_DIR)
    ? fs.readdirSync(CUSTOM_DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""))
    : [];
  return [...new Set([...customFiles, ...builtinFiles])];
}

/** Return the custom wordpacks directory path (for API info). */
export function getCustomDir(): string {
  return CUSTOM_DIR;
}
