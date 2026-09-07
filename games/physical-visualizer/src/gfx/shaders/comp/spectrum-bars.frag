// Winamp-style segmented bars in the skin palette. u_params.x = bar count (16..64).
void main() {
  vec2 uv = v_uv;
  float bars = floor(mix(16.0, 64.0, u_params.x));
  float bi = floor(uv.x * bars);
  float bx = fract(uv.x * bars);
  float gap = step(0.1, bx) * step(bx, 0.92);
  float v = pow(spectrum((bi + 0.5) / bars), 1.2);
  float h = v * (0.85 + 0.15 * u_audio2.x);
  float lit = step(uv.y, h) * gap;
  float seg = step(0.35, fract(uv.y * u_resolution.y / (3.0 * u_resolution.z)));
  float idx = mix(17.0, 2.0, clamp(uv.y / max(h, 1e-3), 0.0, 1.0));
  vec3 col = palette((idx + 0.5) / 24.0);
  float a = lit * seg;
  fragColor = vec4(col * a * 0.9, a);
}