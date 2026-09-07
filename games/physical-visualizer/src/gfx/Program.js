/** Shader compile/link with a uniform cache, plus a #include-resolving loader. */
export class Program {
  constructor(gl, vs, fs, name = 'program') {
    this.gl = gl; this.name = name;
    const v = compile(gl, gl.VERTEX_SHADER, vs, `${name}.vert`);
    const f = compile(gl, gl.FRAGMENT_SHADER, fs, `${name}.frag`);
    const p = gl.createProgram();
    gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
    gl.deleteShader(v); gl.deleteShader(f);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(p);
      gl.deleteProgram(p);
      throw new Error(`[${name}] link: ${log}`);
    }
    this.handle = p;
    this.uniforms = new Map();
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      this.uniforms.set(info.name.replace(/\[0\]$/, ''), { loc: gl.getUniformLocation(p, info.name), type: info.type });
    }
  }

  use() { this.gl.useProgram(this.handle); return this; }
  has(name) { return this.uniforms.has(name); }

  set(name, v) {
    const u = this.uniforms.get(name);
    if (!u) return this;
    const gl = this.gl;
    switch (u.type) {
      case gl.FLOAT: typeof v === 'number' ? gl.uniform1f(u.loc, v) : gl.uniform1fv(u.loc, v); break;
      case gl.FLOAT_VEC2: gl.uniform2fv(u.loc, v); break;
      case gl.FLOAT_VEC3: gl.uniform3fv(u.loc, v); break;
      case gl.FLOAT_VEC4: gl.uniform4fv(u.loc, v); break;
      case gl.INT: case gl.BOOL: case gl.SAMPLER_2D: gl.uniform1i(u.loc, v); break;
      case gl.INT_VEC2: gl.uniform2iv(u.loc, v); break;
      case gl.FLOAT_MAT3: gl.uniformMatrix3fv(u.loc, false, v); break;
      case gl.FLOAT_MAT4: gl.uniformMatrix4fv(u.loc, false, v); break;
      default: break;
    }
    return this;
  }

  texture(name, tex, unit) {
    const u = this.uniforms.get(name);
    if (!u) return this;
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(u.loc, unit);
    return this;
  }

  dispose() { this.gl.deleteProgram(this.handle); }
}

function compile(gl, type, src, name) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    const numbered = src.split('\n').map((l, i) => `${String(i + 1).padStart(4)} | ${l}`).join('\n');
    throw new Error(`[${name}] compile:\n${log}\n${numbered}`);
  }
  return s;
}

/** Fetches GLSL and resolves `#include "file"` (relative to the shaders/ root). */
export class ShaderLoader {
  constructor(baseUrl) { this.base = baseUrl; this.cache = new Map(); }

  load(path, seen = new Set()) {
    if (this.cache.has(path)) return this.cache.get(path);
    const p = (async () => {
      const res = await fetch(new URL(path, this.base));
      if (!res.ok) throw new Error(`shader ${path}: HTTP ${res.status}`);
      let src = await res.text();
      for (const m of [...src.matchAll(/^[ \t]*#include\s+"([^"]+)"[ \t]*$/gm)]) {
        if (seen.has(m[1])) throw new Error(`circular #include ${m[1]}`);
        const inc = await this.load(m[1], new Set([...seen, path]));
        src = src.replace(m[0], inc);
      }
      return src;
    })();
    this.cache.set(path, p);
    return p;
  }
}

/** Every preset shader is: version + precision + common contract + pass header + body. */
export const assemble = ({ common = '', header = '', body }) =>
  `#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2D;\n${common}\n${header}\n#line 1\n${body}`;