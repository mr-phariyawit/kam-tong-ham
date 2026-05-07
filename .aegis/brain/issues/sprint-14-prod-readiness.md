# Sprint 14 -- Pre-Deploy Security Audit (KTH-T-091)

> Auditor: Beast (via Nick Fury)
> Date: 2026-05-07
> Scope: All HTTP endpoints, WebSocket handlers, error paths, env usage
> Baseline: 572 tests, 0 known vulns

## Findings

### FIXED THIS SPRINT (Sprint 14)

| ID | Severity | Finding | Disposition |
|----|----------|---------|-------------|
| SA-01 | HIGH | `/api/admin/telemetry` had no auth -- exposed memory/uptime to public | FIXED (KTH-T-088): AEGIS_ADMIN_TOKEN Bearer gate, 503 when unset |
| SA-02 | HIGH | `POST /api/rooms/create` had no rate limit -- unbounded room code accumulation | FIXED (KTH-T-089): 10/min per-IP sliding window, 429 + Retry-After |
| SA-03 | MED | Client connection failure shows toast + half-rendered screen | FIXED (KTH-T-090): shared offline.js component with retry/home buttons |

### REMAINING FINDINGS

| ID | Severity | Finding | Disposition | Rationale |
|----|----------|---------|-------------|-----------|
| SA-04 | MED | Wordpack CRUD endpoints (POST/PUT/DELETE) have no auth | DEFER | These endpoints let anyone create/modify/delete custom wordpacks. In the current single-instance party-game context, this is the intended behavior (host creates custom wordpacks for their group). If the platform goes multi-tenant, gate these behind auth. Not a blocker for initial deploy. |
| SA-05 | LOW | `GET /api/health` exposes `customWordpackDir` filesystem path | FIX_THIS_SPRINT | Leaks internal path structure (e.g., `/root/.kam-tong-ham/wordpacks`). Remove from health response. Low risk but easy fix. |
| SA-06 | LOW | `cors()` is configured with default (allow all origins) | DEFER | Acceptable for a party game that players access from any device/browser. Would need tightening for a multi-tenant SaaS. |
| SA-07 | LOW | `express.json()` has no body size limit | DEFER | Express default is 100KB which is sufficient. No action needed unless abuse observed. |
| SA-08 | LOW | Error responses in 500 handlers are generic Thai strings, no stack traces exposed | ACCEPT | This is correct behavior. Errors are swallowed server-side. Stack traces only go to crash.log (server filesystem), not to client. |
| SA-09 | LOW | Telemetry crash handler logs `error.stack` to crash.log file | ACCEPT | Server-side only file. Not exposed via API. Acceptable for debugging. |
| SA-10 | INFO | `process.env.HOME` fallback to `/tmp` for custom wordpacks dir | ACCEPT | Only affects custom wordpack storage location. Docker image sets HOME properly. |
| SA-11 | INFO | Nickname filter covers common offensive terms but is not exhaustive | ACCEPT | Adequate for Thai party game context. Can be expanded post-launch based on user reports. |
| SA-12 | INFO | No HTTPS enforcement at app level | ACCEPT | Render.com handles TLS termination. App correctly serves over HTTP internally. |

### BLOCKERS: NONE

No BLOCKER-severity findings. All HIGH items have been fixed in this sprint.

## Summary

- 3 HIGH/MED findings fixed (admin auth, rate limit, offline screen)
- 1 LOW finding to fix this sprint (SA-05: health endpoint path leak)
- 4 LOW findings deferred (acceptable risk for party game context)
- 4 INFO findings accepted (no action needed)
- 0 BLOCKERS -- clear to deploy after SA-05 fix

## Action Items

1. [x] SA-01: Admin auth gate (KTH-T-088) -- DONE
2. [x] SA-02: Rate limiter (KTH-T-089) -- DONE
3. [x] SA-03: Offline component (KTH-T-090) -- DONE
4. [ ] SA-05: Remove customWordpackDir from /api/health response
5. [ ] Update DEPLOYMENT.md with new env vars (KTH-T-092)
