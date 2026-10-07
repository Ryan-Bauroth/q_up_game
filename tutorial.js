import {makeEmptyNode} from "./node.js";
import {Board} from "./board.js";
import {simulate, cloneGrid} from "./engine.js";
import {playRun} from "./runner.js";
import {drawPieceShape, targetCells} from "./pieces.js";
import {buildFromDefinition, makePiece} from "./puzzles.js";
import {canDrag, applyDrop, validatePuzzle} from "./rules.js";
import {LEVELS} from "./tutorial-levels.js";
import {hintLine, answerShown, answerCells} from "./tutorial-model.js";

// "How to play": seven tiny 3x3 puzzles played inside the pop-up card. It has
// its own small controller (drag, drop, Run) on top of the real Board,
// simulate and playRun; game.js is not involved beyond opening it.
//
// Nothing is locked: the arrows always work (after a win the Run button reads Next / Done), and the Hint button is always
// there (first tap: the level's help text; second tap: the answer drawn faintly
// on its cell, for the player to place).

const SIZE = 3;
const BOARD_PIXELS = 320;      // the board's own drawing space (as the real 3x3 board); shown smaller by CSS
const HAND_PIECE = 46;         // hand tile canvas size in CSS pixels
const ANSWER_ALPHA = 0.35;
const MISS_HOLD_MS = 700;      // how long a missed run stays on screen before the layout comes back

// The board, plus the faint answer pieces once the Hint button has shown them.
class TutorialBoard extends Board {
    answer = [];   // [{x, y, kind}] to draw faintly, or []

    drawBoard() {
        super.drawBoard();
        if (this.answer.length === 0) return;
        const coverage = this.beamCoverage();
        for (const {x, y, kind} of this.answer) {
            const here = this.grid[x][y];
            if (!here.isEmpty && here.kind === kind) continue;   // already placed there
            const c = this.cellCenter(x, y);
            // faded the way the board fades pieces, backed by the cell's own color
            drawPieceShape(this.ctx, makePiece(kind, 1, false, false), c.x, c.y, this.gridSize * 0.92,
                ANSWER_ALPHA, this.cellBackground(coverage, x, y));
        }
    }
}

export function initTutorial(openButton) {
    const overlay = document.getElementById("tutorial");
    const card = overlay.querySelector(".tutorial-card");
    const title = document.getElementById("tutorial-title");
    const hint = document.getElementById("tutorial-hint");
    const hintText = hint.querySelector("span");
    const canvas = document.getElementById("tutorial-canvas");
    const handEl = document.getElementById("tutorial-hand");
    const hintButton = document.getElementById("tutorial-hint-button");
    const runButton = document.getElementById("tutorial-run");
    const runLabel = document.getElementById("tutorial-run-label");
    const dots = document.getElementById("tutorial-dots");
    const backButton = document.getElementById("tutorial-back");
    const nextButton = document.getElementById("tutorial-next");
    const closeButton = document.getElementById("tutorial-close");

    canvas.width = canvas.height = BOARD_PIXELS;
    const board = new TutorialBoard(canvas, BOARD_PIXELS, SIZE);
    // Draw at the screen's pixel density so the small board stays sharp: the
    // board still works in its own 320-pixel space, scaled up underneath.
    const density = Math.min(Math.max(window.devicePixelRatio || 1, 1), 3);
    canvas.width = canvas.height = Math.round(BOARD_PIXELS * density);
    board.ctx.scale(canvas.width / BOARD_PIXELS, canvas.height / BOARD_PIXELS);

    // The dragged piece floats above everything in its own canvas.
    const ghost = document.createElement("canvas");
    ghost.id = "tutorial-ghost";
    ghost.hidden = true;
    document.body.appendChild(ghost);

    let index = 0;                 // the level on screen
    let won = new Set();           // levels won since the card was opened
    let misses = 0, helpTaps = 0;  // per visit to a level
    let pool = [];                 // hand pieces not on the board
    const slotOf = new Map();      // piece id -> its hand slot, so slots stay in place
    let preRunGrid = null;         // the player's layout while a finished run is on screen
    let running = false;
    let advance = false;           // the main button currently reads Next / Done
    let runId = 0;                 // bumped when the level changes, so a stale run is ignored
    let returnFocus = null;

    const level = () => LEVELS[index];

    // ---- drawing ----

    function showHint() {
        const isWon = won.has(index);
        hintText.textContent = hintLine(level(), {won: isWon, misses, helpTaps});
        hint.dataset.tone = isWon ? "win" : (helpTaps === 0 && misses > 0 ? "miss" : "");
    }

    function showAnswer() {
        const shown = answerShown({helpTaps}) && !running;
        board.answer = shown ? answerCells(level()) : [];
        card.dataset.answer = answerShown({helpTaps}) && answerCells(level()).length > 0 ? "shown" : "hidden";
    }

    function draw() {
        showAnswer();
        board.drawBoard();
    }

    function renderHand() {
        const slots = level().definition.hand.length;
        handEl.replaceChildren();
        if (slots === 0) {
            const empty = document.createElement("div");
            empty.className = "tutorial-hand-empty";
            empty.textContent = "Nothing to place this time.";
            handEl.append(empty);
            return;
        }
        const held = new Map(pool.map((node, at) => [slotOf.get(node.id), {node, at}]));
        for (let slot = 0; slot < slots; slot++) {
            const entry = held.get(slot);
            if (!entry) {
                const gap = document.createElement("div");
                gap.className = "pool-slot";
                handEl.append(gap);
                continue;
            }
            const tile = document.createElement("div");
            tile.className = "pool-node up";
            tile.dataset.index = String(entry.at);
            tile.dataset.slot = String(slot);
            const scale = Math.min(window.devicePixelRatio || 1, 2);
            const piece = document.createElement("canvas");
            piece.width = piece.height = HAND_PIECE * scale;
            piece.style.width = piece.style.height = `${HAND_PIECE}px`;
            const ctx = piece.getContext("2d");
            ctx.scale(scale, scale);
            drawPieceShape(ctx, entry.node, HAND_PIECE / 2, HAND_PIECE / 2, HAND_PIECE * 0.92);
            tile.append(piece);
            tile.addEventListener("pointerdown", e => startDragFromHand(e, entry.at));
            handEl.append(tile);
        }
    }

    function renderDots() {
        dots.replaceChildren(...LEVELS.map((_, i) => {
            const dot = document.createElement("span");
            dot.className = "tutorial-dot" + (i === index ? " current" : "") + (won.has(i) ? " won" : "");
            return dot;
        }));
    }

    function renderButtons() {
        backButton.disabled = index === 0;
        const last = index === LEVELS.length - 1;
        nextButton.setAttribute("aria-label", last ? "Done" : "Next");
        nextButton.dataset.tip = last ? "Done" : "Next";
        // after a win the main button moves on; touching a piece puts it back to Run
        advance = won.has(index) && preRunGrid !== null && !running;
        runLabel.textContent = advance ? (last ? "Done" : "Next") : "Run";
        runButton.disabled = running;
        card.dataset.state = running ? "running" : "idle";
    }

    // ---- levels ----

    function loadLevel(at) {
        runId += 1;
        running = false;
        index = at;
        misses = 0;
        helpTaps = 0;
        const puzzle = buildFromDefinition(level().definition);
        validatePuzzle(puzzle.grid, puzzle.pool);
        board.grid = puzzle.grid;
        pool = puzzle.pool;
        slotOf.clear();
        pool.forEach((node, slot) => slotOf.set(node.id, slot));
        preRunGrid = null;
        board.effects = Board.emptyEffects();
        board.previewCells = [];
        board.hoverCell = null;
        board.interactive = true;
        cancelDrag();
        title.textContent = level().title;
        card.dataset.level = String(at + 1);
        showHint();
        renderHand();
        renderDots();
        renderButtons();
        draw();
    }

    // A finished run (a win) stays on screen until the player touches a piece or
    // runs again; this puts their layout back.
    function restoreLayout() {
        if (!preRunGrid) return;
        board.grid = preRunGrid;
        preRunGrid = null;
        board.effects = Board.emptyEffects();
        renderButtons();
    }

    async function run() {
        if (running) return;
        if (advance) {
            next();
            return;
        }
        restoreLayout();
        running = true;
        const myRun = runId;
        board.interactive = false;
        board.previewCells = [];
        board.hoverCell = null;
        renderButtons();
        preRunGrid = cloneGrid(board.grid, SIZE);
        const result = simulate(cloneGrid(board.grid, SIZE), SIZE);
        draw();   // without the faint answer while it plays
        await playRun(board, result.trace, SIZE, {getSpeed: () => 1.2});
        if (myRun !== runId) return;   // the player moved on mid-run

        board.effects.flashes = [];
        if (result.won) {
            won.add(index);
            running = false;
            board.interactive = true;
            showHint();
            renderDots();
            renderButtons();
            draw();
            return;
        }
        misses += 1;
        showHint();
        board.drawBoard();
        // a moment to see the numbers left over, then the layout comes back
        await new Promise(resolve => setTimeout(resolve, MISS_HOLD_MS));
        if (myRun !== runId) return;
        restoreLayout();
        running = false;
        board.interactive = true;
        renderHand();
        renderButtons();
        draw();
    }

    function tapHint() {
        helpTaps = Math.min(helpTaps + 1, 2);
        showHint();
        draw();
    }

    // ---- dragging (as on the play page) ----

    let drag = null;   // {source: "pool"|"board", node, i, j, poolIndex}

    // canvas pixels under a pointer (the canvas is shown smaller than its pixels)
    function canvasPoint(e) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) * BOARD_PIXELS / rect.width,
            y: (e.clientY - rect.top) * BOARD_PIXELS / rect.height,
        };
    }

    function cellAt({x, y}) {
        const left = board.boardX + Board.OUTLINE_STROKE - 2;
        const top = board.boardY + Board.OUTLINE_STROKE - 2;
        const span = SIZE * (board.gridSize + Board.GRID_STROKE) - Board.GRID_STROKE;
        if (x < left || x > left + span || y < top || y > top + span) return null;
        const step = board.gridSize + Board.GRID_STROKE;
        const clamp = n => Math.max(0, Math.min(SIZE - 1, n));
        return {
            x: clamp(Math.floor((x - board.boardX - Board.OUTLINE_STROKE + Board.GRID_STROKE / 2) / step)),
            y: clamp(Math.floor((y - board.boardY - Board.OUTLINE_STROKE + Board.GRID_STROKE / 2) / step)),
        };
    }

    function showGhost(node, e) {
        // the same size as a piece on the board as it is shown
        const shown = board.gridSize * canvas.getBoundingClientRect().width / BOARD_PIXELS;
        const scale = Math.min(window.devicePixelRatio || 1, 2);
        ghost.width = ghost.height = Math.ceil(shown * scale);
        ghost.style.width = ghost.style.height = `${Math.ceil(shown)}px`;
        const ctx = ghost.getContext("2d");
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.clearRect(0, 0, shown, shown);
        drawPieceShape(ctx, node, shown / 2, shown / 2, shown * 0.92);
        ghost.hidden = false;
        moveGhost(e);
    }

    function moveGhost(e) {
        const half = parseFloat(ghost.style.width) / 2;
        ghost.style.transform = `translate(${e.clientX - half}px, ${e.clientY - half}px)`;
    }

    function beginDrag(e, details) {
        e.preventDefault();
        drag = details;
        board.dragging = true;
        board.dragSource = details.source;
        board.draggedObject = details.node;
        board.previewCells = [];
        board.hoverCell = null;
        showGhost(details.node, e);
        draw();
    }

    function startDragFromHand(e, at) {
        if (running || drag || e.button !== 0) return;
        restoreLayout();
        handEl.querySelector(`.pool-node[data-index="${at}"]`)?.classList.add("dragging");
        beginDrag(e, {source: "pool", node: pool[at], poolIndex: at});
    }

    canvas.addEventListener("pointerdown", e => {
        if (running || drag || e.button !== 0) return;
        const cell = cellAt(canvasPoint(e));
        if (!cell) return;
        if (preRunGrid) {
            // touching the board after a win puts the player's layout back
            restoreLayout();
            draw();
        }
        const node = board.grid[cell.x][cell.y];
        if (!canDrag(node)) return;
        board.grid[cell.x][cell.y] = makeEmptyNode();
        board.dragI = cell.x;
        board.dragJ = cell.y;
        beginDrag(e, {source: "board", node, i: cell.x, j: cell.y});
    });

    function cancelDrag() {
        drag = null;
        ghost.hidden = true;
        board.dragging = false;
        board.dragSource = null;
        board.dragI = board.dragJ = null;
        board.draggedObject = null;
    }

    document.addEventListener("pointerup", e => {
        if (!drag) return;
        applyDrop(board.grid, pool, drag, cellAt(canvasPoint(e)));
        cancelDrag();
        renderHand();
        hover(e);
        draw();
    });

    document.addEventListener("pointercancel", () => {
        if (!drag) return;
        // put the piece back where it came from
        applyDrop(board.grid, pool, drag, drag.source === "board" ? {x: drag.i, y: drag.j} : null);
        cancelDrag();
        renderHand();
        draw();
    });

    // Hovering a board piece outlines where it reaches, as on the play page.
    function hover(e) {
        const cell = !running && e.target === canvas ? cellAt(canvasPoint(e)) : null;
        const piece = cell && !board.grid[cell.x][cell.y].isEmpty ? cell : null;
        const cells = piece ? targetCells(board.grid[piece.x][piece.y], piece.x, piece.y, SIZE) : [];
        const same = (board.hoverCell?.x === piece?.x && board.hoverCell?.y === piece?.y) &&
            cells.length === board.previewCells.length;
        if (same) return;
        board.hoverCell = piece;
        board.previewCells = cells;
        draw();
    }

    document.addEventListener("pointermove", e => {
        if (overlay.hidden) return;
        if (drag) {
            moveGhost(e);
            return;
        }
        if (e.pointerType === "mouse") hover(e);
    });

    // ---- opening, closing, keys ----

    function open() {
        returnFocus = document.activeElement;
        won = new Set();
        overlay.hidden = false;
        loadLevel(0);
        runButton.focus();
    }

    function close() {
        runId += 1;
        running = false;
        cancelDrag();
        overlay.hidden = true;
        if (returnFocus && returnFocus.focus) returnFocus.focus();
    }

    function next() {
        if (index === LEVELS.length - 1) close();
        else loadLevel(index + 1);
    }

    function back() {
        if (index > 0) loadLevel(index - 1);
    }

    openButton.addEventListener("click", open);
    closeButton.addEventListener("click", close);
    nextButton.addEventListener("click", next);
    backButton.addEventListener("click", back);
    runButton.addEventListener("click", run);
    hintButton.addEventListener("click", tapHint);
    // clicking the dimmed area outside the card closes it
    overlay.addEventListener("mousedown", e => {
        if (e.target === overlay) close();
    });
    document.addEventListener("keydown", e => {
        if (overlay.hidden) return;
        if (e.key === "Escape") close();
        else if (e.key === "Tab") {
            // keep keyboard focus inside the card
            const focusable = [...card.querySelectorAll("button:not([disabled])")];
            const first = focusable[0], last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
    });

    return {open};
}
