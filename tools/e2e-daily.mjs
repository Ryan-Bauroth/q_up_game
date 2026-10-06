// End-to-end check of the daily flow, driving headless Chrome over the DevTools
// protocol (no libraries; needs Node 22+). It drags the day's stored solution
// onto the board, presses Run, and checks the win message, the saved streak and
// the home page, then replays the day and takes screenshots of every page.
//
//   npm start                       (serves the project at http://localhost:3000)
//   node tools/e2e-daily.mjs [size]   (size 3, 5 or 7; default 5)
//
// Environment: QUP_URL (default http://localhost:3000), CHROME (path to Chrome),
// QUP_DEBUG_PORT (default 9333). Screenshots are written to a temp folder that
// is printed at the end.
import {spawn} from "node:child_process";
import {mkdtempSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

import {dailyDefinition} from "../daily.js";
import {easternDateString} from "../dates.js";
import {Board} from "../board.js";
import {CANVAS_SIZES} from "../play-model.js";

const size = Number(process.argv[2] ?? "5");
const port = Number(process.env.QUP_DEBUG_PORT ?? "9333");
const BASE = process.env.QUP_URL ?? "http://localhost:3000";
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const outDir = mkdtempSync(join(tmpdir(), "qup-e2e-"));

const today = easternDateString();
const definition = dailyDefinition(today, size);

const chrome = spawn(CHROME, [
    "--headless=new", "--disable-gpu", `--remote-debugging-port=${port}`, `--user-data-dir=${join(outDir, "profile")}`,
    "--window-size=1200,1200", "about:blank",
], {stdio: "ignore"});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function connect() {
    for (let i = 0; i < 50; i++) {
        try {
            const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
            const page = targets.find(t => t.type === "page");
            if (page) return new WebSocket(page.webSocketDebuggerUrl);
        } catch { /* chrome is still starting */ }
        await sleep(200);
    }
    throw new Error("could not reach Chrome");
}

let failed = false;
const check = (ok, message) => {
    if (ok) return;
    failed = true;
    process.exitCode = 1;
    console.log(`FAIL: ${message}`);
};

let socket;
try {
    socket = await connect();
    await new Promise(resolve => socket.addEventListener("open", resolve));
    let nextId = 1;
    const waiting = new Map();
    socket.addEventListener("message", event => {
        const message = JSON.parse(event.data);
        if (message.id && waiting.has(message.id)) {
            waiting.get(message.id)(message);
            waiting.delete(message.id);
        }
    });
    const send = (method, params = {}) => new Promise(resolve => {
        const id = nextId++;
        waiting.set(id, resolve);
        socket.send(JSON.stringify({id, method, params}));
    });
    const evaluate = async expression => {
        const reply = await send("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true});
        if (reply.result?.exceptionDetails) throw new Error(JSON.stringify(reply.result.exceptionDetails));
        return reply.result.result.value;
    };
    const shot = async name => {
        const reply = await send("Page.captureScreenshot", {format: "png"});
        writeFileSync(join(outDir, `${name}.png`), Buffer.from(reply.result.data, "base64"));
        console.log(`screenshot: ${join(outDir, `${name}.png`)}`);
    };
    const go = async url => {
        await send("Page.navigate", {url});
        await sleep(2500);
    };
    const mouse = (type, x, y, extra = {}) =>
        send("Input.dispatchMouseEvent", {type, x, y, button: "left", clickCount: 1, ...extra});

    await send("Page.enable");
    await send("Runtime.enable");
    console.log(`today (Eastern): ${today}; ${size}x${size} daily has ${definition.solution.length} pieces to place`);

    // ---- start from a clean slate, with the tutorial marked as seen
    await go(`${BASE}/index.html`);
    await evaluate(`localStorage.clear(); localStorage.setItem("qup-tutorial-seen", "1")`);
    await go(`${BASE}/play.html?size=${size}&mode=daily`);
    await evaluate(`document.querySelector('[data-speed="1000"]').click()`);   // instant animation

    async function placeSolution() {
        const boardSize = CANVAS_SIZES[size];
        const gridSize = (boardSize - Board.OUTLINE_STROKE - size * Board.GRID_STROKE) / size;
        const canvas = JSON.parse(await evaluate(`JSON.stringify(document.getElementById("canvas").getBoundingClientRect())`));
        // which hand tile each solution piece comes from (same matching as Show Solution)
        const used = new Set();
        const placements = definition.solution.map(({x, y, kind}) => {
            const index = definition.hand.findIndex((k, i) => k === kind && !used.has(i));
            used.add(index);
            return {x, y, index};
        }).sort((a, b) => b.index - a.index);   // highest tile first, so earlier tiles keep their place
        for (const {x, y, index} of placements) {
            const tile = JSON.parse(await evaluate(`JSON.stringify(document.querySelectorAll("#pool .pool-node")[${index}].getBoundingClientRect())`));
            const from = {x: tile.left + tile.width / 2, y: tile.top + tile.height / 2};
            const to = {
                x: canvas.left + Board.OUTLINE_STROKE - 2 + (Board.GRID_STROKE + gridSize) * x + gridSize / 2,
                y: canvas.top + Board.OUTLINE_STROKE - 2 + (Board.GRID_STROKE + gridSize) * y + gridSize / 2,
            };
            await mouse("mouseMoved", from.x, from.y);
            await mouse("mousePressed", from.x, from.y, {buttons: 1});
            await mouse("mouseMoved", (from.x + to.x) / 2, (from.y + to.y) / 2, {buttons: 1});
            await mouse("mouseMoved", to.x, to.y, {buttons: 1});
            await mouse("mouseReleased", to.x, to.y);
            await sleep(150);
        }
    }

    const banner = () => evaluate(`document.getElementById("result-banner").classList.contains("hidden") ? "(hidden)" : document.getElementById("result-text").textContent`);
    const runLabel = () => evaluate(`document.getElementById("run-label").textContent`);
    const progress = () => evaluate(`localStorage.getItem("qup-progress-v1")`);

    // ---- 1. first win
    await placeSolution();
    await shot("1-placed");
    await evaluate(`document.getElementById("run-button").click()`);
    await sleep(1500);
    const firstBanner = await banner();
    console.log("first run banner:", firstBanner, "| run button:", await runLabel());
    console.log("saved progress:", await progress());
    check(/^Solved! Streak: 1 day/.test(firstBanner), `first-run banner was "${firstBanner}"`);
    await shot("2-solved");

    // ---- 2. keep going and win again: no change to the streak
    await evaluate(`document.getElementById("run-button").click()`);   // "Keep going" restores the layout
    await sleep(300);
    await evaluate(`document.getElementById("run-button").click()`);   // Run again
    await sleep(1500);
    const secondBanner = await banner();
    const savedBeforeReplay = await progress();
    console.log("second win banner:", secondBanner, "| saved progress:", savedBeforeReplay);
    check(secondBanner === "Solved again!", `second-win banner was "${secondBanner}"`);

    // ---- 3. home page now shows DONE and a streak
    await go(`${BASE}/index.html`);
    await shot("3-home");
    console.log("home streak labels:", await evaluate(`JSON.stringify([...document.querySelectorAll(".card .tag.streak")].map(el => el.getAttribute("aria-label")))`));
    const playLabels = JSON.parse(await evaluate(`JSON.stringify([...document.querySelectorAll(".card .btns .btn:first-child")].map(el => el.textContent))`));
    console.log("home play labels:", JSON.stringify(playLabels));
    const stamps = await evaluate(`document.querySelectorAll(".card .stamp").length`);
    console.log("stamps:", stamps);
    check(stamps === 1, `expected 1 stamp on the home page, found ${stamps}`);
    // cards are in size order 3, 5, 7
    const expectedLabels = [3, 5, 7].map(n => n === size ? "Review" : "Play");
    check(JSON.stringify(playLabels) === JSON.stringify(expectedLabels), `play labels were ${JSON.stringify(playLabels)}, expected ${JSON.stringify(expectedLabels)}`);

    // ---- 4. replay the finished daily: the banner says "again", the streak is untouched
    await go(`${BASE}/play.html?size=${size}&mode=daily`);
    await evaluate(`document.querySelector('[data-speed="1000"]').click()`);
    await placeSolution();
    await evaluate(`document.getElementById("run-button").click()`);
    await sleep(1500);
    const replayBanner = await banner();
    const savedAfterReplay = await progress();
    console.log("replay banner:", replayBanner, "| saved progress:", savedAfterReplay);
    check(replayBanner === "Solved again!", `replay banner was "${replayBanner}"`);
    check(savedAfterReplay === savedBeforeReplay, `progress changed on replay: ${savedBeforeReplay} -> ${savedAfterReplay}`);

    // ---- 5. a look at every page, for a human to check
    for (const [name, url] of [
        ["home", `${BASE}/index.html`],
        ["play-3-daily", `${BASE}/play.html?size=3&mode=daily`],
        ["play-5-daily", `${BASE}/play.html?size=5&mode=daily`],
        ["play-7-daily", `${BASE}/play.html?size=7&mode=daily`],
        ["play-5-unlimited", `${BASE}/play.html?size=5&mode=unlimited`],
    ]) {
        await go(url);
        await shot(`page-${name}`);
    }
} finally {
    socket?.close();
    // wait for Chrome to exit (it writes to its profile while closing), then drop the profile and keep the screenshots
    const exited = new Promise(resolve => chrome.once("exit", resolve));
    chrome.kill();
    await Promise.race([exited, sleep(5000)]);
    rmSync(join(outDir, "profile"), {recursive: true, force: true, maxRetries: 5, retryDelay: 200});
}
if (!failed) console.log("PASS");
process.exit(process.exitCode ?? 0);
