# Loki Adversarial Review: Sprint 5 -- Werewolf Design

> Reviewer: Loki (via Nick Fury inline review)
> Date: 2026-05-07
> Spec: WW-001..WW-004 in PLATFORM_SPEC_v2.md
> Verdict: CONDITIONAL -- 0 BLOCKERS, 4 HIGH, 5 MEDIUM

---

## 1. Phase Machine Correctness

### H1 (HIGH): Night action sequencing must be atomic

**Problem:** WW-002 says wolves vote, seer peeks, doctor saves -- but the spec
does not define the ORDER of resolution. If the server resolves wolf kill BEFORE
doctor save, the timing of the "save" message reveals to the doctor whether they
guessed right (even before morning). Similarly, if seer peek resolves before wolf
kill is finalized, a race condition could exist.

**Recommendation:** All three night actions (wolf vote, seer peek, doctor save)
must be collected independently and resolved SIMULTANEOUSLY at end-of-night.
The server holds all three in pending state, then runs a single `resolveNight()`
that computes: target = wolf vote target; saved = (doctor target === wolf target);
seerResult = (target role). Morning announcement is derived from this resolution.
No intermediate state is broadcast during night.

**Action:** Spider-Man implements `resolveNight()` as a single function called
when all actions are received OR night timer expires. No partial resolution.

### M1 (MEDIUM): Phase transition dead-end if all wolves disconnect

**Problem:** If all wolves disconnect during night, wolf vote never arrives.
What phase does the game enter? The night timer expires with no wolf vote --
does the game skip the kill? Does it auto-end?

**Recommendation:** If all wolves are disconnected at night resolution:
- No kill occurs (wolves forfeit their kill)
- Game still checks win conditions
- If wolves are still "alive" (just disconnected), treat as no-vote (skip kill)
- If wolves have been removed (timeout), village wins

**Action:** Handle in `resolveNight()` -- if wolfVoteTarget is empty, skip kill.

### M2 (MEDIUM): Phase loop diagram missing from spec

**Problem:** WW-001..004 lists phases but doesn't show the complete state machine.
The implementation must handle: LOBBY -> ROLE_REVEAL -> NIGHT -> DAY_ANNOUNCE ->
DAY_DISCUSSION -> DAY_VOTE -> (back to NIGHT or GAME_OVER). But what about
"no nomination" during day? What if nobody nominates? Timer expires and we go
straight to NIGHT without a vote?

**Recommendation:** Define explicit no-nomination path:
```
DAY_DISCUSSION (timer expires) + no nomination -> NIGHT (skip vote)
DAY_DISCUSSION + nomination -> DAY_VOTE -> resolve -> NIGHT or GAME_OVER
```
Both paths must be implemented.

---

## 2. Information Leak Surfaces

### H2 (HIGH): Timing attack on night actions

**Problem:** If the server transitions phases as soon as ALL actions are received
(wolf vote + seer peek + doctor save), the transition time reveals information.
E.g., if night ends quickly after wolves vote, other players can infer wolves
coordinated fast. Conversely, if it takes long, wolves might be deliberating.

**Recommendation:** Night has a FIXED timer (30 seconds per spec). The server
ALWAYS waits for the full timer regardless of when actions arrive. This prevents
all timing attacks. `resolveNight()` fires ONLY at timer expiry, never early.

Exception: if ALL alive players have submitted their night action (wolves voted,
seer peeked, doctor saved), the server MAY skip remaining timer to improve UX
-- but ONLY if this is configurable by host. Default: wait full timer.

**Action:** Implement fixed-duration night by default. Optional early-resolve
behind a host setting (off by default).

### H3 (HIGH): Reconnect during night must not leak action state

**Problem:** If a player reconnects during night, what do they see? If they're
a wolf, they need to see the wolf chat / vote target. If they're a villager,
they should see nothing. If they're the seer, they might have already peeked --
do they see the result again?

**Recommendation:**
- Reconnecting VILLAGER: sees night screen (moon), no actions, wait for dawn
- Reconnecting WOLF: sees wolf vote UI. If wolves already voted, show "waiting for dawn"
- Reconnecting SEER: if already peeked, show "waiting for dawn" (do NOT re-reveal result)
- Reconnecting DOCTOR: if already saved, show "waiting for dawn"
- CRITICAL: NEVER re-send seer peek results on reconnect -- the result is shown
  once during the night action phase and stored server-side. Re-sending could be
  intercepted or displayed at the wrong time.

**Action:** `onPlayerReconnected()` sends only the player's own role and current
phase. Night action results (seer peek) are sent exactly once during the action
phase and NOT cached for reconnect re-delivery. If seer reconnects after peeking,
they see "waiting for dawn" -- they already saw the result. If they reconnect
BEFORE peeking, they get the peek UI again.

### M3 (MEDIUM): Client-side state must not contain other players' roles

**Problem:** Colyseus syncs all state fields marked with `@type` to ALL clients.
If `WerewolfPlayer.role` is a `@type("string")` field, every client can read
every player's role in their state. This completely breaks the game.

**Recommendation:** The `role` field on WerewolfPlayer MUST be used carefully:
- Option A: Store role as a generic display string (e.g., "หมาป่า" only for
  the player themselves), send via private message, and set role="" on the
  shared state. Role reveal (after death/game over) sets it to the actual value.
- Option B: Use a separate server-side Map<sessionId, role> (like SpyRoom does
  with `playerRoles`) and never put the actual role in synced state until reveal.

SpyRoom already does Option B correctly (playerRoles is a private Map, isSpy is
on the synced player but that's a boolean only the spy sees as true). Werewolf
should follow the SAME pattern: store roles server-side, send via private message.

**Action:** WerewolfPlayer should NOT have `@type("string") role` as a synced field
that shows the actual role. Use `@type("string") revealedRole` that's empty until
death/game-over, and keep true roles in a server-side Map.

---

## 3. Role Distribution Edge Cases

### H4 (HIGH): 5-player game with no Doctor

**Problem:** WW-001 role table shows 5 players = 1W + 1S + 0D + 3V. But the
spec WW-002.4 says "Doctor: select a player to protect (if role active)". The
"if role active" qualifier is correct but the implementation must handle the
absent-doctor case cleanly: no doctor save during night, `resolveNight()` must
skip the doctor-save check, night timer must not wait for a doctor action that
will never come.

**Recommendation:** `resolveNight()` checks if doctor role exists among alive
players. If no doctor, immediately mark doctor action as "skipped" and don't
wait for it. Same applies if doctor dies mid-game -- subsequent nights skip
doctor entirely.

### M4 (MEDIUM): What if all seer/doctor die?

**Problem:** After the seer or doctor is killed, their night actions no longer
exist. The night phase must dynamically adjust: if only wolves remain as
"actors" in the night, the night is effectively just the wolf vote + fixed timer.

**Recommendation:** Each night, compute `activeNightRoles` = alive wolves +
alive seer + alive doctor. Night resolves when all active roles have acted
(or timer expires). Dead roles are automatically skipped.

---

## 4. Win Condition Edge Cases

### M5 (MEDIUM): Simultaneous last-wolf and last-villager elimination

**Problem:** WW-004.2 says "Werewolves win: wolves >= villagers". Consider:
3 alive (1W, 1S, 1V). Night: wolf kills seer. Now 2 alive (1W, 1V). Day:
village votes to eliminate wolf. Now 1 alive (1V). Village wins.

But what about: 2 alive (1W, 1V). Night: wolf kills villager. Now 1 alive (1W).
Wolf wins -- but do we even need a day phase? Win check after night kill should
catch this immediately.

Edge case: 2 alive (1W, 1D). Night: wolf targets doctor, doctor targets self.
If doctor saves self, nobody dies, 2 alive (1W, 1D). Day: village votes to
eliminate wolf. 1 alive (1D). Village wins. If doctor saves someone else (only
themselves to save), wolf kill goes through: 1 alive (1W). Wolf wins.

**Recommendation:** Check win conditions AFTER every state change:
1. After night resolution (kill applied)
2. After day vote elimination
3. After player disconnect/forfeit

Win check: count alive wolves vs alive non-wolves. If wolves >= non-wolves,
wolves win. If wolves === 0, village wins. Run this check synchronously
before transitioning to next phase.

---

## 5. Anti-Cheat Surface

### M6 (MEDIUM -- acknowledged low-priority for party game)

**Problem:** In a party game played on friends' phones, anti-cheat is low
priority. But one surface exists: if the server sends wolf-vote UI only to
wolves, a technically savvy player could check their WebSocket messages to
confirm they're NOT a wolf (by the absence of wolf-specific messages).

**Recommendation:** Send the same generic "night" message to all players. The
action panel shown is determined client-side based on the private ROLE_DATA
message. All players receive the same state transitions. The wolf vote UI,
seer peek UI, and doctor save UI are rendered locally based on the player's
known role -- the server does not send different phase messages to different
players (only private ROLE_DATA differs).

---

## 6. Spec Gaps

### G1: WW-003.3 says "any alive player can nominate" but doesn't cap nominations

**Problem:** Can a player spam nominations? Can the same player be nominated
multiple times in one day? The spec is silent.

**Recommendation:** One nomination per day phase. Once a nomination is made,
the vote begins immediately. If the vote fails (no majority), the day ends
and night begins. No second nominations.

Rationale: This is simpler and matches classic Werewolf rules (one vote per day).
Multiple nominations would add complexity without much gameplay value for a
party game format.

### G2: WW-003.4 "Nominated player can defend (15 seconds)" is a SHOULD

**Problem:** This is marked "Should" priority. Implementing a separate defense
timer adds a sub-phase between nomination and voting.

**Recommendation:** DEFER to Sprint 8 polish. For Sprint 5, nomination goes
directly to voting. The discussion timer already gives players time to defend
before nomination happens.

### G3: WW-001.4 "Host can choose role preset" is a SHOULD

**Problem:** Advanced roles (Hunter, Witch, Cupid, Bodyguard) and presets
add significant complexity. Each advanced role has unique night actions.

**Recommendation:** Sprint 5 implements BASIC preset only (Wolf, Seer, Doctor,
Villager). Advanced roles are deferred to a future sprint. The role assignment
table from WW-001 is sufficient for basic preset.

---

## Summary

| ID | Severity | Finding | Action |
|----|----------|---------|--------|
| H1 | HIGH | Night resolution must be atomic | Implement resolveNight() as single function |
| H2 | HIGH | Timing attack via night duration | Fixed night timer, resolve at expiry only |
| H3 | HIGH | Reconnect during night leaks | Send own role only, no re-delivery of results |
| H4 | HIGH | 5-player no-doctor case | Skip doctor in resolveNight() when absent |
| M1 | MEDIUM | All wolves disconnect | Skip kill, check win conditions |
| M2 | MEDIUM | No-nomination path | DAY_DISCUSSION timer expiry -> NIGHT |
| M3 | MEDIUM | Synced role field leaks | Use server-side role map, not @type field |
| M4 | MEDIUM | Dead seer/doctor nights | Compute activeNightRoles dynamically |
| M5 | MEDIUM | Simultaneous elimination | Check win after every state change |
| M6 | MEDIUM | WebSocket message sniffing | Same messages to all, role-based UI client-side |
| G1 | GAP | Nomination cap | One nomination per day |
| G2 | GAP | Defense timer (SHOULD) | Defer to Sprint 8 |
| G3 | GAP | Role presets (SHOULD) | Basic preset only for Sprint 5 |

**Verdict: CONDITIONAL APPROVE** -- No blockers. All HIGH findings are addressable
in the current task breakdown. Implementation should incorporate H1-H4 as design
constraints for KTH-T-026..T-028.
