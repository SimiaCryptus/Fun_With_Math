const sw = (c) => `<i class="sw" style="background:${c}"></i>`;
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const trunc = (s, k = 240) => (s.length > k ? s.slice(0, k) + ' …' : s);

export function renderReadout(el, a, o) {
  const cyc = a.cycles.map((c, i) => {
    const fr = o.advanced && o.framings
      ? ` · framing ${o.framings[i] ?? 'n/a'} ${o.framings[i] == null ? '' : '(measured)'}`
      : '';
    return `<li>${sw(o.colors[i % o.colors.length])}(${c.map((x) => x + 1).join(' ')})
      <small class="muted">length ×${c.length}${fr}</small></li>`;
  }).join('');
  let html = `
    <h3>π : B<sub>${a.n}</sub> → S<sub>${a.n}</sub></h3>
    <dl>
      <dt>β<sub>total</sub></dt><dd><code>${esc(trunc(a.totalStr))}</code></dd>
      <dt>τ</dt><dd><code>${a.tauStr}</code></dd>
      <dt>components k</dt><dd><b>${a.k}</b> ${a.k === 1 ? '(knot)' : '(link)'}</dd>
      <dt>cycle type</dt><dd>[${a.cycleType.join(', ')}]</dd>
      <dt>pure (∈ P<sub>n</sub>)</dt><dd>${a.pure ? 'yes' : 'no'}</dd>
      <dt>carrier</dt><dd>${a.orientable ? 'orientable' : 'Möbius'} · m = ${a.m}</dd>
    </dl>
    <ul class="cycles">${cyc}</ul>`;
  if (o.advanced) {
    html += `
      <h3>Garside left normal form</h3>
      <dl>
        <dt>NF</dt><dd><code>${esc(trunc(a.nfStr, 400))}</code></dd>
        <dt>inf / sup</dt><dd>${a.nf.p} / ${a.nf.p + a.nf.factors.length}</dd>
        <dt>canonical length</dt><dd>${a.nf.factors.length}</dd>
        <dt>|word| / reduced</dt><dd>${a.totalWord.length} / ${a.reducedLength}</dd>
        <dt>sign(τ)</dt><dd>${a.sign > 0 ? '+1 (even)' : '−1 (odd)'}</dd>
      </dl>`;
    if (o.cascade) {
      html += '<h3>Wreath cascade</h3>';
      for (const lv of o.cascade) {
        html += `<p><b>${lv.group}</b> · engine <code>${esc(lv.word || 'e')}</code> in B<sub>${lv.n}</sub> → k = <b>${lv.k}</b></p>
          <table><tr><th>#</th><th>framing</th><th>τ</th><th>k</th></tr>
          ${lv.blocks.map((b, i) => `<tr><td>${i + 1}</td><td>${b.framing} <small class="muted">${b.source}</small></td><td><code>${b.tau}</code></td><td>${b.k}</td></tr>`).join('')}
          </table>`;
      }
    }
  }
  html += `<p class="muted">renderer: ${o.backend}</p>`;
  el.innerHTML = html;
}