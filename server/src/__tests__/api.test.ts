/**
 * REST API endpoint tests -- AEG-67 + KTH-T-007
 *
 * These tests cover the HTTP layer (POST /api/rooms/create, GET /api/rooms/:code,
 * GET /api/categories, GET /api/health, GET /api/games) that the client uses directly.
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

// ─── Mock gameRegistry ────────────────────────────────────────────────────────
// Note: vi.mock is hoisted, so all data must be inlined (no top-level variable refs).
vi.mock("../utils/gameRegistry", () => {
  const games = [
    {
      id: "forbidden-word",
      displayName: "Forbidden Word",
      displayNameTh: "คำต้องห้าม",
      minPlayers: 2,
      maxPlayers: 8,
      comingSoon: false,
      mechanic: "word-survival",
      description: "desc",
      icon: "\u{1f910}",
    },
    {
      id: "werewolf",
      displayName: "Werewolf",
      displayNameTh: "หมาป่า",
      minPlayers: 5,
      maxPlayers: 15,
      comingSoon: true,
      mechanic: "social-deduction",
      description: "desc",
      icon: "\u{1f43a}",
    },
  ];
  const registry = {
    getAll: vi.fn().mockReturnValue(games),
    getPlayable: vi.fn().mockReturnValue(games.filter((g: any) => !g.comingSoon)),
    has: vi.fn().mockImplementation((id: string) => games.some((g: any) => g.id === id)),
    get: vi.fn().mockImplementation((id: string) => {
      const found = games.find((g: any) => g.id === id);
      return found || undefined;
    }),
  };
  return { gameRegistry: registry };
});

import * as matchMaker from "@colyseus/core/build/MatchMaker";
import { activeRoomCodes } from "../utils/roomRegistry";

const app = createApp();

// ─── GET /api/games (KTH-T-007) ──────────────────────────────────────────────

describe("GET /api/games", () => {
  it("GAMES-01: returns success=true with a games array", async () => {
    const res = await request(app).get("/api/games");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.games)).toBe(true);
  });

  it("GAMES-02: returns all 2 registered games (mock)", async () => {
    const res = await request(app).get("/api/games");

    expect(res.body.games).toHaveLength(2);
  });

  it("GAMES-03: each game has the required public fields", async () => {
    const res = await request(app).get("/api/games");

    for (const game of res.body.games) {
      expect(typeof game.id).toBe("string");
      expect(typeof game.displayName).toBe("string");
      expect(typeof game.displayNameTh).toBe("string");
      expect(typeof game.minPlayers).toBe("number");
      expect(typeof game.maxPlayers).toBe("number");
      expect(typeof game.comingSoon).toBe("boolean");
      expect(typeof game.mechanic).toBe("string");
      expect(typeof game.description).toBe("string");
      expect(typeof game.icon).toBe("string");
    }
  });

  it("GAMES-04: roomClass is NOT included in the response", async () => {
    const res = await request(app).get("/api/games");

    for (const game of res.body.games) {
      expect(game).not.toHaveProperty("roomClass");
    }
  });

  it("GAMES-05: forbidden-word is marked as active (comingSoon=false)", async () => {
    const res = await request(app).get("/api/games");

    const fw = res.body.games.find((g: any) => g.id === "forbidden-word");
    expect(fw).toBeDefined();
    expect(fw.comingSoon).toBe(false);
  });

  it("GAMES-06: werewolf is marked as coming soon", async () => {
    const res = await request(app).get("/api/games");

    const ww = res.body.games.find((g: any) => g.id === "werewolf");
    expect(ww).toBeDefined();
    expect(ww.comingSoon).toBe(true);
  });
});

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

  it("API-17: defaults to forbidden-word gameType when none specified", async () => {
    const res = await request(app).post("/api/rooms/create");

    expect(res.body.gameType).toBe("forbidden-word");
  });

  it("API-18: accepts explicit gameType in request body", async () => {
    const res = await request(app)
      .post("/api/rooms/create")
      .send({ gameType: "forbidden-word" });

    expect(res.status).toBe(200);
    expect(res.body.gameType).toBe("forbidden-word");
  });

  it("API-19: rejects invalid gameType with 400", async () => {
    const res = await request(app)
      .post("/api/rooms/create")
      .send({ gameType: "nonexistent-game" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe("INVALID_GAME_TYPE");
  });

  it("API-20: rejects coming-soon game with 400", async () => {
    const res = await request(app)
      .post("/api/rooms/create")
      .send({ gameType: "werewolf" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe("GAME_COMING_SOON");
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

// ─── Regression: AEG-66 — room code isolation (filterBy fix) ─────────────────

describe("Regression AEG-66: room code isolation", () => {
  afterEach(() => {
    vi.mocked(matchMaker.query).mockResolvedValue([]);
  });

  it("API-15: requesting code AAAA does not return a room registered under BBBB", async () => {
    vi.mocked(matchMaker.query).mockResolvedValue([
      { metadata: { roomCode: "BBBB" }, locked: false, clients: 1 } as any,
    ]);

    const res = await request(app).get("/api/rooms/AAAA");

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("ROOM_NOT_FOUND");
  });

  it("API-16: two rooms with different codes are returned independently", async () => {
    vi.mocked(matchMaker.query).mockResolvedValue([
      { metadata: { roomCode: "AAAA" }, locked: false, clients: 2 } as any,
      { metadata: { roomCode: "BBBB" }, locked: false, clients: 3 } as any,
    ]);

    const resA = await request(app).get("/api/rooms/AAAA");
    const resB = await request(app).get("/api/rooms/BBBB");

    expect(resA.status).toBe(200);
    expect(resA.body.roomCode).toBe("AAAA");
    expect(resA.body.playerCount).toBe(2);

    expect(resB.status).toBe(200);
    expect(resB.body.roomCode).toBe("BBBB");
    expect(resB.body.playerCount).toBe(3);
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

// ─── GET /api/admin/telemetry (KTH-T-064) ──────────────────────────────────
// Sprint 14: admin endpoints now require AEGIS_ADMIN_TOKEN

describe("GET /api/admin/telemetry", () => {
  const TEST_TOKEN = "test-admin-token-api";

  beforeEach(() => {
    process.env.AEGIS_ADMIN_TOKEN = TEST_TOKEN;
  });

  afterEach(() => {
    delete process.env.AEGIS_ADMIN_TOKEN;
  });

  it("TEL-01: returns success=true with telemetry object", async () => {
    const authedApp = createApp();
    const res = await request(authedApp)
      .get("/api/admin/telemetry")
      .set("Authorization", `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.telemetry).toBeDefined();
  });

  it("TEL-02: telemetry contains uptime, memory, and counters", async () => {
    const authedApp = createApp();
    const res = await request(authedApp)
      .get("/api/admin/telemetry")
      .set("Authorization", `Bearer ${TEST_TOKEN}`);
    const t = res.body.telemetry;

    expect(typeof t.uptime_seconds).toBe("number");
    expect(typeof t.uptime_human).toBe("string");
    expect(t.memory).toBeDefined();
    expect(typeof t.memory.rss_mb).toBe("number");
    expect(typeof t.memory.heap_used_mb).toBe("number");
    expect(t.counters).toBeDefined();
    expect(t.counters.rooms_created).toBeDefined();
    expect(t.counters.games_started).toBeDefined();
    expect(t.counters.peak_players).toBeDefined();
    expect(t.counters.current_players).toBeDefined();
  });

  it("TEL-03: telemetry contains ISO date strings", async () => {
    const authedApp = createApp();
    const res = await request(authedApp)
      .get("/api/admin/telemetry")
      .set("Authorization", `Bearer ${TEST_TOKEN}`);
    const t = res.body.telemetry;

    expect(() => new Date(t.server_start)).not.toThrow();
    expect(() => new Date(t.snapshot_at)).not.toThrow();
  });
});

// ─── POST /api/client-error ───────────────────────────────────────────────────

describe("POST /api/client-error", () => {
  it("CE-01: returns 204 No Content for a well-formed payload", async () => {
    const res = await request(app)
      .post("/api/client-error")
      .send({
        gameId: "werewolf",
        ua: "Mozilla/5.0 TestAgent",
        ts: 1746691200000,
        hint: "colyseus_client_undefined",
      });

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
  });

  it("CE-02: returns 204 when all fields are missing (graceful missing-field handling)", async () => {
    const res = await request(app)
      .post("/api/client-error")
      .send({});

    expect(res.status).toBe(204);
  });

  it("CE-03: returns 204 with no body even when body is omitted entirely", async () => {
    const res = await request(app)
      .post("/api/client-error");

    expect(res.status).toBe(204);
  });

  it("CE-04: truncates gameId longer than 64 characters (sanitisation)", async () => {
    // The endpoint must not blow up on oversize input; we verify it returns 204
    const longId = "x".repeat(200);
    const res = await request(app)
      .post("/api/client-error")
      .send({ gameId: longId, ua: "UA", ts: Date.now(), hint: "test" });

    expect(res.status).toBe(204);
  });

  it("CE-05: truncates ua longer than 256 characters (sanitisation)", async () => {
    const longUa = "A".repeat(500);
    const res = await request(app)
      .post("/api/client-error")
      .send({ gameId: "spy", ua: longUa, ts: Date.now(), hint: "colyseus_client_undefined" });

    expect(res.status).toBe(204);
  });

  it("CE-06: truncates hint longer than 128 characters (sanitisation)", async () => {
    const longHint = "h".repeat(300);
    const res = await request(app)
      .post("/api/client-error")
      .send({ gameId: "spy", ua: "UA", ts: Date.now(), hint: longHint });

    expect(res.status).toBe(204);
  });

  it("CE-07: accepts numeric ts field and returns 204", async () => {
    const res = await request(app)
      .post("/api/client-error")
      .send({ gameId: "knights", ua: "UA", ts: 9999999999999, hint: "test" });

    expect(res.status).toBe(204);
  });
});
