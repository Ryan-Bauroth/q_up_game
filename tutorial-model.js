// Pure rules for the tutorial card: what the hint line says, and when the Hint
// button has gone as far as showing the answer.

// state: {won, misses (failed runs so far), helpTaps (0, 1, 2+)}
export function hintLine(level, {won = false, misses = 0, helpTaps = 0} = {}) {
    if (won) return level.win;
    if (helpTaps >= 1) return level.help;
    if (misses > 0) return level.miss;
    return level.hint;
}

// The second tap of the Hint button shows where the answer goes.
export const answerShown = ({helpTaps = 0} = {}) => helpTaps >= 2;

export const answerCells = level => level.definition.solution.map(({x, y, kind}) => ({x, y, kind}));
