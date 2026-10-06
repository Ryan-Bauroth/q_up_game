import test from "node:test";
import assert from "node:assert/strict";
import {Node, makeEmptyNode} from "./node.js";
import {simulate, cloneGrid} from "./engine.js";
import {playRun} from "./runner.js";

const makeGrid = size => Array.from({length: size}, () => Array.from({length: size}, () => makeEmptyNode()));

test("a run plays one starter at a time: its flash, its chain, then the next starter", async () => {
    const grid = makeGrid(3);
    // reading order: (2,0) before (0,1)
    grid[2][0] = new Node({id: 1, charges: 1, abilities: ["runPulseDown"]});
    grid[2][1] = new Node({id: 2, charges: 1, abilities: []});
    grid[0][1] = new Node({id: 3, charges: 1, abilities: ["runPulseDown"]});
    grid[0][2] = new Node({id: 4, charges: 1, abilities: []});

    const frames = [];
    const board = {
        grid,
        drawBoard() {
            frames.push(this.effects.flashes.map(f => `${f.x},${f.y}`).join(" "));
        },
    };
    const {trace} = simulate(cloneGrid(grid, 3), 3);
    await playRun(board, trace, 3, {flashMs: 0, gapMs: 0, travelMs: 0});

    // The board redraws while a beam travels, so drop repeated frames. The second
    // starter does not flash until the first one's chain has played.
    const flashes = frames.filter((f, i) => f !== "" && f !== frames[i - 1]);
    assert.deepEqual(flashes, ["2,0", "2,1", "0,1", "0,2"]);
    // charges were spent as the run played
    for (const [x, y] of [[2, 0], [2, 1], [0, 1], [0, 2]]) assert.equal(grid[x][y].charges, 0);
});
