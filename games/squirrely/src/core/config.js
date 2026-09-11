const PROFILE_NUMBERS = [
  'v0Factor', 'v0Jitter', 'aMax', 'bComf', 'bMax', 'T', 's0',
  'p', 'lcThreshold', 'bSafe', 'lcCooldown', 'indicatorLead', 'vzMax', 'vzMaxEmergency',
  'reactionTime', 'sensorRange', 'coneHalfAngle', 'detectRange', 'predictionTime', 'trackHold',
  'occlusionPenalty', 'crouchSeeChance', 'panicTTC', 'startleFactor', 'pathMargin',
  'playerGain', 'brakeNoise', 'steerNoise', 'hornChance',
];

function fail(path, msg) {
  throw new Error(`config: ${path} ${msg}`);
}

export function validateProfiles(profiles, knownBodies) {
  for (const id in profiles) {
    const p = profiles[id];
    const path = `drivers.${id}`;
    if (p.id !== id) fail(`${path}.id`, `must equal key '${id}'`);
    for (const k of PROFILE_NUMBERS) {
      if (typeof p[k] !== 'number' || Number.isNaN(p[k])) fail(`${path}.${k}`, 'must be a number');
    }
    if (typeof p.colorHex !== 'number') fail(`${path}.colorHex`, 'must be a number');
    if (!p.bodyWeights || Object.keys(p.bodyWeights).length === 0) fail(`${path}.bodyWeights`, 'must be non-empty');
    for (const b in p.bodyWeights) if (!knownBodies.includes(b)) fail(`${path}.bodyWeights.${b}`, 'unknown body type');
    if (p.reactionTime < 0 || p.reactionTime > 1.0) fail(`${path}.reactionTime`, 'out of range [0,1]');
  }
}

export function validateLevel(level, profiles, idx) {
  const path = `levels[${idx}] (${level.id ?? '?'})`;
  if (!Array.isArray(level.rows) || level.rows.length < 3) fail(`${path}.rows`, 'need at least 3 rows');
  if (level.rows[0].type !== 'verge') fail(`${path}.rows[0]`, 'first row must be a verge');
  const goals = level.rows.filter((r) => r.goal);
  if (goals.length !== 1) fail(`${path}.rows`, 'exactly one goal row required');
  level.rows.forEach((r, i) => {
    const rp = `${path}.rows[${i}]`;
    if (!['verge', 'shoulder', 'lane', 'median', 'curb'].includes(r.type)) fail(rp, `unknown row type '${r.type}'`);
    if (r.type === 'lane') {
      if (r.dir !== 1 && r.dir !== -1) fail(`${rp}.dir`, 'must be 1 or -1');
      if (!(r.speedLimit > 0)) fail(`${rp}.speedLimit`, 'must be > 0');
      if (!(r.density > 0)) fail(`${rp}.density`, 'must be > 0');
      const prev = level.rows[i - 1];
      if (prev && prev.type === 'lane' && prev.dir !== r.dir) fail(rp, 'head-on lanes must be separated by a median or curb');
    }
  });
  let sum = 0;
  for (const k in level.mix) {
    if (!profiles[k]) fail(`${path}.mix.${k}`, 'unknown driver id');
    sum += level.mix[k];
  }
  if (!(sum > 0)) fail(`${path}.mix`, 'weights must sum to > 0');
}

export function validateTuning(t) {
  if (!(t.dt > 0 && t.dt < 0.05)) fail('tuning.dt', 'out of range');
  if (!(t.maxSubsteps >= 1)) fail('tuning.maxSubsteps', 'must be >= 1');
  if (!(t.xMax > t.xMin)) fail('tuning.xMax', 'must exceed xMin');
  if (!Array.isArray(t.hollowXs) || t.hollowXs.length !== 4) fail('tuning.hollowXs', 'must list 4 hollows');
}

export function validateAll(profiles, levels, tuning, knownBodies) {
  validateTuning(tuning);
  validateProfiles(profiles, knownBodies);
  levels.forEach((l, i) => validateLevel(l, profiles, i));
}