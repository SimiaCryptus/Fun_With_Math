// No-Three-in-Line problem solver via continuous potential-well relaxation.
//
// Each tracked line ℓ gets a soft population p(ℓ) = Σ exp(-dᵢ²/2σ²),
// with fitness f(p) = (p-2)² so the force changes sign at p = 2:
//   p < 2 → attractive, p = 2 → neutral, p > 2 → repulsive.
//
// Total energy:
//   E = λ_line Σ_lines f(p) + λ_grid Σ_pts [1-cos(2πx)]+[1-cos(2πy)]
//       + λ_box  Σ_pts boundary(x)
//
// Lines are a dynamic set: rows, columns, ±1 diagonals, plus lines through
// every pair of currently-active points (rational slopes that matter now).

export class NoThreeInLine {
  constructor(params) {
    this.params = { ...params };
    this.step0 = 0;
    this.metrics = {
      step: 0,
      energy: 0,
      numLines: 0,
      violating: 0,
      validPoints: 0,
    };

    const { n, k } = params;
    // Random initial positions in [0, n-1]^2
    const init = [];
    for (let i = 0; i < k; i++) {
      init.push([Math.random() * (n - 1), Math.random() * (n - 1)]);
    }
    this.points = tf.variable(tf.tensor2d(init));

    this.lines = []; // {a,b,c} normalized so a²+b²=1
    this.rebuildLines();
    this.lineRebuildEvery = 25;

    this.makeOptimizer();
  }

  makeOptimizer() {
    if (this.params.optimizerType === 'sgd') {
      this.optimizer = tf.train.momentum(this.params.lr, 0.9);
    } else {
      this.optimizer = tf.train.adam(this.params.lr);
    }
  }

  updateParams(params) {
    const optChanged =
      params.optimizerType !== this.params.optimizerType || params.lr !== this.params.lr;
    this.params = { ...this.params, ...params };
    if (optChanged) this.makeOptimizer();
  }

  // Effective σ and λ_grid given annealing schedule.
  schedule() {
    let sigma = this.params.sigma;
    let lambdaGrid = this.params.lambdaGrid;
    if (this.params.anneal) {
      // Decay σ toward 0.12, grow λ_grid toward 3x over ~600 steps.
      const t = Math.min(1, this.metrics.step / 600);
      sigma = this.params.sigma * (1 - t) + 0.12 * t;
      lambdaGrid = this.params.lambdaGrid * (1 + 2 * t);
    }
    return { sigma, lambdaGrid };
  }

  // Build candidate line set from current point positions.
  rebuildLines() {
    const { n } = this.params;
    const seen = new Set();
    const lines = [];
    const addLine = (a, b, c) => {
      // normalize so a²+b²=1 and leading sign canonical
      const norm = Math.hypot(a, b);
      if (norm < 1e-9) return;
      a /= norm;
      b /= norm;
      c /= norm;
      if (a < -1e-9 || (Math.abs(a) < 1e-9 && b < 0)) {
        a = -a;
        b = -b;
        c = -c;
      }
      const key = `${a.toFixed(4)},${b.toFixed(4)},${c.toFixed(4)}`;
      if (seen.has(key)) return;
      seen.add(key);
      lines.push({ a, b, c });
    };

    // Rows: y = j  → 0*x + 1*y = j
    for (let j = 0; j < n; j++) addLine(0, 1, j);
    // Columns: x = i → 1*x + 0*y = i
    for (let i = 0; i < n; i++) addLine(1, 0, i);
    // Diagonals slope +1: x - y = c
    for (let c = -(n - 1); c <= n - 1; c++) addLine(1, -1, c);
    // Diagonals slope -1: x + y = c
    for (let c = 0; c <= 2 * (n - 1); c++) addLine(1, 1, c);

    // Dynamic: lines through pairs of current points.
    const pts = this.points.arraySync();
    const K = pts.length;
    for (let i = 0; i < K; i++) {
      for (let j = i + 1; j < K; j++) {
        const dx = pts[j][0] - pts[i][0];
        const dy = pts[j][1] - pts[i][1];
        if (Math.hypot(dx, dy) < 0.3) continue; // too close, skip
        // normal (a,b) = (dy, -dx); line through point i
        const a = dy;
        const b = -dx;
        const c = a * pts[i][0] + b * pts[i][1];
        addLine(a, b, c);
      }
    }

    this.lines = lines;
    // Pack as tensors for the loss.
    this.lineA = tf.tensor1d(lines.map((l) => l.a));
    this.lineB = tf.tensor1d(lines.map((l) => l.b));
    this.lineC = tf.tensor1d(lines.map((l) => l.c));
    this.metrics.numLines = lines.length;
  }

  // Soft populations p(ℓ) for all lines given point positions.
  // points: [K,2]; returns [L]
  computePopulations(points, sigma) {
    // signed distance dᵢ(ℓ) = a*x + b*y - c
    const x = points.slice([0, 0], [-1, 1]); // [K,1]
    const y = points.slice([0, 1], [-1, 1]); // [K,1]
    // [K, L]
    const ax = tf.matMul(x, this.lineA.reshape([1, -1]));
    const by = tf.matMul(y, this.lineB.reshape([1, -1]));
    const d = tf.sub(tf.add(ax, by), this.lineC.reshape([1, -1])); // [K,L]
    const w = tf.exp(tf.div(tf.neg(tf.square(d)), 2 * sigma * sigma));
    // population per line = sum over points
    return tf.sum(w, 0); // [L]
  }

  lossFn(sigma, lambdaGrid) {
    return () => {
      const pts = this.points;
      const { n, lambdaLine } = this.params;

      // Line / population term: λ_line Σ (p-2)²
      const pop = this.computePopulations(pts, sigma); // [L]
      const fit = tf.square(tf.sub(pop, 2)); // [L]
      const lineLoss = tf.mul(tf.sum(fit), lambdaLine);

      // Grid snap: [1-cos(2πx)] + [1-cos(2πy)]
      const twoPi = 2 * Math.PI;
      // simpler & correct grid term:
      const g = tf.sub(1, tf.cos(tf.mul(pts, twoPi))); // [K,2]
      const gridTerm = tf.mul(tf.sum(g), lambdaGrid);

      // Box penalty: keep inside [0, n-1]
      const lo = tf.relu(tf.neg(pts)); // >0 when below 0
      const hi = tf.relu(tf.sub(pts, n - 1)); // >0 when above n-1
      const boxTerm = tf.mul(tf.sum(tf.add(tf.square(lo), tf.square(hi))), 5.0);

      return tf.add(tf.add(lineLoss, gridTerm), boxTerm);
    };
  }

  step() {
    const { sigma, lambdaGrid } = this.schedule();

    // Periodically rebuild dynamic line set.
    if (this.metrics.step % this.lineRebuildEvery === 0 && this.metrics.step > 0) {
      this.disposeLineTensors();
      this.rebuildLines();
    }

    tf.tidy(() => {
      const lossFunction = this.lossFn(sigma, lambdaGrid);
      const value = this.optimizer.minimize(lossFunction, true, [this.points]);
      this.metrics.energy = value.dataSync()[0];

      // Entropic noise injection.
      if (this.params.noise > 1e-6) {
        const noise = tf.randomNormal(this.points.shape, 0, this.params.noise);
        this.points.assign(tf.add(this.points, noise));
      }
    });

    this.metrics.step++;
    this.evaluate(sigma);
  }

  // Round, dedupe, and check integer collinearity for true validation.
  evaluate(sigma) {
    const { n } = this.params;
    const pts = this.points.arraySync();
    // round to lattice, clamp
    const rounded = [];
    const occ = new Set();
    for (const [px, py] of pts) {
      let ix = Math.round(px);
      let iy = Math.round(py);
      ix = Math.max(0, Math.min(n - 1, ix));
      iy = Math.max(0, Math.min(n - 1, iy));
      const key = `${ix},${iy}`;
      if (occ.has(key)) continue;
      occ.add(key);
      rounded.push([ix, iy]);
    }

    // Check every triple for exact collinearity (cross product == 0).
    const R = rounded.length;
    let violatingTriples = 0;
    const badPoints = new Set();
    for (let i = 0; i < R; i++) {
      for (let j = i + 1; j < R; j++) {
        for (let l = j + 1; l < R; l++) {
          const [ax, ay] = rounded[i];
          const [bx, by] = rounded[j];
          const [cx, cy] = rounded[l];
          const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
          if (cross === 0) {
            violatingTriples++;
            badPoints.add(i);
            badPoints.add(j);
            badPoints.add(l);
          }
        }
      }
    }

    this.metrics.validPoints = violatingTriples === 0 ? R : R - badPoints.size;

    // Count soft-violating lines for display (population > 2.5).
    tf.tidy(() => {
      const pop = this.computePopulations(this.points, sigma).arraySync();
      this._lastPop = pop;
      let v = 0;
      for (const p of pop) if (p > 2.5) v++;
      this.metrics.violating = v;
    });
  }

  getViz() {
    const pts = this.points.arraySync().map(([x, y]) => ({ x, y }));
    const pop = this._lastPop || this.lines.map(() => 0);
    const lines = this.lines.map((l, i) => ({
      a: l.a,
      b: l.b,
      c: l.c,
      pop: pop[i] || 0,
    }));
    return { points: pts, lines };
  }
  // Return current point positions as plain array [[x,y],...].
  getPoints() {
    return this.points.arraySync();
  }
  // Move a single point (by index) to a new (x,y) position, clamped to grid.
  setPoint(index, x, y) {
    const { n } = this.params;
    const pts = this.points.arraySync();
    if (index < 0 || index >= pts.length) return;
    pts[index][0] = Math.max(0, Math.min(n - 1, x));
    pts[index][1] = Math.max(0, Math.min(n - 1, y));
    const next = tf.tensor2d(pts);
    this.points.assign(next);
    next.dispose();
    // Refresh metrics/visuals against the new position.
    const { sigma } = this.schedule();
    this.evaluate(sigma);
  }

  disposeLineTensors() {
    if (this.lineA) this.lineA.dispose();
    if (this.lineB) this.lineB.dispose();
    if (this.lineC) this.lineC.dispose();
  }

  dispose() {
    this.disposeLineTensors();
    if (this.points) this.points.dispose();
    if (this.optimizer && this.optimizer.dispose) this.optimizer.dispose();
  }
}
