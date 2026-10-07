// The tutorial's lessons: seven tiny 3x3 puzzles, each with at most 3 pieces and
// exactly one solution. x is the column, y the row (y grows downward).
// Wording: a piece is *activated*; a red piece *passes the chain on*.

const level = (title, definition, text) => ({title, definition: {size: 3, name: title, ...definition}, ...text});

export const LEVELS = [
    level("The goal", {
        locked: [[0, 1, "pusher"], [1, 1, "receiver"]], hand: [], solution: [],
    }, {
        hint: "Every piece shows a number. Get them all to 0. Press Run!",
        help: "The yellow piece starts the chain when you press Run. It activates the teal circle next to it.",
        miss: "Press Run to start the chain.",
        win: "Nice! The number hit 0, so you win.",
    }),
    level("Your hand", {
        locked: [[2, 1, "receiver"]], hand: ["pusher"], solution: [{x: 1, y: 1, kind: "pusher"}],
    }, {
        hint: "Drag the yellow piece from your hand onto the board, then press Run.",
        help: "Yellow pieces start the chain. This one activates the cell its arrow points to, so put it right next to the teal target.",
        miss: "Not yet. Drop the yellow piece beside the target, on the side its arrow points to.",
        win: "Nice! Tip: drop a piece on another piece to swap, or drag it off the board to take it back. Padlocked pieces stay put.",
    }),
    level("Pass it on", {
        locked: [[0, 0, "pusher"], [2, 0, "receiver"]], hand: ["burster"], solution: [{x: 1, y: 0, kind: "burster"}],
    }, {
        hint: "The yellow piece can't reach the target. Put the red piece where yellow's arrow lands.",
        help: "Red pieces pass the chain on when they are activated. Their arrows show where it goes next.",
        miss: "Not yet. The red piece must be the one the yellow piece activates.",
        win: "Nice! Yellow starts the chain; red passes it on.",
    }),
    level("Numbers", {
        locked: [[0, 1, "pusher"], [1, 1, "receiver", 2]], hand: ["pulseLeft"], solution: [{x: 2, y: 1, kind: "pulseLeft"}],
    }, {
        hint: "This target shows a 2: it needs to be activated twice. Add a second starter.",
        help: "A number is how many activations a piece still needs. One yellow piece already hits it from the left; send another in from the right.",
        miss: "Not yet. The target still needs another activation.",
        win: "Nice! Two activations took the 2 down to 0.",
    }),
    level("Skip piece", {
        locked: [[2, 0, "pulseLeft"], [1, 2, "receiver"]], hand: ["dive"], solution: [{x: 1, y: 0, kind: "dive"}],
    }, {
        hint: "Red pieces with an outline skip over the next tile. Put it where the yellow piece's arrow lands.",
        help: "The skip piece jumps two cells down, over the empty cell between, onto the target.",
        miss: "Not yet. The skip piece has to be activated by the yellow piece first.",
        win: "Nice! A skip piece jumps over the tile in between.",
    }),
    level("Column piece", {
        locked: [[0, 2, "pusher"], [1, 0, "receiver"]], hand: ["column"], solution: [{x: 1, y: 2, kind: "column"}],
    }, {
        hint: "Purple column pieces activate their whole column. Put it where the yellow piece's arrow lands.",
        help: "The column piece reaches the whole column, near or far, so it can activate the target two cells away.",
        miss: "Not yet. The column piece has to be activated by the yellow piece, in the target's column.",
        win: "Nice! A column piece reaches every cell in its column.",
    }),
    level("Dots", {
        locked: [[0, 1, "pulseUp"], [0, 2, "receiver"]], hand: ["dive"], solution: [{x: 0, y: 0, kind: "dive"}],
    }, {
        hint: "Place the skip piece and look for the dot, then press Run.",
        help: "A dot on a piece means another piece will activate it from afar. The dot's color is the piece that will do it. The dots menu can show dots for every piece, or none.",
        miss: "Not yet. Put the skip piece where the yellow piece's arrow lands.",
        win: "You're ready! Drag the pieces onto the board and press Run.",
    }),
];
