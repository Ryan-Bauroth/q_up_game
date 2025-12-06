export class Board {
    static OUTLINE_STROKE = 5;
    static GRID_STROKE = 1;

    constructor(canvas, boardSize, gridScale, emptySpace){
        this.boardSize = boardSize;
        this.gridScale = gridScale;
        this.canvas = canvas;

        this.ctx = canvas.getContext("2d");
        this.boardX = (this.canvas.width - boardSize) / 2;
        this.boardY = 0;
        this.gridSize = (boardSize - Board.OUTLINE_STROKE - gridScale * Board.GRID_STROKE) / gridScale;
        this.objectSize = this.gridSize * (4/5);

        this.grid = Array.from({ length: gridScale }, () =>
            Array.from({ length: gridScale }, () => (emptySpace))
        );

        this.dragging = false;
        this.dragX = 0;
        this.dragY = 0;
        this.dragI = null;
        this.dragJ = null;
        this.draggedObject = null;
    }

    drawBoard(){
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.lineWidth = Board.GRID_STROKE;
        for (let i = 0; i < this.gridScale; i++) {
            for (let j = 0; j < this.gridScale; j++) {
                let x_offset = this.boardX + Board.OUTLINE_STROKE - 2 + (Board.GRID_STROKE + this.gridSize) * i;
                let y_offset = this.boardY + Board.OUTLINE_STROKE - 2 + (Board.GRID_STROKE + this.gridSize) * j;

                this.ctx.strokeStyle = "#D3D3D3";
                this.ctx.strokeRect(x_offset, y_offset, this.gridSize, this.gridSize);

                if (this.grid[i][j].id !== 0) {
                    this.ctx.fillStyle = "#808080";
                    if (!(this.dragging && this.dragI === i && this.dragJ === j)) {
                        this.ctx.fillRect(x_offset + (1/10) * this.gridSize, y_offset + (1/10) * this.gridSize, this.objectSize, this.objectSize);
                    }
                }
            }
        }

        this.ctx.strokeStyle = "#000000";
        this.ctx.lineWidth = Board.OUTLINE_STROKE;
        this.ctx.strokeRect(this.boardX + 2, this.boardY + 2, this.boardSize - 4, this.boardSize - 4);

        if (this.dragging) {
            this.ctx.fillStyle = "#808080";
            this.ctx.fillRect(this.dragX - this.objectSize / 2, this.dragY - this.objectSize / 2, this.objectSize, this.objectSize);
        }
    }
}