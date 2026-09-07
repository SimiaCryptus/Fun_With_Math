/** Fullscreen triangle via gl_VertexID (no buffers) and index-only point clouds. */
export const FULLSCREEN_VERT = `#version 300 es
out vec2 v_uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export class Mesh {
  constructor(gl) {
    this.gl = gl;
    this.fsVao = gl.createVertexArray();
    this.pointVaos = new Map();
  }

  drawFullscreen() {
    const gl = this.gl;
    gl.bindVertexArray(this.fsVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  _points(count) {
    const gl = this.gl;
    if (!this.pointVaos.has(count)) {
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      const data = new Float32Array(count);
      for (let i = 0; i < count; i++) data[i] = i;
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 1, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
      this.pointVaos.set(count, vao);
    }
    return this.pointVaos.get(count);
  }

  drawPoints(count) {
    const gl = this.gl;
    gl.bindVertexArray(this._points(count));
    gl.drawArrays(gl.POINTS, 0, count);
    gl.bindVertexArray(null);
  }
}