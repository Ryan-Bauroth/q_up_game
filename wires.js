import {targetCells} from "./pieces.js";
import {isStarter, isBeam} from "./abilities.js";

// Pure: which placed pieces activate which other placed pieces. A link only
// exists when the target cell actually holds a non-starter piece. `skip` is true when the
// target isn't adjacent (the wire goes "under the board").
export function wireLinks(grid, gridScale) {
    const links = [];
    for (let x = 0; x < gridScale; x++) {
        for (let y = 0; y < gridScale; y++) {
            const node = grid[x][y];
            if (node.isEmpty) continue;
            for (const t of targetCells(node, x, y, gridScale)) {
                const targetNode = grid[t.x][t.y];
                // outputs never go to empty cells or to starters
                if ((t.x === x && t.y === y) || targetNode.isEmpty || isStarter(targetNode)) continue;
                const dist = Math.max(Math.abs(t.x - x), Math.abs(t.y - y));
                links.push({from: {x, y}, to: {x: t.x, y: t.y}, skip: dist > 1});
            }
        }
    }
    return links;
}

// Pure: for every cell hit by a non-adjacent ("skip") link, the source cells
// hitting it, in a stable order. Map key is "x,y" of the target. With
// includeAdjacent, adjacent hits count too (the "all dots" mode).
export function skipHits(links, includeAdjacent = false) {
    const hits = new Map();
    for (const {from, to, skip} of links) {
        if (!skip && !includeAdjacent) continue;
        const key = `${to.x},${to.y}`;
        if (!hits.has(key)) hits.set(key, []);
        hits.get(key).push({x: from.x, y: from.y});
    }
    return hits;
}

// Pure: angles (radians, 0 = right, -PI/2 = top) for `count` dots on a ring.
// Dots are centered on the top, and spread out evenly from there so the top
// fills first and then the ring wraps around the sides and bottom.
export function dotAngles(count, stepDegrees = 28) {
    const step = Math.min(stepDegrees, 360 / Math.max(count, 1)) * Math.PI / 180;
    return Array.from({length: count}, (_, i) => -Math.PI / 2 + (i - (count - 1) / 2) * step);
}

export const linkKey = (from, to) => `${from.x},${from.y}>${to.x},${to.y}`;

// Pure: the links that are actually drawn as wires. Skip (non-adjacent) hits
// show as dots instead, and beam pieces draw no wires.
export function drawnLinks(grid, gridScale) {
    return wireLinks(grid, gridScale).filter(l => !l.skip && !isBeam(grid[l.from.x][l.from.y]));
}

// How thick a piece's beams are: one step thicker per charge it still has (up
// to 3), so a beam thins each time its piece fires and is consumed on the last.
export function beamLevel(node) {
    return Math.max(1, Math.min(3, node.charges));
}

export function beamWidths(level) {
    const extra = (level - 1) * 3;
    return {outer: 11 + extra, inner: 8 + extra};
}
