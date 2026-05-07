# Sprint 13 Plan — Issue Cleanup (P2/P3)

> Sprint: 13
> Started: 2026-05-07
> Points: 3
> Branch: feat/sprint-13-cleanup
> Objective: Close 3 follow-up issues filed after Sprint 12 (#12, #13, #14)

## Tasks

| Task | Issue | Title | Points | Status |
|------|-------|-------|--------|--------|
| KTH-T-085 | #12 | RoomShare URL builder pure-extract + tests | 1 | DONE |
| KTH-T-086 | #13 | Spy renderLobby shim in lobby.js | 1 | DONE |
| KTH-T-087 | #14 | Strictness UI control in draw-guess lobby | 1 | DONE |

## Approach

- Issue #12 — Avoid pulling in jsdom for client-test infrastructure (too much for 1 pt).
  Instead refactor `getRoomURL` to expose a pure `buildRoomURL(origin, pathname, code)` and
  test that in node. Add CommonJS export so vitest can require the browser module.
- Issue #13 — Spy was calling a non-existent `window.renderLobby`. Two options: refactor spy
  to use `SharedLobby` class API (invasive) OR add a `renderLobby` shim in `lobby.js` that
  wraps `SharedLobby` and memoizes per-container instance (less invasive). Picked the shim.
- Issue #14 — Add 3-button radiogroup (`เข้มงวด` / `ปกติ` / `ผ่อนปรน`) in draw-guess lobby
  config panel. Wire CONFIG message + active-state sync from CONFIG_UPDATED.

## Out of scope

- Adding jsdom/happy-dom test infrastructure (deferred until client-test ROI is higher)
- Refactoring spy to use SharedLobby class directly (shim is sufficient for v1.1)
- Strictness UI for the OTHER 5 games (none of them use fuzzy matching yet)

## Definition of Done

- 549 → 557+ tests, all passing
- Issues #12, #13, #14 closed via PR reference
- TypeScript clean
- CI Unit + Smoke + CodeRabbit green
- PR rebase-merged with `mergedAt` verified per Lesson #3
