# Sprint 7 Close -- Draw & Guess (วาดทาย)

> Closed: 2026-05-07
> Points: 13/13 delivered
> Branch: feat/sprint-7-draw-guess (merged)
> PR: #6 (merged via rebase)
> CI: All green (install + typecheck + build + vitest)
> Main HEAD: 1fc9f48

## Delivered

| ID | Title | Pts | Status |
|----|-------|-----|--------|
| KTH-T-042 | DrawGuessState schema | 1 | DONE |
| KTH-T-043 | DrawGuessRoom phase machine + word selection + drawer rotation | 2 | DONE |
| KTH-T-044 | Stroke broadcast + periodic snapshot relay | 2 | DONE |
| KTH-T-045 | Guess submission + Thai-normalized matching | 2 | DONE |
| KTH-T-046 | Round/scoring + game over logic | 1 | DONE |
| KTH-T-047 | Reconnect handling | 1 | DONE |
| KTH-T-048 | Client UI -- canvas, viewer mode, guess input | 3 | DONE |
| KTH-T-049 | Test suite (53 tests) | 1 | DONE |

## Test Results

- Draw & Guess tests: 53 new tests
- Total suite: 494 tests, 0 failures
- Zero regressions on existing 441 tests

## Loki Review

Verdict: CONDITIONAL APPROVE (0 BLOCKER, 2 HIGH, 4 MEDIUM, 2 LOW)
All findings addressed in implementation:
- H1: Force snapshot on reconnect (stale-on-join race)
- H2: Word in private variable only, never in synced state
- M1: Snapshot size cap (50KB with oldest-stroke truncation)
- M2: Stroke rate limiting (30msg/s)
- M3: Drawer disconnect = clean turn-end
- M4: Thai normalization (tone marks + thanthakhat stripped, vowels preserved)

## Architecture Decisions

1. D-098: Stroke sync -- broadcast-only deltas + periodic JSON snapshot (5s)
2. D-099: Guess matching -- normalized exact (strip tone marks + whitespace + thanthakhat)
3. Word pool: 12 drawable categories, easy+medium tiers, 900+ words
4. Canvas: pure HTML5 Canvas, no library dependency (keeps bundle zero-dep)
5. Scoring: DG-003 spec (first +3, second +2, third+ +1, drawer +1/correct)

## Milestone Achieved

M9: All 6 games playable
- Forbidden Word, Word Link, Spy, Werewolf, Knights, Draw & Guess
- Game registry: 0 coming-soon games remain
- Platform: 104/109 pts delivered (95%)

## Sprint 8 Recommendation

Polish + Performance (~5 pts):
- Fuzzy guess matching (Levenshtein for Thai)
- Performance: lazy-load game assets per route
- Reconnect leak audit across all 6 games
- Cross-game UI polish pass
- Final regression QA
- Defense timer for Werewolf (deferred from Sprint 5)
- Advanced roles for Werewolf/Knights (if time)
