import { G0 } from '../core/units.js';
import { UPGRADES, TRACK_IDS } from '../data/upgrades.js';

const BASE_DRY = 62;   // tonnes of hull/avionics/life support before upgrades

export class Ship {
  constructor() {
    this.name = 'MV Perihelion';
    this.tier = { drive: 0, tanks: 0, hold: 0, aeroshell: 0, reactor: 0, uplink: 0 };
    this.prop = this.propCapacity;      // tonnes of propellant aboard
    this.cargo = {};                    // commodityId -> tonnes
    // Heliocentric canonical state; only meaningful while coasting.
    this.r = [1, 0, 0];
    this.v = [0, 1, 0];
    this.trail = [];
  }

  spec(track) { return UPGRADES[track].tiers[this.tier[track]]; }

  get isp()          { return this.spec('drive').isp; }
  get ve()           { return this.isp * G0; }            // m/s
  get propCapacity() { return this.spec('tanks').prop; }
  get cargoCapacity(){ return this.spec('hold').cargo; }
  get aeroFactor()   { return this.spec('aeroshell').aero; }
  get uplinkRange()  { return this.spec('uplink').range; }

  get dryMass() {
    let m = BASE_DRY;
    for (const t of TRACK_IDS) m += this.spec(t).dry || 0;
    return m;
  }
  get cargoMass() {
    let m = 0;
    for (const k in this.cargo) m += this.cargo[k];
    return m;
  }
  get cargoFree() { return Math.max(0, this.cargoCapacity - this.cargoMass); }
  get wetMass()   { return this.dryMass + this.prop + this.cargoMass; }

  /** Δv still available with the current load, in m/s. */
  get deltaV() {
    const m0 = this.wetMass;
    const m1 = m0 - this.prop;
    return m1 <= 0 ? Infinity : this.ve * Math.log(m0 / m1);
  }

  /** Propellant (tonnes) needed for a burn of `dv` m/s at the current mass. */
  propFor(dv) {
    return this.wetMass * (1 - Math.exp(-dv / this.ve));
  }

  /** @returns {boolean} true if the burn was affordable and executed. */
  burn(dv) {
    const need = this.propFor(dv);
    if (need > this.prop + 1e-9) return false;
    this.prop -= need;
    return true;
  }

  addCargo(id, tons) {
    this.cargo[id] = (this.cargo[id] || 0) + tons;
    if (this.cargo[id] <= 1e-9) delete this.cargo[id];
  }

  canUpgrade(track, tier) {
    const t = UPGRADES[track].tiers[tier];
    if (!t) return { ok: false, why: 'no such tier' };
    if (tier !== this.tier[track] + 1) return { ok: false, why: 'not next tier' };
    for (const [k, lvl] of Object.entries(t.req || {})) {
      if (this.tier[k] < lvl) {
        return { ok: false, why: `needs ${UPGRADES[k].name} tier ${lvl + 1}` };
      }
    }
    return { ok: true };
  }

  applyUpgrade(track, tier) {
    this.tier[track] = tier;
    this.prop = Math.min(this.prop, this.propCapacity);
    // Over-capacity cargo would need to be jettisoned; the shipyard UI
    // refuses the sale instead.
  }
  /**
   * Δv figures (m/s) as if `track` were at `tier`, with full tanks: empty
   * hold vs. a hold full of cargo. Lets the shipyard show the trade-off
   * before the player pays for it.
   */
  preview(track, tier) {
    const tiers = { ...this.tier, [track]: tier };
    const spec = (t) => UPGRADES[t].tiers[tiers[t]];
    let dry = BASE_DRY;
    for (const t of TRACK_IDS) dry += spec(t).dry || 0;
    const ve = spec('drive').isp * G0;
    const prop = spec('tanks').prop;
    const cargo = spec('hold').cargo;
    return {
      dry, prop, cargo,
      dvEmpty: ve * Math.log((dry + prop) / dry),
      dvFull: ve * Math.log((dry + prop + cargo) / (dry + cargo)),
    };
  }

  toJSON() {
    return {
      name: this.name, tier: this.tier, prop: this.prop,
      cargo: this.cargo, r: this.r, v: this.v,
    };
  }
  static fromJSON(o) {
    const s = new Ship();
    // Merge over defaults so an older save missing a track cannot produce
    // tiers[undefined] downstream.
    if (o?.name) s.name = o.name;
    s.tier = { ...s.tier, ...(o?.tier || {}) };
    s.prop = Math.min(Number.isFinite(o?.prop) ? o.prop : s.propCapacity, s.propCapacity);
    s.cargo = { ...(o?.cargo || {}) };
    if (Array.isArray(o?.r)) s.r = o.r;
    if (Array.isArray(o?.v)) s.v = o.v;
    return s;
  }
}