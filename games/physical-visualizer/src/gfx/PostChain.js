import { Program } from './Program.js';
import { FULLSCREEN_VERT } from './Mesh.js';
import { RenderTarget, PingPong } from './Framebuffer.js';

const PRESENT_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_comp;
uniform sampler2D u_prevOut;
uniform float u_guard;
uniform float u_aberration;
void main() {
  vec2 d = (v_uv - 0.5) * u_aberration;
  vec3 c = vec3(texture(u_comp, v_uv + d).r, texture(u_comp, v_uv).g, texture(u_comp, v_uv - d).b);
  vec3 p = texture(u_prevOut, v_uv).rgb;
  fragColor = vec4(mix(c, p, u_guard), 1.0);
}`;

const DOWNSAMPLE_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_src;
void main() {
  vec3 s = vec3(0.0);
  for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++)
    s += texture(u_src, v_uv + (vec2(float(x), float(y)) - 1.5) / 32.0).rgb;
  fragColor = vec4(s / 16.0, 1.0);
}`;

/**
 * Photosensitivity guard (always on): >3 luminance swings of >20% within 1s
 * → temporal low-pass for 2s. Presets cannot opt out.
 */
class FlashGuard {
  constructor() { this.last = -1; this.times = []; this.until = 0; this.value = 0; this.lum = 0; }
  update(lum, now) {
    this.lum = lum;
    if (this.last >= 0 && Math.abs(lum - this.last) > 0.2) this.times.push(now);
    this.last = lum;
    while (this.times.length && now - this.times[0] > 1000) this.times.shift();
    if (this.times.length > 3) { this.until = now + 2000; this.times.length = 0; }
    const target = now < this.until ? 0.75 : this.baseline;
    this.value += (target - this.value) * 0.2;
  }
  baseline = 0;
}

/** Present pass: chromatic aberration keyed to jerk, flash guard, blit to screen. */
export class PostChain {
  constructor(gl, mesh, { reducedMotion = false } = {}) {
    this.gl = gl; this.mesh = mesh;
    this.present = new Program(gl, FULLSCREEN_VERT, PRESENT_FRAG, 'present');
    this.down = new Program(gl, FULLSCREEN_VERT, DOWNSAMPLE_FRAG, 'downsample');
    this.lumRT = new RenderTarget(gl, 8, 8, { filter: gl.NEAREST });
    this.lumBuf = new Uint8Array(8 * 8 * 4);
    this.guard = new FlashGuard();
    this.guard.baseline = reducedMotion ? 0.35 : 0;
    this.out = null; this.w = 0; this.h = 0;
  }

  resize(w, h) {
    this.out?.dispose();
    this.out = new PingPong(this.gl, w, h, { filter: this.gl.LINEAR });
    this.out.clear();
    this.w = w; this.h = h;
  }

  run(compTex, { aberration = 0 } = {}) {
    const gl = this.gl;

    // 1. Mean luminance (8×8 downsample + tiny readback)
    this.lumRT.bind();
    this.down.use().texture('u_src', compTex, 0);
    this.mesh.drawFullscreen();
    gl.readPixels(0, 0, 8, 8, gl.RGBA, gl.UNSIGNED_BYTE, this.lumBuf);
    let lum = 0;
    for (let i = 0; i < 64; i++) lum += 0.2126 * this.lumBuf[i * 4] + 0.7152 * this.lumBuf[i * 4 + 1] + 0.0722 * this.lumBuf[i * 4 + 2];
    this.guard.update(lum / (64 * 255), performance.now());

    // 2. Present into out.write (needs out.read for the temporal blend)
    this.out.write.bind();
    this.present.use()
      .texture('u_comp', compTex, 0)
      .texture('u_prevOut', this.out.read.tex, 1)
      .set('u_guard', this.guard.value)
      .set('u_aberration', Math.min(0.02, aberration));
    this.mesh.drawFullscreen();

    // 3. Blit to the canvas
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.out.write.fbo);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.blitFramebuffer(0, 0, this.w, this.h, 0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.COLOR_BUFFER_BIT, gl.LINEAR);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.out.swap();
  }
}