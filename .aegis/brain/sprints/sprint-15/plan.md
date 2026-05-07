# Sprint 15 -- Final Pre-Deploy Polish

> Dates: 2026-05-07
> Points: 5 (4 tasks)
> Objective: Last autonomous polish sprint before deploy -- perf baseline, reconnect resilience, lobby cleanup

## Epic: KTH-E-017 -- Final Polish

| Task | Title | Points | Assignee | Status |
|------|-------|--------|----------|--------|
| KTH-T-093 | Bundle size + cold-start benchmark | 1 | Spider-Man | TODO |
| KTH-T-094 | Multi-room load smoke script | 1 | Spider-Man | TODO |
| KTH-T-095 | Reconnect resilience test suite (6 games) | 2 | Spider-Man | TODO |
| KTH-T-096 | Refactor spy/game.js to use SharedLobby | 1 | Spider-Man | TODO |

## GAP A -- Performance Baseline (2 pts)

KTH-T-093: Bundle size + cold start
- Measure server cold start time (node server/dist/index.js -> first /api/health 200)
- Capture bundle sizes: client/ total, server/dist/ total
- Save to .aegis/brain/metrics/perf-baseline-2026-05-07.json

KTH-T-094: Multi-room load smoke
- Spin up 10 rooms across 6 game types using @colyseus/testing helpers
- 4 players per room, ~50 messages each
- Measure: peak heap, total messages, errors
- Append results to perf baseline file
- Document invocation in DEPLOYMENT.md "Performance" section

## GAP B -- Reconnect Resilience (2 pts)

KTH-T-095: Reconnect under server-restart simulation
- For each of 6 rooms: join, get token, disconnect mid-game, rejoin
- Verify state restoration correct + no info leak
- 6 new tests minimum

## GAP C -- Spy Lobby Refactor (1 pt)

KTH-T-096: Migrate spy/game.js from renderLobby shim to SharedLobby
- Replace window.renderLobby() with window.SharedLobby() constructor pattern
- Remove renderLobby shim from lobby.js
- Confirm no other references to window.renderLobby

## Acceptance Criteria
- All tests pass (baseline 572, target >= 578)
- Perf baseline JSON captured with actual numbers
- window.renderLobby shim removed, spy uses SharedLobby directly
- No regressions in existing reconnect-audit tests

## Dependencies
- HQ-001 (Render deploy) still pending -- this sprint captures pre-deploy metrics

## Risks
- Perf baseline numbers may reveal unexpected regressions (surface as HIGH)
