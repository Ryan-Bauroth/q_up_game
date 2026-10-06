import {cloneGrid, simulate} from "./engine.js";
import {ABILITIES} from "./abilities.js";
import {PUZZLE_SIZE} from "./puzzles.js";
import {layout} from "./lint.js";

// Scores a generated puzzle by how much of an "idea" it has. Each theme scores
// 0-1; the total is the best theme plus a small general bonus, so a board with
// one clear idea beats one that is mediocre at everything. Themes are never
// shown to the player.

const N = PUZZLE_SIZE;
const key = (x, y) => `${x},${y}`;
const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
const clamp01 = n => Math.max(0, Math.min(1, n));

// Receiver patterns the picture theme looks for, as [x, y] cells.
const TEMPLATES = {
    smile: [[1, 1], [3, 1], [0, 3], [1, 4], [2, 4], [3, 4], [4, 3]],
    x: [[1, 1], [3, 1], [2, 2], [1, 3], [3, 3]],
    plus: [[2, 1], [1, 2], [2, 2], [3, 2], [2, 3]],
    ring: [[1, 1], [2, 1], [3, 1], [1, 2], [3, 2], [1, 3], [2, 3], [3, 3]],
    corners: [[0, 0], [4, 0], [0, 4], [4, 4]],
    diagonal: [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]],
    antiDiagonal: [[4, 0], [3, 1], [2, 2], [1, 3], [0, 4]],
    middleRow: [[0, 2], [1, 2], [2, 2], [3, 2], [4, 2]],
    middleColumn: [[2, 0], [2, 1], [2, 2], [2, 3], [2, 4]],
};

// What the simulation of the solved board looks like, in the shapes the themes need.
function analyse(definition) {
    const grid = layout(definition);
    const {trace} = simulate(cloneGrid(grid, N), N);
    const cells = [];
    for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) {
        if (!grid[x][y].isEmpty) cells.push({x, y, node: grid[x][y]});
    }
    // what each occupied cell is, for symmetry: ability list plus charges
    const kindAt = new Map(cells.map(c => [key(c.x, c.y), `${c.node.abilities.join("+")}:${c.node.maxCharges}`]));
    const hits = trace.flatMap(step => step.targets
        .filter(t => t.consumed)
        .map(t => ({from: {x: step.sourceX, y: step.sourceY}, to: {x: t.x, y: t.y}, root: step.root, abilityId: step.abilityId})));
    return {cells, kindAt, trace, hits, definition};
}

// longest chain of back-to-back skip hits (target not adjacent to its source)
function longestSkipRun(hits) {
    const next = new Map();
    for (const h of hits) {
        if (cheb(h.from.x, h.from.y, h.to.x, h.to.y) < 2) continue;
        const k = key(h.from.x, h.from.y);
        if (!next.has(k)) next.set(k, []);
        next.get(k).push(key(h.to.x, h.to.y));
    }
    const walk = (cell, seen) => {
        let best = 0;
        for (const to of next.get(cell) ?? []) {
            if (seen.has(to)) continue;
            seen.add(to);
            best = Math.max(best, 1 + walk(to, seen));
            seen.delete(to);
        }
        return best;
    };
    return Math.max(0, ...[...next.keys()].map(k => walk(k, new Set([k]))));
}

export const THEMES = {
    skipChain({hits}) {
        if (hits.length === 0) return 0;
        const skips = hits.filter(h => cheb(h.from.x, h.from.y, h.to.x, h.to.y) > 1).length;
        return clamp01(longestSkipRun(hits) / 3) * (0.5 + 0.5 * skips / hits.length);
    },

    beamCoverage({hits}) {
        const beamHits = hits.filter(h => ABILITIES[h.abilityId].line);
        const beams = new Set(beamHits.map(h => key(h.from.x, h.from.y)));
        if (beams.size === 0) return 0;
        const reached = new Set(beamHits.map(h => key(h.to.x, h.to.y)));
        const overlap = beamHits.length - reached.size;
        return clamp01(reached.size / 12) * (beams.size >= 2 ? 1 : 0.6) * (overlap === 0 ? 1 : 0.7);
    },

    picture({cells}) {
        const receivers = new Set(cells.filter(c => c.node.abilities.length === 0).map(c => key(c.x, c.y)));
        let best = 0;
        for (const template of Object.values(TEMPLATES)) {
            const wanted = new Set(template.map(([x, y]) => key(x, y)));
            const shared = [...receivers].filter(k => wanted.has(k)).length;
            best = Math.max(best, shared / (receivers.size + wanted.size - shared));
        }
        return best;
    },

    symmetry({cells, kindAt}) {
        const flips = [
            (x, y) => [N - 1 - x, y],
            (x, y) => [x, N - 1 - y],
            (x, y) => [N - 1 - x, N - 1 - y],
        ];
        let best = 0;
        for (const flip of flips) {
            let score = 0;
            for (const {x, y} of cells) {
                const [fx, fy] = flip(x, y);
                if (fx === x && fy === y) score += 0.5; // on the axis: matches itself
                else if (kindAt.get(key(fx, fy)) === kindAt.get(key(x, y))) score += 1;
            }
            best = Math.max(best, score / cells.length);
        }
        return best;
    },

    singlePath({cells, trace}) {
        // the biggest share of the board that one starter's chain reaches
        const reached = new Map();
        for (const step of trace) {
            const root = key(step.root.x, step.root.y);
            if (!reached.has(root)) reached.set(root, new Set([root]));
            for (const t of step.targets) if (t.consumed) reached.get(root).add(key(t.x, t.y));
        }
        const biggest = Math.max(0, ...[...reached.values()].map(s => s.size));
        const useful = trace.filter(s => s.targets.some(t => t.consumed));
        const branching = useful.filter(s => s.targets.filter(t => t.consumed).length > 1).length;
        return clamp01(biggest / cells.length) * (1 - 0.5 * branching / Math.max(1, useful.length));
    },

    bottleneck({hits}) {
        const routes = new Map();
        for (const h of hits) {
            const k = key(h.to.x, h.to.y);
            if (!routes.has(k)) routes.set(k, new Set());
            routes.get(k).add(key(h.from.x, h.from.y));
        }
        const most = Math.max(0, ...[...routes.values()].map(s => s.size));
        return clamp01((most - 1) / 3);
    },
};

// General bonus (0 to 0.2): variety of pieces, spread over the board, how much
// happens, and spares that look like real alternatives.
function bonus({cells, trace, hits, definition}) {
    const kinds = new Set(cells.map(c => c.node.abilities.join("+")));
    const quadrants = new Set(cells.map(c => `${c.x < 2.5}${c.y < 2.5}`));
    const activations = hits.length + trace.length;
    const used = new Set([...definition.solution.map(s => s.kind), ...definition.locked.map(l => l[2])]);
    const placed = [...definition.solution.map(s => s.kind)];
    const spares = definition.hand.filter(kind => { const i = placed.indexOf(kind); if (i >= 0) { placed.splice(i, 1); return false; } return true; });
    const plausible = spares.filter(kind => used.has(kind)).length;
    return 0.05 * clamp01(kinds.size / 6) + 0.05 * (quadrants.size / 4)
        + 0.05 * clamp01(activations / 24) + 0.05 * clamp01(plausible / 2);
}

// Raw theme scores sit at different baselines (a typical board already scores
// ~0.6 on singlePath), so each is stretched so that [median, 90th percentile] maps to 0..1
// (capped at 1.5, not 1: a board past the 90th percentile still ranks higher) before themes are compared. Measured over ~200 generated boards; re-measure if the generator changes.
const RANGES = {
    skipChain: [0.2, 0.5],
    beamCoverage: [0.05, 0.2],
    picture: [0.3, 0.5],
    symmetry: [0.25, 0.42],
    singlePath: [0.6, 0.69],
    bottleneck: [0.34, 0.67],
};

export function scorePuzzle(definition) {
    const facts = analyse(definition);
    const themes = {};
    for (const [name, theme] of Object.entries(THEMES)) {
        const [low, high] = RANGES[name];
        themes[name] = Math.min(1.5, Math.max(0, (theme(facts) - low) / (high - low)));
    }
    return {total: Math.max(...Object.values(themes)) + bonus(facts), themes};
}

// Readable names for the themes, for the testing caption in the game.
export const THEME_LABELS = {
    skipChain: "skip chain",
    beamCoverage: "beam coverage",
    picture: "picture",
    symmetry: "symmetry",
    singlePath: "single path",
    bottleneck: "bottleneck",
};

// The best-scoring theme: {name, label, score}.
export function topTheme(themes) {
    const [name, score] = Object.entries(themes).reduce((best, entry) => (entry[1] > best[1] ? entry : best));
    return {name, label: THEME_LABELS[name] ?? name, score};
}
