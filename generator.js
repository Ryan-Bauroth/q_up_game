import {cloneGrid, simulate} from "./engine.js";
import {ABILITIES, TRIGGERS} from "./abilities.js";
import {buildFromDefinition, testedKinds, KINDS, PUZZLE_SIZE} from "./puzzles.js";
import {isSensible} from "./lint.js";
import {scorePuzzle} from "./score.js";

// Random puzzle generator. A puzzle is completable BY CONSTRUCTION: it first
// lays out every piece (locked ones and the hand) at random cells, runs the
// simulation, and keeps the layout only if every piece ends up used. The cells
// the chain hit, but that held no piece, become locked receivers with exactly
// the charge needed. That layout is a built-in solution, which is then
// re-checked against the real engine before the puzzle is returned.

// Only pieces from the play-tested levels (1-6) are used: nothing fancy (no
// row sweeps, no pieces that haven't been tried yet).
const isStarterKind = kind => KINDS[kind].abilities.some(id => ABILITIES[id]?.trigger === TRIGGERS.ON_RUN);
const TESTED_LEVELS = 6;

export function allowedKinds() {
    const all = [...testedKinds(TESTED_LEVELS)];
    return {
        starters: all.filter(isStarterKind),
        reactors: all.filter(kind => !isStarterKind(kind)),
    };
}

// Count of times each empty cell is targeted in a simulation trace.
function emptyCellHits(grid, trace) {
    const hits = new Map();
    for (const step of trace) {
        for (const t of step.targets) {
            if (grid[t.x][t.y].isEmpty) {
                const key = `${t.x},${t.y}`;
                hits.set(key, (hits.get(key) || 0) + 1);
            }
        }
    }
    return hits;
}

// True if the piece, put at (x, y), would reach some other cell on the board.
function reachesBoard(kind, x, y) {
    const board = {gridScale: PUZZLE_SIZE};
    return KINDS[kind].abilities.some(id => ABILITIES[id].target(x, y, board).some(t =>
        t.x >= 0 && t.x < PUZZLE_SIZE && t.y >= 0 && t.y < PUZZLE_SIZE && !(t.x === x && t.y === y)));
}

export function generateDefinition({rng = Math.random, handSize = 5, minActivations = 12, maxAttempts = 80000} = {}) {
    const size = PUZZLE_SIZE;
    const {starters: STARTER_KINDS, reactors: REACTOR_KINDS} = allowedKinds();
    const pick = list => list[Math.floor(rng() * list.length)];
    const shuffle = list => {
        for (let i = list.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [list[i], list[j]] = [list[j], list[i]];
        }
        return list;
    };

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        // ask for a little less if the first tries keep missing
        const wanted = Math.max(6, minActivations - Math.floor(attempt / 15000));

        // 1-2 of the hand pieces are spares: the puzzle is solved without them.
        const spares = 1 + Math.floor(rng() * 2);
        const placed = [pick(STARTER_KINDS)];
        while (placed.length < handSize - spares) placed.push(rng() < 0.12 ? pick(STARTER_KINDS) : pick(REACTOR_KINDS));
        const spareKinds = [];
        while (spareKinds.length < spares) spareKinds.push(rng() < 0.2 ? pick(STARTER_KINDS) : pick(REACTOR_KINDS));
        const hand = shuffle([...placed, ...spareKinds]);
        const lockedKinds = [pick(STARTER_KINDS)];
        if (rng() < 0.7) lockedKinds.push(pick(REACTOR_KINDS));
        if (rng() < 0.3) lockedKinds.push(pick(REACTOR_KINDS));

        const cells = [];
        for (let x = 0; x < size; x++) for (let y = 0; y < size; y++) cells.push({x, y});
        shuffle(cells);
        // a piece only goes where it reaches at least one cell on the board
        const place = kinds => {
            const out = [];
            for (const kind of kinds) {
                const i = cells.findIndex(c => reachesBoard(kind, c.x, c.y));
                if (i < 0) return null;
                out.push({kind, ...cells.splice(i, 1)[0]});
            }
            return out;
        };
        const lockedPlaced = place(lockedKinds);
        const handPlaced = lockedPlaced && place(placed);
        if (!handPlaced) continue;

        // Lay everything out and run it.
        const probe = buildFromDefinition({
            locked: [...lockedPlaced.map(p => [p.x, p.y, p.kind, 1]), ...handPlaced.map(p => [p.x, p.y, p.kind, 1])],
            hand: [],
        });
        const sim = cloneGrid(probe.grid, size);
        const {trace} = simulate(sim, size);

        // every piece must have been used
        let allUsed = true;
        for (const p of [...lockedPlaced, ...handPlaced]) {
            if (sim[p.x][p.y].charges > 0) allUsed = false;
        }
        if (!allUsed) continue;

        const hits = emptyCellHits(probe.grid, trace);
        const receivers = [...hits.entries()];
        if (receivers.length < 3 || receivers.length > 7) continue;
        if (receivers.some(([, count]) => count > 3)) continue;
        if (!receivers.some(([, count]) => count >= 2)) continue;
        const activations = trace.reduce((n, s) => n + s.targets.filter(t => t.consumed).length, 0)
            + receivers.reduce((n, [, count]) => n + count, 0);
        if (activations < wanted) continue;

        const definition = {
            name: "Random",
            locked: [
                ...lockedPlaced.map(p => [p.x, p.y, p.kind, 1]),
                ...receivers.map(([key, count]) => [...key.split(",").map(Number), "receiver", count]),
            ],
            hand,
            solution: handPlaced.map(p => ({x: p.x, y: p.y, kind: p.kind})),
        };

        // Re-check against the real engine and weed out pointless pieces.
        if (!isSensible(definition)) continue;
        return definition;
    }
    throw new Error("could not generate a puzzle");
}

// Builds candidates in small steps (so the page can stay responsive) and keeps
// the best-scoring one.
export function startBest({candidates = 60, ...options} = {}) {
    let best = null;
    let made = 0;
    return {
        step(count) {
            for (let i = 0; i < count && made < candidates; i++, made++) {
                const definition = generateDefinition(options);
                const {total} = scorePuzzle(definition);
                if (!best || total > best.total) best = {definition, total};
            }
            return made >= candidates;
        },
        result: () => best.definition,
    };
}

export function generateBest(options = {}) {
    const run = startBest(options);
    while (!run.step(10)) { /* keep building */ }
    return run.result();
}
