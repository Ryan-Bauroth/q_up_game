# Guided Tutorial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the six static "How to play" slides with seven playable 3x3 lessons in the pop-up card, in the site's paper-and-ink style, with an always-available Hint button and an always-available Next.

**Architecture:** `tutorial-levels.js` holds the seven level definitions and texts (data only). `tutorial-model.js` holds the pure rules for what the hint line says and where the answer goes. `tutorial.js` is rewritten as a small controller that reuses the real `Board`, `simulate`, `playRun`, `rules.js` and `puzzles.js`. `play.html` and `style.css`/`play.css` get the new card markup and the paper look. Spec: `docs/superpowers/specs/2026-10-06-guided-tutorial-design.md`.

**Tech Stack:** vanilla ES modules, canvas, `node --test`, headless Chrome over CDP (`tools/e2e-daily.mjs` is the pattern for the e2e).

## Global Constraints
- Every level: 3x3, at most 3 pieces in total (locked + hand), no decoy hand pieces, exactly one solution, not already won before the player acts (except level 1, which wins on Run alone).
- Nothing is locked: Back and Next always work; the Hint button is always shown (tap 1: the level's help text; tap 2: the answer shown faintly on its cell).
- Wording: a piece is *activated*; a red piece *passes the chain on*. No text may contain "charge", "fire" or "depleted".
- Ink look: never set `textContent` / `innerHTML` on an existing `.up` element (its `.line` layer must survive); put changing text in an inner span.
- The tutorial still opens by itself on a first visit and from the `?` button (`game.js` `TUTORIAL_SEEN_KEY` is unchanged). `game.js` is not refactored.
- Phone width: 16px side gutter, no horizontal page scroll.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

---

### Task 1: Level data and the hint model

**Files:**
- Create: `tutorial-levels.js`, `tutorial-model.js`, `tutorial-levels.test.js`, `tutorial-model.test.js`

**Interfaces:**
- Produces `LEVELS`: array of `{title, hint, help, miss, win, definition}`; `definition` is a normal puzzle definition `{name, size: 3, locked: [[x, y, kind, charges?]], hand: [kind], solution: [{x, y, kind}]}`.
- Produces `hintLine(level, {won, misses, helpTaps})` → string; `answerShown({helpTaps})` → boolean (true from the second tap); `answerCells(level)` → `[{x, y, kind}]` (the definition's solution).

- [ ] **Step 1: Write `tutorial-levels.js`** with exactly these boards (each proven against the real engine and solver: unique solution, wins when solved, not won beforehand):

```js
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
```

- [ ] **Step 2: Write `tutorial-model.js`:**

```js
// Pure rules for the tutorial card: what the hint line says, and when the Hint
// button has gone as far as showing the answer.

// state: {won, misses (failed runs so far), helpTaps (0, 1, 2+)}
export function hintLine(level, {won = false, misses = 0, helpTaps = 0} = {}) {
    if (won) return level.win;
    if (helpTaps >= 1) return level.help;
    if (misses > 0) return level.miss;
    return level.hint;
}

// The second tap of the Hint button shows where the answer goes.
export const answerShown = ({helpTaps = 0} = {}) => helpTaps >= 2;

export const answerCells = level => level.definition.solution.map(({x, y, kind}) => ({x, y, kind}));
```

- [ ] **Step 3: Tests.** `tutorial-model.test.js`: `hintLine` order (won beats everything; help beats miss; miss beats hint; the default is the hint); `answerShown` false at 0/1, true at 2/3; `answerCells` copies. `tutorial-levels.test.js`, for every level: 7 levels in total; `buildFromDefinition` + `validatePuzzle` pass; `size === 3`; `locked.length + hand.length <= 3`; hand has no kind not in the solution (no decoys: the sorted hand kinds equal the sorted solution kinds); `findSolutions(definition)` is complete and equals exactly the stored solution (one solution; level 1: `[[]]`... see below); with the stored solution placed the board wins (`simulate`); before placing, the board wins only for level 1; every text field is a non-empty string; no text field matches `/charge|fire|depleted/i`.
  For level 1 `findSolutions` returns `{solutions: [[]]}` or an empty list: assert `simulate` on the unplaced board wins and the hand is empty, and skip the solver comparison for it.
- [ ] **Step 4:** `node --test tutorial-model.test.js tutorial-levels.test.js` passes, then `npm test` passes.
- [ ] **Step 5: Commit** `Add the tutorial's seven lessons and the hint rules`.

---

### Task 2: The guided card (markup, style, controller)

**Files:**
- Modify: `play.html` (the `#tutorial` block), `style.css` and `play.css` (tutorial rules), `tutorial.js` (rewrite)
- Reuse unchanged: `board.js`, `engine.js` (`simulate`, `cloneGrid`), `runner.js` (`playRun`), `rules.js` (`canDrag`, `canDrop`, `applyDrop`, `validatePuzzle`, `placedPieces`), `puzzles.js` (`buildFromDefinition`), `pieces.js` (`drawPieceShape`), `ink.js` (`startInk`), `game.js` is NOT edited except that `initTutorial(openButton)` keeps its signature and `{open}` return.

**Interfaces:**
- Consumes: `LEVELS`, `hintLine`, `answerShown`, `answerCells` from Task 1.
- Produces: `initTutorial(openButton)` → `{open}` (same as today).

**Required behavior** (read `game.js` for the working drag, hand-slot, run and result code and follow its patterns; do not import from it):
- [ ] **Step 1: Markup.** In `play.html` replace the `#tutorial` block: overlay `#tutorial` > card `.tutorial-card.up` with: close button `#tutorial-close`; level title `#tutorial-title` (Caveat Brush); a hint line `#tutorial-hint` with an inner `<span>`; a recessed `.screen` holding `<canvas id="tutorial-canvas">` (3x3, about 240px, scales down on narrow screens); the hand `#tutorial-hand` (small canvases, slots stay in place like the real hand); a row with `#tutorial-hint-button` (always visible, "Hint"), `#tutorial-run` (Run); a footer with step dots `#tutorial-dots`, `#tutorial-back` (Back), `#tutorial-next` (Next, "Done" on the last level), and a small "Skip tutorial" text button `#tutorial-skip` that closes. The card, pills and boxes use the site's `.up` / `.pill` / `.box` classes and `startInk` wobble; no white rounded dialog, no `#fff` card background (use the paper tokens from `paper.css`).
- [ ] **Step 2: Controller.** For the current level: `buildFromDefinition(level.definition)` + `validatePuzzle`; a `Board` (3x3) on `#tutorial-canvas` set to the card's size; render the hand with per-piece slots. Drag from the hand to an empty cell; drop on a placed piece to swap; drag a placed piece off the board to take it back; locked pieces cannot move (`canDrag`, `applyDrop`). Run: `simulate(cloneGrid(grid), 3)` then `playRun(board, trace, 3, {getSpeed: () => 1.2})`; a win sets `won` for that level (kept when moving between levels), shows `level.win` in the hint line, fills the step dot, and does NOT lock or auto-advance anything. A miss increments `misses`, restores the player's layout (like the real game), and shows `level.miss`. Level 1 has nothing to place: Run wins.
- [ ] **Step 3: Hint button** is always shown. Tap 1 → `helpTaps = 1` → the hint line shows `level.help`. Tap 2 → `helpTaps = 2` and, via `answerCells`, the answer piece(s) are drawn faintly (globalAlpha about 0.35) on their cells in the board (the player still has to drag the real piece there). On level 1 tap 2 does nothing extra. `helpTaps` and `misses` reset per level visit; `won` persists.
- [ ] **Step 4: Navigation.** Back and Next always work (Next reads "Done" on the last level and closes). Step dots: one per level, `current` and `won` styles. Escape and the close button leave; clicking the dimmed area closes; Tab stays inside the card (keep the existing focus trap); focus returns to the opener on close. Left/right arrow keys do nothing special.
- [ ] **Step 5: Style.** Paper look: card on the paper background with the ink border and offset shadow like `.box`; title in `--font-title`/Caveat Brush, text in Patrick Hand; the board in the recessed `.screen` like the play page; dots in ink and green for won; Run in the filled `.btn.fill` style. Works at 360px wide, no horizontal scroll, the card scrolls inside if the viewport is short.
- [ ] **Step 6: Verify.** `npm test` passes; open the page in headless Chrome (see Task 3) and look at screenshots of levels 1, 2 and 7 on desktop and 390px wide.
- [ ] **Step 7: Commit** `Make the tutorial seven playable lessons`.

---

### Task 3: End-to-end test

**Files:** Create `tools/e2e-tutorial.mjs` (pattern: `tools/e2e-daily.mjs`: static server URL via `QUP_URL`, Chrome via CDP, own temp profile, real mouse events for drags).

- [ ] **Step 1:** Fresh profile, open `play.html?size=3&mode=unlimited`: the tutorial opens by itself (first visit) at level 1; the seen flag is set.
- [ ] **Step 2:** For each of the 7 levels: check the hint line equals the level's `hint`; check Next is enabled before the level is won (click Next on level 2 and Back to prove skipping works, then return); check the Hint button is visible; press Run on a deliberately wrong layout (leave it empty on levels 2–7) and check the hint line becomes the level's `miss` and the layout is unchanged; tap Hint once (`help` shows) and twice (the faint answer is drawn: check via a canvas pixel or a `data-answer="shown"` attribute set by the controller); then drag the real piece(s) with real mouse events to the answer cell(s), Run, and check the hint line equals `win` and the step dot is marked won.
- [ ] **Step 3:** After level 7 Next reads "Done"; clicking it closes the card. Reopen with the `?` button: it starts at level 1.
- [ ] **Step 4:** At 390px wide: no horizontal scroll (`document.documentElement.scrollWidth <= innerWidth`), and screenshots of levels 1, 4 and 7 saved for a human to look at.
- [ ] **Step 5:** Print `PASS`. Run `npm test` and `node tools/e2e-tutorial.mjs` (with a static server on a free port). Commit `Test the tutorial end to end in Chrome`.
