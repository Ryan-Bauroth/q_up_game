# Interesting random puzzles, optional hand pieces, one-starter-at-a-time runs

## Goals
- Random boards have no pointless pieces.
- Each random board has a cohesive idea (skip chain, beam coverage, picture, symmetry, single path, bottleneck), chosen by score, never shown to the player.
- Some hand pieces are spares: a puzzle can be solved without placing them.
- Run plays one starter at a time in reading order.
- Pressing "random" takes under a second, via a cache of pre-built boards.

## 1. Run order (`engine.js`, `runner.js`)
- Starters are seeded in reading order: rows top to bottom, left to right within a row (grid is `grid[x][y]`, so `y` is the outer loop).
- Each starter's whole chain is drained before the next starter fires.
- Every trace step gets `root: {x, y}`, the starter that began its chain. Existing trace consumers ignore it.
- `runner.js` no longer flashes all starters at once. When `root` changes, that starter flashes and spends its charge, then its chain plays as before.
- A scratch prototype of the engine change passes all 90 existing tests, including solvability of the 10 hand-built levels.

## 2. Generator rules (`generator.js`, new `lint.js`)
- Placement limit: a starter or reactor is never placed where it has no in-bounds target.
- Hand is 5 pieces: the solution places 3-4, the rest are spares (1-2, random per puzzle). `definition.solution` lists only the placed pieces.
- Locked pieces must all fire (the win condition already requires it).
- `isSensible(definition)` runs after simulation and rejects a board if:
  - it is already solved before anything is placed;
  - removing any one solution piece still wins (that piece is unnecessary);
  - a locked starter, reactor or beam has no consumed target.

## 3. Scoring (`score.js`)
- `scorePuzzle(definition) -> {total, themes}` simulates the stored solution once and reads the trace.
- Per-theme scores, each 0-1, kept in one table so a theme can be added as one entry:
  - skip chain: share of hits from hop, leap, dive and relay, and longest run of consecutive skips;
  - beam coverage: distinct cells swept by purple pieces with little overlap;
  - picture: overlap of the teal targets with a small template library (smile, X, plus, border, diagonal, rows);
  - symmetry: share of cells with a mirror or 180-degree twin of the same kind and charge;
  - single path: one starter whose chain reaches most of the board, little branching;
  - bottleneck: a target hit by 3+ routes, or a charge-3 target.
- `total = max(theme scores) + small bonus`. The bonus rewards variety of kinds, spread across quadrants, activation count, and spares that are plausible alternatives.
- `generateBest({candidates, rng})` builds gate-passing candidates with the raw generator and returns the top scorer. `generateDefinition()` stays as the fast raw generator.

## 4. Cache (`game.js`)
- A queue of about 3 boards, refilled one at a time in small time slices (`requestIdleCallback` / `setTimeout`) so the page never stalls. A refill is about 60-100 candidates, roughly 0.5 s of background work (one raw candidate is about 6 ms).
- Pressing "random" pops from the queue and triggers a refill. If the queue is empty, it falls back to a small pool (about 15 candidates, under 100 ms).

## 5. Testing
- Engine: two starters fire in reading order, each chain completing before the next; `root` is set on every step.
- `lint.js`: unit tests with hand-made boards for each rejection.
- `score.js`: a hand-made board per theme that scores high on it and low on the others.
- Generator: a property test over many seeds checks that every board is winnable via its solution, not already solved, passes the gate, has 1-2 spares, and has a hand of 5.
- Existing tests stay green; the hand-built levels are re-verified.

## Out of scope
- Showing the theme to the player, new piece types, a Web Worker, changes to the hand-built levels.
