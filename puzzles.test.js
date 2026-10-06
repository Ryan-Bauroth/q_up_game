import test from "node:test";
import assert from "node:assert/strict";
import {buildPuzzle, puzzleCount, PUZZLE_SIZE} from "./puzzles.js";
import {validatePuzzle} from "./rules.js";
import {solve} from "./solver.js";
import {simulate, cloneGrid} from "./engine.js";

for (let i = 0; i < puzzleCount(); i++) {
    const {name, grid, pool} = buildPuzzle(i);

    test(`puzzle ${i + 1} (${name}) follows the locked/hand start rule`, () => {
        assert.doesNotThrow(() => validatePuzzle(grid, pool));
    });

    test(`puzzle ${i + 1} (${name}) is solvable`, () => {
        assert.ok(solve(grid, pool, PUZZLE_SIZE, 1).length >= 1);
    });

    test(`puzzle ${i + 1} (${name}) is not already solved`, () => {
        assert.equal(solve(grid, [], PUZZLE_SIZE, 1).length, 0);
    });
}

test("Echo: the 2-charge Burster fires twice, and the puzzle is won by one Pusher on its left", () => {
    const index = puzzleCount() - 1;
    const {name, grid, pool} = buildPuzzle(index);
    assert.equal(name, "Echo");
    grid[0][1] = pool[0];
    const {trace, won} = simulate(cloneGrid(grid, PUZZLE_SIZE), PUZZLE_SIZE);
    assert.equal(won, true);
    assert.equal(trace.filter(s => s.sourceX === 1 && s.sourceY === 1).length, 2);
});
