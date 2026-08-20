(function () {
  const grid = document.getElementById('grid');
  const limitRange = document.getElementById('limitRange');
  const limitLabel = document.getElementById('limitLabel');
  const speedSelect = document.getElementById('speed');
  const startBtn = document.getElementById('startBtn');
  const resetBtn = document.getElementById('resetBtn');
  const primeCountEl = document.getElementById('primeCount');
  const currentFactEl = document.getElementById('currentFactor');
  const stepEl = document.getElementById('stepDisplay');
  const primeListEl = document.getElementById('primeList');

  let n = 200;
  let sieve = []; // false = still candidate, true = eliminated
  let cells = [];
  let animTimer = null;
  let running = false;

  // ── Build grid ───────────────────────────────────────────
  function buildGrid() {
    n = parseInt(limitRange.value);
    sieve = new Array(n + 1).fill(false);
    sieve[0] = sieve[1] = true; // not prime

    // Determine columns for a roughly-square grid
    const cols = Math.ceil(Math.sqrt(n));
    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

    grid.innerHTML = '';
    cells = [null, null]; // index 0 and 1 unused
    for (let i = 2; i <= n; i++) {
      const div = document.createElement('div');
      div.className = 'cell';
      div.textContent = i;
      div.title = `${i}`;
      grid.appendChild(div);
      cells.push(div);
    }
    updateStats(null, 0);
    primeListEl.textContent = '—';
  }

  function updateStats(factor, step) {
    const primes = [];
    for (let i = 2; i <= n; i++) {
      if (!sieve[i]) primes.push(i);
    }
    primeCountEl.textContent = primes.length;
    currentFactEl.textContent = factor !== null ? factor : '—';
    stepEl.textContent = step > 0 ? step : '—';
    if (primes.length > 0) {
      primeListEl.textContent = primes.join('  ');
    }
    return primes;
  }

  // ── Animation generator ──────────────────────────────────
  function* sieveGenerator() {
    let step = 0;
    for (let p = 2; p * p <= n; p++) {
      if (sieve[p]) continue;

      // Highlight current prime
      cells[p].classList.add('current-factor');
      yield { factor: p, step: ++step, phase: 'factor' };

      // Eliminate multiples
      for (let m = p * p; m <= n; m += p) {
        if (!sieve[m]) {
          sieve[m] = true;
          cells[m].classList.add('eliminated');
          cells[m].classList.remove('prime');
          yield {
            factor: p,
            step: ++step,
            phase: 'eliminate',
            target: m,
          };
        }
      }

      // Mark p as confirmed prime
      cells[p].classList.remove('current-factor');
      cells[p].classList.add('prime');
    }

    // Mark all remaining candidates as prime
    for (let i = 2; i <= n; i++) {
      if (!sieve[i]) cells[i].classList.add('prime');
    }
    yield { factor: null, step: ++step, phase: 'done' };
  }

  function startAnimation() {
    if (running) return;
    running = true;
    startBtn.disabled = true;
    resetBtn.disabled = true;

    const gen = sieveGenerator();

    function tick() {
      const { value, done } = gen.next();
      if (done || (value && value.phase === 'done')) {
        updateStats(null, value ? value.step : 0);
        running = false;
        startBtn.disabled = false;
        resetBtn.disabled = false;
        return;
      }
      updateStats(value.factor, value.step);
      animTimer = setTimeout(tick, parseInt(speedSelect.value));
    }
    tick();
  }

  function resetAll() {
    if (animTimer) clearTimeout(animTimer);
    running = false;
    startBtn.disabled = false;
    resetBtn.disabled = false;
    buildGrid();
  }

  // ── Event listeners ──────────────────────────────────────
  limitRange.addEventListener('input', () => {
    limitLabel.textContent = limitRange.value;
    if (!running) buildGrid();
  });
  startBtn.addEventListener('click', startAnimation);
  resetBtn.addEventListener('click', resetAll);

  // ── Init ─────────────────────────────────────────────────
  buildGrid();
})();
