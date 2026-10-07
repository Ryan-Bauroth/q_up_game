import test from "node:test";
import assert from "node:assert/strict";
import {buildDaily, wantedSolutions} from "./daily-builder.js";
import {findSolutions, solutionKey} from "../solutions.js";
import {isSensible} from "../lint.js";

test("3x3 dailies want 2 solutions and the others want 3", () => {
    assert.equal(wantedSolutions(3), 2);
    assert.equal(wantedSolutions(5), 3);
    assert.equal(wantedSolutions(7), 3);
});

for (const size of [3, 5]) {
    test(`a ${size}x${size} daily has exactly the wanted solutions, with different piece counts, the main using every piece`, () => {
        const built = buildDaily("2026-10-07", size, {maxCandidates: 20000, perCandidateMs: 5000});
        assert.ok(built, "found nothing");
        const {definition, solutions, attempt} = built;
        assert.equal(definition.size, size);
        assert.equal(definition.name, "Daily 2026-10-07");
        assert.equal(isSensible(definition), true);
        // no spares: the hand is exactly the main solution
        assert.equal(definition.hand.length, definition.solution.length);
        assert.equal(solutions.length, wantedSolutions(size));
        const counts = solutions.map(solution => solution.length);
        assert.equal(new Set(counts).size, counts.length, `piece counts ${counts}`);
        assert.equal(counts[0], definition.hand.length);          // largest first, and it uses every piece
        assert.ok(counts.every((count, i) => i === 0 || count < counts[i - 1]));
        assert.ok(Number.isInteger(attempt) && attempt >= 0);
        // the stored list is the complete list: solving again gives the same ways
        const again = findSolutions(definition);
        assert.equal(again.complete, true);
        assert.deepEqual(again.solutions.map(solutionKey), solutions.map(solutionKey));
    });
}

test("building the same day twice gives the same puzzle", () => {
    const a = buildDaily("2026-10-08", 3, {maxCandidates: 20000, perCandidateMs: 5000});
    const b = buildDaily("2026-10-08", 3, {maxCandidates: 20000, perCandidateMs: 5000});
    assert.deepEqual(a, b);
});

test("different days give different puzzles", () => {
    const a = buildDaily("2026-10-07", 5, {maxCandidates: 20000, perCandidateMs: 5000});
    const b = buildDaily("2026-10-08", 5, {maxCandidates: 20000, perCandidateMs: 5000});
    assert.notDeepEqual(a.definition.locked, b.definition.locked);
});

test("it gives up (null) when no candidate is allowed", () => {
    assert.equal(buildDaily("2026-10-07", 5, {maxCandidates: 0, perCandidateMs: 5000}), null);
});

test("every accepted puzzle's largest solution uses every hand piece", () => {
    for (const size of [3, 5]) {
        for (const date of ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"]) {
            const built = buildDaily(date, size, {maxCandidates: 20000, perCandidateMs: 5000});
            assert.ok(built, `${date} ${size}`);
            assert.equal(built.solutions[0].length, built.definition.hand.length, `${date} ${size}`);
        }
    }
});
