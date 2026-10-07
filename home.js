import {easternDateString, msUntilNextEasternMidnight, formatCountdown} from "./dates.js";
import {loadDailyFile, getDaily} from "./daily-data.js";
import {loadProgress, browserStorage} from "./progress.js";
import {cardModel} from "./home-model.js";
import {buildFromDefinition, makePiece, KINDS} from "./puzzles.js";
import {drawPieceShape} from "./pieces.js";
import {SIZES} from "./generator.js";
import {startInk} from "./ink.js";

const today = easternDateString();
const dailyFile = await loadDailyFile();   // the pre-built puzzles, if the file loads

const dateText = new Intl.DateTimeFormat("en-US", {timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric"});
document.getElementById("today").textContent = dateText.format(new Date());

function element(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
}

// One hand-drawn flame for the streak numeral to sit inside: an ink-outlined
// coral flame with an orange middle and a yellow core, and a hard ink shadow like
// the rest of the ink look. It sways in steps, layer by layer.
const FLAME = {
    outer: "M32 3 C34 16 52 26 56 46 C60 64 48 76 32 76 C16 76 4 64 8 46 C10 36 16 30 20 22 C22 30 26 30 27 24 C28 16 30 10 32 3 Z",
    middle: "M32 20 C34 30 46 38 48 52 C50 64 42 72 32 72 C22 72 14 64 16 52 C17 44 22 40 25 34 C27 40 30 38 30 32 C30 28 31 24 32 20 Z",
    core: "M32 40 C33 46 42 52 42 60 C42 68 38 71 32 71 C26 71 22 68 22 60 C22 52 29 48 32 40 Z",
};
function flame() {
    const layer = element("span", "flame wob");
    layer.setAttribute("aria-hidden", "true");
    layer.innerHTML = `<svg viewBox="0 0 64 78" preserveAspectRatio="none" focusable="false">` +
        `<path class="shadow" d="${FLAME.outer}" transform="translate(3 4)"/>` +
        `<path class="outer" d="${FLAME.outer}"/>` +
        `<path class="middle" d="${FLAME.middle}"/>` +
        `<path class="core" d="${FLAME.core}"/></svg>`;
    return layer;
}

// The streak tag: the streak as a Roman numeral engulfed in a flame (the plain
// words, on a plain tag, if there is none yet).
function streakTag(card) {
    const tag = element("div", card.roman ? "up tag streak has-roman" : "up tag streak");
    tag.setAttribute("role", "img");
    tag.setAttribute("aria-label", `streak: ${card.streakText}`);
    if (card.roman) tag.append(flame(), element("span", "num", card.roman));
    else tag.textContent = card.streakText;
    return tag;
}

// A preview of today's puzzle, drawn with the game's own piece shapes: the pieces
// and targets that start on the board, plus (once the day is won) the pieces the
// player placed, which have no padlock. Before that the hand is not shown.
function drawPreview(canvas, size, solution) {
    const {grid} = buildFromDefinition(getDaily(dailyFile, today, size).definition);
    for (const {x, y, kind} of solution) {
        if (KINDS[kind] && grid[x][y].isEmpty) grid[x][y] = makePiece(kind, 1, false, false);
    }
    const css = 300;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = canvas.height = css * scale;
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    const cell = css / size;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, css, css);
    ctx.strokeStyle = "#d3d3d3";
    ctx.lineWidth = 1;
    for (let i = 0; i <= size; i++) {
        ctx.beginPath();
        ctx.moveTo(i * cell, 0);
        ctx.lineTo(i * cell, css);
        ctx.moveTo(0, i * cell);
        ctx.lineTo(css, i * cell);
        ctx.stroke();
    }
    for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
            const node = grid[x][y];
            if (!node.isEmpty) drawPieceShape(ctx, node, (x + 0.5) * cell, (y + 0.5) * cell, cell * 0.92);
        }
    }
}

function buildCard(size, progress) {
    const card = cardModel({size, progress, today});
    const article = element("article", "up card");
    article.dataset.size = String(size);
    article.dataset.done = String(card.done);
    article.dataset.placed = String(card.solution.length);   // pieces of the player's cheapest solution shown

    article.appendChild(element("div", "up tag size", card.title));
    article.appendChild(streakTag(card));

    const screen = element("div", "screen");
    const canvas = element("canvas");
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", card.solution.length > 0
        ? `Your solution to today's ${card.title} puzzle`
        : `Preview of today's ${card.title} puzzle`);
    screen.appendChild(canvas);
    article.appendChild(screen);
    drawPreview(canvas, size, card.solution);

    const buttons = element("div", "btns");
    const play = element("a", "up btn", card.playLabel);
    play.href = card.dailyHref;
    play.setAttribute("aria-label", `${card.playLabel} today's ${card.title}`);
    const unlimited = element("a", "up btn fill", "Unlimited");
    unlimited.href = card.unlimitedHref;
    unlimited.setAttribute("aria-label", `Unlimited ${card.title}`);
    buttons.append(play, unlimited);
    article.appendChild(buttons);

    article.appendChild(element("p", "sub", card.label));
    return article;
}

// (Re)build the cards from what is saved right now.
const cards = document.getElementById("cards");
function render() {
    const progress = loadProgress(browserStorage());
    cards.replaceChildren(...SIZES.map(size => buildCard(size, progress)));
}
render();

// Finishing a puzzle in this or another tab changes what is saved: show it as
// soon as the player is looking at this page again.
addEventListener("storage", render);
addEventListener("focus", render);
document.addEventListener("visibilitychange", () => { if (!document.hidden) render(); });

const countdown = document.getElementById("countdown");
function tick() {
    // a new Eastern day has begun: reload for the new puzzles
    if (easternDateString() !== today) {
        location.reload();
        return;
    }
    countdown.textContent = `new puzzles in ${formatCountdown(msUntilNextEasternMidnight())}`;
}
tick();
setInterval(tick, 30000);

// a page restored from the back/forward cache has old progress and maybe yesterday's puzzles
addEventListener("pageshow", event => { if (event.persisted) location.reload(); });

startInk();
