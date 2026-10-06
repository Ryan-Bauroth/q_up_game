import {PALETTE} from "./pieces.js";

// Pure helpers for the wash a beam piece lays over the cells it covers. A
// column's wash and a row's wash have different colors; a cell covered by both
// is drawn half and half (see Board.drawBeamTints).

export const TINT_FILLS = {column: PALETTE.beam.fill, row: PALETTE.beamRow.fill};

const channels = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

// Combined wash strength per cell: Map of "x,y" -> {column, row}, each 0-1.
// `layers` are {cells: [{x, y}], alpha, axis: "column" | "row"}; overlapping
// layers of one axis stack up.
export function tintCoverage(layers) {
    const coverage = new Map();
    for (const {cells, alpha, axis} of layers) {
        for (const {x, y} of cells) {
            const key = `${x},${y}`;
            const entry = coverage.get(key) ?? {column: 0, row: 0};
            entry[axis] = 1 - (1 - entry[axis]) * (1 - alpha);
            coverage.set(key, entry);
        }
    }
    return coverage;
}

// White with a wash of `hex` at `alpha` over it, as [r, g, b].
export function washChannels(hex, alpha) {
    return channels(hex).map(c => Math.round(255 - (255 - c) * alpha));
}

// One flat color for a cell (white, one wash, or the average of both washes
// where a column and a row cross). Used to back faded pieces.
export function flatBackground(entry) {
    if (!entry || (entry.column === 0 && entry.row === 0)) return "#ffffff";
    const washes = ["column", "row"]
        .filter(axis => entry[axis] > 0)
        .map(axis => washChannels(TINT_FILLS[axis], entry[axis]));
    const mixed = [0, 1, 2].map(i => Math.round(washes.reduce((sum, w) => sum + w[i], 0) / washes.length));
    return `rgb(${mixed.join(", ")})`;
}
