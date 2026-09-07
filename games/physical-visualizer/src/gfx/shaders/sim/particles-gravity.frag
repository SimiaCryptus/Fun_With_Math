// Particle solver: one texel = one particle. xy = position (clip space), zw = velocity.
// Gravity comes from the phone. Beats kick the pile upward. Shake scatters it. Touch attracts.
// u_params.x = viscosity. u_motion = (gravityScale, shakeImpulse, shake, seed).
void main() {
  ivec2 tc = ivec2(gl_FragCoord.xy);
  vec4 s = texelFetch(u_particles, tc, 0);
  vec2 pos = s.xy;
  vec2 vel = s.zw;
  float dt = clamp(u_time.y, 0.001, 0.05);
  float id = hash21(vec2(tc) + 0.5);

  // gravity
  vec2 g = u_gravity.xy * u_motion.x * 2.5;
  vel += g * dt;

  // beat kick: against gravity, with per-particle randomness, only on fresh beats
  float gl = length(g);
  vec2 up = gl > 1e-4 ? -g / gl : vec2(0.0, 1.0);
  vel += up * u_audio2.x * u_audio.x * (0.5 + id) * 6.0 * dt * step(0.8, u_audio2.x);

  // shake: explode
  if (u_motion.z > 0.5) {
    float ang = hash21(vec2(tc) * 1.7 + u_motion.w * 100.0) * TAU;
    vel += vec2(cos(ang), sin(ang)) * u_motion.y * (0.3 + 0.7 * id) * 0.5;
  }

  // finger = gravity well
  if (u_touch.z > 0.5) {
    vec2 d = (u_touch.xy * 2.0 - 1.0) - pos;
    float r = max(length(d), 0.05);
    vel += d / r * (0.6 / (r * r + 0.1)) * dt;
  }

  // viscosity + treble jitter
  float visc = mix(0.3, 4.0, u_params.x);
  vel -= vel * visc * dt;
  vel += (vec2(hash21(vec2(tc) + u_time.x), hash21(vec2(tc) - u_time.x)) - 0.5) * u_audio.z * 0.3 * dt;

  pos += vel * dt;

  // walls: per-particle inset so the pile has texture instead of a flat line
  vec2 lim = 1.0 - 0.25 * vec2(id, fract(id * 7.31)) * (1.0 - u_params.x);
  if (pos.x < -lim.x) { pos.x = -lim.x; vel.x =  abs(vel.x) * 0.35; }
  if (pos.x >  lim.x) { pos.x =  lim.x; vel.x = -abs(vel.x) * 0.35; }
  if (pos.y < -lim.y) { pos.y = -lim.y; vel.y =  abs(vel.y) * 0.35; }
  if (pos.y >  lim.y) { pos.y =  lim.y; vel.y = -abs(vel.y) * 0.35; }

  fragColor = vec4(pos, vel);
}