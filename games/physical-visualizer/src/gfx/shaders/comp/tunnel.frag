// Steerable tunnel: tilt moves the vanishing point, spinRate rolls the horizon,
// beats push you forward. u_params.x = ring density.
void main() {
  vec2 c = centered(v_uv) - u_tilt.xy * 0.25;
  float r = length(c) + 1e-4;
  float a = atan(c.y, c.x) + u_gravity.w * 0.5 + u_time.x * 0.05;
  float z = 0.5 / r + u_time.w * 0.5 + u_time.x * 0.3;
  float rings = smoothstep(0.85, 1.0, sin(z * TAU * (1.0 + 2.0 * u_params.x)) * 0.5 + 0.5);
  float spokes = smoothstep(0.7, 1.0, sin(a * 8.0 + z * 0.5) * 0.5 + 0.5) * spectrum(fract(a / TAU));
  vec3 col = palette(fract(z * 0.1 + u_audio.x * 0.3));
  float glow = (rings * 0.8 + spokes * 0.7) * min(r * 3.0, 1.0) * (0.25 + u_audio.w);
  fragColor = vec4(col * glow, glow);
}