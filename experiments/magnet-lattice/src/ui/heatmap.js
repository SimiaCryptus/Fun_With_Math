// Coupling-matrix heatmap and eigenvalue spectrum rendering, plus hit-testing helpers
// so the UI can react to hover/click on either chart. No physics lives here.

/** Blue-white-red diverging colormap for value in [-1,1]. */
function divergeColor(v) {
    const t = Math.max(-1, Math.min(1, v));
    if (t >= 0) {
        const g = Math.round(255 * (1 - t));
        return `rgb(255,${g},${g})`;
    }
    const g = Math.round(255 * (1 + t));
    return `rgb(${g},${g},255)`;
}

/** Cell geometry shared by renderHeatmap() and heatmapCellAt(). */
export function heatmapLayout(canvas, n) {
    const cell = Math.floor(Math.min(canvas.width, canvas.height) / n);
    const size = cell * n;
    return {cell, size, ox: (canvas.width - size) / 2, oy: (canvas.height - size) / 2};
}

/**
 * Map a point (CSS px relative to the canvas element) to a matrix cell {i, j},
 * or null when outside the matrix.
 */
export function heatmapCellAt(canvas, n, cssX, cssY) {
    if (n === 0) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const x = (cssX * canvas.width) / rect.width;
    const y = (cssY * canvas.height) / rect.height;
    const {cell, size, ox, oy} = heatmapLayout(canvas, n);
    if (x < ox || y < oy || x >= ox + size || y >= oy + size) return null;
    return {i: Math.floor((y - oy) / cell), j: Math.floor((x - ox) / cell)};
}

/**
 * Render normalized coupling matrix C (values in ~[-1,1]) as a heatmap.
 * `highlight` = {i, j} marks a cell: its row/column are lit and the cell (and
 * its symmetric partner) outlined.
 */
export function renderHeatmap(canvas, C, highlight = null) {
    const ctx = canvas.getContext('2d');
    const n = C.length;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (n === 0) return;
    const {cell, size, ox, oy} = heatmapLayout(canvas, n);
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            ctx.fillStyle = divergeColor(C[i][j]);
            ctx.fillRect(ox + j * cell, oy + i * cell, cell - 1, cell - 1);
        }
    }
    if (highlight && highlight.i >= 0 && highlight.i < n && highlight.j >= 0 && highlight.j < n) {
        const {i, j} = highlight;
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.fillRect(ox, oy + i * cell, size, cell); // row i
        ctx.fillRect(ox + j * cell, oy, cell, size); // column j
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#fc6';
        ctx.strokeRect(ox + j * cell + 1, oy + i * cell + 1, cell - 2, cell - 2);
        if (i !== j) {
            ctx.strokeStyle = 'rgba(255,204,102,0.55)';
            ctx.strokeRect(ox + i * cell + 1, oy + j * cell + 1, cell - 2, cell - 2);
        }
    }
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.strokeRect(ox, oy, size, size);
}

/** Map an x position (CSS px relative to the canvas element) to a spectrum bar index, or -1. */
export function spectrumIndexAt(canvas, n, cssX) {
    if (n === 0) return -1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return -1;
    const x = (cssX * canvas.width) / rect.width;
    const idx = Math.floor((x / canvas.width) * n);
    return idx >= 0 && idx < n ? idx : -1;
}

/**
 * Render eigenvalue spectrum (ω values). Negative → unstable (red).
 * `selected` bar is emphasised and labelled; `hover` bar gets a faint column.
 */
export function renderSpectrum(canvas, omega, selected = -1, hover = -1) {
    const ctx = canvas.getContext('2d');
    const n = omega.length;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (n === 0) return;
    let max = 1e-9;
    for (const w of omega) max = Math.max(max, Math.abs(w));
    const midY = canvas.height / 2;
    const barW = canvas.width / n;
    const top = 14; // room for the ω label
    const halfH = midY - Math.max(6, top / 2) - 2;

    // column backdrops
    if (hover >= 0 && hover < n && hover !== selected) {
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.fillRect(hover * barW, 0, barW, canvas.height);
    }
    if (selected >= 0 && selected < n) {
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.fillRect(selected * barW, 0, barW, canvas.height);
    }

    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(canvas.width, midY);
    ctx.stroke();

    const pad = Math.min(2, barW * 0.15);
    for (let i = 0; i < n; i++) {
        const w = omega[i];
        const hgt = (Math.abs(w) / max) * halfH;
        const isSel = i === selected;
        const x = i * barW + pad;
        const y = w >= 0 ? midY - hgt : midY;
        const bw = Math.max(1, barW - 2 * pad);
        ctx.fillStyle = w < 0 ? (isSel ? '#f99' : '#e55') : isSel ? '#9f9' : '#5c6';
        ctx.fillRect(x, y, bw, Math.max(hgt, 1));
        if (isSel) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(x + 0.5, y + 0.5, bw - 1, Math.max(hgt, 1) - 1);
            ctx.fillStyle = '#eee';
            ctx.font = '10px monospace';
            ctx.textAlign = 'center';
            const label = `ω=${w.toFixed(3)}`;
            const lw = ctx.measureText(label).width;
            const lx = Math.min(canvas.width - lw / 2 - 2, Math.max(lw / 2 + 2, x + bw / 2));
            ctx.fillText(label, lx, top - 4);
            ctx.textAlign = 'start';
        }
    }
}