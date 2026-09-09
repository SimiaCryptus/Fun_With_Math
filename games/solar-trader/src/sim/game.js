// Authoritative game state: clock, ship, economy, flight execution, saves.
// Emits 'change' after any discrete state mutation the panels must rebuild
// for. The mere passage of time does NOT emit: the HUD polls every frame and
// the side panels refresh on a throttle, so the DOM is not torn down at
// 60 Hz while the clock runs.

import { Ship } from './ship.js';
import { Economy } from './economy.js';
import { bodyState } from './ephemeris.js';
import { propagate } from '../core/kepler.js';
import { solveTransfer, localTransfer, arcSamples } from './planner.js';
import { STATION_BY_ID, STATIONS } from '../data/stations.js';
import { RING_BY_BODY } from '../data/bodies.js';
import { COMMODITY_BY_ID } from '../data/commodities.js';
import { UPGRADES } from '../data/upgrades.js';
import { daysFromDate, daysToTU, fmtDate, fmtCredits } from '../core/units.js';

const START_DAY = daysFromDate(Date.UTC(2035, 5, 1));
const SAVE_KEY = 'solar-trader/save-v2';
const REFIT_DAYS = 4;

export class Game {
  constructor() {
    this.t = START_DAY;
    this.rate = 0;                 // days per real second
    this.ship = new Ship();
    this.economy = new Economy();
    this.economy.lastTickDay = this.t;
    this.credits = 1.25e6;
    this.dockedAt = 'leo-gateway';
    this.flight = null;            // active coast
    this.plan = null;              // selected, not yet executed
    this.target = 'tharsis';       // selected nav target
    this.logLines = [];
    this.listeners = new Set();
    this.autoPause = true;
    this.log('Registry: MV Perihelion cleared for commercial operations.', true);
    this.log(`Docked at LEO Gateway, ${fmtDate(this.t)}.`);
  }

  // ---------- events ----------
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) fn(this); }

  log(msg, hi = false) {
    this.logLines.push({ t: this.t, msg, hi });
    if (this.logLines.length > 200) this.logLines.shift();
  }

  // ---------- clock ----------
  setRate(r) { this.rate = r; this.emit(); }

  /** @param {number} dtReal seconds of wall clock */
  update(dtReal) {
    if (this.rate <= 0) { this.economy.tick(this.t); return; }
    const dt = this.rate * dtReal;

    // Never warp past a maneuver node (and never rewind to one).
    const node = this.nextNodeTime();
    if (node != null && this.t + dt >= node) {
      this.t = Math.max(this.t, node);
      this.resolveNode();
      if (this.autoPause) this.rate = 0;
      this.economy.tick(this.t);
      this.emit();
      return;
    }

    this.t += dt;
    this.economy.tick(this.t);
  }

  nextNodeTime() {
    if (this.flight) return this.flight.arriveT;
    if (this.plan && this.plan.kind === 'transfer' && this.plan.armed) return this.plan.departT;
    return null;
  }

  resolveNode() {
    if (this.flight) return this.completeFlight();
    if (this.plan?.armed) return this.beginFlight();
  }

  /**
   * Advance the clock while docked (mining, refits). A filed plan whose
   * window we sleep through is cancelled — time never runs backwards.
   */
  passDays(days) {
    this.t += days;
    this.economy.tick(this.t);
    if (this.plan?.armed && this.plan.departT < this.t) {
      this.plan = null;
      this.log('Filed departure window missed while in port — plan cancelled.', true);
    }
  }

  // ---------- position ----------
  /** Canonical heliocentric state of the ship right now. */
  shipState() {
    if (this.flight && !this.flight.local) {
      return propagate(this.flight.r0, this.flight.v0,
                       daysToTU(this.t - this.flight.departT), 1);
    }
    // Docked, or on a same-body Hohmann hop: ride the parent body.
    const sid = this.flight ? this.flight.to : this.dockedAt;
    return bodyState(STATION_BY_ID[sid].body, this.t);
  }

  shipPosition() { return this.shipState().r; }

  get status() {
    if (this.flight) {
      const left = Math.max(0, this.flight.arriveT - this.t);
      return `COAST → ${STATION_BY_ID[this.flight.to].name} (${Math.ceil(left)}d)`;
    }
    return `DOCKED · ${STATION_BY_ID[this.dockedAt].name}`;
  }

  // ---------- planning ----------
  setTarget(stationId) { this.target = stationId; this.plan = null; this.emit(); }

  /** Build (but do not commit) a transfer plan for exactly this window. */
  proposeTransfer(departT, tofDays) {
    if (this.flight || this.plan?.armed) return null;
    const from = this.dockedAt;
    const to = this.target;
    if (from === to) return null;

    const A = STATION_BY_ID[from], B = STATION_BY_ID[to];
    if (A.body === B.body) {
      const l = localTransfer(from, to);
      this.plan = {
        kind: 'local', from, to, departT: this.t, arriveT: this.t + l.tof,
        tof: l.tof, dvTotal: l.dvTotal, dvDep: l.dvTotal, dvArr: 0, armed: false,
      };
      this.emit();
      return this.plan;
    }

    // No clamping of departT to "now": the readout must describe the cell
    // the player clicked. A past window is reported as infeasible instead.
    const sol = solveTransfer(from, to, departT, tofDays, { aeroFactor: this.ship.aeroFactor });
    if (!sol) { this.plan = null; this.emit(); return null; }
    this.plan = { kind: 'transfer', ...sol, armed: false, samples: arcSamples(sol) };
    this.emit();
    return this.plan;
  }

  /** Propellant needed for the whole plan, accounting for mass loss. */
  planPropellant(plan = this.plan) {
    if (!plan) return null;
    const s = this.ship;
    const m0 = s.wetMass;
    const ve = s.ve;
    const m1 = m0 * Math.exp(-plan.dvDep / ve);
    const m2 = m1 * Math.exp(-(plan.dvArr || 0) / ve);
    return { dep: m0 - m1, arr: m1 - m2, total: m0 - m2 };
  }

  planFeasible(plan = this.plan) {
    if (!plan) return { ok: false, why: 'no plan' };
    const p = this.planPropellant(plan);
    if (p.total > this.ship.prop + 1e-6) {
      return { ok: false, why: `needs ${p.total.toFixed(1)} t propellant, have ${this.ship.prop.toFixed(1)} t` };
    }
    if (plan.departT < this.t - 1e-9) return { ok: false, why: 'departure is in the past' };
    return { ok: true };
  }

  /** Commit the plan; the departure burn happens when the clock reaches it. */
  armPlan() {
    const f = this.planFeasible();
    if (!f.ok) { this.log(`Flight plan rejected: ${f.why}.`); this.emit(); return false; }
    this.plan.armed = true;
    if (this.plan.kind === 'local' || this.plan.departT <= this.t + 1e-9) this.beginFlight();
    else this.log(`Plan filed: depart ${fmtDate(this.plan.departT)} for ${STATION_BY_ID[this.plan.to].name}.`, true);
    this.emit();
    return true;
  }

  warpToDeparture() {
    if (!this.plan?.armed) return;
    this.rate = 0;
    this.t = Math.max(this.t, this.plan.departT);
    this.economy.tick(this.t);
    this.resolveNode();
    this.emit();
  }

  warpToArrival() {
    if (!this.flight) return;
    this.rate = 0;
    this.t = this.flight.arriveT;
    this.economy.tick(this.t);
    this.completeFlight();
    this.emit();
  }

  beginFlight() {
    const plan = this.plan;
    if (!plan) return;

    if (plan.kind === 'local') {
      if (!this.ship.burn(plan.dvTotal)) {
        this.plan = null;
        this.log('Insufficient propellant for orbital transfer — plan cancelled.');
        return;
      }
      this.flight = { ...plan, local: true, r0: null, v0: null };
      this.dockedAt = null;
      this.log(`Orbit change burn ${(plan.dvTotal).toFixed(0)} m/s → ${STATION_BY_ID[plan.to].name}.`);
      this.plan = null;
      return;
    }

    if (!this.ship.burn(plan.dvDep)) {
      // Cargo or fuel changed since filing. Unarm so we do not retry every frame.
      plan.armed = false;
      this.log('Departure burn scrubbed: insufficient propellant at current mass. Plan unfiled.', true);
      return;
    }
    this.flight = {
      from: plan.from, to: plan.to,
      departT: plan.departT, arriveT: plan.arriveT, tof: plan.tof,
      r0: plan.r1, v0: plan.v1, dvArr: plan.dvArr,
      samples: plan.samples,
    };
    this.ship.r = plan.r1; this.ship.v = plan.v1;
    this.dockedAt = null;
    this.plan = null;
    this.ship.trail = [];
    this.log(`Departure burn ${(plan.dvDep / 1000).toFixed(2)} km/s · v∞ ${(plan.vInfDep / 1000).toFixed(2)} km/s · ETA ${fmtDate(plan.arriveT)}.`, true);
  }

  completeFlight() {
    const f = this.flight;
    if (!f) return;
    if (f.local) {
      this.log(`Docked at ${STATION_BY_ID[f.to].name}.`);
    } else if (this.ship.burn(f.dvArr)) {
      this.log(`Capture burn ${(f.dvArr / 1000).toFixed(2)} km/s. Docked at ${STATION_BY_ID[f.to].name}.`, true);
    } else {
      // Mass cannot change in flight, so a feasible plan always captures;
      // this only triggers on an edited or legacy save. Be honest, not cruel.
      const fee = Math.min(this.credits, Math.max(2.5e5, this.credits * 0.25));
      this.ship.prop = 0;
      this.credits -= fee;
      this.log(`CAPTURE BURN INCOMPLETE — port tugs finished the capture. Salvage fee ${fmtCredits(fee)}.`, true);
    }
    this.dockedAt = f.to;
    this.flight = null;
    this.ship.trail = [];
  }

  // ---------- commerce ----------
  /** Can we read this station's market? Local always; remote via Uplink ring. */
  canSeeMarket(stationId) {
    if (!stationId) return false;
    if (stationId === this.dockedAt) return true;
    const ring = RING_BY_BODY[STATION_BY_ID[stationId].body] || 3;
    return ring <= this.ship.uplinkRange;
  }

  buy(cid, tons) {
    if (!this.dockedAt) return false;
    const eco = this.economy;
    if (!eco.line(this.dockedAt, cid)) return false;
    let n = Math.max(0, Math.min(tons, eco.availableToBuy(this.dockedAt, cid), this.ship.cargoFree));
    // The price climbs as we buy, so shrink the lot until it is affordable.
    let est = eco.trade(this.dockedAt, cid, n, 'buy', false);
    for (let i = 0; i < 4 && est && est.total > this.credits; i++) {
      n *= (this.credits / est.total) * 0.98;
      est = eco.trade(this.dockedAt, cid, n, 'buy', false);
    }
    if (!est || n < 0.01 || est.total > this.credits) return false;
    eco.trade(this.dockedAt, cid, n, 'buy', true);
    this.credits -= est.total;
    this.ship.addCargo(cid, n);
    this.log(`Bought ${n.toFixed(1)} t ${COMMODITY_BY_ID[cid].name} for ${fmtCredits(est.total)} (avg ${fmtCredits(est.avg)}/t).`);
    this.emit();
    return true;
  }

  sell(cid, tons) {
    if (!this.dockedAt) return false;
    const have = this.ship.cargo[cid] || 0;
    const n = Math.min(tons, have);
    if (n < 0.01) return false;
    const res = this.economy.trade(this.dockedAt, cid, n, 'sell', true);
    if (!res) return false;
    this.credits += res.total;
    this.ship.addCargo(cid, -n);
    this.log(`Sold ${n.toFixed(1)} t ${COMMODITY_BY_ID[cid].name} for ${fmtCredits(res.total)} (avg ${fmtCredits(res.avg)}/t).`);
    this.emit();
    return true;
  }

  refuel(tons) {
    if (!this.dockedAt) return false;
    const price = this.economy.fuelPrice(this.dockedAt);
    const room = this.ship.propCapacity - this.ship.prop;
    const n = Math.max(0, Math.min(tons, room, this.credits / price));
    if (n < 0.01) return false;
    this.credits -= n * price;
    this.ship.prop += n;
    this.economy.applyBuy(this.dockedAt, 'h2', n * 0.6);
    this.log(`Loaded ${n.toFixed(1)} t propellant for ${fmtCredits(n * price)}.`);
    this.emit();
    return true;
  }

  /** Extract raw material at a mining claim; costs days. */
  mine(cid, days = 10) {
    const st = STATION_BY_ID[this.dockedAt];
    if (!st?.mining || !st.mining.goods.includes(cid)) return false;
    const tons = Math.min(st.mining.yield * days, this.ship.cargoFree);
    if (tons < 0.5) { this.log('Hold is full.'); this.emit(); return false; }
    this.passDays(days);
    this.ship.addCargo(cid, tons);
    this.log(`Extraction: ${tons.toFixed(0)} t ${COMMODITY_BY_ID[cid].name} over ${days} days.`);
    this.emit();
    return true;
  }

  upgrade(track, tier) {
    const chk = this.ship.canUpgrade(track, tier);
    if (!chk.ok) { this.log(`Refit refused: ${chk.why}.`); this.emit(); return false; }
    const spec = UPGRADES[track].tiers[tier];
    if (this.credits < spec.cost) { this.log('Insufficient credits for refit.'); this.emit(); return false; }
    if (!this.dockedAt || STATION_BY_ID[this.dockedAt].tech < 3) {
      this.log('Refit needs a tech-3 shipyard (Earth, Luna, Mars, Ceres, Callisto…).');
      this.emit(); return false;
    }
    this.credits -= spec.cost;
    this.ship.applyUpgrade(track, tier);
    this.passDays(REFIT_DAYS);
    this.log(`Refit complete: ${UPGRADES[track].name} → ${spec.name}.`, true);
    this.emit();
    return true;
  }

  // ---------- persistence ----------
  save() {
    const blob = {
      t: this.t, credits: this.credits, dockedAt: this.dockedAt,
      target: this.target, ship: this.ship.toJSON(),
      economy: this.economy.toJSON(), flight: this.flight,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(blob));
    this.log('State written to local storage.');
    this.emit();
  }

  load() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) { this.log('No save found.'); this.emit(); return false; }
    const o = JSON.parse(raw);
    this.t = o.t; this.credits = o.credits; this.dockedAt = o.dockedAt;
    this.target = o.target || 'tharsis';
    this.ship = Ship.fromJSON(o.ship);
    this.economy = Economy.fromJSON(o.economy);
    this.flight = o.flight || null;
    this.plan = null; this.rate = 0;
    this.log(`Restored ${fmtDate(this.t)}.`, true);
    this.emit();
    return true;
  }
}

export { STATIONS };