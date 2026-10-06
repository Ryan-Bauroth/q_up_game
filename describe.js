import {ABILITIES, isStarter} from "./abilities.js";
import {pieceType, skipDepth} from "./pieces.js";

// The piece is titled by its color; a red piece that skips tiles (the one
// with the corner marks) is "Red w/ outline".
const COLOR_NAMES = {receiver: "Teal", starter: "Yellow", beam: "Purple"};

// Pure: the short description shown when you hover a piece: its color as the
// title, then quick facts (as bullet points), then a one-sentence description
// of what it does.
// "Activations needed" is how many more times the piece must be activated to reach 0.
export function describePiece(node) {
    const type = pieceType(node);
    const title = COLOR_NAMES[type] ?? (skipDepth(node) > 0 ? "Red w/ outline" : "Red");
    const starter = isStarter(node);
    const needed = starter
        ? "none"
        : node.charges <= 0 ? "0 (done)" : String(node.charges);

    const description = node.abilities.length === 0
        ? "Just needs to be activated."
        : node.abilities.map(id => ABILITIES[id]?.short ?? id).join(" ");

    return {
        title,
        // quick facts: what it needs, plus "Locked" only when the piece is locked
        facts: [
            ["Activations needed", needed],
            ...(node.locked ? [["Locked", null]] : []),
        ],
        description,
    };
}
