import {makeEmptyNode} from "./node.js";
import {Board} from "./board.js";
import {simulate, cloneGrid} from "./engine.js";
import {playRun} from "./runner.js";
import {renderSummary, clearSummary} from "./summary-panel.js";
import {drawPieceShape, targetCells} from "./pieces.js";
import {buildFromDefinition, puzzleDefinition, puzzleCount, puzzleName, PUZZLE_SIZE} from "./puzzles.js";
import {startBest, generateBest} from "./generator.js";
import {createPuzzleCache} from "./puzzle-cache.js";
import {solve} from "./solver.js";
import {initTutorial} from "./tutorial.js";
import {canDrag, applyDrop, validatePuzzle} from "./rules.js";

const canvas = document.getElementById("canvas");
const poolEl = document.getElementById("pool");
const handLabel = document.getElementById("hand-label");
const runButton = document.getElementById("run-button");
const clearButton = document.getElementById("clear-button");
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
// True while a finished round (a win or a miss) is on screen. Grabbing any
// piece, or pressing the Run button (now "Keep going" / "Try Again"), restores the player's layout and
// starts a new attempt.
let roundOver = false;
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
    // the label only shows while there is something in the hand
    handLabel.hidden = pool.length === 0;
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

// After a finished round, grabbing a piece restores the layout (like Try Again).
function retryFromFailure() {
    if (roundOver) restoreAfterRound();
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
    if (cell != null && roundOver) retryFromFailure();

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
    resultBanner.textContent = won ? "Solved!" : "Not solved.";
}

// Run replays the simulation as an animation. If the puzzle isn't solved,
// the failing pieces are highlighted and the board automatically returns to
// the player's placement so they can adjust it.
runButton.addEventListener("click", async () => {
    // after a finished round this button reads "Keep going" (win) or "Try Again"
    // (miss): put the layout back and play on
    if (roundOver) {
        restoreAfterRound();
        return;
    }
    if (runComplete) return;
    runComplete = true;
    setInteractive(false);
    clearButton.disabled = true;
    resultBanner.classList.add("hidden");
    clearSummary();
    board.previewCells = [];
    board.hoverCell = null;

    preRunGrid = cloneGrid(board.grid, gridScale);
    const result = simulate(cloneGrid(board.grid, gridScale), gridScale);

    await playRun(board, result.trace, gridScale, {getSpeed: () => animationSpeed});

    if (result.won) {
        // Leave the spent beams gone (only the flashes are cleared). Run becomes
        // "Keep going", and pieces can be grabbed straight away, like after a miss.
        board.effects.flashes = [];
        board.drawBoard();
        showResult(true);
        clearButton.disabled = false;
        roundOver = true;
        setInteractive(true);
        runButton.textContent = "Keep going";
        return;
    }

    // Stay on the finished board, with its spent beams and leftover charges, until
    // the player chooses to try again; that restores their layout.
    board.effects.flashes = [];
    board.drawBoard();
    showResult(false);
    clearButton.disabled = false;
    roundOver = true;
    setInteractive(true);          // pieces can be grabbed straight away
    runButton.textContent = "Try Again";   // same spot as "Keep going" after a win
});

function restoreAfterRound() {
    roundOver = false;
    board.grid = preRunGrid;
    preRunGrid = null;
    board.effects = Board.emptyEffects();
    runComplete = false;
    resultBanner.classList.add("hidden");
    runButton.textContent = "Run";
    setInteractive(true);
    renderPool();
    clearSummary();
    board.drawBoard();
}



// Clear Board: back to the starting puzzle with every movable piece in hand.
clearButton.addEventListener("click", () => {
    roundOver = false;
    runButton.textContent = "Run";
    pool = createPuzzle();
    preRunGrid = null;
    board.effects = Board.emptyEffects();
    runComplete = false;
    resultBanner.classList.add("hidden");
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

// Dots menu: a button (the dots icon) that drops down to choose dots for skip
// hits only (default), for every hit, or none.
const dotsButton = document.getElementById("dots-menu-button");
const dotsMenu = document.getElementById("dots-menu");
const dotsItems = [...dotsMenu.querySelectorAll("[data-mode]")];

function setDotsMenuOpen(open) {
    dotsMenu.hidden = !open;
    dotsButton.setAttribute("aria-expanded", String(open));
}

dotsButton.addEventListener("click", () => setDotsMenuOpen(dotsMenu.hidden));
dotsItems.forEach(item => item.addEventListener("click", () => {
    board.dotMode = item.dataset.mode;
    dotsItems.forEach(other => other.setAttribute("aria-checked", String(other === item)));
    board.drawBoard();
    setDotsMenuOpen(false);
    dotsButton.focus();
}));
document.addEventListener("mousedown", e => {
    if (!dotsMenu.hidden && !e.target.closest(".dots-menu-wrap")) setDotsMenuOpen(false);
});
document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !dotsMenu.hidden) {
        setDotsMenuOpen(false);
        dotsButton.focus();
    }
});

// ---- puzzle navigation (Back / Next) ----
const backButton = document.getElementById("back-button");
const nextButton = document.getElementById("next-button");
const newButton = document.getElementById("new-button");
let currentIndex = 0;   // the hand-built puzzle most recently chosen
let isRandom = false;   // is the current game a randomly generated one?
const history = [];     // games left behind, most recent last: {definition, index|null}
const future = [];      // games you went Back from, so Next can return to them

function updateNav() {
    // Hand-built levels: Back / Next step through the list.
    // Random games: Back returns to the game you were just playing; Next goes
    // forward again to one you came back from (only when there is one); and a
    // separate New button always makes another random game.
    backButton.disabled = isRandom ? history.length === 0 : currentIndex <= 0;
    nextButton.hidden = isRandom && future.length === 0;
    nextButton.disabled = isRandom ? false : currentIndex >= puzzleCount() - 1;
    newButton.hidden = !isRandom;
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
    solutionButton.textContent = "Solving…";
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
            roundOver = false;
            runButton.textContent = "Run";
            preRunGrid = null;
            board.effects = Board.emptyEffects();
            board.previewCells = [];
            board.hoverCell = null;
            runComplete = false;
            resultBanner.classList.add("hidden");
            setInteractive(true);
            renderPool();
            clearSummary();
            board.drawBoard();
        }
        solutionButton.disabled = false;
        solutionButton.textContent = "Show Solution";
    }, 30);
});

const DICE_ICON = '<svg class="button-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="13" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="5" cy="5" r="1.3" fill="currentColor"/><circle cx="11" cy="5" r="1.3" fill="currentColor"/><circle cx="8" cy="8" r="1.3" fill="currentColor"/><circle cx="5" cy="11" r="1.3" fill="currentColor"/><circle cx="11" cy="11" r="1.3" fill="currentColor"/></svg>';
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
const currentEntry = () => ({definition: activeDefinition, index: isRandom ? null : currentIndex});

function activateGame(definition, index, {remember = true, restore = false, keepFuture = false} = {}) {
    saveLayout();
    if (remember) {
        history.push({definition: activeDefinition, index: isRandom ? null : currentIndex});
        if (history.length > 50) history.shift();
    }
    if (!keepFuture) future.length = 0;   // a fresh choice ends any "forward" trail
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

// Random boards are built ahead of time, a few at a time between frames, so the
// button never waits. If none is ready yet, a smaller (quicker) pool is used.
const puzzleCache = createPuzzleCache({
    newRun: () => startBest({candidates: 60}),
    quick: () => generateBest({candidates: 15}),
});
puzzleCache.fill();

// Random: builds a brand-new puzzle that is guaranteed to be completable.
const randomButton = document.createElement("button");
randomButton.className = "puzzle-button random-button";
randomButton.title = "New random puzzle";
randomButton.setAttribute("aria-label", "New random puzzle");
randomButton.innerHTML = DICE_ICON;
randomButton.addEventListener("click", () => {
    if (clearButton.disabled) return; // the animation is playing
    activateGame(puzzleCache.take(), null);
});
pickerEl.appendChild(randomButton);
pickerButtons.push(randomButton);

// ? opens the "How to play" card (it never opens by itself).
const tutorial = initTutorial(document.getElementById("help-button"));

// Open the tutorial by itself on a player's first visit only. The "seen" flag
// lives in localStorage; browsers can block it, so every access is guarded.
const TUTORIAL_SEEN_KEY = "qup-tutorial-seen";
function hasSeenTutorial() {
    try {
        return localStorage.getItem(TUTORIAL_SEEN_KEY) === "1";
    } catch {
        return false;
    }
}
function markTutorialSeen() {
    try {
        localStorage.setItem(TUTORIAL_SEEN_KEY, "1");
    } catch {
        // storage unavailable: it will simply show again next visit
    }
}
if (!hasSeenTutorial()) {
    tutorial.open();
    markTutorialSeen();
}

backButton.addEventListener("click", () => {
    if (clearButton.disabled) return;
    if (isRandom) {
        const previous = history.pop();
        if (previous) {
            future.push(currentEntry());
            activateGame(previous.definition, previous.index, {remember: false, restore: true, keepFuture: true});
        }
    } else if (currentIndex > 0) {
        activateGame(puzzleDefinition(currentIndex - 1), currentIndex - 1, {restore: true});
    }
});
nextButton.addEventListener("click", () => {
    if (clearButton.disabled) return;
    if (isRandom) {
        // forward again to the game you came back from
        const forward = future.pop();
        if (forward) {
            history.push(currentEntry());
            activateGame(forward.definition, forward.index, {remember: false, restore: true, keepFuture: true});
        }
    } else if (currentIndex < puzzleCount() - 1) {
        activateGame(puzzleDefinition(currentIndex + 1), currentIndex + 1);
    }
});
newButton.innerHTML = `${DICE_ICON}New`;
newButton.addEventListener("click", () => {
    if (clearButton.disabled) return;
    activateGame(puzzleCache.take(), null);
});
updateNav();

renderPool();
board.drawBoard();
