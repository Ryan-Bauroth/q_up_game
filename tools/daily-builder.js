import {generateDefinition} from "../generator.js";
import {findSolutions} from "../solutions.js";
import {dailySeed, seededRng} from "../daily.js";

// Builds one pre-made daily puzzle. A candidate is generated from a seed made from
// the date, the size and a counter (so the result is the same every time it is
// built), with no spare pieces (the main solution uses every hand piece), and then
// fully solved. It is accepted only if it has exactly the wanted number of
// solutions, all using different numbers of pieces. 3x3 boards are small, so they
// only need two; the others need three.

export const wantedSolutions = size => (size === 3 ? 2 : 3);

export function buildDaily(date, size, {maxCandidates = 100000, perCandidateMs = 60000, onCandidate} = {}) {
    const want = wantedSolutions(size);
    for (let attempt = 0; attempt < maxCandidates; attempt++) {
        const rng = seededRng(dailySeed(`${date}#${attempt}`, size));
        const definition = {...generateDefinition({size, rng, spares: 0}), name: `Daily ${date}`};
        // stop as soon as there are more solutions than wanted, or it takes too long
        const {solutions, complete} = findSolutions(definition, {maxSolutions: want + 1, timeLimitMs: perCandidateMs});
        onCandidate?.({attempt, solutions: solutions.length, complete});
        if (!complete || solutions.length !== want) continue;
        const counts = new Set(solutions.map(solution => solution.length));
        if (counts.size !== want) continue;
        return {date, size, attempt, definition, solutions};
    }
    return null;
}
