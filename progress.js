import {addDays} from "./dates.js";

// Daily progress, kept per size: the last day won and the streak up to it.
//   {"5": {last: "2026-10-07", streak: 3}, ...}
// Every function is pure except load/save, which take the storage to use.

const KEY = "qup-progress-v1";
const SIZES = [3, 5, 7];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const copySolution = solution => solution.map(({x, y, kind}) => ({x, y, kind}));

// `solution` is the pieces the player needed to win, [{x, y, kind}]. Solutions are
// kept by how many pieces they use, so each different way found is remembered:
//   {last, streak, solutions: {"5": [...], "3": [...]}}
// The first win of a day sets the streak; finding more ways later never touches it.
export function recordWin(progress, size, today, solution = []) {
    const entry = progress[size];
    if (entry?.last === today) return progress;
    // a tab left open past midnight winning yesterday's puzzle must not reset today's streak
    if (entry && today < entry.last) return progress;
    const streak = entry?.last === addDays(today, -1) ? entry.streak + 1 : 1;
    return {...progress, [size]: {last: today, streak, ...(solution.length > 0 && {solutions: {[solution.length]: copySolution(solution)}})}};
}

// Remembers one more way of solving today's puzzle (the first found with that many pieces).
export function addSolution(progress, size, today, solution) {
    const entry = progress[size];
    if (entry?.last !== today || solution.length === 0 || entry.solutions?.[solution.length]) return progress;
    return {...progress, [size]: {...entry, solutions: {...entry.solutions, [solution.length]: copySolution(solution)}}};
}

// How many pieces each of today's found solutions uses, fewest first.
export function foundCounts(progress, size, today) {
    const entry = progress[size];
    if (entry?.last !== today || !entry.solutions) return [];
    return Object.keys(entry.solutions).map(Number).sort((a, b) => a - b);
}

// The solution found today that uses the fewest pieces, or [] if none.
export function cheapestSolution(progress, size, today) {
    const [fewest] = foundCounts(progress, size, today);
    return fewest === undefined ? [] : progress[size].solutions[fewest];
}

// A saved solution is only kept if every piece is a whole cell on this size's board.
const validSolution = (solution, size) => Array.isArray(solution) && solution.length > 0 && solution.every(piece =>
    piece && Number.isInteger(piece.x) && Number.isInteger(piece.y) &&
    piece.x >= 0 && piece.x < size && piece.y >= 0 && piece.y < size && typeof piece.kind === "string");

// Reads saved solutions, dropping any that are damaged or filed under the wrong
// piece count. An older save had one `solution`; it becomes one found solution.
function readSolutions(entry, size) {
    const found = {};
    const candidates = entry.solutions && typeof entry.solutions === "object" && !Array.isArray(entry.solutions)
        ? Object.entries(entry.solutions)
        : [];
    if (validSolution(entry.solution, size)) candidates.push([String(entry.solution.length), entry.solution]);
    for (const [count, solution] of candidates) {
        if (validSolution(solution, size) && Number(count) === solution.length && !found[solution.length]) {
            found[solution.length] = solution.map(({x, y, kind}) => ({x, y, kind}));
        }
    }
    return found;
}

// The streak while it is alive (won today or yesterday), else 0.
export function streakFor(progress, size, today) {
    const entry = progress[size];
    if (!entry) return 0;
    return entry.last === today || entry.last === addDays(today, -1) ? entry.streak : 0;
}

// What storage has wins; the in-memory copy only fills in what storage lacks
// (another tab may have saved since this page loaded, or storage may be blocked).
export const mergeProgress = (inMemory, stored) => ({...inMemory, ...stored});

export const isDone = (progress, size, today) => progress[size]?.last === today;

export function loadProgress(storage) {
    try {
        const parsed = JSON.parse(storage.getItem(KEY) ?? "{}");
        const progress = {};
        for (const size of SIZES) {
            const entry = parsed?.[size];
            if (entry && DATE.test(entry.last) && Number.isInteger(entry.streak) && entry.streak > 0) {
                progress[size] = {last: entry.last, streak: entry.streak};
                const solutions = readSolutions(entry, size);
                if (Object.keys(solutions).length > 0) progress[size].solutions = solutions;
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
