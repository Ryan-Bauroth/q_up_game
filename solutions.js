import {cloneGrid, simulate} from "./engine.js";
import {buildFromDefinition, makePiece, sizeOf, KINDS} from "./puzzles.js";
import {ABILITIES, TRIGGERS} from "./abilities.js";

// Solutions of a puzzle. A solution is a set of hand pieces on empty cells that
// wins AND in which every piece is needed (take any one away and it loses), so
// decoy pieces never count. Hand pieces need no activations, so adding a piece
// can never make a win a loss. A needed piece that is not a starter must be hit by
// the chain, so only the empty cells the chain reaches are tried for it; a starter
// fires by itself when Run is pressed, so it can go on any empty cell. Together that
// makes the search below complete (checked against an exhaustive search in the tests).
const isStarterKind = kind => KINDS[kind].abilities.some(id => ABILITIES[id]?.trigger === TRIGGERS.ON_RUN);

export const solutionKey = pieces => pieces.map(p => `${p.x},${p.y}:${p.kind}`).sort().join("|");

const byCell = (a, b) => a.x - b.x || a.y - b.y || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0);

// Runs the puzzle's locked pieces plus `pieces` (as hand pieces) from scratch.
function makeRunner(definition) {
    const size = sizeOf(definition);
    const {grid: base} = buildFromDefinition({...definition, hand: []});
    return pieces => {
        const grid = cloneGrid(base, size);
        for (const {x, y, kind} of pieces) grid[x][y] = makePiece(kind, 1, false, false);
        return simulate(grid, size);   // {trace, finalGrid, won}
    };
}

// The smallest subset of `placed` that still wins, or null if it does not win.
// This is what a player's solution "uses": decoys they put down do not count.
export function minimalSubset(definition, placed) {
    const run = makeRunner(definition);
    for (let count = 1; count <= placed.length; count++) {
        const found = firstWinningCombination(placed, count, subset => run(subset).won);
        if (found) return found.sort(byCell);
    }
    return null;
}

function firstWinningCombination(items, count, wins, start = 0, chosen = []) {
    if (chosen.length === count) return wins(chosen) ? [...chosen] : null;
    for (let i = start; i < items.length; i++) {
        const found = firstWinningCombination(items, count, wins, i + 1, [...chosen, items[i]]);
        if (found) return found;
    }
    return null;
}

export function countPieces(definition, placed) {
    return minimalSubset(definition, placed)?.length ?? null;
}

// Every solution of the puzzle, largest first. `complete` is false only if a
// limit stopped the search early: `maxSolutions` (stop once that many are found)
// or `timeLimitMs`.
export function findSolutions(definition, {maxSolutions = Infinity, timeLimitMs = Infinity} = {}) {
    const size = sizeOf(definition);
    const run = makeRunner(definition);
    const available = {};
    for (const kind of definition.hand) available[kind] = (available[kind] ?? 0) + 1;
    const kinds = Object.keys(available);
    const starters = kinds.filter(isStarterKind);
    const chainKinds = kinds.filter(kind => !isStarterKind(kind));
    const emptyCells = [];
    const baseGrid = run([]).finalGrid;
    for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
            if (baseGrid[x][y].isEmpty) emptyCells.push(x * size + y);
        }
    }
    const found = new Map();
    const seen = new Set();
    const started = performance.now();
    let stopped = false;

    function visit(placed) {
        if (stopped) return;
        const key = solutionKey(placed);
        if (seen.has(key)) return;
        seen.add(key);
        if (timeLimitMs !== Infinity && performance.now() - started > timeLimitMs) {
            stopped = true;
            return;
        }
        const result = run(placed);
        if (result.won && placed.length > 0) {
            // a win that holds a piece it does not need is not a solution
            if (placed.every((_, i) => !run(placed.filter((__, j) => j !== i)).won)) {
                found.set(key, [...placed].sort(byCell));
                if (found.size >= maxSolutions) stopped = true;
            }
            return;   // adding more pieces to a win can only add pieces that are not needed
        }
        if (placed.length === definition.hand.length) return;
        // a piece that is not a starter only matters if the chain reaches it: try the
        // empty cells the chain hits. A starter goes on any empty cell.
        const cells = new Set();
        for (const step of result.trace) {
            for (const t of step.targets) {
                if (result.finalGrid[t.x][t.y].isEmpty) cells.add(t.x * size + t.y);
            }
        }
        const used = {};
        for (const piece of placed) used[piece.kind] = (used[piece.kind] ?? 0) + 1;
        const taken = new Set(placed.map(p => p.x * size + p.y));
        for (const [list, options] of [[[...cells].sort((a, b) => a - b), chainKinds], [emptyCells.filter(cell => !taken.has(cell)), starters]]) {
            for (const cell of list) {
                const x = Math.floor(cell / size), y = cell % size;
                for (const kind of options) {
                    if ((used[kind] ?? 0) >= available[kind]) continue;
                    visit([...placed, {x, y, kind}]);
                }
            }
        }
    }
    visit([]);

    const solutions = [...found.values()].sort((a, b) => b.length - a.length || (solutionKey(a) < solutionKey(b) ? -1 : 1));
    return {solutions, complete: !stopped};
}
