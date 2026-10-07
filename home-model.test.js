import test from "node:test";
import assert from "node:assert/strict";
import {cardModel, tallyGroups, MAX_TALLY} from "./home-model.js";

test("tally marks come in groups of five", () => {
    assert.deepEqual(tallyGroups(0), []);
    assert.deepEqual(tallyGroups(1), [1]);
    assert.deepEqual(tallyGroups(4), [4]);
    assert.deepEqual(tallyGroups(5), [5]);
    assert.deepEqual(tallyGroups(6), [5, 1]);
    assert.deepEqual(tallyGroups(12), [5, 5, 2]);
});

test("tally marks stop at a cap (the card then shows the number)", () => {
    assert.equal(MAX_TALLY, 25);
    assert.deepEqual(tallyGroups(25), [5, 5, 5, 5, 5]);
    assert.deepEqual(tallyGroups(99), [5, 5, 5, 5, 5]);
});

test("a card for a mode that has not been played", () => {
    const card = cardModel({size: 5, progress: {}, today: "2026-10-07"});
    assert.deepEqual(card, {
        size: 5,
        title: "5 × 5",
        label: "the classic",
        done: false,
        streak: 0,
        tally: [],
        solution: [],
        streakText: "no streak yet",
        playLabel: "Play",
        dailyHref: "play.html?size=5&mode=daily",
        unlimitedHref: "play.html?size=5&mode=unlimited",
    });
});

test("a card for a mode finished today shows Review, the streak and tally", () => {
    const progress = {3: {last: "2026-10-07", streak: 6}};
    const card = cardModel({size: 3, progress, today: "2026-10-07"});
    assert.equal(card.done, true);
    assert.equal(card.playLabel, "Review");
    assert.equal(card.streak, 6);
    assert.deepEqual(card.tally, [5, 1]);
    assert.equal(card.streakText, "6 days");
    assert.equal(card.label, "the mini");
});

test("yesterday's win keeps the streak alive but the day is not done", () => {
    const progress = {7: {last: "2026-10-06", streak: 2}};
    const card = cardModel({size: 7, progress, today: "2026-10-07"});
    assert.equal(card.done, false);
    assert.equal(card.playLabel, "Play");
    assert.equal(card.streak, 2);
    assert.equal(card.label, "the big one");
});

test("a broken streak reads as none", () => {
    const progress = {5: {last: "2026-10-01", streak: 9}};
    const card = cardModel({size: 5, progress, today: "2026-10-07"});
    assert.equal(card.streak, 0);
    assert.equal(card.streakText, "no streak yet");
});

test("one day reads as '1 day'", () => {
    const card = cardModel({size: 5, progress: {5: {last: "2026-10-07", streak: 1}}, today: "2026-10-07"});
    assert.equal(card.streakText, "1 day");
});

test("a finished card carries the player's own solution; an unfinished one carries none", () => {
    const solution = [{x: 0, y: 1, kind: "burster"}];
    const done = cardModel({size: 3, progress: {3: {last: "2026-10-07", streak: 2, solution}}, today: "2026-10-07"});
    assert.deepEqual(done.solution, solution);
    // yesterday's solution is not today's
    const old = cardModel({size: 3, progress: {3: {last: "2026-10-06", streak: 2, solution}}, today: "2026-10-07"});
    assert.deepEqual(old.solution, []);
    // finished before solutions were saved
    const bare = cardModel({size: 3, progress: {3: {last: "2026-10-07", streak: 2}}, today: "2026-10-07"});
    assert.deepEqual(bare.solution, []);
});
