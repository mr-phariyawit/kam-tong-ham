/**
 * Thai text normalization for Draw & Guess guessing.
 *
 * Normalizes Thai text for comparison by:
 * 1. Trimming + collapsing whitespace
 * 2. Removing Thai tone marks (mai ek, mai tho, mai tri, mai chattawa)
 * 3. Removing thanthakhat (silent consonant marker)
 * 4. Lowercasing (for any mixed Latin input)
 *
 * Does NOT collapse ใ/ไ -- they are distinct Thai vowels (Loki M4).
 *
 * @module thaiNormalize
 */

/**
 * Thai tone mark Unicode range:
 * - U+0E48: Mai ek (่)
 * - U+0E49: Mai tho (้)
 * - U+0E4A: Mai tri (๊)
 * - U+0E4B: Mai chattawa (๋)
 *
 * Thai thanthakhat (silent marker):
 * - U+0E4C: Thanthakhat (์)
 */
const THAI_TONE_MARKS_AND_SILENT = /[่้๊๋์]/g;

/**
 * Normalize Thai text for guess comparison.
 *
 * @param text - Raw guess input
 * @returns Normalized text suitable for exact comparison
 *
 * @example
 * normalizeThaiGuess("ผีเสื้อ") === normalizeThaiGuess("ผีเสื้อ") // true
 * normalizeThaiGuess(" แมว ") === normalizeThaiGuess("แมว")       // true
 * normalizeThaiGuess("Cat") === normalizeThaiGuess("cat")         // true
 */
export function normalizeThaiGuess(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, "") // collapse all whitespace
    .replace(THAI_TONE_MARKS_AND_SILENT, "") // strip tone marks + thanthakhat
    .toLowerCase(); // for any Latin mixing
}

/**
 * Check if a guess matches the target word (normalized comparison).
 *
 * @param guess - Player's guess text
 * @param targetWord - The correct word
 * @returns true if the normalized guess matches the normalized target
 */
export function isCorrectGuess(guess: string, targetWord: string): boolean {
  if (!guess || !targetWord) return false;
  return normalizeThaiGuess(guess) === normalizeThaiGuess(targetWord);
}

// ─── Fuzzy matching (Sprint 11 — KTH-T-071) ─────────────────────────────

/**
 * Compute Levenshtein edit distance between two strings (Unicode-codepoint-aware).
 *
 * Uses two-row dynamic programming for O(min(m,n)) memory.
 * Treats each Unicode codepoint as a single character (so Thai consonants and
 * vowels each count as 1 — important for fuzziness on multi-byte input).
 *
 * @param a - First string (already normalized recommended)
 * @param b - Second string (already normalized recommended)
 * @returns Number of single-character edits (insert/delete/substitute) to turn a into b
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const aChars = [...a]; // codepoint-aware split
  const bChars = [...b];
  if (aChars.length === 0) return bChars.length;
  if (bChars.length === 0) return aChars.length;

  let prev = new Array<number>(bChars.length + 1);
  let curr = new Array<number>(bChars.length + 1);
  for (let j = 0; j <= bChars.length; j++) prev[j] = j;

  for (let i = 1; i <= aChars.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= bChars.length; j++) {
      const cost = aChars[i - 1] === bChars[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,       // insertion
        prev[j] + 1,           // deletion
        prev[j - 1] + cost,    // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[bChars.length];
}

/**
 * Similarity score in [0, 1] between two strings, computed from Levenshtein
 * distance normalized by the longer string's length.
 *
 * 1.0 = identical (after Thai-aware normalization)
 * 0.0 = completely different
 *
 * @param guess - Player's guess text
 * @param targetWord - The correct word
 * @returns Score 0..1 after normalizeThaiGuess on both inputs
 */
export function similarityScore(guess: string, targetWord: string): number {
  if (!guess || !targetWord) return 0;
  const ng = normalizeThaiGuess(guess);
  const nt = normalizeThaiGuess(targetWord);
  if (ng === nt) return 1;
  const longer = Math.max([...ng].length, [...nt].length);
  if (longer === 0) return 1;
  const dist = levenshtein(ng, nt);
  return Math.max(0, 1 - dist / longer);
}

/**
 * Strictness levels for fuzzy guess matching. Maps to thresholds:
 * - strict:  exact normalized match only (1.0)
 * - normal:  ≥ 0.85 similarity (default — typo-tolerant but discriminating)
 * - lenient: ≥ 0.75 similarity (forgiving — accepts most near-misses)
 */
export type GuessStrictness = "strict" | "normal" | "lenient";

export const STRICTNESS_THRESHOLDS: Readonly<Record<GuessStrictness, number>> = {
  strict: 1.0,
  normal: 0.85,
  lenient: 0.75,
};

/**
 * Result of a fuzzy guess check.
 *
 * - `kind: "exact"`    — guess matched the target after normalization
 * - `kind: "near"`     — guess didn't match exactly but score ≥ threshold
 * - `kind: "wrong"`    — score below threshold
 */
export type GuessMatch =
  | { kind: "exact"; score: 1 }
  | { kind: "near"; score: number }
  | { kind: "wrong"; score: number };

/**
 * Check a guess against a target with strictness-based fuzzy matching.
 *
 * @param guess        - Player's raw guess text
 * @param targetWord   - The correct word
 * @param strictness   - Strictness preset (default: "normal")
 * @returns GuessMatch describing the result
 */
export function checkGuess(
  guess: string,
  targetWord: string,
  strictness: GuessStrictness = "normal",
): GuessMatch {
  if (!guess || !targetWord) {
    return { kind: "wrong", score: 0 };
  }
  if (isCorrectGuess(guess, targetWord)) {
    return { kind: "exact", score: 1 };
  }
  const threshold = STRICTNESS_THRESHOLDS[strictness];
  if (threshold >= 1.0) {
    // strict mode: only exact counts (already failed above)
    return { kind: "wrong", score: similarityScore(guess, targetWord) };
  }
  const score = similarityScore(guess, targetWord);
  return score >= threshold
    ? { kind: "near", score }
    : { kind: "wrong", score };
}
