import {describePiece} from "./describe.js";

const panel = document.getElementById("summary-panel");
const PLACEHOLDER = "Hover a piece for details.";
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
    const signature = JSON.stringify([title, facts, description]);
    setContent(signature, () => {
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
    setContent("placeholder", () => [document.createTextNode(PLACEHOLDER)]);
}
