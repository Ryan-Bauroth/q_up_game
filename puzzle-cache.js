// Keeps a few ready-made random puzzles so pressing "random" never waits. A
// board is built in small slices (setTimeout between them) so the page stays
// responsive; if the cache is empty, `quick` builds a smaller-pool board on the spot.
//   newRun: () => {step(count) -> done?, result() -> definition}
//   quick:  () => definition
export function createPuzzleCache({newRun, quick, size = 3, slice = 4, schedule = fn => setTimeout(fn, 0)}) {
    const ready = [];
    let run = null;        // the board being built right now, if any
    let scheduled = false;

    function tick() {
        scheduled = false;
        run ??= newRun();
        if (run.step(slice)) {
            ready.push(run.result());
            run = null;
        }
        fill();
    }

    // Starts (or continues) filling the cache up to `size` boards.
    function fill() {
        if (scheduled || ready.length >= size) return;
        scheduled = true;
        schedule(tick);
    }

    return {
        fill,
        take() {
            const next = ready.shift() ?? quick();
            fill();
            return next;
        },
        get ready() {
            return ready.length;
        },
    };
}
