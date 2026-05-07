---
date: 2026-05-07
category: testing
confidence: high
---
# Cross-game audits surface leaks that per-game audits miss

## Context

Each of Sprints 5/6/7 had a per-game Loki review covering reconnect leaks for that game's
state. All three games passed their own reviews. Sprint 8's brief was a *cross-game* reconnect
audit covering all 6 rooms (KhamTongHam, WordLink, Spy, Werewolf, Knights, DrawGuess) with a
unified threat model.

The audit found a real leak: `SpyPlayer.isSpy` and `SpyPlayer.role` were declared with
`@type("boolean")` and `@type("string")`, meaning Colyseus serialized them into the synced
state visible to *all* clients. Any non-spy player inspecting their client's state object
could have seen who the spy was. Per-game review of Spy in Sprint 4 missed it; per-game review
of every other game missed it because they didn't have analogous fields.

The fix was 2 lines (drop the `@type` decorators) plus 15 negative tests covering all 6 games
to prevent regression.

## Lesson

Per-component reviews build local correctness. Cross-component audits with a unified threat
model catch the seams. Reconnect, observability, error-handling, and identity all benefit from
periodic cross-cutting passes that ignore module boundaries.

## Application

After every N sprints (suggest N=3), schedule a cross-cutting audit on one of:
- **Reconnect leaks** (what does any reconnecting client receive that they shouldn't?)
- **Authorization** (does any state path skip the auth check?)
- **Logging/redaction** (do any logs persist private data?)
- **Error paths** (do any catches swallow privacy-relevant info into client errors?)

The audit prompt MUST enumerate *every* component in scope, not just the ones the auditor
remembers. Use a checklist generated from the file tree, not from memory.
