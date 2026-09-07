// Plasma storm: sinusoid interference spun by beats and tilt, treble crackle.
// u_params.x = hue offset, u_params.y = intensity.
void main() {
  vec2 c = centered(v_uv);
  float t = u_time.x * (0.3 + u_audio.w);
  c = rot2(c, u_time.w * 0.05 + u_tilt.x * 0.5);
  float v = sin(c.x * 6.0 + t)
          + sin((c.y * 6.0 + t) * 0.7)
          + sin((c.x + c.y) * 5.0 + u_audio2.x * 4.0)
          + sin(length(c) * (10.0 + 20.0 * u_audio.x) - t * 2.0);
  v = v * 0.25 + 0.5;
  vec3 col = hsv2rgb(vec3(fract(v + u_time.x * 0.02 + u_params.x), 0.7, 1.0));
  float a = smoothstep(0.35, 0.9, v) * (0.08 + 0.35 * u_audio.w + 0.4 * u_audio2.x) * u_params.y;
  a += noise2(c * 3.0 + u_time.x * 0.1) * u_audio.z * 0.15 * u_params.y;
  fragColor = vec4(col * a, a);
}