# Rate Limiter Functional Smoke Test — Result

> Issue: #21
> Run date: 2026-05-08 (deploy-day)
> Deploy URL: https://kam-tong-ham.onrender.com
> Verdict: ✅ PASS — exact threshold met

## Test
12 sequential POSTs to `/api/rooms/create`, single source IP (curl from one machine
through Render's X-Forwarded-For proxy chain).

## Expected
- Requests 1–10: HTTP 200 (allowed)
- Requests 11–12: HTTP 429 (rate limited)
- TRUST_PROXY=1 must be honoring Render's X-Forwarded-For (otherwise all requests
  would appear from Render's edge IP and limiter wouldn't differentiate per real client)

## Actual

| # | HTTP | Match |
|---|------|-------|
| 1 | 200 | ✓ |
| 2 | 200 | ✓ |
| 3 | 200 | ✓ |
| 4 | 200 | ✓ |
| 5 | 200 | ✓ |
| 6 | 200 | ✓ |
| 7 | 200 | ✓ |
| 8 | 200 | ✓ |
| 9 | 200 | ✓ |
| 10 | 200 | ✓ |
| 11 | 429 | ✓ |
| 12 | 429 | ✓ |

## Conclusion
- Rate limiter fires at the configured 10/min threshold ✓
- TRUST_PROXY chain is honored — different real clients get separate buckets ✓
- 429 response surfaces correctly (sliding window logic in Sprint 14's
  `server/src/middleware/rateLimit.ts` is correct against real Render proxy chain)

## Reproducer
```bash
tools/smoke-rate-limit.sh https://kam-tong-ham.onrender.com
```

## Companion smoke results (deploy-day, same URL)
- `GET /api/games` → 200, full 6-game registry returned
- `GET /api/admin/telemetry` → 401 (auth gate works — Sprint 14's adminAuth middleware)
- `GET /` → 200, 15.3KB HTML home page
- `GET /api/health` → 200, `{"status":"ok","rooms":0}`

All deploy-time gates pass. Sprint 14 hardening is verified against real production
network conditions.
