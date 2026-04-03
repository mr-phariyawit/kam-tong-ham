const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // Excluded I and O to avoid confusion

/**
 * Generate a unique 4-letter uppercase room code.
 * Checks against existing room codes to prevent collisions.
 */
export function generateRoomCode(existingCodes: Set<string>): string {
  const maxAttempts = 100;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let code = "";
    for (let i = 0; i < 4; i++) {
      code += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
    }
    if (!existingCodes.has(code)) {
      return code;
    }
  }
  // Fallback: generate longer code if all 4-letter codes tried
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
  }
  return code;
}
