import test from "node:test";
import assert from "node:assert/strict";
import {hintLine, answerShown, answerCells} from "./tutorial-model.js";

const level = {
    hint: "H", help: "P", miss: "M", win: "W",
    definition: {solution: [{x: 1, y: 2, kind: "pusher"}]},
};

test("the default line is the hint", () => {
    assert.equal(hintLine(level, {}), "H");
    assert.equal(hintLine(level), "H");
});

test("a miss beats the hint", () => {
    assert.equal(hintLine(level, {misses: 1}), "M");
});

test("help beats a miss", () => {
    assert.equal(hintLine(level, {misses: 2, helpTaps: 1}), "P");
    assert.equal(hintLine(level, {helpTaps: 2}), "P");
});

test("a win beats everything", () => {
    assert.equal(hintLine(level, {won: true, misses: 3, helpTaps: 2}), "W");
});

test("the answer shows from the second tap", () => {
    assert.equal(answerShown({helpTaps: 0}), false);
    assert.equal(answerShown({helpTaps: 1}), false);
    assert.equal(answerShown({helpTaps: 2}), true);
    assert.equal(answerShown({helpTaps: 3}), true);
});

test("answerCells copies the solution", () => {
    const cells = answerCells(level);
    assert.deepEqual(cells, [{x: 1, y: 2, kind: "pusher"}]);
    assert.notEqual(cells[0], level.definition.solution[0]);
});
