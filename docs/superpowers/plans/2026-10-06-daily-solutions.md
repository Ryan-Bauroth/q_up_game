# Daily Solutions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every pre-built daily puzzle has a verified, complete list of ways to solve it (two or three, using different numbers of pieces, for every size), the game tracks every different way a player finds, prompts about cheaper ways after a solve, and the home card shows the player's fewest-piece solution.

**Architecture:** A complete solver (`solutions.js`) finds every solution of a puzzle, where a solution is a set of hand pieces in which every piece is needed. A build script (`tools/build-dailies.mjs`) uses it, offline and in parallel, to find seeded puzzles with exactly the wanted solutions and writes them to `dailies.json`. The game loads that file (`daily-data.js`), falling back to the live seeded daily when a date is missing. Progress keeps every way found, by piece count. Unlimited mode is untouched.

**Tech Stack:** Plain ES modules, `node --test` (Node 22+), `worker_threads` for the build script, canvas. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-06-daily-solutions-design.md`. The code in this plan was written and run in a scratch copy first (all unit tests pass, the solver was compared against an exhaustive search over 5,650 puzzles with no differences, and the browser flow was driven end to end), then split into the tasks below.

## Global Constraints

- A **solution** is a set of hand pieces on empty cells that wins and in which every piece is needed (removing any one loses). A player's solution size is the size of the smallest winning subset of what they placed.
- The stored list of ways for a pre-built daily must be **complete and exact**: the build script never stores a partial list, and drops any candidate it cannot finish within its per-candidate time limit.
- Daily puzzles from the file have exactly 3 solutions with 3 different piece counts (3x3: exactly 2); the main solution (the generator's) uses every hand piece (`spares: 0`); the other solutions use fewer.
- If a date is missing from `dailies.json` (or the file fails to load), the game falls back to the live seeded daily (`dailyDefinition`) with no list of ways and no cheaper-ways prompt.
- Unlimited mode is unchanged: no solutions, no solver, no counts.
- `generateDefinition` without the new options must produce exactly what it did before (the pinned daily puzzles in `daily.test.js` must not change). The daily path never uses `Math.random`.
- Static hosting only (GitHub Pages): relative URLs, `dailies.json` is fetched as `dailies.json`.
- Saved progress keeps working: an older single `solution` field is read as one found solution; storage that is blocked or damaged never throws.
- The full suite (`npm test`) must pass after every task. 4-space indent, double quotes, semicolons, short explanatory comments matching the surrounding code.
- Commit messages end with: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`
- Browser checks use headless Chrome at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` and the project's server (`npm start`, http://localhost:3000). Images can be read with the Read tool. Never set `textContent`/`innerHTML` on an existing `.up` element (it would delete its outline layer).

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `generator.js` | modify | `spares` and `config` options |
| `solutions.js` | create | `findSolutions`, `minimalSubset`, `countPieces`, `solutionKey` |
| `progress.js` | modify | Solutions found, by piece count; `addSolution`, `foundCounts`, `cheapestSolution` |
| `home-model.js` | modify | Card carries the cheapest solution and its piece count |
| `play-model.js` | modify | Multi-line win messages, `waysSummary` |
| `daily-data.js` | create | Load and pick pre-built dailies, with the live fallback |
| `tools/daily-builder.js` | create | `buildDaily` |
| `tools/build-dailies.mjs`, `tools/build-dailies-worker.mjs` | create | The parallel, resumable build script |
| `game.js`, `play.html`, `play.css` | modify | Daily flow, nudges, the ways box |
| `home.js` | modify | Previews from the same source; piece count caption |
| `tools/e2e-daily.mjs` | modify | The new daily flow in a real browser |
| `dailies.json` | create (built) | The pre-built puzzles |

---

### Task 1: Generator options

**Files:**
- Modify: `generator.js`, `generator.test.js`

**Interfaces:**
- Produces: `generateDefinition({size, rng, maxAttempts, spares, config})`. `spares` fixes the number of spare hand pieces (default: 1 or 2 chosen at random; `0` makes the hand exactly the solution). `config` is merged over the size's recipe in `SIZE_CONFIG` for that one call. Without them the output is identical to before.

- [ ] **Step 1: Add the failing tests.** Append to `generator.test.js` (the file already defines `seeded`, `SIZES`, `SIZE_CONFIG`, `isSensible` imports):

```js
test("spares: 0 gives a hand that is exactly the solution, so the main solution uses every piece", () => {
    for (const size of SIZES) {
        for (const seed of [1, 2, 3, 4]) {
            const definition = generateDefinition({size, rng: seeded(seed), spares: 0});
            assert.equal(definition.hand.length, definition.solution.length);
            assert.deepEqual([...definition.hand].sort(), definition.solution.map(s => s.kind).sort());
            assert.equal(isSensible(definition), true);
        }
    }
});

test("a config override changes the recipe for one call", () => {
    const definition = generateDefinition({size: 3, rng: seeded(5), spares: 0, config: {pieces: [6, 8], hand: [4, 5]}});
    assert.ok(definition.solution.length >= 4, `placed ${definition.solution.length}`);
    // the shared recipe is untouched
    assert.deepEqual(SIZE_CONFIG[3].hand, [1, 2]);
});

test("without the new options, generation is exactly what it was (daily puzzles must not change)", () => {
    const a = generateDefinition({size: 5, rng: seeded(77)});
    const b = generateDefinition({size: 5, rng: seeded(77), spares: undefined, config: undefined});
    assert.deepEqual(a, b);
});
```

- [ ] **Step 2: Run to confirm they fail**

Run: `node --test generator.test.js`
Expected: the `spares: 0` and `config` tests FAIL; the "exactly what it was" test may pass.

- [ ] **Step 3: Apply this change to `generator.js`**

```diff
--- a/generator.js
+++ b/generator.js
@@ -28,9 +28,13 @@
 
 const isBeamKind = kind => KINDS[kind].abilities.some(id => ABILITIES[id].line);
 
-export function generateDefinition({size = 5, rng = Math.random, maxAttempts = 20000} = {}) {
-    const config = SIZE_CONFIG[size];
-    if (!config) throw new Error(`unsupported puzzle size: ${size}`);
+// `spares` fixes how many spare hand pieces to add (default: 1 or 2 at random;
+// 0 makes the hand exactly the solution). `config` overrides the size's recipe
+// for this call only.
+export function generateDefinition({size = 5, rng = Math.random, maxAttempts = 20000, spares: fixedSpares, config: configOverride} = {}) {
+    const baseConfig = SIZE_CONFIG[size];
+    const config = baseConfig && {...baseConfig, ...configOverride};
+    if (!baseConfig) throw new Error(`unsupported puzzle size: ${size}`);
 
     const pick = list => list[Math.floor(rng() * list.length)];
     const between = ([min, max]) => min + Math.floor(rng() * (max - min + 1));
@@ -117,7 +121,7 @@
         const locked = placed.filter(p => !solution.includes(p));
 
         // 1-2 spares
-        const spares = Array.from({length: 1 + Math.floor(rng() * 2)}, () => pick(rng() < 0.15 ? STARTER_KINDS : REACTOR_KINDS));
+        const spares = Array.from({length: fixedSpares ?? 1 + Math.floor(rng() * 2)}, () => pick(rng() < 0.15 ? STARTER_KINDS : REACTOR_KINDS));
 
         const definition = {
             name: "Random",
```

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: all pass, including the pinned daily puzzles.

- [ ] **Step 5: Commit**

```bash
git add generator.js generator.test.js
git commit -m "Let the generator fix the number of spares and override its recipe

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The solver

**Files:**
- Create: `solutions.js`, `solutions.test.js`

**Interfaces:**
- Consumes: `simulate`/`cloneGrid` (`engine.js`), `buildFromDefinition`/`makePiece`/`sizeOf`/`KINDS` (`puzzles.js`), `ABILITIES`/`TRIGGERS`, and the generator's `spares` option (Task 1) in the tests.
- Produces: `solutionKey(pieces) -> string`, `minimalSubset(definition, placed) -> pieces | null`, `countPieces(definition, placed) -> number | null`, `findSolutions(definition, {maxSolutions = Infinity, timeLimitMs = Infinity}) -> {solutions: [[{x, y, kind}...]...] (largest first), complete: boolean}`. `complete` is false only if a limit stopped the search.
- Why starters are special: a needed piece that is not a starter must be hit by the chain, so only cells the chain reaches are tried for it; a starter fires by itself on Run, so it is tried on every empty cell. (The first version missed this and the exhaustive test caught it.)

- [ ] **Step 1: Write the failing tests** (`solutions.test.js`; the last two tests compare the solver with an exhaustive search)

```js
import test from "node:test";
import assert from "node:assert/strict";
import {findSolutions, minimalSubset, solutionKey, countPieces} from "./solutions.js";
import {generateDefinition} from "./generator.js";
import {buildFromDefinition, makePiece, sizeOf} from "./puzzles.js";
import {simulate, cloneGrid} from "./engine.js";

// small seeded generator so failures are reproducible
function seeded(seed) {
    let a = seed;
    return () => {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// igniter (0,0) hits (0,1); a Burster there hits both targets
const simple = {
    name: "Test",
    size: 3,
    locked: [[0, 0, "igniter", 1], [0, 2, "receiver", 1], [1, 1, "receiver", 1]],
    hand: ["burster", "pusher"],
    solution: [{x: 0, y: 1, kind: "burster"}],
};

test("findSolutions finds the one way to solve a simple puzzle", () => {
    const {solutions, complete} = findSolutions(simple);
    assert.equal(complete, true);
    assert.deepEqual(solutions, [[{x: 0, y: 1, kind: "burster"}]]);
});

test("a puzzle can have several solutions, listed largest first", () => {
    // two targets that a Pair (up and down) or two Pushers... build it by hand:
    // igniter (1,0) hits (1,1); a Pair V there hits (1,0) (a starter, ignored) and (1,2).
    // target at (1,2) needs a hit: Pair V at (1,1), or a Tee at (1,1) (left, right, down).
    const puzzle = {
        name: "Test",
        size: 3,
        locked: [[1, 0, "igniter", 1], [1, 2, "receiver", 1]],
        hand: ["pairV", "tee"],
        solution: [{x: 1, y: 1, kind: "pairV"}],
    };
    const {solutions} = findSolutions(puzzle);
    const keys = solutions.map(solutionKey).sort();
    assert.deepEqual(keys, ["1,1:pairV", "1,1:tee"]);
});

test("a solution never contains a piece that is not needed", () => {
    for (let seed = 1; seed <= 20; seed++) {
        const definition = generateDefinition({size: 5, rng: seeded(seed), spares: 0});
        const {solutions} = findSolutions(definition);
        assert.ok(solutions.length >= 1, `seed ${seed}`);
        for (const pieces of solutions) {
            for (let i = 0; i < pieces.length; i++) {
                const without = pieces.filter((_, j) => j !== i);
                assert.equal(minimalSubset(definition, without), null, `seed ${seed}: piece ${i} was not needed`);
            }
            assert.equal(minimalSubset(definition, pieces)?.length, pieces.length);   // it is its own smallest winning subset
        }
    }
});

test("the stored main solution is among the solutions found", () => {
    for (const size of [3, 5]) {
        for (let seed = 1; seed <= 15; seed++) {
            const definition = generateDefinition({size, rng: seeded(seed), spares: 0});
            const keys = new Set(findSolutions(definition).solutions.map(solutionKey));
            assert.ok(keys.has(solutionKey(definition.solution)), `${size}x${size} seed ${seed}`);
        }
    }
});

test("minimalSubset: decoys are ignored, and a losing layout gives null", () => {
    // the Pusher is a decoy: it fires nowhere useful
    const placed = [{x: 0, y: 1, kind: "burster"}, {x: 2, y: 2, kind: "pusher"}];
    assert.deepEqual(minimalSubset(simple, placed), [{x: 0, y: 1, kind: "burster"}]);
    assert.equal(minimalSubset(simple, [{x: 2, y: 2, kind: "pusher"}]), null);
    assert.equal(minimalSubset(simple, []), null);
});

test("countPieces is the size of the smallest winning subset", () => {
    const placed = [{x: 0, y: 1, kind: "burster"}, {x: 2, y: 2, kind: "pusher"}];
    assert.equal(countPieces(simple, placed), 1);
    assert.equal(countPieces(simple, []), null);
});

test("limits: a solution cap stops the search and says it did", () => {
    const definition = generateDefinition({size: 5, rng: seeded(3), spares: 0});
    const full = findSolutions(definition);
    const capped = findSolutions(definition, {maxSolutions: 1});
    assert.equal(capped.solutions.length, Math.min(1, full.solutions.length));
    if (full.solutions.length > 1) assert.equal(capped.complete, false);
    const timed = findSolutions(definition, {timeLimitMs: -1});
    assert.equal(timed.complete, false);
});

// ---- the solver against an exhaustive check -------------------------------

// Every way to put some of the hand pieces on empty cells, one piece per cell;
// keep the winning ones in which every piece is needed.
function bruteForce(definition) {
    const size = sizeOf(definition);
    const {grid: base} = buildFromDefinition({...definition, hand: []});
    const empty = [];
    for (let x = 0; x < size; x++) for (let y = 0; y < size; y++) if (base[x][y].isEmpty) empty.push({x, y});
    const wins = placed => {
        const grid = cloneGrid(base, size);
        for (const {x, y, kind} of placed) grid[x][y] = makePiece(kind, 1, false, false);
        return simulate(grid, size).won;
    };
    const found = new Map();
    const hand = definition.hand;
    function place(index, placed, usedCells) {
        if (index === hand.length) {
            if (placed.length > 0 && wins(placed) && placed.every((_, i) => !wins(placed.filter((__, j) => j !== i)))) {
                found.set(solutionKey(placed), placed);
            }
            return;
        }
        place(index + 1, placed, usedCells);                      // leave this piece in the hand
        for (const cell of empty) {
            const id = `${cell.x},${cell.y}`;
            if (usedCells.has(id)) continue;
            usedCells.add(id);
            place(index + 1, [...placed, {x: cell.x, y: cell.y, kind: hand[index]}], usedCells);
            usedCells.delete(id);
        }
    }
    place(0, [], new Set());
    return [...found.keys()].sort();
}

test("the solver finds exactly the solutions an exhaustive search finds (3x3)", () => {
    for (let seed = 1; seed <= 40; seed++) {
        const definition = generateDefinition({size: 3, rng: seeded(seed), spares: seed % 2});
        const expected = bruteForce(definition);
        const actual = findSolutions(definition).solutions.map(solutionKey).sort();
        assert.deepEqual(actual, expected, `3x3 seed ${seed}`);
    }
});

test("the solver finds exactly the solutions an exhaustive search finds (5x5)", () => {
    for (let seed = 1; seed <= 6; seed++) {
        const definition = generateDefinition({size: 5, rng: seeded(seed), spares: 0});
        if (definition.hand.length > 4) continue;
        const expected = bruteForce(definition);
        const actual = findSolutions(definition).solutions.map(solutionKey).sort();
        assert.deepEqual(actual, expected, `5x5 seed ${seed}`);
    }
});
```

- [ ] **Step 2: Run to confirm they fail**

Run: `node --test solutions.test.js`
Expected: FAIL (`./solutions.js` does not exist).

- [ ] **Step 3: Create `solutions.js`**

```js
import {cloneGrid, simulate} from "./engine.js";
import {buildFromDefinition, makePiece, sizeOf, KINDS} from "./puzzles.js";
import {ABILITIES, TRIGGERS} from "./abilities.js";

// Solutions of a puzzle. A solution is a set of hand pieces on empty cells that
// wins AND in which every piece is needed (take any one away and it loses), so
// decoy pieces never count. Hand pieces need no activations, so adding a piece
// can never make a win a loss. A needed piece that is not a starter must be hit by
// the chain, so only the empty cells the chain reaches are tried for it; a starter
// fires by itself when Run is pressed, so it can go on any empty cell. Together that
// makes the search below complete (checked against an exhaustive search in the tests).
const isStarterKind = kind => KINDS[kind].abilities.some(id => ABILITIES[id]?.trigger === TRIGGERS.ON_RUN);

export const solutionKey = pieces => pieces.map(p => `${p.x},${p.y}:${p.kind}`).sort().join("|");

const byCell = (a, b) => a.x - b.x || a.y - b.y || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0);

// Runs the puzzle's locked pieces plus `pieces` (as hand pieces) from scratch.
function makeRunner(definition) {
    const size = sizeOf(definition);
    const {grid: base} = buildFromDefinition({...definition, hand: []});
    return pieces => {
        const grid = cloneGrid(base, size);
        for (const {x, y, kind} of pieces) grid[x][y] = makePiece(kind, 1, false, false);
        return simulate(grid, size);   // {trace, finalGrid, won}
    };
}

// The smallest subset of `placed` that still wins, or null if it does not win.
// This is what a player's solution "uses": decoys they put down do not count.
export function minimalSubset(definition, placed) {
    const run = makeRunner(definition);
    for (let count = 1; count <= placed.length; count++) {
        const found = firstWinningCombination(placed, count, subset => run(subset).won);
        if (found) return found.sort(byCell);
    }
    return null;
}

function firstWinningCombination(items, count, wins, start = 0, chosen = []) {
    if (chosen.length === count) return wins(chosen) ? [...chosen] : null;
    for (let i = start; i < items.length; i++) {
        const found = firstWinningCombination(items, count, wins, i + 1, [...chosen, items[i]]);
        if (found) return found;
    }
    return null;
}

export function countPieces(definition, placed) {
    return minimalSubset(definition, placed)?.length ?? null;
}

// Every solution of the puzzle, largest first. `complete` is false only if a
// limit stopped the search early: `maxSolutions` (stop once that many are found)
// or `timeLimitMs`.
export function findSolutions(definition, {maxSolutions = Infinity, timeLimitMs = Infinity} = {}) {
    const size = sizeOf(definition);
    const run = makeRunner(definition);
    const available = {};
    for (const kind of definition.hand) available[kind] = (available[kind] ?? 0) + 1;
    const kinds = Object.keys(available);
    const starters = kinds.filter(isStarterKind);
    const chainKinds = kinds.filter(kind => !isStarterKind(kind));
    const emptyCells = [];
    for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
            if (run([]).finalGrid[x][y].isEmpty) emptyCells.push(x * size + y);
        }
    }
    const found = new Map();
    const seen = new Set();
    const started = performance.now();
    let stopped = false;

    function visit(placed) {
        if (stopped) return;
        const key = solutionKey(placed);
        if (seen.has(key)) return;
        seen.add(key);
        if (timeLimitMs !== Infinity && performance.now() - started > timeLimitMs) {
            stopped = true;
            return;
        }
        const result = run(placed);
        if (result.won && placed.length > 0) {
            // a win that holds a piece it does not need is not a solution
            if (placed.every((_, i) => !run(placed.filter((__, j) => j !== i)).won)) {
                found.set(key, [...placed].sort(byCell));
                if (found.size >= maxSolutions) stopped = true;
            }
            return;   // adding more pieces to a win can only add pieces that are not needed
        }
        if (placed.length === definition.hand.length) return;
        // a piece that is not a starter only matters if the chain reaches it: try the
        // empty cells the chain hits. A starter goes on any empty cell.
        const cells = new Set();
        for (const step of result.trace) {
            for (const t of step.targets) {
                if (result.finalGrid[t.x][t.y].isEmpty) cells.add(t.x * size + t.y);
            }
        }
        const used = {};
        for (const piece of placed) used[piece.kind] = (used[piece.kind] ?? 0) + 1;
        const taken = new Set(placed.map(p => p.x * size + p.y));
        for (const [list, options] of [[[...cells].sort((a, b) => a - b), chainKinds], [emptyCells.filter(cell => !taken.has(cell)), starters]]) {
            for (const cell of list) {
                const x = Math.floor(cell / size), y = cell % size;
                for (const kind of options) {
                    if ((used[kind] ?? 0) >= available[kind]) continue;
                    visit([...placed, {x, y, kind}]);
                }
            }
        }
    }
    visit([]);

    const solutions = [...found.values()].sort((a, b) => b.length - a.length || (solutionKey(a) < solutionKey(b) ? -1 : 1));
    return {solutions, complete: !stopped};
}
```

- [ ] **Step 4: Run the tests, then the suite**

Run: `node --test solutions.test.js && npm test`
Expected: all pass. The two exhaustive-comparison tests must pass with no differences.

- [ ] **Step 5: Commit**

```bash
git add solutions.js solutions.test.js
git commit -m "Add a complete solver and the minimal-subset count

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Progress keeps every way found; the home card uses the cheapest

**Files:**
- Modify: `progress.js`, `progress.test.js`, `home-model.js`, `home-model.test.js`

**Interfaces:**
- Produces (`progress.js`): `recordWin(progress, size, today, solution = [])` now saves the solution under its piece count (`solutions: {[count]: solution}`); `addSolution(progress, size, today, solution)` adds one more way found today (first per piece count wins; never touches the streak; ignores an empty solution or another day); `foundCounts(progress, size, today) -> number[]` (fewest first); `cheapestSolution(progress, size, today) -> solution | []`. `loadProgress` validates `solutions` (whole cells on the board, string kinds, filed under the right piece count) and reads an older single `solution` as one found solution; damaged solutions are dropped but the streak is kept.
- Produces (`home-model.js`): `cardModel(...)` gains `pieces` (the cheapest solution's piece count or `null`) and its `solution` is now the cheapest solution found today.

- [ ] **Step 1: Update the tests**

`progress.test.js`:

```diff
--- a/progress.test.js
+++ b/progress.test.js
@@ -1,6 +1,6 @@
 import test from "node:test";
 import assert from "node:assert/strict";
-import {recordWin, streakFor, isDone, loadProgress, saveProgress, browserStorage, mergeProgress} from "./progress.js";
+import {recordWin, addSolution, cheapestSolution, foundCounts, streakFor, isDone, loadProgress, saveProgress, browserStorage, mergeProgress} from "./progress.js";
 
 test("a first win makes a streak of 1 and marks the day done", () => {
     const progress = recordWin({}, 5, "2026-10-07");
@@ -123,43 +123,90 @@
     });
 });
 
-test("a win can save the pieces the player placed", () => {
+test("a win saves the pieces the player placed, under how many pieces that is", () => {
     const solution = [{x: 1, y: 2, kind: "burster"}, {x: 0, y: 0, kind: "pusher"}];
     const progress = recordWin({}, 5, "2026-10-07", solution);
-    assert.deepEqual(progress[5], {last: "2026-10-07", streak: 1, solution});
+    assert.deepEqual(progress[5], {last: "2026-10-07", streak: 1, solutions: {2: solution}});
 });
 
 test("winning the same day again keeps the first solution", () => {
     const first = [{x: 1, y: 2, kind: "burster"}];
     const once = recordWin({}, 5, "2026-10-07", first);
     const again = recordWin(once, 5, "2026-10-07", [{x: 3, y: 3, kind: "octo"}]);
-    assert.deepEqual(again[5].solution, first);
+    assert.deepEqual(again[5].solutions, {1: first});
 });
 
-test("the next day's win replaces the solution", () => {
+test("the next day's win starts a fresh set of solutions", () => {
     let progress = recordWin({}, 5, "2026-10-07", [{x: 1, y: 2, kind: "burster"}]);
     progress = recordWin(progress, 5, "2026-10-08", [{x: 0, y: 1, kind: "tee"}]);
-    assert.deepEqual(progress[5], {last: "2026-10-08", streak: 2, solution: [{x: 0, y: 1, kind: "tee"}]});
+    assert.deepEqual(progress[5], {last: "2026-10-08", streak: 2, solutions: {1: [{x: 0, y: 1, kind: "tee"}]}});
 });
 
-test("a saved solution survives saving and loading", () => {
+const three = [{x: 0, y: 0, kind: "pusher"}, {x: 1, y: 2, kind: "burster"}, {x: 2, y: 2, kind: "octo"}];
+const two = [{x: 1, y: 2, kind: "burster"}, {x: 2, y: 2, kind: "octo"}];
+
+test("addSolution keeps every different way found today, one per piece count", () => {
+    let progress = recordWin({}, 5, "2026-10-07", three);
+    progress = addSolution(progress, 5, "2026-10-07", two);
+    assert.deepEqual(progress[5].solutions, {3: three, 2: two});
+    assert.equal(progress[5].streak, 1);   // finding another way never touches the streak
+    // a second way with the same count is not kept, and nothing is mutated
+    const same = addSolution(progress, 5, "2026-10-07", [{x: 4, y: 4, kind: "tee"}, {x: 3, y: 3, kind: "cross"}]);
+    assert.deepEqual(same[5].solutions, {3: three, 2: two});
+});
+
+test("addSolution only adds to a day that has been won, and ignores an empty solution", () => {
+    assert.deepEqual(addSolution({}, 5, "2026-10-07", two), {});
+    const won = recordWin({}, 5, "2026-10-07", three);
+    assert.equal(addSolution(won, 5, "2026-10-08", two), won);
+    assert.equal(addSolution(won, 5, "2026-10-07", []), won);
+});
+
+test("cheapestSolution and foundCounts read today's solutions", () => {
+    let progress = recordWin({}, 5, "2026-10-07", three);
+    assert.deepEqual(cheapestSolution(progress, 5, "2026-10-07"), three);
+    assert.deepEqual(foundCounts(progress, 5, "2026-10-07"), [3]);
+    progress = addSolution(progress, 5, "2026-10-07", two);
+    assert.deepEqual(cheapestSolution(progress, 5, "2026-10-07"), two);
+    assert.deepEqual(foundCounts(progress, 5, "2026-10-07"), [2, 3]);
+    // yesterday's solutions are not today's; nothing saved reads as empty
+    assert.deepEqual(cheapestSolution(progress, 5, "2026-10-08"), []);
+    assert.deepEqual(foundCounts(progress, 5, "2026-10-08"), []);
+    assert.deepEqual(cheapestSolution({}, 5, "2026-10-07"), []);
+    assert.deepEqual(cheapestSolution(recordWin({}, 5, "2026-10-07"), 5, "2026-10-07"), []);
+});
+
+test("saved solutions survive saving and loading", () => {
     const storage = fakeStorage();
-    const solution = [{x: 4, y: 0, kind: "leap"}];
-    saveProgress(storage, recordWin({}, 5, "2026-10-07", solution));
-    assert.deepEqual(loadProgress(storage)[5].solution, solution);
+    let progress = recordWin({}, 5, "2026-10-07", three);
+    progress = addSolution(progress, 5, "2026-10-07", two);
+    saveProgress(storage, progress);
+    assert.deepEqual(loadProgress(storage), progress);
 });
 
-test("a damaged saved solution is dropped but the streak is kept", () => {
+test("an older save with a single `solution` is read as one found solution", () => {
+    const old = {"5": {last: "2026-10-07", streak: 2, solution: three}};
+    const loaded = loadProgress(fakeStorage({"qup-progress-v1": JSON.stringify(old)}));
+    assert.deepEqual(loaded, {5: {last: "2026-10-07", streak: 2, solutions: {3: three}}});
+});
+
+test("damaged saved solutions are dropped but the streak is kept", () => {
     const bad = [
-        [{x: 5, y: 0, kind: "leap"}],                 // off a 5x5 board
-        [{x: 1, y: 1}],                                // no kind
-        [{x: 1.5, y: 1, kind: "leap"}],                // not a whole cell
+        {3: [{x: 5, y: 0, kind: "leap"}]},                       // off a 5x5 board
+        {1: [{x: 1, y: 1}]},                                      // no kind
+        {1: [{x: 1.5, y: 1, kind: "leap"}]},                      // not a whole cell
+        {4: three},                                               // filed under the wrong piece count
         "oops",
-        [null],
+        [three],
+        {1: null},
     ];
-    for (const solution of bad) {
-        const saved = {"5": {last: "2026-10-07", streak: 3, solution}};
+    for (const solutions of bad) {
+        const saved = {"5": {last: "2026-10-07", streak: 3, solutions}};
         const loaded = loadProgress(fakeStorage({"qup-progress-v1": JSON.stringify(saved)}));
-        assert.deepEqual(loaded, {5: {last: "2026-10-07", streak: 3}}, JSON.stringify(solution));
+        assert.deepEqual(loaded, {5: {last: "2026-10-07", streak: 3}}, JSON.stringify(solutions));
     }
+    // one good and one bad entry: the good one is kept
+    const mixed = {"5": {last: "2026-10-07", streak: 3, solutions: {2: two, 4: three}}};
+    const loaded = loadProgress(fakeStorage({"qup-progress-v1": JSON.stringify(mixed)}));
+    assert.deepEqual(loaded, {5: {last: "2026-10-07", streak: 3, solutions: {2: two}}});
 });
```

`home-model.test.js`:

```diff
--- a/home-model.test.js
+++ b/home-model.test.js
@@ -22,6 +22,7 @@
         streak: 0,
         roman: null,
         solution: [],
+        pieces: null,
         streakText: "no streak yet",
         playLabel: "Play",
         dailyHref: "play.html?size=5&mode=daily",
@@ -61,14 +62,19 @@
     assert.equal(card.streakText, "1 day");
 });
 
-test("a finished card carries the player's own solution; an unfinished one carries none", () => {
-    const solution = [{x: 0, y: 1, kind: "burster"}];
-    const done = cardModel({size: 3, progress: {3: {last: "2026-10-07", streak: 2, solution}}, today: "2026-10-07"});
-    assert.deepEqual(done.solution, solution);
-    // yesterday's solution is not today's
-    const old = cardModel({size: 3, progress: {3: {last: "2026-10-06", streak: 2, solution}}, today: "2026-10-07"});
+test("a finished card carries the player's cheapest solution and how many pieces it uses", () => {
+    const four = [{x: 0, y: 1, kind: "burster"}, {x: 1, y: 1, kind: "octo"}, {x: 2, y: 1, kind: "tee"}, {x: 0, y: 2, kind: "cross"}];
+    const two = [{x: 0, y: 1, kind: "burster"}, {x: 1, y: 1, kind: "octo"}];
+    const progress = {3: {last: "2026-10-07", streak: 2, solutions: {4: four, 2: two}}};
+    const done = cardModel({size: 3, progress, today: "2026-10-07"});
+    assert.deepEqual(done.solution, two);
+    assert.equal(done.pieces, 2);
+    // yesterday's solutions are not today's
+    const old = cardModel({size: 3, progress, today: "2026-10-08"});
     assert.deepEqual(old.solution, []);
+    assert.equal(old.pieces, null);
     // finished before solutions were saved
     const bare = cardModel({size: 3, progress: {3: {last: "2026-10-07", streak: 2}}, today: "2026-10-07"});
     assert.deepEqual(bare.solution, []);
+    assert.equal(bare.pieces, null);
 });
```

- [ ] **Step 2: Run to confirm they fail**

Run: `node --test progress.test.js home-model.test.js`
Expected: FAIL (the new functions do not exist yet).

- [ ] **Step 3: Apply these changes**

`progress.js`:

```diff
--- a/progress.js
+++ b/progress.js
@@ -8,22 +8,60 @@
 const SIZES = [3, 5, 7];
 const DATE = /^\d{4}-\d{2}-\d{2}$/;
 
-// `solution` is the pieces the player placed, [{x, y, kind}], kept so the home
-// page can show it. The first win of a day keeps its solution.
+// `solution` is the pieces the player needed to win, [{x, y, kind}]. Solutions are
+// kept by how many pieces they use, so each different way found is remembered:
+//   {last, streak, solutions: {"5": [...], "3": [...]}}
+// The first win of a day sets the streak; finding more ways later never touches it.
 export function recordWin(progress, size, today, solution = []) {
     const entry = progress[size];
     if (entry?.last === today) return progress;
     // a tab left open past midnight winning yesterday's puzzle must not reset today's streak
     if (entry && today < entry.last) return progress;
     const streak = entry?.last === addDays(today, -1) ? entry.streak + 1 : 1;
-    return {...progress, [size]: {last: today, streak, ...(solution.length > 0 && {solution})}};
+    return {...progress, [size]: {last: today, streak, ...(solution.length > 0 && {solutions: {[solution.length]: solution}})}};
 }
 
+// Remembers one more way of solving today's puzzle (the first found with that many pieces).
+export function addSolution(progress, size, today, solution) {
+    const entry = progress[size];
+    if (entry?.last !== today || solution.length === 0 || entry.solutions?.[solution.length]) return progress;
+    return {...progress, [size]: {...entry, solutions: {...entry.solutions, [solution.length]: solution}}};
+}
+
+// How many pieces each of today's found solutions uses, fewest first.
+export function foundCounts(progress, size, today) {
+    const entry = progress[size];
+    if (entry?.last !== today || !entry.solutions) return [];
+    return Object.keys(entry.solutions).map(Number).sort((a, b) => a - b);
+}
+
+// The solution found today that uses the fewest pieces, or [] if none.
+export function cheapestSolution(progress, size, today) {
+    const [fewest] = foundCounts(progress, size, today);
+    return fewest === undefined ? [] : progress[size].solutions[fewest];
+}
+
 // A saved solution is only kept if every piece is a whole cell on this size's board.
 const validSolution = (solution, size) => Array.isArray(solution) && solution.length > 0 && solution.every(piece =>
     piece && Number.isInteger(piece.x) && Number.isInteger(piece.y) &&
     piece.x >= 0 && piece.x < size && piece.y >= 0 && piece.y < size && typeof piece.kind === "string");
 
+// Reads saved solutions, dropping any that are damaged or filed under the wrong
+// piece count. An older save had one `solution`; it becomes one found solution.
+function readSolutions(entry, size) {
+    const found = {};
+    const candidates = entry.solutions && typeof entry.solutions === "object" && !Array.isArray(entry.solutions)
+        ? Object.entries(entry.solutions)
+        : [];
+    if (validSolution(entry.solution, size)) candidates.push([String(entry.solution.length), entry.solution]);
+    for (const [count, solution] of candidates) {
+        if (validSolution(solution, size) && Number(count) === solution.length && !found[solution.length]) {
+            found[solution.length] = solution.map(({x, y, kind}) => ({x, y, kind}));
+        }
+    }
+    return found;
+}
+
 // The streak while it is alive (won today or yesterday), else 0.
 export function streakFor(progress, size, today) {
     const entry = progress[size];
@@ -45,9 +83,8 @@
             const entry = parsed?.[size];
             if (entry && DATE.test(entry.last) && Number.isInteger(entry.streak) && entry.streak > 0) {
                 progress[size] = {last: entry.last, streak: entry.streak};
-                if (validSolution(entry.solution, size)) {
-                    progress[size].solution = entry.solution.map(({x, y, kind}) => ({x, y, kind}));
-                }
+                const solutions = readSolutions(entry, size);
+                if (Object.keys(solutions).length > 0) progress[size].solutions = solutions;
             }
         }
         return progress;
```

`home-model.js`:

```diff
--- a/home-model.js
+++ b/home-model.js
@@ -1,4 +1,4 @@
-import {isDone, streakFor} from "./progress.js";
+import {isDone, streakFor, cheapestSolution} from "./progress.js";
 import {playHref} from "./play-model.js";
 
 // Pure description of one mode's card on the home page.
@@ -25,6 +25,7 @@
 export function cardModel({size, progress, today}) {
     const done = isDone(progress, size, today);
     const streak = streakFor(progress, size, today);
+    const solution = cheapestSolution(progress, size, today);   // the way found with the fewest pieces
     let streakText = "no streak yet";
     if (streak === 1) streakText = "1 day";
     else if (streak > 1) streakText = `${streak} days`;
@@ -35,7 +36,8 @@
         done,
         streak,
         roman: toRoman(streak),
-        solution: done ? progress[size].solution ?? [] : [],   // the pieces the player placed today
+        solution,
+        pieces: solution.length > 0 ? solution.length : null,
         streakText,
         playLabel: done ? "Review" : "Play",
         dailyHref: playHref(size, "daily"),
```

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add progress.js progress.test.js home-model.js home-model.test.js
git commit -m "Keep every way a player solves the daily; cards use the cheapest

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: What the game says after a solve

**Files:**
- Modify: `play-model.js`, `play-model.test.js`

**Interfaces:**
- Produces: `winMessage({daily, firstWin, streak, pieces, newWay = false, cheaperLeft = 0, allFound = false}) -> string` (lines joined with `\n`; unlimited is always `"Solved!"`); `waysSummary(solutions, foundCounts) -> {total, found, cheaperLeft, allFound, items: [{found, label}]}` (a found way's label is `"K pieces"`, an unfound one's is `"?"`; `cheaperLeft` counts known ways with fewer pieces than the cheapest found, and is 0 when nothing is found).

- [ ] **Step 1: Update the tests**

```diff
--- a/play-model.test.js
+++ b/play-model.test.js
@@ -1,6 +1,6 @@
 import test from "node:test";
 import assert from "node:assert/strict";
-import {parsePlayParams, playTitle, playHref, winMessage, CANVAS_SIZES, PLAY_SIZES} from "./play-model.js";
+import {parsePlayParams, playTitle, playHref, winMessage, waysSummary, CANVAS_SIZES, PLAY_SIZES} from "./play-model.js";
 
 test("the play page reads its size and mode from the URL", () => {
     assert.deepEqual(parsePlayParams("?size=5&mode=daily"), {size: 5, mode: "daily"});
@@ -35,3 +35,48 @@
     assert.equal(winMessage({daily: true, firstWin: true, streak: 4}), "Solved! Streak: 4 days");
     assert.equal(winMessage({daily: true, firstWin: false, streak: 4}), "Solved again!");
 });
+
+test("daily win messages say how many pieces were used, and nudge toward cheaper ways", () => {
+    // first win, not the cheapest way
+    assert.equal(winMessage({daily: true, firstWin: true, streak: 1, pieces: 5, cheaperLeft: 2}),
+        "Solved! Streak: 1 day\nUsed 5 pieces.\nCheaper ways exist: try for fewer pieces.");
+    assert.equal(winMessage({daily: true, firstWin: true, streak: 3, pieces: 4, cheaperLeft: 1}),
+        "Solved! Streak: 3 days\nUsed 4 pieces.\nA cheaper way exists: try for fewer pieces.");
+    // first win with the cheapest way: no nudge
+    assert.equal(winMessage({daily: true, firstWin: true, streak: 2, pieces: 3, cheaperLeft: 0}),
+        "Solved! Streak: 2 days\nUsed 3 pieces.");
+    // a later, different way
+    assert.equal(winMessage({daily: true, firstWin: false, streak: 2, pieces: 4, newWay: true, cheaperLeft: 1}),
+        "A new way to solve it!\nUsed 4 pieces.\nA cheaper way exists: try for fewer pieces.");
+    // the same way again
+    assert.equal(winMessage({daily: true, firstWin: false, streak: 2, pieces: 4, cheaperLeft: 1}),
+        "Solved again!\nUsed 4 pieces.\nA cheaper way exists: try for fewer pieces.");
+    // every way found
+    assert.equal(winMessage({daily: true, firstWin: false, streak: 2, pieces: 3, newWay: true, allFound: true}),
+        "A new way to solve it!\nUsed 3 pieces.\nYou found every way!");
+    // one piece reads in the singular
+    assert.equal(winMessage({daily: true, firstWin: true, streak: 1, pieces: 1}), "Solved! Streak: 1 day\nUsed 1 piece.");
+    // unlimited never says any of it
+    assert.equal(winMessage({daily: false, pieces: 4, cheaperLeft: 2}), "Solved!");
+});
+
+test("waysSummary: how many ways there are, which are found, how many cheaper ones remain", () => {
+    const five = Array.from({length: 5}, (_, i) => ({x: i, y: 0, kind: "tee"}));
+    const four = five.slice(0, 4), three = five.slice(0, 3);
+    const solutions = [five, four, three];
+    assert.deepEqual(waysSummary(solutions, [5]), {
+        total: 3, found: 1, cheaperLeft: 2, allFound: false,
+        items: [{found: true, label: "5 pieces"}, {found: false, label: "?"}, {found: false, label: "?"}],
+    });
+    assert.deepEqual(waysSummary(solutions, [5, 3]), {
+        total: 3, found: 2, cheaperLeft: 0, allFound: false,
+        items: [{found: true, label: "5 pieces"}, {found: false, label: "?"}, {found: true, label: "3 pieces"}],
+    });
+    const all = waysSummary(solutions, [3, 4, 5]);
+    assert.equal(all.allFound, true);
+    assert.equal(all.cheaperLeft, 0);
+    // found with 4 first: only the 3-piece way is cheaper
+    assert.equal(waysSummary(solutions, [4]).cheaperLeft, 1);
+    // nothing found yet
+    assert.equal(waysSummary(solutions, []).cheaperLeft, 0);
+});
```

- [ ] **Step 2: Run to confirm they fail**

Run: `node --test play-model.test.js`
Expected: FAIL (`waysSummary` does not exist; the new `winMessage` cases fail).

- [ ] **Step 3: Apply this change to `play-model.js`**

```diff
--- a/play-model.js
+++ b/play-model.js
@@ -25,8 +25,34 @@
     return mode === "daily" ? `Daily · ${board} · ${formatDay(today)}` : `Unlimited · ${board}`;
 }
 
-export function winMessage({daily, firstWin, streak}) {
+const piecesText = count => `${count} ${count === 1 ? "piece" : "pieces"}`;
+
+// What the banner says after a win, one line per "\n". A daily win also says how
+// many pieces the player needed and, if the puzzle has cheaper ways, nudges
+// toward them without saying how many pieces they use.
+export function winMessage({daily, firstWin, streak, pieces, newWay = false, cheaperLeft = 0, allFound = false}) {
     if (!daily) return "Solved!";
-    if (!firstWin) return "Solved again!";
-    return `Solved! Streak: ${streak} ${streak === 1 ? "day" : "days"}`;
+    const lines = [];
+    if (firstWin) lines.push(`Solved! Streak: ${streak} ${streak === 1 ? "day" : "days"}`);
+    else lines.push(newWay ? "A new way to solve it!" : "Solved again!");
+    if (pieces) lines.push(`Used ${piecesText(pieces)}.`);
+    if (allFound) lines.push("You found every way!");
+    else if (cheaperLeft > 0) lines.push(`${cheaperLeft === 1 ? "A cheaper way exists" : "Cheaper ways exist"}: try for fewer pieces.`);
+    return lines.join("\n");
 }
+
+// The puzzle's known ways to solve it (largest first) against the piece counts the
+// player has found. Ways not yet found show only "?", so their sizes stay a secret.
+export function waysSummary(solutions, foundCounts) {
+    const counts = solutions.map(solution => solution.length).sort((a, b) => b - a);
+    const isFound = count => foundCounts.includes(count);
+    // "cheaper" means fewer pieces than the cheapest way found so far; with none found there is no yardstick
+    const fewestFound = foundCounts.length > 0 ? Math.min(...foundCounts) : 0;
+    return {
+        total: counts.length,
+        found: counts.filter(isFound).length,
+        cheaperLeft: counts.filter(count => count < fewestFound).length,
+        allFound: counts.length > 0 && counts.every(isFound),
+        items: counts.map(count => ({found: isFound(count), label: isFound(count) ? piecesText(count) : "?"})),
+    };
+}
```

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add play-model.js play-model.test.js
git commit -m "Say how many pieces a daily solve used and nudge toward cheaper ways

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Loading the pre-built dailies

**Files:**
- Create: `daily-data.js`, `daily-data.test.js`

**Interfaces:**
- Consumes: `dailyDefinition` (`daily.js`).
- Produces: `loadDailyFile(url = "dailies.json", fetchFile = fetch) -> file | null` (null if missing, damaged or offline); `pickDaily(file, date, size) -> {definition, solutions} | null` (validates the shape); `getDaily(file, date, size) -> {definition, solutions}` where `solutions` is `null` for the live fallback.

- [ ] **Step 1: Write the failing tests** (`daily-data.test.js`)

```js
import test from "node:test";
import assert from "node:assert/strict";
import {pickDaily, getDaily, loadDailyFile} from "./daily-data.js";
import {dailyDefinition} from "./daily.js";

const definition = {
    name: "Daily 2026-10-07",
    size: 3,
    locked: [[0, 0, "igniter", 1], [0, 2, "receiver", 1], [1, 1, "receiver", 1]],
    hand: ["burster", "pusher"],
    solution: [{x: 0, y: 1, kind: "burster"}],
};
const solutions = [[{x: 0, y: 1, kind: "burster"}]];
const file = {version: 1, puzzles: {"2026-10-07": {3: {attempt: 4, definition, solutions}}}};

test("pickDaily returns the pre-built puzzle and its solutions", () => {
    const picked = pickDaily(file, "2026-10-07", 3);
    assert.deepEqual(picked.definition, definition);
    assert.deepEqual(picked.solutions, solutions);
});

test("pickDaily gives null for a missing date, a missing size, or no file", () => {
    assert.equal(pickDaily(file, "2026-10-08", 3), null);
    assert.equal(pickDaily(file, "2026-10-07", 5), null);
    assert.equal(pickDaily(null, "2026-10-07", 3), null);
    assert.equal(pickDaily({}, "2026-10-07", 3), null);
});

test("pickDaily rejects entries that are damaged", () => {
    const bad = [
        {attempt: 1, definition: {...definition, size: 5}, solutions},          // wrong size
        {attempt: 1, definition: {...definition, hand: "x"}, solutions},        // hand is not a list
        {attempt: 1, definition: {...definition, locked: null}, solutions},
        {attempt: 1, definition, solutions: []},                                 // no solutions
        {attempt: 1, definition, solutions: [[{x: 0, y: 1}]]},                   // a piece with no kind
        {attempt: 1, definition, solutions: "oops"},
        null,
    ];
    for (const entry of bad) {
        assert.equal(pickDaily({version: 1, puzzles: {"2026-10-07": {3: entry}}}, "2026-10-07", 3), null, JSON.stringify(entry));
    }
});

test("getDaily uses the file when it has the day, and the live seeded puzzle when it does not", () => {
    assert.deepEqual(getDaily(file, "2026-10-07", 3), {definition, solutions});
    // not in the file: the live daily, with no list of solutions
    const live = getDaily(file, "2027-02-01", 5);
    assert.deepEqual(live, {definition: dailyDefinition("2027-02-01", 5), solutions: null});
    // no file at all
    assert.deepEqual(getDaily(null, "2027-02-01", 7), {definition: dailyDefinition("2027-02-01", 7), solutions: null});
});

test("loadDailyFile reads the file, and gives null if it cannot", async () => {
    const ok = await loadDailyFile("dailies.json", async url => ({ok: true, json: async () => ({url, ...file})}));
    assert.equal(ok.url, "dailies.json");
    assert.deepEqual(ok.puzzles, file.puzzles);
    assert.equal(await loadDailyFile("dailies.json", async () => ({ok: false, status: 404})), null);
    assert.equal(await loadDailyFile("dailies.json", async () => { throw new Error("offline"); }), null);
    assert.equal(await loadDailyFile("dailies.json", async () => ({ok: true, json: async () => { throw new Error("not json"); }})), null);
    assert.equal(await loadDailyFile("dailies.json", async () => ({ok: true, json: async () => "text"})), null);
});
```

- [ ] **Step 2: Run to confirm they fail**

Run: `node --test daily-data.test.js`
Expected: FAIL (`./daily-data.js` does not exist).

- [ ] **Step 3: Create `daily-data.js`**

```js
import {dailyDefinition} from "./daily.js";

// The pre-built daily puzzles: dailies.json, written by tools/build-dailies.mjs.
//   {version: 1, puzzles: {"2026-10-07": {"5": {attempt, definition, solutions}}}}
// `solutions` is the full list of ways to solve the puzzle (each a list of
// {x, y, kind}), largest first. A day that is not in the file (the list ran out,
// or the file did not load) falls back to the live seeded puzzle, which has no
// solution list.

const validPiece = piece => piece && Number.isInteger(piece.x) && Number.isInteger(piece.y) && typeof piece.kind === "string";

export function pickDaily(file, date, size) {
    const entry = file?.puzzles?.[date]?.[size];
    const definition = entry?.definition;
    if (!definition || definition.size !== size || !Array.isArray(definition.locked) || !Array.isArray(definition.hand) || !Array.isArray(definition.solution)) return null;
    const solutions = entry.solutions;
    if (!Array.isArray(solutions) || solutions.length === 0) return null;
    if (!solutions.every(solution => Array.isArray(solution) && solution.length > 0 && solution.every(validPiece))) return null;
    return {definition, solutions};
}

// {definition, solutions}: from the file if it has the day, else the live puzzle
// (solutions: null).
export function getDaily(file, date, size) {
    return pickDaily(file, date, size) ?? {definition: dailyDefinition(date, size), solutions: null};
}

// Fetches the file. Gives null if it is missing or damaged, so the game still works.
export async function loadDailyFile(url = "dailies.json", fetchFile = fetch) {
    try {
        const response = await fetchFile(url);
        if (!response.ok) return null;
        const file = await response.json();
        return file && typeof file === "object" && file.puzzles ? file : null;
    } catch {
        return null;
    }
}
```

- [ ] **Step 4: Run the tests, then the suite**

Run: `node --test daily-data.test.js && npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add daily-data.js daily-data.test.js
git commit -m "Load pre-built dailies, falling back to the live seeded puzzle

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The build script

**Files:**
- Create: `tools/daily-builder.js`, `tools/daily-builder.test.js`, `tools/build-dailies.mjs`, `tools/build-dailies-worker.mjs`, `tools/build-dailies.test.js`

**Interfaces:**
- Consumes: `generateDefinition` with `spares: 0` (Task 1), `findSolutions` (Task 2), `dailySeed`/`seededRng` (`daily.js`), `pickDaily` (Task 5, in a test), `addDays`/`easternDateString` (`dates.js`), `SIZES`.
- Produces: `wantedSolutions(size) -> 2 | 3`; `buildDaily(date, size, {maxCandidates, perCandidateMs, onCandidate}) -> {date, size, attempt, definition, solutions} | null` (deterministic: the same date and size always give the same puzzle; accepted only if it has exactly the wanted number of solutions, all with different piece counts, found by a complete search); `dateRange(from, days)`; the command `node tools/build-dailies.mjs [--from] [--days] [--sizes] [--out] [--workers] [--cap-seconds] [--max-candidates]` (keeps what the file already has, saves atomically at most every 2 s, runs on worker threads).

- [ ] **Step 1: Write the failing tests**

`tools/daily-builder.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {buildDaily, wantedSolutions} from "./daily-builder.js";
import {findSolutions, solutionKey} from "../solutions.js";
import {isSensible} from "../lint.js";

test("3x3 dailies want 2 solutions and the others want 3", () => {
    assert.equal(wantedSolutions(3), 2);
    assert.equal(wantedSolutions(5), 3);
    assert.equal(wantedSolutions(7), 3);
});

for (const size of [3, 5]) {
    test(`a ${size}x${size} daily has exactly the wanted solutions, with different piece counts, the main using every piece`, () => {
        const built = buildDaily("2026-10-07", size, {maxCandidates: 20000, perCandidateMs: 5000});
        assert.ok(built, "found nothing");
        const {definition, solutions, attempt} = built;
        assert.equal(definition.size, size);
        assert.equal(definition.name, "Daily 2026-10-07");
        assert.equal(isSensible(definition), true);
        // no spares: the hand is exactly the main solution
        assert.equal(definition.hand.length, definition.solution.length);
        assert.equal(solutions.length, wantedSolutions(size));
        const counts = solutions.map(solution => solution.length);
        assert.equal(new Set(counts).size, counts.length, `piece counts ${counts}`);
        assert.equal(counts[0], definition.hand.length);          // largest first, and it uses every piece
        assert.ok(counts.every((count, i) => i === 0 || count < counts[i - 1]));
        assert.ok(Number.isInteger(attempt) && attempt >= 0);
        // the stored list is the complete list: solving again gives the same ways
        const again = findSolutions(definition);
        assert.equal(again.complete, true);
        assert.deepEqual(again.solutions.map(solutionKey), solutions.map(solutionKey));
    });
}

test("building the same day twice gives the same puzzle", () => {
    const a = buildDaily("2026-10-08", 3, {maxCandidates: 20000, perCandidateMs: 5000});
    const b = buildDaily("2026-10-08", 3, {maxCandidates: 20000, perCandidateMs: 5000});
    assert.deepEqual(a, b);
});

test("different days give different puzzles", () => {
    const a = buildDaily("2026-10-07", 5, {maxCandidates: 20000, perCandidateMs: 5000});
    const b = buildDaily("2026-10-08", 5, {maxCandidates: 20000, perCandidateMs: 5000});
    assert.notDeepEqual(a.definition.locked, b.definition.locked);
});

test("it gives up (null) when no candidate is allowed", () => {
    assert.equal(buildDaily("2026-10-07", 5, {maxCandidates: 0, perCandidateMs: 5000}), null);
});
```

`tools/build-dailies.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtempSync, readFileSync, existsSync, writeFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {pickDaily} from "../daily-data.js";
import {dateRange} from "./build-dailies.mjs";

const script = join(dirname(fileURLToPath(import.meta.url)), "build-dailies.mjs");

test("dateRange lists consecutive days, across a month end", () => {
    assert.deepEqual(dateRange("2026-10-30", 4), ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    assert.deepEqual(dateRange("2026-10-07", 1), ["2026-10-07"]);
});

test("the build script writes a file the game can read, and a second run builds nothing new", () => {
    const dir = mkdtempSync(join(tmpdir(), "qube-dailies-"));
    const out = join(dir, "dailies.json");
    try {
        const run = (...extra) => execFileSync("node", [script, "--from", "2026-10-07", "--days", "2", "--sizes", "3,5", "--out", out, "--workers", "2", ...extra], {encoding: "utf8"});
        const first = run();
        assert.match(first, /built 4/);
        const file = JSON.parse(readFileSync(out, "utf8"));
        assert.equal(file.version, 1);
        for (const date of ["2026-10-07", "2026-10-08"]) {
            for (const size of [3, 5]) {
                const picked = pickDaily(file, date, size);
                assert.ok(picked, `${date} ${size}x${size}`);
                assert.equal(picked.solutions.length, size === 3 ? 2 : 3);
            }
        }
        // running again keeps what is there
        const before = readFileSync(out, "utf8");
        const second = run();
        assert.match(second, /built 0/);
        assert.equal(readFileSync(out, "utf8"), before);
        // a day added later joins the file without disturbing the others
        const third = execFileSync("node", [script, "--from", "2026-10-07", "--days", "3", "--sizes", "3,5", "--out", out, "--workers", "2"], {encoding: "utf8"});
        assert.match(third, /built 2/);
        const grown = JSON.parse(readFileSync(out, "utf8"));
        assert.deepEqual(grown.puzzles["2026-10-07"], file.puzzles["2026-10-07"]);
        assert.ok(pickDaily(grown, "2026-10-09", 5));
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
});

test("it refuses a size it cannot build", () => {
    const dir = mkdtempSync(join(tmpdir(), "qube-dailies-"));
    try {
        assert.throws(() => execFileSync("node", [script, "--sizes", "4", "--out", join(dir, "x.json")], {stdio: "pipe"}));
        assert.equal(existsSync(join(dir, "x.json")), false);
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
});
```

- [ ] **Step 2: Run to confirm they fail**

Run: `node --test tools/daily-builder.test.js tools/build-dailies.test.js`
Expected: FAIL (the modules do not exist).

- [ ] **Step 3: Create the files**

`tools/daily-builder.js`:

```js
import {generateDefinition} from "../generator.js";
import {findSolutions} from "../solutions.js";
import {dailySeed, seededRng} from "../daily.js";

// Builds one pre-made daily puzzle. A candidate is generated from a seed made from
// the date, the size and a counter (so the result is the same every time it is
// built), with no spare pieces (the main solution uses every hand piece), and then
// fully solved. It is accepted only if it has exactly the wanted number of
// solutions, all using different numbers of pieces. 3x3 boards are small, so they
// only need two; the others need three.

export const wantedSolutions = size => (size === 3 ? 2 : 3);

export function buildDaily(date, size, {maxCandidates = 100000, perCandidateMs = 60000, onCandidate} = {}) {
    const want = wantedSolutions(size);
    for (let attempt = 0; attempt < maxCandidates; attempt++) {
        const rng = seededRng(dailySeed(`${date}#${attempt}`, size));
        const definition = {...generateDefinition({size, rng, spares: 0}), name: `Daily ${date}`};
        // stop as soon as there are more solutions than wanted, or it takes too long
        const {solutions, complete} = findSolutions(definition, {maxSolutions: want + 1, timeLimitMs: perCandidateMs});
        onCandidate?.({attempt, solutions: solutions.length, complete});
        if (!complete || solutions.length !== want) continue;
        const counts = new Set(solutions.map(solution => solution.length));
        if (counts.size !== want) continue;
        return {date, size, attempt, definition, solutions};
    }
    return null;
}
```

`tools/build-dailies-worker.mjs`:

```js
import {parentPort} from "node:worker_threads";
import {buildDaily} from "./daily-builder.js";

// Builds one day-and-size at a time for the main script.
parentPort.on("message", ({date, size, capMs, maxCandidates}) => {
    const started = Date.now();
    const built = buildDaily(date, size, {perCandidateMs: capMs, maxCandidates});
    parentPort.postMessage({date, size, built, seconds: (Date.now() - started) / 1000});
});
```

`tools/build-dailies.mjs`:

```js
// Pre-builds the daily puzzles into dailies.json, so every daily has a verified,
// complete list of ways to solve it (3 ways, or 2 for 3x3), with the main way
// using every piece in the hand.
//
//   node tools/build-dailies.mjs [--from YYYY-MM-DD] [--days 30] [--sizes 3,5,7]
//        [--out dailies.json] [--workers 4] [--cap-seconds 60] [--max-candidates 20000]
//
// It keeps what is already in the file, so run it again later with a bigger
// --days (or a later --from) to add more. 3x3 and 5x5 take about a second per day;
// 7x7 takes a few minutes per day on one core, so give it several workers.
import {Worker} from "node:worker_threads";
import {readFileSync, writeFileSync, renameSync, existsSync} from "node:fs";
import {cpus} from "node:os";
import {fileURLToPath} from "node:url";
import {dirname, join, resolve} from "node:path";
import {addDays, easternDateString} from "../dates.js";
import {SIZES} from "../generator.js";

export function dateRange(from, days) {
    return Array.from({length: days}, (_, i) => addDays(from, i));
}

function parseArgs(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i += 2) {
        const flag = argv[i];
        if (!flag.startsWith("--") || argv[i + 1] === undefined) throw new Error(`bad argument: ${flag}`);
        args[flag.slice(2)] = argv[i + 1];
    }
    return args;
}

async function main() {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    const args = parseArgs(process.argv.slice(2));
    const from = args.from ?? easternDateString();
    const days = Number(args.days ?? 30);
    const sizes = (args.sizes ?? SIZES.join(",")).split(",").map(Number);
    const out = resolve(args.out ?? join(root, "dailies.json"));
    const workers = Math.max(1, Number(args.workers ?? Math.max(1, cpus().length - 1)));
    const capMs = Number(args["cap-seconds"] ?? 60) * 1000;
    const maxCandidates = Number(args["max-candidates"] ?? 20000);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) throw new Error(`--from must look like 2026-10-07, not ${from}`);
    for (const size of sizes) if (!SIZES.includes(size)) throw new Error(`cannot build ${size}x${size} puzzles (sizes: ${SIZES.join(", ")})`);

    const file = existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : {version: 1, puzzles: {}};
    file.version = 1;
    file.puzzles ??= {};
    const tasks = [];
    for (const date of dateRange(from, days)) {
        for (const size of sizes) {
            if (!file.puzzles[date]?.[size]) tasks.push({date, size, capMs, maxCandidates});
        }
    }
    console.log(`${tasks.length} to build (${days} days from ${from}, sizes ${sizes.join(",")}), ${workers} workers, writing ${out}`);

    const save = () => {
        file.built = new Date().toISOString().slice(0, 10);
        writeFileSync(`${out}.tmp`, JSON.stringify(file));
        renameSync(`${out}.tmp`, out);   // the file is never left half written
    };
    // the file grows to about a megabyte, so save at most every couple of seconds (and once at the end)
    let lastSave = 0, unsaved = false;
    const saveSoon = () => {
        if (Date.now() - lastSave >= 2000) {
            save();
            lastSave = Date.now();
            unsaved = false;
        } else {
            unsaved = true;
        }
    };
    let built = 0, failed = 0, done = 0;
    const started = Date.now();
    await new Promise(finish => {
        if (tasks.length === 0) return finish();
        let active = 0;
        const pool = [];
        const next = worker => {
            const task = tasks.shift();
            if (!task) {
                worker.terminate();
                if (--active === 0) finish();
                return;
            }
            worker.postMessage(task);
        };
        for (let i = 0; i < Math.min(workers, tasks.length); i++) {
            const worker = new Worker(join(dirname(fileURLToPath(import.meta.url)), "build-dailies-worker.mjs"));
            pool.push(worker);
            active++;
            worker.on("message", ({date, size, built: result, seconds}) => {
                done++;
                if (result) {
                    (file.puzzles[date] ??= {})[size] = {attempt: result.attempt, definition: result.definition, solutions: result.solutions};
                    built++;
                    saveSoon();
                } else {
                    failed++;
                }
                const elapsed = Math.round((Date.now() - started) / 1000);
                console.log(`${result ? "ok  " : "FAIL"} ${date} ${size}x${size}  ${seconds.toFixed(1)}s  (${done} done, ${elapsed}s elapsed)`);
                next(worker);
            });
            worker.on("error", error => {
                console.error(error);
                process.exitCode = 1;
                next(worker);
            });
            next(worker);
        }
    });
    if (unsaved) save();
    console.log(`built ${built}${failed ? `, could not build ${failed} (those days fall back to a live puzzle)` : ""}`);
}

// run only when started from the command line, not when imported by a test
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    main().catch(error => {
        console.error(error.message);
        process.exit(1);
    });
}
```

- [ ] **Step 4: Run the tests, then the suite**

Run: `node --test tools/daily-builder.test.js tools/build-dailies.test.js && npm test`
Expected: all pass (the builder tests take about a second).

- [ ] **Step 5: Commit**

```bash
git add tools/daily-builder.js tools/daily-builder.test.js tools/build-dailies.mjs tools/build-dailies-worker.mjs tools/build-dailies.test.js
git commit -m "Add the script that pre-builds daily puzzles with all their solutions

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The daily page, the home card, and the data

**Files:**
- Modify: `game.js`, `home.js`, `play.html`, `play.css`, `tools/e2e-daily.mjs`
- Create: `dailies.json` (built)

**Interfaces:**
- Consumes: everything above (`getDaily`/`loadDailyFile`, `minimalSubset`, `recordWin`/`addSolution`/`foundCounts`, `waysSummary`/`winMessage`, `cardModel`'s `solution` and `pieces`).
- Behavior: see the spec sections 6 and 7. DOM contract: `play.html` gains `#ways-box.up.box` (hidden until used) wrapping `#ways`; the game rewrites only the inner `#ways`, never an `.up` itself. `#result-text` shows several lines (`white-space: pre-line`).

- [ ] **Step 1: Apply these changes**

`game.js`:

```diff
--- a/game.js
+++ b/game.js
@@ -8,10 +8,11 @@
 import {generateDefinition} from "./generator.js";
 import {initTutorial} from "./tutorial.js";
 import {canDrag, applyDrop, validatePuzzle, placedPieces} from "./rules.js";
-import {parsePlayParams, playTitle, winMessage, CANVAS_SIZES} from "./play-model.js";
+import {parsePlayParams, playTitle, winMessage, waysSummary, CANVAS_SIZES} from "./play-model.js";
 import {easternDateString} from "./dates.js";
-import {dailyDefinition} from "./daily.js";
-import {loadProgress, saveProgress, recordWin, isDone, mergeProgress, browserStorage} from "./progress.js";
+import {loadDailyFile, getDaily} from "./daily-data.js";
+import {minimalSubset} from "./solutions.js";
+import {loadProgress, saveProgress, recordWin, addSolution, foundCounts, isDone, mergeProgress, browserStorage} from "./progress.js";
 import {startInk} from "./ink.js";
 
 // Which board and which mode this page is for comes from the URL
@@ -40,8 +41,12 @@
 const board = new Board(canvas, boardSize, gridScale);
 
 // The puzzle being played: today's daily puzzle, or a random one in unlimited
-// mode. Clear Board rebuilds fresh pieces from this definition.
-let activeDefinition = isDaily ? dailyDefinition(today, gridScale) : generateDefinition({size: gridScale});
+// mode. Clear Board rebuilds fresh pieces from this definition. The daily comes
+// from the pre-built list when it has today (with every known way to solve it);
+// otherwise it is generated live and no list of ways is known.
+const daily = isDaily ? getDaily(await loadDailyFile(), today, gridScale) : null;
+const knownSolutions = daily?.solutions ?? null;
+let activeDefinition = daily ? daily.definition : generateDefinition({size: gridScale});
 
 document.getElementById("page-title").textContent = playTitle({size: gridScale, mode: params.mode, today});
 document.title = `qube · ${playTitle({size: gridScale, mode: params.mode, today})}`;
@@ -279,18 +284,62 @@
 
 let progress = loadProgress(browserStorage());
 
+// The "ways to solve it" box (daily only, once there is something to say): how
+// many ways there are and which have been found.
+const waysBox = document.getElementById("ways-box");
+const waysEl = document.getElementById("ways");
+
+function showWays(ways) {
+    waysBox.hidden = !ways;
+    if (!ways) return;
+    const title = document.createElement("div");
+    title.className = "ways-title";
+    title.textContent = `Ways to solve it: ${ways.found} of ${ways.total} found`;
+    const list = document.createElement("ul");
+    list.className = "ways-list";
+    for (const item of ways.items) {
+        const entry = document.createElement("li");
+        entry.className = item.found ? "found" : "";
+        entry.textContent = item.found ? `${item.label} ✓` : item.label;
+        list.appendChild(entry);
+    }
+    waysEl.replaceChildren(title, list);
+}
+
+// A daily already solved today shows its ways when the page opens.
+if (isDaily && knownSolutions && isDone(progress, gridScale, today)) {
+    showWays(waysSummary(knownSolutions, foundCounts(progress, gridScale, today)));
+}
+
 // What a win says. The first win of a daily puzzle records the day and the
-// streak; winning it again (Keep going, or replaying a finished day) changes nothing.
+// streak; every different way found (by how many pieces it needs) is kept, but
+// solving it again the same way changes nothing.
 function winText() {
     if (!isDaily) return winMessage({daily: false});
     // work from the latest saved data, in case another tab has saved since this page loaded
     progress = mergeProgress(progress, loadProgress(browserStorage()));
     const firstWin = !isDone(progress, gridScale, today);
-    if (firstWin) {
-        progress = recordWin(progress, gridScale, today, placedPieces(preRunGrid ?? board.grid));
-        saveProgress(browserStorage(), progress);
+    // the pieces this win needed: decoys the player put down do not count
+    const used = minimalSubset(activeDefinition, placedPieces(preRunGrid ?? board.grid)) ?? [];
+    const before = foundCounts(progress, gridScale, today);
+    if (firstWin) progress = recordWin(progress, gridScale, today, used);
+    progress = addSolution(progress, gridScale, today, used);
+    saveProgress(browserStorage(), progress);
+    const ways = knownSolutions ? waysSummary(knownSolutions, foundCounts(progress, gridScale, today)) : null;
+    showWays(ways);
+    // the list of ways is complete, so nobody can beat its cheapest one: say so loudly if that ever happens
+    if (knownSolutions && used.length > 0 && used.length < Math.min(...knownSolutions.map(solution => solution.length))) {
+        console.error(`A player solved ${today} (${gridScale}x${gridScale}) with ${used.length} pieces, fewer than the known ways`, used);
     }
-    return winMessage({daily: true, firstWin, streak: progress[gridScale].streak});
+    return winMessage({
+        daily: true,
+        firstWin,
+        streak: progress[gridScale].streak,
+        pieces: used.length || undefined,
+        newWay: !before.includes(used.length),
+        cheaperLeft: ways?.cheaperLeft ?? 0,
+        allFound: ways?.allFound ?? false,
+    });
 }
 
 function showResult(won) {
```

`home.js`:

```diff
--- a/home.js
+++ b/home.js
@@ -1,5 +1,5 @@
 import {easternDateString, msUntilNextEasternMidnight, formatCountdown} from "./dates.js";
-import {dailyDefinition} from "./daily.js";
+import {loadDailyFile, getDaily} from "./daily-data.js";
 import {loadProgress, browserStorage} from "./progress.js";
 import {cardModel} from "./home-model.js";
 import {buildFromDefinition, makePiece, KINDS} from "./puzzles.js";
@@ -8,6 +8,7 @@
 import {startInk} from "./ink.js";
 
 const today = easternDateString();
+const dailyFile = await loadDailyFile();   // the pre-built puzzles, if the file loads
 
 const dateText = new Intl.DateTimeFormat("en-US", {timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric"});
 document.getElementById("today").textContent = dateText.format(new Date());
@@ -32,7 +33,7 @@
 // and targets that start on the board, plus (once the day is won) the pieces the
 // player placed, which have no padlock. Before that the hand is not shown.
 function drawPreview(canvas, size, solution) {
-    const {grid} = buildFromDefinition(dailyDefinition(today, size));
+    const {grid} = buildFromDefinition(getDaily(dailyFile, today, size).definition);
     for (const {x, y, kind} of solution) {
         if (KINDS[kind] && grid[x][y].isEmpty) grid[x][y] = makePiece(kind, 1, false, false);
     }
@@ -67,7 +68,7 @@
     const article = element("article", "up card");
     article.dataset.size = String(size);
     article.dataset.done = String(card.done);
-    article.dataset.placed = String(card.solution.length);   // pieces of the player's solution shown
+    article.dataset.placed = String(card.solution.length);   // pieces of the player's cheapest solution shown
 
     article.appendChild(element("div", "up tag size", card.title));
     article.appendChild(streakTag(card));
@@ -92,7 +93,7 @@
     buttons.append(play, unlimited);
     article.appendChild(buttons);
 
-    article.appendChild(element("p", "sub", card.label));
+    article.appendChild(element("p", "sub", card.pieces ? `${card.label} · ${card.pieces} ${card.pieces === 1 ? "piece" : "pieces"}` : card.label));
     return article;
 }
```

`play.html`:

```diff
--- a/play.html
+++ b/play.html
@@ -63,6 +63,7 @@
             </div>
         </div>
         <div id="result-banner" class="up box hidden"><span id="result-text"></span></div>
+        <div id="ways-box" class="up box" hidden><div id="ways"></div></div>
     </div>
 </div>
```

`play.css`:

```diff
--- a/play.css
+++ b/play.css
@@ -200,3 +200,44 @@
         max-width: 420px;
     }
 }
+
+/* ---------- ways to solve the daily ---------- */
+
+body.play #result-text {
+    white-space: pre-line;   /* a win can say several things, one per line */
+}
+
+body.play #ways-box {
+    margin: 0 6px 6px 0;
+}
+
+body.play #ways {
+    padding: 12px 16px;
+    font-size: 18px;
+}
+
+body.play .ways-title {
+    margin-bottom: 6px;
+}
+
+body.play .ways-list {
+    display: flex;
+    flex-wrap: wrap;
+    gap: 8px;
+    margin: 0;
+    padding: 0;
+    list-style: none;
+}
+
+body.play .ways-list li {
+    padding: 2px 10px;
+    border: 2px dashed var(--ink);
+    border-radius: 12px 16px 11px 17px / 16px 11px 17px 12px;
+    opacity: 0.6;
+}
+
+body.play .ways-list li.found {
+    border-style: solid;
+    color: var(--green);
+    opacity: 1;
+}
```

`tools/e2e-daily.mjs`:

```diff
--- a/tools/e2e-daily.mjs
+++ b/tools/e2e-daily.mjs
@@ -10,11 +10,12 @@
 // QUP_DEBUG_PORT (default 9333). Screenshots are written to a temp folder that
 // is printed at the end.
 import {spawn} from "node:child_process";
-import {mkdtempSync, rmSync, writeFileSync} from "node:fs";
+import {mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync} from "node:fs";
 import {tmpdir} from "node:os";
-import {join} from "node:path";
+import {join, dirname} from "node:path";
+import {fileURLToPath} from "node:url";
 
-import {dailyDefinition} from "../daily.js";
+import {getDaily} from "../daily-data.js";
 import {easternDateString} from "../dates.js";
 import {Board} from "../board.js";
 import {CANVAS_SIZES} from "../play-model.js";
@@ -26,7 +27,11 @@
 const outDir = mkdtempSync(join(tmpdir(), "qup-e2e-"));
 
 const today = easternDateString();
-const definition = dailyDefinition(today, size);
+// the pre-built puzzle for today if dailies.json has it (with every way to solve it), else the live one
+const dailiesPath = join(dirname(fileURLToPath(import.meta.url)), "..", "dailies.json");
+const daily = getDaily(existsSync(dailiesPath) ? JSON.parse(readFileSync(dailiesPath, "utf8")) : null, today, size);
+const definition = daily.definition;
+const ways = daily.solutions;   // largest first, or null when today's puzzle was generated live
 
 const chrome = spawn(CHROME, [
     "--headless=new", "--disable-gpu", `--remote-debugging-port=${port}`, `--user-data-dir=${join(outDir, "profile")}`,
@@ -91,7 +96,7 @@
 
     await send("Page.enable");
     await send("Runtime.enable");
-    console.log(`today (Eastern): ${today}; ${size}x${size} daily has ${definition.solution.length} pieces to place`);
+    console.log(`today (Eastern): ${today}; ${size}x${size} daily has ${definition.solution.length} pieces in the main solution; ways: ${ways ? ways.map(w => w.length).join("/") : "unknown (live puzzle)"}`);
 
     // ---- start from a clean slate, with the tutorial marked as seen
     await go(`${BASE}/index.html`);
@@ -99,13 +104,14 @@
     await go(`${BASE}/play.html?size=${size}&mode=daily`);
     await evaluate(`document.querySelector('[data-speed="1000"]').click()`);   // instant animation
 
-    async function placeSolution() {
+    // Drags a layout (a list of {x, y, kind}) from the hand onto the board.
+    async function placeLayout(layout) {
         const boardSize = CANVAS_SIZES[size];
         const gridSize = (boardSize - Board.OUTLINE_STROKE - size * Board.GRID_STROKE) / size;
         const canvas = JSON.parse(await evaluate(`JSON.stringify(document.getElementById("canvas").getBoundingClientRect())`));
-        // which hand tile each solution piece comes from (same matching as Show Solution)
+        // which hand tile each piece comes from (the hand starts in definition.hand order)
         const used = new Set();
-        const placements = definition.solution.map(({x, y, kind}) => {
+        const placements = layout.map(({x, y, kind}) => {
             const index = definition.hand.findIndex((k, i) => k === kind && !used.has(i));
             used.add(index);
             return {x, y, index};
@@ -125,31 +131,73 @@
             await sleep(150);
         }
     }
+    const placeSolution = () => placeLayout(definition.solution);   // the main way: every hand piece
+    // Solve, then "Keep going" and clear the board, ready to try a different way.
+    const runAndWait = async () => {
+        await evaluate(`document.getElementById("run-button").click()`);
+        await sleep(1500);
+    };
+    const startOver = async () => {
+        await evaluate(`document.getElementById("run-button").click()`);   // "Keep going" restores the layout
+        await sleep(300);
+        await evaluate(`document.getElementById("clear-button").click()`);
+        await sleep(300);
+    };
 
     const banner = () => evaluate(`document.getElementById("result-banner").classList.contains("hidden") ? "(hidden)" : document.getElementById("result-text").textContent`);
     const runLabel = () => evaluate(`document.getElementById("run-label").textContent`);
     const progress = () => evaluate(`localStorage.getItem("qup-progress-v1")`);
 
-    // ---- 1. first win
+    const piecesWord = n => `${n} ${n === 1 ? "piece" : "pieces"}`;
+    const waysText = () => evaluate(`document.getElementById("ways-box").hidden ? "(hidden)" : document.getElementById("ways").innerText`);
+    const mainCount = definition.solution.length;
+    const cheaper = ways ? ways.slice(1) : [];   // the clever ways, largest first
+
+    // ---- 1. first win, with the main way (every piece)
     await placeSolution();
     await shot("1-placed");
-    await evaluate(`document.getElementById("run-button").click()`);
-    await sleep(1500);
+    await runAndWait();
     const firstBanner = await banner();
-    console.log("first run banner:", firstBanner, "| run button:", await runLabel());
+    console.log("first run banner:", JSON.stringify(firstBanner), "| run button:", await runLabel());
     console.log("saved progress:", await progress());
-    check(/^Solved! Streak: 1 day/.test(firstBanner), `first-run banner was "${firstBanner}"`);
+    check(firstBanner.startsWith("Solved! Streak: 1 day"), `first-run banner was "${firstBanner}"`);
+    if (ways) {
+        check(firstBanner.includes(`Used ${piecesWord(mainCount)}.`), `banner did not say ${mainCount} pieces: "${firstBanner}"`);
+        check(/ways? exists?: try for fewer pieces\./.test(firstBanner), `banner did not say cheaper ways exist: "${firstBanner}"`);
+        const text = await waysText();
+        console.log("ways box:", JSON.stringify(text));
+        check(text.includes(`1 of ${ways.length} found`), `ways box was "${text}"`);
+        check(text.includes(piecesWord(mainCount)), `ways box did not list the ${mainCount}-piece way: "${text}"`);
+    }
     await shot("2-solved");
 
-    // ---- 2. keep going and win again: no change to the streak
-    await evaluate(`document.getElementById("run-button").click()`);   // "Keep going" restores the layout
-    await sleep(300);
-    await evaluate(`document.getElementById("run-button").click()`);   // Run again
-    await sleep(1500);
+    // ---- 2. the same way again changes nothing; then the cheaper ways are found one by one
+    await startOver();
+    await placeSolution();
+    await runAndWait();
     const secondBanner = await banner();
     const savedBeforeReplay = await progress();
-    console.log("second win banner:", secondBanner, "| saved progress:", savedBeforeReplay);
-    check(secondBanner === "Solved again!", `second-win banner was "${secondBanner}"`);
+    console.log("same way again:", JSON.stringify(secondBanner));
+    check(secondBanner.startsWith("Solved again!"), `second-win banner was "${secondBanner}"`);
+    for (const [i, layout] of cheaper.entries()) {
+        await startOver();
+        await placeLayout(layout);
+        await runAndWait();
+        const text = await banner();
+        console.log(`a cheaper way (${layout.length} pieces):`, JSON.stringify(text));
+        check(text.startsWith("A new way to solve it!"), `a new way's banner was "${text}"`);
+        check(text.includes(`Used ${piecesWord(layout.length)}.`), `banner did not say ${layout.length} pieces: "${text}"`);
+        if (i === cheaper.length - 1) check(text.includes("You found every way!"), `banner did not say every way was found: "${text}"`);
+    }
+    const savedAfterWays = await progress();
+    console.log("saved progress after finding the ways:", savedAfterWays);
+    if (ways) {
+        const saved = JSON.parse(savedAfterWays)[size];
+        check(saved.streak === 1, `finding more ways changed the streak: ${savedAfterWays}`);
+        check(JSON.stringify(Object.keys(saved.solutions).map(Number).sort((a, b) => a - b)) === JSON.stringify(ways.map(w => w.length).sort((a, b) => a - b)),
+            `saved solutions should be one per way: ${savedAfterWays}`);
+        check((await waysText()).includes(`${ways.length} of ${ways.length} found`), `ways box was "${await waysText()}"`);
+    }
 
     // ---- 3. home page now shows DONE and a streak
     await go(`${BASE}/index.html`);
@@ -160,7 +208,11 @@
     const finished = JSON.parse(await evaluate(`JSON.stringify([...document.querySelectorAll('.card[data-done="true"]')].map(el => [el.dataset.size, el.dataset.placed]))`));
     console.log("finished cards (size, pieces of your solution shown):", JSON.stringify(finished));
     check(finished.length === 1 && finished[0][0] === String(size), `expected one finished ${size}x${size} card, found ${JSON.stringify(finished)}`);
-    check(finished.length === 1 && Number(finished[0][1]) === definition.solution.length, `the card should show your ${definition.solution.length} placed pieces, shows ${finished[0]?.[1]}`);
+    const cheapestCount = ways ? ways[ways.length - 1].length : mainCount;
+    check(finished.length === 1 && Number(finished[0][1]) === cheapestCount, `the card should show your cheapest solution (${cheapestCount} pieces), shows ${finished[0]?.[1]}`);
+    const captions = JSON.parse(await evaluate(`JSON.stringify([...document.querySelectorAll('.card[data-done="true"] .sub')].map(el => el.textContent))`));
+    console.log("finished card caption:", JSON.stringify(captions));
+    check(captions.length === 1 && captions[0].includes(piecesWord(cheapestCount)), `the caption should say ${piecesWord(cheapestCount)}: ${JSON.stringify(captions)}`);
     check(await evaluate(`document.querySelectorAll(".card .stamp").length`) === 0, "the DONE stamp should be gone");
     // cards are in size order 3, 5, 7
     const expectedLabels = [3, 5, 7].map(n => n === size ? "Review" : "Play");
@@ -168,15 +220,16 @@
 
     // ---- 4. replay the finished daily: the banner says "again", the streak is untouched
     await go(`${BASE}/play.html?size=${size}&mode=daily`);
+    if (ways) check((await waysText()).includes(`${ways.length} of ${ways.length} found`), `a finished daily should show its ways when it opens, got "${await waysText()}"`);
     await evaluate(`document.querySelector('[data-speed="1000"]').click()`);
     await placeSolution();
     await evaluate(`document.getElementById("run-button").click()`);
     await sleep(1500);
     const replayBanner = await banner();
     const savedAfterReplay = await progress();
-    console.log("replay banner:", replayBanner, "| saved progress:", savedAfterReplay);
-    check(replayBanner === "Solved again!", `replay banner was "${replayBanner}"`);
-    check(savedAfterReplay === savedBeforeReplay, `progress changed on replay: ${savedBeforeReplay} -> ${savedAfterReplay}`);
+    console.log("replay banner:", JSON.stringify(replayBanner), "| saved progress:", savedAfterReplay);
+    check(replayBanner.startsWith("Solved again!"), `replay banner was "${replayBanner}"`);
+    check(savedAfterReplay === savedAfterWays, `progress changed on replay: ${savedAfterWays} -> ${savedAfterReplay}`);
 
     // ---- 5. a look at every page, for a human to check
     for (const [name, url] of [
```

- [ ] **Step 2: Run the suite and the syntax checks**

```bash
node --check game.js home.js tools/e2e-daily.mjs
npm test
```
Expected: no output from the checks; all tests pass.

- [ ] **Step 3: Build the 3x3 and 5x5 dailies for a year** (about 80 seconds; deterministic, so anyone building these gets the same file)

```bash
node tools/build-dailies.mjs --from <today's date as YYYY-MM-DD> --days 365 --sizes 3,5 --workers 6
```
Use today's Eastern date. It prints `built 730` at the end and writes `dailies.json` in the project root. (7x7 is built separately because it takes minutes per day.)

- [ ] **Step 4: Run the browser check at sizes 3 and 5**

```bash
npm start &            # serves http://localhost:3000
sleep 2
for size in 3 5; do node tools/e2e-daily.mjs $size | grep -v '^screenshot'; echo ---; done
```
Expected, for each size: the first line lists `ways: 2/1` (3x3) or `ways: a/b/c` (5x5; the counts differ per day); the first run banner contains `Solved! Streak: 1 day`, `Used N pieces.` and `ways exist` or `way exists`; the ways box reads `Ways to solve it: 1 of K found`; "same way again" starts with `Solved again!`; each cheaper way prints a banner starting `A new way to solve it!` and the last one contains `You found every way!`; the saved progress lists one solution per way; the finished home card shows the cheapest solution's piece count and a caption like `the classic · 1 piece`; the replay banner starts with `Solved again!`; and the last line is `PASS`. Then stop the server (`pkill -f "node server.js"`).

Also look at two screenshots from the run (the last lines print the folder; read `2-solved.png` and `3-home.png`): the solved page should show a multi-line green message and a "Ways to solve it" box with a green found chip and dashed `?` chips; the home card should show the player's pieces (without padlocks) and the caption.

- [ ] **Step 5: Commit**

```bash
git add game.js home.js play.html play.css tools/e2e-daily.mjs dailies.json
git commit -m "Daily puzzles come with all their ways to solve them

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:** What a solution is (1) and the solver (2) -> Task 2. Building the dailies (3) -> Tasks 1 and 6 (and Task 7 builds the data). Loading and fallback (4) -> Task 5. Tracking (5) -> Task 3. The daily page and messages (6) -> Tasks 4 and 7. The home card (7) -> Tasks 3 and 7. Testing (8) -> tests in every task plus the browser check. Unlimited is untouched.

**Placeholder scan:** none; every file is given in full or as an exact diff. The one value the implementer fills in is today's date in the build command (Task 7, Step 3).

**Type consistency:** `solutionKey`/`findSolutions`/`minimalSubset` (Task 2) are used by Tasks 6 and 7. `recordWin`/`addSolution`/`foundCounts`/`cheapestSolution` (Task 3) are used by `home-model.js` (Task 3) and `game.js` (Task 7). `winMessage`/`waysSummary` (Task 4) are used by `game.js` (Task 7). `getDaily`/`loadDailyFile`/`pickDaily` (Task 5) are used by Tasks 6 and 7. `generateDefinition`'s `spares`/`config` (Task 1) are used by Task 6. Element ids in `play.html` match what `game.js` reads.
