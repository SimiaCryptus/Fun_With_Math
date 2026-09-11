/** Deterministic utility arbitration across discrete tactical behaviors. */
export class BehaviorTree {
  static arbitrate(npc, ctx, mode = 'EVACUATE') {
    const d = npc.derived;
    // 1. FREEZE THRESHOLD: extreme fear paralyzes agency
    if (d.stress > 0.85 && d.confidence < 0.2) return { type: 'FREEZE', duration: 1, reason: 'Paralyzing panic' };
    if (mode === 'LOCKDOWN') return BehaviorTree._lockdown(npc, ctx);
    if (mode === 'SHELTER') return BehaviorTree._shelter(npc, ctx);
    return BehaviorTree._evacuate(npc, ctx);
  }

  static _bullyTarget(npc, ctx) {
    if (!(ctx.isLowImmediateDanger && npc.derived.aggression > 0.75)) return null;
    return ctx.nearbyAgents.find((o) => o.socialRank < npc.socialRank && o.traits.trust < 0.4) || null;
  }

  static _evacuate(npc, ctx) {
    const d = npc.derived, t = npc.traits;
    // 2. SOCIAL FRICTION & ESCALATION
    const target = BehaviorTree._bullyTarget(npc, ctx);
    if (target) return { type: 'ESCALATE_CONFLICT', targetId: target.id, conflictType: 'BULLY_INTIMIDATE' };
    // 2b. Follow a trusted leader
    if (ctx.playerVisible && t.trust > 0.65 && d.stress < 0.85 && ctx.playerDist > 1.5) return { type: 'FOLLOW_PLAYER' };
    // 3. COOPERATIVE PROTOCOL ADHERENCE
    if (t.cohesion > 0.6 && ctx.activeAlarm && d.stress < 0.7 && ctx.nearestStandardExit) {
      return { type: 'EXECUTE_DRILL_PROTOCOL', designatedExit: ctx.nearestStandardExit.tile.key };
    }
    // 4. EVASION & FLIGHT
    if (d.stress > 0.5 && ctx.nearestHazardLocation) return { type: 'FLEE_FROM', threatOrigin: ctx.nearestHazardLocation };
    // 4b. Greed delay
    if (t.greed > 0.7 && d.stress > 0.3 && ctx.hazardVisible) return { type: 'GATHER_BELONGINGS' };
    // 4c. Visible hazard + composure -> leave via standard route
    if (ctx.hazardVisible && d.confidence > 0.4 && ctx.nearestStandardExit) {
      return { type: 'EXECUTE_DRILL_PROTOCOL', designatedExit: ctx.nearestStandardExit.tile.key };
    }
    // 5. DEFAULT COGNITIVE WANDERING
    return { type: 'SEEK_INFORMATION' };
  }

  static _lockdown(npc, ctx) {
    const d = npc.derived, t = npc.traits;
    if (ctx.threatVisible && ctx.lastKnownThreat) return { type: 'FLEE_FROM', threatOrigin: ctx.lastKnownThreat };
    if (ctx.playerVisible && t.trust > 0.6 && d.stress < 0.8 && ctx.playerDist > 1.5) return { type: 'FOLLOW_PLAYER' };
    if (t.cohesion > 0.5 && ctx.activeAlarm && d.stress < 0.85) return { type: 'SHELTER' };
    if (d.stress > 0.6 && ctx.lastKnownThreat) return { type: 'FLEE_FROM', threatOrigin: ctx.lastKnownThreat };
    const target = BehaviorTree._bullyTarget(npc, ctx);
    if (target) return { type: 'ESCALATE_CONFLICT', targetId: target.id, conflictType: 'BULLY_INTIMIDATE' };
    return { type: 'SEEK_INFORMATION' };
  }

  static _shelter(npc, ctx) {
    const d = npc.derived, t = npc.traits;
    if (t.cohesion > 0.5 && ctx.activeAlarm) return { type: 'SHELTER' };
    if (ctx.playerVisible && t.trust > 0.6 && ctx.playerDist > 1.5) return { type: 'FOLLOW_PLAYER' };
    if (d.stress > 0.5 && ctx.nearestHazardLocation) return { type: 'FLEE_FROM', threatOrigin: ctx.nearestHazardLocation };
    return { type: 'SEEK_INFORMATION' };
  }
}