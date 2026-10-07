import test from "node:test";
import assert from "node:assert/strict";
import {Node, makeEmptyNode} from "./node.js";
import {canDrag, canDrop, dropAction, applyDrop, validatePuzzle, placedPieces} from "./rules.js";

const grid = (...cells) => {
    const g = Array.from({length: 3}, () => Array.from({length: 3}, () => makeEmptyNode()));
    cells.forEach(([x, y, n]) => (g[x][y] = n));
    return g;
};
const piece = (locked, id = 1) => new Node({id, charges: 1, locked});

test("clone preserves locked", () => {
    assert.equal(piece(true).clone().locked, true);
    assert.equal(piece(false).clone().locked, false);
});

test("locked and empty pieces can't be dragged", () => {
    assert.equal(canDrag(piece(true)), false);
    assert.equal(canDrag(makeEmptyNode()), false);
    assert.equal(canDrag(piece(false)), true);
});

test("drops are allowed on empty and unlocked cells, never on locked ones", () => {
    assert.equal(canDrop(makeEmptyNode()), true);
    assert.equal(canDrop(piece(false)), true);
    assert.equal(canDrop(piece(true)), false);
});

test("dropAction: swap/place, return, take off the board, or stay in hand", () => {
    assert.equal(dropAction("board", makeEmptyNode()), "place");
    assert.equal(dropAction("board", piece(false)), "place");
    assert.equal(dropAction("pool", piece(false)), "place");
    assert.equal(dropAction("board", piece(true)), "return");
    assert.equal(dropAction("pool", piece(true)), "stay");
    assert.equal(dropAction("board", null), "to-hand");
    assert.equal(dropAction("pool", null), "stay");
});

test("validatePuzzle accepts locked-on-board, unlocked-in-tray", () => {
    assert.doesNotThrow(() => validatePuzzle(grid([0, 0, piece(true, 2)]), [piece(false, 3)]));
});

test("validatePuzzle rejects unlocked pieces on the board and locked pieces in the tray", () => {
    assert.throws(() => validatePuzzle(grid([0, 0, piece(false, 2)]), []));
    assert.throws(() => validatePuzzle(grid(), [piece(true, 3)]));
});

// Mirrors game.js: picking a board piece up empties its cell first.
function pickUp(g, i, j) {
    const node = g[i][j];
    g[i][j] = makeEmptyNode();
    return {source: "board", node, i, j};
}

test("applyDrop: picking a piece up and putting it back in the same cell keeps it", () => {
    const g = grid();
    const p = piece(false, 7);
    g[1][1] = p;
    const drag = pickUp(g, 1, 1);
    applyDrop(g, [], drag, {x: 1, y: 1});
    assert.equal(g[1][1], p);
});

test("applyDrop: moving a board piece to an empty cell", () => {
    const g = grid();
    const p = piece(false, 7);
    g[1][1] = p;
    applyDrop(g, [], pickUp(g, 1, 1), {x: 2, y: 2});
    assert.equal(g[2][2], p);
    assert.ok(g[1][1].isEmpty);
});

test("applyDrop: board piece dropped on another board piece swaps them", () => {
    const g = grid();
    const a = piece(false, 7), b = piece(false, 8);
    g[0][0] = a;
    g[2][2] = b;
    applyDrop(g, [], pickUp(g, 0, 0), {x: 2, y: 2});
    assert.equal(g[2][2], a);
    assert.equal(g[0][0], b);
});

test("applyDrop: hand piece onto a board piece swaps it into the hand slot", () => {
    const g = grid();
    const onBoard = piece(false, 8), inHand = piece(false, 9), other = piece(false, 10);
    g[1][1] = onBoard;
    const pool = [other, inHand];
    applyDrop(g, pool, {source: "pool", node: inHand, poolIndex: 1}, {x: 1, y: 1});
    assert.equal(g[1][1], inHand);
    assert.deepEqual(pool, [other, onBoard]);
});

test("applyDrop: a board piece dropped off the grid goes to the hand; onto a locked cell it returns", () => {
    const g = grid();
    const p = piece(false, 7), lockedPiece = piece(true, 8);
    g[0][0] = p;
    g[2][2] = lockedPiece;
    const pool = [];
    applyDrop(g, pool, pickUp(g, 0, 0), null);
    assert.deepEqual(pool, [p]);
    assert.ok(g[0][0].isEmpty);

    g[0][0] = p;
    pool.length = 0;
    applyDrop(g, pool, pickUp(g, 0, 0), {x: 2, y: 2});
    assert.equal(g[0][0], p);
    assert.equal(g[2][2], lockedPiece);
});

test("placedPieces lists the movable pieces on the board with their kinds", () => {
    const fixed = new Node({id: 1, charges: 1, locked: true, kind: "igniter"});
    const mine = new Node({id: 2, charges: 1, kind: "burster"});
    const other = new Node({id: 3, charges: 1, kind: "octo"});
    const g = grid([0, 0, fixed], [2, 1, mine], [1, 2, other]);
    assert.deepEqual(placedPieces(g), [{x: 1, y: 2, kind: "octo"}, {x: 2, y: 1, kind: "burster"}]);
    assert.deepEqual(placedPieces(grid([0, 0, fixed])), []);
});
