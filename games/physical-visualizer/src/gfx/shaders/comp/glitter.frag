// Point-sprite fragment for particle presets. v_state = (x, y, vx, vy).
// u_params.y = sparkle (whiteness at speed).
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.0, length(p));
  float speed = length(v_state.zw);
  vec3 col = palette(fract(speed * 0.5 + u_time.x * 0.05 + v_state.x * 0.1));
  col = mix(col, vec3(1.0), smoothstep(0.5, 2.0, speed) * u_params.y);
  fragColor = vec4(col * a * (0.35 + u_audio.w * 0.6), a);
}