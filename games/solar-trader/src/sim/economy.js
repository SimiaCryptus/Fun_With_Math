import { COMMODITIES, COMMODITY_BY_ID } from '../data/commodities.js';
import { STATIONS, STATION_BY_ID } from '../data/stations.js';
import { clamp } from '../core/units.js';

const STOCK_DAYS = 90;      // target stock ~= 90 days of throughput
const MIN_TARGET = 40;
const RELAX = 1 / 30;       // 1/day: NPC freighters pull stock toward target
const SCARCITY_EXP = 0.7;
const SCARCITY_LO = 0.35;
const SCARCITY_HI = 3.5;

/**
 * Where a line's stock settles under production, consumption and background
 * trade:  stock' = (prod - cons) + RELAX * (target - stock) = 0.
 * Exporters sit ~1.33x target, importers ~0.67x — scarce but never pinned.
 */
function equilibrium(L) {
  return L.target + (L.prod - L.cons) / RELAX;
}

function priceAt(base, mult, target, stock) {
  const scarcity = target / Math.max(stock, target * 0.05);
  return base * mult * clamp(Math.pow(scarcity, SCARCITY_EXP), SCARCITY_LO, SCARCITY_HI);
}

/** One tradeable line at one station. */
function makeLine(def) {
  const flow = Math.max(def.p || 0, def.c || 0);
  const target = Math.max(MIN_TARGET, flow * STOCK_DAYS);
  const L = {
    stock: 0,
    target,
    prod: def.p || 0,
    cons: def.c || 0,
    mult: (def.m || 1) * (0.94 + Math.random() * 0.12),
    baseMult: def.m || 1,
  };
  L.stock = clamp(equilibrium(L) * (0.85 + Math.random() * 0.3), target * 0.02, target * 3.2);
  return L;
}

export class Economy {
  constructor() {
    /** @type {Record<string, Record<string, object>>} */
    this.markets = {};
    for (const st of STATIONS) {
      const m = {};
      for (const [cid, def] of Object.entries(st.econ)) m[cid] = makeLine(def);
      this.markets[st.id] = m;
    }
    this.lastTickDay = 0;
  }

  lines(stationId) { return this.markets[stationId] || {}; }
  line(stationId, cid) { return this.markets[stationId]?.[cid] || null; }

  /** Marginal mid price, credits per tonne, at the current stock. */
  price(stationId, cid) {
    const L = this.line(stationId, cid);
    if (!L) return null;
    return priceAt(COMMODITY_BY_ID[cid].base, L.mult, L.target, L.stock);
  }

  quote(stationId, cid) {
    const p = this.price(stationId, cid);
    if (p == null) return null;
    const sp = STATION_BY_ID[stationId].spread;
    return { mid: p, buy: p * (1 + sp), sell: p * (1 - sp) };
  }

  /** Tonnes the station will realistically sell you right now. */
  availableToBuy(stationId, cid) {
    const L = this.line(stationId, cid);
    if (!L) return 0;
    return Math.max(0, L.stock - L.target * 0.10);
  }

  /**
   * Price a lot honestly. The lot is filled in slices and each slice is
   * priced at the stock it finds, so dumping 300 t on a 40 t market pays far
   * less than 300 x the posted quote. With commit=false this is a preview.
   * @param {'buy'|'sell'} side
   * @returns {{tons:number, total:number, avg:number}|null}
   */
  trade(stationId, cid, tons, side, commit = true) {
    const L = this.line(stationId, cid);
    if (!L || !(tons > 0)) return null;
    const base = COMMODITY_BY_ID[cid].base;
    const sp = STATION_BY_ID[stationId].spread;
    const sign = side === 'buy' ? -1 : 1;
    const spreadK = side === 'buy' ? 1 + sp : 1 - sp;
    const n = Math.max(1, Math.min(32, Math.ceil(tons / 4)));
    const step = tons / n;
    let stock = L.stock, total = 0;
    for (let i = 0; i < n; i++) {
      // midpoint rule on stock for a second-order accurate integral
      total += priceAt(base, L.mult, L.target, stock + sign * step * 0.5) * spreadK * step;
      stock += sign * step;
    }
    if (commit) L.stock = Math.max(L.target * 0.02, stock);
    return { tons, total, avg: total / tons };
  }

  /** Legacy single-shot stock nudges (used for propellant draw). */
  applyBuy(stationId, cid, tons) {
    const L = this.line(stationId, cid);
    if (L) L.stock = Math.max(L.target * 0.02, L.stock - tons);
  }
  applySell(stationId, cid, tons) {
    const L = this.line(stationId, cid);
    if (L) L.stock += tons;
  }

  /** Price of one tonne of propellant (LH2) with a service fee. */
  fuelPrice(stationId) {
    const q = this.quote(stationId, 'h2');
    const fallback = COMMODITY_BY_ID.h2.base * 2.6;
    return (q ? q.buy : fallback) * 1.25;
  }

  /**
   * Advance stocks and the slow locality drift. Stock relaxation is solved
   * in closed form, so a 400-day warp lands exactly where 400 daily ticks
   * would — no explicit-Euler overshoot, no cap needed.
   */
  tick(nowDay) {
    const dt = nowDay - this.lastTickDay;
    if (dt <= 0) return;
    this.lastTickDay = nowDay;
    const k = Math.exp(-RELAX * dt);
    for (const sid in this.markets) {
      const m = this.markets[sid];
      for (const cid in m) {
        const L = m[cid];
        const eq = equilibrium(L);
        L.stock = clamp(eq + (L.stock - eq) * k, L.target * 0.02, L.target * 3.2);
        // mean-reverting random walk on the locality multiplier
        const drift = (Math.random() - 0.5) * 0.02 * Math.sqrt(dt);
        const revert = 1 - Math.exp(-0.004 * dt);
        L.mult = clamp(L.mult + drift + (L.baseMult - L.mult) * revert,
                       L.baseMult * 0.6, L.baseMult * 1.9);
      }
    }
  }

  /** Rows for the market UI, sorted by value. */
  table(stationId) {
    const m = this.lines(stationId);
    return COMMODITIES
      .filter((c) => m[c.id])
      .map((c) => {
        const q = this.quote(stationId, c.id);
        const L = m[c.id];
        return {
          id: c.id, name: c.name, cls: c.cls, base: c.base,
          ...q,
          ratio: q.mid / c.base,
          stock: L.stock,
          target: L.target,
          trend: L.prod > L.cons ? 'exports' : 'imports',
          avail: this.availableToBuy(stationId, c.id),
        };
      })
      .sort((a, b) => b.mid - a.mid);
  }

  toJSON() { return { markets: this.markets, lastTickDay: this.lastTickDay }; }
  static fromJSON(o) {
    const e = new Economy();
    if (o?.markets) { e.markets = o.markets; e.lastTickDay = o.lastTickDay || 0; }
    return e;
  }
}