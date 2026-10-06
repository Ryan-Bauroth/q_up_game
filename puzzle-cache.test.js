import test from "node:test";
import assert from "node:assert/strict";
import {createPuzzleCache} from "./puzzle-cache.js";

// a fake builder that finishes after 3 steps, plus a scheduler we drive by hand
function setup(size = 2) {
    const jobs = [];
    let built = 0;
    const cache = createPuzzleCache({
        newRun: () => {
            let steps = 0;
            const name = `board ${++built}`;
            return {step: () => ++steps >= 3, result: () => ({name})};
        },
        quick: () => ({name: "quick"}),
        size,
        schedule: fn => jobs.push(fn),
    });
    const drain = () => { while (jobs.length) jobs.shift()(); };
    return {cache, jobs, drain};
}

test("nothing is built until fill() is called, then it builds in slices up to its size", () => {
    const {cache, jobs, drain} = setup(2);
    assert.equal(jobs.length, 0);
    cache.fill();
    assert.equal(jobs.length, 1);          // one slice at a time
    jobs.shift()();
    assert.equal(cache.ready, 0);          // not finished after one slice
    drain();
    assert.equal(cache.ready, 2);          // stops at its size
});

test("take() returns ready boards in order and starts refilling", () => {
    const {cache, jobs, drain} = setup(2);
    cache.fill();
    drain();
    assert.deepEqual(cache.take(), {name: "board 1"});
    assert.equal(jobs.length, 1);          // a refill is scheduled
    drain();
    assert.equal(cache.ready, 2);
});

test("take() on an empty cache falls back to quick()", () => {
    const {cache} = setup(2);
    assert.deepEqual(cache.take(), {name: "quick"});
});
