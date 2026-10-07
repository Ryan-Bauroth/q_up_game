import {isDone, streakFor} from "./progress.js";
import {playHref} from "./play-model.js";

// Pure description of one mode's card on the home page.

const LABELS = {3: "the mini", 5: "the classic", 7: "the big one"};

const NUMERALS = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];

// A whole number as a Roman numeral: 6 -> "VI". Only 1 to 3999 have one; for
// anything else this gives null and the card shows the plain number instead.
export function toRoman(number) {
    if (!Number.isInteger(number) || number < 1 || number > 3999) return null;
    let rest = number;
    let numeral = "";
    for (const [value, letters] of NUMERALS) {
        while (rest >= value) {
            numeral += letters;
            rest -= value;
        }
    }
    return numeral;
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
        roman: toRoman(streak),
        solution: done ? progress[size].solution ?? [] : [],   // the pieces the player placed today
        streakText,
        playLabel: done ? "Review" : "Play",
        dailyHref: playHref(size, "daily"),
        unlimitedHref: playHref(size, "unlimited"),
    };
}
