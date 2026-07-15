// Composable loss surface + analytic gradients.
import {valueNoise, latticeMask} from './noise.js';

export class Objective {
    constructor(config) {
        this.config = config;
    }

    value(x, y) {
        const c = this.config;
         const g = c.global || {sx: 1, sy: 1, sz: 1};
        let v = 0;
        if (c.base === 'bowl') {
            const {kx, ky, cx, cy} = c.bowl;
            v += kx * (x - cx) ** 2 + ky * (y - cy) ** 2;
        } else {
            const {a, b} = c.linear;
            v += a * x + b * y;
        }
        if (c.noiseOn) {
            const {amp, fx, fy, seed} = c.noise;
             v += amp * valueNoise(g.sx * fx * x, g.sy * fy * y, seed).v;
        }
        if (c.latticeOn) {
              const {L, f, cgx, cgy, offset, seed} = c.lattice;
              const m = latticeMask(g.sx * x, g.sy * y, L, f, seed, offset).val;
            v += m * (cgx * x + cgy * y);
        }
         return g.sz * v;
    }

    grad(x, y) {
        const c = this.config;
         const g = c.global || {sx: 1, sy: 1, sz: 1};
        let gx = 0, gy = 0;
        if (c.base === 'bowl') {
            const {kx, ky, cx, cy} = c.bowl;
            gx += 2 * kx * (x - cx);
            gy += 2 * ky * (y - cy);
        } else {
            const {a, b} = c.linear;
            gx += a;
            gy += b;
        }
        if (c.noiseOn) {
            const {amp, fx, fy, seed} = c.noise;
             const n = valueNoise(g.sx * fx * x, g.sy * fy * y, seed);
             gx += amp * n.dvx * fx * g.sx;
             gy += amp * n.dvy * fy * g.sy;
        }
        if (c.latticeOn) {
              const {L, f, cgx, cgy, offset, seed} = c.lattice;
              const m = latticeMask(g.sx * x, g.sy * y, L, f, seed, offset);
            const inner = cgx * x + cgy * y;
             gx += m.dx * g.sx * inner + m.val * cgx;
             gy += m.dy * g.sy * inner + m.val * cgy;
        }
         return [gx * g.sz, gy * g.sz];
    }

    // Numerical gradient for verification.
    gradFD(x, y, h = 1e-4) {
        const dx = (this.value(x + h, y) - this.value(x - h, y)) / (2 * h);
        const dy = (this.value(x, y + h) - this.value(x, y - h)) / (2 * h);
        return [dx, dy];
    }
}