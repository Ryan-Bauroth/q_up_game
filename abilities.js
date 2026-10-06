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
        short: "On Run: activates the cell below.",
        label: "Run Pulse (down)",
        trigger: TRIGGERS.ON_RUN,
        target: neighborOffset(0, 1),
    },
    runPulseRight: {
        id: "runPulseRight",
        short: "On Run: activates the cell to the right.",
        label: "Run Pulse (right)",
        trigger: TRIGGERS.ON_RUN,
        target: neighborOffset(1, 0),
    },
    runPulseUp: {
        id: "runPulseUp",
        short: "On Run: activates the cell above.",
        label: "Run Pulse (up)",
        trigger: TRIGGERS.ON_RUN,
        target: neighborOffset(0, -1),
    },
    runPulseLeft: {
        id: "runPulseLeft",
        short: "On Run: activates the cell to the left.",
        label: "Run Pulse (left)",
        trigger: TRIGGERS.ON_RUN,
        target: neighborOffset(-1, 0),
    },
    runPair: {
        id: "runPair",
        short: "On Run: activates left and right.",
        label: "Run Pair (left + right)",
        trigger: TRIGGERS.ON_RUN,
        target: offsets([[-1, 0], [1, 0]]),
    },
    pairH: {
        id: "pairH",
        short: "Activates left and right.",
        label: "Pair (left + right)",
        trigger: TRIGGERS.ON_ACTIVATED,
        target: offsets([[-1, 0], [1, 0]]),
    },
    pairV: {
        id: "pairV",
        short: "Activates above and below.",
        label: "Pair (up + down)",
        trigger: TRIGGERS.ON_ACTIVATED,
        target: offsets([[0, -1], [0, 1]]),
    },
    tee: {
        id: "tee",
        short: "Activates left, right and below.",
        label: "Tee (left, right, down)",
        trigger: TRIGGERS.ON_ACTIVATED,
        target: offsets([[-1, 0], [1, 0], [0, 1]]),
    },
    spreadDown: {
        id: "spreadDown",
        short: "Activates the 3 cells below.",
        label: "Spread (3 cells below)",
        trigger: TRIGGERS.ON_ACTIVATED,
        target: offsets([[-1, 1], [0, 1], [1, 1]]),
    },
    skipDown2: {
        id: "skipDown2",
        short: "Jumps 2 cells down.",
        label: "Line Skip (2 down)",
        trigger: TRIGGERS.ON_ACTIVATED,
        target: lineOffset(0, 1, 2),
    },
    skipLeft2: {
        id: "skipLeft2",
        short: "Jumps 2 cells left.",
        label: "Line Skip (2 left)",
        trigger: TRIGGERS.ON_ACTIVATED,
        target: lineOffset(-1, 0, 2),
    },
    diagSkip2: {
        id: "diagSkip2",
        short: "Jumps 2 cells diagonally.",
        label: "Diagonal Skip (2 away)",
        trigger: TRIGGERS.ON_ACTIVATED,
        target: offsets([[2, 2], [-2, 2], [2, -2], [-2, -2]]),
    },
    passthroughUpRight: {
        id: "passthroughUpRight",
        short: "Activates the cell up and to the right.",
        label: "Passthrough (up-right)",
        trigger: TRIGGERS.ON_ACTIVATED,
        target: neighborOffset(1, -1),
    },
    adjacentBurst: {
        id: "adjacentBurst",
        short: "Activates the 4 adjacent cells.",
        label: "Adjacent Burst",
        trigger: TRIGGERS.ON_ACTIVATED,
        target: allAdjacent,
    },
    lineSkip2Right: {
        id: "lineSkip2Right",
        short: "Jumps 2 cells right.",
        label: "Line Skip (2 right)",
        trigger: TRIGGERS.ON_ACTIVATED,
        target: lineOffset(1, 0, 2),
    },
    diagonalRelay: {
        id: "diagonalRelay",
        short: "Activates the 4 diagonal cells.",
        label: "Diagonal Relay",
        trigger: TRIGGERS.ON_ACTIVATED,
        target: allDiagonal,
    },
    octoBurst: {
        id: "octoBurst",
        short: "Activates all 8 surrounding cells.",
        label: "Octo Burst",
        trigger: TRIGGERS.ON_ACTIVATED,
        target: (x, y) => [...allAdjacent(x, y), ...allDiagonal(x, y)],
    },
    knightJump: {
        id: "knightJump",
        short: "Jumps like a chess knight.",
        label: "Knight Jump",
        trigger: TRIGGERS.ON_ACTIVATED,
        target: knightMoves,
    },
    columnPulse: {
        id: "columnPulse",
        short: "Activates its whole column.",
        label: "Column Pulse",
        line: true,
        trigger: TRIGGERS.ON_ACTIVATED,
        target: columnPulse,
    },
    rowSweep: {
        id: "rowSweep",
        short: "Activates every other cell in its row.",
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
