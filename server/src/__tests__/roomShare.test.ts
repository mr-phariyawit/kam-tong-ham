/**
 * Tests for the shared roomShare client helper (Sprint 13 — Issue #12).
 *
 * The module is browser-targeted (uses window/document), but its URL-building
 * function `buildRoomURL` is pure and node-testable. This test suite covers
 * `buildRoomURL` directly and `getRoomURL` via a minimal `window.location`
 * mock — without pulling in jsdom.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";

// CJS require — the browser module also exposes module.exports for tests.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const roomShare = require(path.resolve(
  __dirname,
  "../../../client/shared/components/roomShare.js",
));

describe("roomShare.buildRoomURL (pure helper)", () => {
  it("RS-01: builds canonical URL from origin + pathname + code", () => {
    expect(roomShare.buildRoomURL("https://app.example", "/", "ABCD")).toBe(
      "https://app.example/?join=ABCD",
    );
  });

  it("RS-02: uppercases the room code", () => {
    expect(roomShare.buildRoomURL("https://app.example", "/", "abcd")).toBe(
      "https://app.example/?join=ABCD",
    );
    expect(roomShare.buildRoomURL("https://app.example", "/", "AbCd1234")).toBe(
      "https://app.example/?join=ABCD1234",
    );
  });

  it("RS-03: handles localhost origin with port", () => {
    expect(
      roomShare.buildRoomURL("http://localhost:3000", "/", "ROOM"),
    ).toBe("http://localhost:3000/?join=ROOM");
  });

  it("RS-04: preserves a non-root pathname", () => {
    expect(
      roomShare.buildRoomURL("https://app.example", "/games/foo/", "WXYZ"),
    ).toBe("https://app.example/games/foo/?join=WXYZ");
  });

  it("RS-05: defaults pathname to '/' if empty", () => {
    expect(roomShare.buildRoomURL("https://app.example", "", "WXYZ")).toBe(
      "https://app.example/?join=WXYZ",
    );
  });

  it("RS-06: empty/null/undefined room code becomes empty join param", () => {
    expect(roomShare.buildRoomURL("https://app.example", "/", "")).toBe(
      "https://app.example/?join=",
    );
    expect(roomShare.buildRoomURL("https://app.example", "/", null)).toBe(
      "https://app.example/?join=",
    );
    expect(roomShare.buildRoomURL("https://app.example", "/", undefined)).toBe(
      "https://app.example/?join=",
    );
  });

  it("RS-07: coerces non-string room code to string before uppercasing", () => {
    // Defensive — practical values would always be strings, but the helper
    // should never crash on a numeric code accidentally passed through.
    expect(roomShare.buildRoomURL("https://app.example", "/", 1234 as any)).toBe(
      "https://app.example/?join=1234",
    );
  });
});

describe("roomShare.getRoomURL (window-aware wrapper)", () => {
  const origWindow = (globalThis as any).window;

  beforeAll(() => {
    (globalThis as any).window = {
      location: { origin: "https://kam.example.com", pathname: "/" },
    };
  });

  afterAll(() => {
    if (origWindow === undefined) {
      delete (globalThis as any).window;
    } else {
      (globalThis as any).window = origWindow;
    }
  });

  it("RS-08: composes URL from window.location", () => {
    expect(roomShare.getRoomURL("hello")).toBe(
      "https://kam.example.com/?join=HELLO",
    );
  });
});
