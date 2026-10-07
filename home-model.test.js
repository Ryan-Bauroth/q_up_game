import test from "node:test";
import assert from "node:assert/strict";
import {cardModel, toRoman} from "./home-model.js";

test("toRoman writes whole numbers as Roman numerals", () => {
    const expected = {1: "I", 2: "II", 3: "III", 4: "IV", 5: "V", 6: "VI", 9: "IX", 10: "X", 14: "XIV", 19: "XIX", 40: "XL",
        49: "XLIX", 90: "XC", 99: "XCIX", 400: "CD", 444: "CDXLIV", 900: "CM", 1994: "MCMXCIV", 2026: "MMXXVI", 3999: "MMMCMXCIX"};
    for (const [number, numeral] of Object.entries(expected)) assert.equal(toRoman(Number(number)), numeral, number);
});

test("toRoman gives null for what has no numeral (zero, negatives, fractions, 4000 and up)", () => {
    for (const value of [0, -1, 1.5, 4000, 12345, NaN, undefined, null, "6"]) assert.equal(toRoman(value), null, String(value));
});

test("a card for a mode that has not been played", () => {
    const card = cardModel({size: 5, progress: {}, today: "2026-10-07"});
    assert.deepEqual(card, {
        size: 5,
        title: "5 × 5",
        label: "the classic",
        done: false,
        streak: 0,
        roman: null,
        solution: [],
        pieces: null,
        streakText: "no streak yet",
        playLabel: "Play",
        dailyHref: "play.html?size=5&mode=daily",
        unlimitedHref: "play.html?size=5&mode=unlimited",
    });
});

test("a card for a mode finished today shows Review and the streak as a Roman numeral", () => {
    const progress = {3: {last: "2026-10-07", streak: 6}};
    const card = cardModel({size: 3, progress, today: "2026-10-07"});
    assert.equal(card.done, true);
    assert.equal(card.playLabel, "Review");
    assert.equal(card.streak, 6);
    assert.equal(card.roman, "VI");
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

test("a finished card carries the player's cheapest solution and how many pieces it uses", () => {
    const four = [{x: 0, y: 1, kind: "burster"}, {x: 1, y: 1, kind: "octo"}, {x: 2, y: 1, kind: "tee"}, {x: 0, y: 2, kind: "cross"}];
    const two = [{x: 0, y: 1, kind: "burster"}, {x: 1, y: 1, kind: "octo"}];
    const progress = {3: {last: "2026-10-07", streak: 2, solutions: {4: four, 2: two}}};
    const done = cardModel({size: 3, progress, today: "2026-10-07"});
    assert.deepEqual(done.solution, two);
    assert.equal(done.pieces, 2);
    // yesterday's solutions are not today's
    const old = cardModel({size: 3, progress, today: "2026-10-08"});
    assert.deepEqual(old.solution, []);
    assert.equal(old.pieces, null);
    // finished before solutions were saved
    const bare = cardModel({size: 3, progress: {3: {last: "2026-10-07", streak: 2}}, today: "2026-10-07"});
    assert.deepEqual(bare.solution, []);
    assert.equal(bare.pieces, null);
});
