// Horizontal gain-interval bars, one per candidate, redrawn each race step.

const COLORS = {
  tightBox: '#888', axis: '#4b9fd5', affinePCA: '#6ad36a',
  quadEllipsoid: '#d5a24b', quadImplicit: '#cc7ad6',
};

export function createRaceView(canvas) {
  const ctx = canvas.getContext('2d');
  return {
    draw(bars, note = '') {
      const w = canvas.width = canvas.clientWidth || 300;
      const rows = Math.min(bars.length, 12);
      const h = canvas.height = 14 * rows + 16;
      ctx.clearRect(0, 0, w, h);
      if (!bars.length) return;
      const shown = bars.slice().sort((a, b) => b.lo - a.lo).slice(0, rows);
      let lo = Infinity, hi = -Infinity;
      for (const b of shown) {
        lo = Math.min(lo, b.lo); hi = Math.max(hi, b.hi);
      }
      if (!isFinite(lo)) return;
      const pad = 0.05 * (hi - lo || 1);
      lo -= pad; hi += pad;
      const X = (v) => ((v - lo) / (hi - lo)) * (w - 4) + 2;
      // zero line
      if (lo < 0 && hi > 0) {
        ctx.strokeStyle = '#555';
        ctx.beginPath(); ctx.moveTo(X(0), 0); ctx.lineTo(X(0), h - 14); ctx.stroke();
      }
      shown.forEach((b, i) => {
        const y = i * 14 + 4;
        ctx.fillStyle = COLORS[b.family] || '#aaa';
        ctx.fillRect(X(b.lo), y, Math.max(2, X(b.hi) - X(b.lo)), 7);
        ctx.fillStyle = '#ccc';
        ctx.font = '9px ui-monospace, monospace';
        ctx.fillText(b.label.slice(0, 40), 3, y + 7);
      });
      ctx.fillStyle = '#777';
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillText(`${note}  bits, ${bars.length} candidates`, 2, h - 3);
    },
  };
}