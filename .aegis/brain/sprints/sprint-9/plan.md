# Sprint 9 -- Post-Launch: Deploy + Tag + Smoke Tests

> Sprint: 9
> Start: 2026-05-07
> Duration: 1 sprint (focused)
> Total points: 13
> Theme: Get the platform live and verifiable

## Goals

1. **Deploy to public URL** -- Render.com (free tier, WebSocket support, Docker deploy)
2. **Tag v1.0.0** -- Official release with notes from S0-S8
3. **Smoke playthrough automation** -- 1 smoke test per game (6 total) in CI

## Tasks

| ID | Title | Points | Assignee | Status |
|----|-------|--------|----------|--------|
| KTH-T-055 | Render.com deploy config (render.yaml + Dockerfile update) | 3 | Spider-Man | TODO |
| KTH-T-056 | DEPLOYMENT.md with step-by-step instructions | 1 | Coulson | TODO |
| KTH-T-057 | Tag v1.0.0 + GitHub Release | 1 | Thor | TODO |
| KTH-T-058 | Smoke test: Forbidden Word (create room, join, play round, game over) | 1 | Vision | TODO |
| KTH-T-059 | Smoke test: Word Link (create room, 4 players, clue, guess, end) | 2 | Vision | TODO |
| KTH-T-060 | Smoke test: Spy (create room, 3 players, discussion, accuse, end) | 1 | Vision | TODO |
| KTH-T-061 | Smoke test: Werewolf (create room, 5 players, night+day, end) | 2 | Vision | TODO |
| KTH-T-062 | Smoke test: Knights (create room, 5 players, missions, end) | 1 | Vision | TODO |
| KTH-T-063 | Smoke test: Draw & Guess (create room, 3 players, draw+guess, end) | 1 | Vision | TODO |

## Acceptance Criteria

- [ ] render.yaml exists and passes `render validate` (or equivalent)
- [ ] Dockerfile builds and serves the app correctly
- [ ] DEPLOYMENT.md has clear step-by-step for human to deploy
- [ ] Human-queue item created for actual deploy credentials
- [ ] v1.0.0 tag exists locally (push deferred to human)
- [ ] 6 smoke tests pass locally
- [ ] CI workflow updated with separate "smoke" job
- [ ] All existing 514 tests still pass

## Deploy Decision Rationale

**Host: Render.com** (free tier Web Service)
- Free tier: 512MB RAM, 0.1 CPU -- sufficient for 5-50 concurrent users beta
- WebSocket support: native, no special config needed
- Docker deploy: push Dockerfile, Render builds and deploys
- Region: Oregon (US West) by default; Singapore available on paid tier
  - Loki S2 F4a (APAC <100ms RTT) partially addressed: Singapore upgrade path exists
  - For beta with Thai friends, Oregon RTT ~200ms is acceptable; upgrade to Singapore
    when real usage justifies paid tier ($7/mo)
- No credit card required for free tier
- Single service: server + static client in one container (Dockerfile already set up)
- Tradeoff: free tier spins down after 15 min inactivity (cold start ~30s)
  - Acceptable for beta; document in DEPLOYMENT.md

**Rejected alternatives:**
- Fly.io: Singapore region (ideal RTT), but requires credit card for free tier
- Railway: $5 credit/mo free, good UX, but no Singapore region
- Cloudflare Workers: No WebSocket server support (client-only CDN)
- Vercel: serverless only, no persistent WebSocket connections

## Loki Open Items Addressed

- S2 F4a (APAC region): Partially addressed. Render free tier = US West.
  Singapore available on paid tier. Documented as upgrade path.
  Full resolution deferred to Sprint 10 (when user count justifies cost).

## Sprint 8 Bookkeeping Cleanup (in planning commit)

- Remove stale `current` symlink (broken, pointing nowhere)
- Sprint-2 missing close.md: create retroactively from commit history
- .gitignore: runtime artifacts already covered
