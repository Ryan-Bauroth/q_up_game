import {Node} from "./node.js";
import {drawPieceShape, colorForNode, bodyEdgeDistance, shadeBeamEnd} from "./pieces.js";

// "How to play": a short, skippable card that opens only from the ? button.
// Each step has a heading, a few plain sentences, and a small diagram drawn
// with the game's own piece renderer so the shapes and colors match exactly.
//
// Wording rules: a piece is *activated*; a red piece *passes the chain on*. The
// words "charge", "fire", "activate" and "depleted" are deliberately avoided.

const piece = (abilities, charges = 1, locked = false) =>
    new Node({id: 1, charges, abilities, locked});

const PIECE = 56;                 // diagram piece size in CSS pixels
const W = 380, H = 124;           // diagram size in CSS pixels

// A beam between two pieces, running edge to edge in the sender's color, with
// a slight shadow at each end where it meets a piece (like on the board).
function beam(ctx, a, nodeA, b, nodeB) {
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const tuck = 5;
    const from = bodyEdgeDistance(nodeA, PIECE, angle) - tuck;
    const to = bodyEdgeDistance(nodeB, PIECE, angle + Math.PI) - tuck;
    const p = {x: a.x + Math.cos(angle) * from, y: a.y + Math.sin(angle) * from};
    const q = {x: b.x - Math.cos(angle) * to, y: b.y - Math.sin(angle) * to};
    ctx.save();
    ctx.lineCap = "butt";
    ctx.strokeStyle = colorForNode(nodeA).fill;
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
    ctx.stroke();
    ctx.restore();
    shadeBeamEnd(ctx, p, q, tuck, 9);
    shadeBeamEnd(ctx, q, p, tuck, 9);
}

function arrowTo(ctx, x1, x2, y) {
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle = "#9a9a9a";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2 - 6, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y);
    ctx.lineTo(x2 - 10, y - 6);
    ctx.lineTo(x2 - 10, y + 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function label(ctx, text, x, y) {
    ctx.save();
    ctx.fillStyle = "#777";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(text, x, y);
    ctx.restore();
}

// A dot like the ones on the board: the activating piece's color, with a
// white halo and a dark ring so it reads on any piece.
function dot(ctx, x, y, color, scale = 1) {
    for (const [radius, fill] of [[5.5, "#ffffff"], [4.2, "#1f1f1f"], [3.2, color]]) {
        ctx.beginPath();
        ctx.arc(x, y, radius * scale, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
    }
}

const STEPS = [
    {
        heading: "The goal",
        body: [
            "Every piece on the board shows a number. Get them all to 0.",
            "Press Run. If every number reaches 0, you win.",
        ],
        draw(ctx) {
            const y = 50, size = 44;
            const row = [piece([], 2), piece(["adjacentBurst"], 1), piece(["runPulseDown"], 1)];
            row.forEach((node, i) => drawPieceShape(ctx, node, 30 + i * 50, y, size));
            arrowTo(ctx, 172, 214, y);
            row.forEach((node, i) => {
                const done = node.clone();
                done.charges = 0;
                drawPieceShape(ctx, done, 254 + i * 50, y, size);
            });
            label(ctx, "numbers to clear", 80, 96);
            label(ctx, "all at 0", 304, 96);
        },
    },
    {
        heading: "Start the chain",
        body: [
            "Yellow pieces start the chain on Run. Red pieces pass it on when activated.",
            "Arrows show where it goes.",
        ],
        draw(ctx) {
            const y = 56;
            const starter = piece(["runPulseRight"]);
            const red = piece(["passRight"]);   // a red piece with just one arrow, pointing right
            const target = piece([]);
            const a = {x: 54, y}, b = {x: 160, y};
            beam(ctx, a, starter, b, red);
            beam(ctx, b, red, {x: 262, y}, target);
            drawPieceShape(ctx, starter, a.x, a.y, PIECE);
            drawPieceShape(ctx, red, b.x, b.y, PIECE);
            drawPieceShape(ctx, target, 262, y, PIECE);
            label(ctx, "starts on Run", 54, 108);
            label(ctx, "passes it on", 160, 108);
            label(ctx, "target", 262, 108);
        },
    },
    {
        heading: "Targets and numbers",
        body: [
            "Teal circles are targets. They just need activating.",
            "A number is how many activations a piece still needs. Red pieces pass the chain on each time.",
        ],
        draw(ctx) {
            const y = 54;
            const s1 = piece(["runPulseRight"]), s2 = piece(["runPulseLeft"]);
            const target = piece([], 2);
            beam(ctx, {x: 66, y}, s1, {x: 190, y}, target);
            beam(ctx, {x: 314, y}, s2, {x: 190, y}, target);
            drawPieceShape(ctx, s1, 66, y, PIECE);
            drawPieceShape(ctx, s2, 314, y, PIECE);
            drawPieceShape(ctx, target, 190, y, PIECE);
            label(ctx, "needs 2 activations", 190, 108);
        },
    },
    {
        heading: "Your hand",
        body: [
            "Drag pieces onto the board. Hand pieces show 0: they never have to be activated. Padlocked ones are fixed.",
            "Drop on another piece to swap, or drag off the board to take back.",
        ],
        draw(ctx) {
            const y = 50;
            drawPieceShape(ctx, piece(["runPulseRight"]), 60, y, PIECE);
            arrowTo(ctx, 100, 168, y);
            // an empty cell on the board
            ctx.save();
            ctx.strokeStyle = "#c4c4c4";
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 4]);
            ctx.strokeRect(176, y - 30, 60, 60);
            ctx.restore();
            drawPieceShape(ctx, piece([], 1, true), 312, y, PIECE);
            label(ctx, "from your hand", 60, 108);
            label(ctx, "onto the board", 206, 108);
            label(ctx, "padlock = fixed", 312, 108);
        },
    },
    {
        heading: "Piece guide",
        legend: [
            {node: piece(["runPulseDown"]), name: "Yellow", text: "Starts the chain on Run. Can't be activated."},
            {node: piece(["adjacentBurst"]), name: "Red", text: "Passes the chain on when activated. Arrows show where."},
            {node: piece(["lineSkip2Right"]), name: "Red w/ outline", text: "Skip piece: jumps over the next tile."},
            {node: piece(["columnPulse"]), name: "Purple", text: "Column piece: activates its whole column."},
            {node: piece([], 2), name: "Teal", text: "Target: just needs activating. Its number is how many times."},
        ],
        body: [],
    },
    {
        heading: "Dots",
        height: 172,
        body: [
            "A dot means another piece will activate it from afar.",
            "The dot's color is the piece that will activate it.",
            "The dots menu can show dots for every piece, or none.",
            "Ready? Drag the pieces onto level 1 and press Run.",
        ],
        draw(ctx) {
            // two short stretches of board column, three cells tall each
            const cell = 44, top = 7;
            const skipper = piece(["skipDown2"]);
            const column = piece(["columnPulse"]);
            const purple = colorForNode(column).fill;
            const red = colorForNode(skipper).fill;
            const rowY = r => top + cell * r + cell / 2;

            const strip = (left, tinted) => {
                ctx.save();
                if (tinted) {
                    ctx.fillStyle = "rgba(123, 95, 196, 0.16)";
                    ctx.fillRect(left, top, cell, cell * 3);
                }
                ctx.strokeStyle = "#d3d3d3";
                ctx.lineWidth = 1.5;
                for (let r = 0; r < 3; r++) ctx.strokeRect(left, top + cell * r, cell, cell);
                ctx.restore();
            };
            const arc = (left, fromRow, toRow, color) => {
                ctx.save();
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 4]);
                ctx.lineCap = "round";
                ctx.beginPath();
                const x = left + cell + 2, controlX = left + cell + 34;
                const y1 = rowY(fromRow), y2 = rowY(toRow), controlY = (y1 + y2) / 2;
                ctx.moveTo(x, y1);
                ctx.quadraticCurveTo(controlX, controlY, x, y2);
                ctx.stroke();

                // an arrowhead at the end, pointing along the curve into the target
                const angle = Math.atan2(y2 - controlY, x - controlX);
                ctx.setLineDash([]);
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.moveTo(x, y2);
                ctx.lineTo(x - Math.cos(angle - 0.5) * 9, y2 - Math.sin(angle - 0.5) * 9);
                ctx.lineTo(x - Math.cos(angle + 0.5) * 9, y2 - Math.sin(angle + 0.5) * 9);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            };
            const caption = (x, text) => {
                ctx.save();
                ctx.fillStyle = "#777";
                ctx.font = "12px sans-serif";
                ctx.textAlign = "center";
                ctx.fillText(text, x, top + cell * 3 + 20);
                ctx.restore();
            };

            // left: a skip piece jumps 2 cells down onto the target
            const leftA = 60, cxA = leftA + cell / 2;
            strip(leftA, false);
            arc(leftA, 0, 2, red);
            drawPieceShape(ctx, skipper, cxA, rowY(0), 38);
            drawPieceShape(ctx, piece([], 2), cxA, rowY(2), 38);
            dot(ctx, cxA, rowY(2) - 10, red, 0.65);
            caption(leftA + cell / 2 + 20, "skip piece: jumps 2 down");

            // right: a column piece activates its whole column, near or far
            const leftB = 250, cxB = leftB + cell / 2;
            strip(leftB, true);
            arc(leftB, 2, 0, purple);
            drawPieceShape(ctx, piece([], 2), cxB, rowY(0), 38);
            drawPieceShape(ctx, column, cxB, rowY(2), 40);
            dot(ctx, cxB, rowY(0) - 10, purple, 0.65);
            caption(leftB + cell / 2 + 20, "column piece: whole column");
        },
    },
];

export function initTutorial(openButton) {
    const overlay = document.getElementById("tutorial");
    const dialog = overlay.querySelector(".tutorial-dialog");
    const heading = document.getElementById("tutorial-title");
    const body = document.getElementById("tutorial-body");
    const canvas = document.getElementById("tutorial-canvas");
    const legend = document.getElementById("tutorial-legend");
    const dots = document.getElementById("tutorial-dots");
    const backButton = document.getElementById("tutorial-back");
    const nextButton = document.getElementById("tutorial-next");
    const closeButton = document.getElementById("tutorial-close");

    const scale = 2;
    canvas.width = W * scale;
    canvas.height = H * scale;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;

    let step = 0;
    let returnFocus = null;

    function show() {
        const current = STEPS[step];
        heading.textContent = current.heading;
        body.replaceChildren(...current.body.map(text => {
            const p = document.createElement("p");
            p.textContent = text;
            return p;
        }));
        if (current.legend) {
            // a list of piece types, each with a small picture of the piece
            canvas.hidden = true;
            legend.hidden = false;
            legend.replaceChildren(...current.legend.map(({node, draw, name, text}) => {
                const row = document.createElement("div");
                row.className = "legend-row";
                const icon = document.createElement("canvas");
                icon.width = icon.height = 42 * scale;
                icon.style.width = icon.style.height = "42px";
                const ictx = icon.getContext("2d");
                ictx.setTransform(scale, 0, 0, scale, 0, 0);
                if (draw) draw(ictx);
                else drawPieceShape(ictx, node, 21, 21, 36);
                const words = document.createElement("div");
                const strong = document.createElement("strong");
                strong.textContent = name;
                words.append(strong, document.createTextNode(` — ${text}`));
                row.append(icon, words);
                return row;
            }));
        } else {
            legend.hidden = true;
            canvas.hidden = false;
            const height = current.height ?? H;
            canvas.height = height * scale;
            canvas.style.height = `${height}px`;
            const ctx = canvas.getContext("2d");
            ctx.setTransform(scale, 0, 0, scale, 0, 0);
            ctx.clearRect(0, 0, W, height);
            current.draw(ctx);
        }
        dots.replaceChildren(...STEPS.map((_, i) => {
            const dot = document.createElement("span");
            dot.className = "tutorial-dot" + (i === step ? " current" : "");
            return dot;
        }));
        backButton.disabled = step === 0;
        nextButton.textContent = step === STEPS.length - 1 ? "Done" : "Next";
    }

    function open() {
        step = 0;
        returnFocus = document.activeElement;
        overlay.hidden = false;
        show();
        nextButton.focus();
    }

    function close() {
        overlay.hidden = true;
        if (returnFocus && returnFocus.focus) returnFocus.focus();
    }

    function next() {
        if (step === STEPS.length - 1) close();
        else { step += 1; show(); }
    }

    function back() {
        if (step > 0) { step -= 1; show(); }
    }

    openButton.addEventListener("click", open);
    closeButton.addEventListener("click", close);
    nextButton.addEventListener("click", next);
    backButton.addEventListener("click", back);
    // clicking the dimmed area outside the card closes it
    overlay.addEventListener("mousedown", e => {
        if (e.target === overlay) close();
    });
    document.addEventListener("keydown", e => {
        if (overlay.hidden) return;
        if (e.key === "Escape") close();
        else if (e.key === "ArrowRight") next();
        else if (e.key === "ArrowLeft") back();
        else if (e.key === "Tab") {
            // keep keyboard focus inside the card
            const focusable = [...dialog.querySelectorAll("button:not([disabled])")];
            const first = focusable[0], last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
    });

    return {open};
}
