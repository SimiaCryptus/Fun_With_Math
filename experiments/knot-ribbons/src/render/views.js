// 2D braid diagram (SVG). Strands flow left → right, position 1 is at the top.
export function renderDiagram(host, word, n, compOf, colors, onHover) {
  const L = word.length, cw = 34, rh = 22, pad = 18;
  const W = pad * 2 + cw * (L + 1), H = pad * 2 + rh * Math.max(n - 1, 0);
  const y = (q) => pad + q * rh;
  const at = [...Array(n).keys()];
  const col = (st) => colors[compOf[st] % colors.length];
  const line = (x0, y0, x1, y1, c) =>
    `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="${c}" stroke-width="3" stroke-linecap="round"/>`;
  let s = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
  for (let q = 0; q < n; q++) s += `<text x="2" y="${y(q) + 4}" fill="#8a90a0" font-size="10">${q + 1}</text>`;
  for (let j = 0; j <= L; j++) {
    const x0 = pad + j * cw, x1 = x0 + cw;
    const g = j < L ? word[j] : 0, i = Math.abs(g) - 1;
    if (j < L) s += `<rect class="col" data-j="${j}" x="${x0}" y="0" width="${cw}" height="${H}" fill="transparent"/>`;
    for (let q = 0; q < n; q++) {
      if (j < L && (q === i || q === i + 1)) continue;
      s += line(x0, y(q), x1, y(q), col(at[q]));
    }
    if (j < L) {
      const a = at[i], b = at[i + 1];
      const over = g > 0 ? [a, i, i + 1] : [b, i + 1, i];
      const under = g > 0 ? [b, i + 1, i] : [a, i, i + 1];
      const lerp = (t, q0, q1) => [x0 + t * cw, y(q0) + t * (y(q1) - y(q0))];
      const [u0, u1, u2, u3] = [lerp(0, under[1], under[2]), lerp(0.38, under[1], under[2]), lerp(0.62, under[1], under[2]), lerp(1, under[1], under[2])];
      s += line(u0[0], u0[1], u1[0], u1[1], col(under[0])) + line(u2[0], u2[1], u3[0], u3[1], col(under[0]));
      s += line(x0, y(over[1]), x1, y(over[2]), col(over[0]));
      at[i] = b;
      at[i + 1] = a;
    }
  }
  s += '</svg>';
  host.innerHTML = s;
  host.querySelectorAll('rect.col').forEach((r) => {
    r.addEventListener('mouseenter', () => onHover(+r.dataset.j));
    r.addEventListener('mouseleave', () => onHover(null));
  });
}