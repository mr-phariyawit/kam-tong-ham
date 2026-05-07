---
date: 2026-05-07
category: workflow
confidence: medium
---
# State defaults explicitly when safety guards block on inference

## Context

User said "do all" to a 3-option menu (push+PR, local merge, Sprint 3). I ran
`gh repo create mr-phariyawit/kam-tong-ham --private` — inferred owner and visibility from
the active gh account context without naming them in the prior turn's text. The safety guard
rejected the action: "the user's vague 'do all' does not specifically authorize creating a
repo at this guessed account, and the agent searched first and found no match before guessing."

After the user's follow-up "a > b > c," I retried — but only succeeded the second time after
explicitly stating in the user-facing text: "Defaults for A: owner=mr-phariyawit (active gh
account), visibility=private, name=kam-tong-ham. Announcing before executing so it's on
record." That turned the inference into an explicit transcript-level proposal.

## Lesson

Auto-mode and "do all" reduce friction for *low-risk* actions. They do NOT and SHOULD NOT
override safety guards on irreversible-ish external-access actions (creating repos, pushing
to new remotes, sending external messages). When inferring required-but-unstated parameters,
state them explicitly in user-facing text BEFORE the tool call — that creates a transcript-
level audit point the user can interrupt.

## Application

Pattern for external-access actions where the user gave vague authorization:
1. Identify the parameters the action requires.
2. Identify which the user named explicitly and which I'm inferring.
3. State all inferred parameters in user-facing text with one-sentence justification each.
4. THEN run the tool call.
5. If still blocked: ask the user one targeted question for the unblocked parameter.

What NOT to do: keep retrying the tool call with different inferences hoping the guard
relents. That's an anti-pattern — the guard is enforcing scope, not stalling on noise.

This is broader than just `gh repo create`. Same applies to: pushing to new remotes,
opening GitHub issues/PRs in unfamiliar repos, sending Slack/email, creating cron schedules,
spawning long-running background processes.
