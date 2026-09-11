import { pushNoise, clamp01 } from '../core/AgentOps.js';

/** Bullying, fight initiation, and de-escalation. */
export class EscalationModel {
  static bully(state, bus, npc, target) {
    target.traits.fear = clamp01(target.traits.fear + 0.12);
    target.traits.trust = clamp01(target.traits.trust - 0.1);
    npc.traits.rage = clamp01(npc.traits.rage - 0.05);
    let kind = 'BULLY_INTIMIDATE';
    if (target.traits.rage > 0.6 || target.derived.aggression > 0.6) {
      kind = 'FIGHT';
      npc.freezeTurns = Math.max(npc.freezeTurns, 1);
      target.freezeTurns = Math.max(target.freezeTurns, 1);
      npc.traits.rage = clamp01(npc.traits.rage + 0.1);
      pushNoise(state, npc.position, 6, npc.id);
    }
    const rec = state.log({ type: 'CONFLICT', kind, npcId: npc.id, targetId: target.id, npcName: npc.name, targetName: target.name });
    bus.emit('SOCIAL_CONFLICT', { kind, npcId: npc.id, targetId: target.id, npcName: npc.name, targetName: target.name });
    return rec;
  }

  static deescalate(state, bus, npc) {
    npc.traits.rage = clamp01(npc.traits.rage - 0.35);
    npc.traits.trust = clamp01(npc.traits.trust + 0.2);
    npc.traits.fear = clamp01(npc.traits.fear - 0.1);
    npc.freezeTurns = 0;
    const rec = state.log({ type: 'DEESCALATE', npcId: npc.id, name: npc.name });
    bus.emit('DEESCALATED', { npcId: npc.id, name: npc.name });
    return rec;
  }
}