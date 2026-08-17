import { qs, el, fitCanvas } from '../util/dom.js';
import { primeColor } from '../util/colors.js';
import { fmt, sci, fromLog10, bigStr } from '../util/format.js';

let host = null,
  app = null;

export function mount(ctx) {
  app = ctx;
  host = qs('#primeList');
}

export function render(stack, state) {
  host.innerHTML = '';

  for (const st of stack.stages) {
    const row = el('div', {
      class: 'prime-row' + (st.index === state.selected ? ' selected' : ''),
    });
    row.style.setProperty('--pc', primeColor(st.index));
    row.addEventListener('click', () => app.onSelect(st.index));

    row.appendChild(
      el('div', { class: 'pr-id' }, [
        el('span', { class: 'pr-k' }, [`k = ${st.stage}`]),
        el('span', { class: 'pr-p' }, [String(st.p)]),
        el('span', { class: 'pr-k' }, [`L_k = ${bigStr(st.L)}`]),
      ])
    );

    const cPeriod = el('canvas', { class: 'strip' });
    const cOrtho = el('canvas', { class: 'strip' });
    row.appendChild(
      el('div', { class: 'pr-strips' }, [
        el('div', { class: 'strip-wrap' }, [
          el('span', { class: 'slabel' }, [`M_${st.p} — native period ${st.p}, one dead class`]),
          cPeriod,
        ]),
        el('div', { class: 'strip-wrap' }, [
          el('span', { class: 'slabel' }, [
            `C_${st.stage} — orthogonal new kills over period L_${st.stage} = ${bigStr(st.L)}`,
          ]),
          cOrtho,
        ]),
      ])
    );
    row.appendChild(scheduleBlock(st));

    row.appendChild(metricsBlock(st, stack));
    host.appendChild(row);

    drawPeriod(cPeriod, st);
    drawOrtho(cOrtho, st, stack);
  }
}
function scheduleBlock(st) {
  const sched = st.schedule;
  const isC = sched.isComplete;
  const skipStr = sched.skips.map((s) => `+${s}`).join(', ') + (isC ? '' : ', …');
  const resStr = sched.residues.join(', ') + (isC ? '' : ', …');
  const coprimesStr = sched.coprimes.join(', ') + (isC ? '' : ', …');
  const countLabel = isC
    ? `${sched.skips.length} jump${sched.skips.length > 1 ? 's' : ''}`
    : `${bigStr(sched.phi)} jumps total`;
  return el('div', { class: 'pr-schedule' }, [
    el('div', { class: 'sched-head' }, [
      el('span', { class: 'sched-title' }, [
        `Skip Schedule C_${st.stage} (period L_${st.stage} = ${bigStr(st.L)})`,
      ]),
      el('span', { class: 'sched-len' }, [countLabel]),
    ]),
    el('div', { class: 'sched-row' }, [
      el('span', { class: 'sched-lbl' }, ['Δ jumps:']),
      el('span', { class: 'sched-val sched-deltas' }, [
        el('span', { class: 'delta-list' }, [skipStr]),
        isC ? el('span', { class: 'sched-sum' }, [` (cycle sum = ${bigStr(st.L)})`]) : '',
      ]),
    ]),
    el('div', { class: 'sched-row' }, [
      el('span', { class: 'sched-lbl' }, [`C_${st.stage} mod L:`]),
      el('span', { class: 'sched-val res-list' }, [resStr]),
    ]),
    el('div', { class: 'sched-row' }, [
      el('span', { class: 'sched-lbl' }, ['rule:']),
      el('span', { class: 'sched-val sched-rule' }, [
        `${st.p} × { ${coprimesStr} }`,
        st.stage > 1
          ? el('span', { class: 'sched-rule-note' }, [`(coprime to L_${st.stage - 1})`])
          : '',
      ]),
    ]),
  ]);
}

function metric(k, v, title) {
  return el('div', { class: 'm', title: title || '' }, [
    el('span', { class: 'mk' }, [k]),
    el('span', { class: 'mv' }, [v]),
  ]);
}

function metricsBlock(st, stack) {
  return el('div', { class: 'pr-metrics' }, [
    metric('×(1−1/p)', fmt(st.factor, 6), 'attenuation factor of this filter stage'),
    metric('ρ_k', sci(st.rho, 5), 'cumulative survivor density (Mertens product)'),
    metric('ρ_{k−1}/p', sci(st.killDensity, 5), 'natural density of the orthogonal kill set C_k'),
    metric('ΔH', `${fmt(st.H, 4)} b`, 'marginal entropy injected by this prime (bits)'),
    metric('H_joint', `${fmt(st.Hjoint, 4)} b`, 'additive joint entropy of per-prime indicators'),
    metric('h_k', fromLog10(st.log10EntropyDensity), 'joint entropy per integer of the period'),
    metric('log10 L_k', fmt(st.log10L, 3), 'period length (primorial) in decimal digits'),
    metric(
      'comb',
      `${st.combLines} @ 1/${st.p}`,
      'nonzero harmonics owned by this prime and their amplitude'
    ),
    metric('power≠0', sci(st.nonzeroPower, 4), 'total nonzero spectral power (p−1)/p²'),
    metric(
      'C_k in win',
      `${st.newKills} (${fmt(100 * st.windowKillDensity, 3)}%)`,
      'measured orthogonal kills in the window'
    ),
    metric(
      'alive after',
      `${st.aliveAfter} (${fmt(100 * st.windowAliveDensity, 3)}%)`,
      'survivors after this stage, in the window'
    ),
    metric('Mertens ~', sci(st.mertensAsym, 4), 'e^{-γ}/log p, the asymptotic for ρ_k'),
  ]);
}

function drawPeriod(canvas, st) {
  const { ctx, w, h } = fitCanvas(canvas, 16);
  const p = st.p;
  const cw = w / p;
  ctx.fillStyle = '#0e1320';
  ctx.fillRect(0, 0, w, h);
  for (let r = 0; r < p; r++) {
    ctx.fillStyle = r === 0 ? '#ff6b81' : primeColor(st.index, 0.35);
    ctx.fillRect(r * cw, 0, Math.max(0.6, cw - (cw > 3 ? 1 : 0)), h);
  }
  if (cw > 8) {
    ctx.fillStyle = '#05070b';
    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('0', cw / 2, h - 4);
  }
}

function drawOrtho(canvas, st, stack) {
  const { ctx, w, h } = fitCanvas(canvas, 16);
  ctx.fillStyle = '#0e1320';
  ctx.fillRect(0, 0, w, h);

  const L = st.L;
  const primes = stack.basis.slice(0, st.stage);
  const targetIdx = st.index;
  const Lnum = Number(L);
  const isSmall = L <= BigInt(w) && Number.isSafeInteger(Lnum);

  if (isSmall) {
    const count = Lnum;
    const cw = w / count;
    const gap = cw > 4 ? 1 : 0;
    for (let n = 1; n <= count; n++) {
      let status = 0; // 0: alive, 1: dead, 2: C_k
      for (let i = 0; i < primes.length; i++) {
        if (n % primes[i] === 0) {
          status = i === targetIdx ? 2 : 1;
          break;
        }
      }
      let color;
      if (status === 2) color = primeColor(targetIdx, 1);
      else if (status === 1) color = '#39425a';
      else color = 'rgba(183,247,208,0.35)';

      ctx.fillStyle = color;
      ctx.fillRect((n - 1) * cw, 0, Math.max(0.6, cw - gap), h);
    }
  } else {
    const px = Math.max(1, Math.floor(w));
    if (L <= 100000n) {
      const count = Number(L);
      const deadCnt = new Float32Array(px);
      const orthoCnt = new Float32Array(px);
      const aliveCnt = new Float32Array(px);
      const totalCnt = new Float32Array(px);

      for (let n = 1; n <= count; n++) {
        const x = Math.min(px - 1, Math.floor(((n - 1) * px) / count));
        totalCnt[x]++;
        let status = 0;
        for (let i = 0; i < primes.length; i++) {
          if (n % primes[i] === 0) {
            status = i === targetIdx ? 2 : 1;
            break;
          }
        }
        if (status === 2) orthoCnt[x]++;
        else if (status === 1) deadCnt[x]++;
        else aliveCnt[x]++;
      }

      for (let x = 0; x < px; x++) {
        const tot = totalCnt[x] || 1;
        ctx.fillStyle = '#39425a';
        ctx.fillRect(x, 0, 1, h);

        if (aliveCnt[x] > 0) {
          const v = aliveCnt[x] / tot;
          ctx.fillStyle = `rgba(183,247,208,${Math.min(1, 0.2 + 0.8 * v)})`;
          ctx.fillRect(x, 0, 1, h);
        }
        if (orthoCnt[x] > 0) {
          const v = orthoCnt[x] / tot;
          ctx.fillStyle = primeColor(
            targetIdx,
            Math.min(1, 0.35 + 0.65 * v * primes[primes.length - 1])
          );
          ctx.fillRect(x, 0, 1, h);
        }
      }
    } else {
      const SAMPLES_PER_PX = 32;
      for (let x = 0; x < px; x++) {
        let dead = 0,
          ortho = 0,
          alive = 0;
        for (let s = 0; s < SAMPLES_PER_PX; s++) {
          const nBig = (BigInt(x * SAMPLES_PER_PX + s) * L) / BigInt(px * SAMPLES_PER_PX) + 1n;
          let status = 0;
          for (let i = 0; i < primes.length; i++) {
            if (nBig % BigInt(primes[i]) === 0n) {
              status = i === targetIdx ? 2 : 1;
              break;
            }
          }
          if (status === 2) ortho++;
          else if (status === 1) dead++;
          else alive++;
        }

        ctx.fillStyle = '#39425a';
        ctx.fillRect(x, 0, 1, h);

        if (alive > 0) {
          const v = alive / SAMPLES_PER_PX;
          ctx.fillStyle = `rgba(183,247,208,${Math.min(1, 0.2 + 0.8 * v)})`;
          ctx.fillRect(x, 0, 1, h);
        }
        if (ortho > 0) {
          const v = ortho / SAMPLES_PER_PX;
          ctx.fillStyle = primeColor(
            targetIdx,
            Math.min(1, 0.35 + 0.65 * v * primes[primes.length - 1])
          );
          ctx.fillRect(x, 0, 1, h);
        }
      }
    }
  }
}
