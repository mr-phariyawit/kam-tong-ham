/**
 * Server-side nickname filter.
 * Rejects offensive Thai and English terms on room join.
 *
 * Seed list covers the most common offensive terms; expand as needed.
 * All checks are case-insensitive and normalised (spaces stripped).
 */

const BLOCKED_TERMS_TH: string[] = [
  // Thai offensive terms
  "ไอสัตว์", "ไอ้สัตว์", "อีสัตว์", "มึง", "กู", "เย็ด", "เหี้ย", "ควาย",
  "สัตว์", "หน้าหี", "หน้าหิ", "ไอ้เหี้ย", "อีเหี้ย", "แม่ง", "ไอ้สัด",
  "อีสัด", "หี", "ควย", "สวาท", "อีดอก", "ไอ้ดอก", "เงี่ยน", "สำส่อน",
  "ชิบหาย", "บ้าหมา", "กระหรี่", "กะหรี่", "ไอ้บ้า", "อีบ้า", "ไอ้โง่",
  "อีโง่", "ทาส", "ขยะ", "ขยะมนุษย์", "หน้าหมา", "หน้าควาย",
];

const BLOCKED_TERMS_EN: string[] = [
  "fuck", "shit", "bitch", "asshole", "ass", "cunt", "dick", "pussy",
  "cock", "nigger", "nigga", "faggot", "fag", "whore", "slut", "bastard",
  "motherfucker", "mf", "wtf", "kys", "retard",
];

/** Normalise a string for comparison: lowercase, strip spaces and punctuation. */
function normalise(s: string): string {
  return s.toLowerCase().replace(/[\s\-_.]/g, "");
}

const BLOCKED_NORMALISED = new Set([
  ...BLOCKED_TERMS_TH.map(normalise),
  ...BLOCKED_TERMS_EN.map(normalise),
]);

/**
 * Returns true if the nickname contains any blocked term.
 */
export function isBlockedNickname(nickname: string): boolean {
  const norm = normalise(nickname);
  for (const term of BLOCKED_NORMALISED) {
    if (norm.includes(term)) return true;
  }
  return false;
}
