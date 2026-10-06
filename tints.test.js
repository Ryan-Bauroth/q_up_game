import test from "node:test";
import assert from "node:assert/strict";
import {tintCoverage, washChannels, flatBackground, TINT_FILLS} from "./tints.js";

test("a cell crossed by a column and a row has a wash for each axis", () => {
    const coverage = tintCoverage([
        {cells: [{x: 1, y: 0}, {x: 1, y: 1}], alpha: 0.16, axis: "column"},
        {cells: [{x: 0, y: 1}, {x: 1, y: 1}], alpha: 0.16, axis: "row"},
    ]);
    const near = (entry, column, row) =>
        assert.ok(Math.abs(entry.column - column) < 1e-9 && Math.abs(entry.row - row) < 1e-9, JSON.stringify(entry));
    near(coverage.get("1,0"), 0.16, 0);
    near(coverage.get("0,1"), 0, 0.16);
    near(coverage.get("1,1"), 0.16, 0.16);
    assert.equal(coverage.get("4,4"), undefined);
});

test("two columns over one cell stack their washes", () => {
    const coverage = tintCoverage([
        {cells: [{x: 2, y: 2}], alpha: 0.2, axis: "column"},
        {cells: [{x: 2, y: 2}], alpha: 0.2, axis: "column"},
    ]);
    assert.ok(Math.abs(coverage.get("2,2").column - 0.36) < 1e-9);
});

test("washChannels: no wash is white, full wash is the color itself", () => {
    assert.deepEqual(washChannels("#7b5fc4", 0), [255, 255, 255]);
    assert.deepEqual(washChannels("#7b5fc4", 1), [0x7b, 0x5f, 0xc4]);
});

test("flatBackground: white, one wash, or the average of two", () => {
    assert.equal(flatBackground(undefined), "#ffffff");
    assert.equal(flatBackground({column: 0, row: 0}), "#ffffff");
    const [r, g, b] = washChannels(TINT_FILLS.column, 0.5);
    assert.equal(flatBackground({column: 0.5, row: 0}), `rgb(${r}, ${g}, ${b})`);
    const row = washChannels(TINT_FILLS.row, 0.5);
    const avg = [r, g, b].map((c, i) => Math.round((c + row[i]) / 2));
    assert.equal(flatBackground({column: 0.5, row: 0.5}), `rgb(${avg.join(", ")})`);
});
