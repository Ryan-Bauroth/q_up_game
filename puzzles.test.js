import test from "node:test";
import assert from "node:assert/strict";
import {buildFromDefinition, makePiece} from "./puzzles.js";
import {validatePuzzle} from "./rules.js";
import {simulate} from "./engine.js";

const small = {
    name: "Test",
    size: 3,
    locked: [[0, 0, "igniter", 1], [0, 2, "receiver", 2]],
    hand: ["burster", "pusher"],
    solution: [{x: 0, y: 1, kind: "burster"}],
};

test("locked pieces start on the board and the hand starts in the tray", () => {
    const {grid, pool} = buildFromDefinition(small);
    assert.equal(grid[0][0].locked, true);
    assert.equal(grid[0][2].maxCharges, 2);
    assert.equal(grid[0][1].isEmpty, true);
    assert.equal(pool.length, 2);
    assert.doesNotThrow(() => validatePuzzle(grid, pool));
});

test("every piece on the board, hand pieces included, must be activated once placed", () => {
    const {grid, pool} = buildFromDefinition(small);
    assert.ok(pool.every(piece => piece.required === true));
    assert.ok(pool.every(piece => piece.charges === 1));   // the number shown on a hand piece is always 1
    for (const column of grid) {
        for (const node of column) {
            if (!node.isEmpty) assert.equal(node.required, true);
        }
    }
});

test("a hand piece placed where nothing activates it keeps the puzzle from being won", () => {
    const {grid, pool} = buildFromDefinition(small);
    grid[0][1] = pool[0];                         // the burster the solution uses
    grid[2][2] = pool[1];                         // a decoy nothing reaches
    assert.equal(simulate(grid, 3).won, false);
});

test("a definition's size sets the grid size (5 when it has none)", () => {
    const side = def => buildFromDefinition(def).grid.length;
    assert.equal(side({locked: [], hand: []}), 5);
    assert.equal(side({size: 3, locked: [], hand: []}), 3);
    assert.equal(side({size: 7, locked: [], hand: []}), 7);
    assert.equal(buildFromDefinition({size: 7, locked: [], hand: []}).grid[6].length, 7);
});

test("every call builds fresh pieces, so a puzzle can be reset", () => {
    const first = buildFromDefinition(small);
    first.grid[0][0].charges = 0;
    const second = buildFromDefinition(small);
    assert.equal(second.grid[0][0].charges, 1);
    assert.notEqual(first.pool[0].id, second.pool[0].id);
});

test("makePiece makes a piece of a kind with the given charges", () => {
    const piece = makePiece("octo", 2, true);
    assert.equal(piece.charges, 2);
    assert.equal(piece.locked, true);
    assert.equal(piece.required, true);
    assert.deepEqual(piece.abilities, ["octoBurst"]);
});

test("a piece remembers which kind it is, and keeps it when cloned", () => {
    const piece = makePiece("octo");
    assert.equal(piece.kind, "octo");
    assert.equal(piece.clone().kind, "octo");
    const {grid, pool} = buildFromDefinition(small);
    assert.deepEqual(pool.map(p => p.kind), ["burster", "pusher"]);
    assert.equal(grid[0][0].kind, "igniter");
});
