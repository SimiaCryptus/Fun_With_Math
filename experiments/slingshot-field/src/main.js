import {SYSTEMS} from './config/systems.js';
import {DEFAULTS} from './config/defaults.js';
import {lagrangePoints} from './core/lagrange.js';
import {centerOf, CORE_VERSION, hillRadius, isExitLabel, LABEL} from './core/conventions.js';
import {createGrid, exactParent, F, FIELD_NAMES, nearestIndex, nextN, NF, xiAt} from './core/grid.js';
import {postprocess} from './core/differential.js';
import {propagate} from './core/encounter.js';
import {inertialVel, omega} from './core/cr3bp.js';
import {patchedConicPredict} from './core/patchedConic.js';
import {WorkerPool} from './compute/workerPool.js';
import {ViewRenderer} from './render/renderer.js';
import {PhysicalView} from './render/physicalView.js';
import {ManifoldView} from './render/manifoldView.js';
import {colorize, ringColors, SCALAR_LAYERS} from './render/colormaps.js';
import {installPanels} from './ui/panels.js';
import {hideTip, installTips, showTip} from './ui/tips.js';
import {renderLegend} from './ui/legend.js';
import {FIELD_DESC, LABEL_DESC, LABEL_SHORT, PRESET_DESC, SIG_DESC} from './ui/descriptions.js';

const $ = (id) => document.getElementById(id);
const TWO_PI = 2 * Math.PI;
const deg = (r) => ((r * 180) / Math.PI).toFixed(2);
const LABEL_NAME = Object.fromEntries(Object.entries(LABEL).map(([k, v]) => [v, k.toLowerCase()]));
const CENTER_NAME = {secondary: 'P2', primary: 'P1', barycentre: 'the barycentre'};
const PARAM_IDS = ['mu', 'Lkm', 'R1km', 'R2km', 'center', 'rhoFactor', 'kFar', 'N', 'T', 'rtol'];

installPanels();
installTips();
const phys = new PhysicalView(), man = new ManifoldView();
const RP = new ViewRenderer($('view'), phys);
const RM = new ViewRenderer($('mview'), man);
const request = () => {
    RP.request();
    RM.request();
};
const pool = new WorkerPool(new URL('./compute/encounterWorker.js', import.meta.url));
const cache = new Map();
/** busy: a computation/refinement is running. token: bumps on every start/abort so stale awaits bail out. */
const S = {grid: null, key: null, lps: null, sel: null, traj: false, busy: false, token: 0};

for (const [k, s] of Object.entries(SYSTEMS)) $('system').add(new Option(s.name, k));
$('system').add(new Option('Custom', 'custom'));
for (const [k, L] of Object.entries(SCALAR_LAYERS)) {
    const o = new Option(L.name, k);
    o.title = L.desc;
    $('scalar').add(o);
}
$('scalar').value = 'dE';

function updateScalarTip() {
    const L = SCALAR_LAYERS[$('scalar').value];
    $('scalar').dataset.tip = `Which per-sample quantity colours the (α, β) map.\n\nCurrent — ${L.name}: ${L.desc}`;
}

// ---- system parameters
function fillPreset(key) {
    const s = SYSTEMS[key];
    if (!s) return;
    $('mu').value = s.mu;
    $('Lkm').value = s.L;
    $('R1km').value = s.R1;
    $('R2km').value = s.R2;
}

function validate() {
    const mu = +$('mu').value, L = +$('Lkm').value, R1 = +$('R1km').value, R2 = +$('R2km').value;
    if (!(mu > 0 && mu <= 0.5)) return 'μ must lie in (0, 0.5]';
    if (!(L > 0)) return 'L must be > 0';
    if (!(R1 >= 0) || !(R2 >= 0)) return 'radii must be ≥ 0';
    if (!(+$('rhoFactor').value > 0)) return 'ρ / r_H must be > 0';
    if (!(+$('kFar').value > 1)) return 'k_far must be > 1';
    return null;
}

function params() {
    const mu = +$('mu').value, L = +$('Lkm').value, center = $('center').value;
    const {cx, m} = centerOf(center, mu);
    const rho = hillRadius(mu) * +$('rhoFactor').value;
    return {
        system: $('system').value, mu, L, R1: +$('R1km').value / L, Rbody: +$('R2km').value / L,
        center, cx, mc: m,
        C: +$('Cnum').value, rho, rhoFar: rho * +$('kFar').value,
        T: +$('T').value, rtol: +$('rtol').value, atol: +$('rtol').value, N: +$('N').value,
    };
}

function cPreset(name) {
    const [L1, L2, L3] = S.lps;
    return {l1closed: L1.C + 0.01, l1open: (L1.C + L2.C) / 2, l2open: (L2.C + L3.C) / 2, l3open: L3.C - 0.01}[name];
}

function setC(C, live = true) {
    $('C').value = C;
    $('Cnum').value = (+C).toFixed(6);
    phys.setC(+C);
    if (live) RP.request();
}

/** Re-derive everything that depends on the system parameters. Returns false if they are invalid. */
function onSystem(keepC) {
    const err = validate();
    if (err) {
        $('muInfo').textContent = `⚠ ${err}`;
        return false;
    }
    const p = params();
    S.lps = lagrangePoints(p.mu);
    const [L1, L2, L3] = S.lps;
    const cBodyR = p.center === 'primary' ? p.R1 : p.center === 'secondary' ? p.Rbody : 0;
    $('muInfo').textContent =
        `r_H = ${hillRadius(p.mu).toExponential(4)}  ρ = ${p.rho.toExponential(4)}\n` +
        `R₁ = ${p.R1.toExponential(3)}  R₂ = ${p.Rbody.toExponential(3)}  (units of L)\n` +
        `Σ centred on ${CENTER_NAME[p.center]} at x = ${p.cx.toFixed(6)}` +
        (cBodyR >= p.rho ? '\n⚠ ρ lies inside the central body: every entry collides' : '');
    $('Cticks').textContent = `C_L1 = ${L1.C.toFixed(5)}  C_L2 = ${L2.C.toFixed(5)}\nC_L3 = ${L3.C.toFixed(5)}  C_L4,5 = ${S.lps[3].C.toFixed(5)}`;
    $('C').min = L3.C - 0.05;
    $('C').max = L1.C + 0.05;
    const tips = [];
    for (const o of $('Cpreset').options) {
        if (!o.value) continue;
        const c = cPreset(o.value);
        o.title = `${PRESET_DESC[o.value]}\nC = ${c.toFixed(5)}`;
        tips.push(`${o.text} (C = ${c.toFixed(5)}): ${PRESET_DESC[o.value]}`);
    }
    $('Cpreset').dataset.tip = `Jacobi-level presets. Picking one sets C and recomputes.\n\n${tips.join('\n\n')}`;
    if (!keepC) setC(cPreset('l1open'), false);
    phys.setSystem(params(), S.lps);
    phys.fitCircle();
    request();
    return true;
}

function writeHash() {
    const q = new URLSearchParams({system: $('system').value, C: $('Cnum').value, layer: $('scalar').value});
    for (const id of PARAM_IDS) q.set(id, $(id).value);
    history.replaceState(null, '', '#' + q);
}

function readHash() {
    const q = new URLSearchParams(location.hash.slice(1));
    if (q.has('system')) $('system').value = q.get('system');
    if (!$('system').value) $('system').value = DEFAULTS.system;
    if ($('system').value !== 'custom') fillPreset($('system').value);
    for (const id of PARAM_IDS) if (q.has(id)) $(id).value = q.get(id);
    if (!$('N').value) $('N').value = String(DEFAULTS.N);
    if (!$('center').value) $('center').value = DEFAULTS.center;
    if (q.has('layer') && SCALAR_LAYERS[q.get('layer')]) $('scalar').value = q.get('layer');
    return q.has('C') ? +q.get('C') : null;
}

// ---- rendering
let refreshTimer = null;
const scheduleRefresh = () => {
    if (refreshTimer) return;
    const N = S.grid?.N ?? 0;
    refreshTimer = setTimeout(() => {
        refreshTimer = null;
        refresh();
    }, Math.max(150, (N * N) / 1e4));
};

function refresh() {
    const g = S.grid;
    if (!g) return;
    const key = $('scalar').value;
    const {rgba, range} = colorize(g, key);
    man.setImage(rgba, g.N);
    renderLegend($('legend'), key, range);
    man.setOverlays(g, {
        quiver: $('showQuiver').checked,
        stream: $('showStream').checked,
        glyph: $('showGlyph').checked
    });
    phys.setRing(ringColors(g, $('ringReduce').value), g.N, $('showRing').checked);
    request();
}

// ---- computation
function setProgress(frac, text) {
    $('pbar').value = Math.min(1, Math.max(0, frac));
    $('progress').textContent = text;
    $('pstat').textContent = text.split('\n')[0];
}

function updateButtons() {
    const g = S.grid, nx = g?.complete ? nextN(g.N) : null;
    $('refine').disabled = S.busy || !nx;
    $('refine').textContent = nx ? `Refine → ${nx}²` : g?.complete ? 'Refine (max)' : 'Refine';
    $('run').disabled = S.busy;
    $('cancel').disabled = !S.busy;
}

function abortRunning() {
    if (!S.busy) return;
    S.token++;
    S.busy = false;
    pool.cancel();
}

function cacheSet(key, g) {
    cache.delete(key);
    cache.set(key, g);
    while (cache.size > 3) cache.delete(cache.keys().next().value);
}

/** Fill a fine grid from the nearest sample of a coarse one (exact where nodes coincide; a preview elsewhere). */
function inheritFrom(g, parent) {
    const N = g.N, No = parent.N, src = parent.data, dst = g.data, ls = parent.label, ld = g.label;
    const io = new Int32Array(N);
    for (let i = 0; i < N; i++) io[i] = Math.round((i * No) / N) % No;
    for (let j = 0; j < N; j++) {
        const jo = Math.min(No - 1, Math.floor(((j + 0.5) * No) / N));
        for (let i = 0; i < N; i++) {
            const k = j * N + i, ko = jo * No + io[i];
            ld[k] = ls[ko];
            const s = ko * NF, t = k * NF;
            for (let f = 0; f < NF; f++) dst[t + f] = src[s + f];
        }
    }
}

function merge(g, job, d) {
    const N = g.N, base = job.j0 * N;
    if (!job.mask) {
        g.label.set(d.label, base);
        g.data.set(d.data, base * NF);
        return;
    }
    const m = job.mask;
    for (let k = 0; k < m.length; k++) {
        if (!m[k]) continue;
        g.label[base + k] = d.label[k];
        const s = k * NF, t = (base + k) * NF;
        for (let f = 0; f < NF; f++) g.data[t + f] = d.data[s + f];
    }
}

/** Run all tiles of g (skipping samples reused exactly from parent). */
async function runGrid(g, parent, key) {
    const token = ++S.token;
    S.busy = true;
    g.key = key;
    const N = g.N, rows = Math.max(1, Math.floor(2048 / N)), jobs = [];
    let total = 0;
    const colOk = parent ? Uint8Array.from({length: N}, (_, i) => ((i * parent.N) % N === 0 ? 1 : 0)) : null;
    for (let j0 = 0; j0 < N; j0 += rows) {
        const j1 = Math.min(N, j0 + rows);
        let mask = null, count = (j1 - j0) * N;
        if (parent) {
            mask = new Uint8Array(count).fill(1);
            for (let j = j0; j < j1; j++) {
                if (exactParent(0, j, N, parent.N) < 0) continue;
                for (let i = 0; i < N; i++) if (colOk[i]) {
                    mask[(j - j0) * N + i] = 0;
                    count--;
                }
            }
            if (!count) continue;
        }
        total += count;
        jobs.push({tileId: jobs.length, p: g.meta, j0, j1, mask, count});
    }
    jobs.sort((a, b) => Math.abs(a.j0 - N / 2) - Math.abs(b.j0 - N / 2));
    const byId = new Map(jobs.map((j) => [j.tileId, j]));
    const reused = N * N - total;
    const what = parent ? `refine ${parent.N}² → ${N}²` : `compute ${N}²`;
    const suffix = reused ? ` (${reused} reused)` : '';
    S.grid = g;
    updateButtons();
    refresh();
    setProgress(0, `${what}: 0%${suffix}`);
    const t0 = performance.now();
    let done = 0;
    const ok = await pool.submit(jobs, (d) => {
        const job = byId.get(d.tileId);
        merge(g, job, d);
        done += job.count;
        setProgress(done / Math.max(1, total), `${what}: ${((100 * done) / Math.max(1, total)).toFixed(1)}%${suffix}`);
        scheduleRefresh();
    });
    if (token !== S.token) return; // superseded by a newer computation
    S.busy = false;
    if (!ok) {
        if (parent) S.grid = parent;
        setProgress(0, parent ? `refinement cancelled (kept ${parent.N}²)` : 'cancelled');
        refresh();
        updateButtons();
        return;
    }
    postprocess(g);
    g.complete = true;
    cacheSet(key, g);
    refresh();
    updateButtons();
    const counts = {};
    for (const l of g.label) counts[l] = (counts[l] || 0) + 1;
    setProgress(1, `${N}² done in ${((performance.now() - t0) / 1000).toFixed(1)} s${suffix}\n` +
        Object.entries(counts).map(([l, c]) => `${LABEL_NAME[l]}: ${c}`).join('  '));
    if (S.sel) pickAt(S.sel.a, S.sel.b);
}

function clearSelection() {
    S.sel = null;
    S.traj = false;
    phys.setTrajectory(null);
    man.setCross(null);
}

async function compute() {
    const err = validate();
    if (err) {
        setProgress(0, `invalid parameters: ${err}`);
        return;
    }
    abortRunning();
    const p = params();
    writeHash();
    phys.setSystem(p, S.lps);
    clearSelection();
    const key = JSON.stringify({...p, N: 0, v: CORE_VERSION});
    S.key = key;
    const hit = cache.get(key);
    if (hit && hit.N >= p.N) {
        S.grid = hit;
        refresh();
        updateButtons();
        setProgress(1, `cached (${hit.N}²)`);
        return;
    }
    await runGrid(createGrid(p), null, key);
}

async function refine() {
    if (S.busy) return; // guard against repeated clicks
    const parent = S.grid, Nn = parent?.complete ? nextN(parent.N) : null;
    if (!Nn) return;
    const bytes = Nn * Nn * (NF * 4 + 1 + 6 * 4);
    if (bytes > 1e9 && !confirm(`Refining to ${Nn}² needs roughly ${(bytes / 1e9).toFixed(1)} GB of memory and may take a long time. Continue?`)) return;
    S.busy = true;
    const token = ++S.token;
    updateButtons();
    setProgress(0, `preparing ${Nn}²…`);
    await new Promise((r) => setTimeout(r, 30)); // let the UI paint
    if (token !== S.token) return;
    let g;
    try {
        g = createGrid({...parent.meta, N: Nn});
        inheritFrom(g, parent);
    } catch (e) {
        console.error(e);
        S.busy = false;
        updateButtons();
        setProgress(0, `cannot allocate ${Nn}² (out of memory)`);
        return;
    }
    await runGrid(g, parent, parent.key ?? S.key);
}

// ---- selection / inspector
/** Inspector rows: [text, tooltip]. */
function setInspector(rows) {
    const pre = $('inspector');
    pre.replaceChildren();
    for (const [text, tip] of rows) {
        const s = document.createElement('span');
        s.textContent = text;
        if (tip) s.dataset.tip = tip;
        pre.append(s, '\n');
    }
}

function pickIndex(i, j) {
    const g = S.grid;
    if (!g) return;
    const [a, b] = xiAt(i, j, g.N), p = g.meta, k = j * g.N + i;
    S.sel = {a, b};
    const r = propagate(a, b, p, {withSTM: false, record: true});
    man.setCross(a, b);
    if (r.sIn) {
        const vIn = {at: r.sIn, v: inertialVel(r.sIn)};
        const vOut = r.exitY ? {at: [r.exitY[0], r.exitY[1]], v: inertialVel(r.exitY)} : null;
        phys.setTrajectory({pts: r.traj}, vIn, vOut);
        S.traj = true;
    } else {
        phys.setTrajectory(null);
        S.traj = false;
    }
    const rows = [
        [`α = ${deg(a)}°  β = ${deg(b)}°`, 'Nearest grid node. α = entry position angle on the ρ circle about its centre (from +x); β = entry velocity angle from the inward normal (β > 0 prograde).'],
        [`node (${i}, ${j}) of ${g.N}²${g.complete ? '' : ' (computing)'}`, 'Grid index. Arrow keys step the selection: ←/→ in α (wrapping), ↑/↓ in β. Hold shift for larger steps.'],
        [`label = ${LABEL_NAME[g.label[k]]}`, LABEL_DESC[g.label[k]]],
    ];
    for (let f = 0; f < NF; f++) {
        const v = g.data[k * NF + f];
        if (Number.isFinite(v)) rows.push([`${FIELD_NAMES[f].padEnd(12)} ${v.toPrecision(6)}`, FIELD_DESC[FIELD_NAMES[f]]]);
    }
    if (g.post) for (const n of ['H00', 'H01', 'H11', 'detH', 'sig', 'asym']) {
        const v = g.post[n][k];
        if (Number.isFinite(v)) rows.push([`${n.padEnd(12)} ${v.toPrecision(6)}`, FIELD_DESC[n]]);
    }
    const pc = patchedConicPredict(a, b, p);
    if (pc) rows.push(
        ['— patched conic —', 'Classical two-body prediction about the circle centre for the same entry state, with the centre velocity frozen at the entry instant. Compare it with the full CR3BP values above.'],
        [`δ_pc         ${pc.delta.toPrecision(6)}`, 'Patched-conic deflection of the relative velocity, signed by the sense of the flyby: sin(δ/2) = 1/√(1 + b²u⁴/μ²).'],
        [`ΔE_pc        ${pc.dE.toPrecision(6)}`, 'Patched-conic energy change V_c · Δv.'],
        [`b            ${pc.b.toPrecision(6)}`, 'Impact parameter of the relative velocity about the circle centre.'],
    );
    setInspector(rows);
    request();
}

function pickAt(alpha, beta) {
    const g = S.grid;
    if (!g) return;
    const [i, j] = nearestIndex(alpha, beta, g.N);
    pickIndex(i, j);
}

window.addEventListener('keydown', (e) => {
    if (!S.sel || !S.grid) return;
    const t = e.target;
    if (t instanceof Element && t.closest('input, select, textarea')) return;
    const d = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1]}[e.key];
    if (!d) return;
    e.preventDefault();
    const N = S.grid.N, [i, j] = nearestIndex(S.sel.a, S.sel.b, N);
    const step = e.shiftKey ? Math.max(1, Math.round(N / 32)) : 1;
    const ni = (((i + d[0] * step) % N) + N) % N;
    const nj = Math.min(N - 1, Math.max(0, j + d[1] * step));
    pickIndex(ni, nj);
});

function ringValue(g, i, mode) {
    let acc = mode === 'max' ? -Infinity : mode === 'min' ? Infinity : 0, cnt = 0;
    for (let j = 0; j < g.N; j++) {
        const k = j * g.N + i;
        if (!isExitLabel(g.label[k])) continue;
        const v = g.data[k * NF + F.dE];
        if (!Number.isFinite(v)) continue;
        cnt++;
        acc = mode === 'max' ? Math.max(acc, v) : mode === 'min' ? Math.min(acc, v) : acc + v;
    }
    return cnt ? (mode === 'mean' ? acc / cnt : acc) : null;
}

// ---- hover readouts
function manifoldTip(e, h) {
    const [a, b] = man.toWorld(h.u, h.v);
    if (!(a >= 0 && a < TWO_PI && Math.abs(b) < Math.PI / 2)) {
        hideTip();
        return;
    }
    const lines = [`α = ${deg(a)}°  (entry position on the ρ circle)`, `β = ${deg(b)}°  (entry angle from inward normal${b > 0 ? ', prograde' : b < 0 ? ', retrograde' : ''})`];
    const g = S.grid;
    if (g) {
        const [i, j] = nearestIndex(a, b, g.N), k = j * g.N + i, l = g.label[k];
        lines.push(`outcome: ${LABEL_SHORT[l]}`);
        const L = SCALAR_LAYERS[$('scalar').value];
        const val = (f) => g.data[k * NF + F[f]];
        if (L.field) {
            const v = val(L.field);
            if (Number.isFinite(v)) lines.push(`${L.name}: ${v.toPrecision(5)}`);
        } else if (L.post && g.post) {
            const v = g.post[L.post][k];
            if (Number.isFinite(v)) lines.push(L.post === 'sig' ? `signature: ${SIG_DESC[v].short}` : `${L.name}: ${v.toPrecision(5)}`);
        }
        if (isExitLabel(l)) {
            if ($('showQuiver').checked) lines.push(`Δv_I = (${val('dvx').toPrecision(4)}, ${val('dvy').toPrecision(4)})`);
            if ($('showStream').checked) lines.push(`∇ΔE = (${val('gA').toPrecision(4)}, ${val('gB').toPrecision(4)})`);
            if ($('showGlyph').checked) lines.push(`δ_eff = ${deg(val('deltaEff'))}°  s₁ = ${val('s1').toPrecision(4)}  s₂ = ${val('s2').toPrecision(4)}${val('flip') ? '  (flip)' : ''}`);
        }
    }
    lines.push('', 'click: integrate & inspect · drag: pan · wheel: zoom');
    if (S.sel) lines.push('arrow keys: step the selection (shift: larger steps)');
    showTip(e.clientX, e.clientY, lines.join('\n'));
}

function physTip(e, h) {
    const p = phys.p;
    if (!p || !S.lps) return;
    const [x, y] = phys.toWorld(h.u, h.v);
    const wpp = (2 * phys.hh) / h.h, C = phys.uniforms.C.value;
    const dpx = (px, py) => Math.hypot(x - px, y - py) / wpp;
    const lines = [];
    if (dpx(-p.mu, 0) < 8) lines.push('P1 — primary, mass 1 − μ, at (−μ, 0)');
    if (dpx(1 - p.mu, 0) < 8) lines.push('P2 — secondary, mass μ, at (1 − μ, 0)');
    for (const L of S.lps) if (dpx(L.x, L.y) < 8) {
        lines.push(`${L.name} — Lagrange point (equilibrium in the rotating frame)`,
            `C_${L.name} = ${L.C.toFixed(5)}: ${C < L.C ? 'open' : 'closed'} at the current C`);
    }
    const cx = p.cx ?? 1 - p.mu;
    const rc = Math.hypot(x - cx, y), r1 = Math.hypot(x + p.mu, y), r2 = Math.hypot(x - 1 + p.mu, y), tol = 4 * wpp;
    if (Math.abs(rc - p.rho) < tol) lines.push(`encounter circle Σ (radius ρ = ${p.rho.toExponential(3)} about ${CENTER_NAME[p.center] ?? 'P2'}): entry and exit states`);
    else if (Math.abs(rc - p.rhoFar) < tol) lines.push(`outer circle ρ_far = ${p.rhoFar.toExponential(3)}: encounter complete when reached`);
    else if (Math.abs(r2 - p.Rbody) < tol) lines.push(`surface of P2 (R₂ = ${p.Rbody.toExponential(3)}): collision threshold`);
    else if (p.R1 > 0 && Math.abs(r1 - p.R1) < tol) lines.push(`surface of P1 (R₁ = ${p.R1.toExponential(3)}): collision threshold`);
    else if ($('showRing').checked && S.grid && rc > 1.04 * p.rho && rc < 1.3 * p.rho) {
        let a = Math.atan2(y, x - cx);
        if (a < 0) a += TWO_PI;
        const g = S.grid, i = Math.round(a / (TWO_PI / g.N)) % g.N, mode = $('ringReduce').value;
        const rv = ringValue(g, i, mode);
        lines.push(`ΔE ring at α = ${deg(a)}°: ${mode} over β = ${rv == null ? 'no exits' : rv.toPrecision(4)}`);
    }
    if (lines.length) lines.push('');
    const om = omega(x, y, p.mu), z = 2 * om - C;
    lines.push(`x = ${x.toFixed(5)}  y = ${y.toFixed(5)}`,
        `r_Σ = ${rc.toPrecision(4)}  (${(rc / p.rho).toFixed(2)} ρ)   r₁ = ${r1.toPrecision(4)}  r₂ = ${r2.toPrecision(4)}`,
        `Ω = ${om.toPrecision(6)}`,
        z >= 0 ? `|v|² = 2Ω − C = ${z.toPrecision(4)}  (accessible)` : `2Ω − C = ${z.toPrecision(4)} < 0  (forbidden at this C)`);
    if (S.traj) lines.push('', 'picked trajectory: yellow → blue with time;', 'green arrow = inertial v_in, red arrow = inertial v_out');
    showTip(e.clientX, e.clientY, lines.join('\n'));
}

/** Pan / zoom / click / hover handling for a view canvas. */
function interact(canvas, R, view, {onClick, onHover}) {
    let drag = null;
    canvas.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        drag = {x: e.clientX, y: e.clientY, moved: false};
        canvas.setPointerCapture(e.pointerId);
        hideTip();
    });
    canvas.addEventListener('pointermove', (e) => {
        if (!drag) {
            onHover?.(e, R.hit(e));
            return;
        }
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
        if (drag.moved) {
            const h = R.hit(e);
            view.pan(dx / h.w, dy / h.h);
            drag.x = e.clientX;
            drag.y = e.clientY;
            R.request();
        }
    });
    canvas.addEventListener('pointerup', (e) => {
        if (drag && !drag.moved) onClick?.(R.hit(e));
        drag = null;
    });
    canvas.addEventListener('pointercancel', () => (drag = null));
    canvas.addEventListener('pointerleave', hideTip);
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const h = R.hit(e);
        view.zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, h.u, h.v);
        R.request();
        onHover?.(e, h);
    }, {passive: false});
}

interact($('view'), RP, phys, {onHover: physTip});
interact($('mview'), RM, man, {
    onHover: manifoldTip,
    onClick: (h) => {
        const [a, b] = man.toWorld(h.u, h.v);
        if (a >= 0 && a < TWO_PI && Math.abs(b) < Math.PI / 2) pickAt(a, b);
    },
});

// ---- events
$('system').onchange = () => {
    if ($('system').value !== 'custom') fillPreset($('system').value);
    if (onSystem(false)) compute();
};
for (const id of ['mu', 'Lkm', 'R1km', 'R2km']) $(id).onchange = () => {
    $('system').value = 'custom';
    if (onSystem(true)) compute();
};
for (const id of ['center', 'rhoFactor', 'kFar']) $(id).onchange = () => {
    if (onSystem(true)) compute();
};
$('C').oninput = () => setC($('C').value);
$('C').onchange = () => compute();
$('Cnum').onchange = () => {
    setC($('Cnum').value);
    compute();
};
$('Cpreset').onchange = () => {
    const v = $('Cpreset').value;
    $('Cpreset').value = '';
    if (!v || !S.lps) return;
    setC(cPreset(v));
    compute();
};
$('run').onclick = () => {
    if (!S.busy) compute();
};
$('refine').onclick = () => refine();
$('cancel').onclick = () => pool.cancel();
$('scalar').onchange = () => {
    updateScalarTip();
    refresh();
    writeHash();
};
for (const id of ['showQuiver', 'showStream', 'showGlyph', 'showRing', 'ringReduce']) $(id).onchange = refresh;
$('showPot').onchange = () => {
    phys.uniforms.showPot.value = +$('showPot').checked;
    RP.request();
};
$('showZvc').onchange = () => {
    phys.uniforms.showZvc.value = +$('showZvc').checked;
    RP.request();
};
$('fitSys').onclick = () => {
    phys.fitSystem();
    RP.request();
};
$('fitSec').onclick = () => {
    phys.fitCircle();
    RP.request();
};
$('fitMan').onclick = () => {
    man.fit();
    RM.request();
};

function savePng(R, canvas, name) {
    R.draw();
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = name;
    a.click();
}

$('png').onclick = () => savePng(RP, $('view'), 'slingshot-physical.png');
$('pngMan').onclick = () => savePng(RM, $('mview'), 'slingshot-manifold.png');
$('bin').onclick = () => {
    const g = S.grid;
    if (!g) return;
    const header = new TextEncoder().encode(JSON.stringify({
        meta: g.meta,
        fields: FIELD_NAMES,
        dtype: 'float32',
        complete: g.complete,
        version: CORE_VERSION
    }) + '\n');
    const blob = new Blob([header, g.label, g.data.buffer]);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'encounter-grid.bin';
    a.click();
};

// ---- boot
$('N').value = String(DEFAULTS.N);
$('center').value = DEFAULTS.center;
const hashC = readHash();
updateScalarTip();
updateButtons();
if (onSystem(false)) {
    if (hashC != null) setC(hashC, false);
    compute();
}