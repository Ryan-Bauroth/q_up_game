// Pre-builds the daily puzzles into dailies.json, so every daily has a verified,
// complete list of ways to solve it (at least 2, no upper limit), with the main way
// using every piece in the hand.
//
//   node tools/build-dailies.mjs [--from YYYY-MM-DD] [--days 30] [--sizes 3,5,7]
//        [--out dailies.json] [--workers 4] [--cap-seconds 60] [--max-candidates 20000]
//
// It keeps what is already in the file, so run it again later with a bigger
// --days (or a later --from) to add more. 7x7 is much slower than 3x3 and 5x5,
// so give it several workers.
import {Worker} from "node:worker_threads";
import {readFileSync, writeFileSync, renameSync, existsSync, realpathSync} from "node:fs";
import {cpus} from "node:os";
import {fileURLToPath} from "node:url";
import {dirname, join, resolve} from "node:path";
import {addDays, easternDateString} from "../dates.js";
import {SIZES} from "../generator.js";

export function dateRange(from, days) {
    return Array.from({length: days}, (_, i) => addDays(from, i));
}

const FLAGS = ["from", "days", "sizes", "out", "workers", "cap-seconds", "max-candidates"];

export function parseArgs(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i += 2) {
        const flag = argv[i];
        if (!flag.startsWith("--") || !FLAGS.includes(flag.slice(2))) throw new Error(`unknown argument: ${flag} (flags: ${FLAGS.map(f => `--${f}`).join(" ")})`);
        if (argv[i + 1] === undefined) throw new Error(`${flag} needs a value`);
        args[flag.slice(2)] = argv[i + 1];
    }
    return args;
}

function positiveInt(args, name, fallback) {
    const text = args[name] ?? String(fallback);
    if (!/^[1-9]\d*$/.test(text)) throw new Error(`--${name} must be a positive whole number, not ${text}`);
    return Number(text);
}

function realDate(text) {
    return /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(`${text}T00:00:00Z`))
        && new Date(`${text}T00:00:00Z`).toISOString().slice(0, 10) === text;
}

export function readOptions(argv, root) {
    const args = parseArgs(argv);
    const from = args.from ?? easternDateString();
    if (!realDate(from)) throw new Error(`--from must be a real date like 2026-10-07, not ${from}`);
    const sizes = (args.sizes ?? SIZES.join(",")).split(",").map(Number);
    for (const size of sizes) if (!SIZES.includes(size)) throw new Error(`cannot build ${size}x${size} puzzles (sizes: ${SIZES.join(", ")})`);
    const cap = Number(args["cap-seconds"] ?? 60);
    if (!Number.isFinite(cap) || cap <= 0) throw new Error(`--cap-seconds must be a positive number, not ${args["cap-seconds"]}`);
    return {
        from, sizes,
        days: positiveInt(args, "days", 30),
        out: resolve(args.out ?? join(root, "dailies.json")),
        workers: positiveInt(args, "workers", Math.max(1, cpus().length - 1)),
        capMs: cap * 1000,
        maxCandidates: positiveInt(args, "max-candidates", 20000),
    };
}

// Runs the tasks on a pool of workers. createWorker() returns an object with
// postMessage, terminate, on("message") and on("error"). onResult gets
// {task, message} for a finished task, or {task, error} when its worker died (a dead
// worker is never given more work; a fresh one takes its place while tasks remain).
// Resolves with {errors} once every task has been reported.
export function runTasks(tasks, {workers, createWorker, onResult}) {
    const queue = [...tasks];
    let active = 0, errors = 0;
    return new Promise(finish => {
        const check = () => { if (active === 0 && queue.length === 0) finish({errors}); };
        const spawn = () => {
            const worker = createWorker();
            let current = null, dead = false;
            active++;
            const assign = () => {
                if (queue.length === 0) {
                    current = null;
                    dead = true;
                    worker.terminate();
                    active--;
                    check();
                    return;
                }
                current = queue.shift();
                worker.postMessage(current);
            };
            worker.on("message", message => {
                if (dead) return;
                const task = current;
                onResult({task, message});
                assign();
            });
            worker.on("error", error => {
                if (dead) return;
                dead = true;
                errors++;
                try { worker.terminate(); } catch { /* already gone */ }
                active--;
                onResult({task: current, error});
                if (queue.length > 0) spawn();
                check();
            });
            assign();
        };
        if (queue.length === 0) return finish({errors});
        for (let i = 0; i < Math.min(workers, tasks.length); i++) spawn();
    });
}

async function main() {
    const here = dirname(fileURLToPath(import.meta.url));
    const {from, sizes, days, out, workers, capMs, maxCandidates} = readOptions(process.argv.slice(2), join(here, ".."));

    const file = existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : {version: 1, puzzles: {}};
    file.version = 1;
    file.puzzles ??= {};
    const tasks = [];
    for (const date of dateRange(from, days)) {
        for (const size of sizes) {
            if (!file.puzzles[date]?.[size]) tasks.push({date, size, capMs, maxCandidates});
        }
    }
    console.log(`${tasks.length} to build (${days} days from ${from}, sizes ${sizes.join(",")}), ${workers} workers, writing ${out}`);

    // Do not run two builds on the same file at once: the last one to save wins.
    const save = () => {
        file.built = new Date().toISOString().slice(0, 10);
        const temp = `${out}.${process.pid}.tmp`;
        writeFileSync(temp, JSON.stringify(file));
        renameSync(temp, out);   // the file is never left half written
    };
    // the file grows to about a megabyte, so save at most every couple of seconds: the
    // first unsaved result starts a timer, and the end (or Ctrl-C) saves whatever is left
    let timer = null;
    const saveSoon = () => {
        timer ??= setTimeout(() => {
            timer = null;
            save();
        }, 2000);
    };
    let built = 0, failed = 0, done = 0, erroredWorkers = 0;
    const started = Date.now();
    const live = new Set();
    const createWorker = () => {
        const worker = new Worker(join(here, "build-dailies-worker.mjs"));
        live.add(worker);
        return worker;
    };
    process.once("SIGINT", () => {
        clearTimeout(timer);
        save();
        console.log(`saved ${built} new, stopping`);
        for (const worker of live) worker.terminate();
        process.exit(130);
    });
    try {
        const summary = await runTasks(tasks, {
            workers, createWorker,
            onResult: ({task, message, error}) => {
                done++;
                const elapsed = Math.round((Date.now() - started) / 1000);
                if (error) {
                    failed++;
                    console.error(`worker error on ${task?.date} ${task?.size}x${task?.size}: ${error?.stack ?? error}`);
                    console.log(`FAIL ${task?.date} ${task?.size}x${task?.size}  (${done} done, ${elapsed}s elapsed)`);
                    return;
                }
                const {date, size, built: result, seconds} = message;
                if (result) {
                    (file.puzzles[date] ??= {})[size] = {attempt: result.attempt, definition: result.definition, solutions: result.solutions};
                    built++;
                    saveSoon();
                } else {
                    failed++;
                }
                console.log(`${result ? "ok  " : "FAIL"} ${date} ${size}x${size}  ${seconds.toFixed(1)}s  (${done} done, ${elapsed}s elapsed)`);
            },
        });
        erroredWorkers = summary.errors;
    } finally {
        clearTimeout(timer);
        save();
        for (const worker of live) worker.terminate();
    }
    console.log(`built ${built}${failed ? `, could not build ${failed} (those days fall back to a live puzzle)` : ""}`);
    if (erroredWorkers > 0) process.exitCode = 1;
}

// run only when started from the command line, not when imported by a test
const isMain = () => {
    if (!process.argv[1]) return false;
    try {
        return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
    } catch {
        return false;
    }
};
if (isMain()) {
    main().catch(error => {
        console.error(error.message);
        process.exit(1);
    });
}
