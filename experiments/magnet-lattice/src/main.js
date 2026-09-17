// Bootstrap: mode switching, UI wiring, camera & pointer interaction (incl. pinch-zoom),
// animation loop, localStorage persistence, coupling-matrix / spectrum interaction
// and the stable-state sweep.

import {Lattice} from './model/lattice.js';
import {buildPairs, energy, kinetic, angularMomentum, torque} from './model/physics.js';
import {step} from './model/integrator.js';
import {relax, analyze, MinimaSweep} from './model/analysis.js';
import {exportJSON, importJSON, validate} from './io/serialize.js';
import {SceneRenderer} from './ui/canvas.js';
import {renderHeatmap, renderSpectrum, heatmapCellAt, spectrumIndexAt} from './ui/heatmap.js';

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'magnet-lattice/v1';
const clampInt = (v, lo, hi, dflt) => {
    const n = Math.round(+v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

// ---- Global state ----
const params = {k: 1.0, I: 1.0, gamma: 0.0, m: 1.0};
const settings = {substeps: 4, showLabels: true};
const lattice = new Lattice(48, true, 8);
const canvas = $('scene');
const renderer = new SceneRenderer(canvas);

let mode = 'draw';
let running = false;
let simTime = 0;
let E0 = null;
let stepCount = 0;
let state = null; // { theta, thetaDot } during simulation
let savedAngles = null; // restored on Reset
let modeAnim = null; // { modes, values, omega, C, H, base, idx, phase, animating }
let hoverIdx = -1;
let gesture = null; // active pointer gesture: {kind:'pan'|'pending'|'rotate'|'pinch', ...}
const pointers = new Map(); // active touch pointers: pointerId -> {sx, sy}
let heatHover = null; // {i, j} coupling-matrix cell under the cursor
let specHover = -1; // spectrum bar under the cursor
let sweep = null; // running MinimaSweep job
let catalog = []; // stable states from the last sweep
let catalogKey = null; // {version, k, m} the catalog was computed for
let catalogSel = -1;
let catalogRenderedAt = 0;
let persistEnabled = true;

renderer.onResize = () => draw();

// ---- Pair cache -------------------------------------------------------------
// Physics works in grid-cell units, so pairs only depend on the magnet set, k and m.
let pairCache = {version: -1, k: NaN, m: NaN, pairs: []};
function getPairs() {
    if (pairCache.version !== lattice.version || pairCache.k !== params.k || pairCache.m !== params.m) {
        pairCache = {
            version: lattice.version,
            k: params.k,
            m: params.m,
            pairs: buildPairs(lattice.cellPositions(), params),
        };
    }
    return pairCache.pairs;
}

// ---- Helpers ----------------------------------------------------------------
function setStatus(msg, err = false) {
    const el = $('status');
    el.textContent = msg;
    el.className = 'status' + (err ? ' err' : '');
}

function updateCount() {
    $('count').textContent = lattice.count;
    const ext = lattice.extent === null ? '∞' : `±${lattice.extent}`;
    $('grid-info').textContent = `${lattice.pitch}px · ${ext} · snap ${lattice.snap ? 'on' : 'off'}`;
}

function hitRadius() {
    // world px; never smaller than ~10 screen px so magnets stay grabbable when zoomed out
    return Math.max(lattice.pitch * 0.45, 10 / renderer.zoom);
}

function updateCursor() {
    let c;
    if (gesture && (gesture.kind === 'pan' || gesture.kind === 'rotate' || gesture.kind === 'pinch'))
        c = 'grabbing';
    else if (hoverIdx >= 0) c = 'grab';
    else c = mode === 'draw' ? 'crosshair' : 'default';
    canvas.style.cursor = c;
}

function stopPlay() {
    running = false;
    $('play').textContent = '▶ Play';
}

function togglePlay() {
    if (mode !== 'sim') return;
    running = !running;
    $('play').textContent = running ? '⏸ Pause' : '▶ Play';
}

function invalidateModes(silent = false) {
    heatHover = null;
    specHover = -1;
    $('heat-info').textContent = '';
    if (!modeAnim) return;
    modeAnim = null;
    $('heatmap-wrap').classList.remove('show');
    $('anim-mode').textContent = 'Animate Mode';
    if (!silent) setStatus('Configuration changed — recompute modes');
}

// ---- Persistence (localStorage) --------------------------------------------
function snapshot() {
    const doc = JSON.parse(exportJSON(lattice, params));
    // In Simulate mode persist the *designed* angles (what Reset restores), not the
    // transient dynamical state.
    if (mode === 'sim' && savedAngles && savedAngles.length === doc.magnets.length) {
        doc.magnets.forEach((mg, i) => (mg.theta = savedAngles[i]));
    }
    return {
        doc,
        settings: {...settings},
        sim: {h: +$('h').value, integrator: $('integrator').value},
        view: {offset: [renderer.offset[0], renderer.offset[1]], zoom: renderer.zoom},
    };
}

let persistTimer = 0;
function persist() {
    if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = 0;
    }
    if (!persistEnabled) return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot()));
    } catch {
        /* storage unavailable or full — ignore */
    }
}
function persistSoon(delay = 250) {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(persist, delay);
}

function restore() {
    let saved;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return false;
        saved = JSON.parse(raw);
    } catch {
        return false;
    }
    if (!saved || typeof saved !== 'object') return false;
    try {
        applyDoc(validate(saved.doc));
    } catch (e) {
        console.warn('Ignoring saved arrangement:', e.message);
        return false;
    }
    const s = saved.settings || {};
    settings.substeps = clampInt(s.substeps, 1, 64, settings.substeps);
    if (typeof s.showLabels === 'boolean') settings.showLabels = s.showLabels;
    const sim = saved.sim || {};
    if (Number.isFinite(sim.h) && sim.h > 0) {
        $('h').value = sim.h;
        $('h-val').textContent = (+$('h').value).toFixed(3);
    }
    if (sim.integrator === 'verlet' || sim.integrator === 'variational') {
        $('integrator').value = sim.integrator;
    }
    const v = saved.view;
    if (v && Array.isArray(v.offset) && v.offset.length === 2 && v.offset.every(Number.isFinite)) {
        renderer.offset = [v.offset[0], v.offset[1]];
    }
    if (v && Number.isFinite(v.zoom)) {
        renderer.zoom = Math.min(renderer.maxZoom, Math.max(renderer.minZoom, v.zoom));
    }
    return true;
}

window.addEventListener('beforeunload', persist);
document.addEventListener('visibilitychange', () => {
    if (document.hidden) persist();
});

// ---- Mode switching ---------------------------------------------------------
document.querySelectorAll('.mode-tabs button').forEach((btn) => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
});

function setMode(m) {
    mode = m;
    document
        .querySelectorAll('.mode-tabs button')
        .forEach((b) => b.classList.toggle('active', b.dataset.mode === m));
    $('panel-draw').style.display = m === 'draw' ? '' : 'none';
    $('panel-sim').style.display = m === 'sim' ? '' : 'none';
    $('panel-analysis').style.display = m === 'analysis' ? '' : 'none';

    if (m !== 'analysis') invalidateModes(true);
    if (m === 'sim') initSim();
    else stopPlay();
    updateCursor();
    draw();
}

function initSim() {
    state = {theta: lattice.angles(), thetaDot: new Float64Array(lattice.count)};
    savedAngles = lattice.angles();
    simTime = 0;
    E0 = null;
    stepCount = 0;
    if (lattice.count === 0) {
        setStatus('No magnets placed — switch to Draw mode to add some.', true);
        return;
    }
    const tau = torque(state.theta, getPairs(), lattice.count);
    let maxTau = 0;
    for (let i = 0; i < tau.length; i++) maxTau = Math.max(maxTau, Math.abs(tau[i]));
    if (maxTau < 1e-9) {
        setStatus('System starts at a stationary equilibrium — drag a magnet to perturb it.');
    }
    updateDiagnostics();
}

// ---- Pointer interaction (draw / rotate / pan / zoom / pinch) --------------
function localXY(e) {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
}

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function beginPinch() {
    // A second finger cancels whatever the first one was doing.
    if (gesture) {
        if (gesture.kind === 'rotate' && gesture.fresh) {
            // the first touch just placed a magnet — undo that
            lattice.remove(gesture.idx);
            updateCount();
        } else if (gesture.kind === 'rotate' && mode === 'sim') {
            E0 = null;
        }
    }
    const [a, b] = [...pointers.values()];
    gesture = {
        kind: 'pinch',
        dist: Math.hypot(a.sx - b.sx, a.sy - b.sy),
        mid: [(a.sx + b.sx) / 2, (a.sy + b.sy) / 2],
    };
    hoverIdx = -1;
    updateCursor();
    draw();
}

function updatePinch() {
    if (pointers.size < 2) return;
    const [a, b] = [...pointers.values()];
    const dist = Math.hypot(a.sx - b.sx, a.sy - b.sy);
    const mid = [(a.sx + b.sx) / 2, (a.sy + b.sy) / 2];
    if (gesture.dist > 0 && dist > 0) {
        renderer.zoomAt(gesture.mid[0], gesture.mid[1], dist / gesture.dist);
    }
    renderer.panBy(mid[0] - gesture.mid[0], mid[1] - gesture.mid[1]);
    gesture.dist = dist;
    gesture.mid = mid;
    draw();
}

canvas.addEventListener('pointerdown', (e) => {
    const [sx, sy] = localXY(e);
    canvas.setPointerCapture(e.pointerId);

    if (e.pointerType === 'touch') {
        pointers.set(e.pointerId, {sx, sy});
        if (pointers.size === 2) {
            beginPinch();
            return;
        }
        if (pointers.size > 2) return;
    }
    if (gesture && gesture.kind === 'pinch') return;

    const [wx, wy] = renderer.screenToWorld(sx, sy);
    const hit = lattice.nearest(wx, wy, hitRadius());

    // middle / right button always pans
    if (e.button === 1 || e.button === 2) {
        gesture = {kind: 'pan', sx, sy};
        updateCursor();
        return;
    }
    if (e.button !== 0) return;

    if (mode === 'draw') {
        if (hit) {
            // click => remove, drag => rotate (decided on first significant move)
            gesture = {kind: 'pending', idx: hit.idx, sx, sy};
        } else {
            const cell = lattice.worldToCell(wx, wy);
            const why = lattice.canPlace(cell);
            if (why) {
                setStatus(why, true);
                gesture = null;
                return;
            }
            lattice.add(cell, 0);
            updateCount();
            setStatus('');
            // continue as a rotate gesture so place-and-orient is one motion
            gesture = {kind: 'rotate', idx: lattice.count - 1, fresh: true};
            draw();
        }
    } else if (hit) {
        gesture = {kind: 'rotate', idx: hit.idx};
        if (mode === 'sim' && state) {
            state.thetaDot[hit.idx] = 0;
            gesture.hold = state.theta[hit.idx];
        }
        if (mode === 'analysis') invalidateModes();
    } else {
        gesture = {kind: 'pan', sx, sy};
    }
    updateCursor();
});

canvas.addEventListener('pointermove', (e) => {
    const [sx, sy] = localXY(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, {sx, sy});
    if (gesture && gesture.kind === 'pinch') {
        updatePinch();
        return;
    }
    if (!gesture) {
        const [wx, wy] = renderer.screenToWorld(sx, sy);
        const hit = lattice.nearest(wx, wy, hitRadius());
        const idx = hit ? hit.idx : -1;
        if (idx !== hoverIdx) {
            hoverIdx = idx;
            updateCursor();
            draw();
        }
        return;
    }
    if (gesture.kind === 'pan') {
        renderer.panBy(sx - gesture.sx, sy - gesture.sy);
        gesture.sx = sx;
        gesture.sy = sy;
        draw();
        return;
    }
    if (gesture.kind === 'pending') {
        if (Math.hypot(sx - gesture.sx, sy - gesture.sy) < 4) return;
        gesture = {kind: 'rotate', idx: gesture.idx};
        updateCursor();
    }
    if (gesture.kind === 'rotate') rotateTo(gesture.idx, sx, sy, e.shiftKey);
});

function rotateTo(idx, sx, sy, snapAngle) {
    const mg = lattice.magnets[idx];
    if (!mg) return;
    const [wx, wy] = renderer.screenToWorld(sx, sy);
    const [cx, cy] = lattice.cellToWorld(mg.cell);
    let th = Math.atan2(wy - cy, wx - cx);
    if (snapAngle) {
        const q = Math.PI / 12;
        th = Math.round(th / q) * q;
    }
    mg.theta = th;
    if (mode === 'sim' && state && idx < state.theta.length) {
        state.theta[idx] = th;
        state.thetaDot[idx] = 0;
        gesture.hold = th;
        E0 = null; // energy was injected by the user; re-base drift readout
        updateDiagnostics();
    }
    draw();
}

function endGesture(e) {
    if (e) pointers.delete(e.pointerId);
    if (!gesture) return;
    if (gesture.kind === 'pinch') {
        if (pointers.size >= 2) return;
        gesture = null;
        updateCursor();
        persistSoon();
        return;
    }
    if (gesture.kind === 'pending' && mode === 'draw') {
        lattice.remove(gesture.idx);
        hoverIdx = -1;
        updateCount();
    }
    if (gesture.kind === 'rotate' && mode === 'sim') E0 = null;
    gesture = null;
    updateCursor();
    draw();
    persistSoon();
}

canvas.addEventListener('pointerup', endGesture);
canvas.addEventListener('pointercancel', endGesture);

canvas.addEventListener(
    'wheel',
    (e) => {
        e.preventDefault();
        const [sx, sy] = localXY(e);
        const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY; // lines -> px
        renderer.zoomAt(sx, sy, Math.exp(-dy * 0.0015));
        draw();
        persistSoon(500);
    },
    {passive: false},
);

$('reset-view').addEventListener('click', () => {
    renderer.resetView();
    draw();
    persistSoon();
});

window.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(t.tagName)) return;
    if (e.code === 'Space' && mode === 'sim') {
        e.preventDefault();
        togglePlay();
    } else if (e.key === '0') {
        renderer.resetView();
        draw();
        persistSoon();
    }
});

// ---- Draw-mode controls -----------------------------------------------------
$('clear').addEventListener('click', () => {
    lattice.clear();
    hoverIdx = -1;
    invalidateModes(true);
    updateCount();
    draw();
    persistSoon();
});

// ---- Settings dialog --------------------------------------------------------
const dlg = $('config-dialog');

$('settings').addEventListener('click', () => {
    $('cfg-pitch').value = lattice.pitch;
    $('cfg-extent').value = lattice.extent === null ? 0 : lattice.extent;
    $('cfg-snap').checked = lattice.snap;
    $('cfg-m').value = params.m;
    $('cfg-substeps').value = settings.substeps;
    $('cfg-labels').checked = settings.showLabels;
    dlg.returnValue = '';
    dlg.showModal();
});

dlg.addEventListener('close', () => {
    if (dlg.returnValue !== 'ok') return;
    lattice.pitch = clampInt($('cfg-pitch').value, 8, 200, lattice.pitch);
    const ext = clampInt($('cfg-extent').value, 0, 256, 0);
    const removed = lattice.setExtent(ext === 0 ? null : ext);
    lattice.snap = $('cfg-snap').checked;
    const m = +$('cfg-m').value;
    if (Number.isFinite(m) && m > 0) params.m = m;
    settings.substeps = clampInt($('cfg-substeps').value, 1, 64, 4);
    settings.showLabels = $('cfg-labels').checked;

    E0 = null;
    hoverIdx = -1;
    if (removed) invalidateModes(true);
    if (mode === 'sim' && (!state || state.theta.length !== lattice.count)) initSim();
    updateCount();
    setStatus(
        removed
            ? `Settings applied; removed ${removed} magnet(s) outside the new extent`
            : 'Settings applied',
    );
    draw();
    persistSoon();
});

$('cfg-forget').addEventListener('click', () => {
    persistEnabled = false;
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        /* ignore */
    }
    location.reload();
});

// ---- Simulation controls ----------------------------------------------------
function bindSlider(id, key, fmt) {
    $(id).addEventListener('input', (e) => {
        params[key] = +e.target.value;
        $(id + '-val').textContent = fmt(params[key]);
        E0 = null; // parameters changed => energy baseline is meaningless
        invalidateModes(true);
        if (mode === 'sim') updateDiagnostics();
        if (key === 'I') renderCatalog(); // ω_min readout depends on I
        persistSoon();
    });
}
bindSlider('k', 'k', (v) => v.toFixed(1));
bindSlider('I', 'I', (v) => v.toFixed(1));
bindSlider('gamma', 'gamma', (v) => v.toFixed(2));
$('h').addEventListener('input', (e) => {
    $('h-val').textContent = (+e.target.value).toFixed(3);
    persistSoon();
});
$('integrator').addEventListener('change', () => persistSoon());

$('play').addEventListener('click', togglePlay);
$('step').addEventListener('click', () => {
    doStep();
    draw();
    updateDiagnostics();
});
$('reset').addEventListener('click', () => {
    if (savedAngles && savedAngles.length === lattice.count) lattice.setAngles(savedAngles);
    stopPlay();
    initSim();
    draw();
    persistSoon();
});

function doStep() {
    if (!state || lattice.count === 0 || state.theta.length !== lattice.count) return;
    const pairs = getPairs();
    const method = $('integrator').value;
    const h = +$('h').value;
    state = step(state, pairs, params, h, method);
    // a magnet being dragged is held fixed
    if (gesture && gesture.kind === 'rotate' && gesture.hold !== undefined) {
        state.theta[gesture.idx] = gesture.hold;
        state.thetaDot[gesture.idx] = 0;
    }
    lattice.setAngles(state.theta);
    simTime += h;
    stepCount++;
}

function updateDiagnostics() {
    if (!state || lattice.count === 0) return;
    const pairs = getPairs();
    const U = energy(state.theta, pairs);
    const T = kinetic(state.thetaDot, params.I);
    const E = T + U;
    const L = angularMomentum(state.thetaDot, params.I);
    if (E0 === null) E0 = E;
    $('t-val').textContent = simTime.toFixed(2);
    $('E-val').textContent = E.toFixed(6);
    $('T-val').textContent = T.toFixed(6);
    $('U-val').textContent = U.toFixed(6);
    $('L-val').textContent = L.toFixed(6);
    const dE = Math.abs(E0) > 1e-12 ? (E - E0) / Math.abs(E0) : E - E0;
    $('dE-val').textContent = dE.toExponential(3);
}

// ---- Analysis controls ------------------------------------------------------
const heatmapCv = $('heatmap');
const spectrumCv = $('spectrum');

$('relax').addEventListener('click', () => {
    if (lattice.count === 0) return setStatus('No magnets to relax', true);
    const {theta, iterations, gradNorm} = relax(lattice.angles(), getPairs(), lattice.count);
    lattice.setAngles(theta);
    savedAngles = lattice.angles();
    invalidateModes(true);
    setStatus(`Relaxed in ${iterations} iters, |∇U|=${gradNorm.toExponential(2)}`);
    draw();
    persistSoon();
});

$('analyze').addEventListener('click', () => {
    if (lattice.count === 0) return setStatus('No magnets to analyze', true);
    const res = analyze(lattice.angles(), getPairs(), lattice.count, params);
    $('heatmap-wrap').classList.add('show');
    $('mode-pick').max = String(lattice.count - 1);
    $('mode-pick').value = '0';
    $('anim-mode').textContent = 'Animate Mode';
    heatHover = null;
    specHover = -1;
    $('heat-info').textContent = '';
    modeAnim = {
        modes: res.modes,
        values: res.values,
        omega: res.omega,
        C: res.C,
        H: res.H,
        base: lattice.angles(),
        idx: 0,
        phase: 0,
        animating: false,
    };
    renderHeatmap(heatmapCv, res.C, null);
    showMode(0);
    const unstable = res.values.filter((v) => v < -1e-9).length;
    setStatus(unstable ? `Modes computed — ${unstable} unstable` : 'Modes computed');
});

$('mode-pick').addEventListener('input', (e) => showMode(+e.target.value));
$('anim-mode').addEventListener('click', () => {
    if (!modeAnim) return;
    modeAnim.animating = !modeAnim.animating;
    $('anim-mode').textContent = modeAnim.animating ? 'Stop' : 'Animate Mode';
    if (!modeAnim.animating) {
        modeAnim.phase = 0;
        draw();
    }
});

function renderSpectrumNow() {
    if (!modeAnim) return;
    renderSpectrum(spectrumCv, modeAnim.omega, modeAnim.idx, specHover);
}

function showMode(idx) {
    if (!modeAnim) return;
    idx = Math.min(modeAnim.omega.length - 1, Math.max(0, idx | 0));
    modeAnim.idx = idx;
    modeAnim.phase = 0;
    $('mode-pick').value = String(idx);
    $('mode-val').textContent = idx;
    $('omega-val').textContent = modeAnim.omega[idx].toFixed(4);
    const unstable = modeAnim.values[idx] < -1e-9;
    $('stab-val').textContent = unstable ? '⚠ unstable' : '';
    $('stab-val').style.color = unstable ? '#e77' : '#8a8';
    renderSpectrumNow();
    draw();
}

// Spectrum: click a bar to select the mode, hover for a preview.
function spectrumIdxFromEvent(e) {
    if (!modeAnim) return -1;
    const rect = spectrumCv.getBoundingClientRect();
    return spectrumIndexAt(spectrumCv, modeAnim.omega.length, e.clientX - rect.left);
}
spectrumCv.addEventListener('pointerdown', (e) => {
    const idx = spectrumIdxFromEvent(e);
    if (idx >= 0) showMode(idx);
});
spectrumCv.addEventListener('pointermove', (e) => {
    const idx = spectrumIdxFromEvent(e);
    if (idx === specHover) return;
    specHover = idx;
    spectrumCv.title = idx >= 0 ? `mode ${idx}: ω = ${modeAnim.omega[idx].toFixed(4)}` : '';
    renderSpectrumNow();
});
spectrumCv.addEventListener('pointerleave', () => {
    if (specHover === -1) return;
    specHover = -1;
    spectrumCv.title = '';
    renderSpectrumNow();
});

// Coupling matrix: hovering a cell highlights the pair on the scene and reports C_ij / H_ij.
heatmapCv.addEventListener('pointermove', (e) => {
    if (!modeAnim) return;
    const rect = heatmapCv.getBoundingClientRect();
    const cell = heatmapCellAt(heatmapCv, lattice.count, e.clientX - rect.left, e.clientY - rect.top);
    const same =
        (cell === null && heatHover === null) ||
        (cell && heatHover && cell.i === heatHover.i && cell.j === heatHover.j);
    if (same) return;
    heatHover = cell;
    renderHeatmap(heatmapCv, modeAnim.C, heatHover);
    if (cell) {
        const {i, j} = cell;
        const idI = lattice.magnets[i]?.id ?? i;
        const idJ = lattice.magnets[j]?.id ?? j;
        $('heat-info').textContent =
            i === j
                ? `#${idI} self-stiffness: H=${modeAnim.H[i][i].toFixed(4)}`
                : `#${idI} ↔ #${idJ}: C=${modeAnim.C[i][j].toFixed(3)}  H=${modeAnim.H[i][j].toFixed(4)}`;
    } else {
        $('heat-info').textContent = '';
    }
    draw();
});
heatmapCv.addEventListener('pointerleave', () => {
    if (!heatHover) return;
    heatHover = null;
    $('heat-info').textContent = '';
    if (modeAnim) renderHeatmap(heatmapCv, modeAnim.C, null);
    draw();
});

// ---- Stable-state sweep -----------------------------------------------------
function catalogStale() {
    return (
        !catalogKey ||
        catalogKey.version !== lattice.version ||
        catalogKey.k !== params.k ||
        catalogKey.m !== params.m
    );
}

function clearCatalog() {
    sweep = null;
    catalog = [];
    catalogKey = null;
    catalogSel = -1;
    $('sweep').textContent = 'Sweep';
    renderCatalog();
}

$('sweep').addEventListener('click', () => {
    if (sweep) {
        sweep = null;
        $('sweep').textContent = 'Sweep';
        renderCatalog();
        setStatus(`Sweep stopped — ${catalog.length} stable state(s) catalogued`);
        return;
    }
    if (lattice.count === 0) return setStatus('No magnets to sweep', true);
    const starts = clampInt($('sweep-starts').value, 1, 5000, 200);
    $('sweep-starts').value = starts;
    catalogKey = {version: lattice.version, k: params.k, m: params.m};
    catalogSel = -1;
    sweep = new MinimaSweep(lattice.cellPositions(), getPairs(), lattice.count, {starts});
    catalog = sweep.catalog;
    $('sweep').textContent = 'Stop';
    renderCatalog();
    setStatus('Sweeping…');
});

function renderCatalog() {
    const el = $('catalog');
    el.innerHTML = '';
    if (!catalog.length) {
        el.textContent = sweep ? 'Searching…' : catalogKey ? 'No stable states found.' : '';
        return;
    }
    for (const entry of catalog) {
        const div = document.createElement('div');
        div.className = 'catalog-item' + (entry.id === catalogSel ? ' selected' : '');
        const wmin = Math.sqrt(Math.max(0, entry.lambdaMin) / params.I);
        div.innerHTML =
            `<b>#${entry.id}</b> U=${entry.energy.toFixed(4)} ω<sub>min</sub>=${wmin.toFixed(3)}` +
            ` · ${entry.hits} hit${entry.hits === 1 ? '' : 's'} · orbit ${entry.orbit}` +
            `<br><span class="tags"></span>`;
        div.querySelector('.tags').textContent = entry.tags.join(' · ');
        div.title = 'Click to load this configuration';
        div.addEventListener('click', () => loadCatalogEntry(entry));
        el.appendChild(div);
    }
}

function loadCatalogEntry(entry) {
    if (entry.theta.length !== lattice.count) return;
    lattice.setAngles(entry.theta);
    savedAngles = lattice.angles();
    catalogSel = entry.id;
    invalidateModes(true);
    renderCatalog();
    setStatus(`Loaded stable state #${entry.id} (U=${entry.energy.toFixed(4)})`);
    draw();
    persistSoon();
}

// ---- Import / Export --------------------------------------------------------
/** Replace the lattice/params with a validated document. Returns the number of skipped magnets. */
function applyDoc(doc) {
    lattice.clear();
    lattice.pitch = doc.grid.pitch;
    lattice.snap = doc.grid.snap;
    lattice.extent = doc.grid.extent;
    Object.assign(params, doc.params);
    let skipped = 0;
    for (const mg of doc.magnets) {
        if (lattice.canPlace(mg.cell)) {
            skipped++;
            continue;
        }
        lattice.add(mg.cell, mg.theta, mg.id);
    }
    hoverIdx = -1;
    E0 = null;
    invalidateModes(true);
    syncUI();
    updateCount();
    if (mode === 'sim') {
        stopPlay();
        initSim();
    }
    return skipped;
}

$('export').addEventListener('click', () => {
    $('json').value = exportJSON(lattice, params);
    setStatus('Exported to text box');
});

$('import').addEventListener('click', () => {
    try {
        const skipped = applyDoc(importJSON($('json').value));
        setStatus(
            `Imported ${lattice.count} magnets` +
                (skipped ? ` (${skipped} skipped: overlapping or out of bounds)` : ''),
        );
        draw();
        persistSoon();
    } catch (e) {
        setStatus(e.message, true);
    }
});

function syncUI() {
    $('k').value = params.k;
    $('k-val').textContent = params.k.toFixed(1);
    $('I').value = params.I;
    $('I-val').textContent = params.I.toFixed(1);
    $('gamma').value = params.gamma;
    $('gamma-val').textContent = params.gamma.toFixed(2);
}

// ---- Rendering & animation loop --------------------------------------------
function draw() {
    if ((catalog.length || sweep) && catalogStale()) clearCatalog();
    let angles = null,
        modeVec = null,
        highlight = null;
    if (mode === 'analysis' && modeAnim) {
        const v = modeAnim.modes[modeAnim.idx];
        modeVec = v;
        // displaced angles for preview — computed on the fly, lattice is not mutated
        const amp = 0.6 * Math.sin(modeAnim.phase);
        angles = Float64Array.from(modeAnim.base);
        for (let i = 0; i < angles.length; i++) angles[i] += amp * v[i];
        if (heatHover) highlight = [heatHover.i, heatHover.j];
    }
    renderer.render(lattice, {
        angles,
        modeVec,
        hover: hoverIdx,
        highlight,
        showLabels: settings.showLabels,
    });
}

function loop() {
    if (mode === 'sim' && running) {
        for (let s = 0; s < settings.substeps; s++) doStep();
        updateDiagnostics();
        draw();
    } else if (mode === 'analysis' && modeAnim && modeAnim.animating) {
        modeAnim.phase += 0.08;
        draw();
    }
    if (sweep) {
        const finished = sweep.runFor(25);
        catalog = sweep.catalog;
        const t = performance.now();
        if (finished || t - catalogRenderedAt > 400) {
            renderCatalog();
            catalogRenderedAt = t;
        }
        setStatus(
            `Sweep ${sweep.done}/${sweep.total}: ${catalog.length} stable state(s), ` +
                `${sweep.saddles} saddle(s), ${sweep.unconverged} unconverged`,
        );
        if (finished) {
            sweep = null;
            $('sweep').textContent = 'Sweep';
        }
    }
    requestAnimationFrame(loop);
}

// ---- Init -------------------------------------------------------------------
function init() {
    const restored = restore();
    if (!restored) {
        // Two magnets slightly perturbed from the head-to-tail equilibrium so
        // that dynamics are visible immediately in Simulate mode.
        lattice.add([-1, 0], 0.6);
        lattice.add([1, 0], Math.PI - 0.6);
    }
    syncUI();
    updateCount();
    updateCursor();
    draw();
    if (restored) setStatus('Restored previous session');
}

// Debug handle: window.__ml.state / params / lattice / renderer
window.__ml = {
    get state() {
        return state;
    },
    params,
    settings,
    lattice,
    renderer,
    get mode() {
        return mode;
    },
    get catalog() {
        return catalog;
    },
    step: () => {
        doStep();
        draw();
        updateDiagnostics();
    },
    persist,
};

init();
loop();