/**
 * Rate limiter tests -- Sprint 14 (KTH-T-089)
 *
 * 3 test cases:
 * - Under limit: 200
 * - Over limit: 429 with Retry-After header
 * - After window reset: 200 again
 *
 * Plus: TRUST_PROXY behavior test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { resetRateLimitStore, stopRateLimitGC } from "../middleware/rateLimit";

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

describe("Rate Limiter -- POST /api/rooms/create", () => {
  beforeEach(() => {
    resetRateLimitStore();
  });

  afterEach(() => {
    resetRateLimitStore();
    stopRateLimitGC();
  });

  it("RATE-01: allows requests under the limit (200)", async () => {
    const app = createApp();
    const res = await request(app).post("/api/rooms/create");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("RATE-02: returns 429 with Retry-After when limit exceeded", async () => {
    const app = createApp();

    // Send 10 requests (the limit)
    for (let i = 0; i < 10; i++) {
      const r = await request(app).post("/api/rooms/create");
      expect(r.status).toBe(200);
    }

    // 11th request should be rate-limited
    const res = await request(app).post("/api/rooms/create");
    expect(res.status).toBe(429);
    expect(res.headers["retry-after"]).toBeDefined();
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe("Too many requests");
    expect(typeof res.body.retryAfter).toBe("number");
  });

  it("RATE-03: allows requests again after window resets", async () => {
    // Use a very short window for this test
    // We can't easily override the middleware's window in the integrated app,
    // so we test with the rate limit store directly:
    // After clearing the store, requests should work again.
    const app = createApp();

    // Exhaust the limit
    for (let i = 0; i < 10; i++) {
      await request(app).post("/api/rooms/create");
    }

    // Verify blocked
    const blocked = await request(app).post("/api/rooms/create");
    expect(blocked.status).toBe(429);

    // Reset store (simulates window expiry)
    resetRateLimitStore();

    // Should work again
    const res = await request(app).post("/api/rooms/create");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("RATE-04: respects X-Forwarded-For when TRUST_PROXY=1", async () => {
    const originalTrustProxy = process.env.TRUST_PROXY;
    process.env.TRUST_PROXY = "1";

    try {
      const app = createApp();

      // Send 10 requests from "IP-A"
      for (let i = 0; i < 10; i++) {
        await request(app)
          .post("/api/rooms/create")
          .set("X-Forwarded-For", "1.2.3.4");
      }

      // IP-A should be blocked
      const blockedA = await request(app)
        .post("/api/rooms/create")
        .set("X-Forwarded-For", "1.2.3.4");
      expect(blockedA.status).toBe(429);

      // IP-B should still work
      const okB = await request(app)
        .post("/api/rooms/create")
        .set("X-Forwarded-For", "5.6.7.8");
      expect(okB.status).toBe(200);
    } finally {
      if (originalTrustProxy === undefined) {
        delete process.env.TRUST_PROXY;
      } else {
        process.env.TRUST_PROXY = originalTrustProxy;
      }
    }
  });
});
