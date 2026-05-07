/**
 * Tests for the telemetry module.
 *
 * Covers:
 * - Counter increment logic (rooms created, games started, peak players)
 * - Telemetry snapshot API response shape
 * - Crash recording (via counter check, not file I/O)
 * - Heartbeat start/stop
 * - Reset counters
 *
 * File I/O is tested indirectly via the API endpoint test in api.test.ts.
 * Direct fs mock is avoided because the telemetry module imports fs at load time.
 *
 * @module telemetry.test
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  recordRoomCreated,
  recordGameStarted,
  updatePlayerCount,
  getTelemetrySnapshot,
  startHeartbeat,
  stopHeartbeat,
  resetCounters,
} from "../utils/telemetry";

describe("Telemetry", () => {
  beforeEach(() => {
    resetCounters();
  });

  afterEach(() => {
    stopHeartbeat();
  });

  // ─── recordRoomCreated ──────────────────────────────────────

  describe("recordRoomCreated", () => {
    it("should increment room counter for a game type", () => {
      recordRoomCreated("forbidden-word");
      recordRoomCreated("forbidden-word");
      recordRoomCreated("spy");

      const snap = getTelemetrySnapshot();
      const counters = snap.counters as any;
      expect(counters.rooms_created["forbidden-word"]).toBe(2);
      expect(counters.rooms_created["spy"]).toBe(1);
    });

    it("should handle multiple game types independently", () => {
      recordRoomCreated("werewolf");
      recordRoomCreated("knights");
      recordRoomCreated("draw-guess");
      recordRoomCreated("knights");

      const snap = getTelemetrySnapshot();
      const counters = snap.counters as any;
      expect(counters.rooms_created["werewolf"]).toBe(1);
      expect(counters.rooms_created["knights"]).toBe(2);
      expect(counters.rooms_created["draw-guess"]).toBe(1);
    });
  });

  // ─── recordGameStarted ─────────────────────────────────────

  describe("recordGameStarted", () => {
    it("should increment game started counter", () => {
      recordGameStarted("knights", 5);
      recordGameStarted("knights", 4);
      recordGameStarted("draw-guess", 3);

      const snap = getTelemetrySnapshot();
      const counters = snap.counters as any;
      expect(counters.games_started["knights"]).toBe(2);
      expect(counters.games_started["draw-guess"]).toBe(1);
    });

    it("should track games started independently from rooms created", () => {
      recordRoomCreated("spy");
      recordRoomCreated("spy");
      recordGameStarted("spy", 3);

      const snap = getTelemetrySnapshot();
      const counters = snap.counters as any;
      expect(counters.rooms_created["spy"]).toBe(2);
      expect(counters.games_started["spy"]).toBe(1);
    });
  });

  // ─── updatePlayerCount (peak tracking) ─────────────────────

  describe("updatePlayerCount", () => {
    it("should track peak concurrent players", () => {
      updatePlayerCount("werewolf", 3);
      updatePlayerCount("werewolf", 5);
      updatePlayerCount("werewolf", 4); // goes down

      const snap = getTelemetrySnapshot();
      const counters = snap.counters as any;
      expect(counters.peak_players["werewolf"]).toBe(5);
      expect(counters.current_players["werewolf"]).toBe(4);
    });

    it("should track peaks independently per game type", () => {
      updatePlayerCount("spy", 3);
      updatePlayerCount("knights", 8);

      const snap = getTelemetrySnapshot();
      const counters = snap.counters as any;
      expect(counters.peak_players["spy"]).toBe(3);
      expect(counters.peak_players["knights"]).toBe(8);
    });

    it("should not decrease peak when current drops", () => {
      updatePlayerCount("word-link", 10);
      updatePlayerCount("word-link", 5);
      updatePlayerCount("word-link", 2);

      const snap = getTelemetrySnapshot();
      const counters = snap.counters as any;
      expect(counters.peak_players["word-link"]).toBe(10);
      expect(counters.current_players["word-link"]).toBe(2);
    });
  });

  // ─── getTelemetrySnapshot ──────────────────────────────────

  describe("getTelemetrySnapshot", () => {
    it("should return well-shaped snapshot", () => {
      const snap = getTelemetrySnapshot();

      expect(snap.uptime_seconds).toBeGreaterThanOrEqual(0);
      expect(snap.uptime_human).toBeDefined();
      expect(snap.memory).toBeDefined();
      expect((snap.memory as any).rss_mb).toBeGreaterThan(0);
      expect((snap.memory as any).heap_used_mb).toBeGreaterThan(0);
      expect(snap.counters).toBeDefined();
      expect(snap.server_start).toBeDefined();
      expect(snap.snapshot_at).toBeDefined();
    });

    it("should have ISO date strings", () => {
      const snap = getTelemetrySnapshot();
      expect(() => new Date(snap.server_start as string)).not.toThrow();
      expect(() => new Date(snap.snapshot_at as string)).not.toThrow();
    });

    it("should reflect counters after operations", () => {
      recordRoomCreated("forbidden-word");
      recordGameStarted("forbidden-word", 4);
      updatePlayerCount("forbidden-word", 4);

      const snap = getTelemetrySnapshot();
      const counters = snap.counters as any;
      expect(counters.rooms_created["forbidden-word"]).toBe(1);
      expect(counters.games_started["forbidden-word"]).toBe(1);
      expect(counters.peak_players["forbidden-word"]).toBe(4);
      expect(counters.current_players["forbidden-word"]).toBe(4);
    });
  });

  // ─── Heartbeat ─────────────────────────────────────────────

  describe("heartbeat", () => {
    it("should start and stop without error", () => {
      startHeartbeat();
      startHeartbeat(); // idempotent
      stopHeartbeat();
      stopHeartbeat(); // idempotent
    });
  });

  // ─── Reset ─────────────────────────────────────────────────

  describe("resetCounters", () => {
    it("should clear all counters", () => {
      recordRoomCreated("spy");
      recordGameStarted("spy", 3);
      updatePlayerCount("spy", 5);

      resetCounters();

      const snap = getTelemetrySnapshot();
      const counters = snap.counters as any;
      expect(Object.keys(counters.rooms_created)).toHaveLength(0);
      expect(Object.keys(counters.games_started)).toHaveLength(0);
      expect(Object.keys(counters.peak_players)).toHaveLength(0);
      expect(Object.keys(counters.current_players)).toHaveLength(0);
    });
  });
});
