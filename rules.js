// Pure puzzle rules, kept free of DOM so they can be unit tested.

export function canDrag(node) {
    return !node.isEmpty && !node.locked;
}

// A piece can be dropped onto any cell that doesn't hold a locked piece;
// if the cell is occupied the two pieces swap.
export function canDrop(targetNode) {
    return !targetNode.locked;
}

// What should happen when a drag is released?
//   "place"   - put the dragged piece on the cell (swapping out any piece there)
//   "return"  - a board piece was dropped on a locked cell: back to where it came from
//   "to-hand" - a board piece was dropped off the grid: take it off the board
//   "stay"    - a hand piece wasn't placed: it stays in the hand
export function dropAction(dragSource, targetNode) {
    if (targetNode === null) return dragSource === "board" ? "to-hand" : "stay";
    if (canDrop(targetNode)) return "place";
    return dragSource === "board" ? "return" : "stay";
}

// Applies a released drag to the grid and hand (mutating both). `drag` is
// {source: "board"|"pool", node, i, j, poolIndex}; `target` is the cell {x, y}
// under the cursor or null. Mirrors what game.js does on mouseup.
export function applyDrop(grid, pool, drag, target) {
    const targetNode = target ? grid[target.x][target.y] : null;
    const action = dropAction(drag.source, targetNode);

    if (action === "place") {
        // The displaced piece goes to the dragged piece's old spot FIRST, so
        // that dropping a piece back on its own cell leaves the piece there.
        if (drag.source === "board") {
            grid[drag.i][drag.j] = targetNode;
        } else {
            pool.splice(drag.poolIndex, 1, ...(targetNode.isEmpty ? [] : [targetNode]));
        }
        grid[target.x][target.y] = drag.node;
    } else if (action === "return") {
        grid[drag.i][drag.j] = drag.node;
    } else if (action === "to-hand") {
        pool.push(drag.node);
    }
    return action;
}

// Every locked piece starts on the board, every unlocked piece in the tray.
export function validatePuzzle(grid, pool) {
    for (const column of grid) {
        for (const node of column) {
            if (!node.isEmpty && !node.locked) {
                throw new Error(`Unlocked piece ${node.id} must start in the tray, not on the board`);
            }
        }
    }
    for (const node of pool) {
        if (node.locked) {
            throw new Error(`Locked piece ${node.id} must start on the board, not in the tray`);
        }
    }
}
