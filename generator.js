import {cloneGrid, simulate} from "./engine.js";
import {ABILITIES} from "./abilities.js";
import {buildFromDefinition, KINDS} from "./puzzles.js";
import {isSensible} from "./lint.js";

// Random puzzle generator. A puzzle is completable BY CONSTRUCTION: it grows a
// chain of pieces, each one placed on a cell that a piece already on the board
// will activate, so every piece gets used. The cells the chain hits that hold no
// piece become locked targets with exactly the charge needed. Some of the
// pieces then move into the hand as the solution (plus a spare or two), and the
// result is re-checked against the real engine.

export const SIZES = [3, 5, 7];

// Fixed lists (and a fixed order), so a seeded generator always gives the same
// puzzle. The Row piece is the Column piece turned sideways.
export const STARTER_KINDS = ["igniter", "pusher", "pulseLeft"];
export const REACTOR_KINDS = ["burster", "cross", "octo", "knight", "column", "pairV", "pairH", "tee", "spread", "leap", "row"];

// Per size: [min, max] pieces in the chain, how many of them go to the hand as
// the solution, how many starters, how many locked targets are allowed, and how
// many whole-line (Column / Row) pieces.
export const SIZE_CONFIG = {
    3: {pieces: [3, 4], hand: [1, 2], starters: 1, targets: [3, 5], beams: 1},
    5: {pieces: [6, 8], hand: [3, 4], starters: 1, targets: [5, 9], beams: 1},
    7: {pieces: [11, 15], hand: [5, 7], starters: 2, targets: [9, 14], beams: 2},
};

const isBeamKind = kind => KINDS[kind].abilities.some(id => ABILITIES[id].line);

// `spares` fixes how many spare hand pieces to add (default: 1 or 2 at random;
// 0 makes the hand exactly the solution). `config` overrides the size's recipe
// for this call only.
export function generateDefinition({size = 5, rng = Math.random, maxAttempts = 20000, spares: fixedSpares, config: configOverride} = {}) {
    const baseConfig = SIZE_CONFIG[size];
    const config = baseConfig && {...baseConfig, ...configOverride};
    if (!baseConfig) throw new Error(`unsupported puzzle size: ${size}`);

    const pick = list => list[Math.floor(rng() * list.length)];
    const between = ([min, max]) => min + Math.floor(rng() * (max - min + 1));
    const shuffle = list => {
        for (let i = list.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [list[i], list[j]] = [list[j], list[i]];
        }
        return list;
    };
    const inBounds = (x, y) => x >= 0 && x < size && y >= 0 && y < size;
    // in-bounds cells (other than its own) that a piece at (x, y) would hit
    const targetsOf = (kind, x, y) => KINDS[kind].abilities
        .flatMap(id => ABILITIES[id].target(x, y, {gridScale: size}))
        .filter(t => inBounds(t.x, t.y) && !(t.x === x && t.y === y));

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const total = between(config.pieces);
        const taken = new Set();
        const placed = [];
        const put = (kind, x, y) => {
            placed.push({kind, x, y});
            taken.add(`${x},${y}`);
        };

        // starters first, anywhere they reach the board
        for (let i = 0; i < config.starters; i++) {
            for (let tries = 0; tries < 50; tries++) {
                const kind = pick(STARTER_KINDS);
                const x = Math.floor(rng() * size), y = Math.floor(rng() * size);
                if (!taken.has(`${x},${y}`) && targetsOf(kind, x, y).length > 0) {
                    put(kind, x, y);
                    break;
                }
            }
        }
        if (placed.length === 0) continue;

        // grow the chain: a new reactor goes on a free cell that an existing piece hits
        let beams = 0;
        let stuck = 0;
        while (placed.length < total && stuck < 200) {
            const source = pick(placed);
            const free = targetsOf(source.kind, source.x, source.y).filter(t => !taken.has(`${t.x},${t.y}`));
            if (free.length === 0) {
                stuck++;
                continue;
            }
            const cell = pick(free);
            const kinds = REACTOR_KINDS.filter(kind =>
                (beams < config.beams || !isBeamKind(kind)) && targetsOf(kind, cell.x, cell.y).length > 0);
            if (kinds.length === 0) {
                stuck++;
                continue;
            }
            const kind = pick(kinds);
            if (isBeamKind(kind)) beams++;
            put(kind, cell.x, cell.y);
        }
        if (placed.length < total) continue;

        // run everything at once: each piece must fire, and the empty cells that
        // got hit become locked targets
        const probe = buildFromDefinition({size, locked: placed.map(p => [p.x, p.y, p.kind, 1]), hand: []});
        const sim = cloneGrid(probe.grid, size);
        const {trace} = simulate(sim, size);
        if (placed.some(p => sim[p.x][p.y].charges > 0)) continue;
        const hits = new Map();
        for (const step of trace) {
            for (const t of step.targets) {
                if (!probe.grid[t.x][t.y].isEmpty) continue;
                const key = `${t.x},${t.y}`;
                hits.set(key, (hits.get(key) ?? 0) + 1);
            }
        }
        if (hits.size < config.targets[0] || hits.size > config.targets[1]) continue;
        if ([...hits.values()].some(count => count > 3)) continue;

        // some non-starter pieces become the solution (they go to the hand)
        const movable = shuffle(placed.filter(p => !STARTER_KINDS.includes(p.kind)));
        const wanted = between(config.hand);
        if (movable.length < wanted) continue;
        const solution = movable.slice(0, wanted);
        const locked = placed.filter(p => !solution.includes(p));

        // 1-2 spares
        const spares = Array.from({length: fixedSpares ?? 1 + Math.floor(rng() * 2)}, () => pick(rng() < 0.15 ? STARTER_KINDS : REACTOR_KINDS));

        const definition = {
            name: "Random",
            size,
            locked: [
                ...locked.map(p => [p.x, p.y, p.kind, 1]),
                ...[...hits].map(([key, count]) => [...key.split(",").map(Number), "receiver", count]),
            ],
            hand: shuffle([...solution.map(p => p.kind), ...spares]),
            solution: solution.map(({x, y, kind}) => ({x, y, kind})),
        };
        if (isSensible(definition)) return definition;
    }
    throw new Error(`could not generate a ${size}x${size} puzzle`);
}
