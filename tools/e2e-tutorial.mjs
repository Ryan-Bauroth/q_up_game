// End-to-end check of the guided tutorial, driving headless Chrome over the DevTools
// protocol (no libraries; needs Node 22+). First visit auto-opens it; every one of the
// seven lessons is checked (hint text, skipping, a miss, the two hint taps, then solved by
// dragging real pieces with real mouse events); then Done, reopening, and a phone width.
//
//   npm start                          (serves the project at http://localhost:3000)
//   node tools/e2e-tutorial.mjs
//
// Environment: QUP_URL (default http://localhost:3000), CHROME (path to Chrome),
// QUP_DEBUG_PORT (default 9333). Prints PASS and exits 0, or exits 1 listing the failures.
// Screenshots of levels 1, 4 and 7 at 390px wide go to a temp folder whose paths are printed.
import {spawn} from "node:child_process";
import {mkdtempSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

import {LEVELS} from "../tutorial-levels.js";

const port = Number(process.env.QUP_DEBUG_PORT ?? "9333");
const BASE = process.env.QUP_URL ?? "http://localhost:3000";
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const outDir = mkdtempSync(join(tmpdir(), "qup-e2e-tutorial-"));
const PAGE = `${BASE}/play.html?size=3&mode=unlimited`;

const chrome = spawn(CHROME, [
    "--headless=new", "--disable-gpu", `--remote-debugging-port=${port}`, `--user-data-dir=${join(outDir, "profile")}`,
    "--window-size=1200,900", "about:blank",
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
    const pageErrors = [];
    socket.addEventListener("message", event => {
        const message = JSON.parse(event.data);
        if (message.id && waiting.has(message.id)) {
            waiting.get(message.id)(message);
            waiting.delete(message.id);
        }
        if (message.method === "Runtime.exceptionThrown") pageErrors.push(JSON.stringify(message.params.exceptionDetails).slice(0, 300));
    });
    const send = (method, params = {}) => new Promise(resolve => {
        const id = nextId++;
        waiting.set(id, resolve);
        socket.send(JSON.stringify({id, method, params}));
    });
    const evaluate = async expression => {
        const response = await send("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true});
        if (response.result?.exceptionDetails) throw new Error(JSON.stringify(response.result.exceptionDetails));
        return response.result.result.value;
    };
    const mouse = (type, x, y, extra = {}) =>
        send("Input.dispatchMouseEvent", {type, x, y, button: "left", clickCount: 1, ...extra});
    const rectOf = async selector =>
        JSON.parse(await evaluate(`JSON.stringify(document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect())`));
    const click = async selector => {
        const r = await rectOf(selector);
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        await mouse("mouseMoved", x, y);
        await mouse("mousePressed", x, y, {buttons: 1});
        await mouse("mouseReleased", x, y);
        await sleep(120);
    };
    const drag = async (from, to) => {
        await mouse("mouseMoved", from.x, from.y);
        await mouse("mousePressed", from.x, from.y, {buttons: 1});
        await mouse("mouseMoved", (from.x + to.x) / 2, (from.y + to.y) / 2, {buttons: 1});
        await mouse("mouseMoved", to.x, to.y, {buttons: 1});
        await mouse("mouseReleased", to.x, to.y);
        await sleep(150);
    };
    const cellPoint = async (x, y) => {
        const r = await rectOf("#tutorial-canvas");
        const k = r.width / 320;
        return {x: r.left + (3 + 105 * x + 52) * k, y: r.top + (3 + 105 * y + 52) * k};
    };
    const tilePoint = async slot => {
        const r = await rectOf(`#tutorial-hand .pool-node[data-slot="${slot}"]`);
        return {x: r.left + r.width / 2, y: r.top + r.height / 2};
    };
    const card = expression => evaluate(`document.querySelector(".tutorial-card").${expression}`);
    const hint = () => evaluate(`document.querySelector("#tutorial-hint span").textContent`);
    const title = () => evaluate(`document.getElementById("tutorial-title").textContent`);
    const level = async () => Number(await card("dataset.level"));
    const handCount = () => evaluate(`document.querySelectorAll("#tutorial-hand .pool-node").length`);
    const dotWon = i => evaluate(`document.querySelectorAll(".tutorial-dot")[${i}].classList.contains("won")`);
    const closed = () => evaluate(`document.getElementById("tutorial").hidden`);
    const run = async () => {
        await click("#tutorial-run");
        await sleep(300);
        for (let i = 0; i < 80 && await card("dataset.state") !== "idle"; i++) await sleep(100);
    };
    const shoot = async name => {
        const r = await send("Page.captureScreenshot", {format: "png"});
        const path = join(outDir, `${name}.png`);
        writeFileSync(path, Buffer.from(r.result.data, "base64"));
        console.log(`screenshot: ${path}`);
    };

    await send("Page.enable");
    await send("Runtime.enable");
    await send("Page.navigate", {url: PAGE});
    await sleep(2500);

    // 1. first visit opens by itself at level 1 and sets the seen flag
    check(!await closed(), "tutorial opens by itself on the first visit");
    check(await evaluate(`localStorage.getItem("qup-tutorial-seen")`) === "1", "seen flag is set");
    check(await level() === 1, "first visit starts at level 1");

    // 2. every level
    for (let i = 0; i < LEVELS.length; i++) {
        const L = LEVELS[i], n = i + 1;
        if (i > 0) await click("#tutorial-next");
        check(await level() === n, `level ${n}: reached`);
        check(await title() === L.title, `level ${n}: title`);
        check(await hint() === L.hint, `level ${n}: hint line`);
        check(await evaluate(`!document.getElementById("tutorial-next").disabled`), `level ${n}: Next enabled before winning`);
        check(await evaluate(`!document.getElementById("tutorial-hint-button").hidden`), `level ${n}: Hint button visible`);
        check(await card("dataset.answer") === "hidden", `level ${n}: answer hidden at the start`);

        if (n === 2) {   // prove skipping: Next goes on without a win, Back returns
            await click("#tutorial-next");
            check(await level() === 3, "level 2: Next skips ahead without winning");
            await click("#tutorial-back");
            check(await level() === 2 && await hint() === L.hint, "level 2: Back returns to it");
        }

        const solution = L.definition.solution;
        if (solution.length > 0) {   // a deliberately wrong layout: leave it empty
            const before = await handCount();
            await run();
            check(await hint() === L.miss, `level ${n}: a miss shows the miss text`);
            check(await handCount() === before, `level ${n}: layout unchanged after a miss`);
            check(await card("dataset.state") === "idle", `level ${n}: idle again after a miss`);
        }

        await click("#tutorial-hint-button");
        check(await hint() === L.help, `level ${n}: Hint tap 1 shows help`);
        await click("#tutorial-hint-button");
        // when the solution places nothing there is no answer to draw
        check(await card("dataset.answer") === (solution.length > 0 ? "shown" : "hidden"),
            `level ${n}: Hint tap 2 ${solution.length > 0 ? "draws" : "has no"} answer`);

        for (const {x, y, kind} of solution) {
            const slot = L.definition.hand.indexOf(kind);
            await drag(await tilePoint(slot), await cellPoint(x, y));
        }
        check(await handCount() === L.definition.hand.length - solution.length, `level ${n}: pieces left the hand`);
        await run();
        check(await hint() === L.win, `level ${n}: win text after solving`);
        check(await dotWon(i), `level ${n}: step dot marked won`);
    }

    // 3. Done closes; reopen starts at level 1
    check(await evaluate(`document.getElementById("tutorial-next-label").textContent`) === "Done", "level 7: Next reads Done");
    await click("#tutorial-next");
    check(await closed(), "Done closes the tutorial");
    await click("#help-button");
    check(!await closed() && await level() === 1, "the ? button reopens at level 1");

    // 4. phone width: no horizontal scroll, screenshots of levels 1, 4, 7
    await send("Emulation.setDeviceMetricsOverride", {width: 390, height: 844, deviceScaleFactor: 2, mobile: true});
    await send("Page.navigate", {url: PAGE});
    await sleep(2000);
    await click("#help-button");
    if (await closed()) await click("#help-button");   // first-visit flag is set, so it only opens on tap
    for (const n of [1, 4, 7]) {
        while (await level() < n) await click("#tutorial-next");
        check(await evaluate(`document.documentElement.scrollWidth <= innerWidth`), `390px: no horizontal scroll on level ${n}`);
        await shoot(`level${n}-390`);
    }
    check(pageErrors.length === 0, `no page errors: ${pageErrors.join(" | ")}`);
} catch (error) {
    failed = true;
    process.exitCode = 1;
    console.log(`FAIL: ${error.message}`);
} finally {
    socket?.close();
    const exited = new Promise(resolve => chrome.once("exit", resolve));
    chrome.kill();
    await Promise.race([exited, sleep(5000)]);
    // Chrome may still be flushing its profile for a moment; never let that fail a finished run
    try { rmSync(join(outDir, "profile"), {recursive: true, force: true, maxRetries: 10, retryDelay: 300}); } catch { /* leave it to the OS */ }
}
console.log(failed ? "FAILED" : "PASS");
process.exit(failed ? 1 : 0);
