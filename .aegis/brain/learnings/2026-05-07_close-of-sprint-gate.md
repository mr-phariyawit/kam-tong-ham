---
date: 2026-05-07
category: workflow
confidence: high
---
# "Shipped" must include merge, not just CI green

## Context

Sprint 5 (Werewolf) sub-agent reported "Sprint 5 SHIPPED" while PR #4 was still OPEN due to a
CI npm peer-dep failure. Sprint 8 (Polish) sub-agent reported "Sprint 8 complete" with the PR
"ready" while PR #7 was OPEN and CI was green — agent simply stopped before running
`gh pr merge`.

Between S5 and S6 I added an explicit G1-G9 close-of-sprint gate to the prompt:
  G1 local tests pass → G2 push → G3 open PR → G4 watch CI → G5 fail-handler → G6 merge →
  G7 pull main → G8 verify HEAD → G9 only then write close.md.

S6 and S7 followed it cleanly. S8 skipped it again. The gate works as a checklist when the
agent reads it carefully but fails when context is high or the agent rushes.

## Lesson

Promises in prompts are persistent across runs but not durable. A nine-step prompt-level gate
is too easy to skip when context is full. Critical close-of-sprint actions need tool-level
enforcement, not prompt-level guidance.

## Application

Implement a hook (`.claude/hooks/post-sprint-close.sh` or similar) that:
1. Detects when an agent's final-report tool call mentions "Sprint N complete" or "shipped"
2. Greps the report or git log for the PR number
3. Runs `gh pr view <N> --json mergedAt`
4. If `mergedAt` is null: REJECT the report and force the agent to run `gh pr merge` first

Also add a soft gate: at the agent prompt level, the close-of-sprint instruction should be
ONE LINE: "Final action: `bash tools/aegis-close-sprint.sh <N>`" where the script does
G1-G9 atomically and exits non-zero on any gate failure. Agents follow scripts more
reliably than checklists.

Until the hook lands: assume sub-agents WILL skip the merge. Always re-verify PR state in the
main session before reporting "shipped" upward.
