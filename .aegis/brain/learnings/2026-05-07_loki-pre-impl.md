---
date: 2026-05-07
category: workflow
confidence: high
---
# Loki pre-implementation review beats post-implementation review for high-risk designs

## Context

Sprint 2 dispatched Loki *after* Spider-Man delivered the BaseRoom/BaseState foundation —
useful but framed as audit-after-the-fact. Findings (F2/F4a/F5/F6a) were valid but absorbing
them required spec patches and a follow-up sprint adjustment.

Sprint 5 (Werewolf) was the first to dispatch Loki BEFORE Spider-Man. The shift was driven by
the multi-phase, multi-role information-leak surface — too risky to discover late. Loki found
4 HIGH issues (atomic resolveNight, timing side-channel, reconnect leak, role-distribution
edge cases). All four were absorbed into the design before any code was written.

Sprints 6 (Knights) and 7 (Draw & Guess) repeated the pattern. Knights' `consecutiveRejections`
reconnect-safe field came from Loki H3. Draw & Guess's privacy model (current word stored in
private variable, never synced) came directly from Loki M1.

## Lesson

For features with hidden-info, multi-phase state, or new tech, dispatch the adversarial
reviewer (Loki) BEFORE implementation. Findings cost ~1 prompt to read and absorb if they land
during design; they cost ~1 sprint to absorb if they land after Spider-Man wrote the code.

## Application

When dispatching a Sprint with ANY of these flags, run Loki BEFORE the implementation wave:
- Hidden information (roles, words, private state)
- Multi-phase state machines (>3 phases)
- New tech for the codebase (canvas, audio, novel sync model)
- Reconnect surface area >0
- IP-adjacent (rules-only-clone of a copyrighted product)

For "boring" sprints (UI polish, refactors, regression-only), Loki post-impl is fine.
The cost of pre-impl Loki is one extra round-trip; the cost of post-impl is sometimes a
respin.
