# Daily solutions: at least two ways to solve each daily

## Goals
- Every pre-built daily puzzle has a complete, verified list of its solutions: at least two of them, using different numbers of pieces (every size).
- The **main** solution is the easiest to see and uses every piece in the hand. The others are cleverer and use fewer pieces.
- The game keeps track of every different way a player finds, and the home card shows the way that used the fewest pieces.
- Unlimited mode does not change (no solution count, no solver).

## Decisions (from the brainstorm)
- **Pre-built dailies, live unlimited.** A script on the developer's computer builds `dailies.json`. If a date is not in the file (the list ran out, or the file did not load) the game falls back to today's live seeded random daily and ignores the extra-solutions requirement: no list of ways, no cheaper-ways prompt.
- **Every size: at least two solutions, any number more.** The list is always complete.
- **The list of solutions is exact and complete.** No player may ever find a way that is better than the list. So the solver has no limits where it matters: the build script fully solves every candidate and drops any it cannot finish in time (it is never allowed to store a partial list). A test proves the solver finds exactly the same solutions as an exhaustive search.
- **Daily flow:** no hints before solving. After a solve, the game says how many pieces the player needed and, if cheaper ways exist, nudges toward them without saying how many pieces they use.
- Unlimited puzzles never show a solution count.

## 1. What a solution is
- A **solution** is a set of hand pieces on empty cells that wins and in which **every piece is needed**: take any one away and it loses. Decoy pieces never count.
- A player's **solution size** is the size of the smallest winning subset of the pieces they placed (`minimalSubset`). Placing extra pieces cannot make a solution look bigger or smaller.
- Hand pieces need no activations and adding a piece can never turn a win into a loss, so a winning set that contains a smaller winning set is not a solution.

## 2. The solver (`solutions.js`)
- `findSolutions(definition, {maxSolutions, timeLimitMs}) -> {solutions, complete}`: every solution, largest first (each a sorted list of `{x, y, kind}`), by depth-first search over the placements. `complete` is false only if a limit stopped it.
- A piece that is not a starter only matters if the chain reaches it, so only empty cells the chain hits are tried for it. A starter fires by itself on Run, so it is tried on every empty cell. (Found by the exhaustive test: ignoring starters missed solutions.)
- `minimalSubset(definition, placed)` and `countPieces(definition, placed)` give a player's solution and its size, or null if it does not win.
- Tests: known tiny puzzles; no solution contains an unneeded piece; the stored main solution is always found; limits; and the solver equals an exhaustive search on 3x3 (with and without spares) and small 5x5 puzzles. (A one-off run of this comparison over 5,650 puzzles and 33,464 solutions found no differences.)

## 3. Building the dailies (`tools/`)
- `buildDaily(date, size, {maxCandidates, perCandidateMs})` (`tools/daily-builder.js`) tries seeded candidates (seed from the date, size and a counter) from `generateDefinition({size, rng, spares: 0})`, so the hand is exactly the main solution. It fully solves each (there is no cap on solutions; it drops a candidate only when it runs out of time) and accepts one with a complete list of at least 2 solutions (every size, no upper limit) using all different piece counts. It returns `{date, size, attempt, definition, solutions}` or null. The same inputs always give the same puzzle.
- `generateDefinition` gets two options: `spares` (fix the number of spare pieces; 0 means none) and `config` (override the size's recipe for one call). Without them its output is exactly as before, so the pinned live daily puzzles do not change.
- `tools/build-dailies.mjs` (with a worker file) runs it for a range of dates and sizes on several worker threads and writes `dailies.json`:
  `node tools/build-dailies.mjs [--from YYYY-MM-DD] [--days 30] [--sizes 3,5,7] [--out dailies.json] [--workers N] [--cap-seconds 60] [--max-candidates 20000]`.
  It keeps what is already in the file (so it can be re-run to extend it, or resumed), saves at most every two seconds and always atomically, and reports each puzzle as it finishes.
- Measured cost: a year of 3x3 and 5x5 takes about 80 seconds on six workers. 7x7 is far slower (hand-7 candidates take seconds each and only a small share have at least two solutions), so it is built in batches.
- `dailies.json` format: `{"version": 1, "built": "YYYY-MM-DD", "puzzles": {"2026-10-07": {"3": {"attempt": 4, "definition": {...}, "solutions": [[{x, y, kind}, ...], ...]}, "5": {...}, "7": {...}}}}`.

## 4. Loading (`daily-data.js`)
- `loadDailyFile(url = "dailies.json", fetchFile = fetch)` returns the parsed file or null (missing, damaged, offline).
- `pickDaily(file, date, size)` returns `{definition, solutions}` for a well-formed entry, else null (checks the size, the shapes of the definition and a non-empty list of well-formed solutions).
- `getDaily(file, date, size)` returns the pre-built entry, else `{definition: dailyDefinition(date, size), solutions: null}`.

## 5. Tracking what the player found (`progress.js`)
- A day's entry keeps every different way found, by piece count: `{last, streak, solutions: {"5": [{x, y, kind}...], "3": [...]}}`.
- `recordWin(progress, size, today, solution)` still sets the streak on the first win of the day and now saves that solution under its piece count. `addSolution(progress, size, today, solution)` adds another way found the same day (the first found with each piece count is kept; nothing changes the streak). `foundCounts` lists today's found piece counts, fewest first. `cheapestSolution` returns the fewest-piece solution found today, or `[]`.
- Loading validates solutions (whole cells on this size's board, kinds are strings, filed under the right piece count) and reads the older single `solution` field as one found solution. Damaged solutions are dropped, the streak is kept.

## 6. The daily page (`game.js`, `play.html`, `play-model.js`)
- Today's puzzle comes from `getDaily(await loadDailyFile(), today, size)`. Unlimited is unchanged.
- On a win, the pieces used are `minimalSubset(definition, placed)`. The win is recorded (streak on the first win; every new piece count saved), and the banner (several lines) says:
  - first win: `Solved! Streak: N days`, `Used K pieces.`, and if cheaper ways exist `Cheaper ways exist: try for fewer pieces.` (singular: `A cheaper way exists`);
  - a later, different way: `A new way to solve it!`, `Used K pieces.`, plus the nudge while cheaper ways remain, or `You found every way!` when all are found;
  - the same way again: `Solved again!`, `Used K pieces.`, plus the nudge.
  - With no list of ways (the live fallback) the banner shows streak and pieces but never the nudge or the ways box.
- A "Ways to solve it: 1 of 3 found" box appears after a solve (and when the page opens on an already-solved daily): one chip per way, showing `K pieces ✓` for found ways and `?` for the others, so cheaper ways' sizes stay secret.
- If a player ever solves with fewer pieces than the list's cheapest way, `console.error` says so loudly (it cannot happen if the list is complete).

## 7. The home page (`home.js`, `home-model.js`)
- The card previews today's puzzle from the same source (pre-built or live) and, once solved, shows the player's cheapest solution (the pieces they placed, without padlocks). The caption reads `the classic · 1 piece` for the fewest pieces found.

## 8. Testing
- Unit tests for every module above, plus the exhaustive solver comparison, the builder (3x3 and 5x5 for real: exactly the wanted solutions, distinct piece counts, main uses every piece, deterministic, re-solving gives the same list), the build script end to end on a temporary file (writes a file the game can read, a second run builds nothing, extending adds days), and the progress and message functions.
- `tools/e2e-daily.mjs` drives real Chrome: places the main solution (checks the pieces-used line, the nudge and the ways box), places the same way again, finds each cheaper way (checks `A new way...` and `You found every way!`), checks saved progress, the home card's cheapest solution and caption, reopens the page (ways box shows), and replays.

## Out of scope
- Solution counts or tracking in unlimited mode; hints before solving; deleting or editing saved solutions; building more than the dates in `dailies.json` (the fallback covers the rest).
