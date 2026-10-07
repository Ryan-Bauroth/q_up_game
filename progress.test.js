import test from "node:test";
import assert from "node:assert/strict";
import {recordWin, addSolution, cheapestSolution, foundCounts, streakFor, isDone, loadProgress, saveProgress, browserStorage, mergeProgress} from "./progress.js";

test("a first win makes a streak of 1 and marks the day done", () => {
    const progress = recordWin({}, 5, "2026-10-07");
    assert.deepEqual(progress, {5: {last: "2026-10-07", streak: 1}});
    assert.equal(isDone(progress, 5, "2026-10-07"), true);
    assert.equal(isDone(progress, 5, "2026-10-08"), false);
    assert.equal(isDone(progress, 3, "2026-10-07"), false);
});

test("winning on consecutive days grows the streak", () => {
    let progress = recordWin({}, 5, "2026-10-07");
    progress = recordWin(progress, 5, "2026-10-08");
    progress = recordWin(progress, 5, "2026-10-09");
    assert.equal(progress[5].streak, 3);
    assert.equal(progress[5].last, "2026-10-09");
});

test("winning the same day again changes nothing", () => {
    const once = recordWin({}, 5, "2026-10-07");
    assert.deepEqual(recordWin(once, 5, "2026-10-07"), once);
});

test("missing a day restarts the streak at 1", () => {
    let progress = recordWin({}, 5, "2026-10-07");
    progress = recordWin(progress, 5, "2026-10-08");
    progress = recordWin(progress, 5, "2026-10-10");
    assert.equal(progress[5].streak, 1);
});

test("streaks run across month and year ends", () => {
    let progress = recordWin({}, 3, "2026-12-31");
    progress = recordWin(progress, 3, "2027-01-01");
    assert.equal(progress[3].streak, 2);
});

test("each size has its own streak", () => {
    let progress = recordWin({}, 3, "2026-10-07");
    progress = recordWin(progress, 5, "2026-10-07");
    progress = recordWin(progress, 5, "2026-10-08");
    assert.equal(progress[3].streak, 1);
    assert.equal(progress[5].streak, 2);
    assert.equal(progress[7], undefined);
});

test("recordWin does not change the progress it was given", () => {
    const before = {5: {last: "2026-10-07", streak: 1}};
    recordWin(before, 5, "2026-10-08");
    assert.deepEqual(before, {5: {last: "2026-10-07", streak: 1}});
});

test("a streak counts while it is alive (won today or yesterday) and reads 0 once broken", () => {
    const progress = {5: {last: "2026-10-07", streak: 4}};
    assert.equal(streakFor(progress, 5, "2026-10-07"), 4);   // won today
    assert.equal(streakFor(progress, 5, "2026-10-08"), 4);   // won yesterday, today still to play
    assert.equal(streakFor(progress, 5, "2026-10-09"), 0);   // a day was missed
    assert.equal(streakFor(progress, 7, "2026-10-07"), 0);   // never played
});

// a stand-in for localStorage
const fakeStorage = (initial = {}) => {
    const data = {...initial};
    return {data, getItem: key => (key in data ? data[key] : null), setItem: (key, value) => { data[key] = String(value); }};
};

test("progress is saved and loaded as JSON", () => {
    const storage = fakeStorage();
    const progress = recordWin({}, 7, "2026-10-07");
    assert.equal(saveProgress(storage, progress), true);
    assert.deepEqual(loadProgress(storage), progress);
});

test("empty, corrupt or odd saved data reads as no progress", () => {
    assert.deepEqual(loadProgress(fakeStorage()), {});
    assert.deepEqual(loadProgress(fakeStorage({"qup-progress-v1": "not json"})), {});
    assert.deepEqual(loadProgress(fakeStorage({"qup-progress-v1": "[1,2]"})), {});
    // bad entries are dropped, good ones kept
    const mixed = {"3": {last: "2026-10-07", streak: 2}, "4": {last: "2026-10-07", streak: 2}, "5": {last: "yesterday", streak: 2}, "7": {last: "2026-10-07", streak: -1}};
    assert.deepEqual(loadProgress(fakeStorage({"qup-progress-v1": JSON.stringify(mixed)})), {3: {last: "2026-10-07", streak: 2}});
});

test("blocked or missing storage never throws", () => {
    const blocked = {getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }};
    assert.deepEqual(loadProgress(blocked), {});
    assert.equal(saveProgress(blocked, {}), false);
    assert.deepEqual(loadProgress(null), {});
    assert.equal(saveProgress(null, {}), false);
});

test("browserStorage gives null where there is no localStorage", () => {
    assert.equal(browserStorage(), null);   // node has no window
});

test("mergeProgress: storage wins per size, memory fills the gaps, inputs are untouched", () => {
    const memory = {3: {last: "2026-10-06", streak: 1}, 5: {last: "2026-10-05", streak: 2}};
    const stored = {5: {last: "2026-10-07", streak: 3}, 7: {last: "2026-10-07", streak: 1}};
    const memoryCopy = structuredClone(memory);
    const storedCopy = structuredClone(stored);
    assert.deepEqual(mergeProgress(memory, stored), {
        3: {last: "2026-10-06", streak: 1},
        5: {last: "2026-10-07", streak: 3},
        7: {last: "2026-10-07", streak: 1},
    });
    assert.deepEqual(memory, memoryCopy);
    assert.deepEqual(stored, storedCopy);
});

test("a win for a date older than the stored one is ignored", () => {
    const progress = {5: {last: "2026-10-08", streak: 4}};
    assert.equal(recordWin(progress, 5, "2026-10-07"), progress);
    assert.deepEqual(progress, {5: {last: "2026-10-08", streak: 4}});
});

test("two tabs: a win in one tab keeps the other tab's saved win", () => {
    const tabA = {3: {last: "2026-10-06", streak: 1}};
    const storage = {5: {last: "2026-10-07", streak: 2}};   // written by tab B
    const merged = recordWin(mergeProgress(tabA, storage), 3, "2026-10-07");
    assert.deepEqual(merged, {
        3: {last: "2026-10-07", streak: 2},
        5: {last: "2026-10-07", streak: 2},
    });
});

test("a win saves the pieces the player placed, under how many pieces that is", () => {
    const solution = [{x: 1, y: 2, kind: "burster"}, {x: 0, y: 0, kind: "pusher"}];
    const progress = recordWin({}, 5, "2026-10-07", solution);
    assert.deepEqual(progress[5], {last: "2026-10-07", streak: 1, solutions: {2: solution}});
});

test("winning the same day again keeps the first solution", () => {
    const first = [{x: 1, y: 2, kind: "burster"}];
    const once = recordWin({}, 5, "2026-10-07", first);
    const again = recordWin(once, 5, "2026-10-07", [{x: 3, y: 3, kind: "octo"}]);
    assert.deepEqual(again[5].solutions, {1: first});
});

test("the next day's win starts a fresh set of solutions", () => {
    let progress = recordWin({}, 5, "2026-10-07", [{x: 1, y: 2, kind: "burster"}]);
    progress = recordWin(progress, 5, "2026-10-08", [{x: 0, y: 1, kind: "tee"}]);
    assert.deepEqual(progress[5], {last: "2026-10-08", streak: 2, solutions: {1: [{x: 0, y: 1, kind: "tee"}]}});
});

const three = [{x: 0, y: 0, kind: "pusher"}, {x: 1, y: 2, kind: "burster"}, {x: 2, y: 2, kind: "octo"}];
const two = [{x: 1, y: 2, kind: "burster"}, {x: 2, y: 2, kind: "octo"}];

test("addSolution keeps every different way found today, one per piece count", () => {
    let progress = recordWin({}, 5, "2026-10-07", three);
    progress = addSolution(progress, 5, "2026-10-07", two);
    assert.deepEqual(progress[5].solutions, {3: three, 2: two});
    assert.equal(progress[5].streak, 1);   // finding another way never touches the streak
    // a second way with the same count is not kept, and nothing is mutated
    const same = addSolution(progress, 5, "2026-10-07", [{x: 4, y: 4, kind: "tee"}, {x: 3, y: 3, kind: "cross"}]);
    assert.deepEqual(same[5].solutions, {3: three, 2: two});
});

test("addSolution only adds to a day that has been won, and ignores an empty solution", () => {
    assert.deepEqual(addSolution({}, 5, "2026-10-07", two), {});
    const won = recordWin({}, 5, "2026-10-07", three);
    assert.equal(addSolution(won, 5, "2026-10-08", two), won);
    assert.equal(addSolution(won, 5, "2026-10-07", []), won);
});

test("cheapestSolution and foundCounts read today's solutions", () => {
    let progress = recordWin({}, 5, "2026-10-07", three);
    assert.deepEqual(cheapestSolution(progress, 5, "2026-10-07"), three);
    assert.deepEqual(foundCounts(progress, 5, "2026-10-07"), [3]);
    progress = addSolution(progress, 5, "2026-10-07", two);
    assert.deepEqual(cheapestSolution(progress, 5, "2026-10-07"), two);
    assert.deepEqual(foundCounts(progress, 5, "2026-10-07"), [2, 3]);
    // yesterday's solutions are not today's; nothing saved reads as empty
    assert.deepEqual(cheapestSolution(progress, 5, "2026-10-08"), []);
    assert.deepEqual(foundCounts(progress, 5, "2026-10-08"), []);
    assert.deepEqual(cheapestSolution({}, 5, "2026-10-07"), []);
    assert.deepEqual(cheapestSolution(recordWin({}, 5, "2026-10-07"), 5, "2026-10-07"), []);
});

test("saved solutions survive saving and loading", () => {
    const storage = fakeStorage();
    let progress = recordWin({}, 5, "2026-10-07", three);
    progress = addSolution(progress, 5, "2026-10-07", two);
    saveProgress(storage, progress);
    assert.deepEqual(loadProgress(storage), progress);
});

test("an older save with a single `solution` is read as one found solution", () => {
    const old = {"5": {last: "2026-10-07", streak: 2, solution: three}};
    const loaded = loadProgress(fakeStorage({"qup-progress-v1": JSON.stringify(old)}));
    assert.deepEqual(loaded, {5: {last: "2026-10-07", streak: 2, solutions: {3: three}}});
});

test("damaged saved solutions are dropped but the streak is kept", () => {
    const bad = [
        {3: [{x: 5, y: 0, kind: "leap"}]},                       // off a 5x5 board
        {1: [{x: 1, y: 1}]},                                      // no kind
        {1: [{x: 1.5, y: 1, kind: "leap"}]},                      // not a whole cell
        {4: three},                                               // filed under the wrong piece count
        "oops",
        [three],
        {1: null},
    ];
    for (const solutions of bad) {
        const saved = {"5": {last: "2026-10-07", streak: 3, solutions}};
        const loaded = loadProgress(fakeStorage({"qup-progress-v1": JSON.stringify(saved)}));
        assert.deepEqual(loaded, {5: {last: "2026-10-07", streak: 3}}, JSON.stringify(solutions));
    }
    // one good and one bad entry: the good one is kept
    const mixed = {"5": {last: "2026-10-07", streak: 3, solutions: {2: two, 4: three}}};
    const loaded = loadProgress(fakeStorage({"qup-progress-v1": JSON.stringify(mixed)}));
    assert.deepEqual(loaded, {5: {last: "2026-10-07", streak: 3, solutions: {2: two}}});
});

test("recordWin and addSolution store copies of the solution", () => {
    const solution = [{x: 1, y: 2, kind: "burster", extra: "x"}];
    let progress = recordWin({}, 7, "2026-10-07", solution);
    solution[0].x = 5;
    assert.deepEqual(progress[7].solutions[1], [{x: 1, y: 2, kind: "burster"}]);
    const other = [{x: 0, y: 0, kind: "pusher"}, {x: 3, y: 3, kind: "tee"}];
    progress = addSolution(progress, 7, "2026-10-07", other);
    other[0].kind = "tee";
    assert.deepEqual(progress[7].solutions[2][0], {x: 0, y: 0, kind: "pusher"});
});

test("loadProgress round-trips a 7x7 save with solutions", () => {
    let stored;
    const storage = {getItem: () => stored ?? null, setItem: (_, value) => { stored = value; }};
    let progress = recordWin({}, 7, "2026-10-07", [{x: 6, y: 6, kind: "burster"}]);
    progress = addSolution(progress, 7, "2026-10-07", [{x: 0, y: 1, kind: "pusher"}, {x: 6, y: 0, kind: "tee"}]);
    assert.equal(saveProgress(storage, progress), true);
    assert.deepEqual(loadProgress(storage), progress);
});
