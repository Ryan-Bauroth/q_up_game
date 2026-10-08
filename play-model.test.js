import test from "node:test";
import assert from "node:assert/strict";
import {parsePlayParams, playTitle, playHref, winMessage, solveStyle, dayNumber, shareText, numberEmoji, waysSummary, CANVAS_SIZES, PLAY_SIZES, nextUnsolvedSize} from "./play-model.js";

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
        "Solved! Streak: 1 day\n5 pieces.\nCheaper solutions exist: try for fewer pieces.");
    assert.equal(winMessage({daily: true, firstWin: true, streak: 3, pieces: 4, cheaperLeft: 1}),
        "Solved! Streak: 3 days\n4 pieces.\nA cheaper solution exists: try for fewer pieces.");
    // first win with the cheapest way: no nudge
    assert.equal(winMessage({daily: true, firstWin: true, streak: 2, pieces: 3, cheaperLeft: 0}),
        "Solved! Streak: 2 days\n3 pieces.");
    // a later, different way
    assert.equal(winMessage({daily: true, firstWin: false, streak: 2, pieces: 4, newWay: true, cheaperLeft: 1}),
        "A new solution!\n4 pieces.\nA cheaper solution exists: try for fewer pieces.");
    // the same way again
    assert.equal(winMessage({daily: true, firstWin: false, streak: 2, pieces: 4, cheaperLeft: 1}),
        "Solved again!\n4 pieces.\nA cheaper solution exists: try for fewer pieces.");
    // every way found
    assert.equal(winMessage({daily: true, firstWin: false, streak: 2, pieces: 3, newWay: true, allFound: true}),
        "A new solution!\n3 pieces.\nYou found every solution!");
    // one piece reads in the singular
    assert.equal(winMessage({daily: true, firstWin: true, streak: 1, pieces: 1}), "Solved! Streak: 1 day\n1 piece.");
    // unlimited never says any of it
    assert.equal(winMessage({daily: false, pieces: 4, cheaperLeft: 2}), "Solved!");
});

test("waysSummary: how many solutions there are, which are found, how many cheaper ones remain", () => {
    const five = Array.from({length: 5}, (_, i) => ({x: i, y: 0, kind: "tee"}));
    const four = five.slice(0, 4), three = five.slice(0, 3);
    const solutions = [five, four, three];
    assert.deepEqual(waysSummary(solutions, [5]), {
        total: 3, found: 1, cheaperLeft: 2, allFound: false,
        items: [{found: true, label: "✓"}, {found: false, label: "4 pieces"}, {found: false, label: "3 pieces"}],
    });
    assert.deepEqual(waysSummary(solutions, [5, 3]), {
        total: 3, found: 2, cheaperLeft: 0, allFound: false,
        items: [{found: true, label: "✓"}, {found: false, label: "4 pieces"}, {found: true, label: "✓"}],
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
        "Solved! Streak: 2 days\nA cheaper solution exists: try for fewer pieces.");   // no "Used" line
    const empty = waysSummary([], []);
    assert.equal(empty.cheaperLeft, 0);
    assert.equal(empty.total, 0);
});

test("nextUnsolvedSize goes on from this size, wraps round and gives null when all are done", () => {
    const today = "2026-10-07";
    const done = () => ({last: today, streak: 1, solutions: {}});
    assert.equal(nextUnsolvedSize({}, 3, today), 5);
    assert.equal(nextUnsolvedSize({5: done()}, 3, today), 7);
    assert.equal(nextUnsolvedSize({7: done()}, 5, today), 3);
    assert.equal(nextUnsolvedSize({3: {last: "2026-10-06", streak: 1, solutions: {}}}, 7, today), 3);   // yesterday's win does not count
    assert.equal(nextUnsolvedSize({3: done(), 5: done()}, 7, today), null);
    assert.equal(nextUnsolvedSize({5: done(), 7: done()}, 3, today), null);
});

test("a solve gets a one-word style by how its piece count compares with the known ways", () => {
    const ways = [5, 4, 3].map(n => Array.from({length: n}, (_, i) => ({x: i, y: 0, kind: "tee"})));
    assert.equal(solveStyle(3, ways), "Simplest");
    assert.equal(solveStyle(4, ways), "Solid");
    assert.equal(solveStyle(5, ways), "Thorough");
    assert.equal(solveStyle(3, null), null);
    assert.equal(winMessage({daily: true, firstWin: true, streak: 1, pieces: 5, style: "Thorough"}),
        "Solved! Streak: 1 day\nThorough: 5 pieces.");
    assert.equal(winMessage({daily: true, firstWin: true, streak: 1, pieces: 4, style: "Solid", extra: 1}),
        "Solved! Streak: 1 day\nSolid: 4 pieces, 1 not needed.");
});

test("the daily's number counts from the first daily, Oct 6 2026, as #1", () => {
    assert.equal(dayNumber("2026-10-06"), 1);
    assert.equal(dayNumber("2026-10-07"), 2);
    assert.equal(dayNumber("2026-11-06"), 32);   // across a month end
    assert.equal(dayNumber("2027-10-06"), 366);
});

test("number emoji", () => {
    assert.equal(numberEmoji(4), "4\uFE0F\u20E3");
    assert.equal(numberEmoji(12), "1\uFE0F\u20E32\uFE0F\u20E3");
});

test("a share lists every way to solve the daily, largest first, ticked when found", () => {
    assert.equal(shareText({size: 3, today: "2026-10-07", counts: [3, 4], found: [4]}), "qube 3x3 #2\n4\uFE0F\u20E3\u2705 3\uFE0F\u20E3\u26D4\uFE0F");
    // two ways with the same piece count are two entries
    assert.equal(shareText({size: 5, today: "2026-10-06", counts: [4, 4, 3], found: [3, 4]}),
        "qube 5x5 #1\n4\uFE0F\u20E3\u2705 4\uFE0F\u20E3\u2705 3\uFE0F\u20E3\u2705");
    // without a known list, just what was found
    assert.equal(shareText({size: 7, today: "2026-10-07", counts: null, found: [6]}), "qube 7x7 #2\n6\uFE0F\u20E3\u2705");
});

test("a share can end with a link to the game", () => {
    assert.equal(shareText({size: 3, today: "2026-10-07", counts: [3], found: [3], url: "https://example.com/qube/"}),
        "qube 3x3 #2\n3\uFE0F\u20E3\u2705\nhttps://example.com/qube/");
});
