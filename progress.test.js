import test from "node:test";
import assert from "node:assert/strict";
import {recordWin, streakFor, isDone, loadProgress, saveProgress, browserStorage, mergeProgress} from "./progress.js";

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

test("a win can save the pieces the player placed", () => {
    const solution = [{x: 1, y: 2, kind: "burster"}, {x: 0, y: 0, kind: "pusher"}];
    const progress = recordWin({}, 5, "2026-10-07", solution);
    assert.deepEqual(progress[5], {last: "2026-10-07", streak: 1, solution});
});

test("winning the same day again keeps the first solution", () => {
    const first = [{x: 1, y: 2, kind: "burster"}];
    const once = recordWin({}, 5, "2026-10-07", first);
    const again = recordWin(once, 5, "2026-10-07", [{x: 3, y: 3, kind: "octo"}]);
    assert.deepEqual(again[5].solution, first);
});

test("the next day's win replaces the solution", () => {
    let progress = recordWin({}, 5, "2026-10-07", [{x: 1, y: 2, kind: "burster"}]);
    progress = recordWin(progress, 5, "2026-10-08", [{x: 0, y: 1, kind: "tee"}]);
    assert.deepEqual(progress[5], {last: "2026-10-08", streak: 2, solution: [{x: 0, y: 1, kind: "tee"}]});
});

test("a saved solution survives saving and loading", () => {
    const storage = fakeStorage();
    const solution = [{x: 4, y: 0, kind: "leap"}];
    saveProgress(storage, recordWin({}, 5, "2026-10-07", solution));
    assert.deepEqual(loadProgress(storage)[5].solution, solution);
});

test("a damaged saved solution is dropped but the streak is kept", () => {
    const bad = [
        [{x: 5, y: 0, kind: "leap"}],                 // off a 5x5 board
        [{x: 1, y: 1}],                                // no kind
        [{x: 1.5, y: 1, kind: "leap"}],                // not a whole cell
        "oops",
        [null],
    ];
    for (const solution of bad) {
        const saved = {"5": {last: "2026-10-07", streak: 3, solution}};
        const loaded = loadProgress(fakeStorage({"qup-progress-v1": JSON.stringify(saved)}));
        assert.deepEqual(loaded, {5: {last: "2026-10-07", streak: 3}}, JSON.stringify(solution));
    }
});
