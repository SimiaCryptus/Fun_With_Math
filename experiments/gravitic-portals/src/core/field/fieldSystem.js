// @ts-check
import * as V from '../vec3.js';
import { makePortal, compareIds } from '../portal.js';
import { createPair } from '../portalMap.js';
import { createTabulatedModel } from './tabulated.js';

/**
  * Owns the portal set, builds pairs, caches the tabulated field model per configuration.
 * `version` increments on any portal/term change (recompute trigger, idea.md §8).
  * `table`: decoded field table (table.js) or null ⇒ every pair is solved directly.
 */
export class FieldSystem {
   constructor(background, portals = [], { coef = {}, terms = {}, table = null } = {}) {
    this.background = background;
    this.coef = { ...coef };
    this.terms = { ...terms };
     this.table = table;
    this.version = 0;
    this._portals = [...portals].sort((a, b) => compareIds(a.id, b.id));
    this._cache = null;
  }

  get portals() { return this._portals; }

  setPortals(list) {
    this._portals = [...list].sort((a, b) => compareIds(a.id, b.id));
    this._invalidate();
  }

  updatePortal(id, patch) {
    const i = this._portals.findIndex((p) => p.id === id);
    if (i < 0) throw new Error(`no portal ${id}`);
    const old = this._portals[i];
    const next = makePortal({
      id: old.id,
      linkId: old.linkId,
      center: patch.center ?? old.center,
      normal: patch.normal ?? old.normal,
      up: patch.up ?? (patch.normal ? undefined : old.up),
      radius: patch.radius ?? old.radius,
    });
    this._portals = this._portals.map((p, j) => (j === i ? next : p));
    this._invalidate();
  }

  setTerms(terms) { this.terms = { ...this.terms, ...terms }; this._invalidate(); }
  setCoefficients(coef) { this.coef = { ...this.coef, ...coef }; this._invalidate(); }
   setTable(table) { this.table = table; this._invalidate(); }

  _invalidate() { this.version++; this._cache = null; }

  _build() {
    const byId = new Map(this._portals.map((p) => [p.id, p]));
    const pairs = [];
    for (const p of this._portals) {
      if (p.linkId == null) continue;
      const q = byId.get(p.linkId);
      if (!q || q.linkId !== p.id || compareIds(p.id, q.id) >= 0) continue;
      pairs.push(createPair(p, q, this.background));
    }
     const model = createTabulatedModel(pairs, this.background, { table: this.table, terms: this.terms, coef: this.coef });
    const entries = [];
    for (const pair of pairs) {
      entries.push({ portal: pair.a, map: pair.map, exit: pair.b });
      entries.push({ portal: pair.b, map: pair.inverse, exit: pair.a });
    }
    entries.sort((x, y) => compareIds(x.portal.id, y.portal.id));
    this._cache = { pairs, model, entries };
    return this._cache;
  }

  get pairs() { return (this._cache ?? this._build()).pairs; }
  get model() { return (this._cache ?? this._build()).model; }
  get crossingEntries() { return (this._cache ?? this._build()).entries; }

  /** Φ_c */
  potential(x) { return this.model.potential(x); }
  /** Φ₀ + Φ_c */
  totalPotential(x) { return this.background.potential(x) + this.model.potential(x); }
  /** E_CF */
  field(x) { return this.model.field(x); }
  /** g_eff = g₀ + E_CF */
  geff(x) { return V.add(this.background.accel(x), this.model.field(x)); }
}