import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {OrthoView} from './renderer.js';
import {omega} from '../core/cr3bp.js';

const VS = `varying vec2 vP;
void main(){ vec4 w = modelMatrix*vec4(position,1.0); vP = w.xy; gl_Position = projectionMatrix*viewMatrix*w; }`;
const FS = `uniform float mu; uniform float C; uniform float showPot; uniform float showZvc;
uniform vec3 uBg; uniform vec3 uLine; uniform vec3 uForbid; uniform vec3 uZvc; varying vec2 vP;
float Om(vec2 p){ float r1=max(length(p-vec2(-mu,0.0)),1e-6); float r2=max(length(p-vec2(1.0-mu,0.0)),1e-6);
  return 0.5*dot(p,p)+(1.0-mu)/r1+mu/r2; }
void main(){
   float o = Om(vP); vec3 col = uBg;
  float v = log(o)*24.0; float fw = fwidth(v);
  float d = abs(fract(v-0.5)-0.5)/max(fw,1e-6);
  float line = (1.0-min(d,1.0))*(1.0-smoothstep(0.2,0.5,fw));
   col = mix(col, uLine, showPot*line);
  float z = 2.0*o - C;
   if (z < 0.0) col = mix(col, uForbid, 0.85*showZvc);
  float e = abs(z)/max(fwidth(z),1e-9);
   col = mix(col, uZvc, showZvc*(1.0-min(e,1.0)));
  gl_FragColor = vec4(col,1.0);
}`;

/**
 * 3D relief: height = −uH · min(log(1 + d), uLmax), d = (Ω − Ω_L4)/(Ω_L1 − Ω_L4).
 * L4/L5 sit at height 0, the L1 saddle at −uH·log 2; the log keeps the wells finite for any μ.
 */
const ELEV = `uniform float mu; uniform float uOmL4; uniform float uOmL1; uniform float uH; uniform float uLmax;
float Om(vec2 p){ float r1=max(length(p-vec2(-mu,0.0)),1e-6); float r2=max(length(p-vec2(1.0-mu,0.0)),1e-6);
  return 0.5*dot(p,p)+(1.0-mu)/r1+mu/r2; }
float elev(vec2 p){ float d = max(Om(p)-uOmL4,0.0)/max(uOmL1-uOmL4,1e-12); return -uH*min(log(1.0+d),uLmax); }
`;
const TVS = ELEV + `varying vec3 vW;
void main(){ vec4 w = modelMatrix*vec4(position,1.0); w.z = elev(w.xy); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`;
const TFS = `uniform float C; uniform float showPot; uniform float showZvc;
uniform vec3 uBg; uniform vec3 uLine; uniform vec3 uForbid; uniform vec3 uZvc;
` + ELEV + `varying vec3 vW;
void main(){
  vec2 p = vW.xy; float o = Om(p);
  float depth = clamp(-vW.z/max(uH*uLmax,1e-12),0.0,1.0);
   vec3 hi = min(uBg*2.6 + vec3(0.05,0.06,0.09), vec3(1.0));
   vec3 col = mix(hi, uBg*0.75, sqrt(depth));
  vec3 cr = cross(dFdx(vW), dFdy(vW)); vec3 n = cr/max(length(cr),1e-30);
  col *= 0.4 + 0.75*abs(dot(n, normalize(vec3(-0.45,-0.55,0.7))));
  float v = log(o)*24.0; float fw = fwidth(v);
  float d = abs(fract(v-0.5)-0.5)/max(fw,1e-6);
  float line = (1.0-min(d,1.0))*(1.0-smoothstep(0.2,0.5,fw));
   col = mix(col, min(uLine*1.2, vec3(1.0)), showPot*line);
  float z = 2.0*o - C;
   if (z < 0.0) col = mix(col, uForbid*1.5, 0.6*showZvc);
  float e = abs(z)/max(fwidth(z),1e-9);
   col = mix(col, uZvc, showZvc*(1.0-min(e,1.0)));
  gl_FragColor = vec4(col,1.0);
}`;

const DRAPE_KEYS = ['mu', 'uOmL4', 'uOmL1', 'uH', 'uLmax', 'uDrape'];

/** Patch a built-in material so its vertices follow the relief (uDrape = 1) or stay flat (uDrape = 0). */
function drape(m, uniforms) {
    m.userData.draped = true;
    m.onBeforeCompile = (sh) => {
        for (const k of DRAPE_KEYS) sh.uniforms[k] = uniforms[k];
        sh.vertexShader = ELEV + 'uniform float uDrape;\n' + sh.vertexShader.replace('#include <project_vertex>',
            `vec4 mvPosition = modelMatrix * vec4(transformed, 1.0);
mvPosition.z += uDrape * elev(mvPosition.xy);
mvPosition = viewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`);
    };
    m.customProgramCacheKey = () => 'draped-v1';
    m.needsUpdate = true;
}

function circle(cx, cy, r, color, n = 256) {
    const pts = [];
    for (let i = 0; i < n; i++) {
        const t = (i / n) * 2 * Math.PI;
        pts.push(cx + r * Math.cos(t), cy + r * Math.sin(t), 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const l = new THREE.LineLoop(g, new THREE.LineBasicMaterial({color, depthTest: false}));
    l.renderOrder = 3;
    return l;
}

const clearGroup = (g) => {
    for (const c of [...g.children]) {
        g.remove(c);
        c.geometry?.dispose();
    }
};

function polyline(pts, material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(
        Array.from({length: pts.length / 2}, (_, i) => [pts[2 * i], pts[2 * i + 1], 0]).flat()), 3));
    return new THREE.Line(g, material);
}

export class PhysicalView extends OrthoView {
    constructor() {
        super();
        this.scene.background = new THREE.Color(0x0b0d12);
        this.uniforms = {
            mu: {value: 0.01}, C: {value: 3}, showPot: {value: 1}, showZvc: {value: 1},
            uOmL4: {value: 1.5}, uOmL1: {value: 1.6}, uH: {value: 0.1}, uLmax: {value: 10}, uDrape: {value: 0},
             // Raw sRGB values (the shaders write them straight to the framebuffer).
             uBg: {value: new THREE.Color().setRGB(0.043, 0.051, 0.07)},
             uLine: {value: new THREE.Color().setRGB(0.25, 0.35, 0.5)},
             uForbid: {value: new THREE.Color().setRGB(0.2, 0.2, 0.24)},
             uZvc: {value: new THREE.Color().setRGB(0.95, 0.8, 0.4)},
        };
        this.bg = new THREE.Mesh(new THREE.PlaneGeometry(200, 200),
            new THREE.ShaderMaterial({
                uniforms: this.uniforms,
                vertexShader: VS,
                fragmentShader: FS,
                depthWrite: false
            }));
        this.terrain = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 384, 384),
            new THREE.ShaderMaterial({uniforms: this.uniforms, vertexShader: TVS, fragmentShader: TFS}));
        this.terrain.visible = false;
        this.terrain.frustumCulled = false;
        this.markers = new THREE.Group();
        this.ringG = new THREE.Group();
        this.journeyG = new THREE.Group();
        this.basisG = new THREE.Group();
        this.trajG = new THREE.Group();
        this.scene.add(this.bg, this.terrain, this.ringG, this.markers, this.journeyG, this.basisG, this.trajG);

        // 3D mode
        this.cam3 = new THREE.PerspectiveCamera(45, 1, 1e-4, 100);
        this.cam3.up.set(0, 0, 1);
        this.is3D = false;
        this.relief = 1;
        this.hhRef = 1;
        this.controls = null;
        this.canvas3 = null;
        this.onChange3 = null;
        this._rc = new THREE.Raycaster();
        this._ndc = new THREE.Vector2();
    }

    // ---- 3D relief
     /** Theme colours as sRGB triples in [0, 1]: background, potential contours, forbidden shade, zero-velocity curve. */
     setPalette({bg, line, forbid, zvc}) {
         const U = this.uniforms;
         if (bg) {
             U.uBg.value.setRGB(...bg);
             this.scene.background.setRGB(bg[0], bg[1], bg[2], THREE.SRGBColorSpace);
         }
         if (line) U.uLine.value.setRGB(...line);
         if (forbid) U.uForbid.value.setRGB(...forbid);
         if (zvc) U.uZvc.value.setRGB(...zvc);
     }

    /** Canvas that receives the orbit controls, and a callback on every camera change. */
    init3D(canvas, onChange) {
        this.canvas3 = canvas;
        this.onChange3 = onChange;
    }

    set3D(on) {
        on = !!on && !!this.canvas3;
        if (on === this.is3D) return;
        this.is3D = on;
        this.uniforms.uDrape.value = on ? 1 : 0;
        this.bg.visible = !on;
        this.terrain.visible = on;
        if (on) {
            if (!this.controls) {
                const c = new OrbitControls(this.cam3, this.canvas3);
                c.screenSpacePanning = true;
                c.maxPolarAngle = Math.PI * 0.495;
                c.minDistance = 1e-6;
                c.addEventListener('change', () => {
                    this.sync3D();
                    this.onChange3?.();
                });
                this.controls = c;
            }
            this.controls.enabled = true;
            this.frame3D();
        } else if (this.controls) this.controls.enabled = false;
    }

    /** Relief exaggeration (multiplies the reference height). */
    setRelief(k) {
        this.relief = k;
        this.uniforms.uH.value = 0.08 * k * this.hhRef;
    }

    /** Aim the 3D camera at the current 2D view window, and scale the relief to it. */
    frame3D() {
        if (!this.controls) return;
        this.hhRef = this.hh;
        this.setRelief(this.relief);
        const d = 2.4 * this.hh;
        this.controls.target.set(this.cx, this.cy, 0);
        this.cam3.position.set(this.cx, this.cy - 0.95 * d, 0.8 * d);
        this.controls.update();
        this.sync3D();
    }

    /** Clip planes and terrain patch follow the orbit target and distance. */
    sync3D() {
        if (!this.controls) return;
        const t = this.controls.target, dist = Math.max(this.cam3.position.distanceTo(t), 1e-9);
        this.cam3.near = dist / 1000;
        this.cam3.far = dist * 50;
        this.cam3.updateProjectionMatrix();
        this.cam3.updateMatrixWorld();
        const s = dist * 4, cell = s / 384;
        this.terrain.position.set(Math.round(t.x / cell) * cell, Math.round(t.y / cell) * cell, 0);
        this.terrain.scale.set(s, s, 1);
    }

    renderCamera() {
        return this.is3D ? this.cam3 : this.camera;
    }

    /** Patch new overlay materials so they drape over the relief. */
    beforeRender() {
        this.scene.traverse((o) => {
            const m = o.material;
            if (m && !Array.isArray(m) && !m.isShaderMaterial && !m.userData.draped) drape(m, this.uniforms);
        });
    }

    setAspect(a) {
        super.setAspect(a);
        if (this.cam3) {
            this.cam3.aspect = a;
            this.cam3.updateProjectionMatrix();
        }
    }

    /** JS mirror of the GLSL relief height. */
    elevAt(x, y) {
        const U = this.uniforms;
        const d = Math.max(omega(x, y, U.mu.value) - U.uOmL4.value, 0) / Math.max(U.uOmL1.value - U.uOmL4.value, 1e-12);
        return -U.uH.value * Math.min(Math.log1p(d), U.uLmax.value);
    }

    /** World (x, y) under viewport point (u, v); in 3D the ray is marched onto the relief surface. */
    toWorld(u, v) {
        if (!this.is3D) return super.toWorld(u, v);
        this._rc.setFromCamera(this._ndc.set(2 * u - 1, 1 - 2 * v), this.cam3);
        const o = this._rc.ray.origin, d = this._rc.ray.direction;
        if (!(d.z < 0)) return [NaN, NaN];
        const zLow = -this.uniforms.uH.value * this.uniforms.uLmax.value - 1e-9;
        const tEnd = (zLow - o.z) / d.z;
        const f = (t) => o.z + t * d.z - this.elevAt(o.x + t * d.x, o.y + t * d.y);
        let a = 0, b = tEnd;
        if (f(0) <= 0) return [o.x, o.y];
        const n = 128;
        for (let i = 1; i <= n; i++) {
            const t = (tEnd * i) / n;
            if (f(t) <= 0) {
                b = t;
                break;
            }
            a = t;
        }
        for (let i = 0; i < 40; i++) {
            const m = 0.5 * (a + b);
            if (f(m) > 0) a = m; else b = m;
        }
        const t = 0.5 * (a + b);
        return [o.x + t * d.x, o.y + t * d.y];
    }

    /** Approximate world length of one screen pixel (hpx = viewport height in pixels). */
    worldPerPixel(hpx) {
        if (!this.is3D || !this.controls) return (2 * this.hh) / hpx;
        const dist = this.cam3.position.distanceTo(this.controls.target);
        return (2 * dist * Math.tan((this.cam3.fov * Math.PI) / 360)) / hpx;
    }

    // ---- scene content
    setSystem(p, lps) {
        this.p = p;
        this.uniforms.mu.value = p.mu;
        this.uniforms.C.value = p.C;
        if (lps?.length >= 4) {
            this.uniforms.uOmL4.value = lps[3].C / 2;
            this.uniforms.uOmL1.value = lps[0].C / 2;
        }
        clearGroup(this.markers);
        const x2 = 1 - p.mu;
        const pos = [-p.mu, 0, 0, x2, 0, 0], col = [1, 0.85, 0.3, 0.7, 0.8, 1];
        for (const L of lps) {
            pos.push(L.x, L.y, 0);
            col.push(0.4, 1, 0.6);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        const pts = new THREE.Points(g, new THREE.PointsMaterial({
            size: 7,
            sizeAttenuation: false,
            vertexColors: true,
            depthTest: false
        }));
        pts.renderOrder = 4;
        const cx = p.cx ?? x2;
        this.markers.add(pts, circle(cx, 0, p.rho, 0x66ccff), circle(cx, 0, p.rhoFar, 0x335566), circle(x2, 0, p.Rbody, 0xaaaaaa, 64));
        if (p.R1 > 0) this.markers.add(circle(-p.mu, 0, p.R1, 0xccaa66, 128));
    }

    setC(C) {
        this.uniforms.C.value = C;
    }

    setRing(colors, N, visible) {
        clearGroup(this.ringG);
        if (!colors || !visible) return;
        const g = new THREE.RingGeometry(this.p.rho * 1.04, this.p.rho * 1.3, N, 1);
        const c = new Float32Array(g.attributes.position.count * 3);
        for (let r = 0; r < 2; r++) for (let i = 0; i <= N; i++) {
            const v = r * (N + 1) + i, s = (i % N) * 3;
            c[v * 3] = colors[s] / 255;
            c[v * 3 + 1] = colors[s + 1] / 255;
            c[v * 3 + 2] = colors[s + 2] / 255;
        }
        g.setAttribute('color', new THREE.BufferAttribute(c, 3));
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
            vertexColors: true,
            side: THREE.DoubleSide,
            depthTest: false
        }));
        m.position.x = this.p.cx ?? 1 - this.p.mu;
        m.renderOrder = 2;
        this.ringG.add(m);
    }

    setTrajectory(traj, vIn, vOut) {
        clearGroup(this.trajG);
        if (!traj) return;
        const g = new THREE.BufferGeometry(), n = traj.pts.length / 2;
        const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
            pos[3 * i] = traj.pts[2 * i];
            pos[3 * i + 1] = traj.pts[2 * i + 1];
            const t = i / Math.max(1, n - 1);
            col[3 * i] = 1;
            col[3 * i + 1] = 1 - 0.7 * t;
            col[3 * i + 2] = 0.3 + 0.7 * t;
        }
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        const line = new THREE.Line(g, new THREE.LineBasicMaterial({vertexColors: true, depthTest: false}));
        line.renderOrder = 5;
        this.trajG.add(line);
        const sc = this.p.rho * 0.6 / Math.max(Math.hypot(...vIn.v), vOut ? Math.hypot(...vOut.v) : 0, 1e-9);
        for (const [a, color] of [[vIn, 0x44ff88], [vOut, 0xff5566]]) {
            if (!a) continue;
            const L = Math.hypot(...a.v) * sc;
            const ar = new THREE.ArrowHelper(new THREE.Vector3(a.v[0], a.v[1], 0).normalize(),
                new THREE.Vector3(a.at[0], a.at[1], 0), L, color, L * 0.2, L * 0.1);
            ar.traverse((o) => {
                o.renderOrder = 6;
                if (o.material) o.material.depthTest = false;
            });
            this.trajG.add(ar);
        }
    }

    /** Spaceship mode: the current basis path (dim cyan) with a marker at the ship's state. */
    setBasis(pts) {
        clearGroup(this.basisG);
        if (!pts || pts.length < 2) return;
        const line = polyline(pts, new THREE.LineBasicMaterial({
            color: 0x55aacc, transparent: true, opacity: 0.75, depthTest: false
        }));
        line.renderOrder = 4;
        const pg = new THREE.BufferGeometry();
        pg.setAttribute('position', new THREE.Float32BufferAttribute([pts[0], pts[1], 0], 3));
        const ship = new THREE.Points(pg, new THREE.PointsMaterial({
            size: 10, sizeAttenuation: false, color: 0x66ffff, depthTest: false
        }));
        ship.renderOrder = 7;
        this.basisG.add(line, ship);
    }

    /** Spaceship mode: the legs already flown (orange) with a marker at every burn. */
    setJourney(trails) {
        clearGroup(this.journeyG);
        if (!trails?.length) return;
        const burns = [];
        for (const pts of trails) {
            if (!pts || pts.length < 4) continue;
            const line = polyline(pts, new THREE.LineBasicMaterial({
                color: 0xff9944, transparent: true, opacity: 0.6, depthTest: false
            }));
            line.renderOrder = 4;
            this.journeyG.add(line);
            burns.push(pts[pts.length - 2], pts[pts.length - 1], 0);
        }
        if (!burns.length) return;
        const pg = new THREE.BufferGeometry();
        pg.setAttribute('position', new THREE.Float32BufferAttribute(burns, 3));
        const pm = new THREE.Points(pg, new THREE.PointsMaterial({
            size: 7, sizeAttenuation: false, color: 0xffaa55, depthTest: false
        }));
        pm.renderOrder = 6;
        this.journeyG.add(pm);
    }

    /** Fit the camera to a polyline [x0, y0, x1, y1, …]. */
    fitPoints(pts) {
        if (!pts || pts.length < 2) return;
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (let i = 0; i < pts.length; i += 2) {
            x0 = Math.min(x0, pts[i]);
            x1 = Math.max(x1, pts[i]);
            y0 = Math.min(y0, pts[i + 1]);
            y1 = Math.max(y1, pts[i + 1]);
        }
        const w = Math.max(x1 - x0, 1e-3), h = Math.max(y1 - y0, 1e-3);
        this.cx = (x0 + x1) / 2;
        this.cy = (y0 + y1) / 2;
        this.hh = Math.max(h / 2, w / 2 / this.aspect) * 1.25;
        this.updateCam();
        if (this.is3D) this.frame3D();
    }

    fitSystem() {
        this.cx = 0;
        this.cy = 0;
        this.hh = 1.4;
        this.updateCam();
        if (this.is3D) this.frame3D();
    }

    /** Zoom to the encounter circles (centred on P2, P1 or the barycentre). */
    fitCircle() {
        this.cx = this.p.cx ?? 1 - this.p.mu;
        this.cy = 0;
        this.hh = this.p.rhoFar * 1.3;
        this.updateCam();
        if (this.is3D) this.frame3D();
    }

    fitSecondary() {
        this.fitCircle();
    }
}