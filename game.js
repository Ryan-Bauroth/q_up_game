const canvas = document.getElementById("canvas");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
const ctx = canvas.getContext("2d");

const boardSize = 700;
const boardX = (canvas.width - boardSize) / 2;
const boardY = 0;
const gridScale = 10;
const outlineStroke = 5;
const gridStroke = 1;
const gridSize = (boardSize - outlineStroke - gridScale * gridStroke) / gridScale;
const objectSize = gridSize * (4/5);

const emptySpace = {
    id: 0,
    summary: ""
};

let grid = Array.from({ length: gridScale }, () =>
    Array.from({ length: gridScale }, () => (emptySpace))
);

grid[2][1] = {
    id: 1,
    summary: "This object is a test object to show how this works"
};
grid[2][3] = {
    id: 2,
    summary: "This is a different test object to also show how this works look how long this message is."
};

let dragging = false;
let dragX = 0;
let dragY = 0;
let dragI = null;
let dragJ = null;
let draggedObject = null;

function drawGrid() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.lineWidth = gridStroke;
    for (let i = 0; i < gridScale; i++) {
        for (let j = 0; j < gridScale; j++) {
            let x_offset = boardX + outlineStroke - 2 + (gridStroke + gridSize) * i;
            let y_offset = boardY + outlineStroke - 2 + (gridStroke + gridSize) * j;

            ctx.strokeStyle = "#D3D3D3";
            ctx.strokeRect(x_offset, y_offset, gridSize, gridSize);

            if (grid[i][j].id !== 0) {
                ctx.fillStyle = "#808080";
                if (!(dragging && dragI === i && dragJ === j)) {
                    ctx.fillRect(x_offset + (1/10) * gridSize, y_offset + (1/10) * gridSize, objectSize, objectSize);
                }
            }
        }
    }

    if (dragging) {
        ctx.fillStyle = "#808080";
        ctx.fillRect(dragX - objectSize / 2, dragY - objectSize / 2, objectSize, objectSize);
    }

    ctx.strokeStyle = "#000000";
    ctx.lineWidth = outlineStroke;
    ctx.strokeRect(boardX + 2, boardY + 2, boardSize - 4, boardSize - 4);
}

/**
 * Checks current mouse location for a moveable object
 * @param mouseX
 * @param mouseY
 * @returns {{i: number, j: number}|null}
 */
function checkMouseLocationForObject(mouseX, mouseY) {
    for (let i = 0; i < gridScale; i++) {
        for (let j = 0; j < gridScale; j++) {
            if (grid[i][j].id !== 0) {
                let x_offset = boardX + outlineStroke - 2 + (gridStroke + gridSize) * i + (1/10) * gridSize;
                let y_offset = boardY + outlineStroke - 2 + (gridStroke + gridSize) * j + (1/10) * gridSize;

                if (mouseX >= x_offset && mouseX <= x_offset + objectSize &&
                    mouseY >= y_offset && mouseY <= y_offset + objectSize) {
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

canvas.addEventListener("mousedown", e => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    let result = checkMouseLocationForObject(mouseX, mouseY)
    if (result != null) {
        dragging = true;
        dragI = result.i;
        dragJ = result.j;
        dragX = mouseX;
        dragY = mouseY;
        draggedObject = grid[result.i][result.j];
        grid[result.i][result.j] = emptySpace;
    }
});

canvas.addEventListener("mousemove", e => {
    if (dragging) {
        const rect = canvas.getBoundingClientRect();
        dragX = e.clientX - rect.left;
        dragY = e.clientY - rect.top;
        drawGrid();
    }
});

canvas.addEventListener("mouseup", e => {
    if (dragging) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const gridLeft = boardX + outlineStroke - 2;
        const gridTop = boardY + outlineStroke - 2;
        const gridRight = gridLeft + gridScale * (gridSize + gridStroke) - gridStroke;
        const gridBottom = gridTop + gridScale * (gridSize + gridStroke) - gridStroke;

        if (mouseX >= gridLeft && mouseX <= gridRight &&
            mouseY >= gridTop && mouseY <= gridBottom) {
            let i = Math.floor((mouseX - boardX - outlineStroke + gridStroke / 2) / (gridSize + gridStroke));
            let j = Math.floor((mouseY - boardY -outlineStroke + gridStroke / 2) / (gridSize + gridStroke));

            i = Math.max(0, Math.min(gridScale - 1, i));
            j = Math.max(0, Math.min(gridScale - 1, j));

            grid[i][j] = draggedObject;
        }
        dragging = false;
        dragI = null;
        dragJ = null;
        drawGrid();
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

    // handle object summaries
    if (result != null) {
        let hoveredObject = grid[result.i][result.j];
        const fontSize = 20;
        ctx.font = `${fontSize}px serif`;
        drawWrappedText(
            ctx,
            hoveredObject.summary,
            10,   // x position
            50,   // starting y position
            300, // width
            fontSize * 1.2 // line height
        );
    }
    else{
        console.log("ran")
        ctx.clearRect(0, 0, 300, 300)
    }


})

drawGrid();
