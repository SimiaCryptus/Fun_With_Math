// Stacked bits-per-point bar: path + residual + model against the 30-bit
// no-model reference.

export function createLedgerView(canvas) {
  const ctx = canvas.getContext('2d');
  return {
    draw({ baseline = 30, total = 30, modelPerPoint = 0 }) {
      const w = canvas.width = canvas.clientWidth || 280;
      const h = canvas.height = 40;
      ctx.clearRect(0, 0, w, h);
      const scale = w / Math.max(baseline, total + modelPerPoint, 1e-9);
      ctx.fillStyle = '#26262b';
      ctx.fillRect(0, 4, baseline * scale, 14);
      ctx.fillStyle = '#4b9fd5';
      ctx.fillRect(0, 4, total * scale, 14);
      ctx.fillStyle = '#d5a24b';
      ctx.fillRect(total * scale, 4, Math.max(1, modelPerPoint * scale), 14);
      ctx.fillStyle = '#999';
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText(
        `${total.toFixed(2)} + ${modelPerPoint.toFixed(3)} model / ${baseline.toFixed(0)} bits/pt`,
        2, 32
      );
    },
  };
}