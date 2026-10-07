import {generateDefinition} from "../generator.js";
import {findSolutions} from "../solutions.js";
import {dailySeed, seededRng} from "../daily.js";

// Builds one pre-made daily puzzle. A candidate is generated from a seed made from
// the date, the size and a counter (so the result is the same every time it is
// built), with no spare pieces (the main solution uses every hand piece), and then
// fully solved (never a partial list). It is accepted only if it has at least
// MIN_SOLUTIONS solutions, all using different numbers of pieces. There is no upper
// limit: the whole list is stored. Every board size uses the same rule.

export const MIN_SOLUTIONS = 2;

export function buildDaily(date, size, {maxCandidates = 100000, perCandidateMs = 60000, onCandidate} = {}) {
    for (let attempt = 0; attempt < maxCandidates; attempt++) {
        const rng = seededRng(dailySeed(`${date}#${attempt}`, size));
        const definition = {...generateDefinition({size, rng, spares: 0}), name: `Daily ${date}`};
        // drop the candidate if it cannot be fully solved in time
        const {solutions, complete} = findSolutions(definition, {timeLimitMs: perCandidateMs});
        onCandidate?.({attempt, solutions: solutions.length, complete});
        if (!complete || solutions.length < MIN_SOLUTIONS) continue;
        // solutions are largest first: the main one must use every piece in the hand
        if (solutions[0].length !== definition.hand.length) continue;
        const counts = new Set(solutions.map(solution => solution.length));
        if (counts.size !== solutions.length) continue;
        return {date, size, attempt, definition, solutions};
    }
    return null;
}
