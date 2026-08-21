(function () {
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const wrap = canvas.parentElement;
  const startInput = document.getElementById('startInput');
  const goBtn = document.getElementById('goBtn');
  const randomBtn = document.getElementById('randomBtn');
  const rangeSlider = document.getElementById('rangeSlider');
  const rangeLabel = document.getElementById('rangeLabel');
  const compareBtn = document.getElementById('compareBtn');
  const resultBox = document.getElementById('resultBox');
  const stepsEl = document.getElementById('stepsEl');
  const peakEl = document.getElementById('peakEl');
  const startEl = document.getElementById('startEl');
  const compareTable = document.getElementById('compareTable');

  // ── Collatz sequence ─────────────────────────────────────
  function collatz(n) {
    const seq = [n];
    while (n !== 1) {
      n = n % 2 === 0 ? n / 2 : 3 * n + 1;
      seq.push(n);
    }
    return seq;
  }

  // ── Canvas sizing ────────────────────────────────────────
  function resize() {
    canvas.width = wrap.clientWidth;
    canvas.height = Math.round(wrap.clientWidth * 0.55);
  }

  // ── Draw sequence ────────────────────────────────────────
  function drawSequence(seq) {
    const W = canvas.width,
      H = canvas.height;
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);

    if (!seq || seq.length < 2) return;

    const maxVal = Math.max(...seq);
    const pad = { top: 24, bottom: 24, left: 8, right: 8 };
    const pw = W - pad.left - pad.right;
    const ph = H - pad.top - pad.bottom;

    const xStep = pw / (seq.length - 1);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const gy = pad.top + (ph / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, gy);
      ctx.lineTo(W - pad.right, gy);
      ctx.stroke();
      const val = Math.round(maxVal * (1 - i / 4));
      ctx.fillStyle = 'rgba(255,255,255,.2)';
      ctx.font = '10px system-ui';
      ctx.fillText(val.toLocaleString(), pad.left + 2, gy - 3);
    }

    // Gradient line
    const grad = ctx.createLinearGradient(pad.left, 0, W - pad.right, 0);
    grad.addColorStop(0, '#58a6ff');
    grad.addColorStop(0.5, '#bc8cff');
    grad.addColorStop(1, '#58a6ff');

    ctx.beginPath();
    seq.forEach((val, i) => {
      const x = pad.left + i * xStep;
      const y = pad.top + ph * (1 - val / maxVal);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Peak marker
    const peakIdx = seq.indexOf(maxVal);
    const px = pad.left + peakIdx * xStep;
    const py = pad.top + ph * (1 - maxVal / maxVal);
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#bc8cff';
    ctx.fill();
    ctx.fillStyle = '#bc8cff';
    ctx.font = 'bold 11px system-ui';
    ctx.fillText(maxVal.toLocaleString(), Math.min(px + 7, W - 80), py + 4);
  }

  // ── Show sequence ────────────────────────────────────────
  function showSequence(n) {
    const seq = collatz(n);
    const peak = Math.max(...seq);
    stepsEl.textContent = seq.length - 1;
    peakEl.textContent = peak.toLocaleString();
    startEl.textContent = n.toLocaleString();
    resultBox.textContent = seq.join(' → ');
    resize();
    drawSequence(seq);
  }

  // ── Compare table ────────────────────────────────────────
  function buildCompareTable(limit) {
    const rows = [];
    for (let i = 2; i <= limit; i++) {
      const seq = collatz(i);
      const peak = Math.max(...seq);
      rows.push({ n: i, steps: seq.length - 1, peak });
    }
    rows.sort((a, b) => b.steps - a.steps);
    const top10 = rows.slice(0, 10);

    let html = '<table><thead><tr><th>n</th><th>Steps</th><th>Peak</th></tr></thead><tbody>';
    top10.forEach((r, idx) => {
      html += `<tr class="${idx === 0 ? 'peak-row' : ''}">
  <td>${r.n}</td>
  <td>${r.steps}</td>
  <td>${r.peak.toLocaleString()}</td>
</tr>`;
    });
    html += '</tbody></table>';
    compareTable.innerHTML = `<div class="info-box"><h4>Top 10 by step count (2–${limit})</h4>${html}</div>`;
  }

  // ── Events ───────────────────────────────────────────────
  goBtn.addEventListener('click', () => {
    const n = parseInt(startInput.value);
    if (n > 0) showSequence(n);
  });
  startInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') goBtn.click();
  });
  randomBtn.addEventListener('click', () => {
    const n = Math.floor(Math.random() * 9999) + 2;
    startInput.value = n;
    showSequence(n);
  });
  rangeSlider.addEventListener('input', () => {
    rangeLabel.textContent = rangeSlider.value;
  });
  compareBtn.addEventListener('click', () => {
    buildCompareTable(parseInt(rangeSlider.value));
  });

  // ── Init ─────────────────────────────────────────────────
  new ResizeObserver(() => {
    const n = parseInt(startInput.value);
    if (n > 0) showSequence(n);
  }).observe(wrap);
  showSequence(27);
})();
