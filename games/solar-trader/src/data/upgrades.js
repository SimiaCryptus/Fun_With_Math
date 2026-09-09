// Every track is a straight trade-off; dry mass grows with capability so a
// maxed hold on a weak drive is a deliberate trap.

export const UPGRADES = {
  drive: {
    name: 'Drive',
    desc: 'Specific impulse. Sets how far a tonne of propellant gets you.',
    tiers: [
      { name: 'NTR-900 "Kestrel"',   isp: 900,  dry: 40, cost: 0,        req: {} },
      { name: 'Ion Cluster VX-3',    isp: 3200, dry: 52, cost: 4.5e6,    req: { reactor: 1 } },
      { name: 'MPD "Longhaul"',      isp: 4800, dry: 68, cost: 2.4e7,    req: { reactor: 2 } },
      { name: 'D-He3 Fusion Torch',  isp: 6500, dry: 95, cost: 1.4e8,    req: { reactor: 3 } },
    ],
  },
  tanks: {
    name: 'Tanks',
    desc: 'Propellant capacity in tonnes.',
    tiers: [
      { name: 'Standard Bunkerage', prop: 220, dry: 18, cost: 0 },
      { name: 'Extended Bunkerage', prop: 360, dry: 27, cost: 3.2e6 },
      { name: 'Drop-Ring Tankage',  prop: 560, dry: 40, cost: 1.8e7 },
      { name: 'Cryo Torus',         prop: 820, dry: 58, cost: 9.0e7 },
    ],
  },
  hold: {
    name: 'Hold',
    desc: 'Cargo capacity in tonnes. Cargo mass eats your Δv.',
    tiers: [
      { name: 'Class-C Hold', cargo: 180, dry: 22, cost: 0 },
      { name: 'Class-B Hold', cargo: 300, dry: 34, cost: 5.0e6 },
      { name: 'Class-A Hold', cargo: 480, dry: 50, cost: 2.8e7 },
      { name: 'Bulk Frame',   cargo: 700, dry: 74, cost: 1.2e8 },
    ],
  },
  aeroshell: {
    name: 'Aeroshell',
    desc: 'Aerocapture at bodies with atmospheres. Cuts arrival Δv.',
    tiers: [
      { name: 'None',              aero: 0.00, dry: 0,  cost: 0 },
      { name: 'Ablative Shell',    aero: 0.45, dry: 14, cost: 7.5e6 },
      { name: 'Magnetoshell',      aero: 0.70, dry: 20, cost: 6.0e7 },
    ],
  },
  reactor: {
    name: 'Reactor',
    desc: 'Power plant. Prerequisite for high-Isp drives.',
    tiers: [
      { name: 'RTG Bank',        pwr: 0, dry: 6,  cost: 0 },
      { name: 'Fission Core 40', pwr: 1, dry: 16, cost: 3.0e6 },
      { name: 'Fission Core 200',pwr: 2, dry: 30, cost: 2.0e7 },
      { name: 'Tokamak Pile',    pwr: 3, dry: 52, cost: 1.1e8 },
    ],
  },
  uplink: {
    name: 'Uplink',
    desc: 'Remote market telemetry. Lets you plan trades before you arrive.',
    tiers: [
      { name: 'Local Only',      range: 0, dry: 0, cost: 0 },
      { name: 'Inner-System Net',range: 1, dry: 1, cost: 2.0e6 },
      { name: 'Belt Relay',      range: 2, dry: 2, cost: 1.2e7 },
      { name: 'Deep Space Array',range: 3, dry: 3, cost: 5.0e7 },
    ],
  },
};

export const TRACK_IDS = Object.keys(UPGRADES);