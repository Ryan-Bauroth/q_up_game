import test from "node:test";
import assert from "node:assert/strict";
import {Node} from "./node.js";
import {describePiece} from "./describe.js";

const make = (abilities, charges = 1, locked = false) =>
    new Node({id: 1, summary: "Piece", charges, abilities, locked});
const fact = (d, label) => d.facts.find(([l]) => l === label)[1];

test("a target: needs hits, does nothing", () => {
    const d = describePiece(make([], 2, true));
    assert.equal(fact(d, "Activations needed"), "2");
    assert.equal(fact(d, "Locked"), null);   // shown as just "Locked"
    assert.equal(d.description, "Just needs to be activated.");
});

test("quick facts come first (hits needed, then locked), then the description", () => {
    const d = describePiece(make(["adjacentBurst"], 1, true));
    assert.deepEqual(d.facts.map(([label]) => label), ["Activations needed", "Locked"]);
    assert.equal(d.description, "Activates the 4 adjacent cells.");
    assert.equal("note" in d, false);
});

test("a starter needs no hits; a spent piece reads done", () => {
    const starter = describePiece(make(["runPulseDown"]));
    assert.equal(fact(starter, "Activations needed"), "none");
    assert.equal(starter.description, "On Run: activates the cell below.");
    const spent = make(["adjacentBurst"]);
    spent.charges = 0;
    assert.equal(fact(describePiece(spent), "Activations needed"), "0 (done)");
});

test("the title is the piece's color; skip pieces are 'Red w/ outline'", () => {
    assert.equal(describePiece(make([])).title, "Teal");
    assert.equal(describePiece(make(["runPulseDown"])).title, "Yellow");
    assert.equal(describePiece(make(["columnPulse"])).title, "Purple");
    assert.equal(describePiece(make(["rowPulse"])).title, "Blue");
    assert.equal(describePiece(make(["adjacentBurst"])).title, "Red");
    assert.equal(describePiece(make(["octoBurst"])).title, "Red");
    for (const id of ["lineSkip2Right", "skipDown2", "skipLeft2", "diagSkip2", "knightJump"]) {
        assert.equal(describePiece(make([id])).title, "Red w/ outline", id);
    }
});

test("the Locked bullet only appears when the piece is locked", () => {
    assert.equal(describePiece(make(["adjacentBurst"], 1, false)).facts.some(([l]) => l === "Locked"), false);
    assert.equal(describePiece(make(["adjacentBurst"], 1, true)).facts.some(([l]) => l === "Locked"), true);
});

test("a piece that isn't required needs 0 activations", () => {
    const optional = new Node({id: 1, summary: "Piece", charges: 1, abilities: ["adjacentBurst"], required: false});
    assert.equal(fact(describePiece(optional), "Activations needed"), "0");
});
