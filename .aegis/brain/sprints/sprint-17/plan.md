# Sprint 17 Plan — Adversarial E2E Tests for Spy + Werewolf

**Sprint**: 17
**Dates**: 2026-05-08
**Objective**: Close Issue #18 — 4 adversarial integration test scenarios
**Points**: 8 pts (7 tasks)
**Branch**: feat/sprint-17-playwright-e2e

## Architectural Decision (D-105)

Tests run as vitest integration tests using the established Colyseus
matchMaker + mock-client pattern (same as spy.test.ts, werewolf.test.ts).
This is a server-only repo with no browser frontend, so Playwright
browser automation is not applicable. The mock-client pattern already
simulates concurrent WebSocket connections, which is what the adversarial
scenarios actually need to test.

Tests target LOCAL Colyseus instances (in-process via LocalDriver),
not the live production URL, avoiding rate-limiter conflicts.

## Tasks

| ID | Title | Pts | Dep |
|----|-------|-----|-----|
| KTH-T-099 | Shared adversarial test helpers (multi-client factory, clock utils) | 1 | - |
| KTH-T-100 | e2e/helpers — room lifecycle + state query utilities | 2 | T-099 |
| KTH-T-101 | spy-host-transfer.test.ts — mid-game host transfer consistency | 1 | T-100 |
| KTH-T-102 | werewolf-vote-race.test.ts — simultaneous vote race conditions | 1 | T-100 |
| KTH-T-103 | werewolf-5p-roles.test.ts — 5-player edge-case role distribution | 1 | T-100 |
| KTH-T-104 | spy-8p-disconnect.test.ts — 8-player disconnect mid-round | 1 | T-100 |
| KTH-T-105 | CI: adversarial job in ci.yml + test documentation | 1 | T-101..104 |

## Acceptance Criteria

- All 4 adversarial scenarios pass
- Existing 579 vitest tests still pass
- CI has dedicated adversarial test job
- Issue #18 closeable
