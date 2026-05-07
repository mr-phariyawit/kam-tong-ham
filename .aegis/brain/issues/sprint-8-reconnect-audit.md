# Sprint 8 Cross-Game Reconnect-Leak Audit Report

> Date: 2026-05-07
> Auditor: Nick Fury (via Loki design + Spider-Man implementation)
> Scope: All 6 game rooms -- reconnect handling + synced state privacy
> Task: KTH-T-050 (2 pts)

## Methodology

1. Reviewed every game room's `onPlayerReconnected()` hook
2. Reviewed every `@type`-decorated field on player schemas for privacy leaks
3. Reviewed synced state for any field that reveals secret data during gameplay
4. Wrote 15 focused negative tests (reconnect-audit.test.ts)

## Findings Summary

| Game | Reconnect Handler | Synced State | Result |
|------|------------------|-------------|--------|
| KhamTongHam | SAFE -- sends only player's OWN word | SAFE -- assignedWord empty during play | PASS |
| Spy | SAFE -- sends ROLE_DATA per role | **FIX APPLIED** -- isSpy and role were @type synced | FIXED |
| Werewolf | SAFE -- sends only own role + wolves for wolves | SAFE -- revealedRole empty until death | PASS |
| Knights | SAFE -- sends own role via buildRoleData() | SAFE -- revealedRole/Team empty until game over | PASS |
| WordLink | SAFE -- sends COLOR_KEY only to spymasters | SAFE -- card.color is always "" | PASS |
| DrawGuess | SAFE -- sends DRAW_WORD only to drawer | SAFE -- revealedWord empty during play | PASS |

## Fix Applied: SpyPlayer Synced State Leak

**Issue**: `SpyPlayer.isSpy` and `SpyPlayer.role` had `@type` decorators, which
caused Colyseus to sync these fields to ALL connected clients. Any player with
browser devtools could inspect the state and identify: (a) which player is the spy,
(b) what role each non-spy has.

**Severity**: MEDIUM -- exploitable via devtools but not via normal gameplay UI.

**Fix**: Removed `@type("boolean")` from `isSpy` and `@type("string")` from `role`
in `server/src/schemas/SpyState.ts`. These fields remain as plain JS properties
(accessible server-side) but are no longer serialized to clients. The client already
uses the private `ROLE_DATA` message to get this info, not the synced state.

**Validation**: Test "spy identity is NOT leaked via synced state" confirms the
@type decorator is absent. 15/15 reconnect audit tests pass. Full suite: 509/509.

## Per-Game Detail

### KhamTongHam (Forbidden Word)
- `roundWords` Map (server-side) holds word-per-player
- `onPlayerReconnected()` sends `YOUR_WORD` for the reconnecting player only
- `assignedWord` on Player schema is empty until `revealAllWords()` at round end
- **Test**: reconnecting player receives ONLY their own word

### Spy (Spyfall)
- `currentLocation` and `playerRoles` (server-side) hold secrets
- `onPlayerReconnected()` sends `ROLE_DATA`: spy gets `{isSpy:true, location:null}`,
  non-spy gets `{isSpy:false, location:{...}, role:"..."}`
- **Fix applied**: removed @type from isSpy and role
- **Tests**: spy reconnect gets spy data, non-spy gets non-spy data, no cross-leak

### Werewolf
- `playerRoles` Map (server-side) holds role assignments
- `onPlayerReconnected()` sends `ROLE_DATA` with own role only
- Wolves also receive `otherWolves` list (intentional -- wolves know each other)
- `revealedRole` on player schema is empty until death/game-over
- Seer results are NOT re-delivered on reconnect (Loki H3 constraint)
- **Tests**: villager doesn't get wolf list, wolf does get other wolves, seer
  doesn't get SEER_RESULT re-delivery

### Knights (Avalon)
- `playerRoles` Map (server-side) holds role assignments
- `onPlayerReconnected()` sends role via `buildRoleData()`:
  - Good knight: role only (no evil list)
  - Evil player: role + evilPlayers list
  - Leader: role + evilPlayers list
  - Advisor: role + leaderCandidates (leader + double-agent, shuffled)
- `PHASE_CONTEXT` sent with safe fields (phase, mission, leader, own vote status)
- `revealedRole` and `revealedTeam` empty until game-over
- **Tests**: good-knight gets no evil list, evil gets evil list, phase context
  has no vote/proposal leaks

### WordLink (Codenames)
- `colorKey` Map (server-side) holds card colors
- `onPlayerReconnected()` sends `COLOR_KEY` ONLY if player is spymaster
- Guessers see only `revealedColor` on flipped cards
- `card.color` is always "" in synced state
- **Tests**: guesser doesn't get color key, spymaster does

### DrawGuess
- `currentWord` (server-side string) holds the secret word
- `onPlayerReconnected()` sends:
  - All players: `PHASE_CONTEXT` + `STROKE_SNAPSHOT`
  - Drawer only: `DRAW_WORD` with the current word
  - Hint status (if revealed): word length + first char
- `revealedWord` empty during gameplay (set at turn end)
- **Tests**: non-drawer gets no word, drawer gets word, snapshot doesn't
  contain the word

## Conclusion

After fixing the SpyPlayer synced-state leak, all 6 games correctly isolate
private data during reconnection. No architectural changes required. The
BaseRoom reconnect mechanism (5-minute window + game-specific hook) is sound.

Total new tests: 15 (reconnect-audit.test.ts)
Full suite: 509/509 passing
