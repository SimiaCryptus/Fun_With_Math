// Golden-angle hue walk: adjacent primes always get well separated colors.
export function primeHue(i) { return (i * 137.508 + 8) % 360; }

export function primeColor(i, alpha = 1, light = 60, sat = 78) {
  return `hsla(${primeHue(i).toFixed(1)}, ${sat}%, ${light}%, ${alpha})`;
}

export const INK = {
  grid: '#1f273a',
  axis: '#3a4considered',
  axisLine: '#39425a',
  text: '#8794ad',
  bright: '#dfe6f3',
  alive: '#b7f7d0',
  dc: '#ffffff',
  warn: '#ffcf8b',
};