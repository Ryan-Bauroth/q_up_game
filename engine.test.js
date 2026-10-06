import {test} from "node:test";
import assert from "node:assert/strict";
import {Node, makeEmptyNode} from "./node.js";
import {simulate, checkWin} from "./engine.js";

function makeGrid(size) {
    return Array.from({length: size}, () =>
        Array.from({length: size}, () => makeEmptyNode())
    );
}

test("activate() clamps charges at 0 and never goes negative", () => {
    const node = new Node({id: 1, charges: 1, abilities: []});
    assert.equal(node.activate(), true);
    assert.equal(node.charges, 0);
    assert.equal(node.activate(), false);
    assert.equal(node.charges, 0);
});

test("simulate() resolves an onRun -> onActivated two-hop chain and wins", () => {
    const grid = makeGrid(2);
    // (0,0) fires on Run, pulses down to (0,1).
    grid[0][0] = new Node({id: 1, charges: 1, abilities: ["runPulseDown"]});
    // (0,1) just needs to absorb the hit, no further abilities.
    grid[0][1] = new Node({id: 2, charges: 1, abilities: []});

    const result = simulate(grid, 2);

    assert.equal(result.won, true);
    assert.equal(result.trace.length, 1);
    assert.equal(grid[0][0].charges, 0);
    assert.equal(grid[0][1].charges, 0);
});

test("simulate() reports a loss when a charged node is never reached", () => {
    const grid = makeGrid(3);
    grid[0][0] = new Node({id: 1, charges: 1, abilities: ["runPulseDown"]});
    // Isolated node with no incoming ability ever targets it.
    grid[2][2] = new Node({id: 2, charges: 1, abilities: []});

    const result = simulate(grid, 3);

    assert.equal(result.won, false);
    assert.equal(checkWin(grid, 3), false);
    assert.equal(grid[2][2].charges, 1);
});

test("simulate() no-ops when an activation targets an already-depleted node", () => {
    const grid = makeGrid(3);
    grid[0][0] = new Node({id: 1, charges: 1, abilities: ["runPulseDown"]});
    grid[0][1] = new Node({id: 2, charges: 0, abilities: []}); // starts depleted

    let result;
    assert.doesNotThrow(() => { result = simulate(grid, 3); });
    assert.equal(grid[0][0].charges, 0);
    assert.equal(grid[0][1].charges, 0);
    assert.equal(result.trace[0].targets[0].consumed, false);
});

test("rowSweep target selector stays in bounds after engine filtering", () => {
    const grid = makeGrid(3);
    grid[0][0] = new Node({id: 1, charges: 1, abilities: ["runPulseDown"]});
    grid[0][1] = new Node({id: 2, charges: 1, abilities: ["rowSweep"]});
    grid[2][1] = new Node({id: 3, charges: 1, abilities: []});

    const result = simulate(grid, 3);

    assert.equal(grid[2][1].charges, 0);
    assert.equal(result.won, true);
});

test("another piece's output never activates a starter", () => {
    const grid = Array.from({length: 3}, () => Array.from({length: 3}, () => makeEmptyNode()));
    grid[0][0] = new Node({id: 1, charges: 1, abilities: ["runPulseDown"]});       // starter, fires at (0,1)
    grid[0][1] = new Node({id: 2, charges: 1, abilities: ["adjacentBurst"]});      // bursts back at the starter
    const {finalGrid, trace} = simulate(grid, 3);
    // the starter spent its one charge on the Run press, not from the burst
    assert.equal(finalGrid[0][0].charges, 0);
    const burst = trace.find(s => s.abilityId === "adjacentBurst");
    assert.equal(burst.targets.find(t => t.x === 0 && t.y === 0).consumed, false);
});
