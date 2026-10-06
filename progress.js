import {addDays} from "./dates.js";

// Daily progress, kept per size: the last day won and the streak up to it.
//   {"5": {last: "2026-10-07", streak: 3}, ...}
// Every function is pure except load/save, which take the storage to use.

const KEY = "qup-progress-v1";
const SIZES = [3, 5, 7];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function recordWin(progress, size, today) {
    const entry = progress[size];
    if (entry?.last === today) return progress;
    const streak = entry?.last === addDays(today, -1) ? entry.streak + 1 : 1;
    return {...progress, [size]: {last: today, streak}};
}

// The streak while it is alive (won today or yesterday), else 0.
export function streakFor(progress, size, today) {
    const entry = progress[size];
    if (!entry) return 0;
    return entry.last === today || entry.last === addDays(today, -1) ? entry.streak : 0;
}

export const isDone = (progress, size, today) => progress[size]?.last === today;

export function loadProgress(storage) {
    try {
        const parsed = JSON.parse(storage.getItem(KEY) ?? "{}");
        const progress = {};
        for (const size of SIZES) {
            const entry = parsed?.[size];
            if (entry && DATE.test(entry.last) && Number.isInteger(entry.streak) && entry.streak > 0) {
                progress[size] = {last: entry.last, streak: entry.streak};
            }
        }
        return progress;
    } catch {
        return {};
    }
}

export function saveProgress(storage, progress) {
    try {
        storage.setItem(KEY, JSON.stringify(progress));
        return true;
    } catch {
        return false;
    }
}

// The page's localStorage, or null if the browser blocks it.
export function browserStorage() {
    try {
        return window.localStorage ?? null;
    } catch {
        return null;
    }
}
