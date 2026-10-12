import * as THREE from 'three';
import {OrthoView} from './renderer.js';
import {coordAt, F, FULL_DOMAIN, inDomain, nearestIndex, NF} from '../core/grid.js';
import {isExitLabel, LABEL} from '../core/conventions.js';
import {viridis} from './colormaps.js';

function segments(pos, col, color = 0xffffff, opacity = 1) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    if (col) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const m = new THREE.LineBasicMaterial({
        color: col ? 0xffffff : color, vertexColors: !!col,
        transparent: opacity < 1, opacity, depthTest: false
    });
    const l = new THREE.LineSegments(g, m);
    l.renderOrder = 3;
    return l;
}

function place(mesh, d) {
    mesh.scale.set(d.x1 - d.x0, d.y1 - d.y0, 1);
    mesh.position.set((d.x0 + d.x1) / 2, (d.y0 + d.y1) / 2, 0);
}

function rect(d, color) {
    const {x0, x1, y0, y1} = d;
    return segments([x0, y0, 0, x1, y0, 0, x1, y0, 0, x1, y1, 0, x1, y1, 0, x0, y1, 0, x0, y1, 0, x0, y0, 0], null, color);
}

function clearGroup(g) {
    for (const c of [...g.children]) {
        g.remove(c);
        c.geometry?.dispose();
        c.material?.dispose();
    }
}

function makeTex(rgba, N) {
    const t = new THREE.DataTexture(rgba, N, N, THREE.RGBAFormat);
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
}

const cellOf = (g) => Math.min(g.dom.x1 - g.dom.x0, g.dom.y1 - g.dom.y0) / g.N;
/** THREE.Color from an sRGB triple in [0, 1]. */
const srgb = (c) => new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
const DEFAULT_PAL = {
    frame: [0.27, 0.33, 0.4], cross: [0, 1, 1], inset: [1, 0.8, 0.2], stream: [1, 1, 1],
    glyph: [0.6, 0.9, 1], glyphFlip: [1, 0.3, 0.3], tick: [1, 1, 0.3],
};


export class ManifoldView extends OrthoView {
    constructor() {
        super();
        this.scene.background = new THREE.Color(0x07080b);
        this.quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({color: 0x111111, depthTest: false}));
        this.inset = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({color: 0xffffff, depthTest: false}));
        this.quad.renderOrder = 0;
        this.inset.renderOrder = 1;
        this.inset.visible = false;
        this.frameG = new THREE.Group();
        this.insetFrameG = new THREE.Group();
        this.overlays = new THREE.Group();
        this.crossG = new THREE.Group();
        this.scene.add(this.quad, this.inset, this.frameG, this.insetFrameG, this.overlays, this.crossG);
        this.tex = null;
        this.texN = 0;
        this.insetTex = null;
        this.insetN = 0;
        this.userMoved = false;
        this.dom = null;
        this.pal = {...DEFAULT_PAL};
        this._ov = null;
        this._cross = null;
        this._insetDom = null;
        this.setDomain(FULL_DOMAIN);
    }
     /** Theme background colour (sRGB triple in [0, 1]). */
     setBackground(rgb) {
         if (rgb) this.scene.background.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
     }
     /** Overlay colours (sRGB triples) from the theme; rebuilds frame, inset outline, overlays and cross. */
     setPalette(pal) {
         for (const k of Object.keys(DEFAULT_PAL)) if (pal[k]) this.pal[k] = pal[k];
         this._buildFrame();
         if (this._insetDom) {
             clearGroup(this.insetFrameG);
             this.insetFrameG.add(rect(this._insetDom, srgb(this.pal.inset)));
         }
         if (this._ov) this.setOverlays(...this._ov);
         if (this._cross) this.setCross(...this._cross);
     }
     _buildFrame() {
         const d = this.dom;
         clearGroup(this.frameG);
         if (!d) return;
         const c = srgb(this.pal.frame);
         this.frameG.add(rect(d, c));
         if (d.y0 < 0 && d.y1 > 0) this.frameG.add(segments([d.x0, 0, 0, d.x1, 0, 0], null, c));
     }


/** Switch the plotted domain (encounter manifold or burn manifold). Clears image, inset and overlays. */
setDomain(d) {
        this.dom = d;
        place(this.quad, d);
        this.tex?.dispose();
        this.tex = null;
        this.texN = 0;
        this.quad.material.dispose();
        this.quad.material = new THREE.MeshBasicMaterial({color: 0x111111, depthTest: false});
        this._buildFrame();
        this.clearInset();
        this.setOverlays(null);
        this.setCross(null);
        this.fit();
    }

    fit() {
        const d = this.dom, w = d.x1 - d.x0, h = d.y1 - d.y0;
        this.cx = (d.x0 + d.x1) / 2;
        this.cy = (d.y0 + d.y1) / 2;
        this.hh = Math.max(h / 2, w / 2 / this.aspect) * 1.06;
        this.userMoved = false;
        this.updateCam();
    }
     /** The domain plus a small margin; zooming out stops a little beyond the full-map fit. */
     limits() {
         const d = this.dom;
         if (!d) return null;
         const mx = 0.05 * (d.x1 - d.x0), my = 0.05 * (d.y1 - d.y0);
         return {x0: d.x0 - mx, x1: d.x1 + mx, y0: d.y0 - my, y1: d.y1 + my, maxZoomOut: 1.2};
     }


    /** Refit on resize only while the user has not panned/zoomed. */
    onResize() {
        if (!this.userMoved && this.dom) this.fit();
    }

    zoom(f, u, v) {
        this.userMoved = true;
        super.zoom(f, u, v);
    }

    pan(du, dv) {
        this.userMoved = true;
        super.pan(du, dv);
    }

    /** World rectangle currently visible. */
    viewBounds() {
        const c = this.camera;
        return {x0: c.left, x1: c.right, y0: c.bottom, y1: c.top};
    }

    setImage(rgba, N) {
        if (!this.tex || this.texN !== N) {
            this.tex?.dispose();
            this.tex = makeTex(rgba, N);
            this.texN = N;
            this.quad.material.dispose();
            this.quad.material = new THREE.MeshBasicMaterial({map: this.tex, depthTest: false});
        } else {
            this.tex.image.data = rgba;
            this.tex.needsUpdate = true;
        }
    }

    /** High-resolution image locked to the world window d. */
    setInset(rgba, N, d) {
        if (!this.insetTex || this.insetN !== N) {
            this.insetTex?.dispose();
            this.insetTex = makeTex(rgba, N);
            this.insetN = N;
            this.inset.material.dispose();
            this.inset.material = new THREE.MeshBasicMaterial({map: this.insetTex, depthTest: false});
        } else {
            this.insetTex.image.data = rgba;
            this.insetTex.needsUpdate = true;
        }
        place(this.inset, d);
        this.inset.visible = true;
        this._insetDom = d;
        clearGroup(this.insetFrameG);
        this.insetFrameG.add(rect(d, srgb(this.pal.inset)));
    }

    clearInset() {
        this.inset.visible = false;
        this._insetDom = null;
        clearGroup(this.insetFrameG);
    }

    setOverlays(grid, opts = {}, view = null) {
        this._ov = grid ? [grid, opts, view] : null;
        clearGroup(this.overlays);
        if (!grid) return;
        const ex = view?.dom ?? null, grids = view ? [view, grid] : [grid];
        if (opts.quiver) {
            this.overlays.add(buildQuiver(grid, ex));
            if (view) this.overlays.add(buildQuiver(view));
        }
        if (opts.stream) this.overlays.add(buildStreamlines(grids, this.dom, srgb(this.pal.stream)));
        if (opts.glyph) {
            this.overlays.add(buildGlyphs(grid, ex, this.pal));
            if (view) this.overlays.add(buildGlyphs(view, null, this.pal));
        }
    }

    setCross(a, b) {
        this._cross = a == null ? null : [a, b];
        clearGroup(this.crossG);
        if (a == null) return;
        const s = 0.08;
        this.crossG.add(segments([a - s, b, 0, a + s, b, 0, a, b - s, 0, a, b + s, 0], null, srgb(this.pal.cross)));
    }
}

const val = (g, k, f) => g.data[k * NF + F[f]];

function buildQuiver(g, ex = null) {
    const N = g.N, st = Math.max(1, Math.round(N / 32)), cell = st * cellOf(g);
    let max = 0;
    for (let j = 0; j < N; j += st) for (let i = 0; i < N; i += st) {
        const k = j * N + i;
        if (!isExitLabel(g.label[k])) continue;
        const m = Math.hypot(val(g, k, 'dvx'), val(g, k, 'dvy'));
        if (Number.isFinite(m)) max = Math.max(max, m);
    }
    const pos = [], col = [];
    if (!(max > 0)) return segments(pos, null);
    for (let j = st >> 1; j < N; j += st) for (let i = st >> 1; i < N; i += st) {
        const k = j * N + i;
        if (!isExitLabel(g.label[k])) continue;
        const [a, b] = coordAt(i, j, N, g.dom);
        if (ex && inDomain(ex, a, b)) continue;
        const vx = val(g, k, 'dvx'), vy = val(g, k, 'dvy'), m = Math.hypot(vx, vy);
        if (!(m > 0)) continue;
        const L = cell * 0.9 * Math.sqrt(Math.min(1, m / max)), ux = vx / m, uy = vy / m;
        const tx = a + ux * L, ty = b + uy * L, hl = L * 0.3;
        pos.push(a, b, 0, tx, ty, 0,
            tx, ty, 0, tx - hl * (ux * 0.87 - uy * 0.5), ty - hl * (uy * 0.87 + ux * 0.5), 0,
            tx, ty, 0, tx - hl * (ux * 0.87 + uy * 0.5), ty - hl * (uy * 0.87 - ux * 0.5), 0);
        const c = viridis(Math.min(1, m / max)).map((v) => v / 255);
        for (let q = 0; q < 6; q++) col.push(...c);
    }
    return segments(pos, col);
}

/** Streamlines of ∇ΔE, sampling the finest grid (locked view first) that covers each point. */
function buildStreamlines(grids, dom, color = 0xffffff) {
    const W = dom.x1 - dom.x0, H = dom.y1 - dom.y0, pos = [], lastG = grids[grids.length - 1];
    const wrap = (a) => (dom.periodicX ? ((((a - dom.x0) % W) + W) % W) + dom.x0 : a);
    const sample = (a, b) => {
        for (const g of grids) {
            if (!inDomain(g.dom, a, b)) continue;
            const [i, j] = nearestIndex(a, b, g.N, g.dom), k = j * g.N + i, l = g.label[k];
            if (l === LABEL.PENDING && g !== lastG) continue;
            if (!isExitLabel(l)) return null;
            const gx = val(g, k, 'gA'), gy = val(g, k, 'gB'), m = Math.hypot(gx, gy);
            return m > 0 && Number.isFinite(m) ? [gx / m, gy / m, 1.5 * cellOf(g)] : null;
        }
        return null;
    };
    for (let sj = 0; sj < 16; sj++) for (let si = 0; si < 32; si++) {
        let a = dom.x0 + ((si + 0.5 + 0.3 * Math.sin(si * 7.1 + sj)) / 32) * W;
        let b = dom.y0 + ((sj + 0.5 + 0.3 * Math.cos(sj * 3.7 + si)) / 16) * H;
        for (let n = 0; n < 120; n++) {
            const d1 = sample(a, b);
            if (!d1) break;
            const h = d1[2];
            const d2 = sample(wrap(a + 0.5 * h * d1[0]), b + 0.5 * h * d1[1]);
            if (!d2) break;
            const na = a + h * d2[0], nb = b + h * d2[1];
            if (na >= dom.x0 && na < dom.x1) pos.push(a, b, 0, na, nb, 0);
            a = wrap(na);
            b = nb;
        }
    }
    return segments(pos, null, color, 0.55);
}

function buildGlyphs(g, ex = null, pal = DEFAULT_PAL) {
    const N = g.N, st = Math.max(1, Math.round(N / 24)), cell = st * cellOf(g), pos = [], col = [];
    const lin = (c) => {
        const t = srgb(c);
        return [t.r, t.g, t.b];
    };
    const cOk = lin(pal.glyph), cFlip = lin(pal.glyphFlip), cTick = lin(pal.tick);
    for (let j = st >> 1; j < N; j += st) for (let i = st >> 1; i < N; i += st) {
        const k = j * N + i;
        if (!isExitLabel(g.label[k])) continue;
        const [a, b] = coordAt(i, j, N, g.dom);
        if (ex && inDomain(ex, a, b)) continue;
        const A = ['A00', 'A01', 'A10', 'A11'].map((f) => val(g, k, f));
        const smax = Math.max(Math.abs(val(g, k, 's1')), Math.abs(val(g, k, 's2')));
        if (!A.every(Number.isFinite) || !(smax > 0)) continue;
        const sc = (cell * 0.45) / smax;
        const c = val(g, k, 'flip') ? cFlip : cOk;
        let px, py;
        for (let q = 0; q <= 24; q++) {
            const t = (q / 24) * 2 * Math.PI, ct = Math.cos(t), s = Math.sin(t);
            const x = a + sc * (A[0] * ct + A[1] * s), y = b + sc * (A[2] * ct + A[3] * s);
            if (q) {
                pos.push(px, py, 0, x, y, 0);
                col.push(...c, ...c);
            }
            px = x;
            py = y;
        }
        const d = val(g, k, 'deltaEff');
        pos.push(a, b, 0, a + cell * 0.45 * Math.cos(d), b + cell * 0.45 * Math.sin(d), 0);
        col.push(...cTick, ...cTick);
    }
    return segments(pos, col);
}