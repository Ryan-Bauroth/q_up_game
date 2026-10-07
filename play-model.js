import {formatDay} from "./dates.js";

// Pure helpers for the play page: what the URL asks for, and the words on it.

export const PLAY_SIZES = [3, 5, 7];
export const PLAY_MODES = ["daily", "unlimited"];

// Canvas pixels per board size: cells stay about 64-107px so numbers and
// arrows stay readable.
export const CANVAS_SIZES = {3: 320, 5: 400, 7: 490};

// "?size=5&mode=daily" -> {size: 5, mode: "daily"}, or null if either is missing or unknown
export function parsePlayParams(search) {
    const params = new URLSearchParams(search);
    const size = Number(params.get("size"));
    const mode = params.get("mode");
    if (!PLAY_SIZES.includes(size) || !PLAY_MODES.includes(mode)) return null;
    return {size, mode};
}

export const playHref = (size, mode) => `play.html?size=${size}&mode=${mode}`;

export function playTitle({size, mode, today}) {
    const board = `${size}×${size}`;
    return mode === "daily" ? `Daily · ${board} · ${formatDay(today)}` : `Unlimited · ${board}`;
}

const piecesText = count => `${count} ${count === 1 ? "piece" : "pieces"}`;

// What the banner says after a win, one line per "\n". A daily win also says how
// many pieces the player needed and, if the puzzle has cheaper ways, nudges
// toward them without saying how many pieces they use.
export function winMessage({daily, firstWin, streak, pieces, newWay = false, cheaperLeft = 0, allFound = false}) {
    if (!daily) return "Solved!";
    const lines = [];
    if (firstWin) lines.push(`Solved! Streak: ${streak} ${streak === 1 ? "day" : "days"}`);
    else lines.push(newWay ? "A new way to solve it!" : "Solved again!");
    if (pieces) lines.push(`Used ${piecesText(pieces)}.`);
    if (allFound) lines.push("You found every way!");
    else if (cheaperLeft > 0) lines.push(`${cheaperLeft === 1 ? "A cheaper way exists" : "Cheaper ways exist"}: try for fewer pieces.`);
    return lines.join("\n");
}

// The puzzle's known ways to solve it (largest first) against the piece counts the
// player has found. Ways not yet found show only "?", so their sizes stay a secret.
export function waysSummary(solutions, foundCounts) {
    const counts = solutions.map(solution => solution.length).sort((a, b) => b - a);
    const isFound = count => foundCounts.includes(count);
    // "cheaper" means fewer pieces than the cheapest way found so far; with none found there is no yardstick
    const fewestFound = foundCounts.length > 0 ? Math.min(...foundCounts) : 0;
    return {
        total: counts.length,
        found: counts.filter(isFound).length,
        cheaperLeft: counts.filter(count => count < fewestFound).length,
        allFound: counts.length > 0 && counts.every(isFound),
        items: counts.map(count => ({found: isFound(count), label: isFound(count) ? piecesText(count) : "?"})),
    };
}
