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

export function winMessage({daily, firstWin, streak}) {
    if (!daily) return "Solved!";
    if (!firstWin) return "Solved again!";
    return `Solved! Streak: ${streak} ${streak === 1 ? "day" : "days"}`;
}
