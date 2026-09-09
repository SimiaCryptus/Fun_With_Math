import { STATIONS, STATION_BY_ID } from '../data/stations.js';
import { BODY_BY_ID } from '../data/bodies.js';
import { porkchop, localTransfer, hohmannEstimate } from '../sim/planner.js';
import { drawPorkchop } from './porkchop.js';
import { fmtDate, fmtDuration, fmtNum } from '../core/units.js';

const REFRESH_MS = 1000;   // countdown refresh cadence while the clock runs

export function initNav(game, view) {
  const root = document.getElementById('nav-root');
  let grid = null;         // porkchop result, anchored at grid.dep0
  let sel = null;          // {ix, iy} selected cell
  let gridKey = '';
  let dirty = true;
  let hovering = false;    // pointer is on the porkchop: do not rebuild under it
  let lastRender = 0;

  game.on(() => { dirty = true; });

  const row = (k, v, cls = '') =>
    `<div class="row"><span class="k">${k}</span><span class="v ${cls}">${v}</span></div>`;

  // ---------- grid management ----------
  /** Regrid once "now" has walked ~1/8 of the way across the plot. */
  function gridStale() {
    return !grid || game.t > grid.dep0 + grid.depStep * Math.floor(grid.nx / 8);
  }

  function cellIndex(departT, tof) {
    const ix = Math.round((departT - grid.dep0) / grid.depStep);
    const iy = Math.round((tof - grid.tof0) / grid.tofStep);
    if (ix < 0 || ix >= grid.nx || iy < 0 || iy >= grid.ny) return null;
    return isFinite(grid.dv[iy * grid.nx + ix]) ? { ix, iy } : null;
  }

  function cellToPlan(ix, iy) {
    return { departT: grid.dep0 + ix * grid.depStep, tof: grid.tof0 + iy * grid.tofStep };
  }

  function cellSolvable(c) {
    return !!c && isFinite(grid.dv[c.iy * grid.nx + c.ix]);
  }

  function selectCell(ix, iy, redraw = true) {
    if (!grid || game.plan?.armed) return;
    sel = { ix, iy };
    const { departT, tof } = cellToPlan(ix, iy);
    game.proposeTransfer(departT, tof);      // emits -> dirty; render() clears it
    if (redraw) render();
  }

  function ensureGrid(force = false) {
    if (game.flight || game.plan?.armed) return;          // never disturb a filed plan
    const from = game.dockedAt, to = game.target;
    if (!from || !to || from === to || STATION_BY_ID[from].body === STATION_BY_ID[to].body) {
      grid = null; gridKey = ''; sel = null;
      return;
    }
    const key = `${from}>${to}|${game.ship.aeroFactor}`;
    if (!force && key === gridKey && !gridStale()) {
      // e.g. after a load: grid still valid but the plan is gone
      if (!game.plan && cellSolvable(sel)) selectCell(sel.ix, sel.iy, false);
      return;
    }

    // Keep the player's chosen window across a regrid if it is still in view.
    const keep = key === gridKey && game.plan?.kind === 'transfer'
      ? { departT: game.plan.departT, tof: game.plan.tof } : null;
    gridKey = key;
    grid = porkchop(from, to, game.t, { aeroFactor: game.ship.aeroFactor });

    const kept = keep ? cellIndex(keep.departT, keep.tof) : null;
    if (kept) { selectCell(kept.ix, kept.iy, false); return; }
    sel = grid.min.ix >= 0 ? { ix: grid.min.ix, iy: grid.min.iy } : null;
    if (sel) selectCell(sel.ix, sel.iy, false);
  }

  // ---------- rendering ----------
  function targetList() {
    const here = game.dockedAt;
    const budget = game.ship.deltaV;
    const rows = STATIONS.map((s) => {
      const active = s.id === game.target;
      const isHere = s.id === here;
      const body = BODY_BY_ID[s.body];
      let est = '', unreach = false;
      if (here && !isHere) {
        const h = hohmannEstimate(here, s.id, game.t, game.ship.aeroFactor);
        if (h) {
          unreach = h.dvTotal > budget;
          est = `<div class="sub est">~${(h.dvTotal / 1000).toFixed(1)} km/s · ${fmtDuration(h.tof)}</div>`;
        }
      }
      return `<div class="item ${active ? 'sel' : ''} ${unreach ? 'unreach' : ''}" data-station="${s.id}">
          <div>
            <div class="name">${s.name}${isHere ? ' ·' : ''}</div>
            <div class="sub">${body.name} · r<sub>park</sub> ${fmtNum(s.rPark / 1000, 0)} km${s.mining ? ' · claim' : ''}</div>
          </div>
          <div class="sub" style="text-align:right">T${s.tech}${est}</div>
        </div>`;
    }).join('');
    return `<div class="list">${rows}</div>
      <div class="sec"><span class="k">~ figures are coplanar Hohmann estimates against your
      current Δv budget (red = out of reach). The porkchop is the truth.</span></div>`;
  }

  function planReadout() {
    const p = game.plan;
    if (!p) return `<div class="sec"><span class="k">No solution at this cell — pick another.</span></div>`;
    const prop = game.planPropellant(p);
    const feas = game.planFeasible(p);
    const propLeft = Math.max(0, game.ship.prop - prop.total);
    const mAfter = game.ship.wetMass - prop.total;
    const dvAfter = propLeft > 0 ? game.ship.ve * Math.log(mAfter / (mAfter - propLeft)) : 0;
    const isX = p.kind === 'transfer';
    return `<div class="sec">
        <h3>TRANSFER</h3>
        ${row('depart', fmtDate(p.departT))}
        ${row('arrive', fmtDate(p.arriveT))}
        ${row('time of flight', fmtDuration(p.tof))}
        ${isX ? row('v∞ departure', `${(p.vInfDep / 1000).toFixed(2)} km/s`) : ''}
        ${isX ? row('C3', `${p.c3.toFixed(2)} km²/s²`) : ''}
        ${isX ? row('v∞ arrival', `${(p.vInfArr / 1000).toFixed(2)} km/s`) : ''}
        ${row('Δv departure', `${(p.dvDep / 1000).toFixed(2)} km/s`)}
        ${row('Δv capture', `${((p.dvArr || 0) / 1000).toFixed(2)} km/s`)}
        ${p.aeroSaved > 1 ? row('aerocapture saves', `${(p.aeroSaved / 1000).toFixed(2)} km/s`, 'pos') : ''}
        ${row('Δv total', `${(p.dvTotal / 1000).toFixed(2)} km/s`, 'warn')}
        ${row('propellant', `${prop.total.toFixed(1)} t`, feas.ok ? '' : 'neg')}
        ${row('Δv remaining after', `${(dvAfter / 1000).toFixed(2)} km/s`)}
        ${feas.ok ? '' : `<div class="row"><span class="neg">✗ ${feas.why}</span></div>`}
        <button class="btn" id="btn-execute" ${feas.ok ? '' : 'disabled'}>FILE FLIGHT PLAN</button>
      </div>`;
  }

  function flightPanel() {
    const f = game.flight;
    return `<div class="sec">
        <h3>IN FLIGHT</h3>
        ${row('destination', STATION_BY_ID[f.to].name)}
        ${row('arrival', fmtDate(f.arriveT))}
        ${row('remaining', fmtDuration(f.arriveT - game.t))}
        ${row('capture Δv', `${((f.dvArr || 0) / 1000).toFixed(2)} km/s`)}
        <button class="btn amber" id="btn-warp-arr">WARP TO ARRIVAL</button>
      </div>`;
  }

  function armedPanel() {
    const p = game.plan;
    return `<div class="sec">
        <h3>PLAN FILED</h3>
        ${row('destination', STATION_BY_ID[p.to].name)}
        ${row('departure', fmtDate(p.departT))}
        ${row('countdown', fmtDuration(p.departT - game.t))}
        <button class="btn amber" id="btn-warp-dep">WARP TO DEPARTURE</button>
        <button class="btn" id="btn-unfile">UNFILE PLAN</button>
      </div>`;
  }

  function chopPanel(from, to) {
    const sameBody = STATION_BY_ID[from]?.body === STATION_BY_ID[to]?.body;
    if (from === to) return `<div class="sec"><span class="k">You are docked here.</span></div>`;
    if (sameBody) {
      const l = localTransfer(from, to);
      return `<div class="sec"><h3>LOCAL TRANSFER</h3>
          ${row('Δv', `${(l.dvTotal / 1000).toFixed(3)} km/s`)}
          ${row('duration', fmtDuration(l.tof))}
          <button class="btn" id="btn-local">TRANSFER ORBIT</button></div>`;
    }
    if (!grid) return '';
    return `<div class="sec">
        <h3>LAUNCH WINDOWS — Δv (dep ➜, TOF ↑)</h3>
        <canvas class="porkchop" id="chop"></canvas>
        ${row('window span', `${fmtDate(grid.dep0)} +${fmtDuration(grid.depStep * (grid.nx - 1))}`)}
        ${row('hohmann TOF', fmtDuration(grid.hohmann))}
        ${row('synodic', fmtDuration(grid.synodic))}
        ${row('best in span', `${(grid.min.dv / 1000).toFixed(2)} km/s · ${fmtDate(grid.min.departT)}`)}
        <div class="row"><span class="k" id="chop-hover">hover the plot · click to select</span>
          <button class="btn small" id="btn-rescan">RESCAN</button></div>
      </div>${planReadout()}`;
  }

  function render() {
    hovering = false;
    ensureGrid();
    const from = game.dockedAt;
    const to = game.target;

    let head = '';
    if (game.flight) head = flightPanel();
    else if (game.plan?.armed) head = armedPanel();
    else if (from && to) head = chopPanel(from, to);

    root.innerHTML = head + `<h2 style="border-top:1px solid var(--edge)">PORTS</h2>` + targetList();

    const canvas = document.getElementById('chop');
    if (canvas && grid) {
      const nowIx = Math.max(0, Math.ceil((game.t - grid.dep0) / grid.depStep - 1e-9));
      drawPorkchop(canvas, grid, { budget: game.ship.deltaV, sel, nowIx });
      const pick = (ev) => {
        const r = canvas.getBoundingClientRect();
        const ix = Math.round(((ev.clientX - r.left) / r.width) * (grid.nx - 1));
        const iy = Math.round((1 - (ev.clientY - r.top) / r.height) * (grid.ny - 1));
        return { ix: Math.max(0, Math.min(grid.nx - 1, ix)), iy: Math.max(0, Math.min(grid.ny - 1, iy)) };
      };
      canvas.onclick = (ev) => { const c = pick(ev); selectCell(c.ix, c.iy); };
      canvas.onmouseenter = () => { hovering = true; };
      canvas.onmouseleave = () => { hovering = false; };
      canvas.onmousemove = (ev) => {
        const c = pick(ev);
        const v = grid.dv[c.iy * grid.nx + c.ix];
        const { departT, tof } = cellToPlan(c.ix, c.iy);
        const out = document.getElementById('chop-hover');
        if (!out) return;
        const past = departT < game.t ? ' (past)' : '';
        out.textContent = isFinite(v)
          ? `${fmtDate(departT)}${past} +${fmtDuration(tof)} → ${(v / 1000).toFixed(2)} km/s`
          : `${fmtDate(departT)}${past} +${fmtDuration(tof)} → no solution`;
      };
    }

    const bind = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
    bind('btn-execute', () => { game.armPlan(); });
    bind('btn-warp-dep', () => game.warpToDeparture());
    bind('btn-warp-arr', () => game.warpToArrival());
    bind('btn-unfile', () => { if (game.plan) { game.plan.armed = false; game.log('Flight plan unfiled.'); game.emit(); } });
    bind('btn-rescan', () => { ensureGrid(true); render(); });
    bind('btn-local', () => { game.proposeTransfer(game.t, 0); game.armPlan(); });

    root.querySelectorAll('[data-station]').forEach((n) => {
      n.onclick = () => {
        game.setTarget(n.dataset.station);
        view.focus(STATION_BY_ID[n.dataset.station].body);
      };
    });

    dirty = false;
  }

  return function tick(now = performance.now()) {
    if (dirty) { render(); lastRender = now; return; }
    // Countdowns/feasibility drift with the clock; refresh gently, never
    // while the pointer is reading the porkchop.
    if (game.rate > 0 && !hovering && now - lastRender >= REFRESH_MS) {
      render();
      lastRender = now;
    }
  };
}