import {makeEmptyNode} from "./node.js";
import {drawPieceShape, colorForNode, targetCells, pieceType, dotRing, bodyEdgeDistance, shadeBeamEnd, PALETTE} from "./pieces.js";
import {isBeam} from "./abilities.js";
import {wireLinks, drawnLinks, linkKey, skipHits, dotAngles, beamLevel, beamWidths} from "./wires.js";

export class Board {
    static OUTLINE_STROKE = 5;
    static GRID_STROKE = 1;
    static BEAM_SHADOW = 0.22;       // darkness of the shadow where a beam meets a piece (either end)
    static TINT_ALPHA = 0.16;        // opacity of the purple wash under a beam piece
    static TINT_HOVER_BOOST = 0.07;  // a little darker while that piece is hovered
    static DIM = 0.45; // opacity of pieces not involved in the hovered piece

    constructor(canvas, boardSize, gridScale) {
        this.boardSize = boardSize;
        this.gridScale = gridScale;
        this.canvas = canvas;

        this.ctx = canvas.getContext("2d");
        this.boardX = (this.canvas.width - boardSize) / 2;
        this.boardY = 0;
        this.gridSize = (boardSize - Board.OUTLINE_STROKE - gridScale * Board.GRID_STROKE) / gridScale;
        this.objectSize = this.gridSize * (4 / 5);

        // Every cell gets its own empty Node instance - never share one
        // object across cells, since Node instances carry mutable state.
        this.grid = Array.from({length: gridScale}, () =>
            Array.from({length: gridScale}, () => makeEmptyNode())
        );

        this.dragging = false;
        this.dragX = 0;
        this.dragY = 0;
        this.dragI = null;
        this.dragJ = null;
        this.draggedObject = null;
        this.dragSource = null; // "board" | "pool"
        this.dragPoolIndex = null;

        this.interactive = true;

        // Run-animation overlay, filled in by runner.js.
        this.effects = Board.emptyEffects();
        // Cells to outline while hovering a piece: [{x, y}].
        this.previewCells = [];
        // Which hits get a dot on the piece they land on (set from the dots menu):
        //   "skips" - only non-adjacent (skip / column) hits;  "all" - every hit;  "none".
        this.dotMode = "skips";   // "skips" | "all" | "none"
        // Board cell under the mouse, or null; its wires are drawn at full strength.
        this.hoverCell = null;
    }

    static emptyEffects() {
        return {flashes: [], wireProgress: new Map(), pulses: []};
    }

    cellCenter(i, j) {
        const {x, y} = this.cellOrigin(i, j);
        return {x: x + this.gridSize / 2, y: y + this.gridSize / 2};
    }

    cellOrigin(i, j) {
        return {
            x: this.boardX + Board.OUTLINE_STROKE - 2 + (Board.GRID_STROKE + this.gridSize) * i,
            y: this.boardY + Board.OUTLINE_STROKE - 2 + (Board.GRID_STROKE + this.gridSize) * j,
        };
    }

    drawBoard() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.lineWidth = Board.GRID_STROKE;
        this.ctx.strokeStyle = "#D3D3D3";
        for (let i = 0; i < this.gridScale; i++) {
            for (let j = 0; j < this.gridScale; j++) {
                const {x: x_offset, y: y_offset} = this.cellOrigin(i, j);
                this.ctx.strokeRect(x_offset, y_offset, this.gridSize, this.gridSize);
            }
        }

        this.drawBeamTints();
        this.drawCoordinates();

        const links = wireLinks(this.grid, this.gridScale);

        // While a piece is hovered, everything except it and the pieces it
        // activates is slightly dimmed.
        let lit = null;
        if (this.hoverCell !== null && !this.dragging) {
            lit = new Set([`${this.hoverCell.x},${this.hoverCell.y}`]);
            for (const l of links) {
                if (l.from.x === this.hoverCell.x && l.from.y === this.hoverCell.y) {
                    lit.add(`${l.to.x},${l.to.y}`);
                }
            }
        }

        const coverage = this.beamCoverage();

        // Wires sit under the pieces so they appear to run into them.
        this.drawWires(lit);

        for (let i = 0; i < this.gridScale; i++) {
            for (let j = 0; j < this.gridScale; j++) {
                const node = this.grid[i][j];
                if (node.isEmpty) continue;
                const hidden = this.dragging && this.dragSource === "board" && this.dragI === i && this.dragJ === j;
                if (!hidden) {
                    const c = this.cellCenter(i, j);
                    // the hovered piece and the pieces it impacts stay fully lit,
                    // padlocks included; everything else is dimmed
                    this.drawNode(node, c.x, c.y, lit && !lit.has(`${i},${j}`) ? Board.DIM : 1, this.cellBackground(coverage, i, j));
                }
            }
        }

        this.drawSkipDots(links, lit);

        this.ctx.strokeStyle = "#000000";
        this.ctx.lineWidth = Board.OUTLINE_STROKE;
        this.ctx.strokeRect(this.boardX + 2, this.boardY + 2, this.boardSize - 4, this.boardSize - 4);

        this.drawEffects();
    }

    // Chess-style labels drawn in the cell corners: files a, b, c... along the
    // bottom row and ranks 1, 2, 3... (1 at the bottom) down the left column.
    drawCoordinates() {
        const ctx = this.ctx;
        const pad = Math.max(3, this.gridSize * 0.05);
        ctx.save();
        ctx.fillStyle = "#a3a3a3";
        ctx.font = `bold ${Math.max(10, Math.floor(this.gridSize * 0.15))}px sans-serif`;
        for (let i = 0; i < this.gridScale; i++) {
            const bottom = this.cellOrigin(i, this.gridScale - 1);
            ctx.textAlign = "left";
            ctx.textBaseline = "alphabetic";
            ctx.fillText(Board.fileLabel(i), bottom.x + pad, bottom.y + this.gridSize - pad);
        }
        for (let j = 0; j < this.gridScale; j++) {
            const left = this.cellOrigin(0, j);
            ctx.textAlign = "left";
            ctx.textBaseline = "top";
            ctx.fillText(Board.rankLabel(j, this.gridScale), left.x + pad, left.y + pad);
        }
        ctx.restore();
    }

    static fileLabel(column) {
        return String.fromCharCode(97 + column);
    }

    // Rank 1 is the bottom row, as on a chess board.
    static rankLabel(row, gridScale) {
        return String(gridScale - row);
    }

    // A soft purple wash over every cell a placed beam piece (column / row
    // sweep) covers, including the beam's own cell.
    // One tint layer per placed beam piece (column / row sweep): the cells it
    // covers, including its own, and how strong the purple wash is. A beam's
    // wash gets slightly darker while its piece is hovered.
    beamLayers() {
        const layers = [];
        for (let i = 0; i < this.gridScale; i++) {
            for (let j = 0; j < this.gridScale; j++) {
                const node = this.grid[i][j];
                if (node.isEmpty || !isBeam(node)) continue;
                const hovered = this.hoverCell !== null && this.hoverCell.x === i && this.hoverCell.y === j;
                layers.push({
                    cells: [{x: i, y: j}, ...targetCells(node, i, j, this.gridScale)],
                    alpha: Board.TINT_ALPHA + (hovered ? Board.TINT_HOVER_BOOST : 0),
                });
            }
        }
        return layers;
    }

    // Combined wash strength in each cell: Map of "x,y" -> alpha (0-1).
    beamCoverage() {
        const coverage = new Map();
        for (const {cells, alpha} of this.beamLayers()) {
            for (const {x, y} of cells) {
                const key = `${x},${y}`;
                coverage.set(key, 1 - (1 - (coverage.get(key) ?? 0)) * (1 - alpha));
            }
        }
        return coverage;
    }

    // The board color in a cell: white, or white under the purple tint.
    cellBackground(coverage, i, j) {
        const alpha = coverage.get(`${i},${j}`) ?? 0;
        if (alpha === 0) return "#ffffff";
        const [r, g, b] = [0x7b, 0x5f, 0xc4].map(c => Math.round(255 - (255 - c) * alpha));
        return `rgb(${r}, ${g}, ${b})`;
    }

    // A soft purple wash over every cell a placed beam piece covers.
    drawBeamTints() {
        const ctx = this.ctx;
        ctx.save();
        ctx.fillStyle = PALETTE.beam.fill;
        for (const {cells, alpha} of this.beamLayers()) {
            ctx.globalAlpha = alpha;
            for (const {x, y} of cells) {
                const o = this.cellOrigin(x, y);
                ctx.fillRect(o.x, o.y, this.gridSize, this.gridSize);
            }
        }
        ctx.restore();
    }

    // Dots inside a piece, one per non-adjacent hit it will receive, in the
    // color of the piece doing the hitting. They sit on a ring around the
    // charge number, centered on the top first, then spreading around.
    drawSkipDots(links, lit) {
        if (this.dotMode === "none") return;
        const ctx = this.ctx;
        const dotRadius = this.gridSize * 0.03;
        ctx.save();
        for (const [key, sources] of skipHits(links, this.dotMode === "all")) {
            const [tx, ty] = key.split(",").map(Number);
            if (this.grid[tx][ty].isEmpty) continue;
            const c = this.cellCenter(tx, ty);
            // Beam pieces are narrow capsules with arrows at the ends, so their
            // dots sit on a tighter ring, between the number and the arrows.
            const target = this.grid[tx][ty];
            const beam = isBeam(target);
            // Red pieces (e.g. an upright square) are narrower at the top, so
            // their default dots sit a little lower to stay on the red.
            const red = pieceType(target) === "reactor";
            // A piece with an arrow near its top gets its dots between the number
            // and the arrows; otherwise the default ring for its kind is used.
            const layout = dotRing(target, this.gridSize, dotRadius + 1.5);
            const ringRadius = layout ? layout.radius : this.gridSize * (beam ? 0.195 : red ? 0.235 : 0.27);
            const angles = dotAngles(sources.length, layout ? layout.stepDegrees : (beam ? 36 : undefined));
            // Hovering a piece keeps all of its own dots at full strength.
            const onHovered = this.hoverCell !== null && this.hoverCell.x === tx && this.hoverCell.y === ty;
            sources.forEach((src, i) => {
                const {fill} = colorForNode(this.grid[src.x][src.y]);
                const hovered = this.hoverCell !== null && this.hoverCell.x === src.x && this.hoverCell.y === src.y;
                // dots fade along with the piece once it is complete (depleted)
                ctx.globalAlpha = ((hovered || onHovered) ? 1 : (lit ? 0.35 : 0.9)) * (this.grid[tx][ty].isDepleted ? 0.35 : 1);
                const x = c.x + Math.cos(angles[i]) * ringRadius;
                const y = c.y + Math.sin(angles[i]) * ringRadius;
                // white halo + dark ring keep the dot readable on any piece color
                for (const [radius, color] of [[dotRadius + 1.5, "#ffffff"], [dotRadius + 0.75, "#1f1f1f"], [dotRadius, fill]]) {
                    ctx.beginPath();
                    ctx.arc(x, y, radius, 0, Math.PI * 2);
                    ctx.fillStyle = color;
                    ctx.fill();
                }
            });
        }
        ctx.restore();
    }

    // Where a wire from cell `from` to cell `to` actually runs: from the edge
    // of the source's body to the edge of the target's body (not center to
    // center). Each end is tucked inside its shape by about half the beam's
    // width, so the beam fills right into a corner (a diamond's point, say)
    // with no visible start or flat end beside it.
    linkEnds(from, to) {
        const size = this.gridSize * 0.92;
        const a = this.cellCenter(from.x, from.y), b = this.cellCenter(to.x, to.y);
        const angle = Math.atan2(b.y - a.y, b.x - a.x);
        const tuck = beamWidths(beamLevel(this.grid[from.x][from.y])).outer * 0.6;
        const out = bodyEdgeDistance(this.grid[from.x][from.y], size, angle) - tuck;
        const into = bodyEdgeDistance(this.grid[to.x][to.y], size, angle + Math.PI) - tuck;
        return {
            start: {x: a.x + Math.cos(angle) * out, y: a.y + Math.sin(angle) * out},
            end: {x: b.x - Math.cos(angle) * into, y: b.y - Math.sin(angle) * into},
        };
    }

    // Wires from each piece to the adjacent pieces it will activate, in the
    // activating piece's color. Each wire carries a small arrow showing its
    // direction (double-ended when two pieces activate each other). Hits that
    // aren't adjacent have no wire; see drawSkipDots.
    drawWires(lit) {
        const ctx = this.ctx;
        // During a run, wires from fired pieces are consumed from the output
        // end toward the input end: progress 0 = whole wire, 1 = gone.
        const progress = this.effects.wireProgress;
        ctx.save();
        ctx.lineCap = "round";

        const lerp = (p, q, t) => ({x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t});
        const stroke = (p, q, color, width) => {
            ctx.strokeStyle = color;
            ctx.lineWidth = width;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.stroke();
        };
        // the part of wire a-b between fractions t0 and t1
        const wireSegment = (a, b, t0, t1, {fill}, level) => {
            if (t1 <= t0) return;
            const p = lerp(a, b, t0), q = lerp(a, b, t1);
            ctx.lineCap = "butt";   // beams end flush at the piece edges
            // no dark outline: just the beam's own color, a touch wider than
            // the old inner stroke so it keeps its presence
            const {outer, inner} = beamWidths(level);
            stroke(p, q, fill, (outer + inner) / 2);
        };
        // A filled, softly rounded triangle showing which way the beam flows;
        // `both` draws two back-to-back for two-way connections.
        const flowArrow = (a, b, both) => {
            const angle = Math.atan2(b.y - a.y, b.x - a.x);
            const mid = lerp(a, b, 0.5);
            const ux = Math.cos(angle), uy = Math.sin(angle);
            ctx.fillStyle = ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
            ctx.lineWidth = 1.4;
            ctx.lineJoin = "round";
            const triangle = (dir, baseAt, apexAt, half) => {
                const pt = (d, w) => [mid.x + ux * dir * d - uy * w, mid.y + uy * dir * d + ux * w];
                ctx.beginPath();
                ctx.moveTo(...pt(apexAt, 0));
                ctx.lineTo(...pt(baseAt, half));
                ctx.lineTo(...pt(baseAt, -half));
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            };
            if (both) {
                triangle(1, 0.6, 4.2, 2.4);
                triangle(-1, 0.6, 4.2, 2.4);
            } else {
                triangle(1, -2.6, 2.8, 2.6);
            }
        };

        const wires = drawnLinks(this.grid, this.gridScale);
        const linkKeys = new Set(wires.map(l => linkKey(l.from, l.to)));
        const handled = new Set();

        for (const {from, to} of wires) {
            const twoWay = linkKeys.has(linkKey(to, from));
            if (twoWay && handled.has(linkKey(to, from))) continue; // pair already drawn
            handled.add(linkKey(from, to));

            const src = colorForNode(this.grid[from.x][from.y]);
            const dst = colorForNode(this.grid[to.x][to.y]);
            const isHover = c => this.hoverCell !== null && this.hoverCell.x === c.x && this.hoverCell.y === c.y;
            const hovered = isHover(from) || (twoWay && isHover(to));
            const {start: a, end: b} = this.linkEnds(from, to);
            ctx.globalAlpha = hovered ? 1 : (lit ? 0.3 : 0.5);

            // visible span along a->b after any consumption from either end
            const t0 = progress.get(linkKey(from, to)) ?? 0;
            const t1 = twoWay ? 1 - (progress.get(linkKey(to, from)) ?? 0) : 1;
            // thickness follows the firing piece's remaining charges
            const srcLevel = beamLevel(this.grid[from.x][from.y]);
            if (twoWay) {
                // each half takes the color and thickness of the piece it comes from
                wireSegment(a, b, t0, Math.min(t1, 0.5), src, srcLevel);
                wireSegment(a, b, Math.max(t0, 0.5), t1, dst, beamLevel(this.grid[to.x][to.y]));
            } else {
                wireSegment(a, b, t0, t1, src, srcLevel);
            }
            if (t0 < 0.5 && t1 > 0.5) flowArrow(a, b, twoWay);

            // a slight shadow at each end, where the beam meets a piece
            const width = (beamWidths(srcLevel).outer + beamWidths(srcLevel).inner) / 2;
            const tuck = beamWidths(srcLevel).outer * 0.6;
            const shade = {alpha: Board.BEAM_SHADOW};
            if (t1 >= 0.95) shadeBeamEnd(ctx, a, b, tuck, width, shade);   // where it enters its target
            if (t0 <= 0.05) shadeBeamEnd(ctx, b, a, tuck, width, shade);   // where it leaves its own piece

            // a bright head marks where the beam is while it travels
            ctx.globalAlpha = 1;
            ctx.fillStyle = "#ffffff";
            for (const [t, travelling] of [[t0, t0 > 0 && t0 < 1], [t1, twoWay && t1 < 1 && t1 > 0]]) {
                if (!travelling) continue;
                const head = lerp(a, b, t);
                ctx.beginPath();
                ctx.arc(head.x, head.y, 4.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // pulses travelling along wires that stay (earlier activations)
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#ffffff";
        for (const {from, to, t} of this.effects.pulses ?? []) {
            const {start: a, end: b} = this.linkEnds(from, to);
            ctx.beginPath();
            ctx.arc(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 4.5, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    drawEffects() {
        const ctx = this.ctx;
        ctx.save();

        // Hover preview: a small filled dot in each empty cell the hovered
        // piece would hit (cells holding pieces are shown by wires/dimming).
        ctx.fillStyle = "#6b6b6b";
        for (const {x, y} of this.previewCells) {
            if (!this.grid[x][y].isEmpty) continue;
            const c = this.cellCenter(x, y);
            ctx.beginPath();
            ctx.arc(c.x, c.y, this.gridSize * 0.09, 0, Math.PI * 2);
            ctx.fill();
        }

        // Run flash: a quick light wash over the piece firing / being hit.
        ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
        for (const {x, y} of this.effects.flashes) {
            const c = this.cellCenter(x, y);
            ctx.beginPath();
            ctx.arc(c.x, c.y, this.gridSize * 0.42, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    // (cx, cy) is the center of the piece.
    drawNode(node, cx, cy, dim = 1, backing = "#ffffff") {
        drawPieceShape(this.ctx, node, cx, cy, this.gridSize * 0.92, dim, backing);
    }
}
