# Sprint 9 Close

> Closed: 2026-05-07
> Branch: feat/sprint-9-deploy
> PR: NOT YET OPENED (remote repo inaccessible -- see HQ-001)
> Points: 13/13 (100% local completion)
> Tests: 520/520 (514 unit + 6 smoke)

## Summary

Sprint 9 delivered all post-launch infrastructure locally:

### Deploy Config (KTH-T-055, 3pts)
- Multi-stage Dockerfile with health check
- render.yaml blueprint for one-click Render.com deployment
- .dockerignore updated for multi-stage build
- Docker build verified locally (image builds successfully)

### Documentation (KTH-T-056, 1pt)
- DEPLOYMENT.md: step-by-step for Render.com, Docker manual, and local dev
- Human-queue items: HQ-001 (deploy creds), HQ-002 (repo visibility), HQ-003 (tag push)

### Release Tag (KTH-T-057, 1pt)
- v1.0.0 tag created locally on main (5172e4c)
- RELEASE_NOTES_v1.0.0.md with full feature summary
- Push deferred: requires accessible remote repo (HQ-003)

### Smoke Tests (KTH-T-058..063, 8pts)
- 6 smoke playthrough tests (1 per game), all passing
- CI workflow split: unit tests (job 1) + smoke tests (job 2, depends on job 1)
- Tests cover full room lifecycle: create -> join -> play -> assert end state

### Bookkeeping Fixes (retro friction items)
- Sprint 2 close.md created retroactively (friction #5)
- Roadmap updated with Sprint 9-11 plan
- Backlog refreshed with post-launch candidates
- Decision audit: D-098..D-100 logged

## Blockers

The remote GitHub repo `mr-phariyawit/kam-tong-ham` is not accessible
from the current `gh` auth context (`phariyawitjiap-aeternix`). This blocks:
1. Pushing the feat/sprint-9-deploy branch
2. Opening a PR
3. Merging to main
4. Pushing the v1.0.0 tag
5. Deploying to Render.com (needs GitHub repo connection)

All 5 items are queued in `.aegis/brain/human-queue.md` (HQ-001..HQ-003).

## NOT Shipped (per retro Lesson #3)

Per the retrospective's Lesson #3 ("shipped must include merge, not just CI green"),
this sprint is NOT reported as "shipped" because the PR has not been merged.
The branch is ready, all tests pass, and Docker builds. But the merge gate (G6)
has not been cleared.

## Test Results

- Typecheck: PASS
- Build: PASS
- Unit tests: 514/514 PASS
- Smoke tests: 6/6 PASS
- Docker build: PASS (image builds, container untested due to sandbox)

## Decisions Logged

- D-098: Post-launch priority = Deploy + Tag + Smokes (judgment, 0.90)
- D-099: Host selection = Render.com free tier (judgment, 0.85)
- D-100: Sprint 9 scope = 13pts focused delivery (judgment, 0.85)
