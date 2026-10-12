import {SYSTEMS} from './config/systems.js';
import {DEFAULTS} from './config/defaults.js';
import {lagrangePoints} from './core/lagrange.js';
import {centerOf, CORE_VERSION, hillRadius, isExitLabel} from './core/conventions.js';
import {
    coordAt, createGrid, F, FIELD_NAMES, FULL_DOMAIN, inDomain, nearestIndex, nextN, NF,
    parentX, parentY, SHIP_DOMAIN, windowDomain,
} from './core/grid.js';
import {postprocess} from './core/differential.js';
import {propagate, seed} from './core/encounter.js';
import {inertialEnergy, inertialVel, jacobi, keplerE1, omega} from './core/cr3bp.js';
import {patchedConicPredict} from './core/patchedConic.js';
import {fmtEnergy, fmtLen, fmtTime, fmtVel, unitsOf} from './core/units.js';
import {applyImpulse, BasisWalker, propagateShip, SHIP_PRESETS, shipPath} from './core/ship.js';
import {WorkerPool} from './compute/workerPool.js';
import {ViewRenderer} from './render/renderer.js';
import {PhysicalView} from './render/physicalView.js';
import {ManifoldView} from './render/manifoldView.js';
import {colorize, ringColors, SCALAR_LAYERS, setPlotTheme} from './render/colormaps.js';
import {installPanels} from './ui/panels.js';
import {hideTip, installTips, showTip} from './ui/tips.js';
import {cssColor, onThemeChange, populateThemeSelect, setTheme} from './ui/theme.js';
import {renderLegend} from './ui/legend.js';
import {
    FIELD_DESC, LABEL_DESC, LABEL_SHORT, PRESET_DESC, SHIP_LABEL_DESC, SHIP_LABEL_SHORT, SIG_DESC,
} from './ui/descriptions.js';

const $ = (id) => document.getElementById(id);
const TWO_PI = 2 * Math.PI;
const deg = (r) => ((r * 180) / Math.PI).toFixed(2);
const CENTER_NAME = {secondary: 'P2', primary: 'P1', barycentre: 'the barycentre'};
const PARAM_IDS = ['mu', 'Lkm', 'R1km', 'R2km', 'GMkm', 'center', 'rhoFactor', 'kFar', 'N', 'T', 'rtol',
      'mode', 'shipPreset', 'shipDv', 'shipSpan', 'viewN', 'ringReduce', 'relief3d'];
/** Checkbox options persisted in the URL. */
const CHECK_IDS = ['showPot', 'showZvc', 'showRing', 'showQuiver', 'showStream', 'showGlyph', 'show3d', 'inertial'];

installPanels();
installTips();
const phys = new PhysicalView(), man = new ManifoldView();
const RP = new ViewRenderer($('view'), phys);
const RM = new ViewRenderer($('mview'), man);
phys.init3D($('view'), () => RP.request());
const request = () => {
    RP.request();
    RM.request();
};
const pool = new WorkerPool(new URL('./compute/encounterWorker.js', import.meta.url));
const cache = new Map();
// ---- theme
/** Palette key → CSS custom property (css/app-tokens.css). */
const PLOT_TOKENS = {
    bg: '--color-plot-bg', bg2: '--color-plot-bg-2', line: '--color-plot-line', forbid: '--color-plot-forbid',
    zvc: '--color-plot-zvc', nodata: '--color-plot-nodata',
    p1: '--color-plot-p1', p2: '--color-plot-p2', lagrange: '--color-plot-lagrange',
    rho: '--color-plot-rho', rhoFar: '--color-plot-rho-far', body: '--color-plot-body', body1: '--color-plot-body1',
    trajStart: '--color-plot-traj-start', trajEnd: '--color-plot-traj-end',
    vin: '--color-plot-vin', vout: '--color-plot-vout', basis: '--color-plot-basis', ship: '--color-plot-ship',
    journey: '--color-plot-journey', burn: '--color-plot-burn',
    frame: '--color-plot-frame', cross: '--color-plot-cross', inset: '--color-plot-inset',
    stream: '--color-plot-stream', glyph: '--color-plot-glyph', glyphFlip: '--color-plot-glyph-flip',
    tick: '--color-plot-tick',
};
/** Set once the app state exists (the first applyPalette runs before it). */
let booted = false;
function applyPalette() {
     const pal = {};
     for (const [k, tok] of Object.entries(PLOT_TOKENS)) {
         const v = cssColor(tok, null);
         if (v) pal[k] = v;
     }
     phys.setPalette(pal);
     man.setBackground(pal.bg2);
     man.setPalette(pal);
     setPlotTheme(pal);
     if (booted) refresh(); // recolour the map image, legend and ring for the new theme
     request();
}
populateThemeSelect($('theme'));
$('theme').onchange = () => setTheme($('theme').value);
onThemeChange(applyPalette);
applyPalette();

/**
 * busy: a computation/refinement is running (viewRunning: it is the viewport-locked grid).
 * token: bumps on every start/abort so stale awaits bail out.
 * view: viewport-locked refinement grid (or null). ship: {s0, origin} in spaceship mode.
 */
const S = {
    grid: null, view: null, key: null, lps: null, sel: null, traj: false, busy: false, viewRunning: false, token: 0,
     mode: 'encounter', ship: null, shipHist: [], basisPts: null,
     selTraj: null, // trajectory display args of the selection (restored after a ctrl preview)
     hover: null,   // [a, b] under the cursor on the manifold, or null
};
/** Ctrl + hover live orbit preview. */
const PV = {on: false, at: null, raf: 0, src: null, p: null};
const isShip = () => S.mode === 'ship';
const labelTables = () => (isShip()
    ? {short: SHIP_LABEL_SHORT, desc: SHIP_LABEL_DESC}
    : {short: LABEL_SHORT, desc: LABEL_DESC});

for (const [k, s] of Object.entries(SYSTEMS)) $('system').add(new Option(s.name, k));
$('system').add(new Option('Custom', 'custom'));
for (const [k, L] of Object.entries(SCALAR_LAYERS)) {
    const o = new Option(L.name, k);
    o.title = L.desc;
    $('scalar').add(o);
}
$('scalar').value = 'dE';
for (const [k, s] of Object.entries(SHIP_PRESETS)) $('shipPreset').add(new Option(s.name, k));

function updateScalarTip() {
    const L = SCALAR_LAYERS[$('scalar').value];
    $('scalar').dataset.tip = `Which per-sample quantity colours the map.\n\nCurrent — ${L.name}: ${L.desc}`;
}

// ---- system parameters
function fillPreset(key) {
    const s = SYSTEMS[key];
    if (!s) return;
    $('mu').value = s.mu;
    $('Lkm').value = s.L;
    $('R1km').value = s.R1;
    $('R2km').value = s.R2;
    $('GMkm').value = s.GM;
}
/** Physical units of the system currently entered in the System panel (or null). */
const curUnits = () => unitsOf({L: +$('Lkm').value, GM: +$('GMkm').value});
/** Physical-unit hints next to T, |Δv| and the path span. */
function updateUnitHints() {
    const U = curUnits();
    if (!U) {
        $('Tphys').textContent = '';
        $('shipPhys').textContent = '';
        return;
    }
    const T = +$('T').value, dv = +$('shipDv').value, span = +$('shipSpan').value;
    $('Tphys').textContent = Number.isFinite(T) && T > 0
        ? `T ≈ ${fmtTime(T, U)}  (${(T / TWO_PI).toFixed(2)} rev)` : '';
    $('shipPhys').textContent =
        (Number.isFinite(dv) ? `|Δv| ≈ ${fmtVel(dv, U)}` : '') +
        (Number.isFinite(span) && span > 0 ? `   span ≈ ${fmtTime(span, U)}` : '');
}


function validate() {
    const mu = +$('mu').value, L = +$('Lkm').value, R1 = +$('R1km').value, R2 = +$('R2km').value;
    if (!(mu > 0 && mu <= 0.5)) return 'μ must lie in (0, 0.5]';
    if (!(L > 0)) return 'L must be > 0';
    if (!(R1 >= 0) || !(R2 >= 0)) return 'radii must be ≥ 0';
    if (!(+$('GMkm').value > 0)) return 'GM must be > 0';
    if (!(+$('rhoFactor').value > 0)) return 'ρ / r_H must be > 0';
    if (!(+$('kFar').value > 1)) return 'k_far must be > 1';
    if (!(+$('T').value > 0)) return 'T must be > 0';
    if (isShip()) {
        if (!(+$('shipDv').value >= 0)) return '|Δv| must be ≥ 0';
        if (!(+$('shipSpan').value > 0)) return 'path span must be > 0';
    }
    return null;
}

function params() {
    const mu = +$('mu').value, L = +$('Lkm').value, center = $('center').value;
    const {cx, m} = centerOf(center, mu);
    const rho = hillRadius(mu) * +$('rhoFactor').value;
    const p = {
        system: $('system').value, mode: 'encounter', dom: FULL_DOMAIN,
        mu, L, R1: +$('R1km').value / L, Rbody: +$('R2km').value / L,
        GM: +$('GMkm').value,
        center, cx, mc: m,
        C: +$('Cnum').value, rho, rhoFar: rho * +$('kFar').value,
        T: +$('T').value, rtol: +$('rtol').value, atol: +$('rtol').value, N: +$('N').value,
    };
    if (isShip() && S.ship) {
        p.mode = 'ship';
        p.dom = SHIP_DOMAIN;
        p.C = jacobi(S.ship.s0, mu);
        p.ship = {s0: Array.from(S.ship.s0), dv: +$('shipDv').value, span: +$('shipSpan').value};
    }
    return p;
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

// ---- spaceship state
function resetShipState() {
    const mu = +$('mu').value;
    let key = $('shipPreset').value;
    if (!SHIP_PRESETS[key]) key = Object.keys(SHIP_PRESETS)[0];
    S.ship = {s0: SHIP_PRESETS[key].make(mu), origin: SHIP_PRESETS[key].name};
    S.shipHist = [];
}

/** Show/hide mode-specific UI and switch the manifold domain. */
function syncMode() {
    const ship = isShip(), dom = ship ? SHIP_DOMAIN : FULL_DOMAIN;
    $('p-ship').style.display = ship ? '' : 'none';
     $('p-journey').style.display = ship ? '' : 'none';
    for (const id of ['C', 'Cnum', 'Cpreset']) $(id).disabled = ship;
    if (man.dom !== dom) {
        S.grid = null;
        S.view = null;
        man.setDomain(dom);
        if (phys.p) phys.setRing(null, 0, false);
    }
    const ttl = document.querySelector('#p-manifold .ttl');
    if (ttl) ttl.textContent = ship ? 'Burn manifold (t along path, θ)' : 'Encounter manifold (α, β)';
    if (!ship) {
        S.basisPts = null;
        phys.setBasis(null);
         phys.setJourney(null);
    }
    updateButtons();
}

/** Recompute the basis path, C and the ship readout. */
function updateShip() {
    if (!isShip() || !S.ship) {
        S.basisPts = null;
        phys.setBasis(null);
        $('shipInfo').textContent = '';
         updateJourney();
        updateButtons();
        return;
    }
    const p = params(), s = S.ship.s0;
    setC(p.C, false);
    const tb = [];
    S.basisPts = shipPath(s, p, 800, tb);
    phys.setBasis(S.basisPts, tb);
    $('shipInfo').textContent =
        `${S.ship.origin}\n` +
        `(x, y) = (${s[0].toFixed(5)}, ${s[1].toFixed(5)})\n` +
        `(ẋ, ẏ) = (${s[2].toFixed(5)}, ${s[3].toFixed(5)})\n` +
        `C = ${p.C.toFixed(6)}   E = ${inertialEnergy(s, p.mu).toFixed(6)}\n` +
        `burns flown: ${S.shipHist.length}`;
     updateJourney();
    updateButtons();
    RP.request();
}
// ---- journey (spaceship move history)
/** All states of the journey: the start, then the state after every burn (the last one is current). */
const journeyLegs = () => (S.ship ? [...S.shipHist, S.ship] : []);
const fmtS = (v) => (v >= 0 ? '+' : '') + v.toPrecision(4);
/** Rebuild the journey stats, the move history list and the flown-path overlay. */
function updateJourney() {
     const list = $('journeyList');
     list.replaceChildren();
     if (!isShip() || !S.ship) {
         $('journeyStats').textContent = '';
         phys.setJourney(null);
         return;
     }
     const mu = +$('mu').value, legs = journeyLegs(), E = (s) => inertialEnergy(s, mu);
     const U = curUnits();
     let dvTot = 0, time = 0, eBurn = 0, eCoast = 0, nBurns = 0, r1min = Infinity, r2min = Infinity;
     const trails = [];
     // Total mission time up to the current state (t = 0 of the inertial display).
     const total = legs.reduce((s, l, k) => s + (k && l.burn ? l.burn.t : 0), 0);
     legs.forEach((leg, k) => {
         const b = leg.burn, li = document.createElement('li');
         if (k === 0 || !b) {
             li.textContent = `${k}. start — ${leg.origin}\n   C ${jacobi(leg.s0, mu).toFixed(6)}  E ${E(leg.s0).toFixed(6)}`;
         } else {
             const coast = b.Ebefore - E(legs[k - 1].s0), burnE = b.Eafter - b.Ebefore;
             nBurns++;
             dvTot += b.dv;
             time += b.t;
             eBurn += burnE;
             eCoast += coast;
             for (let q = 0; q < b.trail.length; q += 2) {
                 const x = b.trail[q], y = b.trail[q + 1];
                 r1min = Math.min(r1min, Math.hypot(x + mu, y));
                 r2min = Math.min(r2min, Math.hypot(x - 1 + mu, y));
             }
             const t0 = time - b.t - total; // start of this leg, relative to the current state
             trails.push({pts: b.trail, t: b.trailT ? b.trailT.map((v) => v + t0) : null});
             li.textContent = `${k}. T+${time.toFixed(3)}${U ? ` (${fmtTime(time, U)})` : ''}  θ ${deg(b.theta)}°\n` +
                 `   |Δv| ${b.dv}${U ? ` (${fmtVel(b.dv, U)})` : ''}\n` +
                 `   ΔE coast ${fmtS(coast)}  burn ${fmtS(burnE)}\n` +
                 `   C ${b.Cbefore.toFixed(5)} → ${b.Cafter.toFixed(5)}`;
         }
         if (k === legs.length - 1) {
             li.className = 'cur';
             li.dataset.tip = 'Current state of the ship (start of the cyan path).';
         } else {
             li.dataset.tip = k === 0
                 ? 'Click to return to the start of the journey (later burns are discarded).'
                 : 'Click to return to the state right after this burn (later burns are discarded).';
             li.onclick = () => shipRestore(k);
         }
         list.append(li);
     });
     const s0 = legs[0].s0, s1 = S.ship.s0, E0 = E(s0), E1 = E(s1), K1 = keplerE1(s1, mu);
     const lines = [
         `burns ${nBurns}   total |Δv| ${dvTot.toPrecision(4)}${U ? ` (${fmtVel(dvTot, U)})` : ''}`,
         `mission time ${time.toFixed(3)}  (${(time / TWO_PI).toFixed(2)} rev${U ? `, ${fmtTime(time, U)}` : ''})`,
         `E  ${E0.toFixed(6)} → ${E1.toFixed(6)}  (${fmtS(E1 - E0)})`,
         `   from burns ${fmtS(eBurn)}   from gravity ${fmtS(eCoast)}`,
     ];
     if (dvTot > 0) lines.push(`   gravity ΔE per unit |Δv| ${(eCoast / dvTot).toPrecision(3)}`);
     lines.push(`C  ${jacobi(s0, mu).toFixed(6)} → ${jacobi(s1, mu).toFixed(6)}`);
     if (Number.isFinite(r2min)) lines.push(`closest  r₂ ${r2min.toExponential(3)}  r₁ ${r1min.toExponential(3)}`);
     if (Number.isFinite(r2min) && U) lines.push(`         r₂ ${fmtLen(r2min, U)}  r₁ ${fmtLen(r1min, U)}  (centre distances)`);
     lines.push(`about P1: ${K1 < 0 ? 'bound' : 'unbound (escape)'}  (E₁ = ${K1.toPrecision(4)})`);
     $('journeyStats').textContent = lines.join('\n');
     phys.setJourney(trails);
}
/** Jump back to journey state k (discarding later burns). */
function shipRestore(k) {
     const legs = journeyLegs();
     if (!isShip() || k < 0 || k >= legs.length - 1) return;
     S.shipHist = legs.slice(0, k);
     S.ship = legs[k];
     clearSelection();
     updateShip();
     compute();
}


/** Re-derive everything that depends on the system parameters. Returns false if they are invalid. */
function onSystem(keepC, resetShip = false) {
    const err = validate();
    if (err) {
        $('muInfo').textContent = `⚠ ${err}`;
        return false;
    }
    const p0 = params();
    S.lps = lagrangePoints(p0.mu);
    const [L1, L2, L3] = S.lps;
    const cBodyR = p0.center === 'primary' ? p0.R1 : p0.center === 'secondary' ? p0.Rbody : 0;
    const U = unitsOf(p0), rH = hillRadius(p0.mu);
    $('muInfo').textContent =
        `r_H = ${rH.toExponential(4)}  (${fmtLen(rH, U)})\n` +
        `ρ = ${p0.rho.toExponential(4)}  (${fmtLen(p0.rho, U)})\n` +
        `R₁ = ${p0.R1.toExponential(3)}  R₂ = ${p0.Rbody.toExponential(3)}  (units of L)\n` +
        `time unit ${fmtTime(1, U)} · period 2π = ${fmtTime(TWO_PI, U)}\n` +
        `velocity unit ${fmtVel(1, U)} · energy unit ${fmtEnergy(1, U)}\n` +
        `Σ centred on ${CENTER_NAME[p0.center]} at x = ${p0.cx.toFixed(6)}` +
        (cBodyR >= p0.rho ? '\n⚠ ρ lies inside the central body: every entry collides' : '');
    updateUnitHints();
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
    if (isShip()) {
        if (resetShip || !S.ship) resetShipState();
    } else if (!keepC) setC(cPreset('l1open'), false);
    const p = params();
    phys.setSystem(p, S.lps);
    updateShip();
    if (isShip() && S.basisPts) phys.fitBasis(); else phys.fitCircle();
    request();
    return true;
}

function writeHash() {
     clearTimeout(hashTimer);
     hashTimer = null;
    const q = new URLSearchParams({system: $('system').value, C: $('Cnum').value, layer: $('scalar').value});
    for (const id of PARAM_IDS) q.set(id, $(id).value);
     for (const id of CHECK_IDS) q.set(id, $(id).checked ? '1' : '0');
     q.set('pv', [phys.cx, phys.cy, phys.hh].map((v) => String(+v.toPrecision(10))).join(','));
     if (isShip() && S.ship) q.set('ship', Array.from(S.ship.s0).map(String).join(','));
    history.replaceState(null, '', '#' + q);
}
let hashTimer = null;
/** Debounced URL update (pan/zoom, display toggles). */
function scheduleHash() {
     if (!hashTimer) hashTimer = setTimeout(writeHash, 300);
}


function readHash() {
    const q = new URLSearchParams(location.hash.slice(1));
    if (q.has('system')) $('system').value = q.get('system');
    if (!$('system').value) $('system').value = DEFAULTS.system;
    if ($('system').value !== 'custom') fillPreset($('system').value);
    for (const id of PARAM_IDS) if (q.has(id)) $(id).value = q.get(id);
    if (!$('N').value) $('N').value = String(DEFAULTS.N);
    if (!$('center').value) $('center').value = DEFAULTS.center;
    if (!$('mode').value) $('mode').value = 'encounter';
    if (!$('shipPreset').value) $('shipPreset').value = Object.keys(SHIP_PRESETS)[0];
    if (!$('viewN').value) $('viewN').value = '256';
    if (!(+$('GMkm').value > 0)) $('GMkm').value = String(SYSTEMS[DEFAULTS.system].GM);
    if (q.has('layer') && SCALAR_LAYERS[q.get('layer')]) $('scalar').value = q.get('layer');
     if (!$('ringReduce').value) $('ringReduce').value = 'mean';
     for (const id of CHECK_IDS) if (q.has(id)) $(id).checked = q.get(id) === '1';
     const nums = (k, n) => {
         if (!q.has(k)) return null;
         const v = q.get(k).split(',').map(Number);
         return v.length === n && v.every(Number.isFinite) ? v : null;
     };
     const C = q.has('C') && Number.isFinite(+q.get('C')) ? +q.get('C') : null;
     let view = nums('pv', 3);
     if (view && !(view[2] > 0)) view = null;
     return {C, view, ship: nums('ship', 4)};
}

function setPhysView([cx, cy, hh]) {
     phys.cx = cx;
     phys.cy = cy;
     phys.hh = hh;
     phys.updateCam();
     RP.request();
}

// ---- rendering
let refreshTimer = null;
const scheduleRefresh = () => {
    if (refreshTimer) return;
    const N = Math.max(S.grid?.N ?? 0, S.view?.N ?? 0);
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
    if (S.view) {
        // Same colour scale as the base map, so the inset blends in.
        const v = colorize(S.view, key, range);
        man.setInset(v.rgba, S.view.N, S.view.dom);
    } else man.clearInset();
    renderLegend($('legend'), key, range, labelTables());
    man.setOverlays(g, {
        quiver: $('showQuiver').checked,
        stream: $('showStream').checked,
        glyph: $('showGlyph').checked
    }, S.view);
    phys.setRing(isShip() ? null : ringColors(g, $('ringReduce').value), g.N, $('showRing').checked);
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
    $('refineView').disabled = S.busy || !g?.complete;
    $('dismissView').disabled = !S.view;
    $('run').disabled = S.busy;
    $('cancel').disabled = !S.busy;
    $('shipGo').disabled = !isShip() || !S.sel || !g;
    $('shipBack').disabled = !isShip() || !S.shipHist.length;
    $('toShip').disabled = isShip() || !S.sel || !g;
    document.body.classList.toggle('busy', S.busy);
}

function abortRunning() {
    if (!S.busy) return;
    S.token++;
    S.busy = false;
    S.viewRunning = false;
    pool.cancel();
}

function cacheSet(key, g) {
    cache.delete(key);
    cache.set(key, g);
    while (cache.size > 3) cache.delete(cache.keys().next().value);
}

/** Fill a fine grid from the nearest sample of a coarse one over the same domain (exact where nodes coincide). */
function inheritFrom(g, parent) {
    const N = g.N, No = parent.N, dom = g.dom, src = parent.data, dst = g.data, ls = parent.label, ld = g.label;
    const io = new Int32Array(N);
    for (let i = 0; i < N; i++) {
        io[i] = dom.xNodes ? Math.round((i * No) / N) % No : Math.min(No - 1, Math.floor(((i + 0.5) * No) / N));
    }
    for (let j = 0; j < N; j++) {
        const jo = Math.min(No - 1, Math.floor(((j + 0.5) * No) / N));
        for (let i = 0; i < N; i++) {
            const k = j * N + i, ko = jo * No + io[i];
            ld[k] = ls[ko];
            dst.set(src.subarray(ko * NF, ko * NF + NF), k * NF);
        }
    }
}

/** Preview of a window grid from the nearest base sample (any domains). */
function previewFrom(g, base) {
    const N = g.N;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const [a, b] = coordAt(i, j, N, g.dom), [io, jo] = nearestIndex(a, b, base.N, base.dom);
        const k = j * N + i, ko = jo * base.N + io;
        g.label[k] = base.label[ko];
        g.data.set(base.data.subarray(ko * NF, ko * NF + NF), k * NF);
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

/** Run all tiles of g (skipping samples reused exactly from parent). view: g is the viewport-locked grid. */
async function runGrid(g, parent, key, {view = false} = {}) {
    const token = ++S.token;
    S.busy = true;
    S.viewRunning = view;
    g.key = key;
    const N = g.N, dom = g.dom, rows = Math.max(1, Math.floor(2048 / N)), jobs = [];
    let total = 0;
    const colOk = parent ? Uint8Array.from({length: N}, (_, i) => (parentX(i, N, parent.N, dom) >= 0 ? 1 : 0)) : null;
    for (let j0 = 0; j0 < N; j0 += rows) {
        const j1 = Math.min(N, j0 + rows);
        let mask = null, count = (j1 - j0) * N;
        if (parent) {
            mask = new Uint8Array(count).fill(1);
            for (let j = j0; j < j1; j++) {
                if (parentY(j, N, parent.N) < 0) continue;
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
    const what = view ? `view ${N}²` : parent ? `refine ${parent.N}² → ${N}²` : `compute ${N}²`;
    const suffix = reused ? ` (${reused} reused)` : '';
    if (view) S.view = g; else S.grid = g;
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
    S.viewRunning = false;
    if (!ok) {
        if (view) S.view = null; else if (parent) S.grid = parent;
        setProgress(0, view ? 'view refinement cancelled' : parent ? `refinement cancelled (kept ${parent.N}²)` : 'cancelled');
        refresh();
        updateButtons();
        return;
    }
    postprocess(g);
    g.complete = true;
    if (!view) cacheSet(key, g);
    refresh();
    updateButtons();
    const counts = {}, names = labelTables().short;
    for (const l of g.label) counts[l] = (counts[l] || 0) + 1;
    setProgress(1, `${what} done in ${((performance.now() - t0) / 1000).toFixed(1)} s${suffix}\n` +
        Object.entries(counts).map(([l, c]) => `${names[l]}: ${c}`).join('  '));
    if (S.sel) pickAt(S.sel.a, S.sel.b);
}

function clearSelection() {
    S.sel = null;
     S.selTraj = null;
     if (!PV.on) showOrbit(null);
    man.setCross(null);
    updateButtons();
}

/** Remove the viewport-locked grid (and optionally zoom back out). */
function dismissView(fit = true) {
    if (S.busy && S.viewRunning) {
        abortRunning();
        setProgress(0, 'view refinement cancelled');
    }
    const had = !!S.view;
    S.view = null;
    man.clearInset();
    if (fit) {
        man.fit();
        RM.request();
    }
    if (had) refresh();
    updateButtons();
}

async function compute() {
    const err = validate();
    if (err) {
        setProgress(0, `invalid parameters: ${err}`);
        return;
    }
    dismissView(false);
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

/** Compute a grid locked to the currently visible window of the manifold. */
async function refineView() {
    if (S.busy) return;
    const base = S.grid;
    if (!base?.complete) return;
    const b = man.viewBounds(), d = base.dom;
    const x0 = Math.max(d.x0, b.x0), x1 = Math.min(d.x1, b.x1), y0 = Math.max(d.y0, b.y0), y1 = Math.min(d.y1, b.y1);
    if (!(x1 > x0 && y1 > y0)) {
        setProgress(0, 'the view does not overlap the map');
        return;
    }
    if ((x1 - x0) / (d.x1 - d.x0) > 0.98 && (y1 - y0) / (d.y1 - d.y0) > 0.98) {
        setProgress(0, 'zoom in first (use “Refine” for the whole map)');
        return;
    }
    const g = createGrid({...base.meta, N: +$('viewN').value, dom: windowDomain(x0, x1, y0, y1)});
    previewFrom(g, base);
    await runGrid(g, null, null, {view: true});
}

// ---- spaceship navigation
let walkerCache = null;
/** Basis state at map coordinate x. Reuses the forward walk while x does not decrease (fast hover). */
function basisStateAt(p, x) {
     const t = Math.max(0, (x / TWO_PI) * p.ship.span);
     const c = walkerCache;
     if (!c || c.p !== p || c.w.dead || c.w.t > t) walkerCache = {p, w: new BasisWalker(p.ship.s0, p)};
     return walkerCache.w.at(t);
}

function navigate() {
    if (!isShip() || !S.sel || !S.grid) return;
    const p = S.grid.meta, sb = basisStateAt(p, S.sel.a);
    if (!sb) {
        setProgress(0, 'the current path collides before that burn point');
        return;
    }
    const t = (S.sel.a / TWO_PI) * p.ship.span;
     const {sPost, dv} = applyImpulse(sb, S.sel.b, p.ship.dv, p.mu);
     // The leg actually flown: the basis path from its start up to the burn point.
     const trailT = [];
     const trail = shipPath(p.ship.s0, {...p, ship: {...p.ship, span: t}}, Math.max(32, Math.min(1500, Math.ceil(t * 120))), trailT);
     const burn = {
         t, theta: S.sel.b, dv: p.ship.dv, dvVec: dv, at: [sb[0], sb[1]],
         Ebefore: inertialEnergy(sb, p.mu), Eafter: inertialEnergy(sPost, p.mu),
         Cbefore: jacobi(sb, p.mu), Cafter: jacobi(sPost, p.mu), trail, trailT,
     };
    S.shipHist.push(S.ship);
     S.ship = {s0: sPost, origin: `after burn at t = ${t.toFixed(3)}, θ = ${deg(S.sel.b)}°, |Δv| = ${p.ship.dv}`, burn};
    clearSelection();
    updateShip();
    compute();
}

function shipBack() {
    if (!isShip() || !S.shipHist.length) return;
    S.ship = S.shipHist.pop();
    clearSelection();
    updateShip();
    compute();
}

// ---- selection / inspector
/** Integrate entry/burn (a, b) under grid parameters p for display. */
function integrateOrbit(p, a, b) {
     if (p.mode === 'ship') {
         const sb = basisStateAt(p, a);
         const t0 = Math.max(0, (a / TWO_PI) * p.ship.span);
         return {sb, t0, r: sb ? propagateShip(sb, b, p, {withSTM: false, record: true}) : null};
     }
     const r = propagate(a, b, p, {withSTM: false, record: true});
     return {sb: null, t0: 0, r: r.sIn ? r : null};
}
/** Arguments for phys.setTrajectory, or null. Times are relative to t = 0 of the display (t0 = start of the orbit). */
const orbitArgs = ({r, t0 = 0}) => (r ? [
     {pts: r.traj, t: r.trajT ? r.trajT.map((v) => v + t0) : null},
     {at: r.sIn, v: inertialVel(r.sIn), t: t0},
     r.exitY ? {at: [r.exitY[0], r.exitY[1]], v: inertialVel(r.exitY), t: t0 + r.exitY[20]} : null,
] : null);
function showOrbit(args) {
     if (args) phys.setTrajectory(...args); else phys.setTrajectory(null);
     S.traj = !!args;
     RP.request();
}
/** Preview parameters: a looser tolerance keeps the live orbit responsive. */
function previewParams(meta) {
     if (PV.src !== meta) {
         const tol = Math.max(meta.rtol ?? 1e-12, 1e-10);
         PV.src = meta;
         PV.p = {...meta, rtol: tol, atol: Math.max(meta.atol ?? 1e-12, tol)};
     }
     return PV.p;
}
/** Show the orbit under the cursor (at most one integration per animation frame). */
function previewAt(a, b) {
     PV.at = [a, b];
     PV.on = true;
     if (PV.raf) return;
     PV.raf = requestAnimationFrame(() => {
         PV.raf = 0;
         if (!PV.on || !PV.at) return;
         const [pa, pb] = PV.at, g = gridAt(pa, pb);
         if (!g) return;
         showOrbit(orbitArgs(integrateOrbit(previewParams(g.meta), pa, pb)));
     });
}
/** Stop the live preview and restore the selected trajectory. */
function endPreview() {
     if (!PV.on) return;
     PV.on = false;
     PV.at = null;
     showOrbit(S.selTraj);
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

/** The grid that covers (a, b): the locked view if it contains the point, else the base grid. */
function gridAt(a, b) {
    if (S.view && inDomain(S.view.dom, a, b)) return S.view;
    return S.grid;
}

function pickIndex(g, i, j) {
    if (!g) return;
    const [a, b] = coordAt(i, j, g.N, g.dom), p = g.meta, k = j * g.N + i;
    const tables = labelTables(), inView = g === S.view;
    S.sel = {a, b};
    man.setCross(a, b);
     const orb = integrateOrbit(p, a, b), {r, sb} = orb;
     S.selTraj = orbitArgs(orb);
     if (!PV.on) showOrbit(S.selTraj);
    let rows;
    if (p.mode === 'ship') {
         const t = (a / TWO_PI) * p.ship.span;
        rows = [
            [`t = ${t.toFixed(4)}  θ = ${deg(b)}°`, 'Burn point: time along the current path, and impulse direction θ from the rotating-frame velocity (0° prograde, ±180° retrograde, +90° to the left).'],
            [`node (${i}, ${j}) of ${g.N}²${inView ? ' (locked view)' : ''}${g.complete ? '' : ' (computing)'}`, 'Grid index. Arrow keys step the selection: ←/→ along the path, ↑/↓ in θ. Hold shift for larger steps.'],
            [`label = ${tables.short[g.label[k]]}`, tables.desc[g.label[k]]],
        ];
        if (r && sb) rows.push(
            [`Δv_R         (${(r.sIn[2] - sb[2]).toPrecision(4)}, ${(r.sIn[3] - sb[3]).toPrecision(4)})`, 'Impulse vector in rotating-frame components.'],
            [`ΔE_burn      ${(inertialEnergy(r.sIn, p.mu) - inertialEnergy(sb, p.mu)).toPrecision(6)}`, 'Inertial energy added directly by the impulse (the field ΔE below is the gravitational exchange during the coast).'],
            [`C_after      ${r.C.toFixed(6)}`, 'Jacobi constant of the post-burn orbit.'],
        );
        if (!sb) rows.push(['current path collides before this point', 'No burn is possible after the basis trajectory has hit a body.']);
    } else {
        rows = [
            [`α = ${deg(a)}°  β = ${deg(b)}°`, 'Nearest grid node. α = entry position angle on the ρ circle about its centre (from +x); β = entry velocity angle from the inward normal (β > 0 prograde).'],
            [`node (${i}, ${j}) of ${g.N}²${inView ? ' (locked view)' : ''}${g.complete ? '' : ' (computing)'}`, 'Grid index. Arrow keys step the selection: ←/→ in α, ↑/↓ in β. Hold shift for larger steps.'],
            [`label = ${tables.short[g.label[k]]}`, tables.desc[g.label[k]]],
        ];
    }
    for (let f = 0; f < NF; f++) {
        const v = g.data[k * NF + f];
        if (Number.isFinite(v)) rows.push([`${FIELD_NAMES[f].padEnd(12)} ${v.toPrecision(6)}`, FIELD_DESC[FIELD_NAMES[f]]]);
    }
    if (g.post) for (const n of ['H00', 'H01', 'H11', 'detH', 'sig', 'asym']) {
        const v = g.post[n][k];
        if (Number.isFinite(v)) rows.push([`${n.padEnd(12)} ${v.toPrecision(6)}`, FIELD_DESC[n]]);
    }
    const U = unitsOf(p);
    if (U) {
        const fv = (f) => g.data[k * NF + F[f]];
        const pr = [];
        if (p.mode === 'ship') pr.push([`|Δv| burn    ${fmtVel(p.ship.dv, U)}`, 'Impulse magnitude in physical units.']);
        if (Number.isFinite(fv('tau'))) pr.push([`τ            ${fmtTime(fv('tau'), U)}`, 'Time of flight (coast horizon in spaceship mode) in physical time.']);
        if (Number.isFinite(fv('dE'))) pr.push([`ΔE           ${fmtEnergy(fv('dE'), U)}`, 'Specific inertial energy change (km²/s² = MJ/kg).']);
        if (Number.isFinite(fv('dvx')) && Number.isFinite(fv('dvy'))) {
            pr.push([`|Δv_I|       ${fmtVel(Math.hypot(fv('dvx'), fv('dvy')), U)}`, 'Magnitude of the inertial velocity change across the encounter / coast.']);
        }
        if (Number.isFinite(fv('rPeri'))) pr.push([`r_peri       ${fmtLen(fv('rPeri'), U)}`, 'Closest approach to the centre of the encounter circle.']);
        if (Number.isFinite(fv('rMin2'))) pr.push([`r₂,min       ${fmtLen(fv('rMin2'), U)}`, 'Closest approach to the centre of P2.']);
        if (pr.length) rows.push(['— physical units —', `Conversions with L = ${U.L} km and GM = ${U.GM} km³/s² (time unit ${fmtTime(1, U)}, velocity unit ${fmtVel(1, U)}).`], ...pr);
    }
    if (p.mode === 'ship') {
        rows.push(['— press Navigate to fly this burn —', 'The post-burn orbit becomes your new path and the map is replotted around it.']);
    } else {
        const pc = patchedConicPredict(a, b, p);
        if (pc) rows.push(
            ['— patched conic —', 'Classical two-body prediction about the circle centre for the same entry state, with the centre velocity frozen at the entry instant. Compare it with the full CR3BP values above.'],
            [`δ_pc         ${pc.delta.toPrecision(6)}`, 'Patched-conic deflection of the relative velocity, signed by the sense of the flyby: sin(δ/2) = 1/√(1 + b²u⁴/μ²).'],
            [`ΔE_pc        ${pc.dE.toPrecision(6)}`, 'Patched-conic energy change V_c · Δv.'],
            [`b            ${pc.b.toPrecision(6)}`, 'Impact parameter of the relative velocity about the circle centre.'],
        );
    }
    setInspector(rows);
    updateButtons();
    request();
}

function pickAt(a, b) {
    const g = gridAt(a, b);
    if (!g) return;
    const [i, j] = nearestIndex(a, b, g.N, g.dom);
    pickIndex(g, i, j);
}

window.addEventListener('keydown', (e) => {
    if (!S.sel || !S.grid) return;
    const t = e.target;
    if (t instanceof Element && t.closest('input, select, textarea')) return;
    const d = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1]}[e.key];
    if (!d) return;
    e.preventDefault();
    const g = gridAt(S.sel.a, S.sel.b), N = g.N, [i, j] = nearestIndex(S.sel.a, S.sel.b, N, g.dom);
    const step = e.shiftKey ? Math.max(1, Math.round(N / 32)) : 1;
    const ni = g.dom.periodicX
        ? (((i + d[0] * step) % N) + N) % N
        : Math.min(N - 1, Math.max(0, i + d[0] * step));
    const nj = Math.min(N - 1, Math.max(0, j + d[1] * step));
    pickIndex(g, ni, nj);
});
// Ctrl held over the manifold: live orbit preview.
window.addEventListener('keydown', (e) => {
     if (e.key === 'Control' && !e.repeat && S.hover && S.grid) previewAt(S.hover[0], S.hover[1]);
});
window.addEventListener('keyup', (e) => {
     if (e.key === 'Control') endPreview();
});
window.addEventListener('blur', endPreview);

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
     const [a, b] = man.toWorld(h.u, h.v), inside = inDomain(man.dom, a, b);
     S.hover = inside ? [a, b] : null;
     if (inside && e.ctrlKey && S.grid) previewAt(a, b); else endPreview();
     if (!inside) {
        hideTip();
        return;
    }
    let lines;
    if (isShip()) {
        const span = S.grid?.meta.ship?.span ?? +$('shipSpan').value;
        const tt = (a / TWO_PI) * span, U = curUnits();
        lines = [`t = ${tt.toFixed(4)}${U ? ` ≈ ${fmtTime(tt, U)}` : ''}  (time along the current path)`,
            `θ = ${deg(b)}°  (impulse direction from velocity${Math.abs(b) < 0.1 ? ', prograde' : Math.abs(b) > 3.04 ? ', retrograde' : ''})`];
    } else {
        lines = [`α = ${deg(a)}°  (entry position on the ρ circle)`, `β = ${deg(b)}°  (entry angle from inward normal${b > 0 ? ', prograde' : b < 0 ? ', retrograde' : ''})`];
    }
    const g = gridAt(a, b);
    if (g) {
        const [i, j] = nearestIndex(a, b, g.N, g.dom), k = j * g.N + i, l = g.label[k];
        lines.push(`outcome: ${labelTables().short[l]}${g === S.view ? '  (locked view)' : ''}`);
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
    lines.push('', 'click: integrate & inspect · drag: pan · wheel: zoom', 'zoom in + “Refine view”: sharper grid locked to the window');
     lines.push(PV.on ? 'ctrl held: live orbit shown in the physical view' : 'hold ctrl: live orbit preview in the physical view');
    if (S.sel) lines.push('arrow keys: step the selection (shift: larger steps)');
    showTip(e.clientX, e.clientY, lines.join('\n'));
}

function physTip(e, h) {
    const p = phys.p;
    if (!p || !S.lps) return;
    const [x, y] = phys.toWorld(h.u, h.v);
     if (!Number.isFinite(x) || !Number.isFinite(y)) {
         hideTip();
         return;
     }
     const wpp = phys.worldPerPixel(h.h), C = phys.uniforms.C.value;
    const dpx = (px, py) => Math.hypot(x - px, y - py) / wpp;
    const lines = [];
    if (dpx(-p.mu, 0) < 8) lines.push('P1 — primary, mass 1 − μ, at (−μ, 0)');
    if (dpx(1 - p.mu, 0) < 8) lines.push('P2 — secondary, mass μ, at (1 − μ, 0)');
    if (isShip() && S.basisPts && dpx(S.basisPts[0], S.basisPts[1]) < 8) lines.push('ship — current state (start of the cyan path)');
    for (const L of phys.inertial ? [] : S.lps) if (dpx(L.x, L.y) < 8) {
        lines.push(`${L.name} — Lagrange point (equilibrium in the rotating frame)`,
            `C_${L.name} = ${L.C.toFixed(5)}: ${C < L.C ? 'open' : 'closed'} at the current C`);
    }
    const cx = p.cx ?? 1 - p.mu;
    const rc = Math.hypot(x - cx, y), r1 = Math.hypot(x + p.mu, y), r2 = Math.hypot(x - 1 + p.mu, y), tol = 4 * wpp;
    if (Math.abs(rc - p.rho) < tol) lines.push(`encounter circle Σ (radius ρ = ${p.rho.toExponential(3)} about ${CENTER_NAME[p.center] ?? 'P2'}): entry and exit states`);
    else if (Math.abs(rc - p.rhoFar) < tol) lines.push(`outer circle ρ_far = ${p.rhoFar.toExponential(3)}: encounter complete when reached`);
    else if (Math.abs(r2 - p.Rbody) < tol) lines.push(`surface of P2 (R₂ = ${p.Rbody.toExponential(3)}): collision threshold`);
    else if (p.R1 > 0 && Math.abs(r1 - p.R1) < tol) lines.push(`surface of P1 (R₁ = ${p.R1.toExponential(3)}): collision threshold`);
    else if (phys.inertial && Math.abs(Math.hypot(x, y) - (1 - p.mu)) < tol) lines.push('orbit of P2 about the barycentre (radius 1 − μ, period 2π)');
    else if (phys.inertial && Math.abs(Math.hypot(x, y) - p.mu) < tol) lines.push('orbit of P1 about the barycentre (radius μ, period 2π)');
    else if (!isShip() && $('showRing').checked && S.grid && rc > 1.04 * p.rho && rc < 1.3 * p.rho) {
        let a = Math.atan2(y, x - cx);
        if (a < 0) a += TWO_PI;
        const g = S.grid, i = Math.round(a / (TWO_PI / g.N)) % g.N, mode = $('ringReduce').value;
        const rv = ringValue(g, i, mode);
        lines.push(`ΔE ring at α = ${deg(a)}°: ${mode} over β = ${rv == null ? 'no exits' : rv.toPrecision(4)}`);
    }
    if (lines.length) lines.push('');
    if (phys.inertial) {
        lines.push(`X = ${x.toFixed(5)}  Y = ${y.toFixed(5)}  (inertial, axes of t = 0)`,
            `r = ${Math.hypot(x, y).toPrecision(4)} from the barycentre`,
            `r_Σ = ${rc.toPrecision(4)}  r₁ = ${r1.toPrecision(4)}  r₂ = ${r2.toPrecision(4)}  (bodies at t = 0)`);
    } else {
        const om = omega(x, y, p.mu), z = 2 * om - C;
        lines.push(`x = ${x.toFixed(5)}  y = ${y.toFixed(5)}`,
            `r_Σ = ${rc.toPrecision(4)}  (${(rc / p.rho).toFixed(2)} ρ)   r₁ = ${r1.toPrecision(4)}  r₂ = ${r2.toPrecision(4)}`,
            `Ω = ${om.toPrecision(6)}`,
            z >= 0 ? `|v|² = 2Ω − C = ${z.toPrecision(4)}  (accessible)` : `2Ω − C = ${z.toPrecision(4)} < 0  (forbidden at this C)`);
    }
    if (isShip()) lines.push('', 'cyan = current path of the ship (the map’s basis)');
    if (S.traj) lines.push('', isShip() ? 'picked burn: post-burn coast, yellow → blue with time;' : 'picked trajectory: yellow → blue with time;',
        'green arrow = inertial v_in, red arrow = inertial v_out');
    showTip(e.clientX, e.clientY, lines.join('\n'));
}

/** Pan / zoom / click / hover handling for a view canvas. */
function interact(canvas, R, view, {onClick, onHover, onView}) {
    let drag = null;
    canvas.addEventListener('pointerdown', (e) => {
         if (view.is3D) {
             // Orbit controls own the gestures in 3D; only suppress the hover readout while dragging.
             drag = {orbit: true, moved: true};
             hideTip();
             return;
         }
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
         if (drag.orbit) return;
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
        if (drag.moved) {
            const h = R.hit(e);
            view.pan(dx / h.w, dy / h.h);
            drag.x = e.clientX;
            drag.y = e.clientY;
            R.request();
             onView?.();
        }
    });
    canvas.addEventListener('pointerup', (e) => {
        if (drag && !drag.moved) onClick?.(R.hit(e));
        drag = null;
    });
    canvas.addEventListener('pointercancel', () => (drag = null));
    canvas.addEventListener('pointerleave', hideTip);
    canvas.addEventListener('wheel', (e) => {
         if (view.is3D) {
             hideTip();
             return;
         }
        e.preventDefault();
        const h = R.hit(e);
        view.zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, h.u, h.v);
        R.request();
         onView?.();
        onHover?.(e, h);
    }, {passive: false});
}

interact($('view'), RP, phys, {onHover: physTip, onView: scheduleHash});
interact($('mview'), RM, man, {
    onHover: manifoldTip,
    onClick: (h) => {
        const [a, b] = man.toWorld(h.u, h.v);
        if (inDomain(man.dom, a, b)) pickAt(a, b);
    },
});
$('mview').addEventListener('pointerleave', () => {
     S.hover = null;
     endPreview();
});

// ---- events
$('system').onchange = () => {
    if ($('system').value !== 'custom') fillPreset($('system').value);
    if (onSystem(false, true)) compute();
};
for (const id of ['mu', 'Lkm', 'R1km', 'R2km', 'GMkm']) $(id).onchange = () => {
    $('system').value = 'custom';
    if (onSystem(true, true)) compute();
};
for (const id of ['T', 'shipDv', 'shipSpan']) $(id).addEventListener('input', updateUnitHints);
for (const id of ['center', 'rhoFactor', 'kFar']) $(id).onchange = () => {
    if (onSystem(true)) compute();
};
$('mode').onchange = () => {
    S.mode = $('mode').value === 'ship' ? 'ship' : 'encounter';
    dismissView(false);
    abortRunning();
    syncMode();
    clearSelection();
    if (onSystem(true)) compute();
};
$('toShip').onclick = () => {
    if (isShip() || !S.sel || !S.grid) return;
    const p = S.grid.meta, s = seed(S.sel.a, S.sel.b, p.C, p.mu, p.rho, p.cx);
    if (!s) return;
    S.ship = {s0: s, origin: `Σ entry α = ${deg(S.sel.a)}°, β = ${deg(S.sel.b)}°`};
    S.shipHist = [];
    $('mode').value = 'ship';
    S.mode = 'ship';
    dismissView(false);
    abortRunning();
    syncMode();
    clearSelection();
    if (onSystem(true)) compute();
};
$('shipPreset').onchange = () => {
    if (!isShip()) return;
    resetShipState();
    clearSelection();
    updateShip();
    if (S.basisPts) phys.fitPoints(S.basisPts);
    compute();
};
$('shipReset').onclick = () => $('shipPreset').onchange();
$('shipDv').onchange = () => {
    if (isShip()) compute();
};
$('shipSpan').onchange = () => {
    if (!isShip()) return;
    updateShip();
    compute();
};
$('shipGo').onclick = () => navigate();
$('shipBack').onclick = () => shipBack();
$('fitShip').onclick = () => {
    if (S.basisPts) phys.fitBasis();
    RP.request();
     scheduleHash();
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
    if (!v || !S.lps || isShip()) return;
    setC(cPreset(v));
    compute();
};
$('run').onclick = () => {
    if (!S.busy) compute();
};
$('refine').onclick = () => refine();
$('refineView').onclick = () => refineView();
$('dismissView').onclick = () => dismissView(true);
$('cancel').onclick = () => pool.cancel();
$('scalar').onchange = () => {
    updateScalarTip();
    refresh();
    writeHash();
};
for (const id of ['showQuiver', 'showStream', 'showGlyph', 'showRing', 'ringReduce']) $(id).onchange = () => {
     refresh();
     scheduleHash();
};
$('showPot').onchange = () => {
    applyFrame();
     scheduleHash();
};
$('showZvc').onchange = () => {
    applyFrame();
     scheduleHash();
};
/** Rotating vs inertial display: the potential layers and the relief only exist in the rotating frame. */
function applyFrame() {
    const on = $('inertial').checked;
    phys.setFrame(on);
    phys.uniforms.showPot.value = +($('showPot').checked && !on);
    phys.uniforms.showZvc.value = +($('showZvc').checked && !on);
    for (const id of ['showPot', 'showZvc', 'show3d', 'relief3d']) $(id).disabled = on;
    RP.request();
}
$('inertial').onchange = () => {
    applyFrame();
    apply3D();
    scheduleHash();
};
function apply3D() {
     const k = +$('relief3d').value;
     phys.setRelief(Number.isFinite(k) && k >= 0 ? k : 1);
     phys.set3D($('show3d').checked && !phys.inertial);
     $('physCap').textContent = phys.inertial
         ? 'inertial (non-rotating) frame about the barycentre, axes of t = 0 — primaries shown at t = 0 on their orbits · drag to pan · wheel to zoom'
         : phys.is3D
             ? 'rotating frame, 3D relief (height ∝ −Ω) — hover for readout · drag to orbit · right-drag to pan · wheel to zoom'
             : 'rotating frame (x, y) about the barycentre — hover for readout · drag to pan · wheel to zoom';
     RP.request();
}
$('show3d').onchange = () => {
     apply3D();
     scheduleHash();
};
$('relief3d').onchange = () => {
     apply3D();
     scheduleHash();
};
$('journeyExport').onclick = () => {
     const legs = journeyLegs();
     if (!isShip() || !legs.length) return;
     const log = {
         mu: +$('mu').value, start: Array.from(legs[0].s0), origin: legs[0].origin,
         burns: legs.slice(1).map((l) => {
             const {trail, trailT, ...b} = l.burn ?? {};
             return {...b, sAfter: Array.from(l.s0)};
         }),
     };
     const a = document.createElement('a');
     a.href = URL.createObjectURL(new Blob([JSON.stringify(log, null, 2)], {type: 'application/json'}));
     a.download = 'journey.json';
     a.click();
};
$('fitSys').onclick = () => {
    phys.fitSystem();
    RP.request();
     scheduleHash();
};
$('fitSec').onclick = () => {
    phys.fitCircle();
    RP.request();
     scheduleHash();
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
const hash = readHash();
S.mode = $('mode').value === 'ship' ? 'ship' : 'encounter';
if (hash.ship) S.ship = {s0: hash.ship, origin: 'shared state (from link)'};
applyFrame();
syncMode();
updateScalarTip();
updateButtons();
if (onSystem(false, !hash.ship)) {
     if (hash.C != null && !isShip()) setC(hash.C, false);
     if (hash.view) setPhysView(hash.view);
      apply3D();
    compute();
}
booted = true;