import {makeEmptyNode} from "./node.js";
import {Board} from "./board.js";
import {simulate, cloneGrid} from "./engine.js";
import {playRun} from "./runner.js";
import {renderSummary, clearSummary} from "./summary-panel.js";
import {drawPieceShape, targetCells} from "./pieces.js";
import {buildFromDefinition} from "./puzzles.js";
import {generateDefinition} from "./generator.js";
import {initTutorial} from "./tutorial.js";
import {canDrag, applyDrop, validatePuzzle, placedPieces} from "./rules.js";
import {parsePlayParams, playTitle, playHref, winMessage, waysSummary, nextUnsolvedSize, CANVAS_SIZES} from "./play-model.js";
import {easternDateString} from "./dates.js";
import {loadDailyFile, getDaily} from "./daily-data.js";
import {minimalSubset} from "./solutions.js";
import {loadProgress, saveProgress, recordWin, addSolution, foundCounts, isDone, mergeProgress, browserStorage} from "./progress.js";
import {startInk} from "./ink.js";

// Which board and which mode this page is for comes from the URL
// (play.html?size=5&mode=daily). Without a valid one, go back to the home page.
const params = parsePlayParams(location.search);
if (!params) {
    location.replace("index.html");
    throw new Error("play.html needs ?size=3|5|7&mode=daily|unlimited");
}
const gridScale = params.size;
const isDaily = params.mode === "daily";
const today = easternDateString();

const canvas = document.getElementById("canvas");
const poolEl = document.getElementById("pool");
const handLabel = document.getElementById("hand-label");
const runButton = document.getElementById("run-button");
const clearButton = document.getElementById("clear-button");
const resultBanner = document.getElementById("result-banner");
const resultText = document.getElementById("result-text");
const runLabel = document.getElementById("run-label");
const retryButton = document.getElementById("retry-button");

const boardSize = CANVAS_SIZES[gridScale];
canvas.width = canvas.height = boardSize;

const board = new Board(canvas, boardSize, gridScale);

// The puzzle being played: today's daily puzzle, or a random one in unlimited
// mode. Clear Board rebuilds fresh pieces from this definition. The daily comes
// from the pre-built list when it has today (with every known way to solve it);
// otherwise it is generated live and no list of ways is known.
const daily = isDaily ? getDaily(await loadDailyFile(), today, gridScale) : null;
const knownSolutions = daily?.solutions ?? null;
let activeDefinition = daily ? daily.definition : generateDefinition({size: gridScale});

document.getElementById("page-title").textContent = playTitle({size: gridScale, mode: params.mode, today});
document.title = `qube · ${playTitle({size: gridScale, mode: params.mode, today})}`;

// Each hand piece keeps its own slot in the hand, so pulling one out leaves an
// empty place where it was, and a piece put back returns to that place.
const slotOf = new Map();   // piece id -> its slot number
const registerSlots = hand => hand.forEach((node, slot) => slotOf.set(node.id, slot));

// Loads the current puzzle onto the board and returns its hand.
function createPuzzle() {
    const puzzle = buildFromDefinition(activeDefinition);
    validatePuzzle(puzzle.grid, puzzle.pool);
    board.grid = puzzle.grid;
    registerSlots(puzzle.pool);
    return puzzle.pool;
}

let pool = createPuzzle();
let runComplete = false;
// True while a finished round (a win or a miss) is on screen. Grabbing any
// piece, or pressing the Run button (now "Keep going" / "Try Again"), restores the player's layout and
// starts a new attempt.
let roundOver = false;
let wonRound = false;     // the finished round was a win: the run button then goes on to the next puzzle
// after a win the button row is Try again | Next
function setWon(won) {
    wonRound = won;
    retryButton.hidden = !won;
}
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
    const slots = activeDefinition.hand.length;
    handLabel.hidden = slots === 0;
    const held = new Map(pool.map((node, index) => [slotOf.get(node.id), {node, index}]));
    for (let slot = 0; slot < slots; slot++) {
        const entry = held.get(slot);
        if (!entry) {
            // the piece that belongs here is on the board: leave its place empty
            const empty = document.createElement("div");
            empty.className = "pool-slot";
            poolEl.appendChild(empty);
            continue;
        }
        const {node, index} = entry;
        const el = document.createElement("div");
        el.className = "pool-node up";
        el.dataset.index = String(index);
        el.dataset.slot = String(slot);

        const pieceCanvas = document.createElement("canvas");
        pieceCanvas.width = POOL_PIECE_SIZE;
        pieceCanvas.height = POOL_PIECE_SIZE;
        drawPieceShape(pieceCanvas.getContext("2d"), node, POOL_PIECE_SIZE / 2, POOL_PIECE_SIZE / 2, POOL_PIECE_SIZE * 0.92);
        el.appendChild(pieceCanvas);

        el.addEventListener("mousedown", e => startDragFromPool(e, index));
        el.addEventListener("mouseenter", () => renderSummary(node));
        el.addEventListener("mouseleave", () => renderSummary(null));
        poolEl.appendChild(el);
    }
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
    poolEl.querySelector(`.pool-node[data-index="${index}"]`)?.classList.add("dragging");
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

let progress = loadProgress(browserStorage());

// The "ways to solve it" box (daily only, once there is something to say): how
// many ways there are and which have been found.
const waysBox = document.getElementById("ways-box");
const waysEl = document.getElementById("ways");

function showWays(ways) {
    waysBox.hidden = !ways;
    if (!ways) return;
    const label = document.createElement("span");
    label.textContent = "Solutions:";
    const bubbles = ways.items.map(item => {
        const bubble = document.createElement("span");
        bubble.className = "way" + (item.found ? " found" : "");
        bubble.textContent = item.label;
        return bubble;
    });
    waysEl.setAttribute("aria-label", `Solutions found: ${ways.found} of ${ways.total}`);
    waysEl.replaceChildren(label, ...bubbles);
}

// A daily already solved today shows its ways when the page opens.
if (isDaily && knownSolutions && isDone(progress, gridScale, today)) {
    showWays(waysSummary(knownSolutions, foundCounts(progress, gridScale, today)));
}

// What a win says. The first win of a daily puzzle records the day and the
// streak; every different way found (by how many pieces it needs) is kept, but
// solving it again the same way changes nothing.
function winText() {
    if (!isDaily) return winMessage({daily: false});
    // work from the latest saved data, in case another tab has saved since this page loaded
    progress = mergeProgress(progress, loadProgress(browserStorage()));
    const firstWin = !isDone(progress, gridScale, today);
    // the pieces this win needed: decoys the player put down do not count
    const used = minimalSubset(activeDefinition, placedPieces(preRunGrid ?? board.grid)) ?? [];
    const before = foundCounts(progress, gridScale, today);
    if (firstWin) progress = recordWin(progress, gridScale, today, used);
    progress = addSolution(progress, gridScale, today, used);
    saveProgress(browserStorage(), progress);
    const ways = knownSolutions ? waysSummary(knownSolutions, foundCounts(progress, gridScale, today)) : null;
    showWays(ways);
    // the list of ways is complete, so nobody can beat its cheapest one: say so loudly if that ever happens
    if (knownSolutions && used.length > 0 && used.length < Math.min(...knownSolutions.map(solution => solution.length))) {
        console.error(`A player solved ${today} (${gridScale}x${gridScale}) with ${used.length} pieces, fewer than the known ways`, used);
    }
    return winMessage({
        daily: true,
        firstWin,
        streak: progress[gridScale].streak,
        pieces: used.length || undefined,
        newWay: !before.includes(used.length),
        cheaperLeft: ways?.cheaperLeft ?? 0,
        allFound: ways?.allFound ?? false,
    });
}

function showResult(won) {
    resultBanner.classList.remove("hidden", "win", "lose");
    resultBanner.classList.add(won ? "win" : "lose");
    resultText.textContent = won ? winText() : "Not solved.";
}

// After a win the run button goes on: to the next daily not yet solved (or home
// when they all are), or to a new puzzle in unlimited mode. Grabbing a piece or
// Clear still lets the player try another way on this one.
const nextDailySize = () => nextUnsolvedSize(mergeProgress(progress, loadProgress(browserStorage())), gridScale, today);
const nextPuzzleLabel = () => isDaily && nextDailySize() === null ? "Back home" : "Next";

function goToNextPuzzle() {
    if (!isDaily) {
        newButton.click();
        return;
    }
    const size = nextDailySize();
    location.href = size === null ? "index.html" : playHref(size, "daily");
}

retryButton.addEventListener("click", () => {
    if (roundOver) restoreAfterRound();
});

const setRunLabel = text => {
    runLabel.textContent = text;
};

// Run replays the simulation as an animation. If the puzzle isn't solved,
// the failing pieces are highlighted and the board automatically returns to
// the player's placement so they can adjust it.
runButton.addEventListener("click", async () => {
    // after a finished round this button reads "Keep going" (win) or "Try Again"
    // (miss): put the layout back and play on
    if (roundOver) {
        if (wonRound) goToNextPuzzle();
        else restoreAfterRound();
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
        setWon(true);
        setRunLabel(nextPuzzleLabel());
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
    setRunLabel("Try Again");   // same spot as "Keep going" after a win
});

function restoreAfterRound() {
    roundOver = false;
    setWon(false);
    board.grid = preRunGrid;
    preRunGrid = null;
    board.effects = Board.emptyEffects();
    runComplete = false;
    resultBanner.classList.add("hidden");
    setRunLabel("Run");
    setInteractive(true);
    renderPool();
    clearSummary();
    board.drawBoard();
}

// Clear Board: back to the starting puzzle with every movable piece in hand.
clearButton.addEventListener("click", () => {
    roundOver = false;
    setWon(false);
    setRunLabel("Run");
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

// ---- new puzzles (unlimited mode only) ----
// Daily has just the one puzzle, so it has no New / Back / forward.
const backButton = document.getElementById("back-button");
const nextButton = document.getElementById("next-button");
const newButton = document.getElementById("new-button");
const forwardControls = document.getElementById("forward-controls");
const history = [];     // games left behind, most recent last
const future = [];      // games you went Back from, so Next can return to them

function updateNav() {
    if (isDaily) {
        backButton.hidden = true;
        forwardControls.hidden = true;
        return;
    }
    // Back returns to the game you were just playing; Next goes forward again to
    // one you came back from (only when there is one); New always makes another.
    backButton.disabled = history.length === 0;
    nextButton.hidden = future.length === 0;
}

// ---- Show Solution ----
const solutionButton = document.getElementById("solution-button");
solutionButton.hidden = isDaily;   // seeing the answer should not count as solving the daily

// Where each hand piece goes in the stored winning layout: [{x, y, poolIndex}].
function findPlacements(definition) {
    const used = new Set();
    return definition.solution.map(({x, y, kind}) => {
        const poolIndex = definition.hand.findIndex((k, i) => k === kind && !used.has(i));
        used.add(poolIndex);
        return {x, y, poolIndex};
    });
}

solutionButton.addEventListener("click", () => {
    if (clearButton.disabled) return; // the animation is playing
    const fresh = buildFromDefinition(activeDefinition);
    registerSlots(fresh.pool);
    const placed = new Set();
    board.grid = fresh.grid;
    for (const {x, y, poolIndex} of findPlacements(activeDefinition)) {
        board.grid[x][y] = fresh.pool[poolIndex];
        placed.add(poolIndex);
    }
    pool = fresh.pool.filter((_, i) => !placed.has(i));
    roundOver = false;
    setWon(false);
    setRunLabel("Run");
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
});

const DICE_ICON = '<svg class="button-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="13" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="5" cy="5" r="1.3" fill="currentColor"/><circle cx="11" cy="5" r="1.3" fill="currentColor"/><circle cx="8" cy="8" r="1.3" fill="currentColor"/><circle cx="5" cy="11" r="1.3" fill="currentColor"/><circle cx="11" cy="11" r="1.3" fill="currentColor"/></svg>';

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

// Switch to another game. The game being left is remembered for Back (unless
// going Back).
function activateGame(definition, {remember = true, restore = false, keepFuture = false} = {}) {
    saveLayout();
    if (remember) {
        history.push(activeDefinition);
        if (history.length > 50) history.shift();
    }
    if (!keepFuture) future.length = 0;   // a fresh choice ends any "forward" trail
    activeDefinition = definition;
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
    const previous = history.pop();
    if (previous) {
        future.push(activeDefinition);
        activateGame(previous, {remember: false, restore: true, keepFuture: true});
    }
});
nextButton.addEventListener("click", () => {
    if (clearButton.disabled) return;
    // forward again to the game you came back from
    const forward = future.pop();
    if (forward) {
        history.push(activeDefinition);
        activateGame(forward, {remember: false, restore: true, keepFuture: true});
    }
});
newButton.innerHTML = `${DICE_ICON}New`;
newButton.hidden = isDaily;
newButton.addEventListener("click", () => {
    if (clearButton.disabled) return;
    activateGame(generateDefinition({size: gridScale}));
});
updateNav();

renderPool();
board.drawBoard();
startInk();
