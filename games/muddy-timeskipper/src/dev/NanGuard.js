/**
 * Dev-only NaN tripwire.
 *
 * Usage: call `guard.probe('label', tick)` at phase boundaries inside your
 * fixed step. The first probe that trips tells you which phase produced the
 * poison, and it prints the last *clean* snapshot of that body so you can see
 * the inputs that caused it (typically a 0-speed divide or a mud sample at an
 * off-track position).
 *
 * By default it repairs the body from the last clean snapshot and keeps the
 * race running, so one bad AI frame doesn't nuke the session.
 */

// Plain scalars we can both read and write.
const SCALARS = ['yaw', 'yawRate', 'mudLoad', 'instability', 'rollRisk', 'slip', 'stuckTimer', 'rollTimer'];
// Derived getters: read-only, report but never assign.
const DERIVED = ['forwardSpeed', 'speed'];
const VECTORS = ['pos', 'vel'];
const INPUTS = ['throttle', 'brake', 'steer'];

const bad = (n) => typeof n === 'number' && !Number.isFinite(n);

function scanBody(b) {
  const out = [];
  for (const k of SCALARS) if (k in b && bad(b[k])) out.push([k, b[k]]);
  for (const name of VECTORS) {
    const v = b[name];
    if (!v) continue;
    for (const a of ['x', 'y', 'z']) if (bad(v[a])) out.push([`${name}.${a}`, v[a]]);
  }
  if (b.input) for (const k of INPUTS) if (bad(b.input[k])) out.push([`input.${k}`, b.input[k]]);
  for (const k of DERIVED) { try { if (bad(b[k])) out.push([k, b[k]]); } catch { /* getter blew up */ } }
  return out;
}

function snapBody(b) {
  const s = { pos: { ...(b.pos || {}) }, vel: { ...(b.vel || {}) }, input: { ...(b.input || {}) } };
  for (const k of SCALARS) if (k in b) s[k] = b[k];
  return s;
}

export class NanGuard {
  constructor(race, { halt = false, maxReports = 4, onHalt = null } = {}) {
    this.race = race;
    this.halt = halt;
    this.maxReports = maxReports;
    this.onHalt = onHalt;
    this.reports = 0;
    this.trips = 0;
    this.lastLabel = 'init';
    this.prev = new Map();
    for (const v of race.all) this.prev.set(v, snapBody(v.body));
  }

  /** @returns {boolean} true when everything is finite. */
  probe(label, tick) {
    let clean = true;
    for (const v of this.race.all) {
      const b = v.body;
      const bads = scanBody(b);
      if (!bads.length) { this.prev.set(v, snapBody(b)); continue; }
      clean = false;
      this.trips++;
      this._report(label, tick, v, bads);
      this._recover(v);
    }
    this.lastLabel = label;
    return clean;
  }

  _report(label, tick, v, bads) {
    if (this.reports++ >= this.maxReports) return;
    const prev = this.prev.get(v);
    console.groupCollapsed(
      `[NaN] tick ${tick} @ ${label} — ${v.id}: ${bads.map(([k]) => k).join(', ')}`
    );
    console.log('bad values:', Object.fromEntries(bads));
    console.log(`last clean state (captured at probe "${this.lastLabel}"):`, prev);
    console.log('current input:', { ...(v.body.input || {}) });
    console.log('body:', v.body);
    console.groupEnd();
    if (this.halt && this.onHalt) this.onHalt();
  }

  _recover(v) {
    const p = this.prev.get(v);
    const b = v.body;
    if (!p) return;
    if (b.pos && p.pos) { b.pos.x = p.pos.x; b.pos.y = p.pos.y; b.pos.z = p.pos.z; }
    if (b.vel) { b.vel.x = 0; b.vel.y = 0; b.vel.z = 0; }   // bleed off the poisoned momentum
    for (const k of SCALARS) {
      if (!(k in b) || Number.isFinite(b[k])) continue;
      b[k] = Number.isFinite(p[k]) ? p[k] : 0;
    }
    if (b.input) for (const k of INPUTS) if (!Number.isFinite(b.input[k])) b.input[k] = 0;
  }
}