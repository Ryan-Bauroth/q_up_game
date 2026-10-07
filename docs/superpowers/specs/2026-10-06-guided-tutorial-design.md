# Guided tutorial: six playable 3x3 lessons

## Goals
- Replace the six static "How to play" slides with six small, real 3x3 puzzles the player solves inside the same pop-up card.
- Together the levels teach everything the old slides did: the goal (numbers to 0), pressing Run, starters and red pass-on pieces, targets and their numbers, the hand and padlocks, skip and column pieces, and dots.
- The card looks like the rest of the site (paper and ink), not like a white rounded dialog.
- A level runs until the player wins it, with hints that get more helpful the longer they are stuck.

## Decisions (from the brainstorm)
- **Playable inside the pop-up card**, not on the real play page and not on a separate page.
- **Own small controller.** The real game's drag, drop and Run logic lives inline in `game.js`, so the tutorial gets a lean controller of its own that reuses the real `Board`, `simulate` and `playRun`. `game.js` is not refactored.
- **Must solve, with a Show me.** Next stays locked until the level is won. After two misses a Hint button appears; its second use shows where the answer goes. The player can always close the whole tutorial, and returning players get a quiet "Skip tutorial".
- **No separate piece-guide page.** Each new piece is named in the hint when it first appears.
- It still opens by itself on a first visit and from the `?` button. The "seen" flag is unchanged.

## 1. The card
- Heading (Caveat Brush), a one-line hint (Patrick Hand), a 3x3 board on a recessed "screen", the hand tray, a Run button, step dots, and Back / Next.
- Styled with the site's `.up` wobble pills and `.box`es and the paper background. The ink rules apply: never set `textContent` or `innerHTML` on an existing `.up` element (its `.line` layer must survive); put changing text in an inner span.
- Phone width: the card fits with a 16px gutter and no horizontal scroll; the board scales down.

## 2. The levels (`tutorial-levels.js`)
Each level is a normal puzzle definition (`{name, size: 3, locked, hand, solution}`) plus its text:
`{title, hint, missHints, solution}`. Exact boards are chosen at planning time and proven by tests.

1. **The goal and Run.** A locked starter and a target; nothing to place. Press Run. Teaches: every piece shows a number, get them all to 0, Run starts the chain.
2. **Your hand.** The starter is in the hand; the target waits on the board. Drag it into the empty cell, then Run. Hints cover dragging, dropping on another piece to swap, dragging off the board to take back, and the padlock.
3. **Pass it on.** The target is out of the starter's reach: a red piece from the hand must relay the chain. Names yellow (starts on Run) and red (passes it on); arrows show where.
4. **Numbers.** A target that needs 2 activations. Teaches that a number is how many activations a piece still needs.
5. **Skip and column pieces.** A target one cell beyond a neighbor (skip piece) and one reached along its whole column (column piece). Names the skip and column pieces.
6. **Dots.** A level where a dot appears on the target. Explains that a dot means another piece will activate it from afar, that the dot's color is the activating piece, and that the dots menu can show all or none. Ends with "Ready? Press Run" and "Done".

## 3. The controller (`tutorial.js`)
- Builds the level from its definition with `buildFromDefinition`, draws it with `Board` (3x3, a smaller canvas) and the hand as small canvases.
- Drag from the hand to an empty cell; drop on a placed piece to swap; drag off the board to take back; locked pieces cannot move (the same rules as `rules.js`: `applyDrop`, `canDrag`, `canDrop`).
- Run: `simulate` on a clone of the grid, then `playRun`. A win shows a short "Nice!" and unlocks Next. A miss restores the player's layout and changes the hint line to something specific (for example "That target still needs 1 more").
- After two misses a Hint button appears. First tap: the level's extra hint. Second tap: the answer pieces are shown on their cells (faint), still for the player to place.
- Back returns to a won level (shown solved); Next is locked on an unsolved level; Escape and the close button leave. The step dots show progress, filled for won levels.
- Keyboard: Escape closes, Tab stays inside the card (as today). Left and right arrow keys are not needed.

## 4. Testing
- `tutorial-levels.test.js` for every level: the definition validates (`validatePuzzle`), is 3x3, has no decoy hand pieces, the solver finds the stored solution and it wins, and a level that needs no placement (level 1) wins as it stands.
- A test that each level's text fields are present and that no text uses the words "charge", "fire" or "depleted" (the tutorial says a piece is *activated*; a red piece *passes the chain on*).
- A browser e2e (`tools/e2e-tutorial.mjs`, headless Chrome as in `tools/e2e-daily.mjs`) solves all six levels, checks Next is locked until each win, that a miss resets and shows the specific hint, that the Hint button appears after two misses and shows the answer on its second tap, and that finishing sets the seen flag.
- `npm test` stays green.

## Out of scope
- Changing the real game's play page, hints or rules; a separate tutorial page; a final piece-guide recap; translating text; tutorial progress saved between visits.
