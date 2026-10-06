import test from "node:test";
import assert from "node:assert/strict";
import {easternDateString, msUntilNextEasternMidnight, addDays, formatDay, formatCountdown} from "./dates.js";

const at = iso => new Date(iso);

test("the date changes at midnight Eastern, in summer (EDT, UTC-4)", () => {
    assert.equal(easternDateString(at("2026-10-07T03:59:59Z")), "2026-10-06");
    assert.equal(easternDateString(at("2026-10-07T04:00:00Z")), "2026-10-07");
});

test("the date changes at midnight Eastern, in winter (EST, UTC-5)", () => {
    assert.equal(easternDateString(at("2026-12-07T04:59:59Z")), "2026-12-06");
    assert.equal(easternDateString(at("2026-12-07T05:00:00Z")), "2026-12-07");
});

test("the date is right on the day clocks go forward (Mar 8) and back (Nov 1)", () => {
    assert.equal(easternDateString(at("2026-03-08T04:59:59Z")), "2026-03-07");
    assert.equal(easternDateString(at("2026-03-08T05:00:00Z")), "2026-03-08");
    assert.equal(easternDateString(at("2026-11-01T03:59:59Z")), "2026-10-31");
    assert.equal(easternDateString(at("2026-11-01T04:00:00Z")), "2026-11-01");
    // the repeated hour does not change the date
    assert.equal(easternDateString(at("2026-11-01T06:30:00Z")), "2026-11-01");
});

test("time until the next Eastern midnight", () => {
    assert.equal(msUntilNextEasternMidnight(at("2026-10-07T03:59:30Z")), 30 * 1000);
    assert.equal(msUntilNextEasternMidnight(at("2026-10-07T04:00:00Z")), 24 * 3600 * 1000);
    assert.equal(msUntilNextEasternMidnight(at("2026-10-07T16:00:00Z")), 12 * 3600 * 1000);
});

test("time until midnight is right on a 23-hour day and a 25-hour day", () => {
    assert.equal(msUntilNextEasternMidnight(at("2026-03-08T05:00:00Z")), 23 * 3600 * 1000);
    assert.equal(msUntilNextEasternMidnight(at("2026-11-01T04:00:00Z")), 25 * 3600 * 1000);
});

test("addDays steps through the calendar, including month, year and leap-day edges", () => {
    assert.equal(addDays("2026-10-07", -1), "2026-10-06");
    assert.equal(addDays("2026-10-07", 1), "2026-10-08");
    assert.equal(addDays("2026-03-01", -1), "2026-02-28");
    assert.equal(addDays("2024-03-01", -1), "2024-02-29");
    assert.equal(addDays("2026-01-01", -1), "2025-12-31");
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
    assert.equal(addDays("2026-10-07", 0), "2026-10-07");
});

test("formatDay gives a short month and day", () => {
    assert.equal(formatDay("2026-10-07"), "Oct 7");
    assert.equal(formatDay("2026-01-05"), "Jan 5");
    assert.equal(formatDay("2026-12-31"), "Dec 31");
});

test("the countdown reads in hours and minutes", () => {
    assert.equal(formatCountdown(3 * 3600 * 1000 + 12 * 60 * 1000 + 59 * 1000), "3h 12m");
    assert.equal(formatCountdown(3600 * 1000), "1h 0m");
    assert.equal(formatCountdown(59 * 60 * 1000), "59m");
    assert.equal(formatCountdown(60 * 1000), "1m");
    assert.equal(formatCountdown(59 * 1000), "less than a minute");
    assert.equal(formatCountdown(0), "less than a minute");
    assert.equal(formatCountdown(25 * 3600 * 1000), "25h 0m");
});
