# Sprint 7 Plan -- Draw & Guess (วาดทาย)

> Created: 2026-05-07
> Epic: KTH-E-008
> Points: 13
> Branch: feat/sprint-7-draw-guess
> Objective: Ship game #6 -- the LAST new game

## Architecture Decisions

### D-098: Stroke Sync Model -- BROADCAST-ONLY + Periodic Snapshot
- Decision: Stroke deltas broadcast via ephemeral Colyseus messages (not persisted in state)
- Periodic snapshot: every 5 seconds OR on clear/undo, the server captures the drawer's
  full stroke buffer into state (ArraySchema) for late-joiner replay
- Rationale: Full stroke history in synced state would balloon (500 strokes x N rounds).
  Broadcast-only keeps state lean. Single snapshot + live forward = acceptable late-joiner UX.
- Trade-off: Late joiners see last snapshot + live strokes from that point, not full animation.
  Acceptable for casual party game.

### D-099: Guess Matching -- Normalized Exact Match
- Decision: Strip whitespace, Thai tone marks, normalize Thai vowels, lowercase, then exact compare
- Implementation: normalizeThaiGuess() utility function
- Deferred: Levenshtein/fuzzy matching is Sprint 8 polish (if needed)
- Rationale: Thai text normalization covers the main pain points (ผีเสื้อ vs ผี้เสื้อ,
  spacing variants). Exact-after-normalize is deterministic and debuggable.

## Tasks

| ID | Title | Pts | Depends | Agent |
|----|-------|-----|---------|-------|
| KTH-T-042 | DrawGuessState schema (player, snapshot, scores, timer) | 1 | - | Spider-Man |
| KTH-T-043 | DrawGuessRoom -- phase machine + word selection + drawer rotation | 2 | T-042 | Spider-Man |
| KTH-T-044 | Stroke broadcast + periodic snapshot relay | 2 | T-043 | Spider-Man |
| KTH-T-045 | Guess submission + Thai-normalized matching | 2 | T-043 | Spider-Man |
| KTH-T-046 | Round/scoring + game over logic | 1 | T-045 | Spider-Man |
| KTH-T-047 | Reconnect handling (drawer DC = round end; late-join = snapshot) | 1 | T-044 | Spider-Man |
| KTH-T-048 | Client UI -- canvas component, viewer mode, guess input | 3 | T-044, T-045 | Spider-Man |
| KTH-T-049 | Test suite (target 40+ tests) | 1 | T-042..T-047 | Spider-Man |

Total: 13 pts

## Phase Machine

```
LOBBY -> COUNTDOWN -> DRAWING -> ROUND_END -> SCOREBOARD -> (next drawer) -> DRAWING -> ... -> GAME_OVER
```

- LOBBY: Standard BaseRoom lobby (join, host, kick)
- COUNTDOWN: 3-second countdown before drawing starts (reuse pattern)
- DRAWING: Drawer draws, guessers submit guesses. Timer counts down.
  - Sub-transition: when all guessers correct OR timer expires -> ROUND_END
- ROUND_END: Reveal word, show round scores (5s pause)
- SCOREBOARD: After all players drawn in a round, show cumulative scores (5s)
  - If more rounds remain -> next drawer -> DRAWING
  - If all rounds complete -> GAME_OVER
- GAME_OVER: Final scores, winner announcement. Can restart from lobby.

## Word Selection Strategy

- Reuse existing 19 wordpacks
- For Draw & Guess, prefer concrete/drawable categories: animals, food, sports, body,
  jobs, places, entertainment, daily-life, school, shopping, travel, office
- Filter: use "easy" + "medium" tiers only (hard tier often has abstract words)
- Drawable word pool built at game start from combined easy+medium tiers across
  selected categories (~600+ words available)
- No duplicate words within same game session (track usedWords set)

## Scoring (DG-003)

- First correct guesser: +3 pts, drawer: +1 pt
- Second correct guesser: +2 pts
- Third+ correct guesser: +1 pt each
- No correct guess: 0 pts for all
- After guessing correctly, player watches (cannot guess again that turn)

## Canvas Spec (DG-005)

- HTML5 Canvas with touch support (mobile-first)
- Stroke format: { tool, color, size, points: [{x,y}] }
- Delta broadcast: each stroke point batch (not full canvas)
- Tools: pen (3 sizes: 2px, 5px, 10px), eraser, clear
- Color palette: 8 colors (black, red, blue, green, yellow, orange, purple, white)
- Max 500 strokes per turn (DG-005.5)
- Undo last stroke (DG-005.4, Should priority)

## Configuration (DG-001.2)

- Rounds per game: 1-5 (default 2)
- Draw time: 30-120s (default 60s)
- Player count: 3-8

## Reconnect Handling (KTH-T-047)

- Drawer disconnects during DRAWING phase: round ends immediately, word revealed,
  no points awarded. Move to next drawer.
- Guesser disconnects: keep their score, skip them. If they reconnect, they get
  the current snapshot + live strokes and can resume guessing.
- Late joiner (reconnect): receives stroke snapshot from state + word hint status.

## Loki Review Focus Areas

1. Stroke-sync architecture: broadcast-only + snapshot for late joiners
2. Word privacy: drawer's word must NEVER leak to guessers via any message
3. Drawer disconnect race conditions
4. Thai matching edge cases
5. Canvas MVP vs library dependency
6. IP audit: "Pictionary" name avoided, Thai title original
7. State size cap for strokes
