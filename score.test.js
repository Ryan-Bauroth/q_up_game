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
