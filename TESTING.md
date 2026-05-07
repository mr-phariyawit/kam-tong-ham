# Testing Guide

This project has three tiers of automated tests, plus a browser-based E2E layer.

## Test Tiers

### 1. Unit Tests (vitest)
```bash
npm test
```
614 tests covering server-side logic: room mechanics, schemas, scoring,
rate limiting, telemetry, reconnection, nickname filtering, etc.

### 2. Smoke Playthroughs (vitest)
```bash
npx vitest run server/src/__tests__/smoke.test.ts
```
Full game lifecycle for all 6 games using Colyseus testing utilities
(mock clients, not real browsers).

### 3. Adversarial E2E (vitest)
```bash
npx vitest run server/src/__tests__/adversarial/
```
35 tests covering race conditions, host transfer, vote races, disconnect
scenarios for Spy + Werewolf using mock Colyseus clients.

### 4. Browser E2E (Playwright) -- Sprint 18
```bash
npm run test:e2e
```
Real Chromium browser tests against a real local Colyseus server.
No mock clients, no vitest substitution. Tests exercise the full stack:
browser DOM -> WebSocket -> Colyseus server -> state sync -> browser DOM.

## Browser E2E Details

### What it tests
- **Fixture smoke** (5 tests): server health, API responses, page loads
- **Spy host transfer**: 3 browser tabs, host disconnects mid-game,
  game continues for remaining players
- **Werewolf vote race**: 5 browser tabs, simultaneous vote clicks,
  deterministic server resolution
- **Werewolf 5-player roles**: role-reveal screen shows correct distribution
  (1W + 1S + 0D + 3V per spec table)
- **Spy 8-player disconnect**: 8 tabs, one closes mid-discussion, other 7
  continue without client-side crash

### Running locally

```bash
# Standard (headless Chromium)
npm run test:e2e

# Headed mode (watch the browser)
E2E_HEADED=1 npm run test:e2e

# Debug a specific test
E2E_HEADED=1 npx playwright test e2e/spy-host-transfer.spec.ts

# Run with debug logging from server
E2E_DEBUG=1 npm run test:e2e
```

### How it works
1. `globalSetup` compiles TypeScript and starts `node server/dist/index.js`
   on a random free port
2. Each test creates N isolated browser contexts with CDN-intercepted
   Colyseus SDK (locally bundled for browser compatibility)
3. Tests interact with real DOM elements (clicks, form fills, screen waits)
4. `globalTeardown` kills the server process

### Architecture decisions
- **One worker**: multi-tab tests require sequential coordination
- **CDN intercept**: the client loads `colyseus.js@0.15` from unpkg, but the
  UMD bundle requires Node.js polyfills. We pre-bundle with esbuild
  (`e2e/fixtures/colyseus-browser.js`) and intercept the CDN request
- **Onboarding dismiss**: localStorage is pre-set to skip game tutorials
- **Dual lobby support**: tests handle both SharedLobby (Spy) and custom
  lobby (Werewolf) implementations

### CI
The `e2e-browser` job in `.github/workflows/ci.yml` runs after the
adversarial vitest job. Playwright Chromium is cached by package-lock hash
to avoid re-downloading on every run.

### Rebuilding the SDK bundle
If you upgrade `colyseus.js` in `package.json`:
```bash
npx esbuild e2e/fixtures/_bundle-entry.mjs \
  --bundle --format=iife --platform=browser --target=chrome100 \
  --outfile=e2e/fixtures/colyseus-browser.js
```
