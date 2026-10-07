import test from "node:test";
import assert from "node:assert/strict";
import {LEVELS} from "./tutorial-levels.js";
import {buildFromDefinition, makePiece} from "./puzzles.js";
import {validatePuzzle} from "./rules.js";
import {findSolutions, solutionKey} from "./solutions.js";
import {simulate, cloneGrid} from "./engine.js";

const TEXT_FIELDS = ["title", "hint", "help", "miss", "win"];

// runs the locked pieces plus the given pieces placed from the hand
function wins(definition, pieces) {
    const {grid} = buildFromDefinition({...definition, hand: []});
    const placed = cloneGrid(grid, definition.size);
    for (const {x, y, kind} of pieces) placed[x][y] = makePiece(kind, 1, false, false);
    return simulate(placed, definition.size).won;
}

test("there are seven levels", () => {
    assert.equal(LEVELS.length, 7);
});

LEVELS.forEach((level, index) => {
    const {definition} = level;
    const name = `level ${index + 1} (${level.title})`;

    test(`${name} builds and validates`, () => {
        const {grid, pool} = buildFromDefinition(definition);
        assert.doesNotThrow(() => validatePuzzle(grid, pool));
    });

    test(`${name} is 3x3 with at most 3 pieces`, () => {
        assert.equal(definition.size, 3);
        assert.ok(definition.locked.length + definition.hand.length <= 3);
    });

    test(`${name} has no decoy hand pieces`, () => {
        assert.deepEqual([...definition.hand].sort(), definition.solution.map(p => p.kind).sort());
    });

    test(`${name} has exactly the stored solution`, () => {
        if (index === 0) {
            // nothing to place: the board wins on Run alone
            assert.deepEqual(definition.hand, []);
            assert.deepEqual(definition.solution, []);
            assert.equal(wins(definition, []), true);
            return;
        }
        const {solutions, complete} = findSolutions(definition);
        assert.equal(complete, true);
        assert.equal(solutions.length, 1);
        assert.equal(solutionKey(solutions[0]), solutionKey(definition.solution));
    });

    test(`${name} wins with the solution placed`, () => {
        assert.equal(wins(definition, definition.solution), true);
    });

    test(`${name} is won beforehand only for level 1`, () => {
        assert.equal(wins(definition, []), index === 0);
    });

    test(`${name} has clean text`, () => {
        for (const field of TEXT_FIELDS) {
            assert.equal(typeof level[field], "string", field);
            assert.ok(level[field].length > 0, field);
            assert.doesNotMatch(level[field], /charge|fire|depleted/i, field);
        }
    });
});
