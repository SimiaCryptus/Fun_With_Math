import { qs, el } from '../util/dom.js';
import { firstNPrimes } from '../core/primes.js';
import { primeColor } from '../util/colors.js';
import { bigStr } from '../util/format.js';
let host = null;
let app = null;
const MAX_TERMS = 10;
export function mount(ctx) {
  app = ctx;
  host = qs('#observationList');
}
export function render(stack, state) {
  host.innerHTML = '';
  for (const st of stack.stages) {
    const prevL = stack.basis.slice(0, st.index).reduce((a, p) => a * BigInt(p), 1n);
    const actual = st.schedule.residues.slice();
    const shown = Math.min(actual.length, MAX_TERMS);
    const multipliers = expectedMultipliers(st, prevL, shown);
    const expected = multipliers.map((m) => m * st.p);
    const actualShown = actual.slice(0, shown);
    const match = arraysEqual(actualShown, expected);
    const complete = st.schedule.isComplete && shown === actual.length;
    const badge = match ? (complete ? 'complete match' : `first ${shown} terms match`) : 'mismatch';
    const row = el('div', {
      class: 'obs-row' + (st.index === state.selected ? ' selected' : ''),
    });
    row.style.setProperty('--pc', primeColor(st.index));
    row.addEventListener('click', () => app.onSelect(st.index));
    row.appendChild(
      el('div', { class: 'obs-head' }, [
        el('span', { class: 'obs-k' }, [`k=${st.stage}`]),
        el('span', { class: 'obs-p' }, [`p = ${st.p}`]),
        el('span', { class: 'obs-lprev' }, [`L_{k-1} = ${bigStr(prevL)}`]),
        el('span', { class: 'obs-badge ' + (match ? 'ok' : 'bad') }, [badge]),
      ])
    );
    row.appendChild(
      el('div', { class: 'obs-rule' }, [
        `C_${st.stage} = ${st.p} × { 1, `,
        el('span', { class: 'obs-mult-list' }, [multipliers.join(', ')]),
        ' }',
      ])
    );
    row.appendChild(
      el('div', { class: 'obs-residues' }, [
        'stack: ',
        el('span', { class: 'obs-res' }, [actualShown.join(', ')]),
        actual.length > shown ? ` … (+${actual.length - shown} more)` : '',
      ])
    );
    row.appendChild(
      el('div', { class: 'obs-residues' }, [
        'formula: ',
        el('span', { class: 'obs-exp' }, [expected.join(', ')]),
      ])
    );
    host.appendChild(row);
  }
}
function expectedMultipliers(st, prevL, count) {
  const multipliers = [1];
  if (count <= 1) return multipliers;
  const needPrimes = count - 1;
  const primes = firstNPrimes(st.index + needPrimes);
  for (let i = st.index; i < primes.length && multipliers.length < count; i++) {
    const q = primes[i];
    if (BigInt(q) >= prevL) break;
    multipliers.push(q);
  }
  return multipliers.slice(0, count);
}
function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
