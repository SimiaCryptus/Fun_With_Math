import {SYSTEMS} from './config/systems.js';
import {DEFAULTS} from './config/defaults.js';
import {lagrangePoints} from './core/lagrange.js';
import {CORE_VERSION, hillRadius, isExitLabel, LABEL} from './core/conventions.js';
import {createGrid, F, FIELD_NAMES, nearestIndex, NF, xiAt} from './core/grid.js';
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
const S = {grid: null, lps: null, sel: null, traj: false};

for (const [k, s] of Object.entries(SYSTEMS)) $('system').add(new Option(s.name, k));
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

function params() {
    const sys = SYSTEMS[$('system').value];
    const rho = hillRadius(sys.mu) * +$('rhoFactor').value;
    return {
        system: $('system').value, mu: sys.mu, C: +$('Cnum').value, rho, rhoFar: rho * +$('kFar').value,
        Rbody: sys.Rbody, T: +$('T').value, rtol: +$('rtol').value, atol: +$('rtol').value, N: +$('N').value,
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

function onSystem(keepC) {
    const p = params();
    S.lps = lagrangePoints(p.mu);
    const [L1, L2, L3] = S.lps;
    $('muInfo').textContent = `μ = ${p.mu}\nρ = ${p.rho.toExponential(4)}  R_body = ${p.Rbody.toExponential(3)}`;
    $('Cticks').textContent = `C_L1 = ${L1.C.toFixed(5)}  C_L2 = ${L2.C.toFixed(5)}\nC_L3 = ${L3.C.toFixed(5)}  C_L4,5 = ${S.lps[3].C.toFixed(5)}`;
    $('C').min = L3.C - 0.05;
    $('C').max = L1.C + 0.05;
    document.querySelectorAll('[data-preset]').forEach((b) => {
        b.dataset.tip = `${PRESET_DESC[b.dataset.preset]}\nC = ${cPreset(b.dataset.preset).toFixed(5)}`;
    });
    if (!keepC) setC(cPreset('l1open'), false);
    phys.setSystem(params(), S.lps);
    phys.fitSecondary();
    request();
}

function writeHash(p) {
    const q = new URLSearchParams({
        system: p.system, C: p.C, rhoFactor: $('rhoFactor').value, kFar: $('kFar').value,
        N: p.N, T: p.T, rtol: p.rtol, layer: $('scalar').value
    });
    history.replaceState(null, '', '#' + q);
}

function readHash() {
    const q = new URLSearchParams(location.hash.slice(1));
    for (const id of ['system', 'rhoFactor', 'kFar', 'N', 'T', 'rtol']) if (q.has(id)) $(id).value = q.get(id);
    if (q.has('layer') && SCALAR_LAYERS[q.get('layer')]) $('scalar').value = q.get('layer');
    return q.has('C') ? +q.get('C') : null;
}

let refreshTimer = null;
const scheduleRefresh = () => {
    if (!refreshTimer) refreshTimer = setTimeout(() => {
        refreshTimer = null;
        refresh();
    }, 150);
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

async function compute() {
    const p = params();
    writeHash(p);
    phys.setSystem(p, S.lps);
    phys.setTrajectory(null);
    S.traj = false;
    man.setCross(null);
    const key = JSON.stringify({...p, v: CORE_VERSION});
    if (cache.has(key)) {
        S.grid = cache.get(key);
        refresh();
        $('progress').textContent = 'cached';
        return;
    }
    const passes = p.N > 64 ? [64, p.N] : [p.N];
    const t0 = performance.now();
    for (const N of passes) {
        const g = createGrid({...p, N});
        S.grid = g;
        const rows = Math.max(1, Math.floor(2048 / N)), jobs = [];
        for (let j0 = 0; j0 < N; j0 += rows) jobs.push({
            tileId: jobs.length,
            p: {...p, N},
            j0,
            j1: Math.min(N, j0 + rows)
        });
        jobs.sort((a, b) => Math.abs(a.j0 - N / 2) - Math.abs(b.j0 - N / 2));
        let done = 0;
        const ok = await pool.submit(jobs, (d) => {
            g.label.set(d.label, d.j0 * N);
            g.data.set(d.data, d.j0 * N * NF);
            done += d.j1 - d.j0;
            $('progress').textContent = `pass ${N}²: ${((100 * done) / N).toFixed(0)}%`;
            scheduleRefresh();
        });
        if (!ok) {
            $('progress').textContent = 'cancelled';
            return;
        }
        postprocess(g);
        refresh();
    }
    cache.set(key, S.grid);
    const g = S.grid, counts = {};
    for (const l of g.label) counts[l] = (counts[l] || 0) + 1;
    $('progress').textContent = `done in ${((performance.now() - t0) / 1000).toFixed(1)} s\n` +
        Object.entries(counts).map(([l, c]) => `${LABEL_NAME[l]}: ${c}`).join('  ');
}

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

function pick(alpha, beta) {
    const g = S.grid;
    if (!g) return;
    const [i, j] = nearestIndex(alpha, beta, g.N), [a, b] = xiAt(i, j, g.N), p = g.meta, k = j * g.N + i;
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
        [`α = ${deg(a)}°  β = ${deg(b)}°`, 'Nearest grid node. α = entry position angle on the ρ circle around P2 (from +x); β = entry velocity angle from the inward normal (β > 0 prograde).'],
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
        ['— patched conic —', 'Classical two-body prediction for the same entry state, with the velocity of P2 frozen at the entry instant. Compare it with the full CR3BP values above.'],
        [`δ_pc         ${pc.delta.toPrecision(6)}`, 'Patched-conic deflection of the relative velocity, signed by the sense of the flyby: sin(δ/2) = 1/√(1 + b²u⁴/μ²).'],
        [`ΔE_pc        ${pc.dE.toPrecision(6)}`, 'Patched-conic energy change V_P · Δv.'],
        [`b            ${pc.b.toPrecision(6)}`, 'Impact parameter of the relative velocity about P2.'],
    );
    setInspector(rows);
    request();
}

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
    const x2 = 1 - p.mu, r2 = Math.hypot(x - x2, y), tol = 4 * wpp;
    if (Math.abs(r2 - p.rho) < tol) lines.push(`encounter circle Σ (radius ρ = ${p.rho.toExponential(3)}): entry and exit states`);
    else if (Math.abs(r2 - p.rhoFar) < tol) lines.push(`outer circle ρ_far = ${p.rhoFar.toExponential(3)}: encounter complete when reached`);
    else if (Math.abs(r2 - p.Rbody) < tol) lines.push(`surface of P2 (R_body = ${p.Rbody.toExponential(3)}): collision threshold`);
    else if ($('showRing').checked && S.grid && r2 > 1.04 * p.rho && r2 < 1.3 * p.rho) {
        let a = Math.atan2(y, x - x2);
        if (a < 0) a += TWO_PI;
        const g = S.grid, i = Math.round(a / (TWO_PI / g.N)) % g.N, mode = $('ringReduce').value;
        const rv = ringValue(g, i, mode);
        lines.push(`ΔE ring at α = ${deg(a)}°: ${mode} over β = ${rv == null ? 'no exits' : rv.toPrecision(4)}`);
    }
    if (lines.length) lines.push('');
    const om = omega(x, y, p.mu), z = 2 * om - C;
    lines.push(`x = ${x.toFixed(5)}  y = ${y.toFixed(5)}`,
        `r₂ = ${r2.toPrecision(4)}  (${(r2 / p.rho).toFixed(2)} ρ)`,
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
        if (a >= 0 && a < TWO_PI && Math.abs(b) < Math.PI / 2) pick(a, b);
    },
});

// ---- events
$('system').onchange = () => onSystem(false);
$('C').oninput = () => setC($('C').value);
$('C').onchange = () => compute();
$('Cnum').onchange = () => {
    setC($('Cnum').value);
    compute();
};
document.querySelectorAll('[data-preset]').forEach((b) => (b.onclick = () => {
    setC(cPreset(b.dataset.preset));
    compute();
}));
$('run').onclick = compute;
$('cancel').onclick = () => pool.cancel();
$('scalar').onchange = () => {
    updateScalarTip();
    refresh();
    if (S.grid) writeHash(S.grid.meta);
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
    phys.fitSecondary();
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
const hashC = readHash();
updateScalarTip();
onSystem(false);
if (hashC != null) setC(hashC, false);
compute();