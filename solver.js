import {cloneGrid, simulate} from "./engine.js";
import {makeEmptyNode} from "./node.js";

// Brute-force puzzle checker (not used by the game): tries every way of
// placing each hand piece on an empty cell (or leaving it unplaced) and
// returns the winning layouts. Layouts are compared as sets, so swapping two
// identical pieces counts once.
export function solve(grid, pool, gridScale, maxSolutions = Infinity) {
    const cells = [];
    for (let x = 0; x < gridScale; x++) {
        for (let y = 0; y < gridScale; y++) {
            if (grid[x][y].isEmpty) cells.push({x, y});
        }
    }
    const solutions = new Map();
    const work = cloneGrid(grid, gridScale);

    function place(index, used) {
        if (solutions.size >= maxSolutions) return;
        if (index === pool.length) {
            const trial = cloneGrid(work, gridScale);
            if (simulate(trial, gridScale).won) {
                const layout = [];
                for (const c of cells) {
                    const n = work[c.x][c.y];
                    if (!n.isEmpty) layout.push({x: c.x, y: c.y, id: n.id});
                }
                const key = layout.map(l => `${l.x},${l.y}:${l.id}`).sort().join("|");
                solutions.set(key, layout);
            }
            return;
        }
        place(index + 1, used); // leave this piece in hand
        for (const c of cells) {
            if (used.has(`${c.x},${c.y}`)) continue;
            work[c.x][c.y] = pool[index].clone();
            used.add(`${c.x},${c.y}`);
            place(index + 1, used);
            used.delete(`${c.x},${c.y}`);
            work[c.x][c.y] = makeEmptyNode();
        }
    }
    place(0, new Set());
    return [...solutions.values()];
}
