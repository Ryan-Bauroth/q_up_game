// Calendar helpers for the daily puzzle. A "day" is the calendar date in
// America/New_York (so it changes at midnight EST in winter, EDT in summer),
// written YYYY-MM-DD.

const EASTERN = "America/New_York";
const easternParts = new Intl.DateTimeFormat("en-US", {timeZone: EASTERN, year: "numeric", month: "2-digit", day: "2-digit"});

export function easternDateString(now = new Date()) {
    const parts = Object.fromEntries(easternParts.formatToParts(now).map(({type, value}) => [type, value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
}

// Milliseconds until the Eastern date next changes. The date never goes
// backwards and a day is at most 25 hours, so search for the first instant
// whose date differs; this stays right across the daylight-saving changes.
export function msUntilNextEasternMidnight(now = new Date()) {
    const today = easternDateString(now);
    let low = 0;                       // still today
    let high = 26 * 3600 * 1000;       // already tomorrow
    while (high - low > 1) {
        const middle = Math.floor((low + high) / 2);
        if (easternDateString(new Date(now.getTime() + middle)) === today) low = middle;
        else high = middle;
    }
    return high;
}

// Calendar arithmetic on YYYY-MM-DD strings (no time zones involved).
export function addDays(dateString, days) {
    const [year, month, day] = dateString.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + days));
    const pad = n => String(n).padStart(2, "0");
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-10-07" -> "Oct 7"
export function formatDay(dateString) {
    const [, month, day] = dateString.split("-").map(Number);
    return `${MONTHS[month - 1]} ${day}`;
}

// 3h 12m, 59m, or "less than a minute"
export function formatCountdown(ms) {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return minutes > 0 ? `${minutes}m` : "less than a minute";
}
