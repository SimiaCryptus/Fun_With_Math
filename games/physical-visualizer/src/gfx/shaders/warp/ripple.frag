// Feedback warp: content rises and wobbles like heat haze; gravity still pulls it.
void main() {
  vec2 uv = v_uv;
  uv.y -= (0.004 + 0.01 * u_audio.x) * u_warp.y;
  uv.x += sin(uv.y * 20.0 + u_time.x * 3.0) * 0.002 * u_warp.z * (0.2 + u_audio.z);
  uv -= u_gravity.xy * 0.004 * u_warp.w;
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  vec3 prev = texture(u_prev, uv).rgb * u_warp.x * inside;
  fragColor = vec4(prev, 1.0);
}