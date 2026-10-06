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
