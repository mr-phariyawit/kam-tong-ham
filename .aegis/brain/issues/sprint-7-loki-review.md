# Loki Adversarial Pre-Review -- Sprint 7 Draw & Guess

> Reviewed: 2026-05-07
> Reviewer: Loki (adversarial)
> Verdict: CONDITIONAL APPROVE (0 BLOCKER, 2 HIGH, 4 MEDIUM, 2 LOW)

## Architecture: Stroke Sync (D-098)

### [HIGH] H1: Snapshot Stale-on-Join Race Condition
**Risk**: Late joiner connects between snapshot intervals. They receive a snapshot
that may be 0-5 seconds old, plus live strokes from connection time. Any strokes
drawn between the last snapshot and connection are LOST for that joiner.

**Mitigation**: When a player joins/reconnects during DRAWING phase, trigger an
immediate snapshot capture (out-of-cycle) in addition to the periodic one. This
closes the gap to near-zero. Implementation: in `onPlayerReconnected()`, if phase
is DRAWING, server sends the current snapshot state immediately.

**Severity**: HIGH -- visible artifact (partial drawing) affects gameplay fairness.
**Resolution**: Adopt mitigation. Force snapshot on reconnect.

### [MEDIUM] M1: Snapshot Size Cap
**Concern**: 500 strokes max per turn (DG-005.5), each stroke has N points.
Worst case: 500 strokes x 50 points x 3 fields (x, y, packed) = ~75KB.
Snapshot stored as ArraySchema of stroke objects in state.

**Mitigation**: Snapshot stores serialized stroke data as a single string field
(JSON.stringify of stroke array) rather than deeply nested ArraySchema. Caps
natural size. If snapshot > 50KB, truncate oldest strokes until under cap.

**Severity**: MEDIUM -- unlikely to hit in practice but defensive cap is prudent.
**Resolution**: Adopt. Use single `@type("string") strokeSnapshot` field.

### [MEDIUM] M2: Stroke Spam / DoS
**Concern**: Malicious drawer sends rapid stroke messages to overwhelm server relay.

**Mitigation**: Rate-limit stroke messages: max 30 messages/second from drawer.
Server-side counter, drop excess silently. Also enforced by DG-005.5 (500 stroke cap).

**Severity**: MEDIUM -- standard anti-abuse pattern.
**Resolution**: Adopt. Add stroke message rate limiter.

## Security: Word Privacy

### [HIGH] H2: Word Must Never Leak to Guessers
**Risk**: The drawing word is sent to the drawer via private message. If the word
is stored in synced state, ALL clients see it.

**Mitigation**: Word is stored ONLY in server-side private variable (same pattern
as KnightsRoom.playerRoles). The `@type("string") currentWord` field in state
must NOT exist. Instead: `private currentWord: string` in the room class.
Drawer receives word via `client.send("DRAW_WORD", { word })`.

Word hint (DG-002.6): character count + first character after 50% time. Server
computes and broadcasts `WORD_HINT` message. Never sends the full word.

**Severity**: HIGH -- word leak = game-breaking.
**Resolution**: Mandatory. No word in synced state. Private variable only.

## Drawer Disconnect

### [MEDIUM] M3: Drawer Disconnect Mid-Stroke
**Concern**: Drawer disconnects while drawing. Round should end gracefully.

**Mitigation**: `onPlayerDisconnectedDuringGame()` checks if the disconnected
player is the current drawer. If so: immediately end the current turn, reveal
word, award 0 points, advance to next drawer.

**Severity**: MEDIUM -- graceful degradation, not a crash.
**Resolution**: Adopt. Clean turn-end on drawer disconnect.

## Thai Matching

### [MEDIUM] M4: Thai Text Normalization Edge Cases
**Concern**: Thai text has many normalization challenges:
- Tone marks: สระ sara am can decompose differently
- Spacing: zero-width joiner/non-joiner characters
- Similar vowels: "ใ" (sara ai mai muan) vs "ไ" (sara ai mai malai) -- these are
  DIFFERENT words in Thai, not homophones (ใจ != ไจ). Do NOT normalize these.
- Combining characters: nikhahit, thanthakhat

**Recommendation**: Normalize:
1. Strip whitespace (trim + collapse internal spaces)
2. Remove tone marks (mai ek, mai tho, mai tri, mai chattawa: ่-๋)
3. Remove thanthakhat (์) -- kills silent consonant marker
4. Lowercase (for any mixed Latin input)
5. Do NOT collapse ใ/ไ (they are distinct, e.g., ใบไม้ vs ไบ้ม้า)

**Severity**: MEDIUM -- affects guess accuracy but first-iteration normalize is good enough.
**Resolution**: Adopt recommendation. Log mismatched guesses for Sprint 8 analysis.

## Canvas Tech

### [LOW] L1: Canvas MVP Brittleness
**Concern**: Raw HTML5 Canvas without a library (fabric.js, paper.js) means:
- No built-in undo/redo history
- Manual touch event handling
- Manual resize/responsive handling

**Assessment**: Acceptable for MVP. The drawing needs are simple (freehand pen,
eraser, clear). Library adoption (fabric.js = 300KB) would be scope expansion.
Undo can be implemented via stroke history array (pop last stroke, redraw).

**Severity**: LOW -- works for party game MVP. Polish in Sprint 8 if needed.
**Resolution**: Accept. No library needed.

### [LOW] L2: IP Audit
**Concern**: "Pictionary" is a Mattel trademark. "Draw & Guess" and "วาดทาย" are
generic descriptions, not trademark violations. Drawing-guessing game mechanics
are not patentable (expired Pictionary patent, 1985).

**Assessment**: Clean. Thai title "วาดทาย" is original. No Mattel branding used.

**Severity**: LOW -- no issue found.
**Resolution**: Clean.

## Summary

| ID | Severity | Issue | Resolution |
|----|----------|-------|------------|
| H1 | HIGH | Snapshot stale-on-join race | Force snapshot on reconnect |
| H2 | HIGH | Word leak via synced state | Private variable only, never in state |
| M1 | MEDIUM | Snapshot size cap | String field + 50KB truncation |
| M2 | MEDIUM | Stroke spam / DoS | Rate-limit 30msg/s from drawer |
| M3 | MEDIUM | Drawer disconnect mid-stroke | Clean turn-end on disconnect |
| M4 | MEDIUM | Thai normalization edge cases | Strip tone marks + whitespace, keep ใ/ไ distinct |
| L1 | LOW | Canvas MVP without library | Accept for MVP |
| L2 | LOW | IP audit | Clean -- no trademark issue |

## Verdict

**CONDITIONAL APPROVE** -- proceed with implementation incorporating H1 and H2
mitigations. All MEDIUM items should be addressed during implementation.

No BLOCKERS. Sprint 7 can proceed.
