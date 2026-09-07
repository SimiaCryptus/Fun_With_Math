export function createTexture(gl, w, h, o = {}) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, o.filter ?? gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, o.filter ?? gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, o.wrap ?? gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, o.wrap ?? gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, o.internal ?? gl.RGBA8, w, h, 0, o.format ?? gl.RGBA, o.type ?? gl.UNSIGNED_BYTE, o.data ?? null);
  return tex;
}

export class RenderTarget {
  constructor(gl, w, h, o = {}) {
    this.gl = gl; this.w = w; this.h = h;
    this.tex = createTexture(gl, w, h, o);
    this.fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
    const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (st !== gl.FRAMEBUFFER_COMPLETE) { this.dispose(); throw new Error(`framebuffer incomplete 0x${st.toString(16)}`); }
  }

  bind() { this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.fbo); this.gl.viewport(0, 0, this.w, this.h); }

  clear(r = 0, g = 0, b = 0, a = 1) {
    this.bind();
    this.gl.clearColor(r, g, b, a);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }

  dispose() { this.gl.deleteFramebuffer(this.fbo); this.gl.deleteTexture(this.tex); }
}

/** Two render targets; read from one, write to the other, swap. */
export class PingPong {
  constructor(gl, w, h, o = {}) {
    this.a = new RenderTarget(gl, w, h, o);
    this.b = new RenderTarget(gl, w, h, o);
  }
  get read() { return this.a; }
  get write() { return this.b; }
  swap() { [this.a, this.b] = [this.b, this.a]; }
  clear() { this.a.clear(); this.b.clear(); }
  dispose() { this.a.dispose(); this.b.dispose(); }
}