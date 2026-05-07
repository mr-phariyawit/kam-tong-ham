# Sprint 16 Plan -- Mini-Sprint (Hard-Capped)

**Objective:** Two-item mini-sprint with strict discipline rules.
**Points:** 2 (1pt + 1pt)
**Wall-clock cap:** 120 minutes
**Branch:** feat/sprint-16-i18n-coldstart

## Tasks

| ID | Title | Points | Status | Owner |
|----|-------|--------|--------|-------|
| KTH-T-097 | i18n grep audit (audit-only) | 1 | TODO | Beast |
| KTH-T-098 | Cold-start loading-state UX | 1 | TODO | Spider-Man |

## Discipline Rules
1. 120-minute wall-clock cap, plan-to-merge.
2. Bucket B cut triggers: retry logic needed, error boundaries needed, scope expansion, >40 min budget.
3. Bucket A output = audit memo, NOT global string fix.
4. Test count target: 579+0 (at most +3 for loading component smoke).

## Acceptance Criteria
- `.aegis/brain/issues/sprint-16-i18n-audit.md` lists findings with file:line, english_string, suggested_thai, severity
- If HIGH < 10: inline-fix in this sprint. If HIGH >= 10: file GitHub Issue, defer.
- Cold-start overlay appears on page load, disappears on first /api/games response.
- Bilingual message on overlay.
