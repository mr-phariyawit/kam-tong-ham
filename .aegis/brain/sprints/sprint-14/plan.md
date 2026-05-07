# Sprint 14 -- Pre-Deploy Hardening

> Dates: 2026-05-07
> Points: 6 (5 tasks)
> Objective: Land security/ops fixes before HQ-001 production deploy

## Epic: KTH-E-014 -- Production Hardening

| Task | Title | Points | Assignee | Status |
|------|-------|--------|----------|--------|
| KTH-T-088 | Admin telemetry auth gate (AEGIS_ADMIN_TOKEN) | 1.5 | Spider-Man | TODO |
| KTH-T-089 | Room creation rate limiter (per-IP, in-memory) | 1.5 | Spider-Man | TODO |
| KTH-T-090 | Client offline screen (shared component) | 1.5 | Spider-Man | TODO |
| KTH-T-091 | Pre-deploy security audit memo | 1.0 | Beast | TODO |
| KTH-T-092 | DEPLOYMENT.md env var documentation | 0.5 | Coulson | TODO |

## Acceptance Criteria
- All tests pass (baseline 557, target >= 570 with new tests)
- No open BLOCKER in security audit
- DEPLOYMENT.md documents all new env vars
- Admin endpoint returns 503 when token unset, 401 on wrong token
- Room creation returns 429 on rate limit excess
- Offline component renders retry + home buttons on connection failure

## Dependencies
- None (all self-contained pre-deploy work)
- HQ-001 (Render deploy) still pending -- this sprint prepares for it

## Risks
- GAP D audit could surface a BLOCKER requiring scope expansion
  Mitigation: halt + escalate if BLOCKER found
