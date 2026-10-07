import {dailyDefinition} from "./daily.js";

// The pre-built daily puzzles: dailies.json, written by tools/build-dailies.mjs.
//   {version: 1, puzzles: {"2026-10-07": {"5": {attempt, definition, solutions}}}}
// `solutions` is the full list of ways to solve the puzzle (each a list of
// {x, y, kind}), largest first. A day that is not in the file (the list ran out,
// or the file did not load) falls back to the live seeded puzzle, which has no
// solution list.

const validPiece = piece => piece && Number.isInteger(piece.x) && Number.isInteger(piece.y) && typeof piece.kind === "string";

export function pickDaily(file, date, size) {
    const entry = file?.puzzles?.[date]?.[size];
    const definition = entry?.definition;
    if (!definition || definition.size !== size || !Array.isArray(definition.locked) || !Array.isArray(definition.hand) || !Array.isArray(definition.solution)) return null;
    const solutions = entry.solutions;
    if (!Array.isArray(solutions) || solutions.length === 0) return null;
    if (!solutions.every(solution => Array.isArray(solution) && solution.length > 0 && solution.every(validPiece))) return null;
    return {definition, solutions};
}

// {definition, solutions}: from the file if it has the day, else the live puzzle
// (solutions: null).
export function getDaily(file, date, size) {
    return pickDaily(file, date, size) ?? {definition: dailyDefinition(date, size), solutions: null};
}

// Fetches the file. Gives null if it is missing or damaged, so the game still works.
export async function loadDailyFile(url = "dailies.json", fetchFile = fetch) {
    try {
        const response = await fetchFile(url);
        if (!response.ok) return null;
        const file = await response.json();
        return file && typeof file === "object" && file.puzzles ? file : null;
    } catch {
        return null;
    }
}
