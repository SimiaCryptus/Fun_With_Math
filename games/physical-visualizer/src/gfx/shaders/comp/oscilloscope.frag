// Classic scope trace. u_params.x = rainbow amount, u_params.y = thickness.
void main() {
  vec2 uv = v_uv;
  float amp = 0.25 + 0.15 * u_audio.w;
  float dx = 2.0 / u_resolution.x;
  float y0 = 0.5 + waveform(uv.x) * amp;
  float y1 = 0.5 + waveform(uv.x + dx) * amp;
  float slope = (y1 - y0) / dx;
  float d = abs(uv.y - y0) / sqrt(1.0 + slope * slope);
  float w = (1.5 + 3.0 * u_params.y) / u_resolution.y * (1.0 + 1.5 * u_audio2.x);
  float line = smoothstep(w, 0.0, d);
  vec3 skin = palette((18.0 + 4.0 * fract(uv.x + u_time.x * 0.1)) / 24.0);
  vec3 rainbow = hsv2rgb(vec3(fract(uv.x * 0.5 + u_time.x * 0.05 + u_audio.x * 0.2), 0.85, 1.0));
  vec3 col = mix(skin, rainbow, u_params.x);
  fragColor = vec4(col * line * (0.7 + u_audio2.x), line);
}