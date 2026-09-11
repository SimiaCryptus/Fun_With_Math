import { Grid3D } from '../spatial/Grid3D.js';
import { smokeDensityAt } from '../spatial/LineOfSight.js';
import { parseKey } from '../spatial/Tile.js';

const clamp = (v) => Math.min(1, Math.max(0, v));
const ACOUSTIC_RANGE = 4;

/**
 * Information diffusion graph. Claims: EXIT_BLOCKED (drives pathing) and THREAT_LOCATION (drives fear/flight).
 * DistortionChance = clamp(Listener.Stress·0.6 + (1 − Speaker.Trust)·0.4) · (1 − groupCohesion·0.5)
 */
export class RumorNetwork {
  constructor(state, bus) { this.state = state; this.bus = bus; }

  observe(npc, ctx) {
    if (!ctx.hazardVisible || !ctx.nearestHazardLocation) return;
    const h = ctx.nearestHazardLocation;
    if (h.kind === 'FIRE' || h.kind === 'SMOKE') {
      for (const exit of this.state.grid.exits()) {
        if (exit.coord.z === h.z && Grid3D.distance(exit.coord, h) <= 3) this.originate(npc, { claimType: 'EXIT_BLOCKED', exitKey: exit.key, veracity: true });
      }
    } else if (h.kind === 'THREAT') {
      this.originate(npc, { claimType: 'THREAT_LOCATION', threatPos: { x: h.x, y: h.y, z: h.z }, veracity: true });
    }
  }

  originate(npc, claim) {
    const rumors = this.state.social.rumors;
    const same = rumors.find((r) => r.claimType === claim.claimType && r.exitKey === claim.exitKey && r.holders.has(npc.id));
    if (same) return same;
    const rumor = { id: rumors.length + 1, ...claim, confidenceScore: 0.9, distortionFactor: 0, holders: new Set([npc.id]), originTurn: this.state.meta.turnNumber, origin: npc.id };
    rumors.push(rumor);
    this._adopt(npc, rumor);
    this.state.log({ type: 'RUMOR_ORIGINATED', npcId: npc.id, claimType: rumor.claimType, exitKey: rumor.exitKey || null, veracity: rumor.veracity });
    return rumor;
  }

  propagate() {
    const s = this.state;
    const npcs = [...s.npcs.values()].filter((n) => n.status === 'ACTIVE' && !n.carriedBy);
    const heardThisTurn = new Set();
    for (const rumor of [...s.social.rumors]) {
      for (const speakerId of [...rumor.holders]) {
        const speaker = s.npcs.get(speakerId);
        if (!speaker || speaker.status !== 'ACTIVE') continue;
        for (const listener of npcs) {
          if (listener.id === speakerId || heardThisTurn.has(listener.id) || rumor.holders.has(listener.id)) continue;
          if (listener.position.z !== speaker.position.z || Grid3D.distance(listener.position, speaker.position) > ACOUSTIC_RANGE) continue;
          heardThisTurn.add(listener.id);
          const chance = clamp(listener.derived.stress * 0.6 + (1 - speaker.traits.trust) * 0.4) * (1 - s.social.groupCohesion * 0.5);
          if (s.random() < chance) this._distort(rumor, speaker, listener);
          else { rumor.holders.add(listener.id); this._adopt(listener, rumor); }
        }
      }
    }
  }

  _adopt(npc, rumor) {
    if (rumor.claimType === 'EXIT_BLOCKED') npc.beliefs.blockedExits.add(rumor.exitKey);
    else if (rumor.claimType === 'THREAT_LOCATION') {
      npc.beliefs.lastKnownThreat = { ...rumor.threatPos };
      npc.traits.fear = clamp(npc.traits.fear + 0.15);
    }
  }

  _distort(rumor, speaker, listener) {
    const s = this.state;
    let distorted = null;
    if (rumor.claimType === 'EXIT_BLOCKED') {
      const others = s.grid.exits().filter((e) => e.key !== rumor.exitKey && e.coord.z === listener.position.z);
      if (!others.length) { rumor.holders.add(listener.id); this._adopt(listener, rumor); return; }
      others.sort((a, b) => Grid3D.distance(a.coord, listener.position) - Grid3D.distance(b.coord, listener.position));
      const target = others[0];
      distorted = { claimType: 'EXIT_BLOCKED', exitKey: target.key, veracity: this.isExitBlocked(target.key) };
    } else {
      const dims = s.grid.dimensions;
      const p = rumor.threatPos;
      distorted = { claimType: 'THREAT_LOCATION', threatPos: { x: dims.x - 1 - p.x, y: p.y, z: p.z }, veracity: false };
    }
    const nr = { id: s.social.rumors.length + 1, ...distorted, confidenceScore: rumor.confidenceScore * 0.75, distortionFactor: rumor.distortionFactor + 1, holders: new Set([listener.id]), originTurn: s.meta.turnNumber, origin: listener.id, parentId: rumor.id };
    s.social.rumors.push(nr);
    this._adopt(listener, nr);
    s.log({ type: 'RUMOR_DISTORTED', speakerId: speaker.id, listenerId: listener.id, claimType: nr.claimType, fromExit: rumor.exitKey || null, toExit: nr.exitKey || null, veracity: nr.veracity });
    this.bus.emit('RUMOR_DISTORTED', { speaker: speaker.name, listener: listener.name, claimType: nr.claimType, exitKey: nr.exitKey });
    listener.lastDialogKey = nr.claimType === 'EXIT_BLOCKED' ? 'RUMOR' : 'RUMOR_THREAT';
    listener.lastDialogTurn = -9;
  }

  isExitBlocked(exitKey) {
    const c = parseKey(exitKey);
    if (smokeDensityAt(this.state, exitKey) > 0.5) return true;
    for (const key of this.state.hazards.fireCells.keys()) {
      const f = parseKey(key);
      if (f.z === c.z && Grid3D.distance(f, c) <= 2) return true;
    }
    return false;
  }

  /** Authoritative broadcast (alarm / intercom) corrects false beliefs for agents who trust the institution. */
  clearFalseBeliefs(minTrust) {
    let cleared = 0;
    for (const npc of this.state.npcs.values()) {
      if (npc.status !== 'ACTIVE' || npc.traits.trust < minTrust) continue;
      for (const exitKey of [...npc.beliefs.blockedExits]) {
        if (!this.isExitBlocked(exitKey)) { npc.beliefs.blockedExits.delete(exitKey); cleared++; }
      }
    }
    if (cleared) this.state.log({ type: 'RUMORS_CORRECTED', count: cleared });
    return cleared;
  }
}