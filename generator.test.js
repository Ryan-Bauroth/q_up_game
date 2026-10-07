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
