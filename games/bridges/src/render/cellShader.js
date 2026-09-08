// All claim/ripple/hover animation lives on the GPU; JS only pokes attributes.

export const vertexShader = /* glsl */`
  attribute float aOwner;
  attribute float aClaimTime;
  attribute float aCellId;
  attribute float aState;
  attribute vec2  aCellCenter;

  uniform float uTime;
  uniform float uRise;
  uniform float uScale;
  uniform vec2  uLastClaimCenter;
  uniform float uLastClaimTime;
  uniform float uHoverCell;

  varying vec3  vNormal;
  varying vec3  vWorldPos;
  varying float vOwner;
  varying float vState;
  varying float vHover;
  varying float vTop;

  void main() {
    vec3 pos = position;
    float isTop = position.y > 0.0001 ? 1.0 : 0.0;
    float claimed = aOwner >= 0.0 ? 1.0 : 0.0;

    float t = clamp((uTime - aClaimTime) / 0.45, 0.0, 1.0);
    float ease = 1.0 - pow(1.0 - t, 3.0);
    float rise = claimed * (ease * uRise + sin(t * 9.4) * (1.0 - t) * 0.03 * uScale);

    float d = distance(aCellCenter, uLastClaimCenter);
    float rt = uTime - uLastClaimTime - d * 0.06 / uScale;
    float ripple = (rt > 0.0 && rt < 0.6) ? sin(rt * 10.47) * (1.0 - rt / 0.6) * 0.05 * uScale : 0.0;

    float hover = abs(aCellId - uHoverCell) < 0.5 ? 1.0 : 0.0;
    pos.y += isTop * (rise + ripple + hover * 0.04 * uScale);

    vNormal = normalize(normalMatrix * normal);
    vec4 wp = modelMatrix * vec4(pos, 1.0);
    vWorldPos = wp.xyz;
    vOwner = aOwner; vState = aState; vHover = hover; vTop = isTop;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

export const fragmentShader = /* glsl */`
  precision highp float;
  uniform vec3  uPalette[4];   // 0 = empty, 1..3 = players
  uniform vec3  uLightDir;
  uniform float uTime;
  uniform float uScale;

  varying vec3  vNormal;
  varying vec3  vWorldPos;
  varying float vOwner;
  varying float vState;
  varying float vHover;
  varying float vTop;

  void main() {
    vec3 base = uPalette[int(clamp(vOwner + 1.0, 0.0, 3.0))];
    vec3 n = normalize(vNormal);
    float diff = max(dot(n, normalize(uLightDir)), 0.0);
    float hemi = 0.5 + 0.5 * n.y;
    vec3 col = base * (0.35 + 0.65 * diff) + base * 0.15 * hemi;

    if (vOwner < 0.0) col *= 0.7 + 0.3 * vTop;                 // matte, unclaimed

    // colourblind-safe fill patterns on claimed tops: stripes / dots
    if (vTop > 0.5 && vOwner >= 1.0) {
      float s = uScale * 0.18;
      float m = vOwner < 1.5
        ? step(0.5, fract((vWorldPos.x + vWorldPos.z) / s))
        : step(0.35, length(fract(vWorldPos.xz / s) - 0.5));
      col *= 0.88 + 0.12 * m;
    }

    if (vState > 0.5 && vState < 1.5) {                        // winning chain: pulse
      float pulse = 0.5 + 0.5 * sin(uTime * 4.0);
      col += base * (0.35 + 0.35 * pulse);
    } else if (vState > 1.5) {                                 // losers: desaturate
      float g = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(g), 0.7) * 0.6;
    }
    col += vHover * 0.12;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;