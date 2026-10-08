// The tutorial's lessons: six tiny 3x3 puzzles, each with just a few pieces and
// exactly one solution. x is the column, y the row (y grows downward).
// Wording: a piece is *activated*; a red piece *passes the chain on*.

const level = (title, definition, text) => ({title, definition: {size: 3, name: title, ...definition}, ...text});

export const LEVELS = [
    level("The goal", {
        locked: [[0, 1, "pusher"], [1, 1, "receiver"]], hand: [], solution: [],
    }, {
        hint: "Every piece shows a number. Get them all to 0. Press Run!",
        help: "Yellow starts the chain when you press Run. It activates the teal circle beside it.",
        miss: "Press Run to start the chain.",
        win: "Nice! Every piece hit 0, so you win.",
    }),
    level("Your hand", {
        locked: [[2, 1, "receiver"]], hand: ["pusher"], solution: [{x: 1, y: 1, kind: "pusher"}],
    }, {
        hint: "Drag the yellow piece onto the board, then press Run.",
        help: "Yellow starts the chain. It activates the cell its arrow points to, so put it next to the target.",
        miss: "Not yet. Drop it beside the target, where its arrow points.",
        win: "Nice! Drop a piece on another to swap, or drag it off to take it back. Padlocked pieces stay put.",
    }),
    level("Pass it on", {
        locked: [[0, 1, "pusher"], [2, 1, "receiver"], [1, 0, "receiver"]], hand: ["burster"], solution: [{x: 1, y: 1, kind: "burster"}],
    }, {
        hint: "Yellow can't reach the teal targets. Put the red piece where yellow's arrow lands.",
        help: "Red pieces pass the chain on when activated. Their arrows show where: this one hits all four neighbours.",
        miss: "Not yet. Yellow must activate the red piece.",
        win: "Nice! Yellow starts the chain; red passes it on.",
    }),
    level("Numbers", {
        locked: [[0, 1, "pusher"], [1, 1, "receiver", 2]], hand: ["pulseLeft"], solution: [{x: 2, y: 1, kind: "pulseLeft"}],
    }, {
        hint: "This target shows a 2: it needs two activations. Add a second starter.",
        help: "A number is how many activations a piece still needs. Yellow already hits it from the left; send another from the right.",
        miss: "Not yet. The target needs another activation.",
        win: "Nice! Two activations took the 2 to 0.",
    }),
    level("Skip piece", {
        locked: [[2, 0, "pulseLeft"], [1, 2, "receiver"]], hand: ["dive"], solution: [{x: 1, y: 0, kind: "dive"}],
    }, {
        hint: "Outlined red pieces skip a tile. Put it where yellow's arrow lands.",
        help: "It jumps two cells down, over the empty cell, onto the target. Watch for the small dot on the target.",
        miss: "Not yet. Yellow must activate the skip piece first.",
        win: "Nice! A skip piece jumps over the tile in between.",
        // once the piece is placed, a little arrow points out the dot it puts on the target
        note: {cell: {x: 1, y: 2}, text: "This dot means another piece will activate this one. By default, dots only show for pieces that skip squares. Change this in the dots menu."},
    }),
    level("Column piece", {
        locked: [[0, 2, "pusher"], [1, 0, "receiver"]], hand: ["column"], solution: [{x: 1, y: 2, kind: "column"}],
    }, {
        hint: "Purple column pieces activate their whole column. Put it where yellow's arrow lands.",
        help: "It reaches the whole column, near or far, so it can hit the target two cells away. Watch for the small dot on the target.",
        miss: "Not yet. Yellow must activate the column piece, in the target's column.",
        win: "Nice! A column piece reaches every cell in its column.",
    }),
];
