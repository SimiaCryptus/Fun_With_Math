import { FireModel } from './FireModel.js';
import { SmokeModel } from './SmokeModel.js';
import { StructuralModel } from './StructuralModel.js';
import { ThreatEntityModel } from './ThreatEntityModel.js';
import { keyOf } from '../spatial/Tile.js';

/** Hazard lifecycle orchestrator: thermal -> smoke (hazard phase), threats (social phase), structure + scheduled events (environment phase). */
export class HazardManager {
  constructor(state, eventBus) {
    this.state = state;
    this.bus = eventBus;
    this.fire = new FireModel(state, eventBus);
    this.smoke = new SmokeModel(state, eventBus);
    this.structural = new StructuralModel(state, eventBus);
    this.threat = new ThreatEntityModel(state, eventBus);
  }

  processHazardTick() {
    this.fire.tick();
    this.smoke.tick();
    this.bus.emit('HAZARDS_UPDATED', {
      fireCount: this.state.hazards.fireCells.size,
      smokeCount: this.state.hazards.smokeCells.size,
    });
  }

  processThreatTick() { this.threat.tick(); }

  processEnvironmentTick() {
    const s = this.state;
    this.structural.tick();
    for (const ev of s.scenario.events || []) {
      if (ev.turn !== s.meta.turnNumber) continue;
      this._runScheduled(ev);
    }
  }

  _runScheduled(ev) {
    const s = this.state;
    const rec = s.log({ type: 'SCHEDULED_EVENT', eventType: ev.type, magnitude: ev.magnitude, message: ev.message || ev.type });
    switch (ev.type) {
      case 'AFTERSHOCK': this.structural.applyShock(ev.magnitude ?? 0.3, rec.id); break;
      case 'WIND_GUST': this.structural.windGust(rec.id); break;
      case 'ALARM': s.social.alarmActive = true; break;
      case 'FIRE': if (ev.position) this.fire.ignite(keyOf(ev.position), 'EVENT', ev.intensity ?? 0.5); break;
      case 'SMOKE': if (ev.position) { const k = keyOf(ev.position); const c = s.hazards.smokeCells.get(k) || { density: 0 }; c.density = Math.min(1, c.density + (ev.intensity ?? 0.5)); s.hazards.smokeCells.set(k, c); } break;
      default: break;
    }
    this.bus.emit('EVENT_BANNER', { message: ev.message || ev.type, eventType: ev.type });
  }
}