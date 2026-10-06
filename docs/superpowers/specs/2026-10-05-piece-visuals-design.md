# Piece visuals, locked pieces, and UI fixes

## Goals
- Give each piece a color and shape derived from its ability.
- Add locked (immovable) pieces that start on the board.
- Fix the board highlight when dragging a tray piece onto the board.
- Make the hover summary box less jerky.

## 1. Shapes and colors (`pieces.js`, new)
- **Color** is chosen by target count, from one cohesive palette of muted jewel tones with similar saturation and lightness:
  - 0 targets (receivers): teal
  - 1 target: amber
  - 2-3 targets: coral
  - 4+ targets: violet
  - Placeholders; tune on screen.
- **Shape** is unique per ability: a large round/square core with short tips pointing toward the cells it hits (e.g. X = circle with four diagonal tips, + = circle with four orthogonal tips, pulse down = square with one bottom tip, skip-2-right = rounded square with a right tip and a notch, row sweep = core with left/right tips).
- **Complexity** rises with target count: one-target pieces have a plain core and one tip; four-target pieces have more tips plus an inner detail (ring or dot).
- Each ability has a hand-written shape entry. Abilities without one fall back to a round body with tips drawn from their target offsets.
- `drawPieceShape(ctx, node, cx, cy, size)` draws shapes for both the board (`Board.drawNode`) and the tray (tray pieces become small canvases). The charge number stays centered; depleted pieces keep their dimming.

## 2. Locked pieces
- `Node` gets `locked = false`; `clone()` copies it. The engine ignores it.
- Locked pieces are drawn with a padlock badge in a corner.
- **Start rule:** every locked piece starts on the board, every unlocked piece starts in the tray. `createPuzzle` builds both from one list; a check function throws if the rule is broken.
- The three receivers stay locked; add one locked action piece.
- Locked pieces cannot be dragged. Dropping onto a locked cell is refused and the dragged piece returns to its origin. (Also fixes drops onto any occupied cell silently destroying the piece there.)
- Hover works on locked pieces; the summary notes they are locked.

## 3. Highlight bug
- `user-select: none` and `-webkit-user-drag: none` on the canvas and body.
- `preventDefault()` in both mousedown handlers.
- Verify in the browser; if the highlight persists, investigate further.

## 4. Smoother hover box
- Fixed height for the summary panel so the Run/Reset buttons stop moving.
- Only rewrite the text when the hovered piece changes.
- One place decides the current hover, replacing the competing canvas mousemove and tray mouseenter/mouseleave handlers.
- ~120 ms hide delay so crossing gaps between pieces doesn't flash the placeholder.
- Fix the board hit-test offset (drawn square is offset by gridSize/10).

## 5. Tests
- `clone()` preserves `locked`.
- Color lookup by target count.
- Start-rule check.
- Drop-refusal logic, extracted as a small pure function.
