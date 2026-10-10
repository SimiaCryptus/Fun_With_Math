import * as THREE from 'three';
import { OrthoView } from './renderer.js';

const VS = `varying vec2 vP;
void main(){ vec4 w = modelMatrix*vec4(position,1.0); vP = w.xy; gl_Position = projectionMatrix*viewMatrix*w; }`;
const FS = `uniform float mu; uniform float C; uniform float showPot; uniform float showZvc; varying vec2 vP;
float Om(vec2 p){ float r1=max(length(p-vec2(-mu,0.0)),1e-6); float r2=max(length(p-vec2(1.0-mu,0.0)),1e-6);
  return 0.5*dot(p,p)+(1.0-mu)/r1+mu/r2; }
void main(){
  float o = Om(vP); vec3 col = vec3(0.043,0.051,0.07);
  float v = log(o)*24.0; float fw = fwidth(v);
  float d = abs(fract(v-0.5)-0.5)/max(fw,1e-6);
  float line = (1.0-min(d,1.0))*(1.0-smoothstep(0.2,0.5,fw));
  col = mix(col, vec3(0.25,0.35,0.5), showPot*line);
  float z = 2.0*o - C;
  if (z < 0.0) col = mix(col, vec3(0.2,0.2,0.24), 0.85*showZvc);
  float e = abs(z)/max(fwidth(z),1e-9);
  col = mix(col, vec3(0.95,0.8,0.4), showZvc*(1.0-min(e,1.0)));
  gl_FragColor = vec4(col,1.0);
}`;

function circle(cx, cy, r, color, n = 256) {
  const pts = [];
  for (let i = 0; i < n; i++) { const t = (i / n) * 2 * Math.PI; pts.push(cx + r * Math.cos(t), cy + r * Math.sin(t), 0); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const l = new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color, depthTest: false })); l.renderOrder = 3; return l;
}
const clearGroup = (g) => { for (const c of [...g.children]) { g.remove(c); c.geometry?.dispose(); } };

export class PhysicalView extends OrthoView {
  constructor() {
    super();
    this.scene.background = new THREE.Color(0x0b0d12);
    this.uniforms = { mu: { value: 0.01 }, C: { value: 3 }, showPot: { value: 1 }, showZvc: { value: 1 } };
    this.bg = new THREE.Mesh(new THREE.PlaneGeometry(8, 8),
      new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VS, fragmentShader: FS, depthWrite: false }));
    this.markers = new THREE.Group(); this.ringG = new THREE.Group(); this.trajG = new THREE.Group();
    this.scene.add(this.bg, this.ringG, this.markers, this.trajG);
  }
  setSystem(p, lps) {
    this.p = p; this.uniforms.mu.value = p.mu; this.uniforms.C.value = p.C;
    clearGroup(this.markers);
    const x2 = 1 - p.mu;
    const pos = [-p.mu, 0, 0, x2, 0, 0], col = [1, 0.85, 0.3, 0.7, 0.8, 1];
    for (const L of lps) { pos.push(L.x, L.y, 0); col.push(0.4, 1, 0.6); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 7, sizeAttenuation: false, vertexColors: true, depthTest: false }));
    pts.renderOrder = 4;
    this.markers.add(pts, circle(x2, 0, p.rho, 0x66ccff), circle(x2, 0, p.rhoFar, 0x335566), circle(x2, 0, p.Rbody, 0xaaaaaa, 64));
  }
  setC(C) { this.uniforms.C.value = C; }
  setRing(colors, N, visible) {
    clearGroup(this.ringG);
    if (!colors || !visible) return;
    const g = new THREE.RingGeometry(this.p.rho * 1.04, this.p.rho * 1.3, N, 1);
    const c = new Float32Array(g.attributes.position.count * 3);
    for (let r = 0; r < 2; r++) for (let i = 0; i <= N; i++) {
      const v = r * (N + 1) + i, s = (i % N) * 3;
      c[v * 3] = colors[s] / 255; c[v * 3 + 1] = colors[s + 1] / 255; c[v * 3 + 2] = colors[s + 2] / 255;
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, depthTest: false }));
    m.position.x = 1 - this.p.mu; m.renderOrder = 2; this.ringG.add(m);
  }
  setTrajectory(traj, vIn, vOut) {
    clearGroup(this.trajG);
    if (!traj) return;
    const g = new THREE.BufferGeometry(), n = traj.pts.length / 2;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[3 * i] = traj.pts[2 * i]; pos[3 * i + 1] = traj.pts[2 * i + 1];
      const t = i / Math.max(1, n - 1); col[3 * i] = 1; col[3 * i + 1] = 1 - 0.7 * t; col[3 * i + 2] = 0.3 + 0.7 * t;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false }));
    line.renderOrder = 5; this.trajG.add(line);
    const sc = this.p.rho * 0.6 / Math.max(Math.hypot(...vIn.v), vOut ? Math.hypot(...vOut.v) : 0, 1e-9);
    for (const [a, color] of [[vIn, 0x44ff88], [vOut, 0xff5566]]) {
      if (!a) continue;
      const L = Math.hypot(...a.v) * sc;
      const ar = new THREE.ArrowHelper(new THREE.Vector3(a.v[0], a.v[1], 0).normalize(),
        new THREE.Vector3(a.at[0], a.at[1], 0), L, color, L * 0.2, L * 0.1);
      ar.traverse((o) => { o.renderOrder = 6; if (o.material) o.material.depthTest = false; });
      this.trajG.add(ar);
    }
  }
  fitSystem() { this.cx = 0; this.cy = 0; this.hh = 1.4; this.updateCam(); }
  fitSecondary() { this.cx = 1 - this.p.mu; this.cy = 0; this.hh = this.p.rhoFar * 1.3; this.updateCam(); }
}