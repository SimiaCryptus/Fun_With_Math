// Heatmap / contour rasterization of L over the visible viewport.

const VIRIDIS = [
    [68, 1, 84], [59, 82, 139], [33, 145, 140],
    [94, 201, 98], [253, 231, 37],
];

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function sampleColorMap(t, scheme) {
    t = Math.max(0, Math.min(1, t));
    if (scheme === 'grayscale') {
        const g = Math.round(t * 255);
        return [g, g, g];
    }
    if (scheme === 'diverging') {
        // blue-white-red
        if (t < 0.5) {
            const u = t * 2;
            return [Math.round(lerp(30, 240, u)), Math.round(lerp(60, 240, u)), Math.round(lerp(180, 240, u))];
        } else {
            const u = (t - 0.5) * 2;
            return [Math.round(lerp(240, 200, u)), Math.round(lerp(240, 40, u)), Math.round(lerp(240, 40, u))];
        }
    }
    // viridis
    const seg = t * (VIRIDIS.length - 1);
    const i = Math.floor(seg);
    const f = seg - i;
    const c0 = VIRIDIS[i], c1 = VIRIDIS[Math.min(i + 1, VIRIDIS.length - 1)];
    return [
        Math.round(lerp(c0[0], c1[0], f)),
        Math.round(lerp(c0[1], c1[1], f)),
        Math.round(lerp(c0[2], c1[2], f)),
    ];
}

export class LossRenderer {
    constructor(ctx, camera) {
        this.ctx = ctx;
        this.camera = camera;
        this.step = 3; // pixel resolution for rasterization
    }

    render(objective, config) {
        const ctx = this.ctx;
        const cam = this.camera;
        ctx.clearRect(0, 0, cam.width, cam.height);
        if (config.vizMode === 'hidden') return;

        const r = cam.gridRect();
        const step = this.step;

        // First pass: find min/max over grid area
        let vmin = Infinity, vmax = -Infinity;
        const cols = Math.ceil(r.w / step), rows = Math.ceil(r.h / step);
        const vals = new Float32Array(cols * rows);
        for (let j = 0; j < rows; j++) {
            for (let i = 0; i < cols; i++) {
                const sx = r.x + i * step, sy = r.y + j * step;
                const [wx, wy] = cam.screenToWorld(sx, sy);
                const v = objective.value(wx, wy);
                vals[j * cols + i] = v;
                if (v < vmin) vmin = v;
                if (v > vmax) vmax = v;
            }
        }
        const range = (vmax - vmin) || 1;
        this.vmin = vmin;
        this.vmax = vmax;

        if (config.vizMode === 'heatmap') {
            const img = ctx.createImageData(cols * step, rows * step);
            // draw per cell block
            for (let j = 0; j < rows; j++) {
                for (let i = 0; i < cols; i++) {
                    const t = (vals[j * cols + i] - vmin) / range;
                    const [cr, cg, cb] = sampleColorMap(t, config.colorScheme);
                    for (let dy = 0; dy < step; dy++) {
                        for (let dx = 0; dx < step; dx++) {
                            const px = i * step + dx, py = j * step + dy;
                            const idx = (py * cols * step + px) * 4;
                            img.data[idx] = cr;
                            img.data[idx + 1] = cg;
                            img.data[idx + 2] = cb;
                            img.data[idx + 3] = 255;
                        }
                    }
                }
            }
            ctx.putImageData(img, r.x, r.y);
        } else if (config.vizMode === 'contour') {
            this.renderContours(vals, cols, rows, step, r, vmin, range, config);
        }
    }

    renderContours(vals, cols, rows, step, r, vmin, range, config) {
        const ctx = this.ctx;
        ctx.fillStyle = '#111';
        ctx.fillRect(r.x, r.y, r.w, r.h);
        const levels = 12;
        ctx.lineWidth = 1;
        for (let l = 1; l < levels; l++) {
            const iso = vmin + (l / levels) * range;
            const [cr, cg, cb] = sampleColorMap(l / levels, config.colorScheme);
            ctx.strokeStyle = `rgb(${cr},${cg},${cb})`;
            ctx.beginPath();
            // marching squares
            for (let j = 0; j < rows - 1; j++) {
                for (let i = 0; i < cols - 1; i++) {
                    const v0 = vals[j * cols + i];
                    const v1 = vals[j * cols + i + 1];
                    const v2 = vals[(j + 1) * cols + i + 1];
                    const v3 = vals[(j + 1) * cols + i];
                    const x0 = r.x + i * step, y0 = r.y + j * step;
                    const x1 = x0 + step, y1 = y0 + step;
                    const pts = [];
                    const edge = (a, b, xa, ya, xb, yb) => {
                        if ((a < iso) !== (b < iso)) {
                            const t = (iso - a) / (b - a);
                            pts.push([xa + (xb - xa) * t, ya + (yb - ya) * t]);
                        }
                    };
                    edge(v0, v1, x0, y0, x1, y0);
                    edge(v1, v2, x1, y0, x1, y1);
                    edge(v2, v3, x1, y1, x0, y1);
                    edge(v3, v0, x0, y1, x0, y0);
                    if (pts.length >= 2) {
                        ctx.moveTo(pts[0][0], pts[0][1]);
                        ctx.lineTo(pts[1][0], pts[1][1]);
                    }
                }
            }
            ctx.stroke();
        }
    }
}