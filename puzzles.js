import {Node, makeEmptyNode} from "./node.js";

// The piece kinds, and how puzzle definitions become pieces. A definition is
// {name, size, locked: [[x, y, kind, charges]], hand: [kind], solution: [{x, y, kind}]}:
// locked pieces start on the board, the hand starts in the tray (see rules.js
// validatePuzzle).

export const KINDS = {
    receiver: {summary: "Target", abilities: []},
    igniter: {summary: "Igniter", abilities: ["runPulseDown"]},
    pusher: {summary: "Pusher", abilities: ["runPulseRight"]},
    burster: {summary: "Burster", abilities: ["adjacentBurst"]},
    cross: {summary: "Cross", abilities: ["diagonalRelay"]},
    octo: {summary: "Octo", abilities: ["octoBurst"]},
    relay: {summary: "Relay", abilities: ["lineSkip2Right"]},
    knight: {summary: "Knight", abilities: ["knightJump"]},
    column: {summary: "Column", abilities: ["columnPulse"]},
    row: {summary: "Row", abilities: ["rowPulse"]},
    pulseUp: {summary: "Pulse Up", abilities: ["runPulseUp"]},
    pulseLeft: {summary: "Pulse Left", abilities: ["runPulseLeft"]},
    duo: {summary: "Duo", abilities: ["runPair"]},
    pairH: {summary: "Side Pair", abilities: ["pairH"]},
    pairV: {summary: "Up-Down Pair", abilities: ["pairV"]},
    tee: {summary: "Tee", abilities: ["tee"]},
    spread: {summary: "Spread", abilities: ["spreadDown"]},
    dive: {summary: "Dive", abilities: ["skipDown2"]},
    hop: {summary: "Hop", abilities: ["skipLeft2"]},
    leap: {summary: "Leap", abilities: ["diagSkip2"]},
    sweep: {summary: "Sweep", abilities: ["rowSweep"]},
};

let nextId = 1;
export const makePiece = (kind, charges = 1, locked = false, required = true) =>
    new Node({id: nextId++, summary: KINDS[kind].summary, charges, abilities: [...KINDS[kind].abilities], locked, required});

// A definition may carry its own `size`; one without is 5x5.
export const DEFAULT_SIZE = 5;
export const sizeOf = definition => definition.size ?? DEFAULT_SIZE;

// Builds fresh pieces (a new grid and a new hand) from a definition, so it
// can be called again to reset a puzzle.
export function buildFromDefinition(def) {
    const size = sizeOf(def);
    const grid = Array.from({length: size}, () =>
        Array.from({length: size}, () => makeEmptyNode())
    );
    for (const [x, y, kind, charges = 1] of def.locked) {
        grid[x][y] = makePiece(kind, charges, true);
    }
    // hand pieces need no activations: they are tools, not targets
    const pool = def.hand.map(kind => makePiece(kind, 1, false, false));
    return {name: def.name, grid, pool};
}
