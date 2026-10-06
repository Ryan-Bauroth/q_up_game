import {easternDateString, msUntilNextEasternMidnight, formatCountdown} from "./dates.js";
import {dailyDefinition} from "./daily.js";
import {loadProgress, browserStorage} from "./progress.js";
import {cardModel, MAX_TALLY} from "./home-model.js";
import {buildFromDefinition} from "./puzzles.js";
import {drawPieceShape} from "./pieces.js";
import {SIZES} from "./generator.js";
import {startInk} from "./ink.js";

const today = easternDateString();
const progress = loadProgress(browserStorage());

const dateText = new Intl.DateTimeFormat("en-US", {timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric"});
document.getElementById("today").textContent = dateText.format(new Date());

function element(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
}

// The streak tag: tally marks (a slash through every fifth), or the number once there are too many.
function streakTag(card) {
    const tag = element("div", "up tag streak");
    tag.setAttribute("role", "img");
    tag.setAttribute("aria-label", `streak: ${card.streakText}`);
    if (card.streak === 0 || card.streak > MAX_TALLY) {
        tag.textContent = card.streakText;
    } else {
        const tally = element("span", "tally");
        for (const count of card.tally) {
            const group = element("span", count === 5 ? "group five" : "group");
            for (let i = 0; i < count; i++) group.appendChild(document.createElement("i"));
            tally.appendChild(group);
        }
        tag.appendChild(tally);
    }
    return tag;
}

// A preview of today's puzzle: the pieces and targets that start on the board
// (the hand is not shown), drawn with the game's own piece shapes.
function drawPreview(canvas, size) {
    const {grid} = buildFromDefinition(dailyDefinition(today, size));
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

function buildCard(size) {
    const card = cardModel({size, progress, today});
    const article = element("article", "up card");
    article.dataset.size = String(size);

    article.appendChild(element("div", "up tag size", card.title));
    article.appendChild(streakTag(card));

    const screen = element("div", "screen");
    const canvas = element("canvas");
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", `Preview of today's ${card.title} puzzle`);
    screen.appendChild(canvas);
    article.appendChild(screen);
    drawPreview(canvas, size);

    if (card.done) article.appendChild(element("div", "up stamp", "DONE!"));

    const buttons = element("div", "btns");
    const play = element("a", "up btn fill", card.playLabel);
    play.href = card.dailyHref;
    play.setAttribute("aria-label", `${card.playLabel} today's ${card.title}`);
    const unlimited = element("a", "up btn", "Unlimited");
    unlimited.href = card.unlimitedHref;
    unlimited.setAttribute("aria-label", `Unlimited ${card.title}`);
    buttons.append(play, unlimited);
    article.appendChild(buttons);

    article.appendChild(element("p", "sub", card.label));
    return article;
}

const cards = document.getElementById("cards");
for (const size of SIZES) cards.appendChild(buildCard(size));

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
