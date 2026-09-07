import { createTexture } from './Framebuffer.js';

/** Classic Winamp viscolor.txt (approx). Index 2–17 spectrum gradient, 18–22 oscilloscope, 23 peak. */
export const DEFAULT_VISCOLOR = [
  [0, 0, 0], [24, 33, 41], [239, 49, 16], [206, 41, 16], [214, 90, 0], [214, 102, 0], [214, 115, 0], [198, 123, 8],
  [222, 165, 24], [214, 181, 33], [189, 222, 41], [148, 222, 33], [41, 206, 16], [50, 190, 16], [57, 181, 16], [49, 156, 8],
  [41, 148, 0], [24, 132, 8], [255, 255, 255], [214, 214, 222], [181, 189, 189], [160, 170, 175], [148, 156, 165], [150, 150, 150],
];

/** Data textures shared by every preset: spectrum, waveform, spectrogram history, noise, palette. */
export class Textures {
  constructor(gl) {
    this.gl = gl;
    const r8 = { internal: gl.R8, format: gl.RED, type: gl.UNSIGNED_BYTE };
    this.spectrum = createTexture(gl, 512, 1, { ...r8, data: new Uint8Array(512) });
    this.waveform = createTexture(gl, 512, 1, { ...r8, data: new Uint8Array(512).fill(128) });
    this.history = createTexture(gl, 256, 64, { ...r8, data: new Uint8Array(256 * 64) });
    const noise = new Uint8Array(256 * 256 * 4);
    for (let i = 0; i < noise.length; i++) noise[i] = (Math.random() * 256) | 0;
    this.noise = createTexture(gl, 256, 256, { wrap: gl.REPEAT, data: noise });
    this.palette = createTexture(gl, 24, 1, { internal: gl.RGB8, format: gl.RGB, data: new Uint8Array(24 * 3) });
    this.setPalette(DEFAULT_VISCOLOR);
  }

  upload(spectrum, waveform, history) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.spectrum);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 512, 1, gl.RED, gl.UNSIGNED_BYTE, spectrum);
    gl.bindTexture(gl.TEXTURE_2D, this.waveform);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 512, 1, gl.RED, gl.UNSIGNED_BYTE, waveform);
    gl.bindTexture(gl.TEXTURE_2D, this.history);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 64, gl.RED, gl.UNSIGNED_BYTE, history);
  }

  /** 24 × [r,g,b]; the whole GL scene recolors when a skin changes. */
  setPalette(colors) {
    const gl = this.gl;
    const data = new Uint8Array(24 * 3);
    for (let i = 0; i < 24; i++) { const c = colors[i] ?? [0, 0, 0]; data.set(c, i * 3); }
    gl.bindTexture(gl.TEXTURE_2D, this.palette);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 24, 1, gl.RGB, gl.UNSIGNED_BYTE, data);
  }
}