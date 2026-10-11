import * as THREE from 'three';

/** Orthographic 2D view with pan and zoom. */
export class OrthoView {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
        this.camera.position.z = 1;
        this.cx = 0;
        this.cy = 0;
        this.hh = 1;
        this.aspect = 1;
    }
     /**
      * World rectangle the camera must stay on, plus a zoom-out ceiling (relative to the fit of that
      * rectangle). null = unconstrained. Subclasses override.
      */
     limits() {
         return null;
     }
     /** Keep the camera on the plot: never pan or zoom entirely off it. */
     constrain() {
         const L = this.limits();
         if (!L) return;
         const fitHH = Math.max((L.y1 - L.y0) / 2, (L.x1 - L.x0) / 2 / this.aspect);
         this.hh = Math.min(Math.max(this.hh, fitHH * 1e-7), fitHH * (L.maxZoomOut ?? 1.5));
         const axis = (c, h, a, b) => (2 * h >= b - a
             ? Math.min(Math.max(c, b - h), a + h)   // view larger than the plot: keep the plot fully visible
             : Math.min(Math.max(c, a + h), b - h)); // view smaller: keep the view inside the plot
         this.cx = axis(this.cx, this.hh * this.aspect, L.x0, L.x1);
         this.cy = axis(this.cy, this.hh, L.y0, L.y1);
     }


    setAspect(a) {
        this.aspect = a;
        this.updateCam();
    }

    updateCam() {
         this.constrain();
        const c = this.camera, hw = this.hh * this.aspect;
        c.left = this.cx - hw;
        c.right = this.cx + hw;
        c.top = this.cy + this.hh;
        c.bottom = this.cy - this.hh;
        c.updateProjectionMatrix();
    }

    /** u, v ∈ [0, 1] within the viewport, with v measured from the top. */
    toWorld(u, v) {
        return [this.cx + (2 * u - 1) * this.hh * this.aspect, this.cy + (1 - 2 * v) * this.hh];
    }

    zoom(f, u, v) {
        const [wx, wy] = this.toWorld(u, v);
        this.hh *= f;
        this.cx = wx + (this.cx - wx) * f;
        this.cy = wy + (this.cy - wy) * f;
        this.updateCam();
    }

    pan(du, dv) {
        this.cx -= du * 2 * this.hh * this.aspect;
        this.cy += dv * 2 * this.hh;
        this.updateCam();
    }
}

/** One WebGLRenderer per canvas, drawing a single view on demand. Follows the canvas size. */
export class ViewRenderer {
    constructor(canvas, view) {
        this.canvas = canvas;
        this.view = view;
        this.r = new THREE.WebGLRenderer({canvas, antialias: true});
        this.r.setPixelRatio(window.devicePixelRatio);
        this.pending = false;
        new ResizeObserver(() => this.resize()).observe(canvas);
        this.resize();
    }

    resize() {
        const w = Math.max(1, this.canvas.clientWidth), h = Math.max(1, this.canvas.clientHeight);
        this.r.setSize(w, h, false);
        this.view.setAspect(w / h);
        this.view.onResize?.();
        this.request();
    }

    request() {
        if (this.pending) return;
        this.pending = true;
        requestAnimationFrame(() => {
            this.pending = false;
            this.draw();
        });
    }

    draw() {
         this.view.beforeRender?.();
         this.r.render(this.view.scene, this.view.renderCamera?.() ?? this.view.camera);
    }

    /** Local viewport coordinates of a pointer event. */
    hit(e) {
        const b = this.canvas.getBoundingClientRect();
        return {
            u: (e.clientX - b.left) / Math.max(1, b.width), v: (e.clientY - b.top) / Math.max(1, b.height),
            w: Math.max(1, b.width), h: Math.max(1, b.height),
        };
    }
}