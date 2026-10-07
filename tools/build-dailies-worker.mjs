import {parentPort} from "node:worker_threads";
import {buildDaily} from "./daily-builder.js";

// Builds one day-and-size at a time for the main script.
parentPort.on("message", ({date, size, capMs, maxCandidates}) => {
    const started = Date.now();
    const built = buildDaily(date, size, {perCandidateMs: capMs, maxCandidates});
    parentPort.postMessage({date, size, built, seconds: (Date.now() - started) / 1000});
});
