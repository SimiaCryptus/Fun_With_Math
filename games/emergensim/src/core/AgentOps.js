/** Shared, non-graphic agent state transitions (neutral "state removals"). */
export function clamp01(v) { return Math.min(1, Math.max(0, v)); }

export function pushNoise(state, position, loudness, source) {
  state.social.noiseEvents.push({ position: { ...position }, loudness, source, turn: state.meta.turnNumber });
}

export function evacuateNPC(state, bus, npc, reason = 'reached exit', causes = []) {
  if (npc.status === 'EVACUATED') return null;
  npc.status = 'EVACUATED';
  npc.carriedBy = null;
  if (state.player.physicalState.carrying === npc.id) state.player.physicalState.carrying = null;
  const rec = state.log({ type: 'NPC_EVACUATED', npcId: npc.id, name: npc.name, reason, causes });
  bus.emit('NPC_EVACUATED', { npcId: npc.id, name: npc.name, reason });
  return rec;
}

export function incapacitateNPC(state, bus, npc, reason, causes = []) {
  if (npc.status !== 'ACTIVE') return null;
  npc.status = 'INCAPACITATED';
  npc.freezeTurns = 0;
  const rec = state.log({ type: 'NPC_INCAPACITATED', npcId: npc.id, name: npc.name, reason, causes, key: `${npc.position.x},${npc.position.y},${npc.position.z}` });
  bus.emit('NPC_INCAPACITATED', { npcId: npc.id, name: npc.name, reason });
  return rec;
}

export function tagNPC(state, bus, npc, threatId) {
  if (npc.status === 'EVACUATED' || npc.status === 'TAGGED') return null;
  npc.status = 'TAGGED';
  npc.carriedBy = null;
  if (state.player.physicalState.carrying === npc.id) state.player.physicalState.carrying = null;
  const rec = state.log({ type: 'NPC_TAGGED', npcId: npc.id, name: npc.name, threatId });
  bus.emit('ENTITY_TAGGED', { id: npc.id, name: npc.name, threatId });
  return rec;
}

export function incapacitatePlayer(state, bus, reason, causes = []) {
  const ps = state.player.physicalState;
  if (ps.status !== 'ACTIVE') return null;
  ps.status = 'INCAPACITATED';
  const rec = state.log({ type: 'PLAYER_INCAPACITATED', reason, causes });
  bus.emit('PLAYER_INCAPACITATED', { reason });
  return rec;
}

export function tagPlayer(state, bus, threatId) {
  const ps = state.player.physicalState;
  if (ps.status !== 'ACTIVE') return null;
  ps.status = 'TAGGED';
  const rec = state.log({ type: 'PLAYER_TAGGED', threatId });
  bus.emit('ENTITY_TAGGED', { id: 'PLAYER', name: 'You', threatId });
  return rec;
}