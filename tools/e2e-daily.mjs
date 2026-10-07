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
import {mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, dirname} from "node:path";
import {fileURLToPath} from "node:url";

import {getDaily} from "../daily-data.js";
import {easternDateString} from "../dates.js";
import {Board} from "../board.js";
import {CANVAS_SIZES} from "../play-model.js";

const size = Number(process.argv[2] ?? "5");
const port = Number(process.env.QUP_DEBUG_PORT ?? "9333");
const BASE = process.env.QUP_URL ?? "http://localhost:3000";
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const outDir = mkdtempSync(join(tmpdir(), "qup-e2e-"));

const today = easternDateString();
// the pre-built puzzle for today if dailies.json has it (with every way to solve it), else the live one
const dailiesPath = join(dirname(fileURLToPath(import.meta.url)), "..", "dailies.json");
const daily = getDaily(existsSync(dailiesPath) ? JSON.parse(readFileSync(dailiesPath, "utf8")) : null, today, size);
const definition = daily.definition;
const ways = daily.solutions;   // largest first, or null when today's puzzle was generated live

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
    console.log(`today (Eastern): ${today}; ${size}x${size} daily has ${definition.solution.length} pieces in the main solution; ways: ${ways ? ways.map(w => w.length).join("/") : "unknown (live puzzle)"}`);

    // ---- start from a clean slate, with the tutorial marked as seen
    await go(`${BASE}/index.html`);
    await evaluate(`localStorage.clear(); localStorage.setItem("qup-tutorial-seen", "1")`);
    await go(`${BASE}/play.html?size=${size}&mode=daily`);
    await evaluate(`document.querySelector('[data-speed="1000"]').click()`);   // instant animation

    // Drags a layout (a list of {x, y, kind}) from the hand onto the board.
    async function placeLayout(layout) {
        const boardSize = CANVAS_SIZES[size];
        const gridSize = (boardSize - Board.OUTLINE_STROKE - size * Board.GRID_STROKE) / size;
        const canvas = JSON.parse(await evaluate(`JSON.stringify(document.getElementById("canvas").getBoundingClientRect())`));
        // which hand tile each piece comes from (the hand starts in definition.hand order)
        const used = new Set();
        const placements = layout.map(({x, y, kind}) => {
            const index = definition.hand.findIndex((k, i) => k === kind && !used.has(i));
            used.add(index);
            return {x, y, index};
        }).sort((a, b) => b.index - a.index);   // highest tile first, so earlier tiles keep their place
        for (const {x, y, index} of placements) {
            const tile = JSON.parse(await evaluate(`JSON.stringify(document.querySelector('#pool .pool-node[data-slot="${index}"]').getBoundingClientRect())`));
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
    const placeSolution = () => placeLayout(definition.solution);   // the main way: every hand piece
    // Solve, then clear the board, ready to try a different way.
    const runAndWait = async () => {
        await evaluate(`document.getElementById("run-button").click()`);
        await sleep(1500);
    };
    const startOver = async () => {
        await evaluate(`document.getElementById("clear-button").click()`);   // back to the start, description returns
        await sleep(300);
    };

    const banner = () => evaluate(`document.getElementById("result-banner").classList.contains("hidden") ? "(hidden)" : document.getElementById("result-text").textContent`);
    const runLabel = () => evaluate(`document.getElementById("run-label").textContent`);
    const progress = () => evaluate(`localStorage.getItem("qup-progress-v1")`);

    const piecesWord = n => `${n} ${n === 1 ? "piece" : "pieces"}`;
    const shown = id => evaluate(`getComputedStyle(document.getElementById("${id}")).display !== "none"`);
    const waysText = () => evaluate(`document.getElementById("ways-box").hidden ? "(hidden)" : document.getElementById("ways").getAttribute("aria-label")`);
    const mainCount = definition.solution.length;
    const cheaper = ways ? ways.slice(1) : [];   // the clever ways, largest first

    // ---- 1. first win, with the main way (every piece)
    await placeSolution();
    await shot("1-placed");
    await runAndWait();
    const firstBanner = await banner();
    console.log("first run banner:", JSON.stringify(firstBanner), "| run button:", await runLabel());
    console.log("saved progress:", await progress());
    check(firstBanner.startsWith("Solved! Streak: 1 day"), `first-run banner was "${firstBanner}"`);
    if (ways) {
        check(firstBanner.includes(`Used ${piecesWord(mainCount)}.`), `banner did not say ${mainCount} pieces: "${firstBanner}"`);
        check(/solutions? exists?: try for fewer pieces\./.test(firstBanner), `banner did not say cheaper ways exist: "${firstBanner}"`);
        const text = await waysText();
        console.log("ways box:", JSON.stringify(text));
        check(text.includes(`1 of ${ways.length}`), `ways box was "${text}"`);
    }
    check(await shown("summary-box") === false && await shown("result-banner") === true, "the result should replace the description");
    check(await runLabel() === "Next puzzle", `the run button should say Next puzzle, got "${await runLabel()}"`);
    await shot("2-solved");

    // ---- 2. the same way again changes nothing; then the cheaper ways are found one by one
    await startOver();
    check(await shown("summary-box") === true && await shown("result-banner") === false, "the description should return after Clear");
    await placeSolution();
    await runAndWait();
    const secondBanner = await banner();
    const savedBeforeReplay = await progress();
    console.log("same way again:", JSON.stringify(secondBanner));
    check(secondBanner.startsWith("Solved again!"), `second-win banner was "${secondBanner}"`);
    for (const [i, layout] of cheaper.entries()) {
        await startOver();
        await placeLayout(layout);
        await runAndWait();
        const text = await banner();
        console.log(`a cheaper way (${layout.length} pieces):`, JSON.stringify(text));
        check(text.startsWith("A new solution!"), `a new way's banner was "${text}"`);
        check(text.includes(`Used ${piecesWord(layout.length)}.`), `banner did not say ${layout.length} pieces: "${text}"`);
        if (i === cheaper.length - 1) check(text.includes("You found every solution!"), `banner did not say every way was found: "${text}"`);
    }
    const savedAfterWays = await progress();
    console.log("saved progress after finding the ways:", savedAfterWays);
    if (ways) {
        const saved = JSON.parse(savedAfterWays)[size];
        check(saved.streak === 1, `finding more ways changed the streak: ${savedAfterWays}`);
        check(JSON.stringify(Object.keys(saved.solutions).map(Number).sort((a, b) => a - b)) === JSON.stringify(ways.map(w => w.length).sort((a, b) => a - b)),
            `saved solutions should be one per way: ${savedAfterWays}`);
        check((await waysText()).includes(`${ways.length} of ${ways.length}`), `ways box was "${await waysText()}"`);
    }

    // ---- 3. home page now shows DONE and a streak
    await go(`${BASE}/index.html`);
    await shot("3-home");
    console.log("home streak labels:", await evaluate(`JSON.stringify([...document.querySelectorAll(".card .tag.streak")].map(el => el.getAttribute("aria-label")))`));
    const playLabels = JSON.parse(await evaluate(`JSON.stringify([...document.querySelectorAll(".card .btns .btn:first-child")].map(el => el.textContent))`));
    console.log("home play labels:", JSON.stringify(playLabels));
    const finished = JSON.parse(await evaluate(`JSON.stringify([...document.querySelectorAll('.card[data-done="true"]')].map(el => [el.dataset.size, el.dataset.placed]))`));
    console.log("finished cards (size, pieces of your solution shown):", JSON.stringify(finished));
    check(finished.length === 1 && finished[0][0] === String(size), `expected one finished ${size}x${size} card, found ${JSON.stringify(finished)}`);
    const cheapestCount = ways ? ways[ways.length - 1].length : mainCount;
    check(finished.length === 1 && Number(finished[0][1]) === cheapestCount, `the card should show your cheapest solution (${cheapestCount} pieces), shows ${finished[0]?.[1]}`);
    const captions = JSON.parse(await evaluate(`JSON.stringify([...document.querySelectorAll('.card[data-done="true"] .sub')].map(el => el.textContent))`));
    console.log("finished card caption:", JSON.stringify(captions));
    check(captions.length === 1 && captions[0].includes(piecesWord(cheapestCount)), `the caption should say ${piecesWord(cheapestCount)}: ${JSON.stringify(captions)}`);
    check(await evaluate(`document.querySelectorAll(".card .stamp").length`) === 0, "the DONE stamp should be gone");
    // cards are in size order 3, 5, 7
    const expectedLabels = [3, 5, 7].map(n => n === size ? "Review" : "Play");
    check(JSON.stringify(playLabels) === JSON.stringify(expectedLabels), `play labels were ${JSON.stringify(playLabels)}, expected ${JSON.stringify(expectedLabels)}`);

    // ---- 4. replay the finished daily: the banner says "again", the streak is untouched
    await go(`${BASE}/play.html?size=${size}&mode=daily`);
    if (ways) check((await waysText()).includes(`${ways.length} of ${ways.length}`), `a finished daily should show its ways when it opens, got "${await waysText()}"`);
    await evaluate(`document.querySelector('[data-speed="1000"]').click()`);
    await placeSolution();
    await evaluate(`document.getElementById("run-button").click()`);
    await sleep(1500);
    const replayBanner = await banner();
    const savedAfterReplay = await progress();
    console.log("replay banner:", JSON.stringify(replayBanner), "| saved progress:", savedAfterReplay);
    // "Next puzzle" goes on to a daily that is not solved yet
    await evaluate(`document.getElementById("run-button").click()`);
    await sleep(800);
    const nextUrl = await evaluate(`location.href`);
    check(nextUrl.includes("mode=daily") && !nextUrl.includes(`size=${size}&`) && !nextUrl.endsWith(`size=${size}`), `Next puzzle should go to another daily, went to ${nextUrl}`);
    check(replayBanner.startsWith("Solved again!"), `replay banner was "${replayBanner}"`);
    check(savedAfterReplay === savedAfterWays, `progress changed on replay: ${savedAfterWays} -> ${savedAfterReplay}`);

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
