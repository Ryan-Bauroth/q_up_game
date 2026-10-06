import test from "node:test";
import assert from "node:assert/strict";
import {recordWin, streakFor, isDone, loadProgress, saveProgress, browserStorage} from "./progress.js";

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
