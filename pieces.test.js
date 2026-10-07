import test from "node:test";
import assert from "node:assert/strict";
import {Node} from "./node.js";
import {targetCount, colorForNode, PALETTE, tipAngles, targetCells, bodySides, bodyRotation, bodyKind, pieceType, skipDepth, arrowShapes, bodyEdgeDistance, ARROW_PADDING} from "./pieces.js";
import {KINDS} from "./puzzles.js";

const piece = abilities => new Node({id: 1, charges: 1, abilities});

test("target counts reflect each ability's reach", () => {
    assert.equal(targetCount(piece([])), 0);
    assert.equal(targetCount(piece(["runPulseDown"])), 1);
    assert.equal(targetCount(piece(["adjacentBurst"])), 4);
    assert.equal(targetCount(piece(["diagonalRelay"])), 4);
});

test("color is chosen by piece type", () => {
    assert.equal(colorForNode(piece([])), PALETTE.receiver);
    assert.equal(colorForNode(piece(["adjacentBurst"])), PALETTE.reactor);
    assert.equal(colorForNode(piece(["lineSkip2Right"])), PALETTE.reactor);
    assert.equal(colorForNode(piece(["runPulseDown"])), PALETTE.starter);
});

test("same-type abilities share a color but get different tip directions", () => {
    const plus = piece(["adjacentBurst"]);
    const cross = piece(["diagonalRelay"]);
    assert.equal(colorForNode(plus), colorForNode(cross));
    const key = n => tipAngles(n).map(t => t.angle.toFixed(2)).sort().join();
    assert.equal(tipAngles(plus).length, 4);
    assert.equal(tipAngles(cross).length, 4);
    assert.notEqual(key(plus), key(cross));
});

test("tips that jump over a tile are marked as skips", () => {
    assert.deepEqual(tipAngles(piece(["lineSkip2Right"])).map(t => t.skip), [true]);
    assert.deepEqual(tipAngles(piece(["runPulseDown"])).map(t => t.skip), [false]);
    assert.ok(tipAngles(piece(["adjacentBurst"])).every(t => !t.skip));
});

test("targetCells returns only in-bounds cells the piece would hit", () => {
    assert.equal(targetCells(piece(["adjacentBurst"]), 2, 2, 5).length, 4);
    assert.deepEqual(targetCells(piece(["adjacentBurst"]), 0, 0, 5).length, 2);
    assert.deepEqual(targetCells(piece(["lineSkip2Right"]), 1, 1, 5), [{x: 3, y: 1}]);
    assert.deepEqual(targetCells(piece(["lineSkip2Right"]), 4, 1, 5), []);
});

test("body sides: receiver circle, starter triangle, reactor by direction count", () => {
    assert.equal(bodySides(piece([])), 0);
    assert.equal(bodySides(piece(["runPulseDown"])), 3);
    assert.equal(bodySides(piece(["lineSkip2Right"])), 4);   // 1 direction -> square
    assert.equal(bodySides(piece(["columnPulse"])), 0);      // beams are capsules, not polygons
    assert.equal(bodySides(piece(["adjacentBurst"])), 4);    // 4 directions -> square
    assert.equal(bodySides(piece(["octoBurst"])), 8);        // 8 directions -> octagon
    assert.equal(bodySides(piece(["knightJump"])), 8);
});

test("bodies sit flat when the arrows don't land on corners", () => {
    const eighth = Math.PI / 8; // 22.5 degrees: flat-sided octagon
    // Knight's uneven angles can't all sit on corners, so it is drawn flat
    assert.ok(Math.abs(bodyRotation(piece(["knightJump"]), 8) - eighth) < 1e-9);
    // Octo's arrows are on the compass points, so corners go on them
    assert.ok(Math.abs(bodyRotation(piece(["octoBurst"]), 8)) < 1e-9);
    // + is a diamond (corners on the arrows); X is an upright square
    assert.ok(Math.abs(bodyRotation(piece(["adjacentBurst"]), 4)) < 1e-9);
    assert.ok(Math.abs(bodyRotation(piece(["diagonalRelay"]), 4) - Math.PI / 4) < 1e-9);
});

test("whole-line pieces are their own type with their own color and a capsule body", () => {
    for (const id of ["columnPulse", "rowPulse", "rowSweep"]) {
        assert.equal(pieceType(piece([id])), "beam");
        assert.equal(bodyKind(piece([id])), "capsule");
    }
    // columns and rows share the same violet
    assert.equal(colorForNode(piece(["columnPulse"])), PALETTE.beam);
    assert.equal(colorForNode(piece(["rowPulse"])), PALETTE.beamRow);
    assert.equal(colorForNode(piece(["rowSweep"])), PALETTE.beamRow);
    assert.equal(pieceType(piece(["adjacentBurst"])), "reactor");
    assert.equal(bodyKind(piece(["adjacentBurst"])), "polygon");
});

test("skip depth counts the tiles a piece jumps over (one white ring each)", () => {
    for (const id of ["lineSkip2Right", "skipDown2", "skipLeft2", "diagSkip2", "knightJump"]) {
        assert.equal(skipDepth(piece([id])), 1, id);
    }
    for (const id of ["adjacentBurst", "diagonalRelay", "octoBurst", "pairH", "tee", "spreadDown", "columnPulse"]) {
        assert.equal(skipDepth(piece([id])), 0, id);
    }
    assert.equal(skipDepth(piece([])), 0);
});

test("skipping pieces stay the same red as other reactors", () => {
    assert.equal(colorForNode(piece(["knightJump"])), PALETTE.reactor);
    assert.equal(colorForNode(piece(["lineSkip2Right"])), PALETTE.reactor);
    assert.equal(colorForNode(piece(["octoBurst"])), PALETTE.reactor);
});

test("a start-on-run piece with two opposite outputs is a lens; one output stays a triangle", () => {
    assert.equal(bodyKind(piece(["runPair"])), "lens");
    assert.equal(bodySides(piece(["runPair"])), 0);
    assert.equal(bodyKind(piece(["runPulseDown"])), "polygon");
    assert.equal(bodySides(piece(["runPulseDown"])), 3);
});

test("every arrow of every piece stays inside its body, with padding", () => {
    const size = 100;
    for (const [kind, {abilities}] of Object.entries(KINDS)) {
        const node = new Node({id: 1, charges: 1, abilities});
        for (const shape of arrowShapes(node, size)) {
            for (const [dx, dy] of shape) {
                const room = bodyEdgeDistance(node, size, Math.atan2(dy, dx)) - size * ARROW_PADDING;
                assert.ok(Math.hypot(dx, dy) <= room + 1e-6, `${kind}: arrow point (${dx.toFixed(1)}, ${dy.toFixed(1)}) pokes out`);
            }
        }
    }
});
