// Driver profiles (SPEC §9.1 / §9.2). Data only; behaviour hooks live in src/sim/drivers/*.js.
export const DRIVERS = {
  red: {
    id: 'red', label: 'The Psycho', rule: 'HUNTS', colorHex: 0xe63939, icon: '▲',
     bodyWeights: { sedan: 0.4, hatch: 0.15, suv: 0.15, pickup: 0.15, moto: 0.15 },
    v0Factor: 1.35, v0Jitter: 0.10, aMax: 3.5, bComf: 2.5, bMax: 9.0, T: 0.6, s0: 1.5,
    p: -0.5, lcThreshold: 0.05, bSafe: 6.0, lcCooldown: 1.0, indicatorLead: 0.0, vzMax: 1.6, vzMaxEmergency: 3.2,
    reactionTime: 0.15, sensorRange: 45, coneHalfAngle: 35, detectRange: 40, predictionTime: 0.8,
    trackHold: 1.0, occlusionPenalty: 0.5, crouchSeeChance: 0.05, panicTTC: 1.5, startleFactor: 1.0, pathMargin: 0.3,
    playerGain: -1.0, brakeNoise: 0.05, steerNoise: 0.05, hornChance: 0.9,
     extras: { lockTTC: 4.5, lockDuration: 4.0, commitTTC: 1.4, cooldown: 2.0 },
  },
  yellow: {
    id: 'yellow', label: 'The Panicker', rule: 'PANICS', colorHex: 0xf2c724, icon: '⚡',
     bodyWeights: { hatch: 0.4, sedan: 0.3, van: 0.15, suv: 0.1, moto: 0.05 },
     // bMax is deliberately beyond a normal car: a Yellow stab stops dead and gets rear-ended
     v0Factor: 0.95, v0Jitter: 0.15, aMax: 2.0, bComf: 4.5, bMax: 15.0, T: 1.4, s0: 2.6,
    p: 0.2, lcThreshold: 0.40, bSafe: 4.0, lcCooldown: 1.5, indicatorLead: 0.1, vzMax: 1.6, vzMaxEmergency: 3.2,
    reactionTime: 0.35, sensorRange: 30, coneHalfAngle: 60, detectRange: 25, predictionTime: 0.0,
    trackHold: 0.6, occlusionPenalty: 0.5, crouchSeeChance: 0.3, panicTTC: 2.0, startleFactor: 0.9, pathMargin: 0.4,
    playerGain: 0.4, brakeNoise: 0.60, steerNoise: 0.35, hornChance: 0.5,
    // panicRange: the squirrel only counts as a trigger inside this distance, ahead of the car
    extras: { panicDecay: 1.0, swerveChance: 0.3, panicRange: 12 },
  },
  blue: {
    id: 'blue', label: 'The Hero', rule: 'SWERVES', colorHex: 0x3a7bd5, icon: '⛨',
     bodyWeights: { sedan: 0.35, suv: 0.3, hatch: 0.15, van: 0.1, moto: 0.1 },
    v0Factor: 1.00, v0Jitter: 0.05, aMax: 2.6, bComf: 3.0, bMax: 9.0, T: 1.2, s0: 2.0,
    p: 1.5, lcThreshold: 0.02, bSafe: 8.0, lcCooldown: 1.2, indicatorLead: 0.8, vzMax: 1.6, vzMaxEmergency: 3.2,
    reactionTime: 0.12, sensorRange: 60, coneHalfAngle: 75, detectRange: 55, predictionTime: 1.5,
    trackHold: 1.5, occlusionPenalty: 0.5, crouchSeeChance: 0.3, panicTTC: 2.5, startleFactor: 1.0, pathMargin: 0.5,
    playerGain: 2.0, brakeNoise: 0.02, steerNoise: 0.02, hornChance: 0.1,
    extras: { horizon: 2.5, overcompensate: 1.25 },
  },
  green: {
    id: 'green', label: 'The Road Rager', rule: 'RAGES', colorHex: 0x3fb650, icon: '≫',
     bodyWeights: { pickup: 0.3, suv: 0.3, sedan: 0.2, hatch: 0.1, moto: 0.1 },
    v0Factor: 1.15, v0Jitter: 0.10, aMax: 3.0, bComf: 3.0, bMax: 9.0, T: 0.9, s0: 1.6,
    p: -0.2, lcThreshold: 0.20, bSafe: 5.0, lcCooldown: 1.0, indicatorLead: 0.2, vzMax: 1.6, vzMaxEmergency: 3.2,
    reactionTime: 0.20, sensorRange: 40, coneHalfAngle: 45, detectRange: 35, predictionTime: 0.4,
    trackHold: 0.8, occlusionPenalty: 0.5, crouchSeeChance: 0.2, panicTTC: 1.5, startleFactor: 0.7, pathMargin: 0.2,
    playerGain: 0.2, brakeNoise: 0.15, steerNoise: 0.10, hornChance: 0.7,
    extras: { rageRate: 0.125, rageDecay: 0.10 },
  },
  purple: {
    id: 'purple', label: 'The Oblivious', rule: 'DOZES', colorHex: 0x9b4fd6, icon: '◐',
     bodyWeights: { sedan: 0.3, van: 0.3, hatch: 0.15, suv: 0.2, moto: 0.05 },
    v0Factor: 1.00, v0Jitter: 0.08, aMax: 1.8, bComf: 2.0, bMax: 8.0, T: 1.0, s0: 2.0,
    p: 0.5, lcThreshold: 0.60, bSafe: 3.0, lcCooldown: 3.0, indicatorLead: 0.4, vzMax: 1.6, vzMaxEmergency: 3.2,
    reactionTime: 0.90, sensorRange: 25, coneHalfAngle: 25, detectRange: 12, predictionTime: 0.0,
    trackHold: 0.2, occlusionPenalty: 0.5, crouchSeeChance: 0.1, panicTTC: 1.0, startleFactor: 0.5, pathMargin: 0.3,
     playerGain: 0.3, brakeNoise: 0.10, steerNoise: 0.14, hornChance: 0.05,
     extras: { flinch: 1.1 },
  },
  white: {
     id: 'white', label: 'The Professional', rule: 'STEADY', colorHex: 0xe8e6de, icon: '▬',
    bodyWeights: { box: 0.35, van: 0.25, sedan: 0.3, bus: 0.1 },
    v0Factor: 1.00, v0Jitter: 0.02, aMax: 1.5, bComf: 2.0, bMax: 7.5, T: 1.6, s0: 3.0,
    p: 1.0, lcThreshold: 0.50, bSafe: 2.5, lcCooldown: 4.0, indicatorLead: 1.5, vzMax: 1.0, vzMaxEmergency: 1.0,
    reactionTime: 0.50, sensorRange: 50, coneHalfAngle: 50, detectRange: 45, predictionTime: 0.6,
    trackHold: 1.0, occlusionPenalty: 0.5, crouchSeeChance: 0.2, panicTTC: 2.0, startleFactor: 1.0, pathMargin: 0.4,
    playerGain: 0.5, brakeNoise: 0.00, steerNoise: 0.00, hornChance: 0.2,
    extras: {},
  },
};

export const DRIVER_RULES = {
  red: "Red hunts. Don't be in front of it — break line of sight or crouch.",
   yellow: 'Yellow panics when you get close in front of it. It stands on the brakes hard enough to get rear-ended, swerves at random — then floors it again.',
  blue: 'Blue swerves to save you. Step out to bait it and open a lane.',
  green: 'Green rages in slow traffic. Watch it when a lane jams.',
  purple: "Purple didn't see you. It never does until it's too late.",
  white: 'White is steady. It only brakes — never swerves. Build your plan on it.',
};