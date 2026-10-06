import {Node, makeEmptyNode} from "./node.js";

// Hand-built test puzzles. Locked pieces start on the board; everything else
// starts in the tray (see rules.js validatePuzzle).

export const KINDS = {
    receiver: {summary: "Receiver: needs to be hit until its charges run out", abilities: []},
    igniter: {summary: "Igniter: fires on Run, pulses the cell below it", abilities: ["runPulseDown"]},
    pusher: {summary: "Pusher: fires on Run, pulses the cell to its right", abilities: ["runPulseRight"]},
    burster: {summary: "Burster: when activated, bursts to all 4 neighbors", abilities: ["adjacentBurst"]},
    cross: {summary: "Cross: when activated, hits all 4 diagonal neighbors", abilities: ["diagonalRelay"]},
    octo: {summary: "Octo: when activated, hits all 8 surrounding cells", abilities: ["octoBurst"]},
    relay: {summary: "Relay: when activated, hits the cell 2 tiles right", abilities: ["lineSkip2Right"]},
    knight: {summary: "Knight: when activated, jumps like a chess knight", abilities: ["knightJump"]},
    column: {summary: "Column: when activated, hits every other cell in its column", abilities: ["columnPulse"]},
    pulseUp: {summary: "Pulse Up: fires on Run, pulses the cell above it", abilities: ["runPulseUp"]},
    pulseLeft: {summary: "Pulse Left: fires on Run, pulses the cell to its left", abilities: ["runPulseLeft"]},
    duo: {summary: "Duo: fires on Run, pulses the cells to its left and right", abilities: ["runPair"]},
    pairH: {summary: "Pair: when activated, hits the cells to its left and right", abilities: ["pairH"]},
    pairV: {summary: "Pair: when activated, hits the cells above and below", abilities: ["pairV"]},
    tee: {summary: "Tee: when activated, hits left, right and below", abilities: ["tee"]},
    spread: {summary: "Spread: when activated, hits the 3 cells below it", abilities: ["spreadDown"]},
    dive: {summary: "Dive: when activated, hits the cell 2 tiles below", abilities: ["skipDown2"]},
    hop: {summary: "Hop: when activated, hits the cell 2 tiles left", abilities: ["skipLeft2"]},
    leap: {summary: "Leap: when activated, hits the 4 diagonal cells 2 away", abilities: ["diagSkip2"]},
    sweep: {summary: "Sweep: when activated, hits every other even column in its row", abilities: ["rowSweep"]},
};

let nextId = 1;
export const makePiece = (kind, charges = 1, locked = false) =>
    new Node({id: nextId++, summary: KINDS[kind].summary, charges, abilities: [...KINDS[kind].abilities], locked});

export const PUZZLE_SIZE = 5;

// Each puzzle: a name, the locked pieces as [x, y, kind, charges], and the
// hand as a list of kinds. Every puzzle is checked for solvability in
// puzzles.test.js.
const DEFINITIONS = [
    {
        name: "Double Tap",
        locked: [[2, 2, "receiver", 2], [3, 1, "receiver", 1]],
        hand: ["igniter", "pusher", "burster"],
    },
    {
        name: "Locked and Loaded",
        locked: [[0, 2, "pusher"], [3, 0, "receiver"], [4, 3, "receiver"], [2, 4, "receiver"]],
        hand: ["cross", "octo", "knight"],
    },
    {
        name: "Triple Threat",
        locked: [[2, 3, "pusher"], [3, 3, "receiver", 3], [2, 2, "receiver"], [4, 1, "receiver"], [4, 4, "receiver"], [3, 4, "receiver"]],
        hand: ["igniter", "octo", "burster", "burster"],
    },
    {
        name: "Crossfire",
        locked: [[3, 2, "pulseLeft"], [3, 4, "column"], [3, 0, "cross"], [2, 1, "receiver", 2], [4, 3, "receiver"], [1, 4, "receiver"], [0, 3, "receiver"], [0, 1, "receiver"], [3, 1, "receiver", 2], [3, 3, "receiver"]],
        hand: ["pusher", "pairV", "pairH", "knight"],
    },
    {
        name: "Rising Tide",
        locked: [[3, 0, "pulseLeft"], [3, 2, "knight"], [3, 4, "burster"], [2, 0, "receiver", 2], [4, 4, "receiver", 3], [4, 3, "receiver"], [4, 2, "receiver"], [1, 3, "receiver", 3], [4, 0, "receiver"], [1, 1, "receiver"]],
        hand: ["pusher", "tee", "octo", "spread"],
    },
    {
        name: "Column Crawl",
        locked: [[3, 2, "pusher"], [3, 0, "column"], [4, 2, "receiver"], [2, 2, "receiver", 2], [2, 3, "receiver"], [1, 1, "receiver", 2], [3, 1, "receiver", 3], [3, 3, "receiver"], [3, 4, "receiver"]],
        hand: ["pusher", "leap", "column", "octo", "burster"],
    },
    {
        name: "Leap of Faith",
        locked: [[4, 4, "pulseUp"], [3, 3, "leap"], [3, 2, "octo"], [2, 0, "receiver"], [2, 2, "receiver", 2], [4, 0, "receiver"], [4, 1, "receiver", 2], [4, 2, "receiver", 2], [3, 0, "receiver"], [0, 3, "receiver"]],
        hand: ["pulseLeft", "burster", "knight", "column", "dive"],
    },
    {
        name: "Full Circuit",
        locked: [[2, 4, "duo"], [3, 2, "burster"], [4, 2, "hop"], [1, 4, "receiver"], [3, 3, "receiver", 2], [2, 3, "receiver"], [4, 3, "receiver", 2], [2, 2, "receiver", 2], [2, 1, "receiver"], [4, 1, "receiver"]],
        hand: ["pulseLeft", "burster", "octo", "dive", "pairH"],
    },
    {
        name: "Last Light",
        locked: [[2, 3, "pulseUp"], [1, 4, "leap"], [2, 2, "column"], [4, 4, "receiver"], [2, 0, "receiver"], [2, 1, "receiver"], [3, 3, "receiver"], [1, 0, "receiver", 2], [0, 3, "receiver"], [3, 2, "receiver"]],
        hand: ["pusher", "cross", "column", "spread", "pairV"],
    },
    {
        // A locked red piece with 2 charges that has to be hit twice (once by
        // the locked Igniter, once by the Pusher from the hand) and so fires
        // its burst twice. Use it to watch repeat activations.
        name: "Echo",
        locked: [[1, 0, "igniter"], [1, 1, "burster", 2], [2, 1, "receiver", 2], [1, 2, "receiver", 2]],
        hand: ["pusher"],
    },
];

export function puzzleCount() {
    return DEFINITIONS.length;
}

export function puzzleName(index) {
    return DEFINITIONS[index].name;
}

// The piece kinds that appear in the first `count` hand-built puzzles, i.e.
// the ones that have actually been play-tested.
export function testedKinds(count = 6) {
    const kinds = new Set();
    for (const def of DEFINITIONS.slice(0, count)) {
        for (const [, , kind] of def.locked) kinds.add(kind);
        for (const kind of def.hand) kinds.add(kind);
    }
    kinds.delete("receiver");
    return kinds;
}

export function puzzleDefinition(index) {
    return DEFINITIONS[index];
}

// Builds fresh pieces (a new grid and a new hand) from a definition, so it
// can be called again to reset a puzzle. Works for the hand-built puzzles and
// for generated ones.
export function buildFromDefinition(def) {
    const grid = Array.from({length: PUZZLE_SIZE}, () =>
        Array.from({length: PUZZLE_SIZE}, () => makeEmptyNode())
    );
    for (const [x, y, kind, charges = 1] of def.locked) {
        grid[x][y] = makePiece(kind, charges, true);
    }
    const pool = def.hand.map(kind => makePiece(kind));
    return {name: def.name, grid, pool};
}

export function buildPuzzle(index) {
    return buildFromDefinition(DEFINITIONS[index]);
}
