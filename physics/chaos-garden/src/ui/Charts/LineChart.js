/** Minimal canvas line chart: linear/log axes, sign-shaded bands, vertical markers, markers, legend. */
const fmt = (v) => (!Number.isFinite(v) ? '' : Math.abs(v) >= 1e4 || (Math.abs(v) < 1e-2 && v !== 0) ? v.toExponential(1) : String(+v.toPrecision(3)));
export class LineChart {
  constructor(canvas) { this.cv = canvas; }
  /**
   * @param {{x:ArrayLike<number>, y:ArrayLike<number>, color:string, label?:string, marker?:boolean}[]} series
   * @param {{logx?:boolean, logy?:boolean, title?:string, bands?:{x0:number,x1:number,color:string}[], vlines?:{x:number,color?:string,label?:string}[], yzero?:boolean, ymin?:number, ymax?:number}} opts
   */
  draw(series, opts = {}) {
    const cv = this.cv, dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 300, Hh = cv.clientHeight || 100;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(Hh * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr); }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, Hh);
    const { logx = false, logy = false, title = '', bands = [], vlines = [], yzero = false, ymin, ymax } = opts;
    const tx = logx ? Math.log10 : (x) => x, ty = logy ? Math.log10 : (y) => y;
    const ok = (x, y) => Number.isFinite(x) && Number.isFinite(y) && (!logx || x > 0) && (!logy || y > 0);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const s of series) for (let i = 0; i < s.x.length; i++) if (ok(s.x[i], s.y[i])) { const X = tx(s.x[i]), Y = ty(s.y[i]); if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y; }
    if (ymin != null && (!logy || ymin > 0)) y0 = ty(ymin); if (ymax != null && (!logy || ymax > 0)) y1 = ty(ymax);
    if (yzero && !logy && Number.isFinite(y0)) { y0 = Math.min(y0, 0); y1 = Math.max(y1, 0); }
    g.font = '10px system-ui'; g.fillStyle = '#8a93a3'; g.textAlign = 'left';
    if (title) g.fillText(title, 4, 10);
    if (!Number.isFinite(x0) || !Number.isFinite(y0)) { g.textAlign = 'center'; g.fillText('no data yet', W / 2, Hh / 2 + 4); return; }
    if (x1 - x0 < 1e-12) { x0 -= 1; x1 += 1; } if (y1 - y0 < 1e-12) { y0 -= 1; y1 += 1; }
    const L = 6, R = 6, T = 14, B = 12, pw = W - L - R, ph = Hh - T - B;
    const X = (x) => L + (tx(x) - x0) / (x1 - x0) * pw, Y = (y) => T + (1 - (ty(y) - y0) / (y1 - y0)) * ph;
    g.save(); g.beginPath(); g.rect(L, T, pw, ph); g.clip();
    for (const b of bands) { g.fillStyle = b.color; const a = X(b.x0), c = X(b.x1); g.fillRect(a, T, Math.max(1, c - a), ph); }
    for (const v of vlines) {
      if (!ok(v.x, 1)) continue; g.strokeStyle = v.color || '#ffb454'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(X(v.x), T); g.lineTo(X(v.x), T + ph); g.stroke(); g.setLineDash([]);
      if (v.label) { g.fillStyle = v.color || '#ffb454'; g.fillText(v.label, X(v.x) + 2, T + ph - 3); }
    }
    if (yzero && !logy) { g.strokeStyle = '#3a4150'; g.beginPath(); g.moveTo(L, Y(0)); g.lineTo(L + pw, Y(0)); g.stroke(); }
    for (const s of series) {
      g.strokeStyle = s.color; g.fillStyle = s.color; g.lineWidth = 1.2; g.beginPath(); let pen = false;
      for (let i = 0; i < s.x.length; i++) {
        if (!ok(s.x[i], s.y[i])) { pen = false; continue; }
        const px = X(s.x[i]), py = Y(s.y[i]); if (pen) g.lineTo(px, py); else g.moveTo(px, py); pen = true;
        if (s.marker) g.fillRect(px - 2, py - 2, 4, 4);
      }
      g.stroke();
    }
    g.restore();
    const back = (v, lg) => (lg ? 10 ** v : v);
    g.fillStyle = '#8a93a3'; g.textAlign = 'right';
    g.fillText(fmt(back(y1, logy)), W - 2, T + 9); g.fillText(fmt(back(y0, logy)), W - 2, T + ph - 2);
    g.fillText(fmt(back(x1, logx)), W - 2, Hh - 2); g.textAlign = 'left'; g.fillText(fmt(back(x0, logx)), L, Hh - 2);
    let lx = W - 2; g.textAlign = 'right';
    for (let i = series.length - 1; i >= 0; i--) { const s = series[i]; if (!s.label) continue; g.fillStyle = s.color; g.fillText(s.label, lx, 10); lx -= g.measureText(s.label).width + 8; }
  }
}