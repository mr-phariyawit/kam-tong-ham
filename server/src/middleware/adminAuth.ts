/**
 * Admin authentication middleware -- Sprint 14 (KTH-T-088)
 *
 * Gates /api/admin/* endpoints with a Bearer token check.
 * Token is read from the AEGIS_ADMIN_TOKEN environment variable.
 *
 * Behavior:
 * - Token unset/empty: 503 "admin disabled" (fail closed)
 * - Token missing from request header: 401
 * - Token incorrect: 401
 * - Token correct: pass through
 *
 * No body details on 401 (don't leak info).
 */

import type { Request, Response, NextFunction } from "express";

/**
 * Read the admin token from env. Returns empty string if unset.
 * Extracted for testability (tests can override env before calling).
 */
export function getAdminToken(): string {
  return process.env.AEGIS_ADMIN_TOKEN?.trim() || "";
}

/**
 * Express middleware: require valid AEGIS_ADMIN_TOKEN for admin routes.
 */
export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const token = getAdminToken();

  // Fail closed: if token is not configured, admin is disabled
  if (!token) {
    if (process.env.NODE_ENV !== "test") {
      console.warn("[adminAuth] AEGIS_ADMIN_TOKEN not set -- admin endpoints disabled");
    }
    res.status(503).json({ success: false, error: "admin disabled" });
    return;
  }

  // Extract Bearer token from Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).end();
    return;
  }

  const provided = authHeader.slice(7).trim();
  if (provided !== token) {
    res.status(401).end();
    return;
  }

  next();
}
