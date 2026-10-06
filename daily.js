import {generateDefinition} from "./generator.js";

// The daily puzzle is the normal generator driven by a seed made from the date
// and the size, so every player gets the same puzzle for a given day and size.
// Only integer math is used, so the result is identical on every browser.

// 32-bit FNV-1a hash of "<date>:<size>"
export function dailySeed(dateString, size) {
    let hash = 0x811c9dc5;
    for (const char of `${dateString}:${size}`) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

// mulberry32: a small seeded random number generator returning [0, 1)
export function seededRng(seed) {
    let a = seed | 0;
    return () => {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function dailyDefinition(dateString, size) {
    const definition = generateDefinition({size, rng: seededRng(dailySeed(dateString, size))});
    return {...definition, name: `Daily ${dateString}`};
}
