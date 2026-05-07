# Sprint 12 Close — Finish Share-by-URL

> Closed: 2026-05-07T12:56:06Z
> Duration: single session
> Velocity: 8/8 pts (100%)

## Delivered

### Bucket 1: Per-game auto-join (5 pts)
All 6 games now support `?join=XXXX` deep links:
- draw-guess: already had it (Sprint 11 reference)
- word-link: already had it (Sprint 11)
- forbidden-word: fixed from `?room=` to `?join=` with backward compat
- spy: new URLSearchParams deep-link added to init()
- werewolf: new URLSearchParams deep-link added to init()
- knights: new URLSearchParams deep-link added after setupEvents()

### Bucket 2: QR room sharing (3 pts)
- Vendored qrcode-generator v1.4.4 (MIT, ~21KB SVG-capable)
- Shared roomShare.js: modal with SVG QR + room code + copy-link
- Shared roomShare.css: theme-neutral, inherits lobby.css vars
- All 6 game lobbies have "📱 แชร์ห้อง / Share" button

## Metrics
- Tests: 549/549 (no change, server-side only)
- CI: Unit + Smoke + CodeRabbit all pass
- PR: #11, merged at 2026-05-07T12:56:06Z
- Commits: 3 (plan, auto-join, QR)
- Files changed: 18 (added 3, modified 15)

## Observations
- word-link was already complete from Sprint 11 (1pt free)
- forbidden-word had `?room=` param — standardized to `?join=` for cross-game consistency
- spy has a dead `window.renderLobby` call (lobby renders empty) — not in scope but noted
- Knights has a different boot pattern (no DOMContentLoaded guard) — worked fine

## Sprint 13 Recommendation
The share-by-URL feature is now complete across all 6 games.
Recommended next: pause autonomous chain pending HQ-001 deploy decision.
Potential Sprint 13 items if continuing:
- Fix spy lobby rendering (dead renderLobby call)
- Performance: lazy-load Colyseus per game instead of eager script tag
- UX: add room expiry indicator in lobby
