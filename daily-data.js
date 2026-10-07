import {dailyDefinition} from "./daily.js";
import {KINDS, buildFromDefinition} from "./puzzles.js";
import {validatePuzzle} from "./rules.js";

// The pre-built daily puzzles: dailies.json, written by tools/build-dailies.mjs.
//   {version: 1, puzzles: {"2026-10-07": {"5": {attempt, definition, solutions}}}}
// `solutions` is the full list of ways to solve the puzzle (each a list of
// {x, y, kind}), largest first. A day that is not in the file (the list ran out,
// or the file did not load) falls back to the live seeded puzzle, which has no
// solution list.

const knownKind = kind => typeof kind === "string" && Object.hasOwn(KINDS, kind);
const inRange = (n, size) => Number.isInteger(n) && n >= 0 && n < size;
const validPiece = (piece, size) => piece && inRange(piece.x, size) && inRange(piece.y, size) && knownKind(piece.kind);
const validLocked = (locked, size) => Array.isArray(locked) && inRange(locked[0], size) && inRange(locked[1], size) &&
    knownKind(locked[2]) && (locked[3] === undefined || (Number.isInteger(locked[3]) && locked[3] > 0));

export function pickDaily(file, date, size) {
    const entry = file?.puzzles?.[date]?.[size];
    const definition = entry?.definition;
    if (!definition || definition.size !== size || !Array.isArray(definition.locked) || !Array.isArray(definition.hand) || !Array.isArray(definition.solution)) return null;
    if (!definition.locked.every(locked => validLocked(locked, size))) return null;
    if (!definition.hand.every(knownKind)) return null;
    if (!definition.solution.every(piece => validPiece(piece, size))) return null;
    const solutions = entry.solutions;
    if (!Array.isArray(solutions) || solutions.length === 0) return null;
    if (!solutions.every(solution => Array.isArray(solution) && solution.length > 0 && solution.every(piece => validPiece(piece, size)))) return null;
    if (new Set(solutions.map(solution => solution.length)).size !== solutions.length) return null;
    try {
        const {grid, pool} = buildFromDefinition(definition);
        validatePuzzle(grid, pool);
    } catch {
        return null;
    }
    return {definition, solutions};
}

// {definition, solutions}: from the file if it has the day, else the live puzzle
// (solutions: null).
export function getDaily(file, date, size) {
    return pickDaily(file, date, size) ?? {definition: dailyDefinition(date, size), solutions: null};
}

// Fetches the file. Gives null if it is missing or damaged, so the game still works.
export async function loadDailyFile(url = "dailies.json", fetchFile = globalThis.fetch) {
    try {
        const options = {cache: "no-cache"};
        if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) options.signal = AbortSignal.timeout(5000);
        const response = await fetchFile(url, options);
        if (!response.ok) return null;
        const file = await response.json();
        return file && typeof file === "object" && file.puzzles ? file : null;
    } catch {
        return null;
    }
}
