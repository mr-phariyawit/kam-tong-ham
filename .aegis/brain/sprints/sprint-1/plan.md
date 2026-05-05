# Sprint 1 Plan — Test Stabilization + Wordpack Integration

> Sprint Start: 2026-05-05
> Sprint Duration: 5 days
> Sprint Goal: Get all tests green after wordpack expansion, stabilize disconnect logic

## Scope

| ID | Title | Pts | Priority | Assignee |
|----|-------|-----|----------|----------|
| KTH-T-001 | Fix wordPicker.test.ts category count (10->19) | 2 | high | @spider-man |
| KTH-T-002 | Fix disconnect.test.ts playerCount off-by-1 | 3 | high | @spider-man |
| KTH-T-003 | Validate 9 new wordpack JSON files | 2 | medium | @war-machine |

## Total: 7 story points

## Definition of Done
- All 172 tests pass (0 failures)
- No new regressions introduced
- All 19 wordpacks validated (structure + content)
- ISO docs regenerated for kam-tong-ham (not AEGIS boilerplate)

## Risks
- disconnect.test.ts failures may indicate a real bug in onLeave handler (not just test issue)
- New wordpacks may have content issues (duplicates, insufficient word count)
