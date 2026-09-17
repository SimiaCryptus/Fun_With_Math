import * as THREE from 'three';

const quadVert = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const vignetteFrag = /* glsl */`
uniform float uBeta;
uniform float uEffect;
varying vec2 vUv;
void main() {
  float b = clamp(uBeta * uEffect, 0.0, 1.0);
  float r = length(vUv - 0.5) * 2.0;
  float inner = mix(1.25, 0.16, smoothstep(0.25, 1.0, b));
  float a = smoothstep(inner, inner + 0.55, r) * mix(0.22, 1.0, b);
  gl_FragColor = vec4(0.0, 0.0, 0.015, clamp(a, 0.0, 0.985));
}
`;

const glowFrag = /* glsl */`
uniform float uBeta;
uniform float uEffect;
uniform float uTime;
varying vec2 vUv;
void main() {
  float b = clamp(uBeta * uEffect, 0.0, 1.0);
  vec2 p = vUv - 0.5;
  float r2 = dot(p, p) * 4.0;
  float core = exp(-r2 * mix(11.0, 2.4, b)) * pow(b, 2.6);
  float flicker = 0.92 + 0.08 * sin(uTime * 24.0);
  gl_FragColor = vec4(vec3(0.55, 0.80, 1.0) * core * 1.1 * flicker, 1.0);
}
`;

/**
 * Cheap "tunnel" pass: β-scaled vignette plus an additive forward core glow.
 * Drawn as two fullscreen quads after the main scene (no EffectComposer needed).
 */
export class PostFX {
  constructor() {
    this.uniforms = {
      uBeta: { value: 0 },
      uEffect: { value: 1 },
      uTime: { value: 0 },
    };
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geo = new THREE.PlaneGeometry(2, 2);

    const mk = (frag, blending) => new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: quadVert,
      fragmentShader: frag,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending,
    }));

    this.vignette = mk(vignetteFrag, THREE.NormalBlending);
    this.glow = mk(glowFrag, THREE.AdditiveBlending);
    this.vignette.renderOrder = 1;
    this.glow.renderOrder = 2;
    this.vignette.frustumCulled = false;
    this.glow.frustumCulled = false;
    this.scene.add(this.vignette, this.glow);
  }

  render(gl, beta, effect, time) {
    this.uniforms.uBeta.value = beta;
    this.uniforms.uEffect.value = effect;
    this.uniforms.uTime.value = time;
    const prev = gl.autoClear;
    gl.autoClear = false;
    gl.clearDepth();
    gl.render(this.scene, this.camera);
    gl.autoClear = prev;
  }
}