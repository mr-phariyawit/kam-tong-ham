# Loki Pre-Review: Sprint 6 -- Knights (อัศวิน)

> Reviewer: Loki (adversarial review)
> Date: 2026-05-07
> Verdict: CONDITIONAL APPROVE (0 BLOCKER, 3 HIGH, 5 MEDIUM)
> Spec sections: KN-001 through KN-004

---

## BLOCKER (0)

None found. Design is implementable.

---

## HIGH (3)

### H1: Vote timing side-channel on mission secret votes

**Risk:** If mission votes are processed immediately upon receipt, evil players can
infer vote order (who submitted FAIL first). Also, if the server reveals vote results
as soon as all votes arrive, the time delta between last vote and reveal leaks info
about whether votes were unanimous.

**Mitigation:** Process all mission votes atomically AFTER all team members have voted
OR after a fixed timer expires. Use a fixed-duration reveal timer (same as Werewolf
night resolution pattern). Never reveal individual vote timestamps.

**Implementation:** `resolveMission()` method -- collect all votes, then reveal
aggregated results only: "X success, Y fail" (spec KN-003.5).

### H2: Reconnect must not leak proposal/vote state

**Risk:** If a player reconnects during TEAM_VOTE or MISSION phase, re-sending the
current proposal or vote tally could expose who voted how. The proposal team membership
is public, but individual approve/reject votes and mission success/fail votes must not
be attributable.

**Mitigation on reconnect:**
- Send: own role, current phase, current mission number, current leader, team size needed
- Send: proposal team (if in TEAM_VOTE/MISSION -- the team is public)
- Send: own vote status (have I voted yet?)
- Do NOT send: individual vote breakdown, who voted what, vote order
- Do NOT re-send mission vote results from previous missions (those are in synced state
  as aggregated counts only)

### H3: Hammer rule (5 rejections) must persist across reconnects

**Risk:** If the rejection counter is stored only in local state and a reconnect or
phase transition resets it, evil can exploit reconnects to avoid the hammer rule.

**Mitigation:** Store `consecutiveRejections` in the synced state (KnightsState) so
it persists across reconnects and is visible to clients for UI display. Reset ONLY
when a proposal is approved (counter goes to 0). Increment on each rejection.

---

## MEDIUM (5)

### M1: Role distribution edge cases for special roles

**Observation:** Spec KN-001.3 lists special roles as "Should" priority:
ผู้นำอัศวิน, มือสังหาร, ที่ปรึกษา, สายลับฝ่ายชั่ว.

With 5 players (3 good, 2 evil): if we include ผู้นำอัศวิน + ที่ปรึกษา on good side
and มือสังหาร + สายลับฝ่ายชั่ว on evil side, that leaves only 1 basic อัศวินฝ่ายดี.

**Recommendation:** For 5 players, use only ผู้นำอัศวิน + มือสังหาร as special roles.
Add ที่ปรึกษา at 7+ players, สายลับฝ่ายชั่ว at 7+ players (requires 3 evil).

Special role table:
| Players | Good Specials | Evil Specials |
|---------|--------------|---------------|
| 5-6 | ผู้นำอัศวิน | มือสังหาร |
| 7-10 | ผู้นำอัศวิน, ที่ปรึกษา | มือสังหาร, สายลับฝ่ายชั่ว |

### M2: Leader rotation must survive disconnects

If the current leader disconnects, the next connected player in rotation order
becomes leader. The rotation order is set at game start and does not change.
Store `leaderOrder: string[]` (array of session IDs in rotation order) and
`currentLeaderIndex: number` in server state. Skip disconnected/dead players.

### M3: Mission 4 double-fail rule (7+ players)

Spec KN-003.4: "Mission 4 with 7+ players needs 2 fails." This is a conditional
rule per player count. Implementation must check `playerCount >= 7 && missionNumber === 4`
(0-indexed: mission index 3). Store this rule in the mission config table alongside
team sizes.

### M4: Assassin guess UX flow

After good wins 3 missions, the assassin (มือสังหาร) gets one chance to guess
ผู้นำอัศวิน. Flow:
1. All missions complete, good has 3 successes -> phase = ASSASSIN_GUESS
2. Show all player names/avatars to มือสังหาร (excluding self and known evil)
3. มือสังหาร selects one player
4. Reveal: if correct -> evil wins. If wrong -> good wins.
5. Timer: 30 seconds. If timer expires with no guess -> good wins by default.

**Risk:** If มือสังหาร disconnects during this phase, good wins by default
(the guess window expires). This is fair -- evil cannot stall forever.

### M5: IP audit -- Thai role names

Spec already mandates Thai-themed names (Loki F2 from Sprint 2). Confirm:
- "Merlin" -> ผู้นำอัศวิน (leader of knights) -- CLEAN
- "Assassin" -> มือสังหาร (hired killer) -- CLEAN
- "Percival" -> ที่ปรึกษา (advisor) -- CLEAN
- "Morgana" -> สายลับฝ่ายชั่ว (evil spy/double agent) -- CLEAN
- "Mordred" -> not used (มือสังหาร covers assassin role) -- CLEAN
- Game is called "Knights" (อัศวิน), not "Avalon" -- CLEAN
- "Loyal Servant" -> อัศวินฝ่ายดี (good knight) -- CLEAN
- "Minion" -> ผู้ทรยศ (traitor) -- CLEAN

No Avalon-specific proper nouns remain. Thai names are original. PASS.

---

## LOW / NOTES

### L1: Team proposal validation

Leader must propose exactly N players for the current mission (N from mission size table).
Cannot propose self twice. Cannot propose disconnected players.

### L2: Vote visibility

- Team proposal vote (approve/reject): results are PUBLIC after all votes are in.
  Individual votes CAN be shown (standard Avalon mechanic -- each player's approve/reject
  is revealed). This is NOT a secret vote.
- Mission vote (success/fail): results are PRIVATE/aggregated. Only total success/fail
  counts are shown. Individual votes are NEVER revealed.

### L3: Game restart

After GAME_OVER, host can start a new game. This follows BaseRoom pattern
(handleStartGame checks phase === "LOBBY" || "GAME_OVER").

---

## Verdict

CONDITIONAL APPROVE. Address H1-H3 in implementation (all have clear mitigations).
M1-M5 are design clarifications -- incorporate into task specs.

No blockers. Proceed to implementation.
