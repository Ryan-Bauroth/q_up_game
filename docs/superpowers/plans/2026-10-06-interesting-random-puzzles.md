# Interesting Random Puzzles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Random puzzles that are always interesting (no pointless pieces, one clear idea per board, optional spare hand pieces), a run that plays one starter at a time in reading order, a cache so "random" is instant, and a new Row piece with a split column/row background.

**Architecture:** The raw generator (`generateDefinition`) stays the source of completable boards. A new gate (`lint.js`) rejects pointless boards, a scorer (`score.js`) rates how strong an idea each board has (themes stay under the hood), and `generateBest`/`startBest` keep the highest-scoring of N candidates. A small cache (`puzzle-cache.js`) builds boards in the background in slices. The engine seeds starters in reading order and drains each chain before the next starter.

**Tech Stack:** Plain ES modules, `node --test` (run with `npm test`), canvas in the browser. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-06-interesting-random-puzzles-design.md` (the Row piece and split tint in Tasks 8-9 were requested after the spec was written).

## Global Constraints

- Tests: `node --test` (`npm test`); the full suite must stay green after every task (currently 90 tests).
- Board is 5x5 (`PUZZLE_SIZE`); the grid is indexed `grid[x][y]` (x = column, y = row).
- Reading order for starters: rows top to bottom, left to right within a row (so `y` is the outer loop).
- Hand is 5 pieces; the solution places 3-4; 1-2 are spares, chosen at random per puzzle.
- Random puzzles only use pieces from the play-tested levels 1-6 (`TESTED_LEVELS = 6` in `generator.js`); do not widen this.
- "Random" must feel instant: cache of 3 boards, refilled in slices of about 4 candidates per `setTimeout`; empty-cache fallback is a 15-candidate pool; a normal pool is 60 candidates (about 0.3 s total in the background).
- Themes are never shown to the player. No Web Worker.
- Commit messages end with: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`
- Match the surrounding code: 4-space indent, double quotes, short explanatory comments, semicolons at the end of statements.

## Interpretation notes (read before starting)

- The user wrote that the new row piece should work "the same as the row piece". This plan reads it as **the same as the Column piece**: a Row piece that activates its whole row (new ability `rowPulse`). The older `sweep` piece (`rowSweep`, every other cell) is kept and also counts as a row beam, so it takes the row color too.
- Row color is `#4a7fc7` (a blue beside the column violet `#7b5fc4`). These are placeholders to tune on screen, as in the earlier visuals spec.
- Row pieces are NOT added to the random generator: only pieces from levels 1-6 are used and no level uses a Row yet. Adding one to a hand-built level (or widening the tested set) is a separate decision.
- Skip pieces `hop`, `dive` and `relay` are likewise outside levels 1-6, so in random puzzles skip chains are built from `leap` and `knight`. The skip theme looks at the real distance of each hit, so it works for any piece.

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `engine.js` | modify | Seed starters in reading order, drain each chain, tag trace steps with `root` |
| `runner.js` | modify | Animate one starter at a time |
| `lint.js` | create | `isSensible(definition)` gate; `layout(definition, skip)` helper |
| `generator.js` | modify | Placement rule, spares, gate; later `startBest`/`generateBest` |
| `score.js` | create | `scorePuzzle(definition)` themes + bonus |
| `puzzle-cache.js` | create | `createPuzzleCache` background cache |
| `game.js` | modify | Use the cache for the random and New buttons |
| `abilities.js`, `puzzles.js`, `pieces.js`, `describe.js` | modify | Row piece (`rowPulse`, `beamAxis`, `PALETTE.beamRow`, "Blue") |
| `tints.js` | create | Pure tint math for column/row washes |
| `board.js` | modify | Draw split-triangle background where a column and row cross |

---

### Task 1: Engine: one starter at a time, in reading order

**Files:**
- Modify: `engine.js`
- Test: `engine.test.js`

**Interfaces:**
- Produces: every `trace` step from `simulate()` now has `root: {x, y}`, the starter whose chain it belongs to. Steps are ordered starter by starter in reading order. Existing fields (`sourceX`, `sourceY`, `abilityId`, `targets`) are unchanged.

- [ ] **Step 1: Add the failing tests** (append to `engine.test.js`)

```js
test("starters fire one at a time in reading order, each chain finishing before the next starts", () => {
    const grid = makeGrid(3);
    // Reading order goes row by row, so (2,0) comes before (0,1).
    grid[2][0] = new Node({id: 1, charges: 1, abilities: ["runPulseDown"]}); // starter A, hits (2,1)
    grid[2][1] = new Node({id: 2, charges: 1, abilities: ["pairV"]});        // relays to (2,2)
    grid[2][2] = new Node({id: 3, charges: 1, abilities: []});
    grid[0][1] = new Node({id: 4, charges: 1, abilities: ["runPulseDown"]}); // starter B, hits (0,2)
    grid[0][2] = new Node({id: 5, charges: 1, abilities: []});

    const {trace, won} = simulate(grid, 3);

    assert.equal(won, true);
    assert.deepEqual(trace.map(s => `${s.sourceX},${s.sourceY}`), ["2,0", "2,1", "0,1"]);
    assert.deepEqual(trace.map(s => `${s.root.x},${s.root.y}`), ["2,0", "2,0", "0,1"]);
});

test("starters in the same row fire left to right", () => {
    const grid = makeGrid(4);
    grid[3][0] = new Node({id: 1, charges: 1, abilities: ["runPulseDown"]});
    grid[1][0] = new Node({id: 2, charges: 1, abilities: ["runPulseDown"]});
    grid[3][1] = new Node({id: 3, charges: 1, abilities: []});
    grid[1][1] = new Node({id: 4, charges: 1, abilities: []});

    const {trace} = simulate(grid, 4);

    assert.deepEqual(trace.map(s => `${s.sourceX},${s.sourceY}`), ["1,0", "3,0"]);
});
```

- [ ] **Step 2: Run to confirm they fail**

Run: `node --test engine.test.js`
Expected: the two new tests FAIL (old order is column by column and `root` is undefined).

- [ ] **Step 3: Apply this change to `engine.js`**

```diff
--- a/engine.js
+++ b/engine.js
@@ -33,34 +33,38 @@
         return true;
     }
 
-    // Seed phase: every node with an onRun ability is activated once by the Run press.
-    for (let x = 0; x < gridScale; x++) {
-        for (let y = 0; y < gridScale; y++) {
+    // Resolves everything one starter set off, before the next starter fires.
+    // Every trace step records the starter it came from as `root`.
+    function drain(root) {
+        while (queue.length > 0) {
+            const {x, y, triggerType} = queue.shift();
             const node = grid[x][y];
-            if (node.isEmpty) continue;
-            if (isStarter(node)) tryActivate(x, y, TRIGGERS.ON_RUN);
-        }
-    }
+            const matchingAbilities = node.abilities
+                .map(id => ABILITIES[id])
+                .filter(ability => ability && ability.trigger === triggerType);
 
-    // Cascade phase.
-    while (queue.length > 0) {
-        const {x, y, triggerType} = queue.shift();
-        const node = grid[x][y];
-        const matchingAbilities = node.abilities
-            .map(id => ABILITIES[id])
-            .filter(ability => ability && ability.trigger === triggerType);
+            for (const ability of matchingAbilities) {
+                const targets = ability.target(x, y, boardShim).filter(t => inBounds(t.x, t.y));
+                const stepTargets = [];
 
-        for (const ability of matchingAbilities) {
-            const targets = ability.target(x, y, boardShim).filter(t => inBounds(t.x, t.y));
-            const stepTargets = [];
+                for (const t of targets) {
+                    const targetNode = grid[t.x][t.y];
+                    const consumed = tryActivate(t.x, t.y, TRIGGERS.ON_ACTIVATED);
+                    stepTargets.push({x: t.x, y: t.y, consumed, id: targetNode.id});
+                }
 
-            for (const t of targets) {
-                const targetNode = grid[t.x][t.y];
-                const consumed = tryActivate(t.x, t.y, TRIGGERS.ON_ACTIVATED);
-                stepTargets.push({x: t.x, y: t.y, consumed, id: targetNode.id});
+                trace.push({sourceX: x, sourceY: y, abilityId: ability.id, targets: stepTargets, root});
             }
+        }
+    }
 
-            trace.push({sourceX: x, sourceY: y, abilityId: ability.id, targets: stepTargets});
+    // Run press: starters fire one at a time in reading order (top-left to
+    // top-right, then down a row), each one's whole chain finishing first.
+    for (let y = 0; y < gridScale; y++) {
+        for (let x = 0; x < gridScale; x++) {
+            const node = grid[x][y];
+            if (node.isEmpty || !isStarter(node)) continue;
+            if (tryActivate(x, y, TRIGGERS.ON_RUN)) drain({x, y});
         }
     }
```

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: all tests pass, including solvability of all 10 hand-built levels (this was verified on a scratch copy: 90/90 before the new tests).

- [ ] **Step 5: Commit**

```bash
git add engine.js engine.test.js
git commit -m "Engine: fire starters one at a time in reading order

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Runner: animate one starter at a time

**Files:**
- Modify: `runner.js`
- Create: `runner.test.js`

**Interfaces:**
- Consumes: `trace` steps with `root` (Task 1).
- Produces: `playRun` flashes each starter just before its chain, spending its charge then; there is no longer a separate "all starters flash together" beat.

- [ ] **Step 1: Write the failing test** (`runner.test.js`)

```js
import test from "node:test";
import assert from "node:assert/strict";
import {Node, makeEmptyNode} from "./node.js";
import {simulate, cloneGrid} from "./engine.js";
import {playRun} from "./runner.js";

const makeGrid = size => Array.from({length: size}, () => Array.from({length: size}, () => makeEmptyNode()));

test("a run plays one starter at a time: its flash, its chain, then the next starter", async () => {
    const grid = makeGrid(3);
    // reading order: (2,0) before (0,1)
    grid[2][0] = new Node({id: 1, charges: 1, abilities: ["runPulseDown"]});
    grid[2][1] = new Node({id: 2, charges: 1, abilities: []});
    grid[0][1] = new Node({id: 3, charges: 1, abilities: ["runPulseDown"]});
    grid[0][2] = new Node({id: 4, charges: 1, abilities: []});

    const frames = [];
    const board = {
        grid,
        drawBoard() {
            frames.push(this.effects.flashes.map(f => `${f.x},${f.y}`).join(" "));
        },
    };
    const {trace} = simulate(cloneGrid(grid, 3), 3);
    await playRun(board, trace, 3, {flashMs: 0, gapMs: 0, travelMs: 0});

    // The board redraws while a beam travels, so drop repeated frames. The second
    // starter does not flash until the first one's chain has played.
    const flashes = frames.filter((f, i) => f !== "" && f !== frames[i - 1]);
    assert.deepEqual(flashes, ["2,0", "2,1", "0,1", "0,2"]);
    // charges were spent as the run played
    for (const [x, y] of [[2, 0], [2, 1], [0, 1], [0, 2]]) assert.equal(grid[x][y].charges, 0);
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `node --test runner.test.js`
Expected: FAIL (the old runner flashes both starters together first).

- [ ] **Step 3: Apply this change to `runner.js`**

```diff
--- a/runner.js
+++ b/runner.js
@@ -1,4 +1,3 @@
-import {isStarter} from "./abilities.js";
 import {drawnLinks, linkKey} from "./wires.js";
 
 // Plays a simulation trace back on the board as quick flashes: the piece that
@@ -49,23 +48,15 @@
     }
     const fired = new Map();
 
-    // Run press: every starter flashes and spends its charge.
-    const starters = [];
-    for (let x = 0; x < gridScale; x++) {
-        for (let y = 0; y < gridScale; y++) {
-            const node = grid[x][y];
-            if (!node.isEmpty && isStarter(node) && node.charges > 0) starters.push({x, y});
-        }
-    }
-    fx.flashes = starters;
-    starters.forEach(({x, y}) => grid[x][y].activate());
-    board.drawBoard();
-    await flashWait();
-    fx.flashes = [];
-    board.drawBoard();
-    await gapWait();
+    // Each starter's chain plays in turn. The Run press spends a starter's charge
+    // just before its chain begins (the first step's flash is the press itself).
+    let current = null;
 
     for (const step of trace) {
+        if (!current || current.x !== step.root.x || current.y !== step.root.y) {
+            current = step.root;
+            grid[current.x][current.y].activate();
+        }
         fx.flashes = [{x: step.sourceX, y: step.sourceY}];
         board.drawBoard();
         await flashWait();
```

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add runner.js runner.test.js
git commit -m "Runner: play one starter's chain at a time

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The sanity gate (`lint.js`)

**Files:**
- Create: `lint.js`, `lint.test.js`

**Interfaces:**
- Produces: `layout(definition, skip = -1) -> grid | null` (the board with the stored solution placed, leaving out solution piece index `skip`; `null` if a solution piece sits on an occupied cell) and `isSensible(definition) -> boolean`. A definition is `{name, locked: [[x, y, kind, charges]], hand: [kind], solution: [{x, y, kind}]}`.
- Gate rules: the solution wins; the board is not already solved before anything is placed; removing any one solution piece makes it lose; every piece with an output (locked or placed) consumes at least one target. Spare hand pieces are ignored.

- [ ] **Step 1: Write the failing tests** (`lint.test.js`)

```js
import test from "node:test";
import assert from "node:assert/strict";
import {isSensible} from "./lint.js";

// igniter at (0,0) hits (0,1); a Burster there hits both receivers
const good = {
    name: "Random",
    locked: [[0, 0, "igniter", 1], [0, 2, "receiver", 1], [1, 1, "receiver", 1]],
    hand: ["burster", "pusher"],
    solution: [{x: 0, y: 1, kind: "burster"}],
};

test("a board that needs its placed piece and wastes nothing passes", () => {
    assert.equal(isSensible(good), true);
});

test("a spare piece in the hand is fine", () => {
    // "pusher" is in the hand but not in the solution
    assert.equal(isSensible({...good, hand: ["burster", "pusher", "pusher"]}), true);
});

test("rejects a board whose stored solution doesn't win", () => {
    assert.equal(isSensible({...good, solution: []}), false);
});

test("rejects a board that is already solved before anything is placed", () => {
    const solved = {
        name: "Random",
        locked: [[0, 0, "igniter", 1], [0, 1, "receiver", 1]],
        hand: ["burster"],
        solution: [],
    };
    assert.equal(isSensible(solved), false);
});

test("rejects a board where a placed piece isn't needed", () => {
    // the Octo only re-hits a cell the Burster already handles
    const padded = {
        name: "Random",
        locked: [[0, 0, "igniter", 1], [0, 2, "receiver", 1]],
        hand: ["burster", "octo"],
        solution: [{x: 0, y: 1, kind: "burster"}, {x: 1, y: 1, kind: "octo"}],
    };
    assert.equal(isSensible(padded), false);
});

test("rejects a board with a piece that activates nothing", () => {
    // the locked Side Pair gets hit but its own outputs reach nothing
    const dead = {
        name: "Random",
        locked: [[0, 0, "igniter", 1], [0, 2, "receiver", 1], [1, 1, "pairH", 1]],
        hand: ["burster"],
        solution: [{x: 0, y: 1, kind: "burster"}],
    };
    assert.equal(isSensible(dead), false);
});

test("rejects a solution piece placed on an occupied cell", () => {
    assert.equal(isSensible({...good, solution: [{x: 0, y: 2, kind: "burster"}]}), false);
});
```

- [ ] **Step 2: Run to confirm they fail**

Run: `node --test lint.test.js`
Expected: FAIL (`./lint.js` does not exist).

- [ ] **Step 3: Create `lint.js`**

```js
import {cloneGrid, simulate} from "./engine.js";
import {buildFromDefinition, makePiece, PUZZLE_SIZE} from "./puzzles.js";

// Sanity gate for generated puzzles: rejects boards with pointless pieces.

// The board with the stored solution placed, leaving out solution piece
// `skip` if given. null if a solution piece sits on an occupied cell.
export function layout(definition, skip = -1) {
    const {grid} = buildFromDefinition(definition);
    for (let i = 0; i < definition.solution.length; i++) {
        if (i === skip) continue;
        const {x, y, kind} = definition.solution[i];
        if (!grid[x][y].isEmpty) return null;
        grid[x][y] = makePiece(kind);
    }
    return grid;
}

const run = grid => simulate(cloneGrid(grid, PUZZLE_SIZE), PUZZLE_SIZE);

export function isSensible(definition) {
    const full = layout(definition);
    if (!full) return false;
    const result = run(full);
    if (!result.won) return false;
    // not already solved before anything is placed
    if (run(buildFromDefinition(definition).grid).won) return false;
    // every placed piece is needed
    for (let i = 0; i < definition.solution.length; i++) {
        if (run(layout(definition, i)).won) return false;
    }
    // every piece that has an output must actually activate something
    for (let x = 0; x < PUZZLE_SIZE; x++) {
        for (let y = 0; y < PUZZLE_SIZE; y++) {
            const node = full[x][y];
            if (node.isEmpty || node.abilities.length === 0) continue;
            const useful = result.trace.some(s =>
                s.sourceX === x && s.sourceY === y && s.targets.some(t => t.consumed));
            if (!useful) return false;
        }
    }
    return true;
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test lint.test.js`
Expected: 7 pass.

- [ ] **Step 5: Commit**

```bash
git add lint.js lint.test.js
git commit -m "Add lint gate for generated puzzles

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Generator: placement rule, spare hand pieces, gate

**Files:**
- Modify: `generator.js`, `generator.test.js`

**Interfaces:**
- Consumes: `isSensible` (Task 3).
- Produces: `generateDefinition({rng, handSize = 5, minActivations = 12, maxAttempts = 80000})` returns a definition whose `hand` has `handSize` pieces (shuffled), whose `solution` places `handSize - spares` of them (`spares` is 1 or 2), and which passes `isSensible`. A piece is only ever placed where it reaches at least one cell on the board.

- [ ] **Step 1: Replace `generator.test.js`** with this (changes: hand of 5, bigger-hand test uses 6, new spare/placement/gate tests)

```js
import test from "node:test";
import assert from "node:assert/strict";
import {generateDefinition, allowedKinds} from "./generator.js";
import {testedKinds} from "./puzzles.js";
import {buildFromDefinition, PUZZLE_SIZE} from "./puzzles.js";
import {validatePuzzle} from "./rules.js";
import {solve} from "./solver.js";
import {isSensible} from "./lint.js";
import {ABILITIES} from "./abilities.js";
import {KINDS} from "./puzzles.js";

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

for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    test(`random puzzle (seed ${seed}) is valid and completable`, () => {
        const definition = generateDefinition({rng: seeded(seed)});
        const {grid, pool} = buildFromDefinition(definition);
        assert.doesNotThrow(() => validatePuzzle(grid, pool));
        assert.equal(pool.length, 5);
        // the brute-force solver independently finds a solution
        assert.ok(solve(grid, pool, PUZZLE_SIZE, 1).length >= 1);
        // not already solved with an empty hand
        assert.equal(solve(grid, [], PUZZLE_SIZE, 1).length, 0);
    });
}

test("generation is deterministic for a given seed", () => {
    const a = generateDefinition({rng: seeded(42)});
    const b = generateDefinition({rng: seeded(42)});
    assert.deepEqual(a, b);
});

test("different seeds give different puzzles", () => {
    const a = generateDefinition({rng: seeded(10)});
    const b = generateDefinition({rng: seeded(11)});
    assert.notDeepEqual(a.locked, b.locked);
});

test("a bigger hand is supported", () => {
    const definition = generateDefinition({rng: seeded(5), handSize: 6});
    assert.equal(definition.hand.length, 6);
    const {grid, pool} = buildFromDefinition(definition);
    assert.ok(solve(grid, pool, PUZZLE_SIZE, 1).length >= 1);
});

test("random puzzles only use pieces from the play-tested levels 1-6", () => {
    const tested = testedKinds(6);
    const {starters, reactors} = allowedKinds();
    for (const kind of [...starters, ...reactors]) assert.ok(tested.has(kind), kind);
    // nothing fancy and nothing untested
    for (const kind of ["sweep", "duo", "relay", "hop", "dive", "pulseUp"]) {
        assert.ok(![...starters, ...reactors].includes(kind), kind);
    }
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
        const definition = generateDefinition({rng: seeded(seed)});
        const used = [...definition.locked.map(l => l[2]).filter(k => k !== "receiver"), ...definition.hand];
        for (const kind of used) assert.ok(tested.has(kind), `seed ${seed}: ${kind}`);
    }
});

const reaches = (kind, x, y) => KINDS[kind].abilities.some(id => ABILITIES[id].target(x, y, {gridScale: PUZZLE_SIZE})
    .some(t => t.x >= 0 && t.x < PUZZLE_SIZE && t.y >= 0 && t.y < PUZZLE_SIZE));

for (const seed of [21, 22, 23, 24, 25, 26]) {
    test(`random puzzle (seed ${seed}): 1-2 spares, nothing pointless, every piece reaches the board`, () => {
        const definition = generateDefinition({rng: seeded(seed)});
        const spares = definition.hand.length - definition.solution.length;
        assert.ok(spares === 1 || spares === 2, `spares: ${spares}`);
        // the solution's kinds all come from the hand
        const hand = [...definition.hand];
        for (const {kind} of definition.solution) {
            const i = hand.indexOf(kind);
            assert.ok(i >= 0, kind);
            hand.splice(i, 1);
        }
        assert.equal(isSensible(definition), true);
        const pieces = [
            ...definition.locked.filter(([, , kind]) => kind !== "receiver").map(([x, y, kind]) => ({x, y, kind})),
            ...definition.solution,
        ];
        for (const {x, y, kind} of pieces) assert.ok(reaches(kind, x, y), `${kind} at ${x},${y} points nowhere`);
    });
}
```

- [ ] **Step 2: Run to confirm failures**

Run: `node --test generator.test.js`
Expected: FAIL (hand is 4 long; the new tests fail on spares).

- [ ] **Step 3: Replace `generator.js`** with this

```js
import {cloneGrid, simulate} from "./engine.js";
import {ABILITIES, TRIGGERS} from "./abilities.js";
import {buildFromDefinition, testedKinds, KINDS, PUZZLE_SIZE} from "./puzzles.js";
import {isSensible} from "./lint.js";

// Random puzzle generator. A puzzle is completable BY CONSTRUCTION: it first
// lays out every piece (locked ones and the hand) at random cells, runs the
// simulation, and keeps the layout only if every piece ends up used. The cells
// the chain hit, but that held no piece, become locked receivers with exactly
// the charge needed. That layout is a built-in solution, which is then
// re-checked against the real engine before the puzzle is returned.

// Only pieces from the play-tested levels (1-6) are used: nothing fancy (no
// row sweeps, no pieces that haven't been tried yet).
const isStarterKind = kind => KINDS[kind].abilities.some(id => ABILITIES[id]?.trigger === TRIGGERS.ON_RUN);
const TESTED_LEVELS = 6;

export function allowedKinds() {
    const all = [...testedKinds(TESTED_LEVELS)];
    return {
        starters: all.filter(isStarterKind),
        reactors: all.filter(kind => !isStarterKind(kind)),
    };
}

// Count of times each empty cell is targeted in a simulation trace.
function emptyCellHits(grid, trace) {
    const hits = new Map();
    for (const step of trace) {
        for (const t of step.targets) {
            if (grid[t.x][t.y].isEmpty) {
                const key = `${t.x},${t.y}`;
                hits.set(key, (hits.get(key) || 0) + 1);
            }
        }
    }
    return hits;
}

// True if the piece, put at (x, y), would reach some other cell on the board.
function reachesBoard(kind, x, y) {
    const board = {gridScale: PUZZLE_SIZE};
    return KINDS[kind].abilities.some(id => ABILITIES[id].target(x, y, board).some(t =>
        t.x >= 0 && t.x < PUZZLE_SIZE && t.y >= 0 && t.y < PUZZLE_SIZE && !(t.x === x && t.y === y)));
}

export function generateDefinition({rng = Math.random, handSize = 5, minActivations = 12, maxAttempts = 80000} = {}) {
    const size = PUZZLE_SIZE;
    const {starters: STARTER_KINDS, reactors: REACTOR_KINDS} = allowedKinds();
    const pick = list => list[Math.floor(rng() * list.length)];
    const shuffle = list => {
        for (let i = list.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [list[i], list[j]] = [list[j], list[i]];
        }
        return list;
    };

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        // ask for a little less if the first tries keep missing
        const wanted = Math.max(6, minActivations - Math.floor(attempt / 15000));

        // 1-2 of the hand pieces are spares: the puzzle is solved without them.
        const spares = 1 + Math.floor(rng() * 2);
        const placed = [pick(STARTER_KINDS)];
        while (placed.length < handSize - spares) placed.push(rng() < 0.12 ? pick(STARTER_KINDS) : pick(REACTOR_KINDS));
        const spareKinds = [];
        while (spareKinds.length < spares) spareKinds.push(rng() < 0.2 ? pick(STARTER_KINDS) : pick(REACTOR_KINDS));
        const hand = shuffle([...placed, ...spareKinds]);
        const lockedKinds = [pick(STARTER_KINDS)];
        if (rng() < 0.7) lockedKinds.push(pick(REACTOR_KINDS));
        if (rng() < 0.3) lockedKinds.push(pick(REACTOR_KINDS));

        const cells = [];
        for (let x = 0; x < size; x++) for (let y = 0; y < size; y++) cells.push({x, y});
        shuffle(cells);
        // a piece only goes where it reaches at least one cell on the board
        const place = kinds => {
            const out = [];
            for (const kind of kinds) {
                const i = cells.findIndex(c => reachesBoard(kind, c.x, c.y));
                if (i < 0) return null;
                out.push({kind, ...cells.splice(i, 1)[0]});
            }
            return out;
        };
        const lockedPlaced = place(lockedKinds);
        const handPlaced = lockedPlaced && place(placed);
        if (!handPlaced) continue;

        // Lay everything out and run it.
        const probe = buildFromDefinition({
            locked: [...lockedPlaced.map(p => [p.x, p.y, p.kind, 1]), ...handPlaced.map(p => [p.x, p.y, p.kind, 1])],
            hand: [],
        });
        const sim = cloneGrid(probe.grid, size);
        const {trace} = simulate(sim, size);

        // every piece must have been used
        let allUsed = true;
        for (const p of [...lockedPlaced, ...handPlaced]) {
            if (sim[p.x][p.y].charges > 0) allUsed = false;
        }
        if (!allUsed) continue;

        const hits = emptyCellHits(probe.grid, trace);
        const receivers = [...hits.entries()];
        if (receivers.length < 3 || receivers.length > 7) continue;
        if (receivers.some(([, count]) => count > 3)) continue;
        if (!receivers.some(([, count]) => count >= 2)) continue;
        const activations = trace.reduce((n, s) => n + s.targets.filter(t => t.consumed).length, 0)
            + receivers.reduce((n, [, count]) => n + count, 0);
        if (activations < wanted) continue;

        const definition = {
            name: "Random",
            locked: [
                ...lockedPlaced.map(p => [p.x, p.y, p.kind, 1]),
                ...receivers.map(([key, count]) => [...key.split(",").map(Number), "receiver", count]),
            ],
            hand,
            solution: handPlaced.map(p => ({x: p.x, y: p.y, kind: p.kind})),
        };

        // Re-check against the real engine and weed out pointless pieces.
        if (!isSensible(definition)) continue;
        return definition;
    }
    throw new Error("could not generate a puzzle");
}
```

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: all pass (a generated board takes about 6 ms; the property tests finish in well under 2 s).

- [ ] **Step 5: Commit**

```bash
git add generator.js generator.test.js
git commit -m "Generator: spare hand pieces, placement rule, lint gate

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Scoring (`score.js`)

**Files:**
- Create: `score.js`, `score.test.js`

**Interfaces:**
- Consumes: `layout` (Task 3), `simulate`/`cloneGrid`, `ABILITIES`.
- Produces: `scorePuzzle(definition) -> {total, themes}` where `themes` maps `skipChain | beamCoverage | picture | symmetry | singlePath | bottleneck` to a number in 0..1.5 (0 = typical board, 1 = top 10% of random boards), and `total = max(themes) + bonus` with `bonus` in 0..0.2. Also exports `THEMES` (raw 0-1 scorers over the facts of a solved board).
- `RANGES` in `score.js` were measured over ~200 generated boards (median to 90th percentile per theme). If the generator changes, re-measure them: generate 200 boards, compute each raw theme score, and set each range to `[median, p90]`.

- [ ] **Step 1: Write the failing tests** (`score.test.js`)

```js
import test from "node:test";
import assert from "node:assert/strict";
import {scorePuzzle} from "./score.js";
import {generateDefinition} from "./generator.js";

const board = (locked, solution = []) => ({name: "Random", locked, hand: solution.map(s => s.kind), solution});

test("a mirrored board scores high on symmetry", () => {
    const {themes} = scorePuzzle(board([[0, 1, "receiver", 1], [4, 1, "receiver", 1], [1, 3, "receiver", 1], [3, 3, "receiver", 1]]));
    assert.ok(themes.symmetry >= 1, themes.symmetry);
    assert.equal(themes.skipChain, 0);
    assert.equal(themes.beamCoverage, 0);
});

test("targets laid out as a smile score high on picture", () => {
    const smile = [[1, 1], [3, 1], [0, 3], [1, 4], [2, 4], [3, 4], [4, 3]];
    const {themes} = scorePuzzle(board(smile.map(([x, y]) => [x, y, "receiver", 1])));
    assert.ok(themes.picture >= 1, themes.picture);
});

test("a chain of jumps scores high on skip chain", () => {
    // pusher (0,0) -> dive (1,0) jumps to (1,2) -> dive jumps to (1,4)
    const {themes} = scorePuzzle(board(
        [[0, 0, "pusher", 1], [1, 0, "dive", 1], [1, 2, "dive", 1], [1, 4, "receiver", 1]]));
    assert.ok(themes.skipChain >= 1, themes.skipChain);
});

test("a column that sweeps four targets scores high on beam coverage", () => {
    const {themes} = scorePuzzle(board(
        [[0, 0, "pusher", 1], [1, 0, "column", 1], [1, 1, "receiver", 1], [1, 2, "receiver", 1], [1, 3, "receiver", 1], [1, 4, "receiver", 1]]));
    assert.ok(themes.beamCoverage > 0.9, themes.beamCoverage);
});

test("a target fed by four different pieces scores high on bottleneck", () => {
    const {themes} = scorePuzzle(board(
        [[2, 2, "receiver", 4], [3, 2, "pulseLeft", 1], [1, 2, "pusher", 1], [2, 1, "igniter", 1], [2, 3, "pulseUp", 1]]));
    assert.ok(themes.bottleneck >= 1, themes.bottleneck);
});

test("one starter whose chain reaches the whole board scores high on single path", () => {
    const {themes} = scorePuzzle(board(
        [[0, 0, "pusher", 1], [1, 0, "pairH", 1], [2, 0, "receiver", 1]]));
    assert.ok(themes.singlePath >= 1, themes.singlePath);
});

test("total is the best theme plus a bonus of at most 0.2", () => {
    const {total, themes} = scorePuzzle(board([[0, 1, "receiver", 1], [4, 1, "receiver", 1], [1, 3, "receiver", 1], [3, 3, "receiver", 1]]));
    const best = Math.max(...Object.values(themes));
    assert.ok(total >= best && total <= best + 0.2 + 1e-9, `${total} vs ${best}`);
});

test("themes are capped at 1.5 and never negative on generated boards", () => {
    for (let i = 0; i < 10; i++) {
        const {themes, total} = scorePuzzle(generateDefinition());
        assert.ok(Number.isFinite(total));
        for (const value of Object.values(themes)) assert.ok(value >= 0 && value <= 1.5, value);
    }
});
```

- [ ] **Step 2: Run to confirm they fail**

Run: `node --test score.test.js`
Expected: FAIL (`./score.js` does not exist).

- [ ] **Step 3: Create `score.js`**

```js
import {cloneGrid, simulate} from "./engine.js";
import {ABILITIES} from "./abilities.js";
import {PUZZLE_SIZE} from "./puzzles.js";
import {layout} from "./lint.js";

// Scores a generated puzzle by how much of an "idea" it has. Each theme scores
// 0-1; the total is the best theme plus a small general bonus, so a board with
// one clear idea beats one that is mediocre at everything. Themes are never
// shown to the player.

const N = PUZZLE_SIZE;
const key = (x, y) => `${x},${y}`;
const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
const clamp01 = n => Math.max(0, Math.min(1, n));

// Receiver patterns the picture theme looks for, as [x, y] cells.
const TEMPLATES = {
    smile: [[1, 1], [3, 1], [0, 3], [1, 4], [2, 4], [3, 4], [4, 3]],
    x: [[1, 1], [3, 1], [2, 2], [1, 3], [3, 3]],
    plus: [[2, 1], [1, 2], [2, 2], [3, 2], [2, 3]],
    ring: [[1, 1], [2, 1], [3, 1], [1, 2], [3, 2], [1, 3], [2, 3], [3, 3]],
    corners: [[0, 0], [4, 0], [0, 4], [4, 4]],
    diagonal: [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]],
    antiDiagonal: [[4, 0], [3, 1], [2, 2], [1, 3], [0, 4]],
    middleRow: [[0, 2], [1, 2], [2, 2], [3, 2], [4, 2]],
    middleColumn: [[2, 0], [2, 1], [2, 2], [2, 3], [2, 4]],
};

// What the simulation of the solved board looks like, in the shapes the themes need.
function analyse(definition) {
    const grid = layout(definition);
    const {trace} = simulate(cloneGrid(grid, N), N);
    const cells = [];
    for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) {
        if (!grid[x][y].isEmpty) cells.push({x, y, node: grid[x][y]});
    }
    // what each occupied cell is, for symmetry: ability list plus charges
    const kindAt = new Map(cells.map(c => [key(c.x, c.y), `${c.node.abilities.join("+")}:${c.node.maxCharges}`]));
    const hits = trace.flatMap(step => step.targets
        .filter(t => t.consumed)
        .map(t => ({from: {x: step.sourceX, y: step.sourceY}, to: {x: t.x, y: t.y}, root: step.root, abilityId: step.abilityId})));
    return {cells, kindAt, trace, hits, definition};
}

// longest chain of back-to-back skip hits (target not adjacent to its source)
function longestSkipRun(hits) {
    const next = new Map();
    for (const h of hits) {
        if (cheb(h.from.x, h.from.y, h.to.x, h.to.y) < 2) continue;
        const k = key(h.from.x, h.from.y);
        if (!next.has(k)) next.set(k, []);
        next.get(k).push(key(h.to.x, h.to.y));
    }
    const walk = (cell, seen) => {
        let best = 0;
        for (const to of next.get(cell) ?? []) {
            if (seen.has(to)) continue;
            seen.add(to);
            best = Math.max(best, 1 + walk(to, seen));
            seen.delete(to);
        }
        return best;
    };
    return Math.max(0, ...[...next.keys()].map(k => walk(k, new Set([k]))));
}

export const THEMES = {
    skipChain({hits}) {
        if (hits.length === 0) return 0;
        const skips = hits.filter(h => cheb(h.from.x, h.from.y, h.to.x, h.to.y) > 1).length;
        return clamp01(longestSkipRun(hits) / 3) * (0.5 + 0.5 * skips / hits.length);
    },

    beamCoverage({hits}) {
        const beamHits = hits.filter(h => ABILITIES[h.abilityId].line);
        const beams = new Set(beamHits.map(h => key(h.from.x, h.from.y)));
        if (beams.size === 0) return 0;
        const reached = new Set(beamHits.map(h => key(h.to.x, h.to.y)));
        const overlap = beamHits.length - reached.size;
        return clamp01(reached.size / 12) * (beams.size >= 2 ? 1 : 0.6) * (overlap === 0 ? 1 : 0.7);
    },

    picture({cells}) {
        const receivers = new Set(cells.filter(c => c.node.abilities.length === 0).map(c => key(c.x, c.y)));
        let best = 0;
        for (const template of Object.values(TEMPLATES)) {
            const wanted = new Set(template.map(([x, y]) => key(x, y)));
            const shared = [...receivers].filter(k => wanted.has(k)).length;
            best = Math.max(best, shared / (receivers.size + wanted.size - shared));
        }
        return best;
    },

    symmetry({cells, kindAt}) {
        const flips = [
            (x, y) => [N - 1 - x, y],
            (x, y) => [x, N - 1 - y],
            (x, y) => [N - 1 - x, N - 1 - y],
        ];
        let best = 0;
        for (const flip of flips) {
            let score = 0;
            for (const {x, y} of cells) {
                const [fx, fy] = flip(x, y);
                if (fx === x && fy === y) score += 0.5; // on the axis: matches itself
                else if (kindAt.get(key(fx, fy)) === kindAt.get(key(x, y))) score += 1;
            }
            best = Math.max(best, score / cells.length);
        }
        return best;
    },

    singlePath({cells, trace}) {
        // the biggest share of the board that one starter's chain reaches
        const reached = new Map();
        for (const step of trace) {
            const root = key(step.root.x, step.root.y);
            if (!reached.has(root)) reached.set(root, new Set([root]));
            for (const t of step.targets) if (t.consumed) reached.get(root).add(key(t.x, t.y));
        }
        const biggest = Math.max(0, ...[...reached.values()].map(s => s.size));
        const useful = trace.filter(s => s.targets.some(t => t.consumed));
        const branching = useful.filter(s => s.targets.filter(t => t.consumed).length > 1).length;
        return clamp01(biggest / cells.length) * (1 - 0.5 * branching / Math.max(1, useful.length));
    },

    bottleneck({hits}) {
        const routes = new Map();
        for (const h of hits) {
            const k = key(h.to.x, h.to.y);
            if (!routes.has(k)) routes.set(k, new Set());
            routes.get(k).add(key(h.from.x, h.from.y));
        }
        const most = Math.max(0, ...[...routes.values()].map(s => s.size));
        return clamp01((most - 1) / 3);
    },
};

// General bonus (0 to 0.2): variety of pieces, spread over the board, how much
// happens, and spares that look like real alternatives.
function bonus({cells, trace, hits, definition}) {
    const kinds = new Set(cells.map(c => c.node.abilities.join("+")));
    const quadrants = new Set(cells.map(c => `${c.x < 2.5}${c.y < 2.5}`));
    const activations = hits.length + trace.length;
    const used = new Set([...definition.solution.map(s => s.kind), ...definition.locked.map(l => l[2])]);
    const placed = [...definition.solution.map(s => s.kind)];
    const spares = definition.hand.filter(kind => { const i = placed.indexOf(kind); if (i >= 0) { placed.splice(i, 1); return false; } return true; });
    const plausible = spares.filter(kind => used.has(kind)).length;
    return 0.05 * clamp01(kinds.size / 6) + 0.05 * (quadrants.size / 4)
        + 0.05 * clamp01(activations / 24) + 0.05 * clamp01(plausible / 2);
}

// Raw theme scores sit at different baselines (a typical board already scores
// ~0.6 on singlePath), so each is stretched so that [median, 90th percentile] maps to 0..1
// (capped at 1.5, not 1: a board past the 90th percentile still ranks higher) before themes are compared. Measured over ~200 generated boards; re-measure if the generator changes.
const RANGES = {
    skipChain: [0.2, 0.5],
    beamCoverage: [0.05, 0.2],
    picture: [0.3, 0.5],
    symmetry: [0.25, 0.42],
    singlePath: [0.6, 0.69],
    bottleneck: [0.34, 0.67],
};

export function scorePuzzle(definition) {
    const facts = analyse(definition);
    const themes = {};
    for (const [name, theme] of Object.entries(THEMES)) {
        const [low, high] = RANGES[name];
        themes[name] = Math.min(1.5, Math.max(0, (theme(facts) - low) / (high - low)));
    }
    return {total: Math.max(...Object.values(themes)) + bonus(facts), themes};
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test score.test.js`
Expected: 8 pass.

- [ ] **Step 5: Commit**

```bash
git add score.js score.test.js
git commit -m "Add puzzle scoring by theme

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `startBest` and `generateBest`

**Files:**
- Modify: `generator.js`, `generator.test.js`

**Interfaces:**
- Consumes: `scorePuzzle` (Task 5).
- Produces: `startBest({candidates = 60, ...generateOptions}) -> {step(count) -> boolean, result() -> definition}` (`step` builds up to `count` more candidates and returns true once all `candidates` are built; call `result()` only after it returns true) and `generateBest(options) -> definition` (runs a whole pool at once).

- [ ] **Step 1: Update the test file.** In `generator.test.js`, change the first import line to

```js
import {generateDefinition, generateBest, startBest, allowedKinds} from "./generator.js";
```

add this import below the `isSensible` import:

```js
import {scorePuzzle} from "./score.js";
```

and append these tests at the end:

```js
test("generateBest returns a board at least as good as its first candidate", () => {
    const first = generateDefinition({rng: seeded(7)});
    const best = generateBest({rng: seeded(7), candidates: 10});
    assert.ok(scorePuzzle(best).total >= scorePuzzle(first).total);
    assert.equal(isSensible(best), true);
});

test("startBest builds in steps and reports when it is done", () => {
    const run = startBest({rng: seeded(3), candidates: 6});
    assert.equal(run.step(4), false);
    assert.equal(run.step(4), true);
    assert.equal(isSensible(run.result()), true);
});
```

- [ ] **Step 2: Run to confirm they fail**

Run: `node --test generator.test.js`
Expected: FAIL (`startBest`/`generateBest` are not exported).

- [ ] **Step 3: Edit `generator.js`.** Add this import under the `isSensible` import:

```js
import {scorePuzzle} from "./score.js";
```

and append this at the end of the file:

```js
// Builds candidates in small steps (so the page can stay responsive) and keeps
// the best-scoring one.
export function startBest({candidates = 60, ...options} = {}) {
    let best = null;
    let made = 0;
    return {
        step(count) {
            for (let i = 0; i < count && made < candidates; i++, made++) {
                const definition = generateDefinition(options);
                const {total} = scorePuzzle(definition);
                if (!best || total > best.total) best = {definition, total};
            }
            return made >= candidates;
        },
        result: () => best.definition,
    };
}

export function generateBest(options = {}) {
    const run = startBest(options);
    while (!run.step(10)) { /* keep building */ }
    return run.result();
}
```

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: all pass. Optional timing check: `generateBest({candidates: 60})` should take roughly 0.3 s and `generateBest({candidates: 15})` roughly 0.07 s on a normal laptop.

- [ ] **Step 5: Commit**

```bash
git add generator.js generator.test.js
git commit -m "Generator: pick the best-scoring of N candidates

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Puzzle cache and game wiring

**Files:**
- Create: `puzzle-cache.js`, `puzzle-cache.test.js`
- Modify: `game.js` (the import on line 8, the cache setup before the random button at about line 505, and the two `generateDefinition()` calls in the random and New button handlers)

**Interfaces:**
- Consumes: `startBest`, `generateBest` (Task 6).
- Produces: `createPuzzleCache({newRun, quick, size = 3, slice = 4, schedule}) -> {fill(), take() -> definition, ready}`. `fill()` begins background building up to `size` boards; `take()` returns a ready board (or `quick()` if none yet) and refills.

- [ ] **Step 1: Write the failing tests** (`puzzle-cache.test.js`)

```js
import test from "node:test";
import assert from "node:assert/strict";
import {createPuzzleCache} from "./puzzle-cache.js";

// a fake builder that finishes after 3 steps, plus a scheduler we drive by hand
function setup(size = 2) {
    const jobs = [];
    let built = 0;
    const cache = createPuzzleCache({
        newRun: () => {
            let steps = 0;
            const name = `board ${++built}`;
            return {step: () => ++steps >= 3, result: () => ({name})};
        },
        quick: () => ({name: "quick"}),
        size,
        schedule: fn => jobs.push(fn),
    });
    const drain = () => { while (jobs.length) jobs.shift()(); };
    return {cache, jobs, drain};
}

test("nothing is built until fill() is called, then it builds in slices up to its size", () => {
    const {cache, jobs, drain} = setup(2);
    assert.equal(jobs.length, 0);
    cache.fill();
    assert.equal(jobs.length, 1);          // one slice at a time
    jobs.shift()();
    assert.equal(cache.ready, 0);          // not finished after one slice
    drain();
    assert.equal(cache.ready, 2);          // stops at its size
});

test("take() returns ready boards in order and starts refilling", () => {
    const {cache, jobs, drain} = setup(2);
    cache.fill();
    drain();
    assert.deepEqual(cache.take(), {name: "board 1"});
    assert.equal(jobs.length, 1);          // a refill is scheduled
    drain();
    assert.equal(cache.ready, 2);
});

test("take() on an empty cache falls back to quick()", () => {
    const {cache} = setup(2);
    assert.deepEqual(cache.take(), {name: "quick"});
});
```

- [ ] **Step 2: Run to confirm they fail**

Run: `node --test puzzle-cache.test.js`
Expected: FAIL (`./puzzle-cache.js` does not exist).

- [ ] **Step 3: Create `puzzle-cache.js`**

```js
// Keeps a few ready-made random puzzles so pressing "random" never waits. A
// board is built in small slices (setTimeout between them) so the page stays
// responsive; if the cache is empty, `quick` builds a smaller-pool board on the spot.
//   newRun: () => {step(count) -> done?, result() -> definition}
//   quick:  () => definition
export function createPuzzleCache({newRun, quick, size = 3, slice = 4, schedule = fn => setTimeout(fn, 0)}) {
    const ready = [];
    let run = null;        // the board being built right now, if any
    let scheduled = false;

    function tick() {
        scheduled = false;
        run ??= newRun();
        if (run.step(slice)) {
            ready.push(run.result());
            run = null;
        }
        fill();
    }

    // Starts (or continues) filling the cache up to `size` boards.
    function fill() {
        if (scheduled || ready.length >= size) return;
        scheduled = true;
        schedule(tick);
    }

    return {
        fill,
        take() {
            const next = ready.shift() ?? quick();
            fill();
            return next;
        },
        get ready() {
            return ready.length;
        },
    };
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test puzzle-cache.test.js`
Expected: 3 pass.

- [ ] **Step 5: Wire it into `game.js`.**

Change the import on line 8 from

```js
import {generateDefinition} from "./generator.js";
```

to

```js
import {startBest, generateBest} from "./generator.js";
import {createPuzzleCache} from "./puzzle-cache.js";
```

Add this just above the comment `// Random: builds a brand-new puzzle that is guaranteed to be completable.`:

```js
// Random boards are built ahead of time, a few at a time between frames, so the
// button never waits. If none is ready yet, a smaller (quicker) pool is used.
const puzzleCache = createPuzzleCache({
    newRun: () => startBest({candidates: 60}),
    quick: () => generateBest({candidates: 15}),
});
puzzleCache.fill();

```

Replace both `activateGame(generateDefinition(), null);` calls (the random button's click handler and the `newButton` click handler) with:

```js
    activateGame(puzzleCache.take(), null);
```

Confirm nothing else uses the old import: `grep -n "generateDefinition" game.js` should print nothing.

- [ ] **Step 6: Manual check in the browser**

Run: `npm start` and open the served page (see `server.js` for the port).
Expected: pressing the dice button right after load gives a board straight away; pressing it several times quickly never freezes the page; boards have a hand of 5; the Next/New buttons and Back/forward history still work as before.

- [ ] **Step 7: Run the suite and commit**

Run: `npm test` (expected: all pass)

```bash
git add puzzle-cache.js puzzle-cache.test.js game.js
git commit -m "Cache pre-built random puzzles

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The Row piece

**Files:**
- Modify: `abilities.js`, `puzzles.js`, `pieces.js`, `describe.js`
- Test: `engine.test.js`, `pieces.test.js`, `describe.test.js`

**Interfaces:**
- Produces: ability `rowPulse` ("Activates its whole row.", `line: true`, `axis: "row"`); `columnPulse` and `rowSweep` gain `axis: "column"` / `axis: "row"`; export `beamAxis(node) -> "column" | "row" | null` from `abilities.js`; piece kind `row` in `KINDS`; `PALETTE.beamRow` (`{fill: "#4a7fc7", edge: "#2f5593"}`); `colorForNode` returns `PALETTE.beamRow` for row beams; `describePiece(...).title` is `"Blue"` for row beams.

- [ ] **Step 1: Write the failing tests.**

Append to `engine.test.js`:

```js
test("a Row piece activates every other cell in its row, and not itself", () => {
    const grid = makeGrid(3);
    grid[1][0] = new Node({id: 1, charges: 1, abilities: ["runPulseDown"]});  // hits (1,1)
    grid[1][1] = new Node({id: 2, charges: 1, abilities: ["rowPulse"]});
    grid[0][1] = new Node({id: 3, charges: 1, abilities: []});
    grid[2][1] = new Node({id: 4, charges: 1, abilities: []});
    grid[1][2] = new Node({id: 5, charges: 1, abilities: []});                // same column, not hit

    const result = simulate(grid, 3);

    assert.equal(grid[0][1].charges, 0);
    assert.equal(grid[2][1].charges, 0);
    assert.equal(grid[1][2].charges, 1);
    assert.equal(result.won, false);
});
```

In `pieces.test.js`, replace the body of the test `whole-line pieces are their own type with their own color and a capsule body`'s loop with this (keep the two `reactor` assertions after it as they are):

```js
    for (const id of ["columnPulse", "rowPulse", "rowSweep"]) {
        assert.equal(pieceType(piece([id])), "beam");
        assert.equal(bodyKind(piece([id])), "capsule");
    }
    // columns are violet, rows are a blue beside it
    assert.equal(colorForNode(piece(["columnPulse"])), PALETTE.beam);
    assert.equal(colorForNode(piece(["rowPulse"])), PALETTE.beamRow);
    assert.equal(colorForNode(piece(["rowSweep"])), PALETTE.beamRow);
```

In `describe.test.js`, add this line right after the existing `columnPulse` "Purple" assertion:

```js
    assert.equal(describePiece(make(["rowPulse"])).title, "Blue");
```

- [ ] **Step 2: Run to confirm they fail**

Run: `node --test engine.test.js pieces.test.js describe.test.js`
Expected: FAIL (`rowPulse` is unknown, `PALETTE.beamRow` is undefined).

- [ ] **Step 3: Apply these changes**

`abilities.js`:

```diff
--- a/abilities.js
+++ b/abilities.js
@@ -43,6 +43,14 @@
     return out;
 }
 
+function rowPulse(x, y, board) {
+    const out = [];
+    for (let i = 0; i < board.gridScale; i++) {
+        if (i !== x) out.push({x: i, y});
+    }
+    return out;
+}
+
 const offsets = list => (x, y) => list.map(([dx, dy]) => ({x: x + dx, y: y + dy}));
 
 export const ABILITIES = {
@@ -184,14 +192,25 @@
         short: "Activates its whole column.",
         label: "Column Pulse",
         line: true,
+        axis: "column",
         trigger: TRIGGERS.ON_ACTIVATED,
         target: columnPulse,
     },
+    rowPulse: {
+        id: "rowPulse",
+        short: "Activates its whole row.",
+        label: "Row Pulse",
+        line: true,
+        axis: "row",
+        trigger: TRIGGERS.ON_ACTIVATED,
+        target: rowPulse,
+    },
     rowSweep: {
         id: "rowSweep",
         short: "Activates every other cell in its row.",
         label: "Row Sweep",
         line: true,
+        axis: "row",
         trigger: TRIGGERS.ON_ACTIVATED,
         target: rowSweep,
     },
@@ -211,3 +230,9 @@
 export function isBeam(node) {
     return node.abilities.some(id => ABILITIES[id]?.line === true);
 }
+
+// Which way a beam piece sweeps: "column" or "row" (null for other pieces).
+// The two axes get different colors.
+export function beamAxis(node) {
+    return node.abilities.map(id => ABILITIES[id]).find(ability => ability?.line)?.axis ?? null;
+}
```

`puzzles.js`:

```diff
--- a/puzzles.js
+++ b/puzzles.js
@@ -13,6 +13,7 @@
     relay: {summary: "Relay", abilities: ["lineSkip2Right"]},
     knight: {summary: "Knight", abilities: ["knightJump"]},
     column: {summary: "Column", abilities: ["columnPulse"]},
+    row: {summary: "Row", abilities: ["rowPulse"]},
     pulseUp: {summary: "Pulse Up", abilities: ["runPulseUp"]},
     pulseLeft: {summary: "Pulse Left", abilities: ["runPulseLeft"]},
     duo: {summary: "Duo", abilities: ["runPair"]},
```

`pieces.js`:

```diff
--- a/pieces.js
+++ b/pieces.js
@@ -1,4 +1,4 @@
-import {ABILITIES, isBeam, isStarter} from "./abilities.js";
+import {ABILITIES, beamAxis, isBeam, isStarter} from "./abilities.js";
 
 // Probe a selector from the middle of a big empty board so edge clipping
 // never hides a target; offsets are relative to the source cell.
@@ -41,6 +41,7 @@
     reactor: {fill: "#d65a43", edge: "#92372a"},
     starter: {fill: "#d4a017", edge: "#8a6508"},
     beam: {fill: "#7b5fc4", edge: "#4f3a8c"},
+    beamRow: {fill: "#4a7fc7", edge: "#2f5593"},   // row beams: a blue next to the column beams' violet
 };
 
 export function pieceType(node) {
@@ -51,7 +52,8 @@
 }
 
 export function colorForNode(node) {
-    return PALETTE[pieceType(node)];
+    const type = pieceType(node);
+    return type === "beam" && beamAxis(node) === "row" ? PALETTE.beamRow : PALETTE[type];
 }
 
 // Unique tip directions (radians) for all of a node's abilities. A tip is a
```

`describe.js`:

```diff
--- a/describe.js
+++ b/describe.js
@@ -1,9 +1,10 @@
-import {ABILITIES, isStarter} from "./abilities.js";
+import {ABILITIES, beamAxis, isStarter} from "./abilities.js";
 import {pieceType, skipDepth} from "./pieces.js";
 
 // The piece is titled by its color; a red piece that skips tiles (the one
 // with the corner marks) is "Red w/ outline".
 const COLOR_NAMES = {receiver: "Teal", starter: "Yellow", beam: "Purple"};
+const ROW_BEAM_NAME = "Blue";
 
 // Pure: the short description shown when you hover a piece: its color as the
 // title, then quick facts (as bullet points), then a one-sentence description
@@ -11,7 +12,9 @@
 // "Activations needed" is how many more times the piece must be activated to reach 0.
 export function describePiece(node) {
     const type = pieceType(node);
-    const title = COLOR_NAMES[type] ?? (skipDepth(node) > 0 ? "Red w/ outline" : "Red");
+    const title = type === "beam" && beamAxis(node) === "row"
+        ? ROW_BEAM_NAME
+        : COLOR_NAMES[type] ?? (skipDepth(node) > 0 ? "Red w/ outline" : "Red");
     const starter = isStarter(node);
     const needed = starter
         ? "none"
```

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add abilities.js puzzles.js pieces.js describe.js engine.test.js pieces.test.js describe.test.js
git commit -m "Add Row piece with its own blue

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Split background where a column and a row cross

**Files:**
- Create: `tints.js`, `tints.test.js`
- Modify: `board.js`

**Interfaces:**
- Consumes: `beamAxis` (Task 8), `PALETTE.beamRow`.
- Produces: `tintCoverage(layers) -> Map<"x,y", {column, row}>`, `washChannels(hex, alpha) -> [r, g, b]`, `flatBackground(entry) -> css color`, `TINT_FILLS`. `Board.beamCoverage()` now returns that map, `Board.beamLayers()` layers carry `axis`, and `Board.drawBeamTints()` draws a cell covered by both a column and a row as two triangles: top-left the column color, bottom-right the row color, meeting along the anti-diagonal.

- [ ] **Step 1: Write the failing tests** (`tints.test.js`)

```js
import test from "node:test";
import assert from "node:assert/strict";
import {tintCoverage, washChannels, flatBackground, TINT_FILLS} from "./tints.js";

test("a cell crossed by a column and a row has a wash for each axis", () => {
    const coverage = tintCoverage([
        {cells: [{x: 1, y: 0}, {x: 1, y: 1}], alpha: 0.16, axis: "column"},
        {cells: [{x: 0, y: 1}, {x: 1, y: 1}], alpha: 0.16, axis: "row"},
    ]);
    const near = (entry, column, row) =>
        assert.ok(Math.abs(entry.column - column) < 1e-9 && Math.abs(entry.row - row) < 1e-9, JSON.stringify(entry));
    near(coverage.get("1,0"), 0.16, 0);
    near(coverage.get("0,1"), 0, 0.16);
    near(coverage.get("1,1"), 0.16, 0.16);
    assert.equal(coverage.get("4,4"), undefined);
});

test("two columns over one cell stack their washes", () => {
    const coverage = tintCoverage([
        {cells: [{x: 2, y: 2}], alpha: 0.2, axis: "column"},
        {cells: [{x: 2, y: 2}], alpha: 0.2, axis: "column"},
    ]);
    assert.ok(Math.abs(coverage.get("2,2").column - 0.36) < 1e-9);
});

test("washChannels: no wash is white, full wash is the color itself", () => {
    assert.deepEqual(washChannels("#7b5fc4", 0), [255, 255, 255]);
    assert.deepEqual(washChannels("#7b5fc4", 1), [0x7b, 0x5f, 0xc4]);
});

test("flatBackground: white, one wash, or the average of two", () => {
    assert.equal(flatBackground(undefined), "#ffffff");
    assert.equal(flatBackground({column: 0, row: 0}), "#ffffff");
    const [r, g, b] = washChannels(TINT_FILLS.column, 0.5);
    assert.equal(flatBackground({column: 0.5, row: 0}), `rgb(${r}, ${g}, ${b})`);
    const row = washChannels(TINT_FILLS.row, 0.5);
    const avg = [r, g, b].map((c, i) => Math.round((c + row[i]) / 2));
    assert.equal(flatBackground({column: 0.5, row: 0.5}), `rgb(${avg.join(", ")})`);
});
```

- [ ] **Step 2: Run to confirm they fail**

Run: `node --test tints.test.js`
Expected: FAIL (`./tints.js` does not exist).

- [ ] **Step 3: Create `tints.js`**

```js
import {PALETTE} from "./pieces.js";

// Pure helpers for the wash a beam piece lays over the cells it covers. A
// column's wash and a row's wash have different colors; a cell covered by both
// is drawn half and half (see Board.drawBeamTints).

export const TINT_FILLS = {column: PALETTE.beam.fill, row: PALETTE.beamRow.fill};

const channels = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

// Combined wash strength per cell: Map of "x,y" -> {column, row}, each 0-1.
// `layers` are {cells: [{x, y}], alpha, axis: "column" | "row"}; overlapping
// layers of one axis stack up.
export function tintCoverage(layers) {
    const coverage = new Map();
    for (const {cells, alpha, axis} of layers) {
        for (const {x, y} of cells) {
            const key = `${x},${y}`;
            const entry = coverage.get(key) ?? {column: 0, row: 0};
            entry[axis] = 1 - (1 - entry[axis]) * (1 - alpha);
            coverage.set(key, entry);
        }
    }
    return coverage;
}

// White with a wash of `hex` at `alpha` over it, as [r, g, b].
export function washChannels(hex, alpha) {
    return channels(hex).map(c => Math.round(255 - (255 - c) * alpha));
}

// One flat color for a cell (white, one wash, or the average of both washes
// where a column and a row cross). Used to back faded pieces.
export function flatBackground(entry) {
    if (!entry || (entry.column === 0 && entry.row === 0)) return "#ffffff";
    const washes = ["column", "row"]
        .filter(axis => entry[axis] > 0)
        .map(axis => washChannels(TINT_FILLS[axis], entry[axis]));
    const mixed = [0, 1, 2].map(i => Math.round(washes.reduce((sum, w) => sum + w[i], 0) / washes.length));
    return `rgb(${mixed.join(", ")})`;
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test tints.test.js`
Expected: 4 pass.

- [ ] **Step 5: Apply this change to `board.js`**

```diff
--- a/board.js
+++ b/board.js
@@ -1,6 +1,7 @@
 import {makeEmptyNode} from "./node.js";
 import {drawPieceShape, colorForNode, targetCells, pieceType, dotRing, bodyEdgeDistance, shadeBeamEnd, PALETTE} from "./pieces.js";
-import {isBeam} from "./abilities.js";
+import {beamAxis, isBeam} from "./abilities.js";
+import {tintCoverage, flatBackground, TINT_FILLS} from "./tints.js";
 import {wireLinks, drawnLinks, linkKey, skipHits, dotAngles, beamLevel, beamWidths} from "./wires.js";
 
 export class Board {
@@ -155,11 +156,9 @@
         return String(gridScale - row);
     }
 
-    // A soft purple wash over every cell a placed beam piece (column / row
-    // sweep) covers, including the beam's own cell.
-    // One tint layer per placed beam piece (column / row sweep): the cells it
-    // covers, including its own, and how strong the purple wash is. A beam's
-    // wash gets slightly darker while its piece is hovered.
+    // One tint layer per placed beam piece (column / row): its axis, the cells
+    // it covers (including its own), and how strong its wash is. A beam's wash
+    // gets slightly darker while its piece is hovered.
     beamLayers() {
         const layers = [];
         for (let i = 0; i < this.gridScale; i++) {
@@ -168,6 +167,7 @@
                 if (node.isEmpty || !isBeam(node)) continue;
                 const hovered = this.hoverCell !== null && this.hoverCell.x === i && this.hoverCell.y === j;
                 layers.push({
+                    axis: beamAxis(node),
                     cells: [{x: i, y: j}, ...targetCells(node, i, j, this.gridScale)],
                     alpha: Board.TINT_ALPHA + (hovered ? Board.TINT_HOVER_BOOST : 0),
                 });
@@ -176,36 +176,49 @@
         return layers;
     }
 
-    // Combined wash strength in each cell: Map of "x,y" -> alpha (0-1).
+    // Combined wash strength in each cell: Map of "x,y" -> {column, row}.
     beamCoverage() {
-        const coverage = new Map();
-        for (const {cells, alpha} of this.beamLayers()) {
-            for (const {x, y} of cells) {
-                const key = `${x},${y}`;
-                coverage.set(key, 1 - (1 - (coverage.get(key) ?? 0)) * (1 - alpha));
-            }
-        }
-        return coverage;
+        return tintCoverage(this.beamLayers());
     }
 
-    // The board color in a cell: white, or white under the purple tint.
+    // The board color in a cell: white, or white under the beam wash(es).
     cellBackground(coverage, i, j) {
-        const alpha = coverage.get(`${i},${j}`) ?? 0;
-        if (alpha === 0) return "#ffffff";
-        const [r, g, b] = [0x7b, 0x5f, 0xc4].map(c => Math.round(255 - (255 - c) * alpha));
-        return `rgb(${r}, ${g}, ${b})`;
+        return flatBackground(coverage.get(`${i},${j}`));
     }
 
-    // A soft purple wash over every cell a placed beam piece covers.
+    // A soft wash over every cell a placed beam piece covers: violet for
+    // columns, blue for rows. Where a column and a row cross, the cell is split
+    // along its anti-diagonal: top-left triangle the column's color, bottom-right
+    // triangle the row's, meeting in the middle.
     drawBeamTints() {
         const ctx = this.ctx;
+        const size = this.gridSize;
         ctx.save();
-        ctx.fillStyle = PALETTE.beam.fill;
-        for (const {cells, alpha} of this.beamLayers()) {
-            ctx.globalAlpha = alpha;
-            for (const {x, y} of cells) {
-                const o = this.cellOrigin(x, y);
-                ctx.fillRect(o.x, o.y, this.gridSize, this.gridSize);
+        for (const [key, {column, row}] of this.beamCoverage()) {
+            const [x, y] = key.split(",").map(Number);
+            const o = this.cellOrigin(x, y);
+            if (column > 0 && row > 0) {
+                ctx.globalAlpha = column;
+                ctx.fillStyle = TINT_FILLS.column;
+                ctx.beginPath();
+                ctx.moveTo(o.x, o.y);
+                ctx.lineTo(o.x + size, o.y);
+                ctx.lineTo(o.x, o.y + size);
+                ctx.closePath();
+                ctx.fill();
+                ctx.globalAlpha = row;
+                ctx.fillStyle = TINT_FILLS.row;
+                ctx.beginPath();
+                ctx.moveTo(o.x + size, o.y);
+                ctx.lineTo(o.x + size, o.y + size);
+                ctx.lineTo(o.x, o.y + size);
+                ctx.closePath();
+                ctx.fill();
+            } else {
+                const axis = column > 0 ? "column" : "row";
+                ctx.globalAlpha = Math.max(column, row);
+                ctx.fillStyle = TINT_FILLS[axis];
+                ctx.fillRect(o.x, o.y, size, size);
             }
         }
         ctx.restore();
```

Also in `board.js`, change the comment on `static TINT_ALPHA = 0.16;` from `// opacity of the purple wash under a beam piece` to `// opacity of the wash under a beam piece`.

- [ ] **Step 6: Manual check in the browser**

Run: `npm start`. Temporarily load a board with both kinds (for example in the browser console, or by editing a scratch puzzle definition locally and not committing it) with a Column and a Row whose lines cross on an empty cell and on a piece.
Expected: column cells are violet washed, row cells are blue washed; the crossing cell is split along the diagonal from its top-right corner to its bottom-left corner, top-left triangle violet and bottom-right triangle blue; hovering a beam piece deepens only its own wash; a dimmed piece on the crossing cell has a flat mixed backing (a known simplification).

- [ ] **Step 7: Run the suite and commit**

Run: `npm test` (expected: all pass)

```bash
git add tints.js tints.test.js board.js
git commit -m "Split cell background where a column and row cross

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full suite, several times** (the property tests use random boards)

Run: `for i in 1 2 3 4 5; do npm test 2>&1 | grep -E "^# (tests|pass|fail)" | tr '\n' ' '; echo; done`
Expected: every line shows 0 failures.

- [ ] **Step 2: Hand-built levels**

In the browser, play levels 1-10 to confirm each still wins with its known solution (use "Show Solution") and that the run now plays one yellow piece at a time, top-left to top-right then down.

- [ ] **Step 3: Random boards**

Press the dice about 20 times. Expected: each board has a hand of 5; some pieces are spares; no yellow piece points only off the board; no red piece does nothing; "Show Solution" always wins; the button never makes the page wait.

- [ ] **Step 4: Report** what passed, what you saw, and anything that looked off (for example theme variety: if one kind of board dominates, re-measure `RANGES` in `score.js`).

---

## Self-Review

**Spec coverage:** Section 1 (run order) -> Tasks 1-2. Section 2 (placement limit, spares, gate) -> Tasks 3-4. Section 3 (scoring, `generateBest`) -> Tasks 5-6. Section 4 (cache) -> Task 7. Section 5 (testing) -> tests inside each task plus Task 10. Row piece and split background (added later) -> Tasks 8-9.

**Placeholder scan:** none; every code step has the code.

**Type consistency:** `root` (`{x, y}`) is produced in Task 1 and consumed in Tasks 2 and 5. `layout`/`isSensible` (Task 3) are used in Tasks 4, 5, 6. `scorePuzzle` (Task 5) is used in Task 6. `startBest`/`generateBest` (Task 6) are used in Task 7. `beamAxis` and `PALETTE.beamRow` (Task 8) are used in Task 9. `createPuzzleCache` option names (`newRun`, `quick`, `size`, `slice`, `schedule`) match between Task 7's code and tests.
