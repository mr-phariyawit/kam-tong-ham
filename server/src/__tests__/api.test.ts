/**
 * REST API endpoint tests — AEG-67
 *
 * These tests cover the HTTP layer (POST /api/rooms/create, GET /api/rooms/:code,
 * GET /api/categories, GET /api/health) that the client uses directly.
 * This layer was previously untested, allowing the "cannot create rooms" regression
 * to go undetected.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../app";

// ─── Mock the Colyseus matchMaker (used by GET /api/rooms/:code) ──────────────
vi.mock("@colyseus/core/build/MatchMaker", () => ({
  query: vi.fn().mockResolvedValue([]),
}));

// ─── Mock activeRoomCodes (shared module state) ───────────────────────────────
vi.mock("../utils/roomRegistry", () => ({
  activeRoomCodes: new Set<string>(),
}));

import * as matchMaker from "@colyseus/core/build/MatchMaker";
import { activeRoomCodes } from "../utils/roomRegistry";

const app = createApp();

// ─── POST /api/rooms/create ───────────────────────────────────────────────────

describe("POST /api/rooms/create", () => {
  beforeEach(() => {
    activeRoomCodes.clear();
  });

  it("API-01: returns success=true with a 4-character room code", async () => {
    const res = await request(app).post("/api/rooms/create");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.roomCode).toBe("string");
    expect(res.body.roomCode).toHaveLength(4);
  });

  it("API-02: room code contains only uppercase letters (no I or O)", async () => {
    const res = await request(app).post("/api/rooms/create");

    expect(res.body.roomCode).toMatch(/^[A-HJ-NP-Z]{4}$/);
  });

  it("API-03: room code is registered in activeRoomCodes after creation", async () => {
    const res = await request(app).post("/api/rooms/create");

    expect(activeRoomCodes.has(res.body.roomCode)).toBe(true);
  });

  it("API-04: two consecutive requests return different room codes", async () => {
    const res1 = await request(app).post("/api/rooms/create");
    const res2 = await request(app).post("/api/rooms/create");

    expect(res1.body.roomCode).not.toBe(res2.body.roomCode);
  });
});

// ─── GET /api/rooms/:roomCode ─────────────────────────────────────────────────

describe("GET /api/rooms/:roomCode", () => {
  afterEach(() => {
    vi.mocked(matchMaker.query).mockResolvedValue([]);
  });

  it("API-05: returns 404 when no active room has the given code", async () => {
    const res = await request(app).get("/api/rooms/ABCD");

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe("ROOM_NOT_FOUND");
  });

  it("API-06: returns 200 with room info when an active room exists", async () => {
    vi.mocked(matchMaker.query).mockResolvedValue([
      { metadata: { roomCode: "ABCD" }, locked: false, clients: 2 } as any,
    ]);

    const res = await request(app).get("/api/rooms/ABCD");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.roomCode).toBe("ABCD");
    expect(res.body.playerCount).toBe(2);
    expect(res.body.maxPlayers).toBe(8);
    expect(res.body.joinable).toBe(true);
  });

  it("API-07: normalises room code to uppercase before lookup", async () => {
    vi.mocked(matchMaker.query).mockResolvedValue([
      { metadata: { roomCode: "WXYZ" }, locked: false, clients: 1 } as any,
    ]);

    const res = await request(app).get("/api/rooms/wxyz");

    expect(res.status).toBe(200);
    expect(res.body.roomCode).toBe("WXYZ");
  });

  it("API-08: reports joinable=false when room is full (8 clients)", async () => {
    vi.mocked(matchMaker.query).mockResolvedValue([
      { metadata: { roomCode: "FULL" }, locked: false, clients: 8 } as any,
    ]);

    const res = await request(app).get("/api/rooms/FULL");

    expect(res.status).toBe(200);
    expect(res.body.joinable).toBe(false);
  });

  it("API-09: skips locked rooms (treats them as not found)", async () => {
    vi.mocked(matchMaker.query).mockResolvedValue([
      { metadata: { roomCode: "LOCK" }, locked: true, clients: 3 } as any,
    ]);

    const res = await request(app).get("/api/rooms/LOCK");

    expect(res.status).toBe(404);
  });
});

// ─── GET /api/categories ──────────────────────────────────────────────────────

describe("GET /api/categories", () => {
  it("API-10: returns success=true with a non-empty categories array", async () => {
    const res = await request(app).get("/api/categories");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.categories)).toBe(true);
    expect(res.body.categories.length).toBeGreaterThan(0);
  });

  it("API-11: each category has id, category, icon, difficulty, and wordCount", async () => {
    const res = await request(app).get("/api/categories");

    for (const cat of res.body.categories) {
      expect(typeof cat.id).toBe("string");
      expect(typeof cat.category).toBe("string");
      expect(typeof cat.icon).toBe("string");
      expect(typeof cat.difficulty).toBe("string");
      expect(typeof cat.wordCount).toBe("number");
      expect(cat.wordCount).toBeGreaterThan(0);
    }
  });
});

// ─── GET /api/health ──────────────────────────────────────────────────────────

describe("GET /api/health", () => {
  it("API-12: returns status=ok", async () => {
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("API-13: returns a numeric timestamp", async () => {
    const res = await request(app).get("/api/health");

    expect(typeof res.body.timestamp).toBe("number");
    expect(res.body.timestamp).toBeGreaterThan(0);
  });

  it("API-14: returns a numeric rooms count", async () => {
    const res = await request(app).get("/api/health");

    expect(typeof res.body.rooms).toBe("number");
  });
});
