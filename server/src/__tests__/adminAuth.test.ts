/**
 * Admin auth middleware tests -- Sprint 14 (KTH-T-088)
 *
 * 4 test cases:
 * - Token unset: 503 "admin disabled"
 * - Token wrong: 401
 * - Token missing header: 401
 * - Token correct: 200
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../app";

// ─── Mock Colyseus matchMaker ───────────────────────────────────
vi.mock("@colyseus/core/build/MatchMaker", () => ({
  query: vi.fn().mockResolvedValue([]),
}));

// ─── Mock activeRoomCodes ───────────────────────────────────────
vi.mock("../utils/roomRegistry", () => ({
  activeRoomCodes: new Set<string>(),
}));

// ─── Mock gameRegistry ──────────────────────────────────────────
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
  ];
  return {
    gameRegistry: {
      getAll: vi.fn().mockReturnValue(games),
      getPlayable: vi.fn().mockReturnValue(games),
      has: vi.fn().mockImplementation((id: string) => games.some((g) => g.id === id)),
      get: vi.fn().mockImplementation((id: string) => games.find((g) => g.id === id)),
    },
  };
});

describe("Admin Auth -- /api/admin/telemetry", () => {
  let originalToken: string | undefined;

  beforeEach(() => {
    originalToken = process.env.AEGIS_ADMIN_TOKEN;
  });

  afterEach(() => {
    // Restore original env
    if (originalToken === undefined) {
      delete process.env.AEGIS_ADMIN_TOKEN;
    } else {
      process.env.AEGIS_ADMIN_TOKEN = originalToken;
    }
  });

  it("AUTH-01: returns 503 when AEGIS_ADMIN_TOKEN is not set (admin disabled)", async () => {
    delete process.env.AEGIS_ADMIN_TOKEN;
    const app = createApp();
    const res = await request(app).get("/api/admin/telemetry");

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe("admin disabled");
  });

  it("AUTH-02: returns 401 when token is wrong", async () => {
    process.env.AEGIS_ADMIN_TOKEN = "correct-secret-token";
    const app = createApp();
    const res = await request(app)
      .get("/api/admin/telemetry")
      .set("Authorization", "Bearer wrong-token");

    expect(res.status).toBe(401);
  });

  it("AUTH-03: returns 401 when Authorization header is missing", async () => {
    process.env.AEGIS_ADMIN_TOKEN = "correct-secret-token";
    const app = createApp();
    const res = await request(app).get("/api/admin/telemetry");

    expect(res.status).toBe(401);
  });

  it("AUTH-04: returns 200 with telemetry when token is correct", async () => {
    process.env.AEGIS_ADMIN_TOKEN = "correct-secret-token";
    const app = createApp();
    const res = await request(app)
      .get("/api/admin/telemetry")
      .set("Authorization", "Bearer correct-secret-token");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.telemetry).toBeDefined();
  });
});
