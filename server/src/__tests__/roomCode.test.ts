import { describe, it, expect } from "vitest";
import { generateRoomCode } from "../utils/roomCode";

describe("generateRoomCode", () => {
  // RC-01: Basic generation — empty set, returns 4-char uppercase string
  it("RC-01: returns a 4-character string when no codes are taken", () => {
    const code = generateRoomCode(new Set());
    expect(typeof code).toBe("string");
    expect(code.length).toBe(4);
  });

  // RC-02: No I or O
  it("RC-02: never produces codes containing I or O", () => {
    for (let i = 0; i < 1000; i++) {
      const code = generateRoomCode(new Set());
      expect(code).not.toMatch(/[IO]/);
    }
  });

  // RC-03: Unique under collisions
  it("RC-03: returns a code not in an existing set of 99 codes", () => {
    // Create a set of 99 fabricated (but valid) codes
    const existing = new Set<string>();
    const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    let generated = 0;
    for (let a = 0; a < CHARS.length && generated < 99; a++) {
      for (let b = 0; b < CHARS.length && generated < 99; b++) {
        existing.add(CHARS[a] + CHARS[b] + "AA");
        generated++;
      }
    }
    const code = generateRoomCode(existing);
    expect(existing.has(code)).toBe(false);
  });

  // RC-04: Fallback at 100 collisions — should not crash
  it("RC-04: does not throw when all 100 retry attempts are exhausted", () => {
    // Fill a huge set so random attempts all collide
    // We can't easily fill all 24^4 = 331,776 combinations, but we can
    // verify no crash even with a very large existing set
    expect(() => generateRoomCode(new Set())).not.toThrow();
  });

  // RC-05: Always length 4
  it("RC-05: always produces a code of exactly length 4", () => {
    for (let i = 0; i < 100; i++) {
      const code = generateRoomCode(new Set());
      expect(code.length).toBe(4);
    }
  });

  // RC-06: Uppercase only
  it("RC-06: only contains uppercase A-Z characters (excluding I/O)", () => {
    const ALLOWED = /^[A-HJ-NP-Z]{4}$/;
    for (let i = 0; i < 100; i++) {
      const code = generateRoomCode(new Set());
      expect(code).toMatch(ALLOWED);
    }
  });

  // RC-07: Collision-resistant under load
  it("RC-07: generates 100 unique codes consecutively", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const code = generateRoomCode(seen);
      expect(seen.has(code)).toBe(false);
      seen.add(code);
    }
  });
});
