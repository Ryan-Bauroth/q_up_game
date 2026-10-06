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
