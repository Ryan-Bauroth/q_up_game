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
