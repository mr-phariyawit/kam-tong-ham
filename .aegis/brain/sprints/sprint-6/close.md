# Sprint 6 Close -- Knights (อัศวิน)

> Closed: 2026-05-07
> Points: 15/15 delivered
> Branch: feat/sprint-6-knights (merged)
> PR: #5 (merged via rebase)
> CI: All green (install + typecheck + build + vitest)
> Main HEAD: 24cdad3

## Delivered

| ID | Title | Pts | Status |
|----|-------|-----|--------|
| KTH-T-034 | KnightsState schema | 2 | DONE |
| KTH-T-035 | KnightsRoom phase machine + role assignment | 3 | DONE |
| KTH-T-036 | Team proposal + approve/reject voting | 2 | DONE |
| KTH-T-037 | Mission success/fail secret voting + reveal | 2 | DONE |
| KTH-T-038 | Win conditions + assassin endgame guess | 2 | DONE |
| KTH-T-039 | Reconnect handling (no role/vote leak) | 1 | DONE |
| KTH-T-040 | Client UI (game.js + index.html + style.css) | 2 | DONE |
| KTH-T-041 | Test suite (70 tests) | 1 | DONE |

## Test Results

- Knights tests: 70 new tests
- Total suite: 441 tests, 0 failures
- Zero regressions on existing 371 tests

## Loki Review

Verdict: CONDITIONAL APPROVE (0 BLOCKER, 3 HIGH, 5 MEDIUM)
All HIGH items addressed in implementation:
- H1: Atomic mission vote resolution (no timing side-channel)
- H2: Reconnect sends only own role + phase context (no vote leaks)
- H3: consecutiveRejections in synced state (hammer rule persists)

## Key Design Decisions

1. Thai role names (Loki F2 IP-clean): ผู้นำอัศวิน, มือสังหาร, ที่ปรึกษา, สายลับฝ่ายชั่ว
2. Special roles scale: advisor/double-agent at 7+ players only
3. Mission 4 double-fail rule for 7+ players
4. Team votes public, mission votes secret/aggregated
5. Assassin gets 30s timeout; good wins on timeout/disconnect

## Sprint 7 Recommendation

Draw & Guess (วาดทาย) -- last new game on roadmap.
~13 pts estimated. Epic: KTH-E-008.
