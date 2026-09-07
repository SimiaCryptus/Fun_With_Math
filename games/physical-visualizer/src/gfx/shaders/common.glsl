// ---- The Uniform Contract -------------------------------------------------------
// Prepended to every preset shader. Presets talk only to this; the engine fills it.
uniform vec3  u_resolution;   // w, h, dpr
uniform vec4  u_time;         // t, dt, frame, elapsedBeats
uniform vec4  u_audio;        // bass, mid, treb, energy
uniform vec4  u_audio2;       // beatEnv, flux, bpm/200, phase
uniform vec4  u_tilt;         // tiltX, tiltY, yaw, flat
uniform vec4  u_accel;        // ax, ay, az, jerk
uniform vec4  u_gravity;      // downX, downY, downZ (screen space), spinRate
uniform vec4  u_touch;        // x, y (0..1, y up), down, age
uniform vec4  u_params;       // 4 preset-authored knobs (0..1)
uniform sampler2D u_spectrum; // 512x1 R8: log-folded, auto-gained spectrum
uniform sampler2D u_waveform; // 512x1 R8: time domain, 128 = silence
uniform sampler2D u_history;  // 256x64 R8: scrolling spectrogram, row 0 newest
uniform sampler2D u_prev;     // previous composite (feedback)
uniform sampler2D u_noise;    // tileable white noise RGBA
uniform sampler2D u_palette;  // 24x1 RGB: the skin's viscolor.txt

#define PI  3.14159265359
#define TAU 6.28318530718

float spectrum(float x) { return texture(u_spectrum, vec2(x, 0.5)).r; }
float waveform(float x) { return texture(u_waveform, vec2(x, 0.5)).r * 2.0 - 1.0; }
float noise2(vec2 p)    { return texture(u_noise, p).r; }
vec3  palette(float t)  { return texture(u_palette, vec2(t, 0.5)).rgb; }
float aspect()          { return u_resolution.x / u_resolution.y; }
vec2  centered(vec2 uv) { vec2 c = uv - 0.5; c.x *= aspect(); return c; }
vec2  rot2(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec3  hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}