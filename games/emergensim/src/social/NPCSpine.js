const clamp = (v) => Math.min(1, Math.max(0, v));

/** Unified 5-variable psychological model -> derived cognitive drivers. */
export class NPCSpine {
  /**
   * @param {Object} traits - { fear, greed, trust, rage, cohesion }
   * @param {Object} context - { nearestHazardDistance, smokeHere }
   */
  static evaluateDerivedState(traits, context) {
    const dist = context.nearestHazardDistance ?? 99;
    const hazardProximityFactor = Math.max(0, 1.0 - dist / 10.0);
    const stress = clamp(traits.fear * 0.7 + traits.rage * 0.3 + hazardProximityFactor * 0.5 + (context.smokeHere || 0) * 0.3);
    const confidence = clamp(traits.trust * 0.5 + traits.cohesion * 0.5 - stress * 0.4);
    const aggression = clamp(traits.rage * 0.6 + traits.greed * 0.4 - traits.trust * 0.3);
    const empathy = clamp(traits.trust * 0.5 + traits.cohesion * 0.3 - traits.fear * 0.4);
    const riskTolerance = clamp(confidence * 0.7 - stress * 0.3);
    return { stress, confidence, aggression, empathy, riskTolerance };
  }

  /** Diagnostic dialog key: dialog is telemetry of the internal state, not narrative. */
  static selectDiagnosticDialog(npc, context) {
    const { stress, aggression, confidence } = npc.derived;
    const last = context.lastAction;
    if (npc.status === 'INCAPACITATED') return 'NEED_ASSIST';
    if (stress > 0.85) return 'PANIC_FREEZE';
    if (aggression > 0.75 && context.hasSocialFriction) return 'BULLY_AGGRESSION';
    if (last === 'SHELTER') return 'SHELTER';
    if (last === 'EXECUTE_DRILL_PROTOCOL') return confidence > 0.6 ? 'LEADERSHIP_CALM' : 'DRILL';
    if (last === 'FOLLOW_PLAYER') return 'FOLLOW';
    if (last === 'FLEE_FROM') return 'FLEE';
    if (confidence > 0.7 && npc.traits.cohesion > 0.6) return 'LEADERSHIP_CALM';
    if (context.hazardVisible && stress > 0.5) return 'WARN_HAZARD';
    if (last === 'GATHER_BELONGINGS' || (npc.traits.greed > 0.8 && stress > 0.4)) return 'GREED_BELONGINGS';
    return 'STATUS_IDLE';
  }
}