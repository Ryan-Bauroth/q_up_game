import {ABILITIES, beamAxis, isBeam, isStarter} from "./abilities.js";

// Probe a selector from the middle of a big empty board so edge clipping
// never hides a target; offsets are relative to the source cell.
const PROBE = {x: 4, y: 4, gridScale: 9};

export function abilityOffsets(abilityId) {
    const ability = ABILITIES[abilityId];
    if (!ability) return [];
    return ability
        .target(PROBE.x, PROBE.y, {gridScale: PROBE.gridScale})
        .map(t => ({dx: t.x - PROBE.x, dy: t.y - PROBE.y}));
}

// In-bounds cells a piece at (x, y) would hit, across all its abilities.
export function targetCells(node, x, y, gridScale) {
    const seen = new Map();
    for (const id of node.abilities) {
        const ability = ABILITIES[id];
        if (!ability) continue;
        for (const t of ability.target(x, y, {gridScale})) {
            if (t.x >= 0 && t.x < gridScale && t.y >= 0 && t.y < gridScale) {
                seen.set(`${t.x},${t.y}`, {x: t.x, y: t.y});
            }
        }
    }
    return [...seen.values()];
}

export function targetCount(node) {
    return node.abilities.reduce((n, id) => n + abilityOffsets(id).length, 0);
}

// One cohesive palette: muted jewel tones at similar saturation/lightness.
// Color is chosen by what kind of piece it is:
//   receiver  - no abilities, just needs to be hit
//   reactor   - does something when activated
//   starter   - does something on Run (activates on its own)
export const PALETTE = {
    receiver: {fill: "#2b9a8f", edge: "#1c6b63"},
    reactor: {fill: "#d65a43", edge: "#92372a"},
    starter: {fill: "#d4a017", edge: "#8a6508"},
    beam: {fill: "#7b5fc4", edge: "#4f3a8c"},
    beamRow: {fill: "#4a7fc7", edge: "#2f5593"},   // row beams: a blue next to the column beams' violet
};

export function pieceType(node) {
    if (node.abilities.length === 0) return "receiver";
    if (isStarter(node)) return "starter";
    if (isBeam(node)) return "beam";
    return "reactor";
}

export function colorForNode(node) {
    const type = pieceType(node);
    return type === "beam" && beamAxis(node) === "row" ? PALETTE.beamRow : PALETTE[type];
}

// Unique tip directions (radians) for all of a node's abilities. A tip is a
// "skip" when nothing in that direction is hit on the adjacent tile (the
// ability jumps over at least one tile).
export function tipAngles(node) {
    const seen = new Map();
    for (const id of node.abilities) {
        for (const {dx, dy} of abilityOffsets(id)) {
            const angle = Math.atan2(dy, dx);
            const key = angle.toFixed(3);
            const dist = Math.max(Math.abs(dx), Math.abs(dy));
            const prev = seen.get(key);
            seen.set(key, {angle, minDist: prev ? Math.min(prev.minDist, dist) : dist});
        }
    }
    return [...seen.values()].map(({angle, minDist}) => ({angle, skip: minDist > 1, skips: minDist - 1}));
}

// How many tiles a piece jumps over before it hits (0 for adjacent hits).
export function skipDepth(node) {
    return tipAngles(node).reduce((max, t) => Math.max(max, t.skips), 0);
}

// How many sides a piece's body has, chosen by its type:
//   receiver - 0 (a plain circle)
//   beam     - 0 (a capsule stretched along its line; see bodyKind)
//   starter  - one corner per output, at least 3 (a triangle); two opposite
//              outputs make a lens (see bodyKind)
//   reactor  - one side per direction it activates out of, at least 4, so
//              1-4 directions is a square and 5+ gets a pentagon, hexagon...
export function bodySides(node) {
    const type = pieceType(node);
    if (type === "receiver" || type === "beam") return 0;
    if (type === "starter") return bodyKind(node) === "lens" ? 0 : Math.max(3, tipAngles(node).length);
    return Math.max(4, tipAngles(node).length);
}

export function bodyKind(node) {
    const type = pieceType(node);
    if (type === "receiver") return "circle";
    if (type === "beam") return "capsule";
    if (type === "starter") {
        // two opposite outputs can't both be corners of a triangle: use a lens
        // whose two points are the outputs
        const tips = tipAngles(node);
        if (tips.length === 2) {
            const diff = Math.abs(tips[0].angle - tips[1].angle);
            if (Math.abs(diff - Math.PI) < 0.02) return "lens";
        }
    }
    return "polygon";
}

// Rotation (mod one polygon step) for the body. Normally a vertex sits on
// each arrow. When the arrows don't all land on corners of the polygon (e.g.
// Knight's uneven angles), the polygon is drawn flat-side-down instead, so it
// sits square with the board rather than looking slightly tilted.
export function bodyRotation(node, sides) {
    const tips = tipAngles(node);
    const step = (Math.PI * 2) / sides;
    const mod = a => ((a % step) + step) % step;
    if (tips.length > 0) {
        const first = mod(tips[0].angle);
        const aligned = tips.every(t => {
            const d = Math.abs(mod(t.angle) - first);
            return Math.min(d, step - d) < 0.02;
        });
        if (aligned) return first;
    }
    return mod(Math.PI / 2 + step / 2);
}

function tracePolygon(ctx, points) {
    ctx.beginPath();
    points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
}

// An arrow drawn INSIDE the body, pointing toward a cell the piece hits.
function drawArrow(ctx, cx, cy, {angle}, reach, color, base = 0.55, tipAt = 0.85) {
    const ux = Math.cos(angle), uy = Math.sin(angle);
    const px = -uy, py = ux;
    const pt = (d, w) => [cx + ux * d * reach + px * w * reach, cy + uy * d * reach + py * w * reach];

    ctx.fillStyle = color;
    tracePolygon(ctx, [pt(tipAt, 0), pt(base, 0.16), pt(base, -0.16)]);
    ctx.fill();
}

// Same light gray as the a-e / 1-5 coordinate labels on the board.
const LOCK_COLOR = "#a3a3a3";

// A small padlock (no backing circle), centered on (cx, cy), about `width` wide.
function drawLock(ctx, cx, cy, width) {
    ctx.save();
    const bodyW = width, bodyH = width * 0.72;
    const top = cy - bodyH * 0.35;
    ctx.fillStyle = LOCK_COLOR;
    ctx.strokeStyle = LOCK_COLOR;
    ctx.lineWidth = Math.max(1.6, width * 0.16);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.roundRect(cx - bodyW / 2, top, bodyW, bodyH, width * 0.12);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, top, bodyW * 0.3, Math.PI, 0);
    ctx.stroke();
    ctx.restore();
}

// How far out a piece's body reaches along an arrow (its tip), for a piece
// drawn in a size x size box. Arrows and hit dots are placed relative to it.
export function bodyReach(node, size) {
    const R = size / 2;
    const kind = bodyKind(node);
    if (kind === "circle") return R * 0.82;
    if (kind === "capsule") return R * 2 * 0.87 / 2;
    if (kind === "lens") return R * 2 * 0.93 / 2;
    const sides = bodySides(node);
    const isStarterBody = pieceType(node) === "starter";
    const circumradius = R * (sides === 3 ? 1.12 : 0.97);
    const cornerRadius = R * (isStarterBody ? 0.3 : 0.24);
    const interior = Math.PI * (sides - 2) / sides;
    return circumradius - (cornerRadius / Math.sin(interior / 2) - cornerRadius);
}

// Distance from a piece's center to the edge of its body, along a direction
// (radians), for a piece drawn in a size x size box. Beams start and end here.
export function bodyEdgeDistance(node, size, angle) {
    const R = size / 2;
    const kind = bodyKind(node);
    const reach = bodyReach(node, size);
    if (kind === "circle") return reach;

    // For capsules and lenses, walk out along the ray until it leaves the shape.
    const insideCapsule = (x, y) => {
        const width = R * 0.6;
        const s = reach - width;                     // half the straight part
        const dx = Math.max(Math.abs(x) - s, 0);
        return Math.hypot(dx, y) <= width;
    };
    const insideLens = (x, y) => {
        const length = reach * 2, bulge = R * 1.3;
        if (Math.abs(x) >= length / 2) return false;
        return Math.abs(y) <= bulge * (0.5 - 2 * x * x / (length * length));
    };
    if (kind === "capsule" || kind === "lens") {
        // express the ray in the body's own frame (long axis along x)
        const axis = tipAngles(node)[0]?.angle ?? 0;
        const local = angle - axis;
        const inside = kind === "capsule" ? insideCapsule : insideLens;
        let lo = 0, hi = R * 2;
        for (let i = 0; i < 24; i++) {
            const mid = (lo + hi) / 2;
            if (inside(Math.cos(local) * mid, Math.sin(local) * mid)) lo = mid; else hi = mid;
        }
        return lo;
    }

    // Regular polygon: distance to the straight edge along the ray, never more
    // than the rounded corner tip.
    const sides = bodySides(node);
    const step = (Math.PI * 2) / sides;
    const circumradius = R * (sides === 3 ? 1.12 : 0.97);
    const apothem = circumradius * Math.cos(Math.PI / sides);
    const rotation = bodyRotation(node, sides);
    const offset = (((angle - rotation) % step) + step) % step - step / 2;   // from the edge's normal
    return Math.min(apothem / Math.cos(offset), reach);
}

// Where an arrow starts, as a fraction of bodyReach (beam arrows sit further out).
const arrowBaseFraction = node => (bodyKind(node) === "capsule" ? 0.73 : 0.62);

// Where the hit dots go on a piece that has an arrow at, or flanking, its top: a
// ring halfway between the charge number and the arrows' bases, so the dots
// touch neither. dotExtent is the dots' radius including their halo. Returns
// null when no arrow is near the top (the caller's default ring is then fine).
export function dotRing(node, gridSize, dotExtent) {
    const size = gridSize * 0.92;
    const top = -Math.PI / 2;
    const nearTop = tipAngles(node).some(t => {
        const diff = Math.abs(((t.angle - top + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        return diff < 0.9; // within about 50 degrees of straight up (flanking arrows count)
    });
    if (!nearTop) return null;
    const numberTop = size * 0.3 * 0.8 / 2;  // half the height of a digit, with a little margin
    const arrowBase = bodyReach(node, size) * arrowBaseFraction(node);
    const radius = (numberTop + arrowBase) / 2;
    // smallest angle that keeps neighbouring dots from overlapping
    const stepDegrees = 2 * Math.asin(Math.min(1, dotExtent / radius)) * 180 / Math.PI;
    return {radius, stepDegrees};
}

// Draws a piece centered at (cx, cy) inside a size x size box. Shared by the
// board canvas, the tray canvases and the drag ghost so all look identical.
// `dim` (0-1) fades the piece (padlock included), e.g. while another piece is
// hovered; `backing` is the color a faded piece is backed with (the board
// color behind it).
export function drawPieceShape(ctx, node, cx, cy, size, dim = 1, backing = "#ffffff") {
    const R = size / 2;
    const {fill, edge} = colorForNode(node);
    const sides = bodySides(node);
    const kind = bodyKind(node);
    // How far out the body reaches along an arrow (its rounded corner tip).
    const reach = bodyReach(node, size);
    // Traces the body outline scaled about its center (1 = full size).
    let trace;
    // Corner points of the body, each with its two neighbors, for corner marks.
    let corners = null;
    let softenLens = false;

    if (kind === "circle") {
        trace = scale => ctx.arc(cx, cy, reach * scale, 0, Math.PI * 2);
    } else if (kind === "capsule") {
        // A pill stretched along the beam's axis: the whole-line piece.
        const length = R * 2 * 0.87, width = R * 1.2;
        const axis = tipAngles(node)[0]?.angle ?? 0;
        const rot = (x, y) => ({
            x: cx + x * Math.cos(axis) - y * Math.sin(axis),
            y: cy + x * Math.sin(axis) + y * Math.cos(axis),
        });
        const box = [[-length / 2, -width / 2], [length / 2, -width / 2], [length / 2, width / 2], [-length / 2, width / 2]].map(([x, y]) => rot(x, y));
        corners = box.map((v, k) => ({v, a: box[(k + 3) % 4], b: box[(k + 1) % 4], radius: 0, interior: Math.PI / 2}));
        trace = scale => {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(axis);
            ctx.roundRect(-length * scale / 2, -width * scale / 2, length * scale, width * scale, width * scale / 2);
            ctx.restore();
        };
    } else if (kind === "lens") {
        // Two outputs on opposite sides: a lens whose two points are the
        // outputs. Softened by stroking it in its own color.
        const length = R * 2 * 0.93, bulge = R * 1.3;
        const axis = tipAngles(node)[0].angle;
        trace = scale => {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(axis);
            ctx.moveTo(-length * scale / 2, 0);
            ctx.quadraticCurveTo(0, -bulge * scale, length * scale / 2, 0);
            ctx.quadraticCurveTo(0, bulge * scale, -length * scale / 2, 0);
            ctx.closePath();
            ctx.restore();
        };
        softenLens = true;
    } else {
        // Regular polygon with a vertex on each arrow. Starters have
        // generously rounded corners; other polygons are smoothly rounded too.
        const isStarterBody = pieceType(node) === "starter";
        const circumradius = R * (sides === 3 ? 1.12 : 0.97);
        const cornerRadius = R * (isStarterBody ? 0.3 : 0.24);
        const interior = Math.PI * (sides - 2) / sides;

        const step = (Math.PI * 2) / sides;
        const rotation = bodyRotation(node, sides);
        const outline = Array.from({length: sides}, (_, k) => ({
            x: cx + Math.cos(rotation + k * step) * circumradius,
            y: cy + Math.sin(rotation + k * step) * circumradius,
        }));
        corners = outline.map((v, k) => ({v, a: outline[(k + sides - 1) % sides], b: outline[(k + 1) % sides], radius: cornerRadius, interior}));
        trace = scale => {
            const vertices = [];
            for (let k = 0; k < sides; k++) {
                const angle = rotation + k * step;
                vertices.push({
                    x: cx + Math.cos(angle) * circumradius * scale,
                    y: cy + Math.sin(angle) * circumradius * scale,
                });
            }
            // Start at the middle of the last edge so every corner can be rounded.
            const last = vertices[sides - 1];
            ctx.moveTo((last.x + vertices[0].x) / 2, (last.y + vertices[0].y) / 2);
            for (let k = 0; k < sides; k++) {
                const v = vertices[k], next = vertices[(k + 1) % sides];
                ctx.arcTo(v.x, v.y, (v.x + next.x) / 2, (v.y + next.y) / 2, cornerRadius * scale);
            }
            ctx.closePath();
        };
    }

    ctx.save();
    ctx.globalAlpha = (node.isDepleted ? 0.35 : 1) * dim;
    ctx.fillStyle = fill;
    ctx.strokeStyle = edge;
    ctx.lineWidth = Math.max(1.5, size * 0.04);
    ctx.lineJoin = "round";

    // A faded piece is first backed with the board color (opaque), so beams and
    // tints running underneath don't show through it.
    if (ctx.globalAlpha < 1) {
        const faded = ctx.globalAlpha;
        ctx.globalAlpha = 1;
        ctx.fillStyle = backing;
        ctx.beginPath();
        trace(1);
        ctx.fill();
        ctx.globalAlpha = faded;
        ctx.fillStyle = fill;
    }

    ctx.beginPath();
    trace(1);
    ctx.fill();
    if (softenLens) {
        // round off the lens points
        ctx.strokeStyle = fill;
        ctx.lineWidth = size * 0.1;
        ctx.stroke();
    }

    // No outlines; pieces that skip over a tile get small corner marks instead.
    if (skipDepth(node) > 0 && corners) {
        // pentagons and up have many small corners, so their marks are smaller
        const many = sides >= 5;
        ctx.lineWidth = Math.max(2, size * 0.045);
        ctx.lineCap = "round";
        for (const {v, a, b, radius, interior} of corners) {
            // Each arm runs past the rounded corner's tangent point, so the mark
            // hugs the smoothed corner instead of floating off it.
            const tangent = radius / Math.tan(interior / 2);
            const toward = target => {
                const dx = target.x - v.x, dy = target.y - v.y;
                const len = Math.hypot(dx, dy);
                const arm = Math.min(len * 0.45, tangent + size * (many ? 0.03 : 0.07));
                return {x: v.x + dx / len * arm, y: v.y + dy / len * arm};
            };
            const p1 = toward(a), p2 = toward(b);
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.arcTo(v.x, v.y, p2.x, p2.y, radius);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
        }
        ctx.lineCap = "butt";
    }

    // Beam arrows sit out at the capsule's ends, leaving room for hit dots.
    const [arrowBase, arrowTip] = [arrowBaseFraction(node), kind === "capsule" ? 0.9 : 0.92];
    for (const tip of tipAngles(node)) {
        drawArrow(ctx, cx, cy, tip, reach, edge, arrowBase, arrowTip);
    }

    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${Math.floor(size * 0.3)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(node.charges), cx, cy);

    if (node.locked) {
        // in the bottom-right corner of the cell, clear of the piece
        drawLock(ctx, cx + R * 0.82, cy + R * 0.82, R * 0.28);
    }
    ctx.restore();
}

// Darkens the last stretch of a beam running from `from` toward `to`, so the
// beam looks like it slides under the piece it touches. `tuck` is how far the
// beam's end is tucked inside that piece (the shadow is darkest at the edge).
export function shadeBeamEnd(ctx, from, to, tuck, width, {spread = 3, alpha = 0.22} = {}) {
    const dx = to.x - from.x, dy = to.y - from.y;
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length, uy = dy / length;
    const start = {x: to.x - ux * (tuck + spread), y: to.y - uy * (tuck + spread)};
    const edgePoint = {x: to.x - ux * tuck, y: to.y - uy * tuck};
    const gradient = ctx.createLinearGradient(start.x, start.y, edgePoint.x, edgePoint.y);
    gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
    gradient.addColorStop(1, `rgba(0, 0, 0, ${alpha})`);
    ctx.save();
    ctx.lineCap = "butt";
    ctx.strokeStyle = gradient;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
}
