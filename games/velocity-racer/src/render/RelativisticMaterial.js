import * as THREE from 'three';
import { RENDER_BETA_MAX, clamp } from '../relativity/constants.js';

/**
 * Uniforms shared by every relativistic material (same object references,
 * so one write per frame updates the whole scene).
 */
export const sharedUniforms = {
  uBetaView: { value: new THREE.Vector3(0, 0, -1) }, // velocity dir (view space) × β
  uBeta: { value: 0 },
  uGamma: { value: 1 },
  uEffect: { value: 1 }, // 0 = classical, 1 = full warp
  uTime: { value: 0 },
  uDopplerK: { value: 1.4 }, // headlight exponent
  uFog: { value: new THREE.Color(0x090726) },
};

export const PATTERN = {
  FLAT: 0,
  ROAD: 1,
  RAIL: 2,
  SKY: 3,
  PAD: 4,
};

const vertexShader = /* glsl */ `
uniform vec3 uBetaView;
uniform float uBeta;
uniform float uGamma;
uniform float uEffect;

varying vec2 vUv;
varying vec3 vObjDir;
varying vec3 vNormalW;
varying float vCosTheta;
varying float vDist;

void main() {
  vUv = uv;
  vObjDir = normalize(position);
  vNormalW = normalize(mat3(modelMatrix) * normal);

  vec3 p0 = (modelViewMatrix * vec4(position, 1.0)).xyz;
  vDist = length(p0);
  vec3 p = p0;
  vCosTheta = 0.0;

  if (uBeta > 0.0005 && vDist > 1e-4) {
    vec3 n = normalize(uBetaView);
    vec3 dir = p0 / vDist;
    vCosTheta = dot(dir, n);

    // 1. Lorentz contraction along the velocity axis.
    float par = dot(p0, n);
    vec3 perp = p0 - par * n;
    vec3 pc = perp + (par / uGamma) * n;

    // 2. Relativistic aberration: cos0' = (cos0 + b) / (1 + b cos0)
    float r = length(pc);
    vec3 d = pc / max(r, 1e-5);
    float c = dot(d, n);
    float c2 = (c + uBeta) / (1.0 + uBeta * c);
    vec3 t = d - c * n;
    float tl = length(t);
    vec3 tdir = tl > 1e-5 ? t / tl : vec3(0.0);
    float s2 = sqrt(max(0.0, 1.0 - c2 * c2));
    vec3 aberrated = normalize(c2 * n + s2 * tdir);

    p = mix(p0, aberrated * r, uEffect);
  }

  gl_Position = projectionMatrix * vec4(p, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uColorB;
uniform float uPattern;
uniform float uEmissive;
uniform float uOpacity;

uniform float uBeta;
uniform float uGamma;
uniform float uEffect;
uniform float uTime;
uniform float uDopplerK;
uniform vec3 uFog;

varying vec2 vUv;
varying vec3 vObjDir;
varying vec3 vNormalW;
varying float vCosTheta;
varying float vDist;

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

float hash31(vec3 p) {
  return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
}

/** Hue-slide + headlight gain driven by the Doppler factor D. */
vec3 dopplerShift(vec3 col, float D) {
  vec3 hsv = rgb2hsv(col);
  float shift = clamp(log2(max(D, 1e-3)) * 0.17, -0.5, 0.5);
  float w = hsv.x > 0.8 ? hsv.x - 1.0 : hsv.x;   // magenta counts as "past red"
  w = clamp(w + shift, -0.06, 0.74);
  hsv.x = fract(w + 1.0);
  vec3 out3 = hsv2rgb(hsv) * clamp(pow(D, uDopplerK), 0.02, 9.0);
  // extreme blueshift saturates the sensor
  out3 = mix(out3, vec3(0.72, 0.85, 1.0), clamp((D - 2.5) * 0.10, 0.0, 0.8));
  return out3;
}

void main() {
  vec3 base = uColor;
  float emis = uEmissive;
  float alpha = uOpacity;
  bool unlit = false;

  if (uPattern > 0.5 && uPattern < 1.5) {
    // ---- road ----
    float lane = abs(vUv.x - 0.5);
    float along = vUv.y;                       // metres
    vec3 asphalt = uColor * (0.88 + 0.12 * step(0.5, fract(along / 18.0)));
    float centre = step(lane, 0.012) * step(0.5, fract(along / 9.0));
    float edge = smoothstep(0.452, 0.472, lane);
    float tick = step(0.44, lane) * step(0.5, fract(along / 4.0)) * 0.25;
    float paint = max(max(centre, edge), tick);
    base = mix(asphalt, uColorB, paint);
    emis = paint * 1.3;
  } else if (uPattern > 1.5 && uPattern < 2.5) {
    // ---- guard rails ----
    float st = step(0.5, fract(vUv.y / 7.0));
    base = mix(uColor, uColorB, st);
    emis = (0.7 + 0.8 * st) * (1.0 - vUv.x * 0.35);
  } else if (uPattern > 2.5 && uPattern < 3.5) {
    // ---- sky dome ----
    vec3 d = normalize(vObjDir);
    base = mix(uColor, uColorB, smoothstep(-0.15, 0.85, d.y));
    base += vec3(0.32, 0.10, 0.48) * exp(-abs(d.y) * 12.0);
    vec3 cell = floor(d * 115.0);
    float r1 = hash31(cell);
    float star = step(0.9968, r1);
    base += vec3(0.85, 0.93, 1.0) * star * (0.55 + 0.45 * sin(uTime * 2.0 + r1 * 80.0));
    unlit = true;
    emis = 0.0;
  } else if (uPattern > 3.5) {
    // ---- boost pad chevrons ----
    float ch = fract(vUv.y * 4.0 + uTime * 2.2);
    float band = smoothstep(0.35, 0.45, ch) * (1.0 - smoothstep(0.8, 0.9, ch));
    base = mix(uColor, uColorB, band);
    emis = 0.5 + band * 1.8;
  }

  vec3 lit;
  if (unlit) {
    lit = base;
  } else {
    float lambert = max(dot(normalize(vNormalW), normalize(vec3(0.35, 0.9, 0.25))), 0.0);
    lit = base * (0.34 + 0.72 * lambert) + base * emis;
  }

  float D = 1.0 / max(uGamma * (1.0 - uBeta * vCosTheta), 1e-3);
  D = mix(1.0, D, uEffect);
  vec3 col = dopplerShift(lit, D);

  if (!unlit) {
    col = mix(uFog, col, exp(-vDist * 0.00035));
  }

  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
}
`;

export function createRelativisticMaterial({
  color = 0xffffff,
  colorB = 0xffffff,
  pattern = PATTERN.FLAT,
  emissive = 0,
  opacity = 1,
  side = THREE.FrontSide,
  transparent = false,
  depthWrite = true,
} = {}) {
  return new THREE.ShaderMaterial({
    uniforms: Object.assign(
      {
        uColor: { value: new THREE.Color(color) },
        uColorB: { value: new THREE.Color(colorB) },
        uPattern: { value: pattern },
        uEmissive: { value: emissive },
        uOpacity: { value: opacity },
      },
      sharedUniforms
    ),
    vertexShader,
    fragmentShader,
    side,
    transparent,
    depthWrite,
  });
}

const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();

/**
 * Push this frame's relativistic state into the shared uniforms.
 * @param {THREE.Camera} camera
 * @param {THREE.Vector3} velocityDirWorld unit direction of the car's motion
 * @param {number} betaValue true β (clamped for rendering)
 * @param {number} effect 0..1 intensity
 * @param {number} time seconds
 */
export function updateRelativity(camera, velocityDirWorld, betaValue, effect = 1, time = 0) {
  const b = clamp(betaValue, 0, RENDER_BETA_MAX);
  camera.updateMatrixWorld();
  _m.copy(camera.matrixWorld).invert();
  _v.copy(velocityDirWorld).transformDirection(_m); // normalised by three.js

  sharedUniforms.uBetaView.value.copy(_v).multiplyScalar(Math.max(b, 1e-6));
  sharedUniforms.uBeta.value = b;
  sharedUniforms.uGamma.value = 1 / Math.sqrt(Math.max(1e-6, 1 - b * b));
  sharedUniforms.uEffect.value = clamp(effect, 0, 1);
  sharedUniforms.uTime.value = time;
}
