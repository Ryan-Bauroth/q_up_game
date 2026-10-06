import test from "node:test";
import assert from "node:assert/strict";
import {generateDefinition, allowedKinds} from "./generator.js";
import {testedKinds} from "./puzzles.js";
import {buildFromDefinition, PUZZLE_SIZE} from "./puzzles.js";
import {validatePuzzle} from "./rules.js";
import {solve} from "./solver.js";
import {isSensible} from "./lint.js";
import {layout} from "./lint.js";
import {simulate, cloneGrid} from "./engine.js";
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

test("random puzzles only use pieces from the play-tested levels 1-6, plus the Row piece", () => {
    const tested = new Set([...testedKinds(6), "row"]);
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

test("the Row piece turns up in random puzzles", () => {
    assert.ok(allowedKinds().reactors.includes("row"));
    let seen = 0;
    for (let seed = 200; seed < 260; seed++) {
        const definition = generateDefinition({rng: seeded(seed)});
        const placed = [...definition.locked.map(l => l[2]), ...definition.solution.map(s => s.kind)];
        if (placed.includes("row")) seen++;
    }
    assert.ok(seen > 0, "no Row piece in 60 puzzles");
});

test("no silly locked pieces: each one reaches the board and activates something", () => {
    for (let seed = 100; seed < 140; seed++) {
        const definition = generateDefinition({rng: seeded(seed)});
        const {trace} = simulate(cloneGrid(layout(definition), PUZZLE_SIZE), PUZZLE_SIZE);
        for (const [x, y, kind] of definition.locked) {
            if (kind === "receiver") continue;
            assert.ok(reaches(kind, x, y), `seed ${seed}: locked ${kind} at ${x},${y} points off the board`);
            const useful = trace.some(s => s.sourceX === x && s.sourceY === y && s.targets.some(t => t.consumed));
            assert.ok(useful, `seed ${seed}: locked ${kind} at ${x},${y} activates nothing`);
        }
    }
});
