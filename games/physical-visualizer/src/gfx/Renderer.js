import { Program, ShaderLoader, assemble } from './Program.js';
import { PingPong } from './Framebuffer.js';
import { Mesh, FULLSCREEN_VERT } from './Mesh.js';
import { Textures } from './Textures.js';
import { PostChain } from './PostChain.js';

const SCALE_STEPS = [1.0, 0.85, 0.7, 0.5];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const WARP_HEADER = 'in vec2 v_uv;\nout vec4 fragColor;\nuniform vec4 u_warp; // decay, zoom, rotate, drift';
const COMP_HEADER = 'in vec2 v_uv;\nout vec4 fragColor;';
const PARTICLE_FRAG_HEADER = 'in vec4 v_state;\nout vec4 fragColor;';
const SIM_HEADER = 'in vec2 v_uv;\nout vec4 fragColor;\nuniform sampler2D u_particles;\nuniform int u_texSize;\nuniform vec4 u_motion; // gravityScale, shakeImpulse, shake, seed';
const PARTICLE_VERT_BODY = `
layout(location = 0) in float a_index;
uniform sampler2D u_particles;
uniform int u_texSize;
uniform float u_pointScale;
out vec4 v_state;
void main() {
  int i = int(a_index);
  vec4 s = texelFetch(u_particles, ivec2(i % u_texSize, i / u_texSize), 0);
  v_state = s;
  gl_Position = vec4(s.xy, 0.0, 1.0);
  gl_PointSize = (1.5 + 3.0 * u_audio.x + 2.0 * u_audio2.x) * u_resolution.z * u_pointScale + min(length(s.zw) * 2.0, 4.0);
}`;

/**
 * Passes per frame: sim (optional) → warp/feedback → draw → post.
 * Owns the GL context, adaptive resolution governor and the uniform contract.
 */
export class Renderer {
  constructor(canvas, signals, cap) {
    this.canvas = canvas; this.S = signals; this.cap = cap;
    this.scaleIdx = cap.tier === 'high' ? 0 : cap.tier === 'mid' ? 1 : 2;
    this.dprCap = cap.tier === 'low' ? 1.25 : 2;
    this.width = 0; this.height = 0; this.dpr = 1;
    this.time = 0; this.frame = 0; this.beats = 0;
    this.feedbackBias = 0;
    this._lastResize = 0;
    this._ft = new Float32Array(30); this._fti = 0; this._slowSince = 0; this._fastSince = 0;
  }

  async init() {
    const gl = this.canvas.getContext('webgl2', {
      antialias: false, alpha: false, depth: false, stencil: false,
      premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 is required (WebGL1 fallback is not implemented yet).');
    this.gl = gl;
    this.floatOK = !!gl.getExtension('EXT_color_buffer_float');
    this.loader = new ShaderLoader(new URL('./shaders/', import.meta.url));
    this.common = await this.loader.load('common.glsl');
    this.mesh = new Mesh(gl);
    this.textures = new Textures(gl);
    this.post = new PostChain(gl, this.mesh, { reducedMotion: this.cap.reducedMotion });
    this.resize(true);
    return this;
  }

  get renderScale() { return SCALE_STEPS[this.scaleIdx]; }

  resize(force = false) {
    const now = performance.now();
    if (!force && now - this._lastResize < 500) return;          // FBO realloc is costly
    const dpr = Math.min(window.devicePixelRatio || 1, this.dprCap) * this.renderScale;
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (w === this.width && h === this.height) return;
    this._lastResize = now;
    this.width = w; this.height = h; this.dpr = dpr;
    this.canvas.width = w; this.canvas.height = h;
    this.comp?.dispose();
    this.comp = new PingPong(this.gl, w, h, { filter: this.gl.LINEAR });
    this.comp.clear();
    this.post.resize(w, h);
  }

  /** Rolling-mean frame-time governor with hysteresis. */
  _govern(dt) {
    this._ft[this._fti++ % 30] = dt * 1000;
    if (this.frame < 30) return;
    let m = 0;
    for (let i = 0; i < 30; i++) m += this._ft[i];
    m /= 30;
    const now = performance.now();
    if (m > 20) {
      this._fastSince = 0;
      if (!this._slowSince) this._slowSince = now;
      else if (now - this._slowSince > 1000 && this.scaleIdx < SCALE_STEPS.length - 1) { this.scaleIdx++; this._slowSince = 0; this.resize(true); }
    } else if (m < 12) {
      this._slowSince = 0;
      if (!this._fastSince) this._fastSince = now;
      else if (now - this._fastSince > 4000 && this.scaleIdx > 0) { this.scaleIdx--; this._fastSince = 0; this.resize(true); }
    } else {
      this._slowSince = this._fastSince = 0;
    }
  }

  /** Compile a validated preset definition into GPU programs + sim state. */
  async buildPreset(def) {
    const gl = this.gl, common = this.common;
    const [warpSrc, compSrc, simSrc] = await Promise.all([
      this.loader.load(def.warp.shader),
      this.loader.load(def.comp.shader),
      def.sim ? this.loader.load(def.sim.shader) : null,
    ]);
    const built = { def, warp: null, comp: null, sim: null };
    built.warp = new Program(gl, FULLSCREEN_VERT, assemble({ common, header: WARP_HEADER, body: warpSrc }), `${def.id}:warp`);
    if (def.sim) {
      if (!this.floatOK) throw new Error('needs float render targets (EXT_color_buffer_float)');
      const texSize = Math.min(def.sim.texSize ?? 128, this.cap.particleTexSize);
      built.sim = {
        texSize, count: texSize * texSize,
        program: new Program(gl, FULLSCREEN_VERT, assemble({ common, header: SIM_HEADER, body: simSrc }), `${def.id}:sim`),
        state: this._makeParticleState(texSize),
      };
      built.comp = new Program(gl,
        assemble({ common, body: PARTICLE_VERT_BODY }),
        assemble({ common, header: PARTICLE_FRAG_HEADER, body: compSrc }), `${def.id}:comp`);
    } else {
      built.comp = new Program(gl, FULLSCREEN_VERT, assemble({ common, header: COMP_HEADER, body: compSrc }), `${def.id}:comp`);
    }
    return built;
  }

  disposePreset(built) {
    built.warp?.dispose(); built.comp?.dispose();
    built.sim?.program.dispose(); built.sim?.state.dispose();
  }

  _makeParticleState(n) {
    const data = new Float32Array(n * n * 4);
    for (let i = 0; i < n * n; i++) {
      data[i * 4] = Math.random() * 2 - 1;
      data[i * 4 + 1] = Math.random() * 2 - 1;
      data[i * 4 + 2] = (Math.random() - 0.5) * 0.2;
      data[i * 4 + 3] = (Math.random() - 0.5) * 0.2;
    }
    const gl = this.gl;
    return new PingPong(gl, n, n, { internal: gl.RGBA16F, format: gl.RGBA, type: gl.FLOAT, filter: gl.NEAREST, data });
  }

  _contract(dt, params) {
    const g = (n) => this.S.get(n);
    return {
      u_resolution: [this.width, this.height, this.dpr],
      u_time: [this.time, dt, this.frame, this.beats],
      u_audio: [g('bass'), g('mid'), g('treb'), g('energy')],
      u_audio2: [g('beatEnv'), g('flux'), g('bpm') / 200, g('phase')],
      u_tilt: [g('tiltX'), g('tiltY'), g('yaw'), g('flat')],
      u_accel: [g('accelX'), g('accelY'), g('accelZ'), g('jerk')],
      u_gravity: [g('gravX'), g('gravY'), g('gravZ'), g('spinRate')],
      u_touch: [g('touchX'), g('touchY'), g('touchDown'), g('touchAge')],
      u_params: params,
    };
  }

  _apply(p, u) {
    for (const k in u) p.set(k, u[k]);
    const T = this.textures;
    p.texture('u_spectrum', T.spectrum, 0);
    p.texture('u_waveform', T.waveform, 1);
    p.texture('u_history', T.history, 2);
    p.texture('u_noise', T.noise, 4);
    p.texture('u_palette', T.palette, 5);
  }

  /**
   * @param built   result of buildPreset()
   * @param dt      seconds
   * @param frame   { params: Float32Array(4), aberration: number, shatter: 0..1 }
   */
  render(built, dt, frame) {
    const gl = this.gl, S = this.S, def = built.def;
    this.time += dt; this.frame++;
    this.beats += (S.get('bpm') / 60) * dt;
    this._govern(dt);
    this.resize();
    const u = this._contract(dt, frame.params);
    gl.disable(gl.BLEND);

    // 1. Sim pass — particle state ping-pong
    if (built.sim) {
      const s = built.sim;
      s.state.write.bind();
      const p = s.program.use();
      this._apply(p, u);
      p.texture('u_particles', s.state.read.tex, 6);
      p.set('u_texSize', s.texSize);
      p.set('u_motion', [def.motion.gravityScale, def.motion.shakeImpulse, S.get('shake'), Math.random()]);
      this.mesh.drawFullscreen();
      s.state.swap();
    }

    // 2. Warp / feedback pass — the Milkdrop heart
    this.comp.write.bind();
    {
      const p = built.warp.use();
      this._apply(p, u);
      p.texture('u_prev', this.comp.read.tex, 3);
      const w = def.warp;
      const decay = clamp(w.decay + this.feedbackBias - 0.25 * frame.shatter, 0.5, 0.995);
      p.set('u_warp', [decay, w.zoom, w.rotate, w.drift]);
      this.mesh.drawFullscreen();
    }

    // 3. Draw pass — this frame's geometry on top of the warped history
    gl.enable(gl.BLEND);
    if (def.comp.blend === 'alpha') gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    else gl.blendFunc(gl.ONE, gl.ONE);
    {
      const p = built.comp.use();
      this._apply(p, u);
      p.texture('u_prev', this.comp.read.tex, 3);
      if (built.sim) {
        p.texture('u_particles', built.sim.state.read.tex, 6);
        p.set('u_texSize', built.sim.texSize);
        p.set('u_pointScale', this.renderScale);
        this.mesh.drawPoints(built.sim.count);
      } else {
        this.mesh.drawFullscreen();
      }
    }
    gl.disable(gl.BLEND);

    // 4. Post — aberration, flash guard, blit
    this.post.run(this.comp.write.tex, { aberration: frame.aberration });
    this.comp.swap();
  }
}