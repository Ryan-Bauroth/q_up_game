import test from "node:test";
import assert from "node:assert/strict";
import {Board} from "./board.js";

test("chess-style labels: files a-e left to right, ranks 1-5 bottom to top", () => {
    assert.deepEqual([0, 1, 2, 3, 4].map(Board.fileLabel), ["a", "b", "c", "d", "e"]);
    assert.deepEqual([0, 1, 2, 3, 4].map(r => Board.rankLabel(r, 5)), ["5", "4", "3", "2", "1"]);
});
