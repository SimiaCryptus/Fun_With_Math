// Vector symbol library. Every symbol is drawn in a unit box (-0.5..0.5) and
// receives a colour set `c = { line, fill, bg }`. drawSymbol() handles
// placement and scaling, so the fragments stay purely descriptive.

const f = (n) => Number(n.toFixed(3));
const poly = (pts) => pts.map(([x, y]) => `${f(x)},${f(y)}`).join(' ');

function starPoints(outer, inner, n = 5) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return pts;
}

function pentagramPoints(r) {
  const outer = Array.from({ length: 5 }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    return [r * Math.cos(a), r * Math.sin(a)];
  });
  return [0, 2, 4, 1, 3].map((i) => outer[i]);
}

const rays = (n, r1, r2, w = 0.05) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i * 2 * Math.PI) / n;
    return `<line x1="${f(Math.cos(a) * r1)}" y1="${f(Math.sin(a) * r1)}" x2="${f(Math.cos(a) * r2)}" y2="${f(Math.sin(a) * r2)}" stroke-width="${w}"/>`;
  }).join('');

const figureRobe = 'M -0.28 0.5 L -0.2 -0.18 Q 0 -0.32 0.2 -0.18 L 0.28 0.5 Q 0 0.44 -0.28 0.5 Z';
const wingPath = 'M 0 0.05 C -0.15 -0.35 -0.42 -0.42 -0.5 -0.15 C -0.35 -0.17 -0.28 -0.05 -0.4 0.12 C -0.27 0.06 -0.16 0.12 -0.05 0.22 Z';

export const SYMBOLS = {
  star: () => `<polygon points="${poly(starPoints(0.5, 0.2))}"/>`,
  sun: () => `<g fill="none">${rays(12, 0.36, 0.5)}</g><circle r="0.28"/>`,
  moon: () => `<path transform="translate(0.08 0)" d="M 0.2 -0.42 A 0.44 0.44 0 1 0 0.2 0.42 A 0.6 0.6 0 0 1 0.2 -0.42 Z"/>`,
  tower: () => `
    <rect x="-0.18" y="-0.28" width="0.36" height="0.78"/>
    <rect x="-0.18" y="-0.37" width="0.08" height="0.1"/><rect x="-0.04" y="-0.37" width="0.08" height="0.1"/><rect x="0.10" y="-0.37" width="0.08" height="0.1"/>
    <rect x="-0.05" y="-0.12" width="0.1" height="0.14" fill="currentLine"/><rect x="-0.07" y="0.32" width="0.14" height="0.18" fill="currentLine"/>`,
  lightning: () => `<polygon points="${poly([[0.1, -0.5], [-0.2, 0.02], [0, 0.02], [-0.12, 0.5], [0.22, -0.08], [0.03, -0.08], [0.16, -0.5]])}"/>`,
  cup: () => `
    <path d="M -0.3 -0.3 L -0.3 -0.16 Q -0.3 0.14 0 0.14 Q 0.3 0.14 0.3 -0.16 L 0.3 -0.3 Z"/>
    <ellipse cx="0" cy="-0.3" rx="0.3" ry="0.06"/>
    <rect x="-0.04" y="0.14" width="0.08" height="0.2"/>
    <path d="M -0.22 0.42 Q 0 0.28 0.22 0.42 Q 0 0.5 -0.22 0.42 Z"/>`,
  sword: () => `
    <polygon points="${poly([[0, -0.5], [0.06, -0.4], [0.06, 0.15], [-0.06, 0.15], [-0.06, -0.4]])}"/>
    <rect x="-0.22" y="0.13" width="0.44" height="0.06" fill="currentLine"/>
    <rect x="-0.035" y="0.19" width="0.07" height="0.22" fill="currentLine"/>
    <circle cy="0.45" r="0.06"/>`,
  wand: () => `
    <line x1="-0.12" y1="0.48" x2="0.12" y2="-0.48" stroke-width="0.08" fill="none"/>
    <circle cx="0.12" cy="-0.48" r="0.05"/><circle cx="0.06" cy="-0.28" r="0.045"/><circle cx="0.0" cy="-0.08" r="0.04"/>`,
  pentacle: () => `<circle r="0.46"/><polygon points="${poly(pentagramPoints(0.36))}" fill="none"/>`,
  figure: () => `<circle cy="-0.37" r="0.11"/><path d="${figureRobe}"/>`,
  crown: () => `
    <polygon points="${poly([[-0.45, 0.3], [-0.45, -0.15], [-0.22, 0.05], [0, -0.35], [0.22, 0.05], [0.45, -0.15], [0.45, 0.3]])}"/>
    <circle cx="-0.45" cy="-0.15" r="0.05"/><circle cy="-0.35" r="0.05"/><circle cx="0.45" cy="-0.15" r="0.05"/>`,
  wheel: () => `<circle r="0.46"/><g fill="none">${rays(8, 0.1, 0.46, 0.035)}</g><circle r="0.09" fill="currentLine"/>`,
  heart: () => `<path d="M 0 0.42 C -0.5 0.05 -0.5 -0.35 -0.25 -0.35 C -0.1 -0.35 0 -0.25 0 -0.15 C 0 -0.25 0.1 -0.35 0.25 -0.35 C 0.5 -0.35 0.5 0.05 0 0.42 Z"/>`,
  key: () => `
    <circle cy="-0.3" r="0.16" fill="none" stroke-width="0.07"/>
    <line x1="0" y1="-0.14" x2="0" y2="0.45" stroke-width="0.07"/>
    <line x1="0" y1="0.45" x2="0.15" y2="0.45" stroke-width="0.07"/><line x1="0" y1="0.32" x2="0.12" y2="0.32" stroke-width="0.07"/>`,
  eye: () => `
    <path d="M -0.48 0 Q 0 -0.36 0.48 0 Q 0 0.36 -0.48 0 Z"/>
    <circle r="0.16" fill="currentLine"/><circle r="0.07" fill="currentBg" stroke="none"/>`,
  flame: () => `
    <path d="M 0 0.48 C -0.36 0.28 -0.36 -0.1 -0.1 -0.26 C -0.06 -0.06 0.06 -0.02 0.03 -0.48 C 0.32 -0.22 0.42 0.16 0 0.48 Z" fill="currentLine"/>
    <path transform="translate(0 0.14) scale(0.5)" d="M 0 0.48 C -0.36 0.28 -0.36 -0.1 -0.1 -0.26 C -0.06 -0.06 0.06 -0.02 0.03 -0.48 C 0.32 -0.22 0.42 0.16 0 0.48 Z" stroke="none"/>`,
  wave: () => `
    <g fill="none" stroke-width="0.05">
      <path d="M -0.5 -0.12 Q -0.375 -0.32 -0.25 -0.12 T 0 -0.12 T 0.25 -0.12 T 0.5 -0.12"/>
      <path d="M -0.5 0.14 Q -0.375 -0.06 -0.25 0.14 T 0 0.14 T 0.25 0.14 T 0.5 0.14"/>
    </g>`,
  mountain: () => `
    <polygon points="${poly([[-0.5, 0.4], [-0.15, -0.38], [0.2, 0.4]])}"/>
    <polygon points="${poly([[-0.05, 0.4], [0.25, -0.15], [0.5, 0.4]])}"/>
    <polygon points="${poly([[-0.15, -0.38], [-0.24, -0.18], [-0.06, -0.18]])}" stroke="none"/>`,
  scales: () => `
    <g fill="none">
      <line x1="0" y1="-0.45" x2="0" y2="0.42"/><line x1="-0.4" y1="-0.3" x2="0.4" y2="-0.3"/>
      <line x1="-0.4" y1="-0.3" x2="-0.5" y2="0.1"/><line x1="-0.4" y1="-0.3" x2="-0.3" y2="0.1"/>
      <line x1="0.4" y1="-0.3" x2="0.5" y2="0.1"/><line x1="0.4" y1="-0.3" x2="0.3" y2="0.1"/>
    </g>
    <path d="M -0.52 0.1 Q -0.4 0.3 -0.28 0.1 Z"/><path d="M 0.28 0.1 Q 0.4 0.3 0.52 0.1 Z"/>
    <rect x="-0.18" y="0.42" width="0.36" height="0.06"/>`,
  lantern: () => `
    <path d="M -0.1 -0.4 Q 0 -0.62 0.1 -0.4" fill="none"/>
    <polygon points="${poly([[-0.2, -0.3], [0.2, -0.3], [0.14, -0.4], [-0.14, -0.4]])}"/>
    <rect x="-0.18" y="-0.3" width="0.36" height="0.6"/>
    <circle r="0.1" fill="currentLine"/>
    <rect x="-0.22" y="0.3" width="0.44" height="0.06"/>`,
  wings: () => `<path d="${wingPath}"/><path d="${wingPath}" transform="scale(-1 1)"/>`,
  infinity: () => `<path fill="none" stroke-width="0.06" d="M 0 0 C 0.15 -0.3 0.45 -0.3 0.45 0 C 0.45 0.3 0.15 0.3 0 0 C -0.15 -0.3 -0.45 -0.3 -0.45 0 C -0.45 0.3 -0.15 0.3 0 0 Z"/>`,
  flower: () => `
    ${[0, 60, 120, 180, 240, 300].map((deg) => `<ellipse cx="0" cy="-0.3" rx="0.12" ry="0.2" transform="rotate(${deg})"/>`).join('')}
    <circle r="0.11" fill="currentLine"/>`,
  cliff: () => `<polygon points="${poly([[-0.5, 0.5], [-0.5, -0.1], [-0.3, -0.16], [-0.1, -0.05], [0.1, -0.12], [0.2, 0.08], [0.35, 0.14], [0.5, 0.5]])}"/>`,
  pillar: () => `
    <rect x="-0.22" y="-0.5" width="0.44" height="0.08"/>
    <rect x="-0.14" y="-0.42" width="0.28" height="0.84"/>
    <rect x="-0.24" y="0.42" width="0.48" height="0.08"/>`,
  scythe: () => `
    <line x1="-0.1" y1="0.5" x2="0.15" y2="-0.3" stroke-width="0.06"/>
    <path d="M 0.15 -0.3 Q -0.3 -0.5 -0.45 -0.05 Q -0.15 -0.32 0.15 -0.22 Z"/>`,
  cross: () => `<rect x="-0.07" y="-0.5" width="0.14" height="1"/><rect x="-0.35" y="-0.22" width="0.7" height="0.14"/>`,
  wreath: () => `
    <circle r="0.4" fill="none" stroke-width="0.02"/>
    ${Array.from({ length: 14 }, (_, i) => `<ellipse cx="0" cy="-0.4" rx="0.06" ry="0.12" transform="rotate(${(i * 360) / 14})"/>`).join('')}`,
  sigil: () => `<circle r="0.42" fill="none"/><polygon points="${poly([[0, -0.32], [0.28, 0.18], [-0.28, 0.18]])}"/><circle r="0.06" fill="currentLine"/>`,
};

export const SYMBOL_NAMES = Object.keys(SYMBOLS);

/**
 * Place a symbol at (cx, cy) with size s. Unknown names fall back to `sigil`
 * so any word in cards.json still produces a coherent glyph.
 */
export function drawSymbol(name, cx, cy, s, c, opacity = 1) {
  const fn = SYMBOLS[name] || SYMBOLS.sigil;
  const body = fn(c)
    .replaceAll('currentLine', c.line)
    .replaceAll('currentBg', c.bg);
  return `<g transform="translate(${f(cx)} ${f(cy)}) scale(${f(s)})" fill="${c.fill}" stroke="${c.line}" stroke-width="0.035" stroke-linejoin="round" stroke-linecap="round" opacity="${opacity}">${body}</g>`;
}