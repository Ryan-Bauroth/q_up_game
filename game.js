import {makeEmptyNode} from "./node.js";
import {Board} from "./board.js";
import {simulate, cloneGrid} from "./engine.js";
import {playRun} from "./runner.js";
import {renderSummary, clearSummary} from "./summary-panel.js";
import {drawPieceShape, targetCells} from "./pieces.js";
import {buildFromDefinition, puzzleDefinition, puzzleCount, puzzleName, PUZZLE_SIZE} from "./puzzles.js";
import {generateDefinition} from "./generator.js";
import {solve} from "./solver.js";
import {canDrag, applyDrop, validatePuzzle} from "./rules.js";

const canvas = document.getElementById("canvas");
const poolEl = document.getElementById("pool");
const runButton = document.getElementById("run-button");
const clearButton = document.getElementById("clear-button");
const keepButton = document.getElementById("keep-button");
const resultBanner = document.getElementById("result-banner");

const boardSize = 400;
const gridScale = PUZZLE_SIZE;

const board = new Board(canvas, boardSize, gridScale);

// The puzzle being played: one of the hand-built ones, or a randomly
// generated one. Clear Board rebuilds fresh pieces from this definition.
let activeDefinition = puzzleDefinition(0);

// Loads the current puzzle onto the board and returns its hand.
function createPuzzle() {
    const puzzle = buildFromDefinition(activeDefinition);
    validatePuzzle(puzzle.grid, puzzle.pool);
    board.grid = puzzle.grid;
    return puzzle.pool;
}

let pool = createPuzzle();
let runComplete = false;
// True while a failed run is on screen. Grabbing any piece (or pressing Try
// Again) restores the player's layout and starts a new attempt.
let failed = false;
let animationSpeed = 1.2; // 0.5x / 1.2x / instant (1000x), chosen with the speed buttons
let preRunGrid = null; // placements as they were just before Run, so a failed try can be adjusted

const POOL_PIECE_SIZE = 52;

// The dragged piece is drawn in a floating canvas that follows the cursor, so
// it stays visible even when dragged outside the board canvas.
const ghost = document.createElement("canvas");
ghost.id = "drag-ghost";
ghost.width = ghost.height = Math.ceil(board.gridSize);
ghost.hidden = true;
document.body.appendChild(ghost);

function showGhost(node, e) {
    const ctx = ghost.getContext("2d");
    ctx.clearRect(0, 0, ghost.width, ghost.height);
    drawPieceShape(ctx, node, ghost.width / 2, ghost.height / 2, ghost.width * 0.92);
    moveGhost(e);
    ghost.hidden = false;
}

function moveGhost(e) {
    ghost.style.transform = `translate(${e.clientX - ghost.width / 2}px, ${e.clientY - ghost.height / 2}px)`;
}

function renderPool() {
    poolEl.innerHTML = "";
    pool.forEach((node, index) => {
        const el = document.createElement("div");
        el.className = "pool-node";
        el.dataset.index = String(index);

        const pieceCanvas = document.createElement("canvas");
        pieceCanvas.width = POOL_PIECE_SIZE;
        pieceCanvas.height = POOL_PIECE_SIZE;
        drawPieceShape(pieceCanvas.getContext("2d"), node, POOL_PIECE_SIZE / 2, POOL_PIECE_SIZE / 2, POOL_PIECE_SIZE * 0.92);
        el.appendChild(pieceCanvas);

        el.addEventListener("mousedown", e => startDragFromPool(e, index));
        el.addEventListener("mouseenter", () => renderSummary(node));
        el.addEventListener("mouseleave", () => renderSummary(null));
        poolEl.appendChild(el);
    });
}

// Hit-tests the whole cell (not just the drawn piece) so hover and grab
// targets line up with where pieces are actually drawn.
function checkMouseLocationForObject(mouseX, mouseY) {
    const cell = cellFromPoint(mouseX, mouseY);
    if (cell != null && !board.grid[cell.x][cell.y].isEmpty) {
        return cell;
    }
    return null;
}

// Outline the cells the hovered board piece would hit.
function setPreview(cell) {
    const cells = cell && board.interactive
        ? targetCells(board.grid[cell.x][cell.y], cell.x, cell.y, gridScale)
        : [];
    const hoverCell = cell && board.interactive ? cell : null;
    const sameHover = (hoverCell === null && board.hoverCell === null) ||
        (hoverCell !== null && board.hoverCell !== null &&
            hoverCell.x === board.hoverCell.x && hoverCell.y === board.hoverCell.y);
    const sameCells = cells.length === board.previewCells.length &&
        cells.every((c, i) => c.x === board.previewCells[i].x && c.y === board.previewCells[i].y);
    if (sameHover && sameCells) return;
    board.hoverCell = hoverCell;
    board.previewCells = cells;
    board.drawBoard();
}

function cellFromPoint(mouseX, mouseY) {
    const gridLeft = board.boardX + Board.OUTLINE_STROKE - 2;
    const gridTop = board.boardY + Board.OUTLINE_STROKE - 2;
    const gridRight = gridLeft + gridScale * (board.gridSize + Board.GRID_STROKE) - Board.GRID_STROKE;
    const gridBottom = gridTop + gridScale * (board.gridSize + Board.GRID_STROKE) - Board.GRID_STROKE;

    if (mouseX < gridLeft || mouseX > gridRight || mouseY < gridTop || mouseY > gridBottom) {
        return null;
    }

    let i = Math.floor((mouseX - board.boardX - Board.OUTLINE_STROKE + Board.GRID_STROKE / 2) / (board.gridSize + Board.GRID_STROKE));
    let j = Math.floor((mouseY - board.boardY - Board.OUTLINE_STROKE + Board.GRID_STROKE / 2) / (board.gridSize + Board.GRID_STROKE));
    i = Math.max(0, Math.min(gridScale - 1, i));
    j = Math.max(0, Math.min(gridScale - 1, j));
    return {x: i, y: j};
}

// After a failed run, grabbing a piece restores the layout (like Try Again).
function retryFromFailure() {
    if (failed) keepButton.click();
}

function startDragFromPool(e, index) {
    retryFromFailure();
    if (!board.interactive) return;
    e.preventDefault();
    board.dragging = true;
    board.dragSource = "pool";
    board.dragPoolIndex = index;
    board.draggedObject = pool[index];
    board.dragX = e.clientX - canvas.getBoundingClientRect().left;
    board.dragY = e.clientY - canvas.getBoundingClientRect().top;
    // Dim the source piece instead of rebuilding the tray, so the hovered
    // element isn't destroyed mid-drag.
    poolEl.children[index]?.classList.add("dragging");
    renderSummary(board.draggedObject);
    board.previewCells = [];
    board.hoverCell = null;
    showGhost(board.draggedObject, e);
    board.drawBoard();
}

canvas.addEventListener("mousedown", e => {
    if (!board.interactive) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const cell = checkMouseLocationForObject(mouseX, mouseY);
    if (cell != null && failed) retryFromFailure();

    if (cell != null && canDrag(board.grid[cell.x][cell.y])) {
        e.preventDefault();
        board.dragging = true;
        board.dragSource = "board";
        board.dragI = cell.x;
        board.dragJ = cell.y;
        board.dragX = mouseX;
        board.dragY = mouseY;
        board.draggedObject = board.grid[cell.x][cell.y];
        board.previewCells = [];
        board.hoverCell = null;
        board.grid[cell.x][cell.y] = makeEmptyNode();
        showGhost(board.draggedObject, e);
        board.drawBoard();
    }
});

document.addEventListener("mouseup", e => {
    if (!board.dragging) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const target = cellFromPoint(mouseX, mouseY);

    applyDrop(board.grid, pool, {
        source: board.dragSource,
        node: board.draggedObject,
        i: board.dragI,
        j: board.dragJ,
        poolIndex: board.dragPoolIndex,
    }, target);

    ghost.hidden = true;
    board.dragging = false;
    board.dragSource = null;
    board.dragI = null;
    board.dragJ = null;
    board.dragPoolIndex = null;
    board.draggedObject = null;

    renderPool();
    const hovered = checkMouseLocationForObject(mouseX, mouseY);
    renderSummary(hovered ? board.grid[hovered.x][hovered.y] : null);
    setPreview(hovered);
    board.drawBoard();
});

document.addEventListener("mousemove", e => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (board.dragging) {
        board.dragX = mouseX;
        board.dragY = mouseY;
        moveGhost(e);
        return;
    }

    // The tray pieces own their own hover (mouseenter/mouseleave); only the
    // canvas, and anything that isn't a tray piece, is handled here.
    if (e.target.closest(".pool-node")) return;
    const hovered = e.target === canvas ? checkMouseLocationForObject(mouseX, mouseY) : null;
    renderSummary(hovered ? board.grid[hovered.x][hovered.y] : null);
    setPreview(hovered);
});

function setInteractive(interactive) {
    board.interactive = interactive;
    runButton.disabled = !interactive;
    poolEl.querySelectorAll(".pool-node").forEach(el => {
        el.style.pointerEvents = interactive ? "auto" : "none";
    });
}

function showResult(won) {
    resultBanner.classList.remove("hidden", "win", "lose");
    resultBanner.classList.add(won ? "win" : "lose");
    resultBanner.textContent = won ? "Solved! Every node depleted." : "Not solved — pieces that still have charge were never reached. Press Try Again to adjust your layout.";
}

// Run replays the simulation as an animation. If the puzzle isn't solved,
// the failing pieces are highlighted and the board automatically returns to
// the player's placement so they can adjust it.
runButton.addEventListener("click", async () => {
    if (runComplete) return;
    runComplete = true;
    setInteractive(false);
    clearButton.disabled = true;
    resultBanner.classList.add("hidden");
    keepButton.classList.add("hidden");
    clearSummary();
    board.previewCells = [];
    board.hoverCell = null;

    preRunGrid = cloneGrid(board.grid, gridScale);
    const result = simulate(cloneGrid(board.grid, gridScale), gridScale);

    await playRun(board, result.trace, gridScale, {getSpeed: () => animationSpeed});

    if (result.won) {
        // Leave the spent beams gone (only the flashes are cleared); Keep Board
        // and Clear Board restore them.
        board.effects.flashes = [];
        board.drawBoard();
        showResult(true);
        keepButton.textContent = "Keep Board";
        keepButton.classList.remove("hidden");
        clearButton.disabled = false;
        return;
    }

    // Stay on the finished board, with its spent beams and leftover charges, until
    // the player chooses to try again; that restores their layout.
    board.effects.flashes = [];
    board.drawBoard();
    showResult(false);
    keepButton.textContent = "Try Again";
    keepButton.classList.remove("hidden");
    clearButton.disabled = false;
    failed = true;
    setInteractive(true);          // pieces can be grabbed straight away...
    runButton.disabled = true;     // ...but Run waits until the layout is restored
});

// Keep Board (after a win) / Try Again (after a miss): reset the charges but
// leave the layout in place so it can be studied, tweaked or run again.
keepButton.addEventListener("click", () => {
    failed = false;
    board.grid = preRunGrid;
    preRunGrid = null;
    board.effects = Board.emptyEffects();
    runComplete = false;
    resultBanner.classList.add("hidden");
    keepButton.classList.add("hidden");
    setInteractive(true);
    renderPool();
    clearSummary();
    board.drawBoard();
});

// Clear Board: back to the starting puzzle with every movable piece in hand.
clearButton.addEventListener("click", () => {
    failed = false;
    pool = createPuzzle();
    preRunGrid = null;
    board.effects = Board.emptyEffects();
    runComplete = false;
    resultBanner.classList.add("hidden");
    keepButton.classList.add("hidden");
    setInteractive(true);
    renderPool();
    clearSummary();
    board.drawBoard();
});

document.querySelectorAll(".speed-button[data-speed]").forEach(button => {
    button.addEventListener("click", () => {
        animationSpeed = Number(button.dataset.speed);
        document.querySelectorAll(".speed-button[data-speed]").forEach(b =>
            b.classList.toggle("selected", b === button));
    });
});

const dotsToggle = document.getElementById("dots-toggle");
dotsToggle.addEventListener("click", () => {
    board.showDots = !board.showDots;
    dotsToggle.classList.toggle("selected", board.showDots);
    dotsToggle.setAttribute("aria-pressed", String(board.showDots));
    board.drawBoard();
});

// ---- puzzle navigation (Back / Next) ----
const backButton = document.getElementById("back-button");
const nextButton = document.getElementById("next-button");
let currentIndex = 0;   // the hand-built puzzle most recently chosen
let isRandom = false;   // is the current game a randomly generated one?
const history = [];     // games left behind, most recent last: {definition, index|null}

function updateNav() {
    // Hand-built levels: step through the list. Random games: Next makes
    // another random game and Back returns to the game you were just playing.
    backButton.disabled = isRandom ? history.length === 0 : currentIndex <= 0;
    nextButton.disabled = isRandom ? false : currentIndex >= puzzleCount() - 1;
}

// ---- Show Solution ----
const solutionButton = document.getElementById("solution-button");
const solutionCache = new Map();

// Where each hand piece goes in a winning layout: [{x, y, poolIndex}].
// Generated puzzles carry their solution; hand-built ones are solved on demand.
function findPlacements(definition) {
    if (solutionCache.has(definition)) return solutionCache.get(definition);
    let placements = null;
    if (definition.solution) {
        const used = new Set();
        placements = definition.solution.map(({x, y, kind}) => {
            const poolIndex = definition.hand.findIndex((k, i) => k === kind && !used.has(i));
            used.add(poolIndex);
            return {x, y, poolIndex};
        });
    } else {
        const fresh = buildFromDefinition(definition);
        const layout = solve(fresh.grid, fresh.pool, gridScale, 1)[0];
        if (layout) {
            placements = layout.map(({x, y, id}) => ({x, y, poolIndex: fresh.pool.findIndex(n => n.id === id)}));
        }
    }
    solutionCache.set(definition, placements);
    return placements;
}

solutionButton.addEventListener("click", () => {
    if (clearButton.disabled) return; // the animation is playing
    solutionButton.disabled = true;
    solutionButton.textContent = "Finding solution…";
    // let the label paint before the (brief) search
    setTimeout(() => {
        const placements = findPlacements(activeDefinition);
        if (placements) {
            const fresh = buildFromDefinition(activeDefinition);
            const placed = new Set();
            board.grid = fresh.grid;
            for (const {x, y, poolIndex} of placements) {
                board.grid[x][y] = fresh.pool[poolIndex];
                placed.add(poolIndex);
            }
            pool = fresh.pool.filter((_, i) => !placed.has(i));
            failed = false;
            preRunGrid = null;
            board.effects = Board.emptyEffects();
            board.previewCells = [];
            board.hoverCell = null;
            runComplete = false;
            resultBanner.classList.add("hidden");
            keepButton.classList.add("hidden");
            setInteractive(true);
            renderPool();
            clearSummary();
            board.drawBoard();
        }
        solutionButton.disabled = false;
        solutionButton.textContent = "Show Solution";
    }, 30);
});

const pickerEl = document.getElementById("puzzle-picker");
const pickerButtons = [];

function selectPickerButton(selected) {
    pickerButtons.forEach(b => b.classList.toggle("selected", b === selected));
}

// What was on the board (and in the hand) when each game was left, so Back can
// put it back exactly as it was, including a solution you had set up.
const savedLayouts = new Map();   // definition -> {grid, pool}

function saveLayout() {
    // after a run, preRunGrid holds the pieces as they were placed
    savedLayouts.set(activeDefinition, {
        grid: cloneGrid(preRunGrid ?? board.grid, gridScale),
        pool: pool.map(node => node.clone()),
    });
}

// Switch to a game. index is the hand-built level number, or null for a
// random game. The game being left is remembered for Back (unless going Back).
function activateGame(definition, index, {remember = true, restore = false} = {}) {
    saveLayout();
    if (remember) {
        history.push({definition: activeDefinition, index: isRandom ? null : currentIndex});
        if (history.length > 50) history.shift();
    }
    activeDefinition = definition;
    isRandom = index === null;
    if (!isRandom) currentIndex = index;
    selectPickerButton(isRandom ? randomButton : pickerButtons[index]);
    updateNav();
    clearButton.click();
    // going Back: bring back the layout that was on that board
    const saved = restore ? savedLayouts.get(definition) : null;
    if (saved) {
        board.grid = cloneGrid(saved.grid, gridScale);
        pool = saved.pool.map(node => node.clone());
        renderPool();
        board.drawBoard();
    }
}

for (let i = 0; i < puzzleCount(); i++) {
    const button = document.createElement("button");
    button.className = "puzzle-button" + (i === 0 ? " selected" : "");
    button.textContent = String(i + 1);
    button.title = puzzleName(i);
    button.addEventListener("click", () => {
        if (clearButton.disabled) return; // the animation is playing
        activateGame(puzzleDefinition(i), i);
    });
    pickerEl.appendChild(button);
    pickerButtons.push(button);
}

// Random: builds a brand-new puzzle that is guaranteed to be completable.
const randomButton = document.createElement("button");
randomButton.className = "puzzle-button random-button";
randomButton.title = "New random puzzle";
randomButton.setAttribute("aria-label", "New random puzzle");
randomButton.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="13" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="5" cy="5" r="1.3" fill="currentColor"/><circle cx="11" cy="5" r="1.3" fill="currentColor"/><circle cx="8" cy="8" r="1.3" fill="currentColor"/><circle cx="5" cy="11" r="1.3" fill="currentColor"/><circle cx="11" cy="11" r="1.3" fill="currentColor"/></svg>';
randomButton.addEventListener("click", () => {
    if (clearButton.disabled) return; // the animation is playing
    activateGame(generateDefinition(), null);
});
pickerEl.appendChild(randomButton);
pickerButtons.push(randomButton);

backButton.addEventListener("click", () => {
    if (clearButton.disabled) return;
    if (isRandom) {
        const previous = history.pop();
        if (previous) activateGame(previous.definition, previous.index, {remember: false, restore: true});
    } else if (currentIndex > 0) {
        activateGame(puzzleDefinition(currentIndex - 1), currentIndex - 1, {restore: true});
    }
});
nextButton.addEventListener("click", () => {
    if (clearButton.disabled) return;
    if (isRandom) {
        activateGame(generateDefinition(), null);
    } else if (currentIndex < puzzleCount() - 1) {
        activateGame(puzzleDefinition(currentIndex + 1), currentIndex + 1);
    }
});
updateNav();

renderPool();
board.drawBoard();
