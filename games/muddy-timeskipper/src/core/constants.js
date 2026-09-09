// All tuning lives here. Sim layer only. No THREE.
export const MPH = 0.44704;                 // 1 mph in m/s
export const SIM_HZ = 120;
export const SIM_DT = 1 / SIM_HZ;
export const HISTORY_HZ = 60;
export const HISTORY_DT = 1 / HISTORY_HZ;
export const MAX_OFFSET_S = 40;             // longest gear offset we must remember

export const V88 = 88 * MPH;                // 39.3216 m/s  -> arm threshold
export const V_MAX = 47.0;

export const VEHICLE = {
  V_MAX: 47.0,                                // engine-limited top speed (m/s); also exported above
  TORQUE: 15.5, BRAKE: 18.0, REVERSE: 6.0,
  BASE_GRIP: 1.0, LAT_K: 6.5, LAT_MAX: 22.0,
  STEER_MAX: 1.9, STEER_FALLOFF: 26.0, YAW_DAMP: 9.0, OVERSTEER_K: 0.055,
  AIR_DRAG: 0.0022, MUD_DRAG: 0.9, ROLL_RES: 0.35,
  GRAVITY: 24.0, BOUNCE: 0.18,
  HALF_WIDTH: 1.35, HALF_LEN: 2.4, RADIUS: 2.0, MASS: 1.0,
  INSTABILITY_LO: 0.82, INSTABILITY_HI: 1.0,   // fraction of V88
  ROLL_LIMIT: 1.7, ROLL_TIME: 0.35,
  STUCK_SPEED: 1.5, STUCK_DEPTH: 0.6, STUCK_TIME: 4.0
};

export const MUD = { GRIP_K: 1.6, RUT_PULL: 1.25, RUT_EMA: 0.15, DEFORM_MAX: 1.0 };

export const SNAP = {
  ARM_GRACE: 0.75,
  MAX_SPEED: 44.0,
  GAIN_CAP: 1.15,
  VERTICAL_SCALE: 0.35,
  MAX_FALL: 40.0,
  SWITCH_LOCKOUT: 1.2,
  RHYTHM_LIMIT: 4,
  RHYTHM_MUD_PENALTY: 0.18
};