import {drawnLinks, linkKey} from "./wires.js";

// Plays a simulation trace back on the board as quick flashes: the piece that
// fires, then the pieces it hits. Charge numbers tick down as each hit lands,
// which is what shows how far the chain got. board.grid must be the PRE-run
// grid; charge changes are replayed onto it as the steps play.

const sleep = ms => (ms < 2 ? Promise.resolve() : new Promise(resolve => setTimeout(resolve, ms)));

function tween(ms, onFrame) {
    // effectively instant (the lightning speed): jump straight to the end
    if (ms < 2) {
        onFrame(1);
        return Promise.resolve();
    }
    return new Promise(resolve => {
        const start = performance.now();
        const tick = now => {
            const t = Math.min(1, (now - start) / ms);
            onFrame(t);
            if (t < 1) requestAnimationFrame(tick);
            else resolve();
        };
        requestAnimationFrame(tick);
    });
}

export async function playRun(board, trace, gridScale, timing = {}) {
    // getSpeed is read on every wait so the speed buttons work mid-run.
    const {flashMs = 70, gapMs = 110, travelMs = 140, getSpeed = () => 1} = timing;
    const flashWait = () => sleep(flashMs / getSpeed());
    const gapWait = () => sleep(gapMs / getSpeed());
    const grid = board.grid;
    const fx = board.effects = {flashes: [], wireProgress: new Map(), pulses: []};

    // A piece with several charges is activated (and fires) several times. Its
    // beams only disappear on its LAST activation. activations = how many times
    // its busiest ability fires; fired counts them off as the trace plays.
    const abilityCounts = new Map();
    for (const step of trace) {
        const key = `${step.sourceX},${step.sourceY},${step.abilityId}`;
        abilityCounts.set(key, (abilityCounts.get(key) ?? 0) + 1);
    }
    const activations = new Map();
    for (const [key, count] of abilityCounts) {
        const cell = key.split(",").slice(0, 2).join(",");
        activations.set(cell, Math.max(activations.get(cell) ?? 0, count));
    }
    const fired = new Map();

    // Each starter's chain plays in turn. The Run press spends a starter's charge
    // just before its chain begins (the first step's flash is the press itself).
    let current = null;

    for (const step of trace) {
        if (!current || current.x !== step.root.x || current.y !== step.root.y) {
            current = step.root;
            grid[current.x][current.y].activate();
        }
        fx.flashes = [{x: step.sourceX, y: step.sourceY}];
        board.drawBoard();
        await flashWait();

        // The wires leaving this piece carry the beam to their targets. On its
        // last activation each wire is consumed from its output end toward its
        // input end; on earlier ones a pulse travels along it and the wire stays.
        const cellKey = `${step.sourceX},${step.sourceY}`;
        const abilityKey = `${cellKey},${step.abilityId}`;
        fired.set(abilityKey, (fired.get(abilityKey) ?? 0) + 1);
        const isLast = fired.get(abilityKey) >= activations.get(cellKey);
        const outgoing = drawnLinks(grid, gridScale).filter(l =>
            l.from.x === step.sourceX && l.from.y === step.sourceY &&
            (fx.wireProgress.get(linkKey(l.from, l.to)) ?? 0) < 1);
        if (outgoing.length > 0) {
            await tween(travelMs / getSpeed(), linear => {
                // ease in and out so the beam glides instead of jolting
                const t = linear * linear * (3 - 2 * linear);
                if (isLast) {
                    for (const l of outgoing) fx.wireProgress.set(linkKey(l.from, l.to), t);
                } else {
                    fx.pulses = outgoing.map(l => ({from: l.from, to: l.to, t}));
                }
                board.drawBoard();
            });
            fx.pulses = [];
        }

        const hits = [];
        for (const t of step.targets) {
            if (t.consumed) {
                grid[t.x][t.y].activate();
                hits.push({x: t.x, y: t.y});
            }
        }
        fx.flashes = hits;
        board.drawBoard();
        await flashWait();

        fx.flashes = [];
        board.drawBoard();
        await gapWait();
    }
}
