export const TRIGGERS = {
    ON_RUN: "onRun",
    ON_ACTIVATED: "onActivated",
};

// Target selectors: (x, y, board) => [{x, y}, ...] candidate cells.
// The engine bounds-checks the result; selectors don't need to worry about
// falling off the grid.
const neighborOffset = (dx, dy) => (x, y) => [{x: x + dx, y: y + dy}];

const allAdjacent = (x, y) => ([
    {x: x - 1, y}, {x: x + 1, y},
    {x, y: y - 1}, {x, y: y + 1},
]);

const allDiagonal = (x, y) => ([
    {x: x - 1, y: y - 1}, {x: x + 1, y: y - 1},
    {x: x - 1, y: y + 1}, {x: x + 1, y: y + 1},
]);

const lineOffset = (dx, dy, n) => (x, y) => [{x: x + dx * n, y: y + dy * n}];

function rowSweep(x, y, board) {
    const out = [];
    for (let i = 0; i < board.gridScale; i += 2) {
        if (i !== x) out.push({x: i, y});
    }
    return out;
}

const knightMoves = (x, y) => ([
    {x: x + 1, y: y - 2}, {x: x + 2, y: y - 1},
    {x: x + 2, y: y + 1}, {x: x + 1, y: y + 2},
    {x: x - 1, y: y + 2}, {x: x - 2, y: y + 1},
    {x: x - 2, y: y - 1}, {x: x - 1, y: y - 2},
]);

function columnPulse(x, y, board) {
    const out = [];
    for (let j = 0; j < board.gridScale; j++) {
        if (j !== y) out.push({x, y: j});
    }
    return out;
}

const offsets = list => (x, y) => list.map(([dx, dy]) => ({x: x + dx, y: y + dy}));

export const ABILITIES = {
    runPulseDown: {
        id: "runPulseDown",
        label: "Run Pulse (down)",
        trigger: TRIGGERS.ON_RUN,
        target: neighborOffset(0, 1),
    },
    runPulseRight: {
        id: "runPulseRight",
        label: "Run Pulse (right)",
        trigger: TRIGGERS.ON_RUN,
        target: neighborOffset(1, 0),
    },
    runPulseUp: {
        id: "runPulseUp",
        label: "Run Pulse (up)",
        trigger: TRIGGERS.ON_RUN,
        target: neighborOffset(0, -1),
    },
    runPulseLeft: {
        id: "runPulseLeft",
        label: "Run Pulse (left)",
        trigger: TRIGGERS.ON_RUN,
        target: neighborOffset(-1, 0),
    },
    runPair: {
        id: "runPair",
        label: "Run Pair (left + right)",
        trigger: TRIGGERS.ON_RUN,
        target: offsets([[-1, 0], [1, 0]]),
    },
    pairH: {
        id: "pairH",
        label: "Pair (left + right)",
        trigger: TRIGGERS.ON_ACTIVATED,
        target: offsets([[-1, 0], [1, 0]]),
    },
    pairV: {
        id: "pairV",
        label: "Pair (up + down)",
        trigger: TRIGGERS.ON_ACTIVATED,
        target: offsets([[0, -1], [0, 1]]),
    },
    tee: {
        id: "tee",
        label: "Tee (left, right, down)",
        trigger: TRIGGERS.ON_ACTIVATED,
        target: offsets([[-1, 0], [1, 0], [0, 1]]),
    },
    spreadDown: {
        id: "spreadDown",
        label: "Spread (3 cells below)",
        trigger: TRIGGERS.ON_ACTIVATED,
        target: offsets([[-1, 1], [0, 1], [1, 1]]),
    },
    skipDown2: {
        id: "skipDown2",
        label: "Line Skip (2 down)",
        trigger: TRIGGERS.ON_ACTIVATED,
        target: lineOffset(0, 1, 2),
    },
    skipLeft2: {
        id: "skipLeft2",
        label: "Line Skip (2 left)",
        trigger: TRIGGERS.ON_ACTIVATED,
        target: lineOffset(-1, 0, 2),
    },
    diagSkip2: {
        id: "diagSkip2",
        label: "Diagonal Skip (2 away)",
        trigger: TRIGGERS.ON_ACTIVATED,
        target: offsets([[2, 2], [-2, 2], [2, -2], [-2, -2]]),
    },
    passthroughUpRight: {
        id: "passthroughUpRight",
        label: "Passthrough (up-right)",
        trigger: TRIGGERS.ON_ACTIVATED,
        target: neighborOffset(1, -1),
    },
    adjacentBurst: {
        id: "adjacentBurst",
        label: "Adjacent Burst",
        trigger: TRIGGERS.ON_ACTIVATED,
        target: allAdjacent,
    },
    lineSkip2Right: {
        id: "lineSkip2Right",
        label: "Line Skip (2 right)",
        trigger: TRIGGERS.ON_ACTIVATED,
        target: lineOffset(1, 0, 2),
    },
    diagonalRelay: {
        id: "diagonalRelay",
        label: "Diagonal Relay",
        trigger: TRIGGERS.ON_ACTIVATED,
        target: allDiagonal,
    },
    octoBurst: {
        id: "octoBurst",
        label: "Octo Burst",
        trigger: TRIGGERS.ON_ACTIVATED,
        target: (x, y) => [...allAdjacent(x, y), ...allDiagonal(x, y)],
    },
    knightJump: {
        id: "knightJump",
        label: "Knight Jump",
        trigger: TRIGGERS.ON_ACTIVATED,
        target: knightMoves,
    },
    columnPulse: {
        id: "columnPulse",
        label: "Column Pulse",
        line: true,
        trigger: TRIGGERS.ON_ACTIVATED,
        target: columnPulse,
    },
    rowSweep: {
        id: "rowSweep",
        label: "Row Sweep",
        line: true,
        trigger: TRIGGERS.ON_ACTIVATED,
        target: rowSweep,
    },
};

// Future ability idea: a seeded random-adjacent relay. Omitted for now
// because true randomness breaks simulate()'s determinism, which the
// planned procedural generator relies on (same placement -> same outcome).

// Starters (pieces with an on-Run ability) only ever fire from the Run press;
// other pieces' outputs never activate them.
export function isStarter(node) {
    return node.abilities.some(id => ABILITIES[id]?.trigger === TRIGGERS.ON_RUN);
}

// Beams sweep a whole line (a column or row) rather than a few set cells.
export function isBeam(node) {
    return node.abilities.some(id => ABILITIES[id]?.line === true);
}
