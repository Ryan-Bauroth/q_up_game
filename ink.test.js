import test from "node:test";
import assert from "node:assert/strict";
import {filterMarkup} from "./ink.js";

test("three wobble filters with different seeds are defined", () => {
    const markup = filterMarkup();
    assert.equal((markup.match(/<filter /g) ?? []).length, 3);
    for (const id of ["ink-a", "ink-b", "ink-c"]) assert.ok(markup.includes(`id="${id}"`), id);
    assert.equal(new Set(markup.match(/seed="\d+"/g)).size, 3);
    // roomy enough that the shadow is not clipped
    assert.ok(markup.includes('x="-20%"') && markup.includes('width="140%"'));
    assert.ok(markup.includes('y="-40%"') && markup.includes('height="180%"'));
});
