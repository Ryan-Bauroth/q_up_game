import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtempSync, readFileSync, existsSync, writeFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {pickDaily} from "../daily-data.js";
import {dateRange} from "./build-dailies.mjs";

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
