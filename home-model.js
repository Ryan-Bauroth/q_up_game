import {isDone, streakFor} from "./progress.js";
import {playHref} from "./play-model.js";

// Pure description of one mode's card on the home page.

const LABELS = {3: "the mini", 5: "the classic", 7: "the big one"};

// Past this many days the card shows the number instead of more tally marks.
export const MAX_TALLY = 25;

// A streak as tally marks: groups of 5 (the fifth is drawn as a slash), then
// the leftover marks. 6 -> [5, 1].
export function tallyGroups(streak) {
    const shown = Math.min(streak, MAX_TALLY);
    const groups = Array(Math.floor(shown / 5)).fill(5);
    if (shown % 5 > 0) groups.push(shown % 5);
    return groups;
}

export function cardModel({size, progress, today}) {
    const done = isDone(progress, size, today);
    const streak = streakFor(progress, size, today);
    let streakText = "no streak yet";
    if (streak === 1) streakText = "1 day";
    else if (streak > 1) streakText = `${streak} days`;
    return {
        size,
        title: `${size} × ${size}`,
        label: LABELS[size],
        done,
        streak,
        tally: tallyGroups(streak),
        streakText,
        playLabel: done ? "Review" : "Play",
        dailyHref: playHref(size, "daily"),
        unlimitedHref: playHref(size, "unlimited"),
    };
}
