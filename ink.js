// The hand-drawn "ink" look. Every raised piece (class `up`) gets a `.line`
// layer: a wobbling outline plus a hard shadow, drawn behind the piece's
// content. Three slightly different turbulence filters are cycled by CSS
// (see paper.css), so the lines seem to boil a little, like pen on paper.

const FRAMES = [
    {id: "ink-a", seed: 3},
    {id: "ink-b", seed: 8},
    {id: "ink-c", seed: 21},
];

// The SVG that defines the three wobble filters. The region is generous so
// the hard shadow, which sticks out past the box, is not clipped.
export function filterMarkup(frames = FRAMES) {
    const filters = frames.map(({id, seed}) =>
        `<filter id="${id}" x="-20%" y="-40%" width="140%" height="180%">` +
        `<feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="${seed}"/>` +
        `<feDisplacementMap in="SourceGraphic" scale="5.5"/></filter>`).join("");
    return `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">${filters}</svg>`;
}

function addLine(element) {
    if (element.querySelector(":scope > .line")) return;
    const line = document.createElement("span");
    line.className = "line wob";
    line.setAttribute("aria-hidden", "true");
    element.prepend(line);
}

function addLines(root) {
    if (root.matches?.(".up")) addLine(root);
    root.querySelectorAll?.(".up").forEach(addLine);
}

// Call once per page. Adds the filters, then a `.line` to every `.up` now and
// to any that are added later (the hand tiles are created by the game).
export function startInk() {
    document.body.insertAdjacentHTML("afterbegin", filterMarkup());
    addLines(document.body);
    new MutationObserver(changes => {
        for (const change of changes) change.addedNodes.forEach(node => node.nodeType === 1 && addLines(node));
    }).observe(document.body, {childList: true, subtree: true});
}
