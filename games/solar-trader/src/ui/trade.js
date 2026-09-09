import { STATION_BY_ID } from '../data/stations.js';
import { COMMODITY_BY_ID } from '../data/commodities.js';
import { RING_BY_BODY } from '../data/bodies.js';
import { UPGRADES, TRACK_IDS } from '../data/upgrades.js';
import { bodyState } from '../sim/ephemeris.js';
import { dist } from '../core/vec3.js';
import { fmtCredits, fmtNum } from '../core/units.js';

const REFRESH_MS = 1500;          // price drift refresh while the clock runs
const LIGHT_S_PER_AU = 499.005;

export function initTrade(game) {
  const root = document.getElementById('trade-root');
  const tabs = document.getElementById('tabs');
  let tab = 'market';
  let dirty = true;
  let lot = 50;
  let lastRender = 0;

  game.on(() => { dirty = true; });
  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('.tab');
    if (!b) return;
    tab = b.dataset.tab;
    for (const x of tabs.children) x.classList.toggle('active', x === b);
    dirty = true;
  });

  const row = (k, v, cls = '') =>
    `<div class="row"><span class="k">${k}</span><span class="v ${cls}">${v}</span></div>`;

  // ---------- market ----------
  /**
   * Price table for one station. Local tables carry B/S buttons; remote
   * tables show the margin of "buy here, sell there" per tonne instead.
   */
  function priceTable(stationId, local) {
    const rows = game.economy.table(stationId).map((r) => {
      const held = game.ship.cargo[r.id] || 0;
      let margin = '';
      if (!local && game.dockedAt) {
        const hq = game.economy.quote(game.dockedAt, r.id);
        if (hq) {
          const m = r.sell - hq.buy;
          margin = `<div class="sub ${m > 0 ? 'pos' : 'neg'}">${m > 0 ? '+' : ''}${fmtCredits(m)}/t</div>`;
        }
      }
      return `<tr data-cid="${r.id}">
          <td>${r.name}<div class="sub">${r.trend} · stock ${fmtNum(r.stock, 0)}t · ×${r.ratio.toFixed(2)}${held ? ` · hold ${fmtNum(held, 0)}t` : ''}</div></td>
          <td>${fmtCredits(r.buy)}</td>
          <td>${fmtCredits(r.sell)}${margin}</td>
          ${local ? `<td>
            <button class="btn small" data-act="buy">B</button>
            <button class="btn small amber" data-act="sell">S</button>
          </td>` : ''}
        </tr>`;
    }).join('');
    return `<table class="mkt ${local ? '' : 'remote'}">
        <thead><tr><th>COMMODITY</th><th>BUY</th><th>SELL</th>${local ? '<th></th>' : ''}</tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  /** Remote telemetry for the nav target (or destination in flight). */
  function remote() {
    const tid = game.flight ? game.flight.to : game.target;
    if (!tid || tid === game.dockedAt) return '';
    const st = STATION_BY_ID[tid];
    const ring = RING_BY_BODY[st.body] || 3;
    if (!game.canSeeMarket(tid)) {
      return `<div class="sec"><h3>UPLINK · ${st.name.toUpperCase()}</h3>
        <span class="k">No telemetry. Needs ${UPGRADES.uplink.tiers[ring].name} (Uplink tier ${ring + 1}).</span></div>`;
    }
    const s = dist(game.shipPosition(), bodyState(st.body, game.t).r) * LIGHT_S_PER_AU;
    const delay = s < 3600 ? `${(s / 60).toFixed(1)} min` : `${(s / 3600).toFixed(1)} h`;
    return `<div class="sec"><h3>UPLINK · ${st.name.toUpperCase()} · SIGNAL ${delay}</h3>
        <span class="k">Quotes at the far end today; they will drift before you arrive.
        Margins are sell-there minus buy-here, per tonne, before your lot moves the market.</span></div>
      ${priceTable(tid, false)}`;
  }

  function manifest(sellable) {
    const c = game.ship.cargo;
    const ids = Object.keys(c);
    if (!ids.length) return `<div class="sec"><h3>MANIFEST</h3><span class="k">Hold empty.</span></div>`;
    return `<div class="sec"><h3>MANIFEST · ${fmtNum(game.ship.cargoMass, 1)} t</h3>${ids.map((id) => {
      const est = sellable ? game.economy.trade(game.dockedAt, id, c[id], 'sell', false) : null;
      return `<div class="row"><span class="k">${COMMODITY_BY_ID[id].name}</span>
        <span class="v">${fmtNum(c[id], 1)} t${est
          ? ` · ≈${fmtCredits(est.total)} <button class="btn small amber" data-dump="${id}">SELL ALL</button>`
          : ''}</span></div>`;
    }).join('')}</div>`;
  }

  function market() {
    if (!game.dockedAt) {
      return `<div class="sec"><span class="k">In flight — no market access.</span></div>
        ${manifest(false)}${remote()}`;
    }
    const st = STATION_BY_ID[game.dockedAt];
    const fuelP = game.economy.fuelPrice(game.dockedAt);
    const mining = st.mining ? `<div class="sec"><h3>CLAIM · ${st.mining.yield} t/day</h3>
        ${st.mining.goods.map((g) => `<button class="btn" data-mine="${g}">EXTRACT 10d — ${COMMODITY_BY_ID[g].name}</button>`).join('')}
      </div>` : '';

    return `<div class="sec">
        <h3>${st.name.toUpperCase()} · SPREAD ${(st.spread * 100).toFixed(1)}%</h3>
        <div class="row"><span class="k">lot size</span><span class="v">
          ${[10, 50, 100, 'MAX'].map((n) => `<button class="btn small ${String(n) === String(lot) ? 'amber' : ''}" data-lot="${n}">${n}</button>`).join('')}
        </span></div>
        <span class="k">Quotes are marginal; a lot is priced slice by slice as it moves the stock.</span>
      </div>
      ${priceTable(game.dockedAt, true)}
      <div class="sec">
        <h3>PROPELLANT · ${fmtCredits(fuelP)}/t</h3>
        ${row('tanks', `${fmtNum(game.ship.prop, 1)}/${game.ship.propCapacity} t`)}
        <button class="btn" data-fuel="full">FILL TANKS</button>
        <button class="btn" data-fuel="50">LOAD 50 t</button>
      </div>
      ${mining}
      ${manifest(true)}
      ${remote()}`;
  }

  // ---------- shipyard ----------
  function shipyard() {
    const s = game.ship;
    const st = game.dockedAt ? STATION_BY_ID[game.dockedAt] : null;
    const canRefit = st && st.tech >= 3;
    const cur = s.preview('drive', s.tier.drive);      // current configuration

    const tracks = TRACK_IDS.map((tid) => {
      const tr = UPGRADES[tid];
      const lvl = s.tier[tid];
      const next = tr.tiers[lvl + 1];
      const chk = next ? s.canUpgrade(tid, lvl + 1) : { ok: false, why: 'maxed' };
      const pv = next ? s.preview(tid, lvl + 1) : null;
      const delta = (a, b) => {
        const d = (b - a) / 1000;
        return `<span class="${d >= 0 ? 'pos' : 'neg'}">${d >= 0 ? '+' : ''}${d.toFixed(1)}</span>`;
      };
      return `<div class="sec">
          <h3>${tr.name.toUpperCase()} — ${tr.tiers[lvl].name}</h3>
          <div class="row"><span class="k">${tr.desc}</span></div>
          ${next ? `${row('next', next.name)}
            ${row('cost', fmtCredits(next.cost))}
            ${row('dry mass →', `${fmtNum(pv.dry, 0)} t`)}
            ${row('Δv empty / full hold →', `${(pv.dvEmpty / 1000).toFixed(1)} (${delta(cur.dvEmpty, pv.dvEmpty)}) / ${(pv.dvFull / 1000).toFixed(1)} (${delta(cur.dvFull, pv.dvFull)}) km/s`)}
            <button class="btn" data-up="${tid}" ${chk.ok && canRefit && game.credits >= next.cost ? '' : 'disabled'}>
              ${!canRefit ? 'NEEDS TECH-3 YARD' : chk.ok ? 'INSTALL' : chk.why.toUpperCase()}</button>`
            : `<div class="row"><span class="k">maximum tier installed</span></div>`}
        </div>`;
    }).join('');

    return `<div class="sec">
        <h3>${s.name.toUpperCase()}</h3>
        ${row('dry mass', `${fmtNum(s.dryMass, 0)} t`)}
        ${row('propellant', `${fmtNum(s.prop, 0)} / ${s.propCapacity} t`)}
        ${row('cargo', `${fmtNum(s.cargoMass, 0)} / ${s.cargoCapacity} t`)}
        ${row('Isp / v_e', `${s.isp} s / ${(s.ve / 1000).toFixed(1)} km/s`)}
        ${row('Δv as loaded', `${(s.deltaV / 1000).toFixed(2)} km/s`)}
        ${row('Δv full tanks, empty hold', `${(cur.dvEmpty / 1000).toFixed(2)} km/s`)}
        ${row('Δv full tanks, full hold', `${(cur.dvFull / 1000).toFixed(2)} km/s`)}
        ${row('aerocapture', `${(s.aeroFactor * 100).toFixed(0)} %`)}
        ${row('uplink', UPGRADES.uplink.tiers[s.tier.uplink].name)}
      </div>${tracks}`;
  }

  // ---------- contracts (placeholder surface) ----------
  function contracts() {
    return `<div class="sec"><h3>CONTRACTS</h3>
      <span class="k">Contract board comes online at milestone M6. Until then,
      arbitrage is the whole business.</span></div>`;
  }

  function render() {
    root.innerHTML = tab === 'market' ? market() : tab === 'shipyard' ? shipyard() : contracts();

    const qty = () => (lot === 'MAX' ? 1e9 : Number(lot));

    root.querySelectorAll('[data-lot]').forEach((b) => {
      b.onclick = () => { lot = b.dataset.lot === 'MAX' ? 'MAX' : Number(b.dataset.lot); dirty = true; };
    });
    root.querySelectorAll('tr[data-cid] button').forEach((b) => {
      const cid = b.closest('tr').dataset.cid;
      b.onclick = () => (b.dataset.act === 'buy' ? game.buy(cid, qty()) : game.sell(cid, qty()));
    });
    root.querySelectorAll('[data-dump]').forEach((b) => {
      b.onclick = () => game.sell(b.dataset.dump, 1e9);
    });
    root.querySelectorAll('[data-fuel]').forEach((b) => {
      b.onclick = () => game.refuel(b.dataset.fuel === 'full' ? 1e9 : 50);
    });
    root.querySelectorAll('[data-mine]').forEach((b) => {
      b.onclick = () => game.mine(b.dataset.mine, 10);
    });
    root.querySelectorAll('[data-up]').forEach((b) => {
      const tid = b.dataset.up;
      b.onclick = () => game.upgrade(tid, game.ship.tier[tid] + 1);
    });
    dirty = false;
  }

  return function tick(now = performance.now()) {
    if (dirty) { render(); lastRender = now; return; }
    if (game.rate > 0 && now - lastRender >= REFRESH_MS) { render(); lastRender = now; }
  };
}