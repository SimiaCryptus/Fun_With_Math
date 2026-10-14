export function drawChart(canvas, rows) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, pad = 30;
  ctx.clearRect(0, 0, W, H);
  if (!rows.length) return;
  const maxN = Math.max(2, ...rows.map(r => r.n));
  const maxY = Math.max(...rows.map(r => r.cost), 3 * Math.log2(maxN));
  const x = n => pad + (n - 1) / (maxN - 1) * (W - 2 * pad);
  const y = c => H - pad - c / maxY * (H - 2 * pad);

  ctx.strokeStyle = '#999';
  ctx.beginPath(); ctx.moveTo(pad, pad); ctx.lineTo(pad, H - pad); ctx.lineTo(W - pad, H - pad); ctx.stroke();
  ctx.fillStyle = '#444'; ctx.font = '11px sans-serif';
  ctx.fillText(String(maxN), W - pad - 20, H - pad + 14);
  ctx.fillText(String(Math.round(maxY)), 4, pad + 4);

  const curve = (f, color) => {
    ctx.strokeStyle = color; ctx.beginPath();
    for (let i = 0; i <= 200; i++) {
      const n = 1 + (maxN - 1) * i / 200;
      i ? ctx.lineTo(x(n), y(f(n))) : ctx.moveTo(x(n), y(f(n)));
    }
    ctx.stroke();
  };
  curve(n => 3 * Math.log(n) / Math.log(3), '#2a2');
  curve(n => 3 * Math.log2(n), '#c33');

  ctx.fillStyle = '#36c';
  for (const r of rows) ctx.fillRect(x(r.n) - 1, y(r.cost) - 1, 2, 2);
  ctx.fillStyle = '#2a2'; ctx.fillText('3·log3 n', pad + 5, pad + 12);
  ctx.fillStyle = '#c33'; ctx.fillText('3·log2 n', pad + 65, pad + 12);
}