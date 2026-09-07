const DEG = Math.PI / 180, G = 9.81;

/**
 * Complementary filter: gyro-propagated gravity blended with the accelerometer.
 * θ = 0.98·(θ + ω·dt) + 0.02·θ_accel — gyro alone drifts, accel alone jitters on a speaker cab.
 * Output `down` is the screen-space "which way is down" unit-ish vector (x right, y up, z out of screen).
 */
export class Fusion {
  constructor({ gyroWeight = 0.98, lowpass = 0.9 } = {}) {
    this.w = gyroWeight; this.lp = lowpass;
    this.g = [0, G, 0];                 // reading-space gravity estimate (device upright by default)
    this.lin = [0, 0, 0]; this._prevLin = [0, 0, 0];
    this.linScreen = [0, 0, 0];
    this.down = [0, -1, 0];
    this.jerk = 0; this.spinRate = 0; this.flat = 0; this.hasGyro = false;
  }

  update(incl, acc, rate, dt, angle = 0) {
    const g = this.g;
    dt = Math.max(dt, 1e-3);
    if (incl && incl.x != null) {
      const mx = incl.x, my = incl.y, mz = incl.z;
      if (rate && rate.alpha != null) {
        this.hasGyro = true;
        const wx = rate.beta * DEG, wy = rate.gamma * DEG, wz = rate.alpha * DEG;
        this.spinRate = Math.hypot(wx, wy, wz);
        // A fixed world vector seen from a rotating frame: dg/dt = -ω × g
        const cx = wy * g[2] - wz * g[1], cy = wz * g[0] - wx * g[2], cz = wx * g[1] - wy * g[0];
        g[0] = this.w * (g[0] - cx * dt) + (1 - this.w) * mx;
        g[1] = this.w * (g[1] - cy * dt) + (1 - this.w) * my;
        g[2] = this.w * (g[2] - cz * dt) + (1 - this.w) * mz;
      } else {
        g[0] = this.lp * g[0] + (1 - this.lp) * mx;
        g[1] = this.lp * g[1] + (1 - this.lp) * my;
        g[2] = this.lp * g[2] + (1 - this.lp) * mz;
      }
      const lin = acc && acc.x != null ? [acc.x, acc.y, acc.z] : [mx - g[0], my - g[1], mz - g[2]];
      const p = this._prevLin;
      this.jerk = Math.hypot(lin[0] - p[0], lin[1] - p[1], lin[2] - p[2]) / dt;
      this._prevLin = lin; this.lin = lin;
    }

    // Rotate device x/y into screen x/y by -angle (angle = screen.orientation.angle)
    const a = -angle * DEG, c = Math.cos(a), s = Math.sin(a);
    const dx = -g[0], dy = -g[1];                        // reading points away from gravity
    this.down = [(dx * c - dy * s) / G, (dx * s + dy * c) / G, -g[2] / G];
    const l = this.lin;
    this.linScreen = [l[0] * c - l[1] * s, l[0] * s + l[1] * c, l[2]];
    const mag = Math.hypot(g[0], g[1], g[2]) || G;
    this.flat = Math.abs(g[2]) / mag;
  }
}