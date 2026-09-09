import * as THREE from 'three';

/**
 * Shared GLSL: cheap hash noise + fbm and the off-track ground colour, so the outer
 * world (Environment.js) matches the MudField seamlessly at the field border.
 */
export const NOISE_GLSL = /* glsl */`
  float mtHash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float mtNoise(vec2 p){
    vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(mtHash(i), mtHash(i + vec2(1.0, 0.0)), u.x),
               mix(mtHash(i + vec2(0.0, 1.0)), mtHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float mtFbm(vec2 p){
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * mtNoise(p); p = p * 2.07 + 13.1; a *= 0.5; }
    return v;
  }
  // scrubby dirt + grass patches + tufts (no wet mix here; callers apply it)
  vec3 mtOffTrack(vec2 wp, vec3 grass, vec3 dry){
    float grain = mtFbm(wp * 0.11);
    float fine  = mtNoise(wp * 2.3);
    float tuft  = smoothstep(0.62, 0.9, mtNoise(wp * 0.9));
    vec3 c = mix(grass, dry, smoothstep(0.32, 0.72, grain));
    c = mix(c, grass * 1.25, tuft * 0.5);
    return c * (0.82 + 0.34 * fine);
  }
`;

/**
 * Bake a per-cell track descriptor from the spline so the terrain shader can draw
 * the racing surface exactly where TrackSpline.contain() puts the invisible wall.
 *   R = signed lateral / halfWidth   (grooves, checker)
 *   G = arc length along track (m)   (curb stripes, start/finish)
 *   B = halfWidth (m)                (metre-accurate shoulder band)
 *   A = |distance to centreline| / halfWidth  (robust inside/outside test)
 */
function bakeTrackMask(field, spline) {
  const res = field.res;
  const data = new Float32Array(res * res * 4);
  for (let iy = 0; iy < res; iy++) {
    const wz = field.minZ + (iy + 0.5) * field.cell;
    let hint = -1;
    for (let ix = 0; ix < res; ix++) {
      const wx = field.minX + (ix + 0.5) * field.cell;
      const n = spline.nearest(wx, wz, hint);
      const half = spline.w[n.index] * 0.5;
      hint = n.dist < half * 5 ? n.index : -1;
      const o = (iy * res + ix) * 4;
      data[o]     = Math.max(-6, Math.min(6, n.lateral / half));
      data[o + 1] = spline.s[n.index];
      data[o + 2] = half;
      data[o + 3] = Math.min(6, n.dist / half);
    }
  }
  return data;
}

/**
 * Mirrors a MudField into a DataTexture and displaces a lit PBR plane with it.
 * RGBA = (height, depth, wetness, rutMagnitude). Track markings come from a second,
 * static texture baked from the TrackSpline.
 *
 * NOTE on orientation: PlaneGeometry.rotateX(-PI/2) puts uv.y = 1 at -Z, but the
 * field's row 0 is minZ, so the shader samples with (uv.x, 1 - uv.y). The previous
 * version skipped this flip and rendered the whole mud field mirrored in Z.
 */
export class MudTerrain {
  constructor(scene, field, spline, palette = {}) {
    this.field = field;
    const res = field.res;

    this.tex = new THREE.DataTexture(new Float32Array(res * res * 4), res, res,
      THREE.RGBAFormat, THREE.FloatType);
    this.tex.minFilter = this.tex.magFilter = THREE.LinearFilter;
    this.tex.needsUpdate = true;

    this.trackTex = new THREE.DataTexture(bakeTrackMask(field, spline), res, res,
      THREE.RGBAFormat, THREE.FloatType);
    this.trackTex.minFilter = this.trackTex.magFilter = THREE.LinearFilter;
    this.trackTex.needsUpdate = true;

    const geo = new THREE.PlaneGeometry(field.size, field.size, res - 1, res - 1);
    geo.rotateX(-Math.PI / 2);

    const col = (v, d) => ({ value: new THREE.Color(v ?? d) });
    this.uniforms = {
      uField: { value: this.tex },
      uTrack: { value: this.trackTex },
      uTexel: { value: 1 / res },
      uCell: { value: field.cell },
      uTrackLen: { value: spline.length },
      uDry:    col(palette.dry,    0x7a5f2c),
      uWet:    col(palette.wet,    0x261a0a),
      uSlime:  col(palette.slime,  0x5c7a1c),
      uGrass:  col(palette.grass,  0x55602a),
      uPacked: col(palette.packed, 0x5a4424),
      uCurbA:  col(palette.curbA,  0xc8452a),
      uCurbB:  col(palette.curbB,  0xe9ddc2)
    };

    this.mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
    const u = this.uniforms;
    this.mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', /* glsl */`
          #include <common>
          uniform sampler2D uField; uniform sampler2D uTrack;
          uniform float uTexel; uniform float uCell;
          varying vec4 vF; varying vec4 vTrk; varying vec3 vWorld;`)
        .replace('#include <beginnormal_vertex>', /* glsl */`
          vec2 fuv = vec2(uv.x, 1.0 - uv.y);
          vF   = texture2D(uField, fuv);
          vTrk = texture2D(uTrack, fuv);
          float hL = texture2D(uField, fuv - vec2(uTexel, 0.0)).r;
          float hR = texture2D(uField, fuv + vec2(uTexel, 0.0)).r;
          float hD = texture2D(uField, fuv - vec2(0.0, uTexel)).r;
          float hU = texture2D(uField, fuv + vec2(0.0, uTexel)).r;
          vec3 objectNormal = normalize(vec3(hL - hR, 2.0 * uCell, hD - hU));
          #ifdef USE_TANGENT
            vec3 objectTangent = vec3( tangent.xyz );
          #endif`)
        .replace('#include <begin_vertex>', /* glsl */`
          vec3 transformed = vec3(position);
          transformed.y += vF.r;
          vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);

      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', /* glsl */`
          #include <common>
          uniform vec3 uDry, uWet, uSlime, uGrass, uPacked, uCurbA, uCurbB;
          uniform float uTrackLen;
          varying vec4 vF; varying vec4 vTrk; varying vec3 vWorld;
          ${NOISE_GLSL}`)
        .replace('#include <color_fragment>', /* glsl */`
          #include <color_fragment>
          float mtWet = 0.0;
          {
            float latS  = vTrk.x;
            float along = vTrk.y;
            float hw    = vTrk.z;
            float lat   = vTrk.w;
            float latM  = lat * hw;
            vec2  wp    = vWorld.xz;
            float fine  = mtNoise(wp * 2.3);

            // off-track scrub
            vec3 off = mtOffTrack(wp, uGrass, uDry);

            // packed racing surface: tighter grain, twin wheel grooves, slight crown,
            // tyre-scrub streaks running along the track
            vec3 trk = uPacked * (0.78 + 0.4 * mtFbm(wp * 0.6));
            float groove = exp(-pow((abs(latS) - 0.45) * 6.0, 2.0));
            trk *= 1.0 - 0.22 * groove;
            trk *= 1.0 + 0.06 * (1.0 - smoothstep(0.0, 0.3, abs(latS)));
            trk *= 1.0 - 0.12 * smoothstep(0.55, 0.9, mtNoise(vec2(along * 0.18, latS * 14.0)));

            // gravel shoulder from the wall line out to the tyre barriers (metres)
            vec3 shoulderCol = mix(uDry * 1.15, vec3(0.62, 0.56, 0.46), 0.45) * (0.8 + 0.4 * fine);
            float shoulder = smoothstep(hw - 0.15, hw + 0.15, latM) * (1.0 - smoothstep(hw + 2.4, hw + 3.2, latM));

            // curb: alternating stripes just inside the wall line
            float curb = smoothstep(0.86, 0.9, lat) * (1.0 - smoothstep(0.985, 1.02, lat));
            float stripe = step(0.5, fract(along / 6.0));
            vec3 curbCol = mix(uCurbA, uCurbB, stripe) * (0.85 + 0.25 * fine);

            // start / finish checker
            float sfBand = clamp((1.0 - smoothstep(4.5, 5.0, along))
                               + smoothstep(uTrackLen - 1.0, uTrackLen - 0.5, along), 0.0, 1.0);
            float checker = mod(floor(latS * 4.0 + 8.0) + floor(along), 2.0);
            vec3 sfCol = mix(vec3(0.05, 0.045, 0.04), vec3(0.92, 0.9, 0.85), checker);

            vec3 c = mix(off, shoulderCol, shoulder);
            c = mix(c, trk, 1.0 - smoothstep(0.985, 1.015, lat));
            c = mix(c, curbCol, curb);
            c = mix(c, sfCol, sfBand * (1.0 - smoothstep(0.82, 0.86, lat)));

            // live mud state: depth = darker/wet, wetness = slimy sheen, ruts darken
            float mudK = clamp(vF.g * 1.3, 0.0, 1.0);
            c = mix(c, uWet, mudK * 0.85);
            c = mix(c, uSlime, clamp(vF.b * 0.45, 0.0, 1.0) * mudK);
            c *= 1.0 - vF.a * 0.3;
            diffuseColor.rgb = c;
            mtWet = clamp(vF.b * 0.7 + vF.g * 0.7, 0.0, 1.0);
          }`)
        .replace('#include <roughnessmap_fragment>', /* glsl */`
          #include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.28, mtWet);`);
    };

    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.position.set(field.minX + field.size / 2, 0, field.minZ + field.size / 2);
    scene.add(this.mesh);
    this.syncAll();
  }

  syncAll() {
    const f = this.field, d = this.tex.image.data, n = f.res * f.res;
    for (let i = 0; i < n; i++) {
      d[i * 4 + 0] = f.height[i];
      d[i * 4 + 1] = f.depth[i];
      d[i * 4 + 2] = f.wetness[i];
      d[i * 4 + 3] = Math.hypot(f.rutU[i], f.rutV[i]);
    }
    this.tex.needsUpdate = true;
    f.dirty.any = false;
  }

  /** Call once per frame; only re-uploads when the field reports a dirty rect. */
  sync() {
    const f = this.field;
    if (!f.dirty.any) return;
    const { x0, y0, x1, y1 } = f.dirty;
    const d = this.tex.image.data;
    for (let iy = y0; iy <= y1; iy++) {
      for (let ix = x0; ix <= x1; ix++) {
        const i = iy * f.res + ix;
        d[i * 4 + 0] = f.height[i];
        d[i * 4 + 1] = f.depth[i];
        d[i * 4 + 2] = f.wetness[i];
        d[i * 4 + 3] = Math.hypot(f.rutU[i], f.rutV[i]);
      }
    }
    this.tex.needsUpdate = true;   // M9: replace with texSubImage2D partial upload
    f.dirty.any = false;
  }
}