import {ABILITIES, TRIGGERS, isStarter} from "./abilities.js";

// Pure simulation: no DOM/canvas access, so this can run headlessly
// (e.g. for a future puzzle generator) as well as inside the live game.
//
// Mutates the given grid in place. Callers that need to preserve the
// pre-run state (for a Reset button, or a generator probing many
// candidate placements) should snapshot with cloneGrid() first.
//
// A node's charge is consumed exactly once per "activation event" for
// that node: once when the Run press activates it (if it has an onRun
// ability) and once each time another node's effect hits it (if it has
// remaining charge). That single activation is then what unlocks all of
// that node's abilities matching the corresponding trigger to fire their
// effects. Charges are NOT spent again when those effects are resolved.
export function simulate(grid, gridScale) {
    const boardShim = {gridScale};
    const trace = [];
    const queue = [];

    function inBounds(x, y) {
        return x >= 0 && x < gridScale && y >= 0 && y < gridScale;
    }

    function tryActivate(x, y, triggerType) {
        const node = grid[x][y];
        if (node.isEmpty) return false;
        // Starters only fire from the Run press, never from another piece's output.
        if (triggerType === TRIGGERS.ON_ACTIVATED && isStarter(node)) return false;
        const fired = node.activate();
        if (!fired) return false;
        queue.push({x, y, triggerType});
        return true;
    }

    // Seed phase: every node with an onRun ability is activated once by the Run press.
    for (let x = 0; x < gridScale; x++) {
        for (let y = 0; y < gridScale; y++) {
            const node = grid[x][y];
            if (node.isEmpty) continue;
            if (isStarter(node)) tryActivate(x, y, TRIGGERS.ON_RUN);
        }
    }

    // Cascade phase.
    while (queue.length > 0) {
        const {x, y, triggerType} = queue.shift();
        const node = grid[x][y];
        const matchingAbilities = node.abilities
            .map(id => ABILITIES[id])
            .filter(ability => ability && ability.trigger === triggerType);

        for (const ability of matchingAbilities) {
            const targets = ability.target(x, y, boardShim).filter(t => inBounds(t.x, t.y));
            const stepTargets = [];

            for (const t of targets) {
                const targetNode = grid[t.x][t.y];
                const consumed = tryActivate(t.x, t.y, TRIGGERS.ON_ACTIVATED);
                stepTargets.push({x: t.x, y: t.y, consumed, id: targetNode.id});
            }

            trace.push({sourceX: x, sourceY: y, abilityId: ability.id, targets: stepTargets});
        }
    }

    return {trace, finalGrid: grid, won: checkWin(grid, gridScale)};
}

export function checkWin(grid, gridScale) {
    for (let x = 0; x < gridScale; x++) {
        for (let y = 0; y < gridScale; y++) {
            const node = grid[x][y];
            if (!node.isEmpty && node.charges > 0) return false;
        }
    }
    return true;
}

export function cloneGrid(grid, gridScale) {
    const out = [];
    for (let x = 0; x < gridScale; x++) {
        out.push([]);
        for (let y = 0; y < gridScale; y++) {
            out[x].push(grid[x][y].clone());
        }
    }
    return out;
}
