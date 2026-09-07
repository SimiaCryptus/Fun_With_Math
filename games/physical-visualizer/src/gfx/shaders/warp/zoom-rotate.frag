// Feedback warp: zoom toward centre on beats, slow rotation driven by spin/tilt,
// and the whole field slides downhill — pixels have mass.
void main() {
  vec2 c = centered(v_uv);
  float beat = u_audio2.x;
  float zoom = 1.0 - (0.004 + 0.035 * beat) * u_warp.y;
  float rot  = (0.002 + 0.02 * u_gravity.w + 0.01 * u_tilt.x) * u_warp.z;
  c = rot2(c * zoom, rot);
  c -= u_gravity.xy * 0.006 * u_warp.w;      // sample uphill → content moves downhill
  c -= u_tilt.xy * 0.003 * u_warp.w;
  c.x /= aspect();
  vec2 uv = c + 0.5;
  vec3 prev = texture(u_prev, uv).rgb;
  prev = mix(prev, prev.gbr, 0.02 * u_audio.z);   // slow hue drift on treble
  float edge = smoothstep(0.0, 0.02, uv.x) * smoothstep(0.0, 0.02, uv.y)
             * smoothstep(1.0, 0.98, uv.x) * smoothstep(1.0, 0.98, uv.y);
  fragColor = vec4(prev * u_warp.x * edge, 1.0);
}