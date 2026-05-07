/**
 * Telemetry -- lightweight self-hosted metrics for kam-tong-ham.
 *
 * Storage: JSONL append to server/data/telemetry.log
 * No third-party deps. Designed for a single-instance free-tier deployment.
 *
 * Counters tracked:
 * - room_created (per gameType)
 * - game_started (per gameType)
 * - peak_players (per gameType, sliding window)
 * - server_heartbeat (uptime + memory, on interval)
 *
 * @module telemetry
 */

import fs from "fs";
import path from "path";

// ─── Configuration ────────────────────────────────────────────

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const TELEMETRY_FILE = path.join(DATA_DIR, "telemetry.log");
const CRASH_FILE = path.join(DATA_DIR, "crash.log");
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// ─── In-memory counters (reset on server restart) ─────────────

interface Counters {
  roomsCreated: Record<string, number>;
  gamesStarted: Record<string, number>;
  peakPlayers: Record<string, number>;
  currentPlayers: Record<string, number>;
}

const counters: Counters = {
  roomsCreated: {},
  gamesStarted: {},
  peakPlayers: {},
  currentPlayers: {},
};

const serverStartTime = Date.now();
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

// ─── File I/O ─────────────────────────────────────────────────

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function appendLine(filePath: string, data: Record<string, unknown>): void {
  try {
    ensureDataDir();
    const line = JSON.stringify({ ...data, ts: new Date().toISOString() }) + "\n";
    fs.appendFileSync(filePath, line, "utf-8");
  } catch (err) {
    // Telemetry must never crash the server
    console.error("[telemetry] write error:", err);
  }
}

// ─── Public API ───────────────────────────────────────────────

/**
 * Record a room creation event.
 */
export function recordRoomCreated(gameType: string): void {
  counters.roomsCreated[gameType] = (counters.roomsCreated[gameType] || 0) + 1;
  appendLine(TELEMETRY_FILE, { event: "room_created", gameType });
}

/**
 * Record a game start event (transition from LOBBY to playing).
 */
export function recordGameStarted(gameType: string, playerCount: number): void {
  counters.gamesStarted[gameType] = (counters.gamesStarted[gameType] || 0) + 1;
  appendLine(TELEMETRY_FILE, { event: "game_started", gameType, playerCount });
}

/**
 * Update current player count for a game type.
 * Tracks peak concurrent players per game type.
 */
export function updatePlayerCount(gameType: string, currentCount: number): void {
  counters.currentPlayers[gameType] = currentCount;
  if (currentCount > (counters.peakPlayers[gameType] || 0)) {
    counters.peakPlayers[gameType] = currentCount;
  }
}

/**
 * Record a crash/error event to crash.log.
 */
export function recordCrash(type: string, error: unknown): void {
  const errObj = error instanceof Error
    ? { message: error.message, stack: error.stack }
    : { message: String(error) };
  appendLine(CRASH_FILE, { event: "crash", type, ...errObj });
}

/**
 * Get current telemetry snapshot (for /api/admin/telemetry).
 */
export function getTelemetrySnapshot(): Record<string, unknown> {
  const uptimeMs = Date.now() - serverStartTime;
  const mem = process.memoryUsage();
  return {
    uptime_seconds: Math.round(uptimeMs / 1000),
    uptime_human: formatUptime(uptimeMs),
    memory: {
      rss_mb: Math.round(mem.rss / 1024 / 1024),
      heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
      heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024),
    },
    counters: {
      rooms_created: { ...counters.roomsCreated },
      games_started: { ...counters.gamesStarted },
      peak_players: { ...counters.peakPlayers },
      current_players: { ...counters.currentPlayers },
    },
    server_start: new Date(serverStartTime).toISOString(),
    snapshot_at: new Date().toISOString(),
  };
}

/**
 * Start the heartbeat logger (server uptime + memory every 5 min).
 * Call once at server startup.
 */
export function startHeartbeat(): void {
  if (heartbeatTimer) return; // already running
  heartbeatTimer = setInterval(() => {
    const mem = process.memoryUsage();
    appendLine(TELEMETRY_FILE, {
      event: "heartbeat",
      uptime_seconds: Math.round((Date.now() - serverStartTime) / 1000),
      rss_mb: Math.round(mem.rss / 1024 / 1024),
      heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
    });
  }, HEARTBEAT_INTERVAL_MS);

  // Don't prevent process exit
  if (heartbeatTimer.unref) {
    heartbeatTimer.unref();
  }
}

/**
 * Stop the heartbeat logger (for clean shutdown / tests).
 */
export function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

/**
 * Reset all in-memory counters (for testing).
 */
export function resetCounters(): void {
  counters.roomsCreated = {};
  counters.gamesStarted = {};
  counters.peakPlayers = {};
  counters.currentPlayers = {};
}

// ─── Install crash handlers ──────────────────────────────────

/**
 * Install global crash handlers (uncaughtException + unhandledRejection).
 * Call once at server startup. Logs to crash.log, then re-throws
 * for uncaughtException (process must exit) but swallows rejections.
 */
export function installCrashHandlers(): void {
  process.on("uncaughtException", (err) => {
    recordCrash("uncaughtException", err);
    console.error("[CRASH] uncaughtException:", err);
    // Let the process exit -- the crash is logged
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    recordCrash("unhandledRejection", reason);
    console.error("[CRASH] unhandledRejection:", reason);
    // Don't exit -- rejection is logged but not fatal
  });
}

// ─── Helpers ──────────────────────────────────────────────────

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${mins}m`);
  return parts.join(" ");
}
