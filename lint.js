import {cloneGrid, simulate} from "./engine.js";
import {buildFromDefinition, makePiece, sizeOf} from "./puzzles.js";

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

const run = (grid, size) => simulate(cloneGrid(grid, size), size);

export function isSensible(definition) {
    const size = sizeOf(definition);
    const full = layout(definition);
    if (!full) return false;
    const result = run(full, size);
    if (!result.won) return false;
    // not already solved before anything is placed
    if (run(buildFromDefinition(definition).grid, size).won) return false;
    // every placed piece is needed
    for (let i = 0; i < definition.solution.length; i++) {
        if (run(layout(definition, i), size).won) return false;
    }
    // every piece that has an output must actually activate something
    for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
            const node = full[x][y];
            if (node.isEmpty || node.abilities.length === 0) continue;
            const useful = result.trace.some(s =>
                s.sourceX === x && s.sourceY === y && s.targets.some(t => t.consumed));
            if (!useful) return false;
        }
    }
    return true;
}
