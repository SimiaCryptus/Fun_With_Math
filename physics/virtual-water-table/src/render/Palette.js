/** Perceptually-uniform colormaps (polynomial fits) + a signed cool–warm map. LUTs of 256. */
const poly = (c) => (t) => { const r = [0, 0, 0]; for (let ch = 0; ch < 3; ch++) { let v = 0; for (let i = c.length - 1; i >= 0; i--) v = v * t + c[i][ch]; r[ch] = v; } return r; };
const viridis = poly([[0.2777273272234177, 0.005407344544966578, 0.3340998053353061], [0.1050930431085774, 1.404613529898575, 1.384590162594685], [-0.3308618287255563, 0.214847559468213, 0.09509516302823659], [-4.634230498983486, -5.799100973351585, -19.33244095627987], [6.228269936347081, 14.17993336680509, 56.69055260068105], [4.776384997670288, -13.74514537774601, -65.35303263337234], [-5.435455855934631, 4.645852612178535, 26.3124352495832]]);
const magma = poly([[-0.002136485053939582, -0.000749655052795221, -0.005386127855323933], [0.2516605407371642, 0.6775232436837668, 2.494026599312351], [8.353717279216625, -3.577719514958484, 0.3144679030132573], [-27.66873308576866, 14.26473078096533, -13.64921318813922], [52.17613981234068, -27.94360607168351, 12.94416944238394], [-50.76852536473588, 29.04658282127291, 4.23415299384598], [18.65570506591883, -11.48977351997711, -5.601961508734096]]);
const stops = (pts) => (t) => { t = Math.max(0, Math.min(1, t)) * (pts.length - 1); const i = Math.min(pts.length - 2, Math.floor(t)), f = t - i; return [0, 1, 2].map((c) => pts[i][c] + f * (pts[i + 1][c] - pts[i][c])); };
const cividis = stops([[0, 0.135, 0.304], [0.255, 0.263, 0.404], [0.494, 0.480, 0.470], [0.743, 0.706, 0.434], [0.995, 0.909, 0.219]]);
const coolwarm = stops([[0.23, 0.299, 0.754], [0.552, 0.69, 0.996], [0.865, 0.865, 0.865], [0.958, 0.603, 0.482], [0.706, 0.016, 0.15]]);
const MAPS = { viridis, magma, cividis, coolwarm };
const LUTS = {};
export function lut(name) {
  if (LUTS[name]) return LUTS[name];
  const f = MAPS[name] || viridis, out = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) { const c = f(i / 255); out[i * 3] = c[0] * 255; out[i * 3 + 1] = c[1] * 255; out[i * 3 + 2] = c[2] * 255; }
  return (LUTS[name] = out);
}
export function css(name, t) { const L = lut(name), i = Math.max(0, Math.min(255, Math.round(t * 255))) * 3; return `rgb(${L[i]},${L[i + 1]},${L[i + 2]})`; }
export const COLORBLIND_SAFE = ['viridis', 'cividis', 'coolwarm'];