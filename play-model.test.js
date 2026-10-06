import test from "node:test";
import assert from "node:assert/strict";
import {parsePlayParams, playTitle, playHref, winMessage, CANVAS_SIZES, PLAY_SIZES} from "./play-model.js";

test("the play page reads its size and mode from the URL", () => {
    assert.deepEqual(parsePlayParams("?size=5&mode=daily"), {size: 5, mode: "daily"});
    assert.deepEqual(parsePlayParams("?mode=unlimited&size=7"), {size: 7, mode: "unlimited"});
    assert.deepEqual(parsePlayParams("?size=3&mode=daily&extra=1"), {size: 3, mode: "daily"});
});

test("a missing or unknown size or mode is rejected", () => {
    for (const search of ["", "?size=5", "?mode=daily", "?size=4&mode=daily", "?size=9&mode=daily", "?size=abc&mode=daily", "?size=5&mode=hard", "?size=&mode="]) {
        assert.equal(parsePlayParams(search), null, search);
    }
});

test("every size has a canvas size, and the 5x5 board is the usual 400px", () => {
    assert.deepEqual(PLAY_SIZES, [3, 5, 7]);
    assert.deepEqual(CANVAS_SIZES, {3: 320, 5: 400, 7: 490});
});

test("page titles", () => {
    assert.equal(playTitle({size: 5, mode: "daily", today: "2026-10-07"}), "Daily · 5×5 · Oct 7");
    assert.equal(playTitle({size: 7, mode: "unlimited", today: "2026-10-07"}), "Unlimited · 7×7");
});

test("links to the play page", () => {
    assert.equal(playHref(3, "daily"), "play.html?size=3&mode=daily");
    assert.equal(playHref(7, "unlimited"), "play.html?size=7&mode=unlimited");
});

test("win messages: unlimited, a first daily win with its streak, and a replay", () => {
    assert.equal(winMessage({daily: false}), "Solved!");
    assert.equal(winMessage({daily: true, firstWin: true, streak: 1}), "Solved! Streak: 1 day");
    assert.equal(winMessage({daily: true, firstWin: true, streak: 4}), "Solved! Streak: 4 days");
    assert.equal(winMessage({daily: true, firstWin: false, streak: 4}), "Solved again!");
});
