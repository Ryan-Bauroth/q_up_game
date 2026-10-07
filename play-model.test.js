import test from "node:test";
import assert from "node:assert/strict";
import {parsePlayParams, playTitle, playHref, winMessage, waysSummary, CANVAS_SIZES, PLAY_SIZES} from "./play-model.js";

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

test("daily win messages say how many pieces were used, and nudge toward cheaper ways", () => {
    // first win, not the cheapest way
    assert.equal(winMessage({daily: true, firstWin: true, streak: 1, pieces: 5, cheaperLeft: 2}),
        "Solved! Streak: 1 day\nUsed 5 pieces.\nCheaper ways exist: try for fewer pieces.");
    assert.equal(winMessage({daily: true, firstWin: true, streak: 3, pieces: 4, cheaperLeft: 1}),
        "Solved! Streak: 3 days\nUsed 4 pieces.\nA cheaper way exists: try for fewer pieces.");
    // first win with the cheapest way: no nudge
    assert.equal(winMessage({daily: true, firstWin: true, streak: 2, pieces: 3, cheaperLeft: 0}),
        "Solved! Streak: 2 days\nUsed 3 pieces.");
    // a later, different way
    assert.equal(winMessage({daily: true, firstWin: false, streak: 2, pieces: 4, newWay: true, cheaperLeft: 1}),
        "A new way to solve it!\nUsed 4 pieces.\nA cheaper way exists: try for fewer pieces.");
    // the same way again
    assert.equal(winMessage({daily: true, firstWin: false, streak: 2, pieces: 4, cheaperLeft: 1}),
        "Solved again!\nUsed 4 pieces.\nA cheaper way exists: try for fewer pieces.");
    // every way found
    assert.equal(winMessage({daily: true, firstWin: false, streak: 2, pieces: 3, newWay: true, allFound: true}),
        "A new way to solve it!\nUsed 3 pieces.\nYou found every way!");
    // one piece reads in the singular
    assert.equal(winMessage({daily: true, firstWin: true, streak: 1, pieces: 1}), "Solved! Streak: 1 day\nUsed 1 piece.");
    // unlimited never says any of it
    assert.equal(winMessage({daily: false, pieces: 4, cheaperLeft: 2}), "Solved!");
});

test("waysSummary: how many ways there are, which are found, how many cheaper ones remain", () => {
    const five = Array.from({length: 5}, (_, i) => ({x: i, y: 0, kind: "tee"}));
    const four = five.slice(0, 4), three = five.slice(0, 3);
    const solutions = [five, four, three];
    assert.deepEqual(waysSummary(solutions, [5]), {
        total: 3, found: 1, cheaperLeft: 2, allFound: false,
        items: [{found: true, label: "5 pieces"}, {found: false, label: "?"}, {found: false, label: "?"}],
    });
    assert.deepEqual(waysSummary(solutions, [5, 3]), {
        total: 3, found: 2, cheaperLeft: 0, allFound: false,
        items: [{found: true, label: "5 pieces"}, {found: false, label: "?"}, {found: true, label: "3 pieces"}],
    });
    const all = waysSummary(solutions, [3, 4, 5]);
    assert.equal(all.allFound, true);
    assert.equal(all.cheaperLeft, 0);
    // found with 4 first: only the 3-piece way is cheaper
    assert.equal(waysSummary(solutions, [4]).cheaperLeft, 1);
    // nothing found yet
    assert.equal(waysSummary(solutions, []).cheaperLeft, 0);
});

test("winMessage without a piece count, and waysSummary of nothing", () => {
    assert.equal(winMessage({daily: true, firstWin: true, streak: 2, pieces: undefined, cheaperLeft: 1}),
        "Solved! Streak: 2 days\nA cheaper way exists: try for fewer pieces.");   // no "Used" line
    const empty = waysSummary([], []);
    assert.equal(empty.cheaperLeft, 0);
    assert.equal(empty.total, 0);
});
