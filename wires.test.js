import test from "node:test";
import assert from "node:assert/strict";
import {Node, makeEmptyNode} from "./node.js";
import {wireLinks, drawnLinks, skipHits, dotAngles, beamLevel, beamWidths} from "./wires.js";
import {colorForNode, PALETTE} from "./pieces.js";

const emptyGrid = () => Array.from({length: 5}, () => Array.from({length: 5}, () => makeEmptyNode()));
const piece = (id, abilities = []) => new Node({id, charges: 1, abilities});

test("no wire where the output cell is empty", () => {
    const g = emptyGrid();
    g[2][2] = piece(1, ["adjacentBurst"]);
    assert.deepEqual(wireLinks(g, 5), []);
});

test("a + piece wires only to the neighbors that hold pieces", () => {
    const g = emptyGrid();
    g[2][2] = piece(1, ["adjacentBurst"]);
    g[3][2] = piece(2);
    g[2][1] = piece(3);
    g[4][4] = piece(4); // not adjacent, never hit
    const links = wireLinks(g, 5);
    assert.equal(links.length, 2);
    assert.ok(links.every(l => l.from.x === 2 && l.from.y === 2 && !l.skip));
});

test("a skipping piece gets a skip wire only when the far cell holds a piece", () => {
    const g = emptyGrid();
    g[1][1] = piece(1, ["lineSkip2Right"]);
    assert.deepEqual(wireLinks(g, 5), []);
    g[3][1] = piece(2);
    assert.deepEqual(wireLinks(g, 5), [{from: {x: 1, y: 1}, to: {x: 3, y: 1}, skip: true}]);
    g[2][1] = piece(3); // a piece in the skipped cell doesn't create a wire
    assert.equal(wireLinks(g, 5).length, 1);
});

test("diagonal pieces wire to diagonal neighbors", () => {
    const g = emptyGrid();
    g[2][2] = piece(1, ["diagonalRelay"]);
    g[3][3] = piece(2);
    assert.deepEqual(wireLinks(g, 5), [{from: {x: 2, y: 2}, to: {x: 3, y: 3}, skip: false}]);
});

test("outputs are never wired to starter pieces", () => {
    const g = emptyGrid();
    g[2][2] = piece(1, ["adjacentBurst"]);
    g[3][2] = piece(2, ["runPulseDown"]); // a starter
    g[2][1] = piece(3);
    const links = wireLinks(g, 5);
    assert.deepEqual(links.map(l => l.to), [{x: 2, y: 1}]);
});

test("a starter still wires out to the pieces it pulses", () => {
    const g = emptyGrid();
    g[1][1] = piece(1, ["runPulseDown"]);
    g[1][2] = piece(2);
    assert.deepEqual(wireLinks(g, 5), [{from: {x: 1, y: 1}, to: {x: 1, y: 2}, skip: false}]);
});

test("skipHits groups non-adjacent hits by the piece they land on", () => {
    const g = emptyGrid();
    g[0][1] = piece(1, ["lineSkip2Right"]);   // hits (2,1)
    g[2][3] = piece(2, ["skipLeft2"]);        // hits (0,3)
    g[2][1] = piece(3);
    g[0][3] = piece(4);
    g[2][2] = piece(5, ["adjacentBurst"]);    // adjacent hits only; no dots
    const hits = skipHits(wireLinks(g, 5));
    assert.deepEqual(hits.get("2,1"), [{x: 0, y: 1}]);
    assert.deepEqual(hits.get("0,3"), [{x: 2, y: 3}]);
    assert.equal(hits.size, 2);
});

test("two pieces skipping onto the same target give it two dots", () => {
    const g = emptyGrid();
    g[0][2] = piece(1, ["lineSkip2Right"]);
    g[2][0] = piece(2, ["skipDown2"]);
    g[2][2] = piece(3);
    assert.equal(skipHits(wireLinks(g, 5)).get("2,2").length, 2);
});

test("dotAngles centers on the top and spreads outward", () => {
    const top = -Math.PI / 2;
    assert.deepEqual(dotAngles(1), [top]);
    const two = dotAngles(2);
    assert.ok(Math.abs((two[0] + two[1]) / 2 - top) < 1e-9);
    assert.ok(two[0] < top && two[1] > top);
    const five = dotAngles(5);
    assert.ok(Math.abs(five[2] - top) < 1e-9); // middle dot is at the top
    // a full ring never overlaps itself: 12 dots at 30 degrees, then compressed
    const full = dotAngles(14);
    assert.ok(Math.abs(full[13] - full[0]) < Math.PI * 2);
});

test("a piece can be hit by different kinds of skipping pieces, each with its own dot color", () => {
    const g = emptyGrid();
    g[2][2] = piece(1);                       // the target
    g[0][2] = piece(2, ["lineSkip2Right"]);   // red skip piece, from the left
    g[2][4] = piece(3, ["columnPulse"]);      // violet beam, from below (2 tiles away)
    g[4][2] = piece(4, ["skipLeft2"]);        // another red skip piece, from the right
    const sources = skipHits(wireLinks(g, 5)).get("2,2");
    assert.equal(sources.length, 3);
    const colors = sources.map(s => colorForNode(g[s.x][s.y]));
    assert.equal(colors.filter(c => c === PALETTE.reactor).length, 2);
    assert.equal(colors.filter(c => c === PALETTE.beam).length, 1);
});

test("drawnLinks: no wires from purple beam pieces, none for skip hits", () => {
    const g = emptyGrid();
    g[1][1] = piece(1, ["columnPulse"]);     // beam: no wires
    g[1][2] = piece(2);
    g[3][3] = piece(3, ["adjacentBurst"]);   // red: wires to neighbors
    g[3][4] = piece(4);
    g[0][3] = piece(5, ["lineSkip2Right"]);  // skip hit lands on (2,3): dots, not wires
    g[2][3] = piece(6);
    const links = drawnLinks(g, 5);
    assert.ok(links.every(l => !(l.from.x === 1 && l.from.y === 1)));
    assert.ok(links.every(l => !l.skip));
    assert.ok(links.some(l => l.from.x === 3 && l.from.y === 3 && l.to.x === 3 && l.to.y === 4));
});

test("beams are thicker the more charges the firing piece has left", () => {
    const withCharges = charges => new Node({id: 1, charges, abilities: ["adjacentBurst"]});
    assert.equal(beamLevel(withCharges(1)), 1);
    assert.equal(beamLevel(withCharges(2)), 2);
    assert.equal(beamLevel(withCharges(3)), 3);
    assert.equal(beamLevel(withCharges(9)), 3);   // capped
    assert.equal(beamLevel(withCharges(0)), 1);   // spent pieces keep the base width
    const widths = [1, 2, 3].map(l => beamWidths(l).inner);
    assert.ok(widths[0] < widths[1] && widths[1] < widths[2]);
});

test("skipHits with includeAdjacent also counts adjacent hits (the 'all dots' mode)", () => {
    const g = emptyGrid();
    g[2][2] = piece(1, ["adjacentBurst"]);
    g[3][2] = piece(2);
    const links = wireLinks(g, 5);
    assert.equal(skipHits(links).size, 0);                       // adjacent only: no skip dots
    assert.deepEqual(skipHits(links, true).get("3,2"), [{x: 2, y: 2}]);
});
