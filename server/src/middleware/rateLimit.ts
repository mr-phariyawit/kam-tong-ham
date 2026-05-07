/**
 * Per-IP rate limiter middleware -- Sprint 14 (KTH-T-089)
 *
 * Sliding-window in-memory rate limiter. No npm dependencies.
 * Inspired by DrawGuessRoom's stroke rate limiter (Loki M2).
 *
 * Behavior:
 * - Tracks request timestamps per IP in a Map<string, number[]>
 * - Window: 60 seconds, limit: 10 requests per window (configurable)
 * - Exceeding limit: 429 with Retry-After header
 * - Old entries are garbage-collected on each check
 *
 * IP source:
 * - If TRUST_PROXY=1 env var is set: reads X-Forwarded-For (Render injects this)
 * - Otherwise: uses req.ip / req.socket.remoteAddress
 *
 * @module rateLimit
 */

import type { Request, Response, NextFunction } from "express";

export interface RateLimitOptions {
  /** Max requests per window. Default: 10 */
  limit: number;
  /** Window size in milliseconds. Default: 60000 (1 minute) */
  windowMs: number;
}

const DEFAULT_OPTIONS: RateLimitOptions = {
  limit: 10,
  windowMs: 60_000,
};

/** In-memory store: IP -> array of request timestamps */
const ipTimestamps = new Map<string, number[]>();

/** GC interval: clean up stale IPs every 5 minutes */
let gcTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Get client IP, respecting TRUST_PROXY env var.
 */
function getClientIp(req: Request): string {
  if (process.env.TRUST_PROXY === "1") {
    const forwarded = req.headers["x-forwarded-for"];
    if (forwarded) {
      // X-Forwarded-For can be comma-separated; first is the client
      const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(",")[0].trim();
      if (first) return first;
    }
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}

/**
 * Create a rate-limiting middleware.
 */
export function rateLimit(opts?: Partial<RateLimitOptions>) {
  const { limit, windowMs } = { ...DEFAULT_OPTIONS, ...opts };

  // Start GC if not already running
  if (!gcTimer) {
    gcTimer = setInterval(() => {
      const now = Date.now();
      for (const [ip, timestamps] of ipTimestamps) {
        const filtered = timestamps.filter((t) => now - t < windowMs);
        if (filtered.length === 0) {
          ipTimestamps.delete(ip);
        } else {
          ipTimestamps.set(ip, filtered);
        }
      }
    }, 5 * 60_000);

    // Don't prevent process exit
    if (gcTimer.unref) gcTimer.unref();
  }

  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
    const ip = getClientIp(req);
    const now = Date.now();

    // Get or create timestamp array for this IP
    let timestamps = ipTimestamps.get(ip);
    if (!timestamps) {
      timestamps = [];
      ipTimestamps.set(ip, timestamps);
    }

    // Remove timestamps outside the window (sliding window cleanup)
    const cutoff = now - windowMs;
    while (timestamps.length > 0 && timestamps[0] <= cutoff) {
      timestamps.shift();
    }

    // Check if over limit
    if (timestamps.length >= limit) {
      // Calculate when the oldest request in window will expire
      const oldestInWindow = timestamps[0];
      const retryAfterMs = windowMs - (now - oldestInWindow);
      const retryAfterSec = Math.ceil(retryAfterMs / 1000);

      res.set("Retry-After", String(retryAfterSec));
      res.status(429).json({
        success: false,
        error: "Too many requests",
        retryAfter: retryAfterSec,
      });
      return;
    }

    // Record this request
    timestamps.push(now);
    next();
  };
}

/**
 * Reset the rate limit store (for testing).
 */
export function resetRateLimitStore(): void {
  ipTimestamps.clear();
}

/**
 * Stop the GC timer (for testing / clean shutdown).
 */
export function stopRateLimitGC(): void {
  if (gcTimer) {
    clearInterval(gcTimer);
    gcTimer = null;
  }
}
