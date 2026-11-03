// Codimension & scale profile: cumulative C_split (x) vs cumulative
// -Δlog2 μ (y), one polyline per root-to-leaf path.

export function createProfileView(canvas) {
  const ctx = canvas.getContext('2d');
  return {
    draw(paths) {
      const w = canvas.width = canvas.clientWidth || 300;
      const h = canvas.height = 140;
      ctx.clearRect(0, 0, w, h);
      if (!paths || !paths.length) return;
      const top = paths.slice(0, 12);
      let mx = 1, my = 1;
      for (const p of top) {
        mx = Math.max(mx, p.totalCost);
        my = Math.max(my, p.totalDrop);
      }
      const X = (v) => 24 + (v / mx) * (w - 32);
      const Y = (v) => h - 16 - (v / my) * (h - 28);
      ctx.strokeStyle = '#333';
      ctx.beginPath();
      ctx.moveTo(24, 4); ctx.lineTo(24, h - 16); ctx.lineTo(w - 6, h - 16);
      ctx.stroke();
      top.forEach((p, i) => {
        ctx.strokeStyle = `hsl(${(i * 37) % 360} 60% 60%)`;
        ctx.beginPath();
        let cx = 0, cy = 0;
        ctx.moveTo(X(0), Y(0));
        for (const s of p.steps) {
          cx += s.cost; cy += s.drop;
          ctx.lineTo(X(cx), Y(cy));
        }
        ctx.stroke();
      });
      ctx.fillStyle = '#777';
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillText(`Δlog2 μ ≤ ${my.toFixed(1)}`, 2, 10);
      ctx.fillText(`C_split ≤ ${mx.toFixed(0)} bits`, w - 110, h - 4);
    },
  };
}