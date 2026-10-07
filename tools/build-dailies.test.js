import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtempSync, readFileSync, existsSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {pickDaily} from "../daily-data.js";
import {EventEmitter} from "node:events";
import {dateRange, runTasks} from "./build-dailies.mjs";

const script = join(dirname(fileURLToPath(import.meta.url)), "build-dailies.mjs");

test("dateRange lists consecutive days, across a month end", () => {
    assert.deepEqual(dateRange("2026-10-30", 4), ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    assert.deepEqual(dateRange("2026-10-07", 1), ["2026-10-07"]);
});

test("the build script writes a file the game can read, and a second run builds nothing new", () => {
    const dir = mkdtempSync(join(tmpdir(), "qube-dailies-"));
    const out = join(dir, "dailies.json");
    try {
        const run = (...extra) => execFileSync("node", [script, "--from", "2026-10-07", "--days", "2", "--sizes", "3,5", "--out", out, "--workers", "2", ...extra], {encoding: "utf8"});
        const first = run();
        assert.match(first, /built 4/);
        const file = JSON.parse(readFileSync(out, "utf8"));
        assert.equal(file.version, 1);
        for (const date of ["2026-10-07", "2026-10-08"]) {
            for (const size of [3, 5]) {
                const picked = pickDaily(file, date, size);
                assert.ok(picked, `${date} ${size}x${size}`);
                assert.equal(picked.solutions.length, size === 3 ? 2 : 3);
            }
        }
        // running again keeps what is there
        const before = readFileSync(out, "utf8");
        const second = run();
        assert.match(second, /built 0/);
        assert.equal(readFileSync(out, "utf8"), before);
        // a day added later joins the file without disturbing the others
        const third = execFileSync("node", [script, "--from", "2026-10-07", "--days", "3", "--sizes", "3,5", "--out", out, "--workers", "2"], {encoding: "utf8"});
        assert.match(third, /built 2/);
        const grown = JSON.parse(readFileSync(out, "utf8"));
        assert.deepEqual(grown.puzzles["2026-10-07"], file.puzzles["2026-10-07"]);
        assert.ok(pickDaily(grown, "2026-10-09", 5));
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
});

test("it refuses a size it cannot build", () => {
    const dir = mkdtempSync(join(tmpdir(), "qube-dailies-"));
    try {
        assert.throws(() => execFileSync("node", [script, "--sizes", "4", "--out", join(dir, "x.json")], {stdio: "pipe"}));
        assert.equal(existsSync(join(dir, "x.json")), false);
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
});

for (const [name, argv] of [["an unknown flag", ["--day", "3"]], ["a non-numeric --workers", ["--workers", "abc"]], ["--days 0", ["--days", "0"]],
    ["a flag without a value", ["--days"]], ["a bad --from", ["--from", "2026-13-45"]], ["a bad --cap-seconds", ["--cap-seconds", "0"]]]) {
    test(`it rejects ${name} with a one-line error before doing anything`, () => {
        const dir = mkdtempSync(join(tmpdir(), "qube-dailies-"));
        try {
            const out = join(dir, "x.json");
            let error;
            try {
                execFileSync("node", [script, ...argv, "--out", out], {stdio: "pipe"});
            } catch (e) {
                error = e;
            }
            assert.ok(error, "should fail");
            assert.equal(error.status, 1);
            assert.equal(String(error.stderr).trim().split("\n").length, 1, String(error.stderr));
            assert.equal(existsSync(out), false);
        } finally {
            rmSync(dir, {recursive: true, force: true});
        }
    });
}

// a fake worker: behave(task) returns {message} to answer or {error} to die
function fakeFactory(behave) {
    return () => {
        const worker = new EventEmitter();
        worker.dead = false;
        worker.postMessage = task => setImmediate(() => {
            if (worker.dead) return;       // a dead worker loses what it is given
            const outcome = behave(task);
            if (outcome.error) {
                worker.dead = true;
                worker.emit("error", outcome.error);
            } else {
                worker.emit("message", outcome.message);
            }
        });
        worker.terminate = () => { worker.dead = true; };
        return worker;
    };
}

const fakeTasks = n => Array.from({length: n}, (_, i) => ({date: `d${i}`, size: 3}));
const collect = () => {
    const results = [];
    return {results, onResult: r => results.push(r)};
};

test("runTasks reports every task when the workers all behave", async () => {
    const {results, onResult} = collect();
    const summary = await runTasks(fakeTasks(5), {workers: 2, onResult, createWorker: fakeFactory(task => ({message: {...task, built: {}, seconds: 0}}))});
    assert.equal(results.length, 5);
    assert.ok(results.every(r => !r.error));
    assert.equal(summary.errors, 0);
});

test("runTasks counts a task whose worker died as failed and finishes the rest", async () => {
    const {results, onResult} = collect();
    const summary = await runTasks(fakeTasks(5), {workers: 2, onResult, createWorker: fakeFactory(task => task.date === "d0" ? {error: new Error("boom")} : {message: {...task, built: {}, seconds: 0}})});
    assert.equal(results.length, 5);
    assert.deepEqual(results.filter(r => r.error).map(r => r.task.date), ["d0"]);
    assert.equal(summary.errors, 1);
});

test("runTasks does not hang when every worker errors", async () => {
    const {results, onResult} = collect();
    const summary = await runTasks(fakeTasks(4), {workers: 2, onResult, createWorker: fakeFactory(() => ({error: new Error("boom")}))});
    assert.equal(results.length, 4);
    assert.ok(results.every(r => r.error));
    assert.equal(summary.errors, 4);
});

test("runTasks with nothing to do resolves at once", async () => {
    const summary = await runTasks([], {workers: 2, onResult() {}, createWorker: fakeFactory(() => ({error: new Error("never")}))});
    assert.equal(summary.errors, 0);
});
