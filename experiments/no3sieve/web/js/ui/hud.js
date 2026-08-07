// hud.js — instrumented HUD (§5.8): fps, frame time, engine rings/s, points/s,
// live calendar events, and an honest note about which execution path is active.
export class Hud {
    constructor(el) {
        if (!el) throw new TypeError('Hud: target element is required');
        this.el = el;
        this.frames = 0;
        this.fps = 0;
        this.last = performance.now();
    }

    frame() {
        this.frames++;
        const now = performance.now();
        if (now - this.last >= 500) {
            this.fps = (this.frames * 1000) / (now - this.last);
            this.frames = 0;
            this.last = now;
        }
    }

    render(vp, ps, runner, renderer, opts) {
        if (!vp || !ps || !runner || !renderer || !opts) return;
        const st = runner.stats;
        const mb = (runner.stats.eventBytes / 1048576).toFixed(1);
        const density = ps.rGen >= 0 ? (ps.k / (2 * (2 * ps.rGen + 1))) : 0;
        const lines = ps.rGen >= 0 ? 2 * ps.rGen + 1 : 0;
        const blockedPct = st.cells ? (100 * st.blocked / st.cells).toFixed(1) : '0.0';
        this.el.textContent = [
            `fps        ${this.fps.toFixed(0)}   frame ${renderer.lastFrameMs.toFixed(1)} ms`,
            `zoom       ${vp.zoom.toFixed(3)} px/cell   LOD stride ${renderer.lastStride}`,
            `camera     (${vp.cx.toFixed(1)}, ${vp.cy.toFixed(1)})`,
            `ring R     ${ps.rGen}   |P| = ${ps.k}`,
            `I2 usage   ${(100 * density).toFixed(1)}% of 2(2R+1)`,
            // Sparse ring? These two lines say why. A ring has 8R cells but each of
            // its four faces IS one row/column, so it can absorb at most 8 points —
            // and only if those rows/columns are not already saturated.
            `last ring  +${st.accepted} of ${st.cells} cells   ${blockedPct}% blocked`,
            `I2 dead    rows ${st.satRows}/${lines}   cols ${st.satCols}/${lines}`,
            `marks      ${runner.stats.marks}`,
            `events     live ${runner.stats.liveEvents}  peak ${runner.stats.peakEvents}  ${mb} MB`,
            `backend    calendar / ${runner.mode}`,
            `overlay    ${opts.density ? `s=${opts.s} (${opts.norm === '2s' ? 'D/2s' : 'D/s'})` : 'off'}`,
            renderer.lastError ? `LAYER ERR  ${renderer.lastError}` : null,
        ].filter(Boolean).join('\n');
    }
}