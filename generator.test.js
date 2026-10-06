import test from "node:test";
import assert from "node:assert/strict";
import {generateDefinition, allowedKinds} from "./generator.js";
import {testedKinds} from "./puzzles.js";
import {buildFromDefinition, PUZZLE_SIZE} from "./puzzles.js";
import {validatePuzzle} from "./rules.js";
import {solve} from "./solver.js";

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
        assert.equal(pool.length, 4);
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
    const definition = generateDefinition({rng: seeded(5), handSize: 5});
    assert.equal(definition.hand.length, 5);
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
