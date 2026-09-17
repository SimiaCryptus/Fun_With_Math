/**
 * Moves the car through track space, keeps it on the road and fires
 * gameplay events (lap / pad / photon / wall).
 */
export class TrackPhysics {
  constructor(track, props) {
    this.track = track;
    this.props = props;
    this.halfWidth = track.width / 2 - 1.6;
  }

  static crossed(target, from, to, L) {
    if (to >= from) return target > from && target <= to;
    // wrapped past the start line
    return target > from || target <= to;
  }

  step(car, dt) {
    const events = [];
    const L = this.track.length;

    const ds = car.v * Math.cos(car.heading) * dt;
    const dd = car.v * Math.sin(car.heading) * dt;

    // ---- lateral ----
    car.d += dd;
    if (Math.abs(car.d) > this.halfWidth) {
      car.d = Math.sign(car.d) * this.halfWidth;
      car.heading *= -0.2;
      car.scrape = 1;
      events.push({ type: 'wall' });
    }

    // ---- longitudinal ----
    const from = car.s;
    let to = from + ds;
    let lapped = false;
    if (to >= L) { to -= L; lapped = true; }
    if (to < 0) { to += L; }
    car.s = to;

    // ---- pickups / pads ----
    if (this.props) {
      for (const pad of this.props.pads) {
        if (TrackPhysics.crossed(pad.s, from, to, L) &&
            Math.abs(car.d - pad.d) < pad.halfWidth) {
          car.hitBoostPad(1.1);
          events.push({ type: 'pad' });
        }
      }
      for (const ph of this.props.photons) {
        if (ph.taken) continue;
        if (TrackPhysics.crossed(ph.s, from, to, L) && Math.abs(car.d - ph.d) < 5) {
          ph.taken = true;
          ph.mesh.visible = false;
          events.push({ type: 'photon', photon: ph });
        }
      }
    }

    if (lapped) events.push({ type: 'lap' });
    return events;
  }
}