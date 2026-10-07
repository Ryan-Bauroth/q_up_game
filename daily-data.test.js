import test from "node:test";
import assert from "node:assert/strict";
import {pickDaily, getDaily, loadDailyFile} from "./daily-data.js";
import {dailyDefinition} from "./daily.js";

const definition = {
    name: "Daily 2026-10-07",
    size: 3,
    locked: [[0, 0, "igniter", 1], [0, 2, "receiver", 1], [1, 1, "receiver", 1]],
    hand: ["burster", "pusher"],
    solution: [{x: 0, y: 1, kind: "burster"}],
};
const solutions = [[{x: 0, y: 1, kind: "burster"}]];
const file = {version: 1, puzzles: {"2026-10-07": {3: {attempt: 4, definition, solutions}}}};

test("pickDaily returns the pre-built puzzle and its solutions", () => {
    const picked = pickDaily(file, "2026-10-07", 3);
    assert.deepEqual(picked.definition, definition);
    assert.deepEqual(picked.solutions, solutions);
});

test("pickDaily gives null for a missing date, a missing size, or no file", () => {
    assert.equal(pickDaily(file, "2026-10-08", 3), null);
    assert.equal(pickDaily(file, "2026-10-07", 5), null);
    assert.equal(pickDaily(null, "2026-10-07", 3), null);
    assert.equal(pickDaily({}, "2026-10-07", 3), null);
});

test("pickDaily rejects entries that are damaged", () => {
    const bad = [
        {attempt: 1, definition: {...definition, size: 5}, solutions},          // wrong size
        {attempt: 1, definition: {...definition, hand: "x"}, solutions},        // hand is not a list
        {attempt: 1, definition: {...definition, locked: null}, solutions},
        {attempt: 1, definition, solutions: []},                                 // no solutions
        {attempt: 1, definition, solutions: [[{x: 0, y: 1}]]},                   // a piece with no kind
        {attempt: 1, definition, solutions: "oops"},
        {attempt: 1, definition: {...definition, locked: [[3, 0, "igniter", 1]]}, solutions},      // outside the board
        {attempt: 1, definition: {...definition, locked: [[0, 0, "wizard", 1]]}, solutions},       // unknown kind
        {attempt: 1, definition: {...definition, locked: [[0.5, 0, "igniter", 1]]}, solutions},    // not a whole cell
        {attempt: 1, definition: {...definition, locked: [[0, 0, "igniter", 0]]}, solutions},      // charges must be positive
        {attempt: 1, definition: {...definition, hand: ["burster", "wizard"]}, solutions},
        {attempt: 1, definition: {...definition, solution: undefined}, solutions},                 // no stored solution
        {attempt: 1, definition, solutions: [[{x: 3, y: 0, kind: "burster"}]]},                    // piece outside the board
        {attempt: 1, definition, solutions: [[{x: 0, y: 1, kind: "wizard"}]]},
        {attempt: 1, definition, solutions: [[{x: 0, y: 1, kind: "burster"}], [{x: 1, y: 0, kind: "burster"}]]},   // same count twice
        null,
    ];
    for (const entry of bad) {
        assert.equal(pickDaily({version: 1, puzzles: {"2026-10-07": {3: entry}}}, "2026-10-07", 3), null, JSON.stringify(entry));
    }
});

test("pickDaily accepts a valid 7x7 entry", () => {
    const big = {...definition, size: 7};
    const bigSolutions = [[{x: 0, y: 1, kind: "burster"}], [{x: 0, y: 1, kind: "burster"}, {x: 6, y: 6, kind: "pusher"}]];
    const picked = pickDaily({version: 1, puzzles: {"2026-10-07": {7: {attempt: 1, definition: big, solutions: bigSolutions}}}}, "2026-10-07", 7);
    assert.deepEqual(picked, {definition: big, solutions: bigSolutions});
});

test("getDaily uses the file when it has the day, and the live seeded puzzle when it does not", () => {
    assert.deepEqual(getDaily(file, "2026-10-07", 3), {definition, solutions});
    // not in the file: the live daily, with no list of solutions
    const live = getDaily(file, "2027-02-01", 5);
    assert.deepEqual(live, {definition: dailyDefinition("2027-02-01", 5), solutions: null});
    // no file at all
    assert.deepEqual(getDaily(null, "2027-02-01", 7), {definition: dailyDefinition("2027-02-01", 7), solutions: null});
});

test("loadDailyFile reads the file, and gives null if it cannot", async () => {
    const ok = await loadDailyFile("dailies.json", async url => ({ok: true, json: async () => ({url, ...file})}));
    assert.equal(ok.url, "dailies.json");
    assert.deepEqual(ok.puzzles, file.puzzles);
    assert.equal(await loadDailyFile("dailies.json", async () => ({ok: false, status: 404})), null);
    assert.equal(await loadDailyFile("dailies.json", async () => { throw new Error("offline"); }), null);
    assert.equal(await loadDailyFile("dailies.json", async () => ({ok: true, json: async () => { throw new Error("not json"); }})), null);
    assert.equal(await loadDailyFile("dailies.json", async () => ({ok: true, json: async () => "text"})), null);
});

test("loadDailyFile passes no-cache and a timeout signal, and a rejected fetch gives null", async () => {
    let seen;
    await loadDailyFile("dailies.json", async (url, options) => {
        seen = options;
        return {ok: true, json: async () => file};
    });
    assert.equal(seen.cache, "no-cache");
    if (AbortSignal.timeout) assert.ok(seen.signal instanceof AbortSignal);
    assert.equal(await loadDailyFile("dailies.json", () => Promise.reject(new Error("aborted"))), null);
});
