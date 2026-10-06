import {ABILITIES} from "./abilities.js";

const panel = document.getElementById("summary-panel");
const PLACEHOLDER = "Hover or drag a node to see details.";
// Short grace period so crossing the gap between pieces doesn't flash the
// placeholder.
const CLEAR_DELAY_MS = 120;

let clearTimer = null;

function setText(text) {
    if (panel.textContent !== text) panel.textContent = text;
}

function cancelPendingClear() {
    if (clearTimer !== null) {
        clearTimeout(clearTimer);
        clearTimer = null;
    }
}

export function renderSummary(node) {
    if (!node || node.isEmpty) {
        if (clearTimer === null) {
            clearTimer = setTimeout(clearSummary, CLEAR_DELAY_MS);
        }
        return;
    }
    cancelPendingClear();
    const abilityLabels = node.abilities
        .map(id => ABILITIES[id]?.label ?? id)
        .join(", ");
    const lockedNote = node.locked ? " — Locked (can't be moved)" : "";
    setText(`${node.summary || "Node " + node.id} — ${node.charges}/${node.maxCharges} charges — Abilities: ${abilityLabels || "none"}${lockedNote}`);
}

export function clearSummary() {
    cancelPendingClear();
    setText(PLACEHOLDER);
}
