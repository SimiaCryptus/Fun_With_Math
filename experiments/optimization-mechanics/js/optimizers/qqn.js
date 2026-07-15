// QQN: quadratic path between steepest descent and L-BFGS directions,
// with golden-section line search over t in [0,1].
import {LBFGS} from './lbfgs.js';

export class QQN {
    constructor(params = {}) {
        this.name = 'QQN';
        this.params = {lr: params.lr ?? 0.05, m: params.m ?? 8};
        this.lbfgs = new LBFGS({lr: 1.0, m: this.params.m});
        this.reset(0, 0);
    }

    reset(x0, y0) {
        this.x = x0;
        this.y = y0;
        this.lbfgs.reset(x0, y0);
    }

    step(obj) {
        const from = [this.x, this.y];
        const g = obj.grad(this.x, this.y);

        // update L-BFGS history from previous move
        if (this.lbfgs.prevX) {
            const s = [this.x - this.lbfgs.prevX[0], this.y - this.lbfgs.prevX[1]];
            const yv = [g[0] - this.lbfgs.prevG[0], g[1] - this.lbfgs.prevG[1]];
            if (dot(s, yv) > 1e-10) {
                this.lbfgs.s.push(s);
                this.lbfgs.yv.push(yv);
                if (this.lbfgs.s.length > this.params.m) {
                    this.lbfgs.s.shift();
                    this.lbfgs.yv.shift();
                }
            }
        }

        // steepest descent direction (scaled by lr)
        const d_sd = [-this.params.lr * g[0], -this.params.lr * g[1]];

        // L-BFGS direction
        let d_lbfgs = this.lbfgs.direction(g);
        if (this.lbfgs.s.length === 0) d_lbfgs = d_sd.slice();

        // quadratic path: step(t) = t(1-t) d_sd + t^2 d_lbfgs
        const pathPoint = (t) => [
            this.x + t * (1 - t) * d_sd[0] + t * t * d_lbfgs[0],
            this.y + t * (1 - t) * d_sd[1] + t * t * d_lbfgs[1],
        ];

        // sample path for rendering
        const path = [];
        for (let i = 0; i <= 20; i++) {
            const t = i / 20;
            const p = pathPoint(t);
            path.push([p[0], p[1]]);
        }

        // golden-section search over t in [0,1]
        const probes = [];
        const f = (t) => {
            const p = pathPoint(t);
            const loss = obj.value(p[0], p[1]);
            probes.push({x: p[0], y: p[1], t, loss});
            return loss;
        };
        const chosenT = goldenSection(f, 0, 1, 1e-3, 30);
        const to = pathPoint(chosenT);

        const oracle = [this.x + d_lbfgs[0], this.y + d_lbfgs[1]];

        this.lbfgs.prevX = [this.x, this.y];
        this.lbfgs.prevG = g;
        this.x = to[0];
        this.y = to[1];

        return {from, to, grad: g, oracle, path, probes, chosenT};
    }

    getState() {
        return {pos: [this.x, this.y], histLen: this.lbfgs.s.length};
    }
}

function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1];
}

function goldenSection(f, a, b, tol, maxIter) {
    const gr = (Math.sqrt(5) - 1) / 2;
    let c = b - gr * (b - a);
    let d = a + gr * (b - a);
    let fc = f(c), fd = f(d);
    for (let i = 0; i < maxIter && (b - a) > tol; i++) {
        if (fc < fd) {
            b = d;
            d = c;
            fd = fc;
            c = b - gr * (b - a);
            fc = f(c);
        } else {
            a = c;
            c = d;
            fc = fd;
            d = a + gr * (b - a);
            fd = f(d);
        }
    }
    return (a + b) / 2;
}