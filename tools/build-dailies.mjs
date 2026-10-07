// Pre-builds the daily puzzles into dailies.json, so every daily has a verified,
// complete list of ways to solve it (3 ways, or 2 for 3x3), with the main way
// using every piece in the hand.
//
//   node tools/build-dailies.mjs [--from YYYY-MM-DD] [--days 30] [--sizes 3,5,7]
//        [--out dailies.json] [--workers 4] [--cap-seconds 60] [--max-candidates 20000]
//
// It keeps what is already in the file, so run it again later with a bigger
// --days (or a later --from) to add more. 3x3 and 5x5 take about a second per day;
// 7x7 takes a few minutes per day on one core, so give it several workers.
import {Worker} from "node:worker_threads";
import {readFileSync, writeFileSync, renameSync, existsSync} from "node:fs";
import {cpus} from "node:os";
import {fileURLToPath} from "node:url";
import {dirname, join, resolve} from "node:path";
import {addDays, easternDateString} from "../dates.js";
import {SIZES} from "../generator.js";

export function dateRange(from, days) {
    return Array.from({length: days}, (_, i) => addDays(from, i));
}

function parseArgs(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i += 2) {
        const flag = argv[i];
        if (!flag.startsWith("--") || argv[i + 1] === undefined) throw new Error(`bad argument: ${flag}`);
        args[flag.slice(2)] = argv[i + 1];
    }
    return args;
}

async function main() {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    const args = parseArgs(process.argv.slice(2));
    const from = args.from ?? easternDateString();
    const days = Number(args.days ?? 30);
    const sizes = (args.sizes ?? SIZES.join(",")).split(",").map(Number);
    const out = resolve(args.out ?? join(root, "dailies.json"));
    const workers = Math.max(1, Number(args.workers ?? Math.max(1, cpus().length - 1)));
    const capMs = Number(args["cap-seconds"] ?? 60) * 1000;
    const maxCandidates = Number(args["max-candidates"] ?? 20000);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) throw new Error(`--from must look like 2026-10-07, not ${from}`);
    for (const size of sizes) if (!SIZES.includes(size)) throw new Error(`cannot build ${size}x${size} puzzles (sizes: ${SIZES.join(", ")})`);

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

    const save = () => {
        file.built = new Date().toISOString().slice(0, 10);
        writeFileSync(`${out}.tmp`, JSON.stringify(file));
        renameSync(`${out}.tmp`, out);   // the file is never left half written
    };
    // the file grows to about a megabyte, so save at most every couple of seconds (and once at the end)
    let lastSave = 0, unsaved = false;
    const saveSoon = () => {
        if (Date.now() - lastSave >= 2000) {
            save();
            lastSave = Date.now();
            unsaved = false;
        } else {
            unsaved = true;
        }
    };
    let built = 0, failed = 0, done = 0;
    const started = Date.now();
    await new Promise(finish => {
        if (tasks.length === 0) return finish();
        let active = 0;
        const pool = [];
        const next = worker => {
            const task = tasks.shift();
            if (!task) {
                worker.terminate();
                if (--active === 0) finish();
                return;
            }
            worker.postMessage(task);
        };
        for (let i = 0; i < Math.min(workers, tasks.length); i++) {
            const worker = new Worker(join(dirname(fileURLToPath(import.meta.url)), "build-dailies-worker.mjs"));
            pool.push(worker);
            active++;
            worker.on("message", ({date, size, built: result, seconds}) => {
                done++;
                if (result) {
                    (file.puzzles[date] ??= {})[size] = {attempt: result.attempt, definition: result.definition, solutions: result.solutions};
                    built++;
                    saveSoon();
                } else {
                    failed++;
                }
                const elapsed = Math.round((Date.now() - started) / 1000);
                console.log(`${result ? "ok  " : "FAIL"} ${date} ${size}x${size}  ${seconds.toFixed(1)}s  (${done} done, ${elapsed}s elapsed)`);
                next(worker);
            });
            worker.on("error", error => {
                console.error(error);
                process.exitCode = 1;
                next(worker);
            });
            next(worker);
        }
    });
    if (unsaved) save();
    console.log(`built ${built}${failed ? `, could not build ${failed} (those days fall back to a live puzzle)` : ""}`);
}

// run only when started from the command line, not when imported by a test
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    main().catch(error => {
        console.error(error.message);
        process.exit(1);
    });
}
