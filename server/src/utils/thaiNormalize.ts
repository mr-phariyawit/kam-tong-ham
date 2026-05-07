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
