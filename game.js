import {Node} from "./node.js";
import {Board} from "./board.js";

const canvas = document.getElementById("canvas");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
const ctx = canvas.getContext("2d");


const boardSize = 700;
const gridScale = 11;

const emptySpace = new Node();

const board = new Board(canvas, boardSize, gridScale, emptySpace);

board.grid[2][1] = new Node(1, "summary", 2);

/**
 * Checks current mouse location for a moveable object
 * @param mouseX
 * @param mouseY
 * @returns {{i: number, j: number}|null}
 */
function checkMouseLocationForObject(mouseX, mouseY) {
    for (let i = 0; i < gridScale; i++) {
        for (let j = 0; j < gridScale; j++) {
            if (board.grid[i][j].id !== 0) {
                let x_offset = board.boardX + Board.OUTLINE_STROKE - 2 + (Board.GRID_STROKE + board.gridSize) * i + (1/10) * board.gridSize;
                let y_offset = board.boardY + Board.OUTLINE_STROKE - 2 + (Board.GRID_STROKE + board.gridSize) * j + (1/10) * board.gridSize;

                if (mouseX >= x_offset && mouseX <= x_offset + board.objectSize &&
                    mouseY >= y_offset && mouseY <= y_offset + board.objectSize) {
                    return {
                        i: i,
                        j: j
                    };
                }
            }
        }
    }
    return null;
}

function handleSummary(mouseLocationResult){
    const fontSize = 20;
    ctx.font = `${fontSize}px serif`;

    // clear summary area
    ctx.clearRect(0, 0, 300, 300)

    // handle object summaries
    if (mouseLocationResult != null) {
        let hoveredObject = board.grid[mouseLocationResult.i][mouseLocationResult.j];
        drawWrappedText(
            ctx,
            hoveredObject.id + ": " + hoveredObject.summary,
            10,   // x position
            50,   // starting y position
            300, // width
            fontSize * 1.2 // line height
        );
    }
    else if (board.dragging) {
        drawWrappedText(
            ctx,
            board.draggedObject.id + ": " + board.draggedObject.summary,
            10,   // x position
            50,   // starting y position
            300, // width
            fontSize * 1.2 // line height
        );
    }
}

canvas.addEventListener("mousedown", e => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    let result = checkMouseLocationForObject(mouseX, mouseY)
    if (result != null) {
        board.dragging = true;
        board.dragI = result.i;
        board.dragJ = result.j;
        board.dragX = mouseX;
        board.dragY = mouseY;
        board.draggedObject = board.grid[result.i][result.j];
        board.grid[result.i][result.j] = emptySpace;
    }
});

canvas.addEventListener("mousemove", e => {
    if (board.dragging) {
        const rect = canvas.getBoundingClientRect();
        board.dragX = e.clientX - rect.left;
        board.dragY = e.clientY - rect.top;
        board.drawBoard();
    }
});

canvas.addEventListener("mouseup", e => {
    if (board.dragging) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const gridLeft = board.boardX + Board.OUTLINE_STROKE - 2;
        const gridTop = board.boardY + Board.OUTLINE_STROKE - 2;
        const gridRight = gridLeft + gridScale * (board.gridSize + Board.GRID_STROKE) - Board.GRID_STROKE;
        const gridBottom = gridTop + gridScale * (board.gridSize + Board.GRID_STROKE) - Board.GRID_STROKE;

        if (mouseX >= gridLeft && mouseX <= gridRight &&
            mouseY >= gridTop && mouseY <= gridBottom) {
            let i = Math.floor((mouseX - board.boardX - Board.OUTLINE_STROKE + Board.GRID_STROKE / 2) / (board.gridSize + Board.GRID_STROKE));
            let j = Math.floor((mouseY - board.boardY - Board.OUTLINE_STROKE + Board.GRID_STROKE / 2) / (board.gridSize + Board.GRID_STROKE));

            i = Math.max(0, Math.min(gridScale - 1, i));
            j = Math.max(0, Math.min(gridScale - 1, j));

           board.grid[i][j] = board.draggedObject;
        }
        else{
            board.grid[board.dragI][board.dragJ] = board.draggedObject;
        }
        board.dragging = false;
        board.dragI = null;
        board.dragJ = null;
        board.drawBoard();
        let result = checkMouseLocationForObject(mouseX, mouseY)
        handleSummary(result);
    }
});

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
    console.log(text);
    const words = text.split(" ");
    let line = "";

    for (let i = 0; i < words.length; i++) {
        const testLine = line + words[i] + " ";
        const metrics = ctx.measureText(testLine);
        const testWidth = metrics.width;

        if (testWidth > maxWidth && i > 0) {
            ctx.fillText(line, x, y);
            line = words[i] + " ";
            y += lineHeight;
        } else {
            line = testLine;
        }
    }
    ctx.fillText(line, x, y);
}

canvas.addEventListener("mousemove", e => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    let result = checkMouseLocationForObject(mouseX, mouseY)
    handleSummary(result);
})

board.drawBoard();
