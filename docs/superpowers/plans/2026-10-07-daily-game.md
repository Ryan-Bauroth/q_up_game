# Daily Game (3x3, 5x5, 7x7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A home page with three modes (3x3, 5x5, 7x7), each with a daily puzzle (the same for everyone, generated from the Eastern date) and an unlimited mode, with streaks, in a hand-drawn paper-and-ink look that leaves the game board itself unchanged.

**Architecture:** A chain-growing generator makes valid puzzles at any size. `daily.js` drives it with a seed made from the Eastern date and the size. Small pure modules (`dates.js`, `progress.js`, `play-model.js`, `home-model.js`) hold the rules and are unit tested. `index.html` is the home page, `play.html?size=&mode=` is the game, both styled by `paper.css` (with `ink.js` giving raised pieces their wobbling outline). Everything is static, so it can be hosted on GitHub Pages.

**Tech Stack:** Plain ES modules, `node --test` (`npm test`, Node 22+), canvas, CSS. No new dependencies. Google Fonts (Caveat Brush, Patrick Hand) are loaded by `<link>`.

**Spec:** `docs/superpowers/specs/2026-10-07-daily-game-design.md`. Visual reference: `docs/superpowers/mockups/home-and-game-v4.html`. The code in this plan was written and run in a scratch copy first (all unit tests pass, and the browser flow was driven end to end), then split into the tasks below.

## Global Constraints

- Sizes are exactly 3, 5 and 7 (`SIZES` in `generator.js`).
- A "day" is the calendar date in `America/New_York` (midnight EST in winter, midnight EDT in summer), written `YYYY-MM-DD`.
- The daily seed is a 32-bit FNV-1a hash of `"<date>:<size>"`, fed to mulberry32. Integer math only. The daily path never uses `Math.random`.
- Progress is stored in `localStorage` under `qup-progress-v1` as `{"3": {"last": "YYYY-MM-DD", "streak": N}, ...}`. Blocked, empty or corrupt storage must never throw.
- Daily mode has no Show Solution, New, Back or forward. Unlimited keeps them.
- The board canvas, grid, pieces, beams, hover behavior and animations are never restyled or wobbled. Only the page around the board takes the paper-and-ink look.
- Hand pieces still show 1 and need no activations (existing rule; do not change it).
- Tokens: ink `#25221d`, paper `#f4efe4`, white `#ffffff`, coral `#d65a43`; piece colors unchanged. Fonts: Caveat Brush for headings, Patrick Hand for text, with `"Segoe Print", "Bradley Hand", cursive` fallbacks.
- Static hosting only (GitHub Pages): every link and import is relative, with no leading slash, and nothing needs a server at runtime.
- The full suite (`npm test`) must pass after every task. 4-space indent, double quotes, semicolons, short explanatory comments, matching the surrounding code.
- Commit messages end with: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`
- Browser checks use headless Chrome at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` and the project's own server (`npm start`, http://localhost:3000). Images can be read with the Read tool.

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `puzzles.js` | modify | `KINDS`, `makePiece`, `sizeOf`, `buildFromDefinition` (size aware); hand-built levels removed |
| `lint.js` | modify | `isSensible` for any size |
| `generator.js` | rewrite | Chain-growing generator, per-size config |
| `dates.js` | create | Eastern date, time until midnight, `addDays`, `formatDay`, `formatCountdown` |
| `daily.js` | create | Seed, seeded random source, `dailyDefinition` |
| `progress.js` | create | Streak rules and safe storage |
| `play-model.js` | create | URL parameters, titles, win messages, canvas sizes |
| `home-model.js` | create | One mode card's description, tally marks |
| `ink.js` | create | Adds the wobbling outline layer to raised pieces |
| `paper.css` | create | The paper-and-ink look, shared |
| `index.html`, `home.js` | create (old `index.html` moves to `play.html`) | Home page |
| `play.html`, `play.css`, `game.js` | modify | The game page |
| `tools/e2e-daily.mjs` | create | Real-browser check of the daily flow |

---

### Task 1: Boards of any size

**Files:**
- Modify: `puzzles.js`, `lint.js`, `game.js` (rename only), `generator.js` (rename only)
- Test: `lint.test.js`, `puzzles.test.js`, `generator.test.js` (rename only)

**Interfaces:**
- Produces: `DEFAULT_SIZE = 5` and `sizeOf(definition) -> definition.size ?? 5` exported from `puzzles.js` (the old `PUZZLE_SIZE` is renamed `DEFAULT_SIZE` everywhere). `buildFromDefinition(def)` builds a `sizeOf(def)` x `sizeOf(def)` grid. `isSensible(definition)` checks a board of `sizeOf(definition)`.

- [ ] **Step 1: Rename the constant** (it is the default size, not the only size)

```bash
perl -pi -e 's/\bPUZZLE_SIZE\b/DEFAULT_SIZE/g' lint.js generator.js generator.test.js puzzles.js puzzles.test.js game.js
npm test
```
Expected: all tests pass (a pure rename).

- [ ] **Step 2: Write the failing tests.** Append to `lint.test.js`:

```js

test("a 3x3 board is checked on a 3x3 grid", () => {
    const small = {
        name: "Random",
        size: 3,
        locked: [[0, 0, "igniter", 1], [0, 2, "receiver", 1], [1, 1, "receiver", 1]],
        hand: ["burster"],
        solution: [{x: 0, y: 1, kind: "burster"}],
    };
    assert.equal(isSensible(small), true);
});

test("a 7x7 board is checked on a 7x7 grid", () => {
    const big = {
        name: "Random",
        size: 7,
        locked: [[6, 5, "igniter", 1], [5, 6, "receiver", 1]],
        hand: ["burster"],
        solution: [{x: 6, y: 6, kind: "burster"}],
    };
    assert.equal(isSensible(big), true);
});
```

In `puzzles.test.js`, change the import line to

```js
import {buildPuzzle, buildFromDefinition, puzzleCount, DEFAULT_SIZE} from "./puzzles.js";
```

and append:

```js

test("a definition's size sets the grid size (5 when it has none)", () => {
    const side = def => buildFromDefinition(def).grid.length;
    assert.equal(side({locked: [], hand: []}), 5);
    assert.equal(side({size: 3, locked: [], hand: []}), 3);
    assert.equal(side({size: 7, locked: [], hand: []}), 7);
    assert.equal(buildFromDefinition({size: 7, locked: [], hand: []}).grid[6].length, 7);
});
```

- [ ] **Step 3: Run to confirm they fail**

Run: `node --test lint.test.js puzzles.test.js`
Expected: the 7x7 lint test and the size test FAIL (the 3x3 lint test may already pass, since small coordinates fit on a 5x5 grid).

- [ ] **Step 4: Apply these changes**

`puzzles.js`:

```diff
--- a/puzzles.js
+++ b/puzzles.js
@@ -31,7 +31,10 @@
 export const makePiece = (kind, charges = 1, locked = false, required = true) =>
     new Node({id: nextId++, summary: KINDS[kind].summary, charges, abilities: [...KINDS[kind].abilities], locked, required});
 
+// A definition may carry its own `size`; ones without (the hand-built levels)
+// are 5x5.
 export const DEFAULT_SIZE = 5;
+export const sizeOf = definition => definition.size ?? DEFAULT_SIZE;
 
 // Each puzzle: a name, the locked pieces as [x, y, kind, charges], and the
 // hand as a list of kinds. Every puzzle is checked for solvability in
@@ -120,8 +123,9 @@
 // can be called again to reset a puzzle. Works for the hand-built puzzles and
 // for generated ones.
 export function buildFromDefinition(def) {
-    const grid = Array.from({length: DEFAULT_SIZE}, () =>
-        Array.from({length: DEFAULT_SIZE}, () => makeEmptyNode())
+    const size = sizeOf(def);
+    const grid = Array.from({length: size}, () =>
+        Array.from({length: size}, () => makeEmptyNode())
     );
     for (const [x, y, kind, charges = 1] of def.locked) {
         grid[x][y] = makePiece(kind, charges, true);
```

`lint.js`:

```diff
--- a/lint.js
+++ b/lint.js
@@ -1,5 +1,5 @@
 import {cloneGrid, simulate} from "./engine.js";
-import {buildFromDefinition, makePiece, DEFAULT_SIZE} from "./puzzles.js";
+import {buildFromDefinition, makePiece, sizeOf} from "./puzzles.js";
 
 // Sanity gate for generated puzzles: rejects boards with pointless pieces.
 
@@ -16,22 +16,23 @@
     return grid;
 }
 
-const run = grid => simulate(cloneGrid(grid, DEFAULT_SIZE), DEFAULT_SIZE);
+const run = (grid, size) => simulate(cloneGrid(grid, size), size);
 
 export function isSensible(definition) {
+    const size = sizeOf(definition);
     const full = layout(definition);
     if (!full) return false;
-    const result = run(full);
+    const result = run(full, size);
     if (!result.won) return false;
     // not already solved before anything is placed
-    if (run(buildFromDefinition(definition).grid).won) return false;
+    if (run(buildFromDefinition(definition).grid, size).won) return false;
     // every placed piece is needed
     for (let i = 0; i < definition.solution.length; i++) {
-        if (run(layout(definition, i)).won) return false;
+        if (run(layout(definition, i), size).won) return false;
     }
     // every piece that has an output must actually activate something
-    for (let x = 0; x < DEFAULT_SIZE; x++) {
-        for (let y = 0; y < DEFAULT_SIZE; y++) {
+    for (let x = 0; x < size; x++) {
+        for (let y = 0; y < size; y++) {
             const node = full[x][y];
             if (node.isEmpty || node.abilities.length === 0) continue;
             const useful = result.trace.some(s =>
```

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add puzzles.js lint.js game.js generator.js generator.test.js puzzles.test.js lint.test.js
git commit -m "Let puzzle definitions carry their own board size

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: A generator that works at every size

**Files:**
- Rewrite: `generator.js`, `generator.test.js`

**Interfaces:**
- Consumes: `isSensible` (Task 1), `buildFromDefinition`, `KINDS`.
- Produces: `generateDefinition({size = 5, rng = Math.random, maxAttempts = 20000}) -> {name, size, locked, hand, solution}`; exports `SIZES = [3, 5, 7]`, `SIZE_CONFIG`, `STARTER_KINDS`, `REACTOR_KINDS`. Throws `unsupported puzzle size: N` for any other size. A given `rng` always produces the same puzzle (kinds lists have a fixed order).
- Replaces the old random-scatter generator, which failed at 7x7 about 1 time in 5 and never produced a 9x9 board. It also removes the generator's dependency on the hand-built levels.

- [ ] **Step 1: Replace `generator.test.js`** with this

```js
import test from "node:test";
import assert from "node:assert/strict";
import {generateDefinition, SIZES, SIZE_CONFIG, STARTER_KINDS, REACTOR_KINDS} from "./generator.js";
import {buildFromDefinition} from "./puzzles.js";
import {KINDS} from "./puzzles.js";
import {validatePuzzle} from "./rules.js";
import {isSensible, layout} from "./lint.js";
import {simulate, cloneGrid} from "./engine.js";
import {ABILITIES} from "./abilities.js";

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

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

for (const size of SIZES) {
    for (const seed of SEEDS) {
        test(`${size}x${size} puzzle (seed ${seed}) is valid, sensible and the right shape`, () => {
            const definition = generateDefinition({size, rng: seeded(seed)});
            const config = SIZE_CONFIG[size];
            assert.equal(definition.size, size);

            // pieces start where the rules say: locked on the board, the rest in the hand
            const {grid, pool} = buildFromDefinition(definition);
            assert.equal(grid.length, size);
            assert.doesNotThrow(() => validatePuzzle(grid, pool));

            // the stored solution wins, every piece in it is needed, nothing is pointless
            assert.equal(isSensible(definition), true);

            // hand: the placed pieces plus 1-2 spares
            const placed = definition.solution.length;
            const spares = definition.hand.length - placed;
            assert.ok(placed >= config.hand[0] && placed <= config.hand[1], `placed ${placed}`);
            assert.ok(spares === 1 || spares === 2, `spares ${spares}`);
            const hand = [...definition.hand];
            for (const {kind} of definition.solution) {
                const i = hand.indexOf(kind);
                assert.ok(i >= 0, kind);
                hand.splice(i, 1);
            }

            // number of locked targets is within the size's range
            const targets = definition.locked.filter(([, , kind]) => kind === "receiver").length;
            assert.ok(targets >= config.targets[0] && targets <= config.targets[1], `targets ${targets}`);

            // only allowed piece kinds
            const allowed = new Set([...STARTER_KINDS, ...REACTOR_KINDS, "receiver"]);
            for (const kind of [...definition.locked.map(l => l[2]), ...definition.hand]) assert.ok(allowed.has(kind), kind);
        });
    }
}

test("generation is deterministic for a given seed, at every size", () => {
    for (const size of SIZES) {
        const a = generateDefinition({size, rng: seeded(42)});
        const b = generateDefinition({size, rng: seeded(42)});
        assert.deepEqual(a, b);
    }
});

test("different seeds give different puzzles", () => {
    for (const size of SIZES) {
        const a = generateDefinition({size, rng: seeded(10)});
        const b = generateDefinition({size, rng: seeded(11)});
        assert.notDeepEqual([a.locked, a.solution], [b.locked, b.solution]);
    }
});

test("an unsupported size throws", () => {
    assert.throws(() => generateDefinition({size: 4}), /size/);
    assert.throws(() => generateDefinition({size: 9}), /size/);
});

test("the default random source works", () => {
    const definition = generateDefinition({size: 3});
    assert.equal(isSensible(definition), true);
});

const reaches = (kind, x, y, size) => KINDS[kind].abilities.some(id => ABILITIES[id].target(x, y, {gridScale: size})
    .some(t => t.x >= 0 && t.x < size && t.y >= 0 && t.y < size && !(t.x === x && t.y === y)));

test("no silly locked pieces: each one reaches the board and activates something", () => {
    for (const size of SIZES) {
        for (let seed = 100; seed < 130; seed++) {
            const definition = generateDefinition({size, rng: seeded(seed)});
            const {trace} = simulate(cloneGrid(layout(definition), size), size);
            for (const [x, y, kind] of definition.locked) {
                if (kind === "receiver") continue;
                assert.ok(reaches(kind, x, y, size), `${size}x${size} seed ${seed}: locked ${kind} at ${x},${y} points off the board`);
                const useful = trace.some(s => s.sourceX === x && s.sourceY === y && s.targets.some(t => t.consumed));
                assert.ok(useful, `${size}x${size} seed ${seed}: locked ${kind} at ${x},${y} activates nothing`);
            }
        }
    }
});

test("beam pieces stay within the size's limit, and Row and Column pieces both turn up", () => {
    const seen = new Set();
    for (const size of SIZES) {
        for (let seed = 200; seed < 260; seed++) {
            const definition = generateDefinition({size, rng: seeded(seed)});
            const kinds = [...definition.locked.map(l => l[2]), ...definition.solution.map(s => s.kind)];
            const beams = kinds.filter(kind => KINDS[kind].abilities.some(id => ABILITIES[id].line));
            assert.ok(beams.length <= SIZE_CONFIG[size].beams, `${size}x${size} seed ${seed}: ${beams.length} beams`);
            for (const kind of kinds) seen.add(kind);
        }
    }
    assert.ok(seen.has("row"), "no Row piece in 180 puzzles");
    assert.ok(seen.has("column"), "no Column piece in 180 puzzles");
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `node --test generator.test.js`
Expected: FAIL (`SIZES` and the other exports do not exist yet).

- [ ] **Step 3: Replace `generator.js`** with this

```js
import {cloneGrid, simulate} from "./engine.js";
import {ABILITIES} from "./abilities.js";
import {buildFromDefinition, KINDS} from "./puzzles.js";
import {isSensible} from "./lint.js";

// Random puzzle generator. A puzzle is completable BY CONSTRUCTION: it grows a
// chain of pieces, each one placed on a cell that a piece already on the board
// will activate, so every piece gets used. The cells the chain hits that hold no
// piece become locked targets with exactly the charge needed. Some of the
// pieces then move into the hand as the solution (plus a spare or two), and the
// result is re-checked against the real engine.

export const SIZES = [3, 5, 7];

// Fixed lists (and a fixed order), so a seeded generator always gives the same
// puzzle. The Row piece is the Column piece turned sideways.
export const STARTER_KINDS = ["igniter", "pusher", "pulseLeft"];
export const REACTOR_KINDS = ["burster", "cross", "octo", "knight", "column", "pairV", "pairH", "tee", "spread", "leap", "row"];

// Per size: [min, max] pieces in the chain, how many of them go to the hand as
// the solution, how many starters, how many locked targets are allowed, and how
// many whole-line (Column / Row) pieces.
export const SIZE_CONFIG = {
    3: {pieces: [3, 4], hand: [1, 2], starters: 1, targets: [3, 5], beams: 1},
    5: {pieces: [6, 8], hand: [3, 4], starters: 1, targets: [5, 9], beams: 1},
    7: {pieces: [11, 15], hand: [5, 7], starters: 2, targets: [9, 14], beams: 2},
};

const isBeamKind = kind => KINDS[kind].abilities.some(id => ABILITIES[id].line);

export function generateDefinition({size = 5, rng = Math.random, maxAttempts = 20000} = {}) {
    const config = SIZE_CONFIG[size];
    if (!config) throw new Error(`unsupported puzzle size: ${size}`);

    const pick = list => list[Math.floor(rng() * list.length)];
    const between = ([min, max]) => min + Math.floor(rng() * (max - min + 1));
    const shuffle = list => {
        for (let i = list.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [list[i], list[j]] = [list[j], list[i]];
        }
        return list;
    };
    const inBounds = (x, y) => x >= 0 && x < size && y >= 0 && y < size;
    // in-bounds cells (other than its own) that a piece at (x, y) would hit
    const targetsOf = (kind, x, y) => KINDS[kind].abilities
        .flatMap(id => ABILITIES[id].target(x, y, {gridScale: size}))
        .filter(t => inBounds(t.x, t.y) && !(t.x === x && t.y === y));

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const total = between(config.pieces);
        const taken = new Set();
        const placed = [];
        const put = (kind, x, y) => {
            placed.push({kind, x, y});
            taken.add(`${x},${y}`);
        };

        // starters first, anywhere they reach the board
        for (let i = 0; i < config.starters; i++) {
            for (let tries = 0; tries < 50; tries++) {
                const kind = pick(STARTER_KINDS);
                const x = Math.floor(rng() * size), y = Math.floor(rng() * size);
                if (!taken.has(`${x},${y}`) && targetsOf(kind, x, y).length > 0) {
                    put(kind, x, y);
                    break;
                }
            }
        }
        if (placed.length === 0) continue;

        // grow the chain: a new reactor goes on a free cell that an existing piece hits
        let beams = 0;
        let stuck = 0;
        while (placed.length < total && stuck < 200) {
            const source = pick(placed);
            const free = targetsOf(source.kind, source.x, source.y).filter(t => !taken.has(`${t.x},${t.y}`));
            if (free.length === 0) {
                stuck++;
                continue;
            }
            const cell = pick(free);
            const kinds = REACTOR_KINDS.filter(kind =>
                (beams < config.beams || !isBeamKind(kind)) && targetsOf(kind, cell.x, cell.y).length > 0);
            if (kinds.length === 0) {
                stuck++;
                continue;
            }
            const kind = pick(kinds);
            if (isBeamKind(kind)) beams++;
            put(kind, cell.x, cell.y);
        }
        if (placed.length < total) continue;

        // run everything at once: each piece must fire, and the empty cells that
        // got hit become locked targets
        const probe = buildFromDefinition({size, locked: placed.map(p => [p.x, p.y, p.kind, 1]), hand: []});
        const sim = cloneGrid(probe.grid, size);
        const {trace} = simulate(sim, size);
        if (placed.some(p => sim[p.x][p.y].charges > 0)) continue;
        const hits = new Map();
        for (const step of trace) {
            for (const t of step.targets) {
                if (!probe.grid[t.x][t.y].isEmpty) continue;
                const key = `${t.x},${t.y}`;
                hits.set(key, (hits.get(key) ?? 0) + 1);
            }
        }
        if (hits.size < config.targets[0] || hits.size > config.targets[1]) continue;
        if ([...hits.values()].some(count => count > 3)) continue;

        // some non-starter pieces become the solution (they go to the hand)
        const movable = shuffle(placed.filter(p => !STARTER_KINDS.includes(p.kind)));
        const wanted = between(config.hand);
        if (movable.length < wanted) continue;
        const solution = movable.slice(0, wanted);
        const locked = placed.filter(p => !solution.includes(p));

        // 1-2 spares
        const spares = Array.from({length: 1 + Math.floor(rng() * 2)}, () => pick(rng() < 0.15 ? STARTER_KINDS : REACTOR_KINDS));

        const definition = {
            name: "Random",
            size,
            locked: [
                ...locked.map(p => [p.x, p.y, p.kind, 1]),
                ...[...hits].map(([key, count]) => [...key.split(",").map(Number), "receiver", count]),
            ],
            hand: shuffle([...solution.map(p => p.kind), ...spares]),
            solution: solution.map(({x, y, kind}) => ({x, y, kind})),
        };
        if (isSensible(definition)) return definition;
    }
    throw new Error(`could not generate a ${size}x${size} puzzle`);
}
```

- [ ] **Step 4: Run the tests, then the suite**

Run: `node --test generator.test.js && npm test`
Expected: all pass. (About 0.1 ms per 3x3 or 5x5 board and about 1 ms per 7x7 board; no failures in 300 boards per size.)

- [ ] **Step 5: Commit**

```bash
git add generator.js generator.test.js
git commit -m "Grow a chain of pieces to generate puzzles of any size

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Eastern dates and the daily puzzle

**Files:**
- Create: `dates.js`, `dates.test.js`, `daily.js`, `daily.test.js`

**Interfaces:**
- Consumes: `generateDefinition` (Task 2).
- Produces (`dates.js`): `easternDateString(now = new Date()) -> "YYYY-MM-DD"`, `msUntilNextEasternMidnight(now) -> ms`, `addDays(dateString, days) -> "YYYY-MM-DD"`, `formatDay("2026-10-07") -> "Oct 7"`, `formatCountdown(ms) -> "3h 12m" | "59m" | "less than a minute"`.
- Produces (`daily.js`): `dailySeed(dateString, size) -> uint32`, `seededRng(seed) -> () => [0, 1)`, `dailyDefinition(dateString, size) -> definition` (named `Daily <date>`).

- [ ] **Step 1: Write the failing tests.** Create `dates.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {easternDateString, msUntilNextEasternMidnight, addDays, formatDay, formatCountdown} from "./dates.js";

const at = iso => new Date(iso);

test("the date changes at midnight Eastern, in summer (EDT, UTC-4)", () => {
    assert.equal(easternDateString(at("2026-10-07T03:59:59Z")), "2026-10-06");
    assert.equal(easternDateString(at("2026-10-07T04:00:00Z")), "2026-10-07");
});

test("the date changes at midnight Eastern, in winter (EST, UTC-5)", () => {
    assert.equal(easternDateString(at("2026-12-07T04:59:59Z")), "2026-12-06");
    assert.equal(easternDateString(at("2026-12-07T05:00:00Z")), "2026-12-07");
});

test("the date is right on the day clocks go forward (Mar 8) and back (Nov 1)", () => {
    assert.equal(easternDateString(at("2026-03-08T04:59:59Z")), "2026-03-07");
    assert.equal(easternDateString(at("2026-03-08T05:00:00Z")), "2026-03-08");
    assert.equal(easternDateString(at("2026-11-01T03:59:59Z")), "2026-10-31");
    assert.equal(easternDateString(at("2026-11-01T04:00:00Z")), "2026-11-01");
    // the repeated hour does not change the date
    assert.equal(easternDateString(at("2026-11-01T06:30:00Z")), "2026-11-01");
});

test("time until the next Eastern midnight", () => {
    assert.equal(msUntilNextEasternMidnight(at("2026-10-07T03:59:30Z")), 30 * 1000);
    assert.equal(msUntilNextEasternMidnight(at("2026-10-07T04:00:00Z")), 24 * 3600 * 1000);
    assert.equal(msUntilNextEasternMidnight(at("2026-10-07T16:00:00Z")), 12 * 3600 * 1000);
});

test("time until midnight is right on a 23-hour day and a 25-hour day", () => {
    assert.equal(msUntilNextEasternMidnight(at("2026-03-08T05:00:00Z")), 23 * 3600 * 1000);
    assert.equal(msUntilNextEasternMidnight(at("2026-11-01T04:00:00Z")), 25 * 3600 * 1000);
});

test("addDays steps through the calendar, including month, year and leap-day edges", () => {
    assert.equal(addDays("2026-10-07", -1), "2026-10-06");
    assert.equal(addDays("2026-10-07", 1), "2026-10-08");
    assert.equal(addDays("2026-03-01", -1), "2026-02-28");
    assert.equal(addDays("2024-03-01", -1), "2024-02-29");
    assert.equal(addDays("2026-01-01", -1), "2025-12-31");
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
    assert.equal(addDays("2026-10-07", 0), "2026-10-07");
});

test("formatDay gives a short month and day", () => {
    assert.equal(formatDay("2026-10-07"), "Oct 7");
    assert.equal(formatDay("2026-01-05"), "Jan 5");
    assert.equal(formatDay("2026-12-31"), "Dec 31");
});

test("the countdown reads in hours and minutes", () => {
    assert.equal(formatCountdown(3 * 3600 * 1000 + 12 * 60 * 1000 + 59 * 1000), "3h 12m");
    assert.equal(formatCountdown(3600 * 1000), "1h 0m");
    assert.equal(formatCountdown(59 * 60 * 1000), "59m");
    assert.equal(formatCountdown(60 * 1000), "1m");
    assert.equal(formatCountdown(59 * 1000), "less than a minute");
    assert.equal(formatCountdown(0), "less than a minute");
    assert.equal(formatCountdown(25 * 3600 * 1000), "25h 0m");
});
```

Create `daily.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {dailySeed, seededRng, dailyDefinition} from "./daily.js";
import {isSensible} from "./lint.js";

// FNV-1a over a value's JSON: a short fingerprint of a whole puzzle
const fingerprint = value => {
    let hash = 0x811c9dc5;
    for (const char of JSON.stringify(value)) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
};

test("the seed depends on the date and the size, and is a fixed number", () => {
    assert.equal(dailySeed("2026-10-07", 5), 1407840162);
    assert.notEqual(dailySeed("2026-10-07", 5), dailySeed("2026-10-08", 5));
    assert.notEqual(dailySeed("2026-10-07", 5), dailySeed("2026-10-07", 7));
});

test("the seeded random source gives fixed numbers (the same on every browser)", () => {
    const random = seededRng(1);
    assert.deepEqual([random(), random(), random()], [0.6270739405881613, 0.002735721180215478, 0.5274470399599522]);
    const again = seededRng(1);
    assert.equal(again(), 0.6270739405881613);
});

test("the same date and size always give the same puzzle", () => {
    for (const size of [3, 5, 7]) {
        assert.deepEqual(dailyDefinition("2026-10-07", size), dailyDefinition("2026-10-07", size));
    }
});

test("different days and different sizes give different puzzles", () => {
    const key = definition => JSON.stringify([definition.locked, definition.solution]);
    assert.notEqual(key(dailyDefinition("2026-10-07", 5)), key(dailyDefinition("2026-10-08", 5)));
    assert.notEqual(key(dailyDefinition("2026-10-07", 3)), key(dailyDefinition("2026-10-07", 5)));
});

test("daily puzzles are valid and carry their size and date", () => {
    for (const size of [3, 5, 7]) {
        const definition = dailyDefinition("2026-10-07", size);
        assert.equal(definition.size, size);
        assert.equal(definition.name, "Daily 2026-10-07");
        assert.equal(isSensible(definition), true);
    }
});

// PINNED: these are today's puzzles for everyone. If this test fails because the
// generator changed on purpose, the daily puzzle changes for every player.
test("pinned daily puzzles do not change", () => {
    assert.equal(fingerprint(dailyDefinition("2026-10-07", 3)), 1479685802);
    assert.equal(fingerprint(dailyDefinition("2026-10-07", 5)), 3633799687);
    assert.equal(fingerprint(dailyDefinition("2026-10-07", 7)), 596302807);
    assert.equal(fingerprint(dailyDefinition("2026-10-08", 5)), 3514836754);
    assert.equal(fingerprint(dailyDefinition("2027-01-01", 3)), 1550282705);
    assert.equal(fingerprint(dailyDefinition("2027-01-01", 7)), 3799516143);
    assert.deepEqual(dailyDefinition("2026-10-07", 3), {
        name: "Daily 2026-10-07",
        size: 3,
        locked: [[1, 1, "pusher", 1], [2, 1, "row", 1], [0, 1, "cross", 1], [1, 0, "receiver", 1], [0, 2, "receiver", 1], [2, 2, "receiver", 1]],
        hand: ["pairV", "pulseLeft", "pairH"],
        solution: [{x: 1, y: 2, kind: "pairH"}],
    });
});
```

The six fingerprints and the pinned 3x3 board in "pinned daily puzzles do not change" are today's puzzles for everyone. If this test ever has to change on purpose, the daily puzzle changes for every player.

- [ ] **Step 2: Run to confirm they fail**

Run: `node --test dates.test.js daily.test.js`
Expected: FAIL (`dates.js` and `daily.js` do not exist).

- [ ] **Step 3: Create `dates.js`**

```js
// Calendar helpers for the daily puzzle. A "day" is the calendar date in
// America/New_York (so it changes at midnight EST in winter, EDT in summer),
// written YYYY-MM-DD.

const EASTERN = "America/New_York";
const easternParts = new Intl.DateTimeFormat("en-US", {timeZone: EASTERN, year: "numeric", month: "2-digit", day: "2-digit"});

export function easternDateString(now = new Date()) {
    const parts = Object.fromEntries(easternParts.formatToParts(now).map(({type, value}) => [type, value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
}

// Milliseconds until the Eastern date next changes. The date never goes
// backwards and a day is at most 25 hours, so search for the first instant
// whose date differs; this stays right across the daylight-saving changes.
export function msUntilNextEasternMidnight(now = new Date()) {
    const today = easternDateString(now);
    let low = 0;                       // still today
    let high = 26 * 3600 * 1000;       // already tomorrow
    while (high - low > 1) {
        const middle = Math.floor((low + high) / 2);
        if (easternDateString(new Date(now.getTime() + middle)) === today) low = middle;
        else high = middle;
    }
    return high;
}

// Calendar arithmetic on YYYY-MM-DD strings (no time zones involved).
export function addDays(dateString, days) {
    const [year, month, day] = dateString.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + days));
    const pad = n => String(n).padStart(2, "0");
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-10-07" -> "Oct 7"
export function formatDay(dateString) {
    const [, month, day] = dateString.split("-").map(Number);
    return `${MONTHS[month - 1]} ${day}`;
}

// 3h 12m, 59m, or "less than a minute"
export function formatCountdown(ms) {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return minutes > 0 ? `${minutes}m` : "less than a minute";
}
```

- [ ] **Step 4: Create `daily.js`**

```js
import {generateDefinition} from "./generator.js";

// The daily puzzle is the normal generator driven by a seed made from the date
// and the size, so every player gets the same puzzle for a given day and size.
// Only integer math is used, so the result is identical on every browser.

// 32-bit FNV-1a hash of "<date>:<size>"
export function dailySeed(dateString, size) {
    let hash = 0x811c9dc5;
    for (const char of `${dateString}:${size}`) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

// mulberry32: a small seeded random number generator returning [0, 1)
export function seededRng(seed) {
    let a = seed | 0;
    return () => {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function dailyDefinition(dateString, size) {
    const definition = generateDefinition({size, rng: seededRng(dailySeed(dateString, size))});
    return {...definition, name: `Daily ${dateString}`};
}
```

- [ ] **Step 5: Run the tests, then the suite**

Run: `node --test dates.test.js daily.test.js && npm test`
Expected: all pass, including the pinned puzzles.

- [ ] **Step 6: Commit**

```bash
git add dates.js dates.test.js daily.js daily.test.js
git commit -m "Add Eastern dates and the seeded daily puzzle

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Streaks and safe storage

**Files:**
- Create: `progress.js`, `progress.test.js`

**Interfaces:**
- Consumes: `addDays` (Task 3).
- Produces: `recordWin(progress, size, today) -> progress` (pure: a win on the same day changes nothing; the day after the last win adds 1 to the streak; otherwise the streak restarts at 1), `streakFor(progress, size, today) -> number` (the streak while it is alive, else 0), `isDone(progress, size, today) -> boolean`, `loadProgress(storage) -> progress`, `saveProgress(storage, progress) -> boolean` (both never throw; a null storage is fine), `browserStorage() -> localStorage | null`.

- [ ] **Step 1: Write the failing tests.** Create `progress.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {recordWin, streakFor, isDone, loadProgress, saveProgress, browserStorage} from "./progress.js";

test("a first win makes a streak of 1 and marks the day done", () => {
    const progress = recordWin({}, 5, "2026-10-07");
    assert.deepEqual(progress, {5: {last: "2026-10-07", streak: 1}});
    assert.equal(isDone(progress, 5, "2026-10-07"), true);
    assert.equal(isDone(progress, 5, "2026-10-08"), false);
    assert.equal(isDone(progress, 3, "2026-10-07"), false);
});

test("winning on consecutive days grows the streak", () => {
    let progress = recordWin({}, 5, "2026-10-07");
    progress = recordWin(progress, 5, "2026-10-08");
    progress = recordWin(progress, 5, "2026-10-09");
    assert.equal(progress[5].streak, 3);
    assert.equal(progress[5].last, "2026-10-09");
});

test("winning the same day again changes nothing", () => {
    const once = recordWin({}, 5, "2026-10-07");
    assert.deepEqual(recordWin(once, 5, "2026-10-07"), once);
});

test("missing a day restarts the streak at 1", () => {
    let progress = recordWin({}, 5, "2026-10-07");
    progress = recordWin(progress, 5, "2026-10-08");
    progress = recordWin(progress, 5, "2026-10-10");
    assert.equal(progress[5].streak, 1);
});

test("streaks run across month and year ends", () => {
    let progress = recordWin({}, 3, "2026-12-31");
    progress = recordWin(progress, 3, "2027-01-01");
    assert.equal(progress[3].streak, 2);
});

test("each size has its own streak", () => {
    let progress = recordWin({}, 3, "2026-10-07");
    progress = recordWin(progress, 5, "2026-10-07");
    progress = recordWin(progress, 5, "2026-10-08");
    assert.equal(progress[3].streak, 1);
    assert.equal(progress[5].streak, 2);
    assert.equal(progress[7], undefined);
});

test("recordWin does not change the progress it was given", () => {
    const before = {5: {last: "2026-10-07", streak: 1}};
    recordWin(before, 5, "2026-10-08");
    assert.deepEqual(before, {5: {last: "2026-10-07", streak: 1}});
});

test("a streak counts while it is alive (won today or yesterday) and reads 0 once broken", () => {
    const progress = {5: {last: "2026-10-07", streak: 4}};
    assert.equal(streakFor(progress, 5, "2026-10-07"), 4);   // won today
    assert.equal(streakFor(progress, 5, "2026-10-08"), 4);   // won yesterday, today still to play
    assert.equal(streakFor(progress, 5, "2026-10-09"), 0);   // a day was missed
    assert.equal(streakFor(progress, 7, "2026-10-07"), 0);   // never played
});

// a stand-in for localStorage
const fakeStorage = (initial = {}) => {
    const data = {...initial};
    return {data, getItem: key => (key in data ? data[key] : null), setItem: (key, value) => { data[key] = String(value); }};
};

test("progress is saved and loaded as JSON", () => {
    const storage = fakeStorage();
    const progress = recordWin({}, 7, "2026-10-07");
    assert.equal(saveProgress(storage, progress), true);
    assert.deepEqual(loadProgress(storage), progress);
});

test("empty, corrupt or odd saved data reads as no progress", () => {
    assert.deepEqual(loadProgress(fakeStorage()), {});
    assert.deepEqual(loadProgress(fakeStorage({"qup-progress-v1": "not json"})), {});
    assert.deepEqual(loadProgress(fakeStorage({"qup-progress-v1": "[1,2]"})), {});
    // bad entries are dropped, good ones kept
    const mixed = {"3": {last: "2026-10-07", streak: 2}, "4": {last: "2026-10-07", streak: 2}, "5": {last: "yesterday", streak: 2}, "7": {last: "2026-10-07", streak: -1}};
    assert.deepEqual(loadProgress(fakeStorage({"qup-progress-v1": JSON.stringify(mixed)})), {3: {last: "2026-10-07", streak: 2}});
});

test("blocked or missing storage never throws", () => {
    const blocked = {getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }};
    assert.deepEqual(loadProgress(blocked), {});
    assert.equal(saveProgress(blocked, {}), false);
    assert.deepEqual(loadProgress(null), {});
    assert.equal(saveProgress(null, {}), false);
});

test("browserStorage gives null where there is no localStorage", () => {
    assert.equal(browserStorage(), null);   // node has no window
});
```

- [ ] **Step 2: Run to confirm they fail**

Run: `node --test progress.test.js`
Expected: FAIL (`progress.js` does not exist).

- [ ] **Step 3: Create `progress.js`**

```js
import {addDays} from "./dates.js";

// Daily progress, kept per size: the last day won and the streak up to it.
//   {"5": {last: "2026-10-07", streak: 3}, ...}
// Every function is pure except load/save, which take the storage to use.

const KEY = "qup-progress-v1";
const SIZES = [3, 5, 7];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function recordWin(progress, size, today) {
    const entry = progress[size];
    if (entry?.last === today) return progress;
    const streak = entry?.last === addDays(today, -1) ? entry.streak + 1 : 1;
    return {...progress, [size]: {last: today, streak}};
}

// The streak while it is alive (won today or yesterday), else 0.
export function streakFor(progress, size, today) {
    const entry = progress[size];
    if (!entry) return 0;
    return entry.last === today || entry.last === addDays(today, -1) ? entry.streak : 0;
}

export const isDone = (progress, size, today) => progress[size]?.last === today;

export function loadProgress(storage) {
    try {
        const parsed = JSON.parse(storage.getItem(KEY) ?? "{}");
        const progress = {};
        for (const size of SIZES) {
            const entry = parsed?.[size];
            if (entry && DATE.test(entry.last) && Number.isInteger(entry.streak) && entry.streak > 0) {
                progress[size] = {last: entry.last, streak: entry.streak};
            }
        }
        return progress;
    } catch {
        return {};
    }
}

export function saveProgress(storage, progress) {
    try {
        storage.setItem(KEY, JSON.stringify(progress));
        return true;
    } catch {
        return false;
    }
}

// The page's localStorage, or null if the browser blocks it.
export function browserStorage() {
    try {
        return window.localStorage ?? null;
    } catch {
        return null;
    }
}
```

- [ ] **Step 4: Run the tests, then the suite**

Run: `node --test progress.test.js && npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add progress.js progress.test.js
git commit -m "Add per-size daily streaks with safe browser storage

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: What the pages say

**Files:**
- Create: `play-model.js`, `play-model.test.js`, `home-model.js`, `home-model.test.js`

**Interfaces:**
- Consumes: `formatDay` (Task 3), `isDone` and `streakFor` (Task 4).
- Produces (`play-model.js`): `PLAY_SIZES`, `PLAY_MODES`, `CANVAS_SIZES = {3: 320, 5: 400, 7: 490}`, `parsePlayParams("?size=5&mode=daily") -> {size, mode} | null`, `playHref(size, mode) -> "play.html?size=5&mode=daily"`, `playTitle({size, mode, today}) -> "Daily · 5×5 · Oct 7" | "Unlimited · 5×5"`, `winMessage({daily, firstWin, streak}) -> string`.
- Produces (`home-model.js`): `MAX_TALLY = 25`, `tallyGroups(streak) -> [5, 5, 1]`-style group sizes, `cardModel({size, progress, today}) -> {size, title, label, done, streak, tally, streakText, playLabel, dailyHref, unlimitedHref}`.

- [ ] **Step 1: Write the failing tests.** Create `play-model.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {parsePlayParams, playTitle, playHref, winMessage, CANVAS_SIZES, PLAY_SIZES} from "./play-model.js";

test("the play page reads its size and mode from the URL", () => {
    assert.deepEqual(parsePlayParams("?size=5&mode=daily"), {size: 5, mode: "daily"});
    assert.deepEqual(parsePlayParams("?mode=unlimited&size=7"), {size: 7, mode: "unlimited"});
    assert.deepEqual(parsePlayParams("?size=3&mode=daily&extra=1"), {size: 3, mode: "daily"});
});

test("a missing or unknown size or mode is rejected", () => {
    for (const search of ["", "?size=5", "?mode=daily", "?size=4&mode=daily", "?size=9&mode=daily", "?size=abc&mode=daily", "?size=5&mode=hard", "?size=&mode="]) {
        assert.equal(parsePlayParams(search), null, search);
    }
});

test("every size has a canvas size, and the 5x5 board is the usual 400px", () => {
    assert.deepEqual(PLAY_SIZES, [3, 5, 7]);
    assert.deepEqual(CANVAS_SIZES, {3: 320, 5: 400, 7: 490});
});

test("page titles", () => {
    assert.equal(playTitle({size: 5, mode: "daily", today: "2026-10-07"}), "Daily · 5×5 · Oct 7");
    assert.equal(playTitle({size: 7, mode: "unlimited", today: "2026-10-07"}), "Unlimited · 7×7");
});

test("links to the play page", () => {
    assert.equal(playHref(3, "daily"), "play.html?size=3&mode=daily");
    assert.equal(playHref(7, "unlimited"), "play.html?size=7&mode=unlimited");
});

test("win messages: unlimited, a first daily win with its streak, and a replay", () => {
    assert.equal(winMessage({daily: false}), "Solved!");
    assert.equal(winMessage({daily: true, firstWin: true, streak: 1}), "Solved! Streak: 1 day");
    assert.equal(winMessage({daily: true, firstWin: true, streak: 4}), "Solved! Streak: 4 days");
    assert.equal(winMessage({daily: true, firstWin: false, streak: 4}), "Solved again!");
});
```

Create `home-model.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {cardModel, tallyGroups, MAX_TALLY} from "./home-model.js";

test("tally marks come in groups of five", () => {
    assert.deepEqual(tallyGroups(0), []);
    assert.deepEqual(tallyGroups(1), [1]);
    assert.deepEqual(tallyGroups(4), [4]);
    assert.deepEqual(tallyGroups(5), [5]);
    assert.deepEqual(tallyGroups(6), [5, 1]);
    assert.deepEqual(tallyGroups(12), [5, 5, 2]);
});

test("tally marks stop at a cap (the card then shows the number)", () => {
    assert.equal(MAX_TALLY, 25);
    assert.deepEqual(tallyGroups(25), [5, 5, 5, 5, 5]);
    assert.deepEqual(tallyGroups(99), [5, 5, 5, 5, 5]);
});

test("a card for a mode that has not been played", () => {
    const card = cardModel({size: 5, progress: {}, today: "2026-10-07"});
    assert.deepEqual(card, {
        size: 5,
        title: "5 × 5",
        label: "the classic",
        done: false,
        streak: 0,
        tally: [],
        streakText: "no streak yet",
        playLabel: "Play",
        dailyHref: "play.html?size=5&mode=daily",
        unlimitedHref: "play.html?size=5&mode=unlimited",
    });
});

test("a card for a mode finished today shows Review, the streak and tally", () => {
    const progress = {3: {last: "2026-10-07", streak: 6}};
    const card = cardModel({size: 3, progress, today: "2026-10-07"});
    assert.equal(card.done, true);
    assert.equal(card.playLabel, "Review");
    assert.equal(card.streak, 6);
    assert.deepEqual(card.tally, [5, 1]);
    assert.equal(card.streakText, "6 days");
    assert.equal(card.label, "the mini");
});

test("yesterday's win keeps the streak alive but the day is not done", () => {
    const progress = {7: {last: "2026-10-06", streak: 2}};
    const card = cardModel({size: 7, progress, today: "2026-10-07"});
    assert.equal(card.done, false);
    assert.equal(card.playLabel, "Play");
    assert.equal(card.streak, 2);
    assert.equal(card.label, "the big one");
});

test("a broken streak reads as none", () => {
    const progress = {5: {last: "2026-10-01", streak: 9}};
    const card = cardModel({size: 5, progress, today: "2026-10-07"});
    assert.equal(card.streak, 0);
    assert.equal(card.streakText, "no streak yet");
});

test("one day reads as '1 day'", () => {
    const card = cardModel({size: 5, progress: {5: {last: "2026-10-07", streak: 1}}, today: "2026-10-07"});
    assert.equal(card.streakText, "1 day");
});
```

- [ ] **Step 2: Run to confirm they fail**

Run: `node --test play-model.test.js home-model.test.js`
Expected: FAIL (the modules do not exist).

- [ ] **Step 3: Create `play-model.js`**

```js
import {formatDay} from "./dates.js";

// Pure helpers for the play page: what the URL asks for, and the words on it.

export const PLAY_SIZES = [3, 5, 7];
export const PLAY_MODES = ["daily", "unlimited"];

// Canvas pixels per board size: cells stay about 64-107px so numbers and
// arrows stay readable.
export const CANVAS_SIZES = {3: 320, 5: 400, 7: 490};

// "?size=5&mode=daily" -> {size: 5, mode: "daily"}, or null if either is missing or unknown
export function parsePlayParams(search) {
    const params = new URLSearchParams(search);
    const size = Number(params.get("size"));
    const mode = params.get("mode");
    if (!PLAY_SIZES.includes(size) || !PLAY_MODES.includes(mode)) return null;
    return {size, mode};
}

export const playHref = (size, mode) => `play.html?size=${size}&mode=${mode}`;

export function playTitle({size, mode, today}) {
    const board = `${size}×${size}`;
    return mode === "daily" ? `Daily · ${board} · ${formatDay(today)}` : `Unlimited · ${board}`;
}

export function winMessage({daily, firstWin, streak}) {
    if (!daily) return "Solved!";
    if (!firstWin) return "Solved again!";
    return `Solved! Streak: ${streak} ${streak === 1 ? "day" : "days"}`;
}
```

- [ ] **Step 4: Create `home-model.js`**

```js
import {isDone, streakFor} from "./progress.js";
import {playHref} from "./play-model.js";

// Pure description of one mode's card on the home page.

const LABELS = {3: "the mini", 5: "the classic", 7: "the big one"};

// Past this many days the card shows the number instead of more tally marks.
export const MAX_TALLY = 25;

// A streak as tally marks: groups of 5 (the fifth is drawn as a slash), then
// the leftover marks. 6 -> [5, 1].
export function tallyGroups(streak) {
    const shown = Math.min(streak, MAX_TALLY);
    const groups = Array(Math.floor(shown / 5)).fill(5);
    if (shown % 5 > 0) groups.push(shown % 5);
    return groups;
}

export function cardModel({size, progress, today}) {
    const done = isDone(progress, size, today);
    const streak = streakFor(progress, size, today);
    let streakText = "no streak yet";
    if (streak === 1) streakText = "1 day";
    else if (streak > 1) streakText = `${streak} days`;
    return {
        size,
        title: `${size} × ${size}`,
        label: LABELS[size],
        done,
        streak,
        tally: tallyGroups(streak),
        streakText,
        playLabel: done ? "Review" : "Play",
        dailyHref: playHref(size, "daily"),
        unlimitedHref: playHref(size, "unlimited"),
    };
}
```

- [ ] **Step 5: Run the tests, then the suite**

Run: `node --test play-model.test.js home-model.test.js && npm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add play-model.js play-model.test.js home-model.js home-model.test.js
git commit -m "Add the play page and home card models

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The paper-and-ink look and the home page

**Files:**
- Create: `paper.css`, `ink.js`, `ink.test.js`, `index.html` (new), `home.js`
- Move: the current `index.html` (the game) to `play.html` with `git mv`

**Interfaces:**
- Consumes: `cardModel`, `MAX_TALLY` (Task 5), `dailyDefinition` (Task 3), `loadProgress`, `browserStorage` (Task 4), `easternDateString`, `msUntilNextEasternMidnight`, `formatCountdown` (Task 3), `SIZES` (Task 2), `buildFromDefinition`, `drawPieceShape`.
- Produces: `filterMarkup() -> svg string` and `startInk()` in `ink.js` (adds the three wobble filters, and a `.line` layer to every `.up` element now and later); the `.up` / `.line` / `.wob` / `.screen` / `.tag` / `.btn` / `.pill` classes in `paper.css`, which Tasks 7 and 8 reuse.
- Design notes (already built into the code): a raised piece is its content over a `.line` layer (hard shadow plus a face with an inked edge) that sits behind the content because each `.up` is its own stacking context (`isolation: isolate`, `.line { z-index: -1 }`); only `.line` layers wobble, three filter frames cycled by CSS; the home cards are always at full strength (no hover or dimming states); the preview on each card is today's real puzzle drawn with the game's own piece shapes.

- [ ] **Step 1: Move the game to `play.html`**

```bash
git mv index.html play.html
```
(The game still works there for now; it is changed in Task 7.)

- [ ] **Step 2: Write the failing test.** Create `ink.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {filterMarkup} from "./ink.js";

test("three wobble filters with different seeds are defined", () => {
    const markup = filterMarkup();
    assert.equal((markup.match(/<filter /g) ?? []).length, 3);
    for (const id of ["ink-a", "ink-b", "ink-c"]) assert.ok(markup.includes(`id="${id}"`), id);
    assert.equal(new Set(markup.match(/seed="\d+"/g)).size, 3);
    // roomy enough that the shadow is not clipped
    assert.ok(markup.includes('x="-20%"') && markup.includes('width="140%"'));
});
```

- [ ] **Step 3: Run to confirm it fails**

Run: `node --test ink.test.js`
Expected: FAIL (`ink.js` does not exist).

- [ ] **Step 4: Create `ink.js`**

```js
// The hand-drawn "ink" look. Every raised piece (class `up`) gets a `.line`
// layer: a wobbling outline plus a hard shadow, drawn behind the piece's
// content. Three slightly different turbulence filters are cycled by CSS
// (see paper.css), so the lines seem to boil a little, like pen on paper.

const FRAMES = [
    {id: "ink-a", seed: 3},
    {id: "ink-b", seed: 8},
    {id: "ink-c", seed: 21},
];

// The SVG that defines the three wobble filters. The region is generous so
// the hard shadow, which sticks out past the box, is not clipped.
export function filterMarkup(frames = FRAMES) {
    const filters = frames.map(({id, seed}) =>
        `<filter id="${id}" x="-20%" y="-20%" width="140%" height="140%">` +
        `<feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="${seed}"/>` +
        `<feDisplacementMap in="SourceGraphic" scale="5.5"/></filter>`).join("");
    return `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">${filters}</svg>`;
}

function addLine(element) {
    if (element.querySelector(":scope > .line")) return;
    const line = document.createElement("span");
    line.className = "line wob";
    line.setAttribute("aria-hidden", "true");
    element.prepend(line);
}

function addLines(root) {
    if (root.matches?.(".up")) addLine(root);
    root.querySelectorAll?.(".up").forEach(addLine);
}

// Call once per page. Adds the filters, then a `.line` to every `.up` now and
// to any that are added later (the hand tiles are created by the game).
export function startInk() {
    document.body.insertAdjacentHTML("afterbegin", filterMarkup());
    addLines(document.body);
    new MutationObserver(changes => {
        for (const change of changes) change.addedNodes.forEach(node => node.nodeType === 1 && addLines(node));
    }).observe(document.body, {childList: true, subtree: true});
}
```

- [ ] **Step 5: Create `paper.css`**

```css
/* Paper and ink: the look of the home page and the page around the game board.
   The board itself (the canvas) is never styled or wobbled. */

:root {
    --ink: #25221d;
    --paper: #f4efe4;
    --white: #ffffff;
    --coral: #d65a43;
    --green: #2b7a46;
    --font-head: "Caveat Brush", "Segoe Print", "Bradley Hand", cursive;
    --font-body: "Patrick Hand", "Segoe Print", "Bradley Hand", cursive;
    /* the three wobble frames (defined by ink.js) */
    --wobble-1: url(#ink-a);
    --wobble-2: url(#ink-b);
    --wobble-3: url(#ink-c);
    --wobble-step: 0.42s;
}

body.paper {
    margin: 0;
    min-height: 100vh;
    color: var(--ink);
    font-family: var(--font-body);
    font-size: 18px;
    background-color: var(--paper);
    background-image: radial-gradient(rgba(60, 45, 20, 0.07) 1px, transparent 1.2px), radial-gradient(rgba(60, 45, 20, 0.04) 1px, transparent 1.2px);
    background-size: 7px 7px, 11px 11px;
    background-position: 0 0, 3px 4px;
}

body.paper * {
    box-sizing: border-box;
}

body.paper a {
    color: inherit;
    text-decoration: none;
}

/* ---------- the wobble ---------- */

@keyframes boil {
    0% { filter: var(--wobble-1); }
    33.4% { filter: var(--wobble-2); }
    66.8% { filter: var(--wobble-3); }
    100% { filter: var(--wobble-1); }
}

.wob {
    filter: var(--wobble-1);
    animation: boil calc(var(--wobble-step) * 3) steps(1) infinite;
}

@media (prefers-reduced-motion: reduce) {
    .wob {
        animation: none;
    }
}

/* ---------- raised pieces ----------
   A raised piece (.up) is its content over a `.line` layer: a hard shadow and
   a face with an inked edge. Only the `.line` layer wobbles. */

.up {
    position: relative;
    isolation: isolate;   /* the .line layer sits behind this piece's own content, never behind the page */
    --sx: 4px;
    --sy: 5px;
    --face: var(--white);
    --edge: var(--ink);
    --shade: var(--ink);
    border-radius: 14px 20px 13px 22px / 20px 13px 22px 14px;
}

.up > .line {
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    pointer-events: none;
}

.up > .line::before,
.up > .line::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
}

.up > .line::before {
    background: var(--shade);
    transform: translate(var(--sx), var(--sy));
}

.up > .line::after {
    background: var(--face);
    border: 2.6px solid var(--edge);
}

.up.fill {
    --face: var(--ink);
    --shade: var(--coral);
    color: var(--white);
}

.up.flat {
    --sx: 0px;
    --sy: 0px;
}

.up.flat > .line::before {
    display: none;
}

/* a stamp: just an inked coral outline, no shadow */
.up.stamp {
    --face: transparent;
    --edge: var(--coral);
    color: var(--coral);
}

.up.stamp > .line::before {
    display: none;
}

.up.stamp > .line::after {
    border-width: 3px;
}

/* ---------- buttons and pills ---------- */

.btn,
.pill {
    appearance: none;
    border: 0;
    background: none;
    font: inherit;
    color: inherit;
    text-align: center;
    cursor: pointer;
    display: inline-block;
}

.btn {
    padding: 9px 12px 8px;
    font-size: 20px;
    --sx: 4px;
    --sy: 5px;
}

.pill {
    padding: 5px 18px 6px;
    font-size: 20px;
    --sx: 3px;
    --sy: 4px;
}

.btn:disabled {
    cursor: default;
    opacity: 0.5;
}

.btn:focus-visible,
.pill:focus-visible,
.pool-node:focus-visible,
body.paper a:focus-visible {
    outline: 3px solid var(--coral);
    outline-offset: 4px;
}

/* ---------- the page frame ---------- */

.wrap {
    max-width: 1060px;
    margin: 0 auto;
    padding: 30px 28px 48px;
}

.top {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 38px;
}

.brand {
    margin: 0;
    font: 400 64px/1 var(--font-head);
    letter-spacing: 1px;
    position: relative;
    display: inline-block;
}

.brand .ul {
    position: absolute;
    left: -4px;
    right: -4px;
    bottom: -10px;
    width: calc(100% + 8px);
    height: 12px;
}

.meta {
    text-align: right;
    line-height: 1.35;
    font-size: 20px;
}

.meta small {
    display: block;
    font-size: 16px;
    opacity: 0.75;
}

/* ---------- home: the three mode cards ---------- */

.cards {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 34px 28px;
}

.card {
    padding: 26px 16px 22px;
    --sx: 6px;
    --sy: 7px;
}

/* the board: a little screen set into the card */
.screen {
    position: relative;
    background: var(--white);
    border: 3px solid var(--ink);
    border-radius: 12px;
    padding: 5px 5px 20px;   /* a thicker chin: the buttons overlap it, not the board */
    box-shadow: inset 0 5px 12px rgba(0, 0, 0, 0.22), inset 0 0 0 4px #e6e0d2;
}

.screen canvas {
    display: block;
    width: 100%;
    height: auto;
}

/* tags that float above the screen */
.tag {
    position: absolute;
    z-index: 3;
    --sx: 3px;
    --sy: 4px;
}

.tag.size {
    left: -6px;
    top: -26px;
    padding: 2px 14px 3px;
    font: 400 38px/1.05 var(--font-head);
    transform: rotate(-3deg);
}

.tag.streak {
    right: -4px;
    top: -18px;
    padding: 5px 12px;
    font-size: 17px;
    display: flex;
    align-items: center;
    gap: 5px;
    transform: rotate(2.5deg);
}

.tally {
    display: inline-flex;
    align-items: center;
    gap: 8px;
}

.tally .group {
    position: relative;
    display: inline-flex;
    gap: 4px;
    align-items: center;
}

.tally i {
    display: inline-block;
    width: 3px;
    height: 17px;
    background: var(--ink);
    border-radius: 3px;
}

.tally i:nth-child(odd) { transform: rotate(-2deg); }
.tally i:nth-child(even) { transform: rotate(2deg); }

/* the fifth mark: a slash through the four */
.tally .group.five::after {
    content: "";
    position: absolute;
    left: -4px;
    right: -4px;
    top: 50%;
    height: 3px;
    background: var(--ink);
    border-radius: 3px;
    transform: rotate(-24deg);
}

.card .stamp {
    position: absolute;
    z-index: 4;
    right: 2px;
    top: 74px;
    padding: 3px 12px;
    font: 400 28px/1 var(--font-head);
    letter-spacing: 2px;
    transform: rotate(-11deg);
}

.card .btns {
    display: flex;
    gap: 12px;
    margin-top: -17px;
    padding: 0 6px;
    position: relative;
    z-index: 3;
}

.card .btns .btn {
    flex: 1;
}

.card .sub {
    margin: 14px 0 0;
    text-align: center;
    opacity: 0.8;
}

.foot {
    margin-top: 44px;
    text-align: center;
    font-size: 16px;
    opacity: 0.7;
}

/* ---------- narrow screens ---------- */

@media (max-width: 860px) {
    .cards {
        grid-template-columns: 1fr;
        max-width: 400px;
        margin: 0 auto;
        gap: 50px;
    }

    .brand {
        font-size: 52px;
    }
}

@media (max-width: 520px) {
    .top {
        flex-direction: column;
        align-items: flex-start;
    }

    .meta {
        text-align: left;
    }
}
```

- [ ] **Step 6: Create the home page, `index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Q-Up</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Caveat+Brush&family=Patrick+Hand&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="paper.css">
</head>
<body class="paper home">
<main class="wrap">
    <header class="top">
        <h1 class="brand">Q-Up<svg class="ul wob" viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true"><path d="M2 7 C 40 1, 70 12, 110 6 S 170 2, 198 8" fill="none" stroke="#d65a43" stroke-width="4" stroke-linecap="round"/></svg></h1>
        <div class="meta">
            <div id="today"></div>
            <small id="countdown"></small>
        </div>
    </header>
    <section id="cards" class="cards" aria-label="Choose a board size"></section>
    <p class="foot">One new puzzle per size, every day.</p>
</main>
<script type="module" src="home.js"></script>
</body>
</html>
```

- [ ] **Step 7: Create `home.js`**

```js
import {easternDateString, msUntilNextEasternMidnight, formatCountdown} from "./dates.js";
import {dailyDefinition} from "./daily.js";
import {loadProgress, browserStorage} from "./progress.js";
import {cardModel, MAX_TALLY} from "./home-model.js";
import {buildFromDefinition} from "./puzzles.js";
import {drawPieceShape} from "./pieces.js";
import {SIZES} from "./generator.js";
import {startInk} from "./ink.js";

const today = easternDateString();
const progress = loadProgress(browserStorage());

const dateText = new Intl.DateTimeFormat("en-US", {timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric"});
document.getElementById("today").textContent = dateText.format(new Date());

function element(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
}

// The streak tag: tally marks (a slash through every fifth), or the number once there are too many.
function streakTag(card) {
    const tag = element("div", "up tag streak");
    tag.setAttribute("role", "img");
    tag.setAttribute("aria-label", `streak: ${card.streakText}`);
    if (card.streak === 0) {
        tag.textContent = card.streakText;
    } else if (card.streak > MAX_TALLY) {
        tag.textContent = card.streakText;
    } else {
        const tally = element("span", "tally");
        for (const count of card.tally) {
            const group = element("span", count === 5 ? "group five" : "group");
            for (let i = 0; i < count; i++) group.appendChild(document.createElement("i"));
            tally.appendChild(group);
        }
        tag.appendChild(tally);
    }
    return tag;
}

// A preview of today's puzzle: the pieces and targets that start on the board
// (the hand is not shown), drawn with the game's own piece shapes.
function drawPreview(canvas, size) {
    const {grid} = buildFromDefinition(dailyDefinition(today, size));
    const css = 300;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = canvas.height = css * scale;
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    const cell = css / size;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, css, css);
    ctx.strokeStyle = "#d3d3d3";
    ctx.lineWidth = 1;
    for (let i = 0; i <= size; i++) {
        ctx.beginPath();
        ctx.moveTo(i * cell, 0);
        ctx.lineTo(i * cell, css);
        ctx.moveTo(0, i * cell);
        ctx.lineTo(css, i * cell);
        ctx.stroke();
    }
    for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
            const node = grid[x][y];
            if (!node.isEmpty) drawPieceShape(ctx, node, (x + 0.5) * cell, (y + 0.5) * cell, cell * 0.92);
        }
    }
}

function buildCard(size) {
    const card = cardModel({size, progress, today});
    const article = element("article", "up card");
    article.dataset.size = String(size);

    article.appendChild(element("div", "up tag size", card.title));
    article.appendChild(streakTag(card));

    const screen = element("div", "screen");
    const canvas = element("canvas");
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", `Preview of today's ${card.title} puzzle`);
    screen.appendChild(canvas);
    article.appendChild(screen);
    drawPreview(canvas, size);

    if (card.done) article.appendChild(element("div", "up stamp", "DONE!"));

    const buttons = element("div", "btns");
    const play = element("a", "up btn fill", card.playLabel);
    play.href = card.dailyHref;
    const unlimited = element("a", "up btn", "Unlimited");
    unlimited.href = card.unlimitedHref;
    buttons.append(play, unlimited);
    article.appendChild(buttons);

    article.appendChild(element("p", "sub", card.label));
    return article;
}

const cards = document.getElementById("cards");
for (const size of SIZES) cards.appendChild(buildCard(size));

const countdown = document.getElementById("countdown");
function tick() {
    // a new Eastern day has begun: reload for the new puzzles
    if (easternDateString() !== today) {
        location.reload();
        return;
    }
    countdown.textContent = `new puzzles in ${formatCountdown(msUntilNextEasternMidnight())}`;
}
tick();
setInterval(tick, 30000);

startInk();
```

- [ ] **Step 8: Run the tests**

Run: `node --test ink.test.js && npm test && node --check home.js`
Expected: all pass.

- [ ] **Step 9: Look at it in a browser**

```bash
npm start &            # serves http://localhost:3000
sleep 2
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --window-size=1200,760 --virtual-time-budget=6000 --screenshot=/tmp/qup-home.png http://localhost:3000/index.html
```
Read `/tmp/qup-home.png`. Expected: the cream dotted paper, "Q-Up" in a brush handwriting font with a coral underline, today's date and "new puzzles in Xh Ym" at the top right, three white cards with wobbly black outlines and hard shadows, each with a size tag ("3 × 3", "5 × 5", "7 × 7") floating over its top-left, a "no streak yet" tag at the top right, a white recessed screen showing the day's puzzle (locked pieces and teal targets with padlocks, light gray grid), and two raised buttons ("Play" in black with a coral shadow, "Unlimited" in white) overlapping the bottom of the screen without covering the board, and a caption ("the mini", "the classic", "the big one"). All text must be readable (not hidden behind the outlines).

Then check the narrow layout. A headless window cannot go below about 500px, so use a 390px frame:

```bash
echo '<!DOCTYPE html><body style="margin:0;background:#888"><iframe src="http://localhost:3000/index.html" width="390" height="1700" style="border:0"></iframe></body>' > /tmp/qup-phone.html
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --window-size=600,1700 --virtual-time-budget=7000 --screenshot=/tmp/qup-phone.png file:///tmp/qup-phone.html
```
Read `/tmp/qup-phone.png`. Expected: one card per row, nothing cut off at the right edge.

Stop the server when done (`kill %1` or `pkill -f "node server.js"`).

- [ ] **Step 10: Commit**

```bash
git add paper.css ink.js ink.test.js index.html home.js play.html
git commit -m "Add the paper-and-ink look and the home page

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The game page: size, mode, daily and unlimited

**Files:**
- Modify: `game.js`, `play.html`, `puzzles.js` (the hand-built levels are removed)
- Replace: `puzzles.test.js`
- Create: `tools/e2e-daily.mjs`

**Interfaces:**
- Consumes: `parsePlayParams`, `playTitle`, `winMessage`, `CANVAS_SIZES` (Task 5), `dailyDefinition` (Task 3), `easternDateString` (Task 3), `loadProgress`, `saveProgress`, `recordWin`, `isDone`, `browserStorage` (Task 4), `generateDefinition` (Task 2), `startInk` (Task 6).
- Produces: `play.html?size=3|5|7&mode=daily|unlimited`. A missing or unknown size or mode redirects to `index.html`. Daily: today's `dailyDefinition`, no Show Solution, New, Back or forward; the first win records progress and says "Solved! Streak: N day(s)", later wins say "Solved again!" and change nothing. Unlimited: random puzzles of that size with New, Back, forward and Show Solution.
- DOM contract in `play.html` (Task 8 styles it): `#page-title`, `#help-button` (now in the top bar), `.screen` around `#canvas`, `#summary-box.up` wrapping `#summary-panel`, `#run-button.up` containing `#run-label`, `#result-banner.up` containing `#result-text`. Text the game rewrites at run time lives in an inner element, so it never removes the outline layer that `ink.js` adds to each `.up` element.

- [ ] **Step 1: Apply these changes**

`game.js`:

```diff
--- a/game.js
+++ b/game.js
@@ -4,27 +4,47 @@
 import {playRun} from "./runner.js";
 import {renderSummary, clearSummary} from "./summary-panel.js";
 import {drawPieceShape, targetCells} from "./pieces.js";
-import {buildFromDefinition, puzzleDefinition, puzzleCount, puzzleName, DEFAULT_SIZE} from "./puzzles.js";
+import {buildFromDefinition} from "./puzzles.js";
 import {generateDefinition} from "./generator.js";
-import {solve} from "./solver.js";
 import {initTutorial} from "./tutorial.js";
 import {canDrag, applyDrop, validatePuzzle} from "./rules.js";
+import {parsePlayParams, playTitle, winMessage, CANVAS_SIZES} from "./play-model.js";
+import {easternDateString} from "./dates.js";
+import {dailyDefinition} from "./daily.js";
+import {loadProgress, saveProgress, recordWin, isDone, browserStorage} from "./progress.js";
+import {startInk} from "./ink.js";
 
+// Which board and which mode this page is for comes from the URL
+// (play.html?size=5&mode=daily). Without a valid one, go back to the home page.
+const params = parsePlayParams(location.search);
+if (!params) {
+    location.replace("index.html");
+    throw new Error("play.html needs ?size=3|5|7&mode=daily|unlimited");
+}
+const gridScale = params.size;
+const isDaily = params.mode === "daily";
+const today = easternDateString();
+
 const canvas = document.getElementById("canvas");
 const poolEl = document.getElementById("pool");
 const handLabel = document.getElementById("hand-label");
 const runButton = document.getElementById("run-button");
 const clearButton = document.getElementById("clear-button");
 const resultBanner = document.getElementById("result-banner");
+const resultText = document.getElementById("result-text");
+const runLabel = document.getElementById("run-label");
 
-const boardSize = 400;
-const gridScale = DEFAULT_SIZE;
+const boardSize = CANVAS_SIZES[gridScale];
+canvas.width = canvas.height = boardSize;
 
 const board = new Board(canvas, boardSize, gridScale);
 
-// The puzzle being played: one of the hand-built ones, or a randomly
-// generated one. Clear Board rebuilds fresh pieces from this definition.
-let activeDefinition = puzzleDefinition(0);
+// The puzzle being played: today's daily puzzle, or a random one in unlimited
+// mode. Clear Board rebuilds fresh pieces from this definition.
+let activeDefinition = isDaily ? dailyDefinition(today, gridScale) : generateDefinition({size: gridScale});
+
+document.getElementById("page-title").textContent = playTitle({size: gridScale, mode: params.mode, today});
+document.title = `Q-Up · ${playTitle({size: gridScale, mode: params.mode, today})}`;
 
 // Loads the current puzzle onto the board and returns its hand.
 function createPuzzle() {
@@ -71,7 +91,7 @@
     handLabel.hidden = pool.length === 0;
     pool.forEach((node, index) => {
         const el = document.createElement("div");
-        el.className = "pool-node";
+        el.className = "pool-node up";
         el.dataset.index = String(index);
 
         const pieceCanvas = document.createElement("canvas");
@@ -240,12 +260,30 @@
     });
 }
 
+let progress = loadProgress(browserStorage());
+
+// What a win says. The first win of a daily puzzle records the day and the
+// streak; winning it again (Keep going, or replaying a finished day) changes nothing.
+function winText() {
+    if (!isDaily) return winMessage({daily: false});
+    const firstWin = !isDone(progress, gridScale, today);
+    if (firstWin) {
+        progress = recordWin(progress, gridScale, today);
+        saveProgress(browserStorage(), progress);
+    }
+    return winMessage({daily: true, firstWin, streak: progress[gridScale].streak});
+}
+
 function showResult(won) {
     resultBanner.classList.remove("hidden", "win", "lose");
     resultBanner.classList.add(won ? "win" : "lose");
-    resultBanner.textContent = won ? "Solved!" : "Not solved.";
+    resultText.textContent = won ? winText() : "Not solved.";
 }
 
+const setRunLabel = text => {
+    runLabel.textContent = text;
+};
+
 // Run replays the simulation as an animation. If the puzzle isn't solved,
 // the failing pieces are highlighted and the board automatically returns to
 // the player's placement so they can adjust it.
@@ -279,7 +317,7 @@
         clearButton.disabled = false;
         roundOver = true;
         setInteractive(true);
-        runButton.textContent = "Keep going";
+        setRunLabel("Keep going");
         return;
     }
 
@@ -291,7 +329,7 @@
     clearButton.disabled = false;
     roundOver = true;
     setInteractive(true);          // pieces can be grabbed straight away
-    runButton.textContent = "Try Again";   // same spot as "Keep going" after a win
+    setRunLabel("Try Again");   // same spot as "Keep going" after a win
 });
 
 function restoreAfterRound() {
@@ -301,7 +339,7 @@
     board.effects = Board.emptyEffects();
     runComplete = false;
     resultBanner.classList.add("hidden");
-    runButton.textContent = "Run";
+    setRunLabel("Run");
     setInteractive(true);
     renderPool();
     clearSummary();
@@ -313,7 +351,7 @@
 // Clear Board: back to the starting puzzle with every movable piece in hand.
 clearButton.addEventListener("click", () => {
     roundOver = false;
-    runButton.textContent = "Run";
+    setRunLabel("Run");
     pool = createPuzzle();
     preRunGrid = null;
     board.effects = Board.emptyEffects();
@@ -362,96 +400,68 @@
     }
 });
 
-// ---- puzzle navigation (Back / Next) ----
+// ---- new puzzles (unlimited mode only) ----
+// Daily has just the one puzzle, so it has no New / Back / forward.
 const backButton = document.getElementById("back-button");
 const nextButton = document.getElementById("next-button");
 const newButton = document.getElementById("new-button");
-let currentIndex = 0;   // the hand-built puzzle most recently chosen
-let isRandom = false;   // is the current game a randomly generated one?
-const history = [];     // games left behind, most recent last: {definition, index|null}
+const forwardControls = document.getElementById("forward-controls");
+const history = [];     // games left behind, most recent last
 const future = [];      // games you went Back from, so Next can return to them
 
 function updateNav() {
-    // Hand-built levels: Back / Next step through the list.
-    // Random games: Back returns to the game you were just playing; Next goes
-    // forward again to one you came back from (only when there is one); and a
-    // separate New button always makes another random game.
-    backButton.disabled = isRandom ? history.length === 0 : currentIndex <= 0;
-    nextButton.hidden = isRandom && future.length === 0;
-    nextButton.disabled = isRandom ? false : currentIndex >= puzzleCount() - 1;
-    newButton.hidden = !isRandom;
+    if (isDaily) {
+        backButton.hidden = true;
+        forwardControls.hidden = true;
+        return;
+    }
+    // Back returns to the game you were just playing; Next goes forward again to
+    // one you came back from (only when there is one); New always makes another.
+    backButton.disabled = history.length === 0;
+    nextButton.hidden = future.length === 0;
 }
 
 
 // ---- Show Solution ----
 const solutionButton = document.getElementById("solution-button");
-const solutionCache = new Map();
+solutionButton.hidden = isDaily;   // seeing the answer should not count as solving the daily
 
-// Where each hand piece goes in a winning layout: [{x, y, poolIndex}].
-// Generated puzzles carry their solution; hand-built ones are solved on demand.
+// Where each hand piece goes in the stored winning layout: [{x, y, poolIndex}].
 function findPlacements(definition) {
-    if (solutionCache.has(definition)) return solutionCache.get(definition);
-    let placements = null;
-    if (definition.solution) {
-        const used = new Set();
-        placements = definition.solution.map(({x, y, kind}) => {
-            const poolIndex = definition.hand.findIndex((k, i) => k === kind && !used.has(i));
-            used.add(poolIndex);
-            return {x, y, poolIndex};
-        });
-    } else {
-        const fresh = buildFromDefinition(definition);
-        const layout = solve(fresh.grid, fresh.pool, gridScale, 1)[0];
-        if (layout) {
-            placements = layout.map(({x, y, id}) => ({x, y, poolIndex: fresh.pool.findIndex(n => n.id === id)}));
-        }
-    }
-    solutionCache.set(definition, placements);
-    return placements;
+    const used = new Set();
+    return definition.solution.map(({x, y, kind}) => {
+        const poolIndex = definition.hand.findIndex((k, i) => k === kind && !used.has(i));
+        used.add(poolIndex);
+        return {x, y, poolIndex};
+    });
 }
 
 solutionButton.addEventListener("click", () => {
     if (clearButton.disabled) return; // the animation is playing
-    solutionButton.disabled = true;
-    solutionButton.textContent = "Solving…";
-    // let the label paint before the (brief) search
-    setTimeout(() => {
-        const placements = findPlacements(activeDefinition);
-        if (placements) {
-            const fresh = buildFromDefinition(activeDefinition);
-            const placed = new Set();
-            board.grid = fresh.grid;
-            for (const {x, y, poolIndex} of placements) {
-                board.grid[x][y] = fresh.pool[poolIndex];
-                placed.add(poolIndex);
-            }
-            pool = fresh.pool.filter((_, i) => !placed.has(i));
-            roundOver = false;
-            runButton.textContent = "Run";
-            preRunGrid = null;
-            board.effects = Board.emptyEffects();
-            board.previewCells = [];
-            board.hoverCell = null;
-            runComplete = false;
-            resultBanner.classList.add("hidden");
-            setInteractive(true);
-            renderPool();
-            clearSummary();
-            board.drawBoard();
-        }
-        solutionButton.disabled = false;
-        solutionButton.textContent = "Show Solution";
-    }, 30);
+    const fresh = buildFromDefinition(activeDefinition);
+    const placed = new Set();
+    board.grid = fresh.grid;
+    for (const {x, y, poolIndex} of findPlacements(activeDefinition)) {
+        board.grid[x][y] = fresh.pool[poolIndex];
+        placed.add(poolIndex);
+    }
+    pool = fresh.pool.filter((_, i) => !placed.has(i));
+    roundOver = false;
+    setRunLabel("Run");
+    preRunGrid = null;
+    board.effects = Board.emptyEffects();
+    board.previewCells = [];
+    board.hoverCell = null;
+    runComplete = false;
+    resultBanner.classList.add("hidden");
+    setInteractive(true);
+    renderPool();
+    clearSummary();
+    board.drawBoard();
 });
 
 const DICE_ICON = '<svg class="button-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="13" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="5" cy="5" r="1.3" fill="currentColor"/><circle cx="11" cy="5" r="1.3" fill="currentColor"/><circle cx="8" cy="8" r="1.3" fill="currentColor"/><circle cx="5" cy="11" r="1.3" fill="currentColor"/><circle cx="11" cy="11" r="1.3" fill="currentColor"/></svg>';
-const pickerEl = document.getElementById("puzzle-picker");
-const pickerButtons = [];
 
-function selectPickerButton(selected) {
-    pickerButtons.forEach(b => b.classList.toggle("selected", b === selected));
-}
-
 // What was on the board (and in the hand) when each game was left, so Back can
 // put it back exactly as it was, including a solution you had set up.
 const savedLayouts = new Map();   // definition -> {grid, pool}
@@ -464,21 +474,16 @@
     });
 }
 
-// Switch to a game. index is the hand-built level number, or null for a
-// random game. The game being left is remembered for Back (unless going Back).
-const currentEntry = () => ({definition: activeDefinition, index: isRandom ? null : currentIndex});
-
-function activateGame(definition, index, {remember = true, restore = false, keepFuture = false} = {}) {
+// Switch to another game. The game being left is remembered for Back (unless
+// going Back).
+function activateGame(definition, {remember = true, restore = false, keepFuture = false} = {}) {
     saveLayout();
     if (remember) {
-        history.push({definition: activeDefinition, index: isRandom ? null : currentIndex});
+        history.push(activeDefinition);
         if (history.length > 50) history.shift();
     }
     if (!keepFuture) future.length = 0;   // a fresh choice ends any "forward" trail
     activeDefinition = definition;
-    isRandom = index === null;
-    if (!isRandom) currentIndex = index;
-    selectPickerButton(isRandom ? randomButton : pickerButtons[index]);
     updateNav();
     clearButton.click();
     // going Back: bring back the layout that was on that board
@@ -491,32 +496,6 @@
     }
 }
 
-for (let i = 0; i < puzzleCount(); i++) {
-    const button = document.createElement("button");
-    button.className = "puzzle-button" + (i === 0 ? " selected" : "");
-    button.textContent = String(i + 1);
-    button.title = puzzleName(i);
-    button.addEventListener("click", () => {
-        if (clearButton.disabled) return; // the animation is playing
-        activateGame(puzzleDefinition(i), i);
-    });
-    pickerEl.appendChild(button);
-    pickerButtons.push(button);
-}
-
-// Random: builds a brand-new puzzle that is guaranteed to be completable.
-const randomButton = document.createElement("button");
-randomButton.className = "puzzle-button random-button";
-randomButton.title = "New random puzzle";
-randomButton.setAttribute("aria-label", "New random puzzle");
-randomButton.innerHTML = DICE_ICON;
-randomButton.addEventListener("click", () => {
-    if (clearButton.disabled) return; // the animation is playing
-    activateGame(generateDefinition(), null);
-});
-pickerEl.appendChild(randomButton);
-pickerButtons.push(randomButton);
-
 // ? opens the "How to play" card (it never opens by itself).
 const tutorial = initTutorial(document.getElementById("help-button"));
 
@@ -544,35 +523,29 @@
 
 backButton.addEventListener("click", () => {
     if (clearButton.disabled) return;
-    if (isRandom) {
-        const previous = history.pop();
-        if (previous) {
-            future.push(currentEntry());
-            activateGame(previous.definition, previous.index, {remember: false, restore: true, keepFuture: true});
-        }
-    } else if (currentIndex > 0) {
-        activateGame(puzzleDefinition(currentIndex - 1), currentIndex - 1, {restore: true});
+    const previous = history.pop();
+    if (previous) {
+        future.push(activeDefinition);
+        activateGame(previous, {remember: false, restore: true, keepFuture: true});
     }
 });
 nextButton.addEventListener("click", () => {
     if (clearButton.disabled) return;
-    if (isRandom) {
-        // forward again to the game you came back from
-        const forward = future.pop();
-        if (forward) {
-            history.push(currentEntry());
-            activateGame(forward.definition, forward.index, {remember: false, restore: true, keepFuture: true});
-        }
-    } else if (currentIndex < puzzleCount() - 1) {
-        activateGame(puzzleDefinition(currentIndex + 1), currentIndex + 1);
+    // forward again to the game you came back from
+    const forward = future.pop();
+    if (forward) {
+        history.push(activeDefinition);
+        activateGame(forward, {remember: false, restore: true, keepFuture: true});
     }
 });
 newButton.innerHTML = `${DICE_ICON}New`;
+newButton.hidden = isDaily;
 newButton.addEventListener("click", () => {
     if (clearButton.disabled) return;
-    activateGame(generateDefinition(), null);
+    activateGame(generateDefinition({size: gridScale}));
 });
 updateNav();
 
 renderPool();
 board.drawBoard();
+startInk();
```

`play.html`:

```diff
--- a/play.html
+++ b/play.html
@@ -2,14 +2,24 @@
 <html lang="en">
 <head>
     <meta charset="UTF-8">
-    <title>Q-Up-Inspired Puzzle</title>
+    <meta name="viewport" content="width=device-width, initial-scale=1">
+    <title>Q-Up</title>
+    <link rel="preconnect" href="https://fonts.googleapis.com">
+    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
+    <link href="https://fonts.googleapis.com/css2?family=Caveat+Brush&family=Patrick+Hand&display=swap" rel="stylesheet">
     <link rel="stylesheet" href="style.css">
+    <link rel="stylesheet" href="paper.css">
+    <link rel="stylesheet" href="play.css">
 </head>
-<body>
+<body class="paper play">
+<header class="bar">
+    <a class="up pill" href="index.html">&larr; Home</a>
+    <h1 id="page-title" class="title"></h1>
+    <button id="help-button" class="up pill help-button" data-tip="How to play" aria-label="How to play"><span>?</span></button>
+</header>
 <div id="game-container">
     <div id="canvas-container">
-        <div id="puzzle-picker" role="group" aria-label="Puzzle"></div>
-        <canvas id="canvas" width="400" height="400">Error</canvas>
+        <div class="screen"><canvas id="canvas" width="400" height="400">Error</canvas></div>
         <div id="nav-controls" role="group" aria-label="Change puzzle">
             <button id="back-button" class="nav-button">&lsaquo; Back</button>
             <div id="hand-controls">
@@ -26,11 +36,10 @@
         <div id="pool"></div>
     </div>
     <div id="side-panel">
-        <div id="summary-panel">Hover a piece for details.</div>
+        <div id="summary-box" class="up box"><div id="summary-panel">Hover a piece for details.</div></div>
         <div id="controls">
-            <button id="run-button">Run</button>
+            <button id="run-button" class="up btn fill"><span id="run-label">Run</span></button>
             <button id="solution-button">Show Solution</button>
-            <button id="help-button" class="help-button" data-tip="How to play" aria-label="How to play">?</button>
         </div>
         <div id="view-controls" role="group" aria-label="Help, animation speed and display">
             <button class="speed-button" data-speed="0.5" data-tip="Slow" aria-label="Slow speed">
@@ -53,7 +62,7 @@
                 </div>
             </div>
         </div>
-        <div id="result-banner" class="hidden"></div>
+        <div id="result-banner" class="up box hidden"><span id="result-text"></span></div>
     </div>
 </div>
```

`puzzles.js` (removes the hand-built levels and `buildPuzzle` and friends; `KINDS`, `makePiece`, `sizeOf` and `buildFromDefinition` stay):

```diff
--- a/puzzles.js
+++ b/puzzles.js
@@ -1,7 +1,9 @@
 import {Node, makeEmptyNode} from "./node.js";
 
-// Hand-built test puzzles. Locked pieces start on the board; everything else
-// starts in the tray (see rules.js validatePuzzle).
+// The piece kinds, and how puzzle definitions become pieces. A definition is
+// {name, size, locked: [[x, y, kind, charges]], hand: [kind], solution: [{x, y, kind}]}:
+// locked pieces start on the board, the hand starts in the tray (see rules.js
+// validatePuzzle).
 
 export const KINDS = {
     receiver: {summary: "Target", abilities: []},
@@ -31,97 +33,12 @@
 export const makePiece = (kind, charges = 1, locked = false, required = true) =>
     new Node({id: nextId++, summary: KINDS[kind].summary, charges, abilities: [...KINDS[kind].abilities], locked, required});
 
-// A definition may carry its own `size`; ones without (the hand-built levels)
-// are 5x5.
+// A definition may carry its own `size`; one without is 5x5.
 export const DEFAULT_SIZE = 5;
 export const sizeOf = definition => definition.size ?? DEFAULT_SIZE;
 
-// Each puzzle: a name, the locked pieces as [x, y, kind, charges], and the
-// hand as a list of kinds. Every puzzle is checked for solvability in
-// puzzles.test.js.
-const DEFINITIONS = [
-    {
-        name: "Double Tap",
-        locked: [[2, 2, "receiver", 2], [3, 1, "receiver", 1]],
-        hand: ["igniter", "pusher", "burster"],
-    },
-    {
-        name: "Locked and Loaded",
-        locked: [[0, 2, "pusher"], [3, 0, "receiver"], [4, 3, "receiver"], [2, 4, "receiver"]],
-        hand: ["cross", "octo", "knight"],
-    },
-    {
-        name: "Triple Threat",
-        locked: [[2, 3, "pusher"], [3, 3, "receiver", 3], [2, 2, "receiver"], [4, 1, "receiver"], [4, 4, "receiver"], [3, 4, "receiver"]],
-        hand: ["igniter", "octo", "burster", "burster"],
-    },
-    {
-        name: "Crossfire",
-        locked: [[3, 2, "pulseLeft"], [3, 4, "column"], [3, 0, "cross"], [2, 1, "receiver", 2], [4, 3, "receiver"], [1, 4, "receiver"], [0, 3, "receiver"], [0, 1, "receiver"], [3, 1, "receiver", 2], [3, 3, "receiver"]],
-        hand: ["pusher", "pairV", "pairH", "knight"],
-    },
-    {
-        name: "Rising Tide",
-        locked: [[3, 0, "pulseLeft"], [3, 2, "knight"], [3, 4, "burster"], [2, 0, "receiver", 2], [4, 4, "receiver", 3], [4, 3, "receiver"], [4, 2, "receiver"], [1, 3, "receiver", 3], [4, 0, "receiver"], [1, 1, "receiver"]],
-        hand: ["pusher", "tee", "octo", "spread"],
-    },
-    {
-        name: "Column Crawl",
-        locked: [[3, 2, "pusher"], [3, 0, "column"], [4, 2, "receiver"], [2, 2, "receiver", 2], [2, 3, "receiver"], [1, 1, "receiver", 2], [3, 1, "receiver", 3], [3, 3, "receiver"], [3, 4, "receiver"]],
-        hand: ["pusher", "leap", "column", "octo", "burster"],
-    },
-    {
-        name: "Leap of Faith",
-        locked: [[4, 4, "pulseUp"], [3, 3, "leap"], [3, 2, "octo"], [2, 0, "receiver"], [2, 2, "receiver", 2], [4, 0, "receiver"], [4, 1, "receiver", 2], [4, 2, "receiver", 2], [3, 0, "receiver"], [0, 3, "receiver"]],
-        hand: ["pulseLeft", "burster", "knight", "column", "dive"],
-    },
-    {
-        name: "Full Circuit",
-        locked: [[2, 4, "duo"], [3, 2, "burster"], [4, 2, "hop"], [1, 4, "receiver"], [3, 3, "receiver", 2], [2, 3, "receiver"], [4, 3, "receiver", 2], [2, 2, "receiver", 2], [2, 1, "receiver"], [4, 1, "receiver"]],
-        hand: ["pulseLeft", "burster", "octo", "dive", "pairH"],
-    },
-    {
-        name: "Last Light",
-        locked: [[2, 3, "pulseUp"], [1, 4, "leap"], [2, 2, "column"], [4, 4, "receiver"], [2, 0, "receiver"], [2, 1, "receiver"], [3, 3, "receiver"], [1, 0, "receiver", 2], [0, 3, "receiver"], [3, 2, "receiver"]],
-        hand: ["pusher", "cross", "column", "spread", "pairV"],
-    },
-    {
-        // A locked red piece with 2 charges that has to be hit twice (once by
-        // the locked Igniter, once by the Pusher from the hand) and so fires
-        // its burst twice. Use it to watch repeat activations.
-        name: "Echo",
-        locked: [[1, 0, "igniter"], [1, 1, "burster", 2], [2, 1, "receiver", 2], [1, 2, "receiver", 2]],
-        hand: ["pusher"],
-    },
-];
-
-export function puzzleCount() {
-    return DEFINITIONS.length;
-}
-
-export function puzzleName(index) {
-    return DEFINITIONS[index].name;
-}
-
-// The piece kinds that appear in the first `count` hand-built puzzles, i.e.
-// the ones that have actually been play-tested.
-export function testedKinds(count = 6) {
-    const kinds = new Set();
-    for (const def of DEFINITIONS.slice(0, count)) {
-        for (const [, , kind] of def.locked) kinds.add(kind);
-        for (const kind of def.hand) kinds.add(kind);
-    }
-    kinds.delete("receiver");
-    return kinds;
-}
-
-export function puzzleDefinition(index) {
-    return DEFINITIONS[index];
-}
-
 // Builds fresh pieces (a new grid and a new hand) from a definition, so it
-// can be called again to reset a puzzle. Works for the hand-built puzzles and
-// for generated ones.
+// can be called again to reset a puzzle.
 export function buildFromDefinition(def) {
     const size = sizeOf(def);
     const grid = Array.from({length: size}, () =>
@@ -134,7 +51,3 @@
     const pool = def.hand.map(kind => makePiece(kind, 1, false, false));
     return {name: def.name, grid, pool};
 }
-
-export function buildPuzzle(index) {
-    return buildFromDefinition(DEFINITIONS[index]);
-}
```

- [ ] **Step 2: Replace `puzzles.test.js`** with this (the level tests are gone with the levels)

```js
import test from "node:test";
import assert from "node:assert/strict";
import {buildFromDefinition, makePiece} from "./puzzles.js";
import {validatePuzzle} from "./rules.js";

const small = {
    name: "Test",
    size: 3,
    locked: [[0, 0, "igniter", 1], [0, 2, "receiver", 2]],
    hand: ["burster", "pusher"],
    solution: [{x: 0, y: 1, kind: "burster"}],
};

test("locked pieces start on the board and the hand starts in the tray", () => {
    const {grid, pool} = buildFromDefinition(small);
    assert.equal(grid[0][0].locked, true);
    assert.equal(grid[0][2].maxCharges, 2);
    assert.equal(grid[0][1].isEmpty, true);
    assert.equal(pool.length, 2);
    assert.doesNotThrow(() => validatePuzzle(grid, pool));
});

test("hand pieces show 1 but are not required to be activated; locked pieces and targets are", () => {
    const {grid, pool} = buildFromDefinition(small);
    assert.ok(pool.every(piece => piece.required === false));
    assert.ok(pool.every(piece => piece.charges === 1));   // the number shown on a hand piece is always 1
    for (const column of grid) {
        for (const node of column) {
            if (!node.isEmpty) assert.equal(node.required, true);
        }
    }
});

test("a definition's size sets the grid size (5 when it has none)", () => {
    const side = def => buildFromDefinition(def).grid.length;
    assert.equal(side({locked: [], hand: []}), 5);
    assert.equal(side({size: 3, locked: [], hand: []}), 3);
    assert.equal(side({size: 7, locked: [], hand: []}), 7);
    assert.equal(buildFromDefinition({size: 7, locked: [], hand: []}).grid[6].length, 7);
});

test("every call builds fresh pieces, so a puzzle can be reset", () => {
    const first = buildFromDefinition(small);
    first.grid[0][0].charges = 0;
    const second = buildFromDefinition(small);
    assert.equal(second.grid[0][0].charges, 1);
    assert.notEqual(first.pool[0].id, second.pool[0].id);
});

test("makePiece makes a piece of a kind with the given charges", () => {
    const piece = makePiece("octo", 2, true);
    assert.equal(piece.charges, 2);
    assert.equal(piece.locked, true);
    assert.equal(piece.required, true);
    assert.deepEqual(piece.abilities, ["octoBurst"]);
});
```

- [ ] **Step 3: Check nothing still uses the removed code, and run the suite**

```bash
grep -n "puzzleDefinition\|puzzleCount\|puzzleName\|buildPuzzle\|testedKinds\|solutionCache" *.js
node --check game.js
npm test
```
Expected: the grep prints nothing; the syntax check is silent; all tests pass.

- [ ] **Step 4: Create the browser check, `tools/e2e-daily.mjs`**

```js
// End-to-end check of the daily flow, driving headless Chrome over the DevTools
// protocol (no libraries; needs Node 22+). It drags the day's stored solution
// onto the board, presses Run, and checks the win message, the saved streak and
// the home page, then replays the day and takes screenshots of every page.
//
//   npm start                       (serves the project at http://localhost:3000)
//   node tools/e2e-daily.mjs [size]   (size 3, 5 or 7; default 5)
//
// Environment: QUP_URL (default http://localhost:3000), CHROME (path to Chrome),
// QUP_DEBUG_PORT (default 9333). Screenshots are written to a temp folder that
// is printed at the end.
import {spawn} from "node:child_process";
import {mkdtempSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

import {dailyDefinition} from "../daily.js";
import {easternDateString} from "../dates.js";
import {Board} from "../board.js";
import {CANVAS_SIZES} from "../play-model.js";

const size = Number(process.argv[2] ?? "5");
const port = Number(process.env.QUP_DEBUG_PORT ?? "9333");
const BASE = process.env.QUP_URL ?? "http://localhost:3000";
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const outDir = mkdtempSync(join(tmpdir(), "qup-e2e-"));

const today = easternDateString();
const definition = dailyDefinition(today, size);

const chrome = spawn(CHROME, [
    "--headless=new", "--disable-gpu", `--remote-debugging-port=${port}`, `--user-data-dir=${join(outDir, "profile")}`,
    "--window-size=1200,900", "about:blank",
], {stdio: "ignore"});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function connect() {
    for (let i = 0; i < 50; i++) {
        try {
            const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
            const page = targets.find(t => t.type === "page");
            if (page) return new WebSocket(page.webSocketDebuggerUrl);
        } catch { /* chrome is still starting */ }
        await sleep(200);
    }
    throw new Error("could not reach Chrome");
}

const socket = await connect();
await new Promise(resolve => socket.addEventListener("open", resolve));
let nextId = 1;
const waiting = new Map();
socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (message.id && waiting.has(message.id)) {
        waiting.get(message.id)(message);
        waiting.delete(message.id);
    }
});
const send = (method, params = {}) => new Promise(resolve => {
    const id = nextId++;
    waiting.set(id, resolve);
    socket.send(JSON.stringify({id, method, params}));
});
const evaluate = async expression => {
    const reply = await send("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true});
    if (reply.result?.exceptionDetails) throw new Error(JSON.stringify(reply.result.exceptionDetails));
    return reply.result.result.value;
};
const shot = async name => {
    const reply = await send("Page.captureScreenshot", {format: "png"});
    writeFileSync(join(outDir, `${name}.png`), Buffer.from(reply.result.data, "base64"));
    console.log(`screenshot: ${join(outDir, `${name}.png`)}`);
};
const go = async url => {
    await send("Page.navigate", {url});
    await sleep(2500);
};
const mouse = (type, x, y, extra = {}) =>
    send("Input.dispatchMouseEvent", {type, x, y, button: "left", clickCount: 1, ...extra});

await send("Page.enable");
await send("Runtime.enable");
console.log(`today (Eastern): ${today}; ${size}x${size} daily has ${definition.solution.length} pieces to place`);

// ---- start from a clean slate, with the tutorial marked as seen
await go(`${BASE}/index.html`);
await evaluate(`localStorage.clear(); localStorage.setItem("qup-tutorial-seen", "1")`);
await go(`${BASE}/play.html?size=${size}&mode=daily`);
await evaluate(`document.querySelector('[data-speed="1000"]').click()`);   // instant animation

async function placeSolution() {
    const boardSize = CANVAS_SIZES[size];
    const gridSize = (boardSize - Board.OUTLINE_STROKE - size * Board.GRID_STROKE) / size;
    const canvas = JSON.parse(await evaluate(`JSON.stringify(document.getElementById("canvas").getBoundingClientRect())`));
    // which hand tile each solution piece comes from (same matching as Show Solution)
    const used = new Set();
    const placements = definition.solution.map(({x, y, kind}) => {
        const index = definition.hand.findIndex((k, i) => k === kind && !used.has(i));
        used.add(index);
        return {x, y, index};
    }).sort((a, b) => b.index - a.index);   // highest tile first, so earlier tiles keep their place
    for (const {x, y, index} of placements) {
        const tile = JSON.parse(await evaluate(`JSON.stringify(document.querySelectorAll("#pool .pool-node")[${index}].getBoundingClientRect())`));
        const from = {x: tile.left + tile.width / 2, y: tile.top + tile.height / 2};
        const to = {
            x: canvas.left + Board.OUTLINE_STROKE - 2 + (Board.GRID_STROKE + gridSize) * x + gridSize / 2,
            y: canvas.top + Board.OUTLINE_STROKE - 2 + (Board.GRID_STROKE + gridSize) * y + gridSize / 2,
        };
        await mouse("mouseMoved", from.x, from.y);
        await mouse("mousePressed", from.x, from.y, {buttons: 1});
        await mouse("mouseMoved", (from.x + to.x) / 2, (from.y + to.y) / 2, {buttons: 1});
        await mouse("mouseMoved", to.x, to.y, {buttons: 1});
        await mouse("mouseReleased", to.x, to.y);
        await sleep(150);
    }
}

const banner = () => evaluate(`document.getElementById("result-banner").classList.contains("hidden") ? "(hidden)" : document.getElementById("result-text").textContent`);
const runLabel = () => evaluate(`document.getElementById("run-label").textContent`);
const progress = () => evaluate(`localStorage.getItem("qup-progress-v1")`);

// ---- 1. first win
await placeSolution();
await shot("1-placed");
await evaluate(`document.getElementById("run-button").click()`);
await sleep(1500);
console.log("first run banner:", await banner(), "| run button:", await runLabel());
console.log("saved progress:", await progress());
await shot("2-solved");

// ---- 2. keep going and win again: no change to the streak
await evaluate(`document.getElementById("run-button").click()`);   // "Keep going" restores the layout
await sleep(300);
await evaluate(`document.getElementById("run-button").click()`);   // Run again
await sleep(1500);
console.log("second win banner:", await banner(), "| saved progress:", await progress());

// ---- 3. home page now shows DONE and a streak
await go(`${BASE}/index.html`);
await shot("3-home");
console.log("home streak labels:", await evaluate(`JSON.stringify([...document.querySelectorAll(".card .tag.streak")].map(el => el.getAttribute("aria-label")))`));
console.log("home play labels:", await evaluate(`JSON.stringify([...document.querySelectorAll(".card .btns .btn:first-child")].map(el => el.textContent))`));
console.log("stamps:", await evaluate(`document.querySelectorAll(".card .stamp").length`));

// ---- 4. replay the finished daily: the banner says "again", the streak is untouched
await go(`${BASE}/play.html?size=${size}&mode=daily`);
await evaluate(`document.querySelector('[data-speed="1000"]').click()`);
await placeSolution();
await evaluate(`document.getElementById("run-button").click()`);
await sleep(1500);
console.log("replay banner:", await banner(), "| saved progress:", await progress());

// ---- 5. a look at every page, for a human to check
for (const [name, url] of [
    ["home", `${BASE}/index.html`],
    ["play-3-daily", `${BASE}/play.html?size=3&mode=daily`],
    ["play-5-daily", `${BASE}/play.html?size=5&mode=daily`],
    ["play-7-daily", `${BASE}/play.html?size=7&mode=daily`],
    ["play-5-unlimited", `${BASE}/play.html?size=5&mode=unlimited`],
]) {
    await go(url);
    await shot(`page-${name}`);
}

chrome.kill();
process.exit(0);
```

- [ ] **Step 5: Run it at all three sizes**

```bash
npm start &            # serves http://localhost:3000
sleep 2
for size in 3 5 7; do node tools/e2e-daily.mjs $size | grep -v '^screenshot'; echo ---; done
```
Expected, for each size (the number of pieces differs):

```
first run banner: Solved! Streak: 1 day | run button: Keep going
saved progress: {"<size>":{"last":"<today>","streak":1}}
second win banner: Solved again! | saved progress: (the same)
home streak labels: one entry reads "streak: 1 day", the others "streak: no streak yet"
home play labels: the finished size reads "Review", the others "Play"
stamps: 1
replay banner: Solved again! | saved progress: (the same)
```

If it cannot start Chrome, set `CHROME=/path/to/chrome`. Stop the server afterwards.

- [ ] **Step 6: Commit**

```bash
git add game.js play.html puzzles.js puzzles.test.js tools/e2e-daily.mjs
git commit -m "Play by size and mode: daily puzzles with streaks, and unlimited

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The game page look

**Files:**
- Create: `play.css`

**Interfaces:**
- Consumes: the `.up`, `.btn`, `.pill`, `.screen` classes and tokens from `paper.css` (Task 6) and the DOM contract from Task 7. `play.html` already links `style.css`, `paper.css` and `play.css` in that order (Task 7).
- Rules: scoped to `body.play`. The canvas is never styled or wobbled. Smaller controls (back/forward/New, Clear, speed buttons, Show Solution) get a still "pen" look (inked border, hard shadow, no wobble); the Home pill, `?` pill, Run button, summary box, result banner and hand tiles are raised, wobbling pieces. `[hidden]` must win over `display: flex` rules so the daily page really hides New, Back and forward.

- [ ] **Step 1: Create `play.css`**

```css
/* The game page: the page around the board takes the paper-and-ink look.
   The canvas (the board, pieces and beams) is not restyled. */

body.play [hidden] {
    display: none !important;
}

/* ---------- top bar ---------- */

body.play .bar {
    display: flex;
    align-items: center;
    gap: 16px;
    max-width: 1060px;
    margin: 0 auto;
    padding: 24px 28px 4px;
}

body.play .bar .title {
    flex: 1;
    margin: 0;
    font: 400 40px/1 var(--font-head);
}

body.play .bar .help-button {
    min-width: 46px;
    font-size: 24px;
    font-weight: normal;
}

/* the ? sits at the right edge, so its tip is right-aligned to stay on screen */
body.play .bar .help-button[data-tip]::after {
    left: auto;
    right: 0;
    transform: translateY(2px);
}

body.play .bar .help-button[data-tip]:hover::after,
body.play .bar .help-button[data-tip]:focus-visible::after {
    transform: translateY(0);
}

/* ---------- layout ---------- */

body.play #game-container {
    max-width: 1060px;
    margin: 0 auto;
    padding: 24px 28px 56px;
    gap: 44px;
    justify-content: center;
}

/* the board sits in its bezel, like a little screen */
body.play .screen {
    width: fit-content;
    margin: 0 auto;
    padding: 7px;
}

body.play .screen canvas {
    width: auto;
    height: auto;
}

body.play #nav-controls {
    margin-top: 16px;
}

body.play #hand-label {
    margin-top: 18px;
    font-size: 17px;
    font-weight: normal;
    color: var(--ink);
    opacity: 0.6;
}

/* ---------- the hand: raised tiles ---------- */

body.play #pool {
    gap: 12px;
    min-height: 62px;
    margin-top: 10px;
}

body.play .pool-node {
    width: 62px;
    height: 62px;
    padding: 5px;
    --sx: 3px;
    --sy: 4px;
}

/* ---------- side panel ---------- */

body.play #summary-box {
    margin: 0 6px 6px 0;
}

body.play #summary-panel {
    border: 0;
    border-radius: 0;
    padding: 14px 16px;
    height: 140px;
    font-size: 18px;
}

body.play #controls {
    gap: 14px;
    margin-bottom: 6px;
}

body.play #controls button {
    font-family: var(--font-body);
    font-size: 20px;
    padding: 9px 8px 8px;
}

body.play #controls #run-button {
    margin-right: 4px;
}

body.play #result-banner {
    background: none;
    padding: 12px 14px;
    font-weight: normal;
    font-size: 21px;
    margin: 0 6px 6px 0;
    border-radius: 14px 20px 13px 22px / 20px 13px 22px 14px;
}

body.play #result-banner.win {
    background: none;
    color: var(--green);
}

body.play #result-banner.lose {
    background: none;
    color: var(--coral);
}

/* ---------- smaller controls: inked, but still (no wobble) ---------- */

body.play .nav-button,
body.play #solution-button,
body.play .speed-button {
    font-family: var(--font-body);
    font-size: 17px;
    color: var(--ink);
    background: var(--white);
    border: 2.4px solid var(--ink);
    border-radius: 12px 16px 11px 17px / 16px 11px 17px 12px;
    box-shadow: 2px 3px 0 var(--ink);
}

body.play #solution-button {
    font-size: 19px;
}

body.play .speed-button.selected {
    color: var(--white);
    background: var(--ink);
    filter: none;
}

body.play .nav-button:focus-visible,
body.play #solution-button:focus-visible,
body.play .speed-button:focus-visible {
    outline: 3px solid var(--coral);
    outline-offset: 3px;
}

/* the tutorial's own Back / Next keep their plain look */
body.play .tutorial-dialog .nav-button {
    font-family: inherit;
    box-shadow: none;
}

/* ---------- narrow screens ---------- */

@media (max-width: 860px) {
    body.play #game-container {
        flex-direction: column;
        align-items: center;
    }

    body.play #side-panel {
        width: 100%;
        max-width: 420px;
    }
}
```

- [ ] **Step 2: Run the browser check and look at the pages**

```bash
npm start &            # serves http://localhost:3000
sleep 2
node tools/e2e-daily.mjs 5 | tail -8
```
The last lines print the folder holding `page-home.png`, `page-play-3-daily.png`, `page-play-5-daily.png`, `page-play-7-daily.png` and `page-play-5-unlimited.png` (each `screenshot:` line gives the full path). Read each one.

Expected:
- **All play pages:** a raised "← Home" pill at the top left, the title in brush handwriting ("Daily · 5×5 · Oct 7", or "Unlimited · 5×5"), a raised `?` pill at the top right; the board in a recessed bezel (the board itself crisp and unchanged: white, light gray grid, the same pieces and wires); the hand as raised white tiles; a raised white summary box and a black Run button with a coral shadow on the right; small speed buttons with the selected one black.
- **Daily pages:** no "Show Solution", no New / Back / forward row (only the round clear button under the board).
- **Unlimited page:** "Show Solution" next to Run, and Back / clear / New under the board.
- **3x3 and 7x7:** the board is smaller (320px) and larger (490px) than 5x5 (400px), and nothing overlaps or is cut off.
- Text everywhere is readable.

Also hover the `?` and check the tip stays on screen; open the tutorial with it and check the dialog is readable (the first visit also opens it by itself).

Stop the server afterwards.

- [ ] **Step 3: Run the whole suite and commit**

Run: `npm test` (expected: all pass)

```bash
git add play.css
git commit -m "Give the game page the paper-and-ink look

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:** Pages and links (1) -> Tasks 6, 7. Day logic (2) -> Task 3. Generator (3) -> Tasks 1, 2. Progress (4) -> Task 4. Home page (5) -> Tasks 5, 6. Game page (6) -> Tasks 5, 7, 8. Visual system (7) -> Tasks 6, 8. Testing (8) -> tests in Tasks 1-6 plus `tools/e2e-daily.mjs` in Task 7. Out of scope items are not built.

**Placeholder scan:** none; every file is given in full or as an exact diff.

**Type consistency:** `sizeOf`/`DEFAULT_SIZE` (Task 1) are used by Tasks 2 and 7. `generateDefinition({size, rng})` and `SIZES` (Task 2) are used in Tasks 3, 6 and 7. `addDays`, `easternDateString`, `msUntilNextEasternMidnight`, `formatCountdown`, `formatDay` (Task 3) are used by Tasks 4, 5, 6 and 7. `recordWin`/`streakFor`/`isDone`/`loadProgress`/`saveProgress`/`browserStorage` (Task 4) are used by Tasks 5, 6 and 7. `parsePlayParams`/`playTitle`/`playHref`/`winMessage`/`CANVAS_SIZES` (Task 5) are used by Task 7. `cardModel`/`MAX_TALLY` (Task 5) are used by Task 6. `startInk` (Task 6) is used by Tasks 6 and 7. Element ids in `play.html` (Task 7) match the ids `game.js` reads.
