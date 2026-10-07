import {describePiece} from "./describe.js";

const panel = document.getElementById("summary-panel");
const PLACEHOLDER = "Hover a piece for details.";
const COMPACT_PLACEHOLDER = "Tap a piece for details.";
// Narrow screens get a simpler, shorter text: one line (color, needs, locked)
// and then what the piece does, instead of a title, a bullet list and a sentence.
const compact = window.matchMedia("(max-width: 860px)");
// Short grace period so crossing the gap between pieces doesn't flash the
// placeholder.
const CLEAR_DELAY_MS = 120;

let clearTimer = null;
let shown = null;   // what the panel currently shows, so identical updates are skipped

function setContent(signature, build) {
    if (shown === signature) return;
    shown = signature;
    panel.replaceChildren(...build());
}

function cancelPendingClear() {
    if (clearTimer !== null) {
        clearTimeout(clearTimer);
        clearTimer = null;
    }
}

function fact(label, value) {
    const item = document.createElement("li");
    const strong = document.createElement("strong");
    strong.textContent = value === null ? label : `${label}: `;
    item.append(strong);
    if (value !== null) item.append(document.createTextNode(value));
    return item;
}

export function renderSummary(node) {
    if (!node || node.isEmpty) {
        if (clearTimer === null) {
            clearTimer = setTimeout(clearSummary, CLEAR_DELAY_MS);
        }
        return;
    }
    cancelPendingClear();
    const {title, facts, description} = describePiece(node);
    const signature = JSON.stringify([compact.matches, title, facts, description]);
    setContent(signature, () => {
        if (compact.matches) {
            const line = [title, ...facts.map(([label, value]) => {
                if (value === null) return label === "Activates on Run" ? "Fires on Run" : label;
                if (label !== "Activations needed") return `${label} ${value}`;
                const activations = parseInt(value, 10);   // "0 (done)" when it has been activated enough
                return activations <= 0 ? "Done" : `Needs ${activations} ${activations === 1 ? "activation" : "activations"}`;
            })];
            const heading = document.createElement("div");
            heading.className = "summary-title";
            heading.textContent = line.join(" \u00b7 ");
            const text = document.createElement("p");
            text.className = "summary-description";
            text.textContent = description;
            return [heading, text];
        }
        // the piece's color as a title, quick facts as bullet points, then what it does
        const heading = document.createElement("div");
        heading.className = "summary-title";
        heading.textContent = title;
        const list = document.createElement("ul");
        list.className = "summary-facts";
        list.append(...facts.map(([label, value]) => fact(label, value)));
        const text = document.createElement("p");
        text.className = "summary-description";
        text.textContent = description;
        return [heading, list, text];
    });
}

export function clearSummary() {
    cancelPendingClear();
    setContent(`placeholder ${compact.matches}`, () => [document.createTextNode(compact.matches ? COMPACT_PLACEHOLDER : PLACEHOLDER)]);
}
