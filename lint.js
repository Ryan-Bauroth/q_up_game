import {cloneGrid, simulate} from "./engine.js";
import {buildFromDefinition, makePiece, PUZZLE_SIZE} from "./puzzles.js";

// Sanity gate for generated puzzles: rejects boards with pointless pieces.

// The board with the stored solution placed, leaving out solution piece
// `skip` if given. null if a solution piece sits on an occupied cell.
export function layout(definition, skip = -1) {
    const {grid} = buildFromDefinition(definition);
    for (let i = 0; i < definition.solution.length; i++) {
        if (i === skip) continue;
        const {x, y, kind} = definition.solution[i];
        if (!grid[x][y].isEmpty) return null;
        grid[x][y] = makePiece(kind, 1, false, false);
    }
    return grid;
}

const run = grid => simulate(cloneGrid(grid, PUZZLE_SIZE), PUZZLE_SIZE);

export function isSensible(definition) {
    const full = layout(definition);
    if (!full) return false;
    const result = run(full);
    if (!result.won) return false;
    // not already solved before anything is placed
    if (run(buildFromDefinition(definition).grid).won) return false;
    // every placed piece is needed
    for (let i = 0; i < definition.solution.length; i++) {
        if (run(layout(definition, i)).won) return false;
    }
    // every piece that has an output must actually activate something
    for (let x = 0; x < PUZZLE_SIZE; x++) {
        for (let y = 0; y < PUZZLE_SIZE; y++) {
            const node = full[x][y];
            if (node.isEmpty || node.abilities.length === 0) continue;
            const useful = result.trace.some(s =>
                s.sourceX === x && s.sourceY === y && s.targets.some(t => t.consumed));
            if (!useful) return false;
        }
    }
    return true;
}
