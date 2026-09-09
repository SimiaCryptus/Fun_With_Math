// Long straight for the 88 mph run-up, two hairpins where a slow past vector saves you,
// a mud pit "anchor" placed where players will want to bank a low velocity.
export default {
  id: 'sludge-speedway',
  name: 'The Sludge Speedway',
  laps: 3,
  seed: 90210,
  rain: 0.35,
  centerline: [
    [   0, 0,    0], [ 140, 0,   10], [ 300, 0,   30], [ 420, 0,  110],
    [ 430, 0,  230], [ 340, 0,  300], [ 210, 0,  290], [ 150, 0,  210],
    [  60, 0,  200], [ -60, 0,  250], [-160, 0,  210], [-180, 0,  100],
    [-120, 0,   20]
  ],
  widths: [22, 26, 26, 18, 14, 12, 14, 11, 16, 20, 18, 16, 20],
  mudZones: [
    { x: 170, z: 215, r: 45, depth: 0.85, wetness: 0.95 },  // the ANCHOR pit
    { x: 425, z: 175, r: 55, depth: 0.55, wetness: 0.7 },
    { x: -70, z: 245, r: 60, depth: 0.7, wetness: 0.85 },
    { x: 300, z: 295, r: 35, depth: 0.4, wetness: 0.5 }
  ],
  hazards: [
    { type: 'geyser', x: 220, z: 285, period: 7.5, phase: 0 },
    { type: 'geyser', x: -150, z: 205, period: 5.0, phase: 2.1 },
    { type: 'worm',   x: 350, z: 60,  period: 9.0, phase: 1.0 }
  ],
  checkpoints: [0.0, 0.25, 0.5, 0.75],
   // dusty amber afternoon; everything in sRGB hex, converted by three's ColorManagement
   ambience: {
     zenith: 0x35507a, horizon: 0x9a7c4c, fog: 0x8f7546, sun: 0xffe2b0,
     grass: 0x55602a, dry: 0x7a5f2c, packed: 0x5a4424, wet: 0x261a0a, slime: 0x5c7a1c,
     curbA: 0xc8452a, curbB: 0xe9ddc2
   }
};