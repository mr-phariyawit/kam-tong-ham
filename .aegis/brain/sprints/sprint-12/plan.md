# Sprint 12 Plan — Finish Share-by-URL

> Sprint start: 2026-05-07
> Target: 8 story points
> Objective: Complete per-game auto-join wiring + QR room sharing for all 6 games

## Scope

### Bucket 1 — Per-game auto-join wiring (5 pts)
| Task | Game | Points | Status | Notes |
|------|------|--------|--------|-------|
| KTH-T-077 | forbidden-word | 1 | TODO | Fix `?room=` to `?join=`, add prefill+showScreen |
| KTH-T-078 | word-link | 1 | DONE | Already has `?join=` auto-join (Sprint 11 carryover) |
| KTH-T-079 | spy | 1 | TODO | Add URLSearchParams deep-link to init() |
| KTH-T-080 | werewolf | 1 | TODO | Add URLSearchParams deep-link to init() |
| KTH-T-081 | knights | 1 | TODO | Add URLSearchParams deep-link to setupEvents() |

### Bucket 2 — QR generation (3 pts)
| Task | Description | Points | Status |
|------|-------------|--------|--------|
| KTH-T-082 | Vendor MIT QR library | 1 | TODO |
| KTH-T-083 | Shared roomShare.js + roomShare.css | 1 | TODO |
| KTH-T-084 | Wire Share button into all 6 lobbies | 1 | TODO |

## Discovery (Scan)
- word-link already has auto-join wired (Sprint 11)
- forbidden-word has deep link but uses `?room=` instead of `?join=` — needs standardization
- spy, werewolf, knights have no auto-join at all
- forbidden-word has a canvas-text "QR" placeholder, not a real QR code
- No QR library currently vendored

## Risk
- Low risk: pattern is well-established from draw-guess reference impl
- QR library: must be MIT/BSD, no copyleft
