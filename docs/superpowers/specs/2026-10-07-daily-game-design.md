# Daily game: 3x3, 5x5, 7x7, with a hand-drawn home page

## Goals
- A home page where the player picks one of three modes (3x3, 5x5, 7x7). Each mode has a daily puzzle and an unlimited mode.
- Every player gets the same daily puzzle for a given day and size. Unlimited puzzles are random.
- The daily puzzles are randomly generated, but reproducibly: the same date and size always give the same puzzle, on every browser, with no server.
- Streaks and "completed" state, kept per browser.
- A distinctive look: warm paper, hand-drawn ink outlines that wiggle a little (like Baba Is You), with the real game board unchanged inside it.
- Hostable on GitHub Pages (static files only).

## Decisions (from the brainstorm)
- Sizes are 3x3, 5x5 and 7x7. (9x9 was dropped as too complex.)
- A new daily puzzle starts at **midnight Eastern** (`America/New_York`, so midnight EST in winter and EDT in summer).
- The 10 hand-built levels and the numbered picker are **removed**. They will not be reused.
- After winning a daily: the card shows "DONE!" and the streak, and can be reopened to replay. Each mode has its **own streak**.
- Daily play has no Show Solution, New, Back or forward. Unlimited keeps them.
- Visual direction: "paper and ink", strong wiggle, pure white cards, boards as recessed screens with raised labels. The final mockup is `docs/superpowers/mockups/home-and-game-v4.html` (a content fragment for the brainstorm viewer: read its `<style>` and markup as the visual reference).
- The core game UI does not change: the board canvas, grid, pieces, beams, hover behavior and animations stay as they are.

## 1. Pages
- `index.html` is the home page. `play.html?size=3|5|7&mode=daily|unlimited` is the game. All links are relative (GitHub Pages project sites live under `/repo-name/`).
- Local development still uses `npm start` (Express static server). The deployed site needs no server.
- An unknown or missing `size`/`mode` on `play.html` redirects to `index.html`.

## 2. Day logic (`daily.js`)
- `easternDateString(now = new Date())` returns `YYYY-MM-DD` for the Eastern calendar date, using `Intl.DateTimeFormat("en-CA", {timeZone: "America/New_York", ...})`.
- `msUntilNextEasternMidnight(now)` returns the milliseconds until the Eastern date next changes (correct across DST changes).
- `dailySeed(dateString, size)` is a 32-bit FNV-1a hash of `"<date>:<size>"`.
- `seededRng(seed)` is mulberry32 (integer math only, so identical on every engine).
- `dailyDefinition(dateString, size)` returns `generateDefinition({size, rng: seededRng(dailySeed(...))})`.
- Tests pin the exact puzzle for a few fixed date and size pairs, so a later generator change cannot silently change everyone's daily puzzle. If that test must change on purpose, it means "today's puzzle changes for everyone".

## 3. Generator (`generator.js`)
The random-scatter generator does not scale (at 9x9 it never produced a board; at 7x7 it failed about 1 in 5). It is replaced for **all sizes** by a chain-growing generator:
1. Place the starters (yellow) at random cells where they reach the board.
2. Repeatedly pick a placed piece that still has an empty in-bounds target cell and put a new reactor on that cell (a kind that reaches the board from there), until the piece budget is met. Every piece is therefore activated by construction.
3. Run the full layout. Empty cells the chain hit become locked targets with the number of hits as their charge. Reject boards that do not use every piece or that have too many or too few targets.
4. Choose some non-starter pieces as the solution (they go to the hand). The rest are locked. Add 1-2 spare hand pieces (random kinds). Shuffle the hand.
5. Reject unless `isSensible(definition)` passes (the existing gate: not already solved, every placed piece needed, no piece that does nothing).

`generateDefinition({size, rng = Math.random})` returns `{name, size, locked, hand, solution}`.

Per-size starting values (tune by looking at sample boards; keep them in one table in `generator.js`):

| Size | Pieces in the chain | Placed from hand | Starters | Targets (min-max) | Beam pieces (max) |
|---|---|---|---|---|---|
| 3 | 3-4 | 1-2 | 1 | 3-5 | 1 |
| 5 | 6-8 | 3-4 | 1 | 5-9 | 1 |
| 7 | 11-15 | 5-7 | 2 | 9-14 | 2 |

Allowed piece kinds are a fixed list in `generator.js` (it no longer reads them from the levels): starters `igniter`, `pusher`, `pulseLeft`; reactors `burster`, `cross`, `octo`, `knight`, `column`, `pairV`, `pairH`, `tee`, `spread`, `leap`, `row` (in this order). Order is fixed so seeded generation is deterministic.

The size is carried on the definition (`definition.size`) and passed to `buildFromDefinition`, `isSensible`, `layout`, the solver and the board. The module-level `PUZZLE_SIZE` constant is removed.

## 4. Progress (`progress.js`)
- Stored in `localStorage` under `qup-progress-v1` as `{"3": {"last": "2026-10-07", "streak": 6}, "5": {...}, "7": {...}}`.
- `recordWin(progress, size, dateString)` returns new progress: same date as `last` changes nothing; `last` was the previous Eastern day gives `streak + 1`; anything else gives `streak = 1`.
- `streakFor(progress, size, todayString)` is the streak if `last` is today or yesterday, else 0.
- `isDone(progress, size, todayString)` is `last === today`.
- `loadProgress(storage)` / `saveProgress(storage, progress)` take the storage object as an argument and never throw (blocked, empty or corrupt storage reads as empty progress).
- Replaying a completed daily never changes progress.

## 5. Home page (`index.html`, `home.js`, `home-model.js`)
- Header: "Q-Up" with a hand-drawn underline; today's date (Eastern); "new puzzles in 3h 12m" refreshing every 30 seconds; when the day changes the cards refresh.
- Three equal cards (stacked on narrow screens): 3x3 "the mini", 5x5 "the classic", 7x7 "the big one". All three are always at full strength: no hover glow, no dimming.
- Each card has a recessed "screen" showing a preview of today's actual puzzle (its locked pieces and targets, drawn with the real `drawPieceShape`, on a white board with light gray grid lines; the hand is not shown). A raised size tag, a raised streak tag (tally marks, a slash for every fifth, or "no streak yet"), a "DONE!" stamp when today's daily is complete, and two raised buttons: **Play** (or **Review** when done) and **Unlimited**.
- `home-model.js` is a pure function `cardModel({size, progress, today})` returning `{size, label, done, streak, tallyGroups, playLabel, dailyHref, unlimitedHref}` and is unit tested.

## 6. Game page (`play.html`, `game.js`)
- The board size, canvas size (3: 320px, 5: 400px, 7: 490px) and generator size come from the URL.
- Page chrome, as in the mockup: a raised Home pill, a title ("Daily · 5×5 · Oct 7" or "Unlimited · 5×5"), a raised `?` pill; the board canvas inside a recessed bezel; the hand as raised white tiles overlapping the bezel's bottom edge; the side panel as raised boxes; a raised Run button.
- **Daily:** today's definition from `dailyDefinition`. No New, Back, forward or Show Solution. On a win: record progress (unless the daily was already complete today) and show "Solved! Streak: N days" (or "Solved again!" on a replay); the Home pill in the top bar is always available (there is no separate Home button in the win message).
- **Unlimited:** `generateDefinition({size})` with `Math.random`; keeps New, Back, forward and Show Solution and the existing history behavior.
- The tutorial still opens on a player's first visit to the game page and from the `?` button.
- The hand pieces still show 1 and still need no activations; the existing rules, runner, wiring and tint code are unchanged.

## 7. Visual system
- Tokens: ink `#25221d`, paper `#f4efe4`, white `#ffffff`, coral `#d65a43`; piece colors unchanged. Headings use Caveat Brush and body text uses Patrick Hand, loaded from Google Fonts with `display=swap` and a `"Segoe Print", "Bradley Hand", cursive` fallback.
- A raised piece (`.up`) is crisp content over a wobbling outline layer (`.line`) with a hard offset shadow. `ink.js` injects the three SVG turbulence filters (baseFrequency 0.04, seeds 3, 8 and 21, displacement scale 5.5) and adds a `.line` layer to every `.up`. A CSS animation steps through the three filters (0.42s each) on `.line` layers and a few doodles only. Text, boards and pieces do not wobble.
- `prefers-reduced-motion: reduce` turns the animation off (one fixed wobble frame).
- Keyboard focus shows a visible coral outline on buttons and links.
- Shared styles live in `paper.css` (used by both pages). The game's existing `style.css` rules for the board, hand pieces, tutorial and tooltips stay, adjusted only for fonts and the raised look of the hand tiles and side boxes.

## 8. Testing
- Unit tests: Eastern date (including just before and after midnight, and both DST changes), time until midnight, seeding and the pinned daily boards, streak rules, storage failure handling, `cardModel`, and the generator at sizes 3, 5 and 7 (valid, gate passes, deterministic per seed, hand sizes, spares, no silly locked pieces, Row and Column pieces appear).
- Existing tests keep passing except the ones for the removed hand-built levels, which are deleted.
- Visual and in-browser behavior cannot be checked headlessly. The final task lists what to look at: the wobble, the card layout at three widths, the board in its bezel, the hand tiles, win flow for daily (first win and replay), unlimited controls, and the page at all three sizes.

## Out of scope
- Accounts, cross-device sync, sharing, leaderboards, hint or solution reveal in daily, 9x9, hand-made levels, hover or selection effects on the home cards, restyling the tutorial dialog beyond fonts.
